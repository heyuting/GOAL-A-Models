import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AlkalinityScatterPlot from './AlkalinityScatterPlot';
import { useAuth } from '@/contexts/AuthContext';
import userService from '@/services/userService';
import 'leaflet/dist/leaflet.css';
import { usStates } from "@/data/usStates"; // Import state codes

// API base URL configuration - Use relative URLs for local development (proxied through Vite)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const getApiUrl = (endpoint) => {
  if (API_BASE_URL) return `${API_BASE_URL}/${endpoint}`;
  return `/${endpoint}`;
};

// Map particle size option value to numeric value for API (e.g. "psdrain_320um.in" -> 320)
const particleSizeToNumber = (value) => {
  if (!value) return null;
  const match = value.match(/(\d+)um/);
  return match ? parseInt(match[1], 10) : null;
};

const MAX_SCEPTER_LOCATIONS = 5;

const BASELINE_STATUS_FETCH_MS = 90_000;

async function fetchWithTimeout(url, options = {}, ms = BASELINE_STATUS_FETCH_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException(`Request exceeded ${ms}ms`, 'AbortError'));
  }, ms);
  try {
    // Status polls must not use a cached 200 body (stuck on "submitted" while server is "running").
    return await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(options.headers || {}),
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Combine multiple child job states into one UI status.
 * Preserves "queued" vs "running" (do not show running when server says queued only).
 */
const aggregateBaselineChildStatuses = (statusList) => {
  const list = (statusList || []).filter(Boolean);
  if (!list.length) return '';
  if (list.every((s) => s === 'completed')) return 'completed';
  if (list.some((s) => s === 'failed' || s === 'cancelled' || s === 'timeout')) return 'failed';
  if (list.some((s) => s === 'running')) return 'running';
  /** Batch `overall` / HPC: actively launching — must outrank stale per-job `submitted`. */
  if (list.some((s) => s === 'submitting')) return 'submitting';
  if (list.some((s) => s === 'queued')) return 'queued';
  if (list.some((s) => s === 'pending')) return 'pending';
  if (list.some((s) => s === 'submitted')) return 'submitted';
  return list[0] || '';
};

/**
 * Map SLURM / backend tokens to UI workflow status (short codes often not lowercase English).
 */
const normalizeBaselineStatusToken = (raw) => {
  if (raw == null) return '';
  const t = String(raw).trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  const canonical = [
    'completed',
    'complete',
    'failed',
    'running',
    'queued',
    'pending',
    'submitting',
    'submitted',
    'cancelled',
    'canceled',
    'timeout',
    'unknown',
  ];
  if (canonical.includes(lower)) {
    if (lower === 'complete' || lower === 'completed') return 'completed';
    if (lower === 'canceled') return 'cancelled';
    return lower;
  }
  const u = t.toUpperCase();
  const slurm = {
    PD: 'pending',
    PENDING: 'pending',
    CF: 'pending',
    CONFIGURING: 'pending',
    STAGING: 'pending',
    R: 'running',
    RUNNING: 'running',
    CG: 'running',
    COMPLETING: 'running',
    CD: 'completed',
    COMPLETED: 'completed',
    F: 'failed',
    FAILED: 'failed',
    NF: 'failed',
    CA: 'cancelled',
    CANCELLED: 'cancelled',
    TO: 'timeout',
    Q: 'queued',
    QUEUED: 'queued',
  };
  if (slurm[u]) return slurm[u];
  // Phrases some proxies return
  if (/run|execut|progress/i.test(t) && !/fail/i.test(t)) return 'running';
  if (/complet|finish|done/i.test(t) && !/fail/i.test(t)) return 'completed';
  if (/fail|error/i.test(t)) return 'failed';
  if (/pend|queue|wait|hold/i.test(t)) return 'pending';
  return lower;
};

const STATUS_LIKE_KEY_RE =
  /status|state|phase|slurm|job|queue|workflow|execution|progress|batch|run|step|activity|health/i;

/**
 * Last-resort scan for backends that nest state under arbitrary keys (e.g. FastAPI detail, custom trees).
 */
const scanObjectTreeForWorkflowStatus = (obj, depth = 0) => {
  if (depth > 8 || obj == null) return '';
  if (typeof obj === 'string') return normalizeBaselineStatusToken(obj);
  if (Array.isArray(obj)) {
    const parts = obj.map((x) => scanObjectTreeForWorkflowStatus(x, depth + 1)).filter(Boolean);
    return aggregateBaselineChildStatuses(parts);
  }
  if (typeof obj !== 'object') return '';
  const strongStatus = new Set([
    'running',
    'submitting',
    'completed',
    'failed',
    'queued',
    'pending',
    'cancelled',
    'timeout',
  ]);
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      const n = normalizeBaselineStatusToken(v);
      if (n && (STATUS_LIKE_KEY_RE.test(k) || strongStatus.has(n))) parts.push(n);
    } else if (v && typeof v === 'object') {
      const n = scanObjectTreeForWorkflowStatus(v, depth + 1);
      if (n) parts.push(n);
    }
  }
  return aggregateBaselineChildStatuses(parts);
};

/** Prefer parsed JSON body; re-parse row.text if result is empty (some proxies strip body). */
const baselineStatusRowPayload = (row) => {
  let res = row?.result;
  if (res && typeof res === 'object' && Object.keys(res).length > 0) return res;
  const t = row?.text;
  if (typeof t === 'string' && t.trim().startsWith('{')) {
    try {
      return JSON.parse(t);
    } catch {
      // Ignore
    }
  }
  return res && typeof res === 'object' ? res : {};
};

/**
 * Batch aggregate error body from wrong endpoint / server memory — not a per-job
 * GET /api/baseline-simulation/{job_id}/status response. Ignore for merge and extraction.
 */
const isAggregateBatchStatusErrorPayload = (result) => {
  if (!result || typeof result !== 'object') return false;
  const err = result.error;
  if (typeof err === 'string' && /batch not found/i.test(err)) return true;
  if (typeof err === 'string' && /poll per-job status/i.test(err)) return true;
  if (typeof err === 'string' && /batch_id returned by post/i.test(err)) return true;
  return false;
};

/** One job row from GET .../baseline-simulation/{job_id}/status — use top-level `status` only. */
const isCompactPerJobBaselineStatusPayload = (result) =>
  result &&
  typeof result === 'object' &&
  !Array.isArray(result) &&
  result.job_id != null &&
  /^baseline_\d+_\d+$/i.test(String(result.job_id).trim()) &&
  typeof result.status === 'string' &&
  String(result.status).trim() !== '';

/** SCEPTER batch payloads include `status_counts` with running/submitted/... tallies. */
const inferStatusFromBatchStatusCounts = (sc) => {
  if (!sc || typeof sc !== 'object') return '';
  const lower = {};
  for (const [k, v] of Object.entries(sc)) {
    lower[String(k).toLowerCase()] = v;
  }
  const n = (k) => Number(lower[k]) || 0;
  if (n('failed') > 0) return 'failed';
  if (n('running') > 0) return 'running';
  if (n('submitting') > 0) return 'submitting';
  if (n('pending') > 0) return 'pending';
  if (n('queued') > 0) return 'queued';
  if (n('submitted') > 0) return 'submitted';
  if (n('completed') > 0) return 'completed';
  if (n('unknown') > 0) return 'unknown';
  return '';
};

/** Fields on batch or job objects that can all be present; aggregate so `running` beats stale `overall: submitting`. */
const BATCH_LEVEL_STATUS_FIELDS = [
  'status',
  'state',
  'phase',
  'stage',
  'overall',
  'batch_status',
  'overall_status',
  'slurm_state',
  'slurm_status',
  'slurm_job_state',
  'job_state',
  'job_status',
  'scheduler_state',
  'workflow_state',
  'execution_state',
  'run_state',
];

const collectBatchLevelStatuses = (obj) => {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const map = {};
  for (const k of Object.keys(obj)) {
    map[k.toLowerCase()] = obj[k];
  }
  const fromFields = [];
  for (const field of BATCH_LEVEL_STATUS_FIELDS) {
    const v = map[field.toLowerCase()];
    if (v != null && String(v).trim() !== '') {
      fromFields.push(normalizeBaselineStatusToken(String(v).trim()));
    }
  }
  const fieldAgg = aggregateBaselineChildStatuses(fromFields.filter(Boolean));
  const terminalFromFields =
    fieldAgg === 'completed' ||
    fieldAgg === 'failed' ||
    fieldAgg === 'cancelled' ||
    fieldAgg === 'timeout';

  const parts = [...fromFields];
  if (map['is_completed'] === true) parts.push('completed');
  if (map['is_failed'] === true || map['failed'] === true) parts.push('failed');
  /** Stale `running: true` with authoritative `status` / SLURM completed — ignore boolean running. */
  if (!terminalFromFields && (map['is_running'] === true || map['running'] === true)) parts.push('running');
  return aggregateBaselineChildStatuses(parts.filter(Boolean));
};

/** Normalize status strings from various baseline/batch API shapes. */
const extractStatusFromBaselinePayload = (result) => {
  if (result == null) return '';
  if (isAggregateBatchStatusErrorPayload(result)) return '';
  if (Array.isArray(result)) {
    const subs = result.map((j) => extractStatusFromBaselinePayload(j)).filter(Boolean);
    return aggregateBaselineChildStatuses(subs);
  }
  if (typeof result !== 'object') return '';
  if (isCompactPerJobBaselineStatusPayload(result)) {
    return normalizeBaselineStatusToken(String(result.status).trim());
  }

  /**
   * Merge root + nested + per-job signals. Batches often send e.g. top-level status "running" while
   * jobs[] still has stale "submitted"; returning children first hid the real running state.
   */
  const childArrays = [
    result.jobs,
    result.children,
    result.results,
    result.data?.jobs,
    result.data?.children,
    result.data?.results,
    result.detail?.jobs,
    result.detail?.children,
    result.detail?.results,
  ].filter((arr) => Array.isArray(arr) && arr.length);
  const childSubs = childArrays.flatMap((arr) =>
    arr.map((j) => extractStatusFromBaselinePayload(j)).filter(Boolean)
  );
  const fromChildren = aggregateBaselineChildStatuses(childSubs);

  const nestedContainers = [
    result.detail,
    result.data,
    result.response,
    result.result,
    result.job,
    result.payload,
    result.body,
  ].filter((x) => x && typeof x === 'object' && !Array.isArray(x));
  const nestedStatuses = nestedContainers.map((nest) => collectBatchLevelStatuses(nest)).filter(Boolean);
  const fromNested = aggregateBaselineChildStatuses(nestedStatuses);

  const rawCounts =
    result.status_counts ||
    result.statusCounts ||
    result.data?.status_counts ||
    result.data?.statusCounts;
  const fromCounts = normalizeBaselineStatusToken(inferStatusFromBatchStatusCounts(rawCounts));
  const direct = collectBatchLevelStatuses(result);
  const merged = aggregateBaselineChildStatuses(
    [fromCounts, direct, fromNested, fromChildren].filter(Boolean)
  );
  const fromTree = scanObjectTreeForWorkflowStatus(result);
  const final = aggregateBaselineChildStatuses([merged, fromTree].filter(Boolean));
  return final || '';
};

/** Root-level string fields on GET run-model status (ignore nested jobs[] and stale booleans first). */
const RUN_MODEL_ROOT_STATUS_KEYS = [
  'status',
  'state',
  'phase',
  'job_status',
  'slurm_state',
  'slurm_job_state',
  'scheduler_state',
  'overall',
  'overall_status',
  'batch_status',
  'workflow_state',
  'execution_state',
  'run_state',
];

/**
 * SCEPTER run-model status: prefer explicit root `status` / SLURM fields so completed is not
 * overridden by stale `running` flags or deep tree scans.
 */
const extractRunScepterModelStatusFromPayload = (result) => {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) return '';
  if (isAggregateBatchStatusErrorPayload(result)) return '';

  const terminal = [];
  const nonTerminal = [];
  for (const k of RUN_MODEL_ROOT_STATUS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(result, k)) continue;
    const v = result[k];
    if (v == null || (typeof v === 'string' && !String(v).trim())) continue;
    const n = normalizeBaselineStatusToken(String(v).trim());
    if (!n) continue;
    if (['completed', 'failed', 'cancelled', 'timeout'].includes(n)) terminal.push(n);
    else nonTerminal.push(n);
  }
  if (terminal.includes('failed')) return 'failed';
  if (terminal.includes('completed')) return 'completed';
  if (terminal.includes('cancelled')) return 'cancelled';
  if (terminal.includes('timeout')) return 'timeout';
  if (nonTerminal.length) return aggregateBaselineChildStatuses(nonTerminal);

  return extractStatusFromBaselinePayload(result);
};

/** String shown in coordinate inputs (fine-tuning on map picks). */
const formatCoordInput = (n) => (Number.isFinite(n) ? String(n) : '');

/**
 * Parse latitude/longitude from user text. Returns a finite number in range, or null if still typing/invalid.
 */
/** Merge per-job baseline status responses into one UI status. */
const mergeBaselineStatusRows = (rows) => {
  if (!rows?.length) {
    return { status: 'unknown', error: 'No status responses' };
  }
  const withPayload = rows.map((r) => ({ r, p: baselineStatusRowPayload(r) }));
  const usable = withPayload.filter(({ p }) => !isAggregateBatchStatusErrorPayload(p));
  if (!usable.length) {
    const msg =
      withPayload.find(({ p }) => typeof p?.error === 'string')?.p?.error ||
      'No per-job status (ignored batch aggregate error body).';
    return { status: 'unknown', error: msg };
  }
  const usableRows = usable.map(({ r }) => r);
  const bad = usableRows.find((r) => !r.ok);
  if (bad) {
    return {
      status: 'failed',
      error: bad.result?.error || bad.result?.message || bad.text || `Status check failed for job ${bad.id}`,
    };
  }
  const statuses = usableRows.map((r) => extractStatusFromBaselinePayload(baselineStatusRowPayload(r)));
  if (statuses.some((s) => s === 'failed' || s === 'cancelled' || s === 'timeout')) {
    const fr = usableRows.find((r) => {
      const st = extractStatusFromBaselinePayload(baselineStatusRowPayload(r));
      return st === 'failed' || st === 'cancelled' || st === 'timeout';
    });
    return {
      status: 'failed',
      error: fr?.result?.error || fr?.result?.message || 'One or more baseline jobs failed',
    };
  }
  const meaningful = statuses.filter((s) => s !== '');
  const aggregated = aggregateBaselineChildStatuses(meaningful);
  if (aggregated) return { status: aggregated, error: null };
  return { status: meaningful[0] || statuses[0] || 'unknown', error: null };
};

/**
 * Batch id from POST (e.g. baseline_batch_887986) — kept for UI / spinup_name; spin-up *status* uses per-job ids only.
 */
const normalizeBaselineBatchIdForStatus = (raw) => {
  if (raw == null) return '';
  const t = String(raw).trim();
  if (!t) return '';
  if (/^baseline_batch_\d+$/i.test(t)) return t;
  const m = t.match(/^baseline_(\d+)$/);
  if (m) return m[1];
  if (/^\d+$/.test(t)) return t;
  return t;
};

/** GET batch ZIP (manifest + all per-location folders under jobs/baseline_batch_*). */
const baselineBatchDownloadUrls = (batchId) => {
  const enc = encodeURIComponent(String(batchId).trim());
  return [
    `api/baseline-simulation-batch/${enc}/download`,
    `api/scepter/baseline-simulation-batch/${enc}/download`,
  ];
};

const parseBaselineJsonErrorMessage = (text) => {
  if (!text?.trim()) return '';
  try {
    const p = JSON.parse(text);
    return String(p?.error || p?.message || '').trim();
  } catch {
    return '';
  }
};

/** True when API returned JSON explaining the batch ZIP is gone (e.g. server restart). */
const isBatchDownloadUnavailableMessage = (text, jsonErr) => {
  const combined = `${jsonErr}\n${text || ''}`.toLowerCase();
  return (
    /not found in server memory|batch not found|batch not found in/i.test(combined) ||
    /server memory/.test(combined)
  );
};

const saveBlobAsFileDownload = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

/** GET /api/baseline-simulation/{jobId}/status (+ scepter alias). Batch status endpoint is not used for spin-up checks. */
const baselineSpinupJobStatusUrls = (jobId) => {
  const enc = encodeURIComponent(String(jobId).trim());
  return [
    `api/baseline-simulation/${enc}/status`,
    `api/scepter/baseline-simulation/${enc}/status`,
  ];
};

const fetchBaselineSpinupStatusRow = async (rawJobId) => {
  const id = String(rawJobId ?? '').trim();
  if (!id) {
    return { id: '', ok: false, statusCode: 0, result: null, text: 'Empty id' };
  }
  let lastRow = null;
  let sawAbort = false;
  for (const path of baselineSpinupJobStatusUrls(id)) {
    try {
      const response = await fetchWithTimeout(getApiUrl(path), {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      const text = await response.text();
      let result = null;
      if (text?.trim()) {
        try {
          result = JSON.parse(text);
        } catch {
          result = {};
        }
      }
      const row = { id, ok: response.ok, statusCode: response.status, result, text };
      if (response.ok) return row;
      lastRow = row;
      if (response.status !== 400 && response.status !== 404) return row;
    } catch (e) {
      if (e?.name === 'AbortError') {
        sawAbort = true;
        continue;
      }
      throw e;
    }
  }
  if (sawAbort && !lastRow) {
    throw new DOMException('Baseline status request timed out for all URL variants', 'AbortError');
  }
  return lastRow || { id, ok: false, statusCode: 0, result: null, text: 'No baseline status response' };
};

/** Run-model (restart) status: primary + /api/scepter/run-model/ alias. */
const fetchRunScepterModelStatusPair = async (rawJobId) => {
  const id = String(rawJobId ?? '').trim();
  if (!id) {
    return {
      response: { ok: false, status: 0 },
      result: null,
      text: 'Empty job id',
    };
  }
  const paths = [
    `api/run-scepter-model/${encodeURIComponent(id)}/status`,
    `api/scepter/run-model/${encodeURIComponent(id)}/status`,
  ];
  let last = null;
  let sawAbort = false;
  for (const path of paths) {
    try {
      const response = await fetchWithTimeout(getApiUrl(path), {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      const text = await response.text();
      let result = null;
      if (text?.trim()) {
        try {
          result = JSON.parse(text);
        } catch {
          result = {};
        }
      }
      last = { response, result, text };
      if (response.ok) return last;
      if (response.status !== 400 && response.status !== 404) return last;
    } catch (e) {
      if (e?.name === 'AbortError') {
        sawAbort = true;
        continue;
      }
      throw e;
    }
  }
  if (sawAbort && !last) throw new DOMException('Run-model status timed out', 'AbortError');
  return last || { response: { ok: false, status: 0 }, result: null, text: '' };
};

/** True when every row failed with an id-format/not-found style client error. */
const areAllRowsClientIdErrors = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.every((r) => !r?.ok && (r?.statusCode === 400 || r?.statusCode === 404));
};

const parseCoordField = (raw, kind) => {
  const t = String(raw ?? '')
    .trim()
    .replace(/,/g, '.');
  if (t === '' || t === '-' || t === '+' || t === '.' || t === '-.' || t === '+.') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (kind === 'lat') {
    if (n < -90 || n > 90) return null;
  } else {
    if (n < -180 || n > 180) return null;
  }
  return n;
};

// Find state abbreviation from coordinates (nearest state center)
const getStateCodeFromCoords = (lat, lng) => {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  let nearest = null;
  let minDist = Infinity;
  for (const state of usStates) {
    const [cy, cx] = state.center;
    const d = (lat - cy) ** 2 + (lng - cx) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = state;
    }
  }
  return nearest?.code ?? '';
};

// Add a new component for handling map zoom
function MapZoomHandler({ center, zoom }) {
  const map = useMap();
  
  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);

  return null;
}

// Create custom markers for different alkalinity data recency and sample count
/* const createCustomIcon = (color, sampleCount = 0) => {
  // Calculate size based on sample count (minimum 8px, maximum 20px)
  const minSize = 8;
  const maxSize = 20;
  const maxSamples = 100; // Adjust this based on your data range
  
  // Logarithmic scaling for better visual distribution
  const normalizedSamples = Math.min(sampleCount, maxSamples);
  const sizeMultiplier = normalizedSamples > 0 
    ? Math.log(normalizedSamples + 1) / Math.log(maxSamples + 1)
    : 0;
  const size = Math.max(minSize, minSize + (maxSize - minSize) * sizeMultiplier);
  
  const radius = size / 2 - 1; // Account for stroke width
  const center = size / 2;
  
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle fill="${color}" stroke="#000" stroke-width="1" cx="${center}" cy="${center}" r="${radius}"/>
      </svg>
    `)}`,
    iconSize: [size, size],
    iconAnchor: [center, center],
    popupAnchor: [0, -center],
  });
}; */
// Time series plots are in TimeSeriesPlot.jsx
// Alkalinity scatter plot is in AlkalinityScatterPlot.jsx

const USGSSiteSelector = ({ handleSiteSelect, location, onSitesLoaded, onStateSelect, onSiteTypeChange }) => {
  const [usgsSites, setUsgsSites] = useState([]);
  const [stateCd, setStateCd] = useState('');
  const [siteType, setSiteType] = useState('stream'); // New state for site type
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [allSitesWithAlkalinity, setAllSitesWithAlkalinity] = useState([]);

  // Function to determine marker color based on alkalinity data recency
  const getMarkerColor = (mostRecentAlkalinityDate) => {
    if (!mostRecentAlkalinityDate) return 'gray'; // No alkalinity data
    
    const now = new Date();
    const sampleDate = new Date(mostRecentAlkalinityDate);
    const yearsDiff = (now - sampleDate) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (yearsDiff <= 2) return 'green';   // Within last 1-2 years
    if (yearsDiff <= 5) return 'yellow';  // Within last 5 years
    return 'red';                         // Older than 5 years
  };

  // Function to fetch alkalinity data for each site
  const fetchAlkalinityDataForSites = async (sites) => {
    console.log(`Starting to fetch alkalinity data for ${sites.length} sites...`);
    
    const sitesWithAlkalinity = await Promise.all(
      sites.map(async (site, index) => {
        try {
          console.log(`Fetching alkalinity data for site ${site.id} (${index + 1}/${sites.length})`);
          
          const response = await fetch(
            `https://www.waterqualitydata.us/data/Result/search?siteid=USGS-${site.id}&characteristicName=Alkalinity&mimeType=csv`
          );
          
          console.log(`Response status for site ${site.id}: ${response.status}`);
          
          if (!response.ok) {
            console.log(`Failed to fetch data for site ${site.id}: ${response.status}`);
            return { ...site, markerColor: 'gray', alkalinityInfo: `No data available (HTTP ${response.status})` };
          }

          const csvText = await response.text();
          console.log(`CSV data received for site ${site.id}:`, csvText.slice(0, 200) + '...');
          
          // Parse CSV data
          const lines = csvText.trim().split('\n');
          if (lines.length > 1) { // Check if we have data beyond the header
            const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
            const resultMeasureIndex = headers.indexOf('ResultMeasureValue');
            const activityStartDateIndex = headers.indexOf('ActivityStartDate');
            
            if (resultMeasureIndex >= 0 && activityStartDateIndex >= 0) {
              // Parse data rows
              const validSamples = [];
              for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
                const measureValue = values[resultMeasureIndex];
                const dateValue = values[activityStartDateIndex];
                
                if (measureValue && !isNaN(parseFloat(measureValue)) && dateValue) {
                  validSamples.push({
                    date: new Date(dateValue),
                    value: parseFloat(measureValue)
                  });
                }
              }
              
              // Sort by date descending
              validSamples.sort((a, b) => b.date - a.date);
              
              console.log(`Found ${validSamples.length} valid alkalinity samples for site ${site.id}`);

              if (validSamples.length > 0) {
                const mostRecent = validSamples[0];
                const color = getMarkerColor(mostRecent.date);
                const yearsAgo = (new Date() - mostRecent.date) / (1000 * 60 * 60 * 24 * 365.25);
                
                console.log(`Site ${site.id}: Most recent sample ${mostRecent.date.toLocaleDateString()}, Color: ${color}`);
                
                return {
                  ...site,
                  markerColor: color,
                  alkalinityInfo: `Last sample: ${mostRecent.date.toLocaleDateString()} (${yearsAgo.toFixed(1)} years ago)`,
                  mostRecentAlkalinity: mostRecent.value,
                  mostRecentAlkalinityDate: mostRecent.date,
                  totalAlkalinitySamples: validSamples.length
                };
              }
            }
          }
          
          console.log(`No valid alkalinity data found for site ${site.id}`);
          return { ...site, markerColor: 'gray', alkalinityInfo: 'No alkalinity data available' };
        } catch (error) {
          console.error(`Error fetching alkalinity data for site ${site.id}:`, error);
          return { ...site, markerColor: 'gray', alkalinityInfo: 'Error loading data' };
        }
      })
    );
    
    console.log('Finished fetching alkalinity data for all sites');
    return sitesWithAlkalinity;
  };

  // Load sites from JSON file based on site type
  useEffect(() => {
    const loadSitesFromJSON = async () => {
      try {
        const fileName = siteType === 'groundwater' ? '/groundwater_site_list.json' : '/stream_site_list.json';
        const response = await fetch(fileName);
        const sitesData = await response.json();
        
        // Normalize the data structure - convert stream sites to match groundwater format
        const normalizedSites = sitesData.map(site => {
          if (siteType === 'stream') {
            // Convert stream site format to match groundwater format
            const siteId = site.site_no.replace('USGS-', ''); // Remove USGS- prefix
            return {
              id: siteId,
              name: `${siteId} - USGS Site`,
              hasAlkalinityData: true
            };
          } else {
            // Groundwater sites already have the correct format
            return site;
          }
        });
        
        setAllSitesWithAlkalinity(normalizedSites);
        console.log(`Loaded ${normalizedSites.length} ${siteType} sites with alkalinity data from JSON`);
      } catch (error) {
        console.error(`Error loading ${siteType} sites from JSON:`, error);
        setAllSitesWithAlkalinity([]);
      }
    };

    loadSitesFromJSON();
  }, [siteType]); // Re-run when site type changes

  useEffect(() => {
    const fetchSitesForState = async () => {
      if (!stateCd) {
        setUsgsSites([]);
        return;
      }

      setIsLoadingSites(true);
      try {
        console.log(`Fetching ${siteType} sites for state ${stateCd} using a more efficient approach...`);
        
        // Use the simpler approach: fetch all sites for the state and then filter for alkalinity
        const response = await fetch(`https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=${stateCd}&siteStatus=all`);
        const data = await response.json();

        if (!data.value || !data.value.timeSeries) {
          setUsgsSites([]);
          return;
        }

        // Extract unique sites from the response
        const siteGroups = {};
        data.value.timeSeries.forEach(series => {
          const siteId = series.sourceInfo.siteCode[0].value;
          
          if (!siteGroups[siteId]) {
            siteGroups[siteId] = {
              id: siteId,
              name: series.sourceInfo.siteName,
              latitude: series.sourceInfo.geoLocation.geogLocation.latitude,
              longitude: series.sourceInfo.geoLocation.geogLocation.longitude,
            };
          }
        });

        // Filter to only sites that are in our alkalinity list for the selected site type
        const alkalinityIds = new Set(allSitesWithAlkalinity.map(site => site.id));
        const sitesInState = Object.values(siteGroups)
          .filter(site => alkalinityIds.has(site.id))
          .map(site => ({
            id: site.id,
            name: `${site.id} - ${site.name}`,
            latitude: site.latitude,
            longitude: site.longitude,
            hasAlkalinityData: true
          }))
          .sort((a, b) => a.id.localeCompare(b.id));

        console.log(`Found ${sitesInState.length} ${siteType} sites with alkalinity data in ${stateCd} (filtered from ${Object.keys(siteGroups).length} total sites)`);
        
        // Start with gray markers and let real data fetching update the colors
        const sitesWithDefaultColors = sitesInState.map((site) => ({
          ...site,
          markerColor: 'gray', // Default to gray until real data is fetched
          alkalinityInfo: 'Loading alkalinity data...',
          totalAlkalinitySamples: 0 // Default to 0 until real data is fetched
        }));
        
        // Show sites immediately with default gray colors
        setUsgsSites(sitesWithDefaultColors);
        
        // Fetch real alkalinity data in the background for all sites
        console.log(`Starting background alkalinity data fetch for all ${sitesInState.length} ${siteType} sites...`);
        const sitesToFetch = sitesInState;
        const sitesWithRealData = await fetchAlkalinityDataForSites(sitesToFetch);
        
        // Update all sites with real data
        setUsgsSites(prev => {
          const updated = [...prev];
          sitesWithRealData.forEach(realSite => {
            const index = updated.findIndex(s => s.id === realSite.id);
            if (index >= 0) {
              updated[index] = realSite;
            }
          });
          return updated;
        });
        
        console.log(`Updated all ${sitesWithRealData.length} ${siteType} sites with real alkalinity data`);
        
      } catch (error) {
        console.error('Error fetching sites for state:', error);
        setUsgsSites([]);
      } finally {
        setIsLoadingSites(false);
      }
    };

    fetchSitesForState();
  }, [stateCd, allSitesWithAlkalinity, siteType]);

  useEffect(() => {
    onSitesLoaded(usgsSites);
  }, [usgsSites, onSitesLoaded]);

  const handleStateChange = (newStateCd) => {
    setStateCd(newStateCd);
    handleSiteSelect(''); // Reset selected site when state changes
    
    // Find the selected state and notify parent component
    const selectedState = usStates.find(state => state.code === newStateCd);
    if (selectedState) {
      onStateSelect(selectedState);
    }
  };

  const handleSiteTypeChange = (newSiteType) => {
    setSiteType(newSiteType);
    handleSiteSelect(''); // Reset selected site when site type changes
    setUsgsSites([]); // Clear current sites
    
    // Call parent callback to clear selected site and point
    if (onSiteTypeChange) {
      onSiteTypeChange();
    }
    
    // If there's a selected state, zoom back to state level
    if (stateCd) {
      const selectedState = usStates.find(state => state.code === stateCd);
      if (selectedState) {
        onStateSelect(selectedState); // This will reset map center and zoom
      }
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Label className="block mb-2">Select State</Label>
        <select
          className="w-full border rounded-xl p-2"
          value={stateCd}
          onChange={(e) => handleStateChange(e.target.value)}
        >
          <option value="" disabled>Choose a State</option>
          {usStates.map(state => (
            <option key={state.code} value={state.code}>{state.name}</option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <Label className="block mb-2">Site Type</Label>
        <select
          className="w-full border rounded-xl p-2"
          value={siteType}
          onChange={(e) => handleSiteTypeChange(e.target.value)}
        >
          <option value="stream">Stream Sites</option>
          <option value="groundwater">Groundwater Sites</option>
        </select>
      </div>
      <Label className="block mb-2">Select USGS Site</Label>
      <select
        className="w-full border rounded-xl p-2"
        value={location}
        onChange={(e) => handleSiteSelect(e.target.value)}
        disabled={!stateCd || isLoadingSites}
      >
        <option value="" disabled>
          {stateCd ? (isLoadingSites ? `Loading ${siteType} sites...` : `Choose USGS ${siteType === 'stream' ? 'Stream' : 'Groundwater'} Site`) : 'Select a state first'}
        </option>
        {stateCd && !isLoadingSites && usgsSites.map(site => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
      
      {/* Alkalinity Data Legend */}
      <div className="mt-4 p-3 bg-gray-50 rounded-xl">
        <h3 className="text-sm font-semibold mb-2">Alkalinity Data Legend ({siteType === 'stream' ? 'Stream' : 'Groundwater'} Sites)</h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Color Legend */}
          <div>
            <h4 className="text-xs font-semibold mb-1">Data Recency (Color)</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>Recent (≤2 years)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span>Moderate (2-5 years)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Old (&gt;5 years)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                <span>No data available</span>
              </div>
            </div>
          </div>
          
          {/* Size Legend */}
          <div>
            <h4 className="text-xs font-semibold mb-1">Sample Count (Size)</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                <span>Few samples</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                <span>Moderate samples</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
                <span>Many samples</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function SCEPTERConfig({ savedData }) {
  const { user } = useAuth();
  const [feedstock, setFeedstock] = useState('');
  const [particleSize, setParticleSize] = useState('');
  const [applicationRate, setApplicationRate] = useState('');
  const [targetPH, setTargetPH] = useState('');
  const [selectedSite, setSelectedSite] = useState(null);
  //const [editedAlkalinity, setEditedAlkalinity] = useState(0);
  //const [usgsSites, setUsgsSites] = useState([]);
  //const [isLoadingSiteData, setIsLoadingSiteData] = useState(false);
  const [mapCenter, setMapCenter] = useState([39.8283, -98.5795]); // Default US center
  const [mapZoom, setMapZoom] = useState(4); // Default zoom level
  //const [selectedStatistic, setSelectedStatistic] = useState('most_recent');
  //const [statisticPeriod, setStatisticPeriod] = useState('7d'); // Default to 7 days
  const [isSaving, setIsSaving] = useState(false);
  const [baselineJobId, setBaselineJobId] = useState(() => localStorage.getItem('scepter_baseline_job_id'));
  /** All SLURM job ids returned from batch spin-up (same length as locations when batch returns job_ids). */
  const [baselineJobIds, setBaselineJobIds] = useState(() => {
    try {
      const raw = localStorage.getItem('scepter_baseline_job_ids');
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length) return p.map((id) => String(id));
      }
    } catch {
      // Ignore invalid storage
    }
    const single = localStorage.getItem('scepter_baseline_job_id');
    return single ? [single] : [];
  });
  /** From POST /api/baseline-simulation-batch, e.g. baseline_batch_887986 (display / run-model spinup_name; status uses job ids). */
  const [baselineBatchId, setBaselineBatchId] = useState(() => {
    try {
      const s = localStorage.getItem('scepter_baseline_batch_id');
      if (s) return normalizeBaselineBatchIdForStatus(s);
    } catch {
      // Ignore invalid storage
    }
    return '';
  });
  const [baselineStatus, setBaselineStatus] = useState(null);
  const [isSubmittingBaseline, setIsSubmittingBaseline] = useState(false);
  const [baselineError, setBaselineError] = useState(null);
  /** Non-error info (e.g. batch submit acknowledgement). */
  const [baselineNotice, setBaselineNotice] = useState(null);
  /** Shown after each Check status so users see the click did something. */
  const [baselineCheckInfo, setBaselineCheckInfo] = useState(null);
  const [isCheckingBaselineStatus, setIsCheckingBaselineStatus] = useState(false);
  const [spinupJobId, setSpinupJobId] = useState(() => localStorage.getItem('scepter_spinup_job_id'));
  const [spinupStatus, setSpinupStatus] = useState(null);
  const [spinupError, setSpinupError] = useState(null);
  const [isCheckingSpinupStatus, setIsCheckingSpinupStatus] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1); // 1 = Location & Spin-up, 2 = Practice Variables
  /** { id, lat, lng, label }[] — labels like CT_Location_1 */
  const [selectedLocations, setSelectedLocations] = useState([]);
  /** Per-location coordinate strings for inputs (keyed by loc.id) */
  const [coordTextById, setCoordTextById] = useState({});
  /** Invalidates prior baseline status poll loops so only one chain updates UI. */
  const baselinePollGenerationRef = useRef(0);

  const hasAnyLocation = selectedLocations.length > 0;

  useEffect(() => {
    setCoordTextById((prev) => {
      const next = { ...prev };
      const ids = new Set(selectedLocations.map((l) => l.id));
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) delete next[id];
      }
      for (const loc of selectedLocations) {
        if (next[loc.id] === undefined) {
          next[loc.id] = {
            lat: formatCoordInput(loc.lat),
            lng: formatCoordInput(loc.lng),
          };
        }
      }
      return next;
    });
  }, [selectedLocations]);

  // Load saved data when component mounts or savedData changes
  useEffect(() => {
    if (savedData) {
      // Load saved model parameters
      const params = savedData.parameters || {};
      setFeedstock(params.feedstock || '');
      setParticleSize(params.particleSize || '');
      setApplicationRate(params.applicationRate || '');
      setTargetPH(params.targetPH || '');
      //setSelectedStatistic(params.selectedStatistic || 'most_recent');
      //setStatisticPeriod(params.statisticPeriod || '7d');
      //setEditedAlkalinity(params.alkalinity || 0);

      // Load saved measurements
      
      // Load saved site data
      if (savedData.siteData) {
        setSelectedSite(savedData.siteData);
      }
      
      if (Array.isArray(savedData.selectedLocations) && savedData.selectedLocations.length > 0) {
        setSelectedLocations(
          savedData.selectedLocations.map((loc, i) => ({
            id: loc.id || `saved-${i}`,
            lat: loc.lat,
            lng: loc.lng,
            label: loc.label || `${getStateCodeFromCoords(loc.lat, loc.lng) || 'LOC'}_Location_${i + 1}`,
          }))
        );
        const first = savedData.selectedLocations[0];
        if (first && Number.isFinite(first.lat) && Number.isFinite(first.lng)) {
          setMapCenter([first.lat, first.lng]);
          setMapZoom(8);
        }
      } else if (savedData.location && savedData.location.includes(',')) {
        const [lat, lng] = savedData.location.split(',').map((coord) => parseFloat(coord.trim()));
        if (!isNaN(lat) && !isNaN(lng)) {
          const stateCode = getStateCodeFromCoords(lat, lng) || 'LOC';
          setSelectedLocations([{ id: 'saved-single', lat, lng, label: `${stateCode}_Location_1` }]);
          setMapCenter([lat, lng]);
          setMapZoom(8);
        }
      } else {
        setSelectedLocations([]);
      }
      setCurrentPage(2);
    }
  }, [savedData]);

  // Restore map location from persisted baseline job coordinate (e.g. after refresh) so user can see where the spin-up was run
  useEffect(() => {
    if (savedData) return;
    const jobId = localStorage.getItem('scepter_baseline_job_id');
    const raw = localStorage.getItem('scepter_baseline_coordinate');
    if (!jobId || !raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.mode === 'multiple' && Array.isArray(parsed.locations) && parsed.locations.length > 0) {
        setSelectedLocations(
          parsed.locations.map((loc, i) => ({
            id: loc.id || `ls-${i}`,
            lat: loc.lat,
            lng: loc.lng,
            label: loc.label || `${getStateCodeFromCoords(loc.lat, loc.lng) || 'LOC'}_Location_${i + 1}`,
          }))
        );
        const f = parsed.locations[0];
        if (Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
          setMapCenter([f.lat, f.lng]);
          setMapZoom(8);
        }
      } else {
        const { coordinate, locationName: savedName } = parsed;
        if (coordinate && Array.isArray(coordinate) && coordinate.length >= 2) {
          const [lat, lng] = coordinate;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const stateCode = getStateCodeFromCoords(lat, lng) || 'LOC';
            setSelectedLocations([
              {
                id: 'persisted-single',
                lat,
                lng,
                label: savedName && savedName !== '' ? savedName : `${stateCode}_Location_1`,
              },
            ]);
            setMapCenter([lat, lng]);
            setMapZoom(8);
          }
        }
      }
    } catch {
      // Ignore invalid cached baseline coordinate payloads
    }
  }, [savedData]);

  const handleRunModel = async (e) => {
    e.preventDefault();

    if (!baselineJobId || baselineStatus !== 'completed') {
      return;
    }

    if (!selectedLocations.length) {
      setSpinupError('No locations selected. Add locations in Step 1 and run spin-up first.');
      return;
    }
    for (const l of selectedLocations) {
      if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng) || l.lat < -90 || l.lat > 90 || l.lng < -180 || l.lng > 180) {
        setSpinupError('All locations must have valid latitude and longitude.');
        return;
      }
    }

    const particleSizeNum = particleSizeToNumber(particleSize);
    const applicationRateNum = applicationRate ? parseFloat(applicationRate) : null;
    if (particleSizeNum == null) {
      return;
    }
    if (applicationRateNum == null || !Number.isFinite(applicationRateNum) || applicationRateNum <= 0) {
      return;
    }

    const baseName =
      selectedLocations
        .map((l) => (l.label || '').trim().replace(/\s+/g, '_'))
        .filter(Boolean)
        .join('_') || 'run';
    const restartName = `restart_${baseName}_${Date.now()}`;

    const coordinates = selectedLocations.map((l) => [l.lat, l.lng]);
    const location_names = selectedLocations.map((l) => (l.label || '').trim().replace(/\s+/g, '_'));

    const batchIdForRun = normalizeBaselineBatchIdForStatus(baselineBatchId);
    const hasBatchIdForRun = /^baseline_batch_\d+$/i.test(batchIdForRun);
    const defaultSpinupName = (baselineJobId || batchIdForRun || '').trim();
    const perJobIds = baselineJobIds
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    const spinupNameForRow = (i) => {
      if (perJobIds.length === selectedLocations.length && perJobIds[i]) {
        if (hasBatchIdForRun) {
          return `${batchIdForRun}/${perJobIds[i]}`;
        }
        return perJobIds[i];
      }
      return defaultSpinupName;
    };

    let body;
    if (selectedLocations.length > 1) {
      const ts = Date.now();
      const locations = selectedLocations.map((l, i) => {
        const locLabel = (l.label || '').trim().replace(/\s+/g, '_') || `loc_${i}`;
        const row = {
          spinup_name: spinupNameForRow(i),
          restart_name: `restart_${locLabel}_${ts}_${i}`,
          particle_size: particleSizeNum,
          application_rate: applicationRateNum,
        };
        if (hasBatchIdForRun) row.spinup_batch_id = batchIdForRun;
        if (targetPH && targetPH.trim() !== '') {
          const ph = parseFloat(targetPH);
          if (Number.isFinite(ph)) row.target_pH = ph;
        }
        return row;
      });
      body = { locations };
    } else {
      body = {
        spinup_name: defaultSpinupName,
        restart_name: restartName,
        particle_size: particleSizeNum,
        application_rate: applicationRateNum,
        coordinates,
        location_names,
      };
      if (hasBatchIdForRun) body.spinup_batch_id = batchIdForRun;
      if (targetPH && targetPH.trim() !== '') {
        const ph = parseFloat(targetPH);
        if (Number.isFinite(ph)) body.target_pH = ph;
      }
    }

    try {
      const runPaths =
        selectedLocations.length > 1
          ? ['api/run-scepter-model-batch', 'api/scepter/run-model-batch']
          : ['api/run-scepter-model', 'api/scepter/run-model'];

      let response = null;
      let text = '';
      for (const runPath of runPaths) {
        response = await fetch(getApiUrl(runPath), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify(body),
        });
        text = await response.text();
        if (response.ok) break;
        if (response.status !== 400 && response.status !== 404) break;
      }

      let result = null;
      if (text && text.trim()) {
        try {
          result = JSON.parse(text);
        } catch {
          // Ignore invalid JSON payloads
        }
      }
      if (!response.ok) {
        let msg = result?.error || result?.message || text || `Request failed (${response.status})`;
        if (Number.isFinite(result?.index)) {
          msg = `${msg} (location index ${result.index})`;
        }
        setSpinupError(msg);
        return;
      }
      const newJobId =
        result?.job_id ||
        (Array.isArray(result?.job_ids) && result.job_ids.length ? result.job_ids[0] : null);
      if (newJobId) {
        setSpinupJobId(String(newJobId));
        setSpinupStatus(result.status || 'submitted');
        setSpinupError(null);
        localStorage.setItem('scepter_spinup_job_id', String(newJobId));
      }
    } catch (err) {
      console.error('SCEPTER run error:', err);
      setSpinupError(err.message || 'Failed to run SCEPTER model. Please try again.');
    }
  };

  /** Poll spin-up status using per-job ids only (no batch GET .../baseline-simulation-batch/{batchId}/status). */
  const pollBaselineBatchStatus = useCallback((ids) => {
    const generation = ++baselinePollGenerationRef.current;
    const idArr = (ids || []).map((id) => String(id).trim()).filter(Boolean);
    if (!idArr.length) return;

    const fetchOneJob = (jid) => fetchBaselineSpinupStatusRow(jid);

    const loop = async () => {
      if (generation !== baselinePollGenerationRef.current) return;
      try {
        const rows = await Promise.all(idArr.map((id) => fetchOneJob(id)));
        if (areAllRowsClientIdErrors(rows)) {
          setBaselineError(
            'Baseline spin-up status failed (400/404) on api/baseline-simulation/{jobId}/status (and scepter alias). Confirm job ids match the POST response.'
          );
          // Keep current status visible; do not retry indefinitely and flood logs.
          return;
        }
        if (generation !== baselinePollGenerationRef.current) return;
        const { status, error } = mergeBaselineStatusRows(rows);
        setBaselineStatus(status);
        if (status === 'failed') {
          setBaselineError(error);
          return;
        }
        setBaselineError(null);
        if (status === 'completed') {
          return;
        }
        if (['running', 'submitting', 'queued', 'pending', 'submitted'].includes(status)) {
          setTimeout(() => {
            if (generation !== baselinePollGenerationRef.current) return;
            loop();
          }, 5000);
          return;
        }
        setTimeout(() => {
          if (generation !== baselinePollGenerationRef.current) return;
          loop();
        }, 5000);
      } catch (err) {
        if (generation !== baselinePollGenerationRef.current) return;
        if (err?.name === 'AbortError') {
          setBaselineCheckInfo('Poll timed out; retrying again in 15s…');
          setTimeout(() => {
            if (generation !== baselinePollGenerationRef.current) return;
            loop();
          }, 15000);
          return;
        }
        console.error('Error polling baseline batch status:', err);
        setTimeout(() => {
          if (generation !== baselinePollGenerationRef.current) return;
          loop();
        }, 10000);
      }
    };
    loop();
  }, []);

  const pollBaselineStatus = useCallback(
    (jobId) => {
      const id = String(jobId || '').trim();
      if (id) pollBaselineBatchStatus([id]);
    },
    [pollBaselineBatchStatus]
  );

  const hasActiveBaselineJobs = !!(baselineJobId?.trim() || baselineJobIds.length > 0);

  const handleBaselineSimulation = async () => {
    // Prevent duplicate submissions for the same spin-up request.
    if (isSubmittingBaseline || hasActiveBaselineJobs) {
      return;
    }
    setIsSubmittingBaseline(true);
    setBaselineError(null);
    setBaselineNotice(null);
    setBaselineCheckInfo(null);
    setBaselineStatus('submitting');

    let body = null;
    let persistPayload = null;

    if (!selectedLocations.length) {
      setBaselineError('Please select at least one location on the map.');
      setIsSubmittingBaseline(false);
      return;
    }
    for (const l of selectedLocations) {
      if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) {
        setBaselineError('Enter valid latitude and longitude for every location (see coordinate fields).');
        setIsSubmittingBaseline(false);
        return;
      }
      if (l.lat < -90 || l.lat > 90 || l.lng < -180 || l.lng > 180) {
        setBaselineError('Latitude must be between -90 and 90; longitude between -180 and 180.');
        setIsSubmittingBaseline(false);
        return;
      }
    }
    const coordinates = selectedLocations.map((l) => [l.lat, l.lng]);
    const location_names = selectedLocations.map((l) => (l.label || '').trim().replace(/\s+/g, '_'));
    body = {
      coordinates,
      location_names,
      coordinate: coordinates[0],
      location_name: location_names[0] || undefined,
    };
    persistPayload = {
      mode: 'multiple',
      locations: selectedLocations.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, label: l.label })),
    };

    try {
      const response = await fetch(getApiUrl('api/baseline-simulation-batch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let result = null;
      if (text?.trim()) {
        try {
          result = JSON.parse(text);
        } catch {
          result = {};
        }
      }
      if (!response.ok) {
        const msg = result?.error || result?.message || text || `Request failed (${response.status})`;
        setBaselineError(msg);
        setBaselineStatus('failed');
        return;
      }
      const jobIds =
        Array.isArray(result?.job_ids)
          ? result.job_ids
              .map((id) => (id == null ? '' : String(id).trim()))
              .filter(Boolean)
          : [];
      const jobId =
        result?.job_id ||
        result?.batch_job_id ||
        result?.baseline_job_id ||
        result?.id ||
        (jobIds.length === 1 ? jobIds[0] : null);
      if (!jobId) {
        // Batch submit may return multiple per-location ids without a single aggregate id.
        if (jobIds.length > 1 || response.status === 202) {
          const rawBatch =
            result?.batch_id ??
            result?.batchId ??
            result?.data?.batch_id ??
            null;
          const statusBatchId = normalizeBaselineBatchIdForStatus(rawBatch) || '';
          setBaselineJobIds(jobIds);
          setBaselineJobId(jobIds[0] || null);
          if (jobIds[0]) {
            localStorage.setItem('scepter_baseline_job_id', jobIds[0]);
          }
          try {
            localStorage.setItem('scepter_baseline_job_ids', JSON.stringify(jobIds));
          } catch {
            // Ignore localStorage write errors
          }
          if (statusBatchId) {
            setBaselineBatchId(statusBatchId);
            try {
              localStorage.setItem('scepter_baseline_batch_id', statusBatchId);
            } catch {
              // Ignore localStorage write errors
            }
          } else {
            setBaselineBatchId('');
            localStorage.removeItem('scepter_baseline_batch_id');
          }
          setBaselineStatus(result?.status || 'submitted');
          setBaselineError(null);
          setBaselineNotice(
            result?.message || `Submitted ${jobIds.length} baseline job(s). Use Check status for progress.`
          );
          try {
            localStorage.setItem('scepter_baseline_coordinate', JSON.stringify(persistPayload));
          } catch {
            // Ignore localStorage write errors
          }
          if (jobIds.length) {
            pollBaselineBatchStatus(jobIds);
          }
          return;
        }
        setBaselineError(
          result?.error ||
            result?.message ||
            'No job id found in response (expected job_id, batch_job_id, baseline_job_id, id, or job_ids).'
        );
        setBaselineStatus('failed');
        return;
      }
      setBaselineJobId(jobId);
      setBaselineJobIds([jobId]);
      setBaselineNotice(null);
      const rawBatch =
        result?.batch_id ??
        result?.batchId ??
        result?.data?.batch_id ??
        null;
      const statusBatchId = normalizeBaselineBatchIdForStatus(rawBatch) || '';
      if (statusBatchId) {
        setBaselineBatchId(statusBatchId);
        try {
          localStorage.setItem('scepter_baseline_batch_id', statusBatchId);
        } catch {
          // Ignore localStorage write errors
        }
      } else {
        setBaselineBatchId('');
        localStorage.removeItem('scepter_baseline_batch_id');
      }
      setBaselineStatus(result?.status || 'submitted');
      localStorage.setItem('scepter_baseline_job_id', jobId);
      try {
        localStorage.setItem('scepter_baseline_job_ids', JSON.stringify([jobId]));
      } catch {
        // Ignore localStorage write errors
      }
      try {
        localStorage.setItem('scepter_baseline_coordinate', JSON.stringify(persistPayload));
      } catch {
        // Ignore localStorage write errors
      }
      pollBaselineStatus(jobId);
    } catch (err) {
      console.error('Baseline simulation error:', err);
      setBaselineError(err.message);
      setBaselineStatus('failed');
    } finally {
      setIsSubmittingBaseline(false);
    }
  };

  const handleCheckBaselineStatus = async () => {
    const ids =
      baselineJobIds.length > 0
        ? baselineJobIds.map((id) => String(id).trim()).filter(Boolean)
        : baselineJobId?.trim()
          ? [baselineJobId.trim()]
          : [];
    if (!ids.length) {
      setBaselineError('No spin-up job IDs. Run spin-up job first (batch id is not used for status).');
      return;
    }
    setIsCheckingBaselineStatus(true);
    setBaselineError(null);
    const checkedAt = new Date().toLocaleTimeString();
    try {
      const rows = await Promise.all(ids.map((id) => fetchBaselineSpinupStatusRow(id)));
      if (areAllRowsClientIdErrors(rows)) {
        setBaselineError(
          'Baseline spin-up status failed (400/404) on api/baseline-simulation/{jobId}/status. Confirm each job id (e.g. baseline_…_0) from the POST response.'
        );
        setBaselineCheckInfo(
          `Checked ${checkedAt}: no working per-job baseline status URL (/api/scepter/… alias also tried).`
        );
        return;
      }
      const { status, error } = mergeBaselineStatusRows(rows);
      setBaselineStatus(status);
      setBaselineError(error);
      if (status === 'unknown' && rows[0]?.result && typeof rows[0].result === 'object') {
        const keys = Object.keys(rows[0].result).filter((k) => !k.startsWith('_')).slice(0, 12);
        setBaselineCheckInfo(
          `Checked ${checkedAt}: backend did not return a recognized status field. Keys: ${keys.length ? keys.join(', ') : '(none)'}.`
        );
      } else {
        setBaselineCheckInfo(`Checked ${checkedAt}: ${status}${error ? ` — ${error}` : ''}.`);
      }
      if (['pending', 'running', 'submitting', 'submitted', 'queued'].includes(status)) {
        pollBaselineBatchStatus(ids);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Spin-up status check error:', err);
      }
      if (err?.name === 'AbortError') {
        setBaselineError('Status check timed out. Try again or confirm the API is reachable.');
      } else {
        setBaselineError(err.message || 'Status check failed.');
      }
      setBaselineCheckInfo(`Checked ${checkedAt}: request failed.`);
    } finally {
      setIsCheckingBaselineStatus(false);
    }
  };

  const handleCheckSpinupStatus = async () => {
    const jobId = spinupJobId?.trim();
    if (!jobId) {
      setSpinupError('No SCEPTER job ID. Run the SCEPTER model first.');
      return;
    }
    setIsCheckingSpinupStatus(true);
    setSpinupError(null);
    try {
      const { response, result, text } = await fetchRunScepterModelStatusPair(jobId);
      if (!response.ok) {
        const msg =
          result?.error || result?.message || text || `Status check failed (${response.status})`;
        setSpinupError(msg);
        setSpinupStatus('error');
        return;
      }
      const parsed = extractRunScepterModelStatusFromPayload(result);
      const status =
        parsed ||
        (result?.status != null ? normalizeBaselineStatusToken(String(result.status)) : '') ||
        'unknown';
      setSpinupStatus(status);
      setSpinupError(result?.error || null);
    } catch (err) {
      console.error('Model status check error:', err);
      if (err.name === 'AbortError') {
        setSpinupError('Status check timed out. Try again.');
      } else {
        setSpinupError(err.message);
      }
    } finally {
      setIsCheckingSpinupStatus(false);
    }
  };

  const handleDownloadResults = async () => {
    const jobId = spinupJobId?.trim();
    if (!jobId || spinupStatus !== 'completed') return;
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadStatus('Connecting...');
    setSpinupError(null);

    try {
      setDownloadStatus('Requesting download...');
      const response = await fetch(getApiUrl(`api/run-scepter-model/${jobId}/download`), {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });

      if (!response.ok) {
        const text = await response.text();
        let errMsg = text;
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed?.error || parsed?.message || text;
        } catch {
          // Ignore invalid JSON payloads
        }
        throw new Error(errMsg || `Download failed (${response.status})`);
      }

      setDownloadStatus('Receiving data...');
      const blob = await response.blob();
      setDownloadStatus('Starting download...');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scepter_results_${jobId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setDownloadStatus('Download complete!');
      setTimeout(() => {
        setDownloadStatus('');
      }, 2000);
    } catch (err) {
      console.error('Download error:', err);
      setSpinupError(err.message || 'Failed to download results.');
      setDownloadStatus('Download failed');
      setTimeout(() => setDownloadStatus(''), 3000);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSpinupResults = async () => {
    const jobId = baselineJobId?.trim();
    if (!jobId || baselineStatus !== 'completed') return;
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadStatus('Connecting...');
    setBaselineError(null);

    try {
      setDownloadStatus('Requesting download...');
      const batchIdNorm =
        normalizeBaselineBatchIdForStatus(baselineBatchId) || String(baselineBatchId ?? '').trim();
      const canTryBatch = /^baseline_batch_\d+$/i.test(batchIdNorm);

      let batchResponse = null;
      let batchZipFilename = `scepter_spinup_${batchIdNorm}.zip`;

      if (canTryBatch) {
        for (const path of baselineBatchDownloadUrls(batchIdNorm)) {
          const r = await fetch(getApiUrl(path), {
            headers: { 'ngrok-skip-browser-warning': 'true' },
            cache: 'no-store',
          });
          if (r.ok) {
            const ct = (r.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('application/json') || ct.includes('text/json')) {
              const t = await r.text();
              const je = parseBaselineJsonErrorMessage(t);
              if (isBatchDownloadUnavailableMessage(t, je)) continue;
              throw new Error(je || t || 'Batch download returned an error.');
            }
            batchResponse = r;
            break;
          }
          const errText = await r.text();
          const jsonErr = parseBaselineJsonErrorMessage(errText);
          if (r.status === 400 || r.status === 404) continue;
          if (isBatchDownloadUnavailableMessage(errText, jsonErr)) continue;
          throw new Error(jsonErr || errText || `Batch download failed (${r.status})`);
        }
      }

      if (batchResponse?.ok) {
        setDownloadStatus('Receiving data...');
        const blob = await batchResponse.blob();
        setDownloadStatus('Starting download...');
        saveBlobAsFileDownload(blob, batchZipFilename);
        setDownloadStatus('Download complete!');
        setTimeout(() => setDownloadStatus(''), 2000);
        return;
      }

      const ids = [];
      const seen = new Set();
      const source = baselineJobIds.length > 0 ? baselineJobIds : [jobId];
      for (const raw of source) {
        const id = String(raw ?? '').trim();
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      if (!ids.length) {
        throw new Error('No spin-up job IDs to download.');
      }

      const usedBatchZip = canTryBatch;
      for (let i = 0; i < ids.length; i += 1) {
        const jid = ids[i];
        setDownloadStatus(
          ids.length > 1 ? `Downloading location ${i + 1} of ${ids.length}...` : 'Receiving data...'
        );
        const response = await fetch(
          getApiUrl(`api/baseline-simulation/${encodeURIComponent(jid)}/download`),
          { headers: { 'ngrok-skip-browser-warning': 'true' }, cache: 'no-store' }
        );
        if (!response.ok) {
          const text = await response.text();
          let errMsg = text;
          try {
            const parsed = JSON.parse(text);
            errMsg = parsed?.error || parsed?.message || text;
          } catch {
            // ignore
          }
          throw new Error(errMsg || `Download failed for ${jid} (${response.status})`);
        }
        const blob = await response.blob();
        saveBlobAsFileDownload(blob, `scepter_spinup_${jid}.zip`);
        if (i < ids.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 450));
        }
      }

      setDownloadStatus(
        usedBatchZip && ids.length > 1
          ? `Downloaded ${ids.length} ZIP file(s) (batch ZIP unavailable on server).`
          : ids.length > 1
            ? `Downloaded ${ids.length} ZIP file(s).`
            : 'Download complete!'
      );
      setTimeout(() => setDownloadStatus(''), 3000);
    } catch (err) {
      console.error('Spin-up download error:', err);
      const msg = err.message || 'Failed to download spin-up results.';
      setBaselineError(msg);
      setDownloadStatus('Download failed');
      setTimeout(() => setDownloadStatus(''), 3000);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveModel = async () => {
    if (!user) {
      return;
    }

    if (!hasAnyLocation) {
      return;
    }

    setIsSaving(true);

    try {
      const defaultName =
        selectedLocations.length > 0
          ? `SCEPTER_${selectedLocations.map((l) => l.label).join('_').replace(/\s+/g, '_')}`
          : 'SCEPTER_Custom_Location';
      const modelData = {
        name: defaultName,
        model: 'SCEPTER',
        locationMode: 'multiple',
        selectedLocations,
        location: selectedLocations.map((l) => `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`).join(' | '),
        status: 'saved',
        parameters: {
          feedstock,
          particleSize,
          applicationRate,
          targetPH,
          // selectedStatistic,
          // statisticPeriod,
          // discharge: editedDischarge,
          // alkalinity: editedAlkalinity,
          // temperature: editedTemperature,
          // ph: editedPH,
          // bicarbonate: editedBicarbonate
        },
        siteData: selectedSite
      };

      if (savedData) {
        // Update existing model
        await userService.updateUserModel(user.id, savedData.id, modelData);
      } else {
        // Create new model
        await userService.saveUserModel(user.id, modelData);
      }
    } catch (error) {
      console.error('Error saving model:', error);
    } finally {
      setIsSaving(false);
    }
  };

/*   const calculateStatistic = (values, statistic) => {
    if (!values || values.length === 0) return null;
    const numericValues = values.map(v => parseFloat(v.value)).filter(v => !isNaN(v));
    if (numericValues.length === 0) return null;

    switch (statistic) {
      case 'mean':
        return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      case 'max':
        return Math.max(...numericValues);
      case 'min':
        return Math.min(...numericValues);
      case 'most_recent':
        return parseFloat(values[values.length - 1].value);
      default:
        return null;
    }
  }; 

  const fetchAlkalinityData = async (siteId) => {
    if (!siteId) return;
    
    setIsLoadingSiteData(true);
    try {
      console.log(`Fetching alkalinity data for selected site: ${siteId}`);
      
      // Fetch alkalinity data from WQP API
      const apiUrl = `https://www.waterqualitydata.us/data/Result/search?siteid=USGS-${siteId}&characteristicName=Alkalinity&mimeType=csv`;
      console.log(`API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      
      console.log(`Response status for site ${siteId}: ${response.status}`);
      
      if (!response.ok) {
        console.log(`Failed to fetch data for site ${siteId}: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const csvText = await response.text();
      console.log(`Raw CSV response for site ${siteId}:`, csvText.slice(0, 500));
      
      // Parse CSV data
      const lines = csvText.trim().split('\n');
      console.log(`CSV has ${lines.length} lines (including header)`);
      
      if (lines.length > 1) { // Check if we have data beyond the header
        const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
        console.log(`CSV headers:`, headers.slice(0, 10)); // Log first 10 headers
        
        const resultMeasureIndex = headers.indexOf('ResultMeasureValue');
        const activityStartDateIndex = headers.indexOf('ActivityStartDate');
        const measureUnitIndex = headers.indexOf('ResultMeasure/MeasureUnitCode');
        
        console.log(`Column indices - ResultMeasureValue: ${resultMeasureIndex}, ActivityStartDate: ${activityStartDateIndex}, MeasureUnit: ${measureUnitIndex}`);
        
        if (resultMeasureIndex >= 0 && activityStartDateIndex >= 0) {
          const validSamples = [];
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
            const measureValue = values[resultMeasureIndex];
            const dateValue = values[activityStartDateIndex];
            const unitValue = measureUnitIndex >= 0 ? values[measureUnitIndex] : 'mg/L';
            
            if (i <= 3) { // Log first few data rows for debugging
              console.log(`Row ${i}: measureValue="${measureValue}", dateValue="${dateValue}", unit="${unitValue}"`);
            }
            
            if (measureValue && !isNaN(parseFloat(measureValue)) && dateValue) {
              validSamples.push({
                value: parseFloat(measureValue),
                date: new Date(dateValue),
                unit: unitValue || 'mg/L'
              });
            }
          }
          
          // Sort by date descending to get most recent
          validSamples.sort((a, b) => b.date - a.date);
          
          console.log(`Found ${validSamples.length} valid alkalinity samples for site ${siteId}`);
          
          if (validSamples.length > 0) {
            const mostRecent = validSamples[0];
            console.log(`Most recent sample: ${mostRecent.value} ${mostRecent.unit} on ${mostRecent.date.toLocaleDateString()}`);
            
            // Calculate average alkalinity
            const averageAlkalinity = validSamples.reduce((sum, sample) => sum + sample.value, 0) / validSamples.length;
            
            //setEditedAlkalinity(mostRecent.value);
            setSelectedSite(prev => ({
              ...prev,
              alkalinity: mostRecent.value,
              averageAlkalinity: averageAlkalinity,
              alkalinityDateTime: mostRecent.date.toISOString(),
              hasAlkalinity: true,
              alkalinityUnit: mostRecent.unit,
              totalAlkalinitySamples: validSamples.length
            }));
          } else {
            console.log(`No valid alkalinity samples found for site ${siteId}`);
            setSelectedSite(prev => ({
              ...prev,
              hasAlkalinity: false
            }));
          }
        } else {
          console.log(`Required columns not found in CSV for site ${siteId}. ResultMeasureValue index: ${resultMeasureIndex}, ActivityStartDate index: ${activityStartDateIndex}`);
          setSelectedSite(prev => ({
            ...prev,
            hasAlkalinity: false
          }));
        }
      } else {
        console.log(`CSV for site ${siteId} has no data rows (only ${lines.length} lines total)`);
        setSelectedSite(prev => ({
          ...prev,
          hasAlkalinity: false
        }));
        
        // Update the marker color to gray in the sites array
        setUsgsSites(prev => 
          prev.map(s => 
            s.id === siteId 
              ? { ...s, markerColor: 'gray', hasAlkalinity: false, totalAlkalinitySamples: 0, alkalinityInfo: 'No alkalinity data available' }
              : s
          )
        );
      }
    } catch (error) {
      console.error(`Error fetching alkalinity data for site ${siteId}:`, error);
      console.error('Error details:', error.message, error.stack);
      setSelectedSite(prev => ({
        ...prev,
        hasAlkalinity: false,
        errorMessage: error.message
      }));
      
      // Update the marker color to gray in the sites array
      setUsgsSites(prev => 
        prev.map(s => 
          s.id === siteId 
            ? { ...s, markerColor: 'gray', hasAlkalinity: false, totalAlkalinitySamples: 0, alkalinityInfo: 'Error loading data' }
            : s
        )
      );
    } finally {
      setIsLoadingSiteData(false);
    }
  };

  const handleSiteSelect = async (siteId) => {
    const site = usgsSites.find(s => s.id === siteId);
    setSelectedSite(site);
    setLocation(siteId);
    setSelectedPoint(site ? { lat: site.latitude, lng: site.longitude } : null);
    if (site) {
      const stateCode = getStateCodeFromCoords(site.latitude, site.longitude);
      const baseName = site.name || `USGS-${siteId}`;
      setLocationName(stateCode ? `${stateCode}-${baseName}` : baseName);
    } else {
      setLocationName('');
    }
    
    // Zoom to the selected site
    if (site) {
      setMapCenter([site.latitude, site.longitude]);
      setMapZoom(10); // Zoom level for individual site view
      await fetchAlkalinityData(siteId);
    }
  };
  */
  function MapClickHandler({ onMapClick }) {
    useMapEvents({
      click: (e) => {
        onMapClick(e.latlng);
      },
    });
    return null;
  }

  /* const handleEditParameters = () => {
    setEditedDischarge(selectedSite?.discharge || 0);
    setEditedAlkalinity(selectedSite?.alkalinity || 0);
    setEditedTemperature(selectedSite?.temperature || 0);
    setEditedPH(selectedSite?.ph || 0);
    setEditedBicarbonate(selectedSite?.bicarbonate || 0);
    setIsEditing(true);
  };

  const handleSaveParameters = () => {
    setSelectedSite(prev => ({
      ...prev,
      discharge: editedDischarge,
      alkalinity: editedAlkalinity,
      temperature: editedTemperature,
      ph: editedPH,
      bicarbonate: editedBicarbonate
    }));
    setIsEditing(false);
  };
 
  const handleSitesLoaded = useCallback((sites) => {
    setUsgsSites(sites);
  }, []);

  const handleStateSelect = useCallback((state) => {
    setMapCenter(state.center);
    setMapZoom(state.zoom);
  }, []);

  const handleSiteTypeChange = useCallback(() => {
    // Clear selected site and point when site type changes
    setSelectedSite(null);
    setSelectedPoint(null);
    setLocation('');
    setLocationName('');
  }, []);

  useEffect(() => {
    if (location) {
      fetchAlkalinityData(location);
    }
  }, [selectedStatistic, statisticPeriod]);
*/
  const spinUpSuccess = baselineStatus === 'completed';
  const canContinueToStep2 =
    savedData ||
    (spinUpSuccess && selectedLocations.length >= 1);

  const removeLocationAt = (index) => {
    setSelectedLocations((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((loc, i) => {
        const code = getStateCodeFromCoords(loc.lat, loc.lng) || 'LOC';
        return { ...loc, label: `${code}_Location_${i + 1}` };
      });
    });
  };

  const clearAllMultipleLocations = () => {
    setSelectedLocations([]);
  };

  const updateLocationCoordText = useCallback((locId, field, text) => {
    const kind = field === 'lat' ? 'lat' : 'lng';
    setCoordTextById((prev) => ({
      ...prev,
      [locId]: {
        lat: prev[locId]?.lat ?? '',
        lng: prev[locId]?.lng ?? '',
        [field]: text,
      },
    }));
    const n = parseCoordField(text, kind);
    if (n === null) return;
    setSelectedLocations((prev) => prev.map((p) => (p.id === locId ? { ...p, [field]: n } : p)));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <div className="w-3/5">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">SCEPTER Area of Interest</h2>
          <div className="mt-6">
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '500px', width: '100%' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
              />
              <MapClickHandler
                onMapClick={(clickedPoint) => {
                  setSelectedLocations((prev) => {
                    if (prev.length >= MAX_SCEPTER_LOCATIONS) return prev;
                    const nextIndex = prev.length + 1;
                    const stateCode = getStateCodeFromCoords(clickedPoint.lat, clickedPoint.lng) || 'LOC';
                    const label = `${stateCode}_Location_${nextIndex}`;
                    return [
                      ...prev,
                      {
                        id: `loc-${Date.now()}-${nextIndex}`,
                        lat: clickedPoint.lat,
                        lng: clickedPoint.lng,
                        label,
                      },
                    ];
                  });
                }}
              />
              <MapZoomHandler center={mapCenter} zoom={mapZoom} />
              
              {/* Render all USGS sites with color-coded and size-coded markers */}
              {/* {usgsSites.map(site => (
                <Marker 
                  key={site.id}
                  position={[site.latitude, site.longitude]}
                  icon={createCustomIcon(site.markerColor, site.totalAlkalinitySamples || 0)}
                  eventHandlers={{
                    click: () => handleSiteSelect(site.id)
                  }}
                >
                  <Popup>
                    <div>
                      <strong>{site.name}</strong><br />
                      Lat: {site.latitude.toFixed(4)}<br />
                      Lng: {site.longitude.toFixed(4)}<br />
                      {site.totalAlkalinitySamples > 0 && (
                        <>Alkalinity Samples: {site.totalAlkalinitySamples}</>
                      )}
                      {site.alkalinityInfo && site.alkalinityInfo !== 'Loading alkalinity data...' && (
                        <><br />{site.alkalinityInfo}</>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))} */}
              
              {selectedLocations.map((loc) => (
                <Marker key={loc.id} position={{ lat: loc.lat, lng: loc.lng }}>
                  <Popup>
                    <strong>{loc.label}</strong>
                    <br />
                    Lat: {loc.lat.toFixed(4)}
                    <br />
                    Lng: {loc.lng.toFixed(4)}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="w-2/5">
          <h2 className="text-xl font-bold text-center text-gray-800">SCEPTER Model Configuration</h2>
          <Card className="mt-5 rounded-2xl shadow-lg p-6">
            <CardContent className="space-y-6">
              {/* Step 1 / Step 2 navigation (like DRN) */}
              <div className="flex items-stretch mb-6 pb-4 border-b">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  className={`flex-1 px-3 py-1 h-12 text-sm font-medium transition-colors rounded-l-sm border-r h-9 ${
                    currentPage === 1
                      ? 'bg-blue-500 text-white border-blue-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border-gray-300'
                  }`}
                >
                  1. Select Location & Spin-up
                </button>
                <button
                  type="button"
                  onClick={() => canContinueToStep2 && setCurrentPage(2)}
                  disabled={!canContinueToStep2}
                  className={`flex-1 px-3 py-1 h-12 text-sm font-medium transition-colors rounded-r-sm h-9 ${canContinueToStep2
                    ? currentPage === 2
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  2. Set Practice Variables
                </button>
              </div>

              {/* Page 1: Step 1 - Location Selection & Run spin-up */}
              {currentPage === 1 && (
                <>
                  <h4 className="text-md font-semibold mb-4">Select locations on the map, then run spin-up job</h4>
                  

                  {selectedLocations.length === 0 ? (
                    <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-300">
                      <h3 className="text-sm font-semibold text-yellow-800 mb-2">Add locations</h3>
                      <p className="text-sm text-yellow-700">
                        Click the map to add one or more locations.
                      </p>
                    </div>
                  ) : null}

                  {selectedLocations.length > 0 ? (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">Selected locations ({selectedLocations.length}/{MAX_SCEPTER_LOCATIONS})</h3>
                        <Button type="button" variant="outline" size="sm" onClick={clearAllMultipleLocations}>
                          Clear all
                        </Button>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {selectedLocations.map((loc, index) => {
                          const coordText = coordTextById[loc.id] ?? {
                            lat: formatCoordInput(loc.lat),
                            lng: formatCoordInput(loc.lng),
                          };
                          return (
                            <li
                              key={loc.id}
                              className="flex flex-col sm:flex-row sm:items-start gap-3 p-2 bg-white rounded border border-blue-100"
                            >
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="font-semibold text-sm text-gray-900">{loc.label}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="space-y-0.5">
                                    <span className="text-xs text-gray-600">Latitude</span>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      autoComplete="off"
                                      placeholder="e.g. 41.3083"
                                      value={coordText.lat}
                                      onChange={(e) => updateLocationCoordText(loc.id, 'lat', e.target.value)}
                                      className="text-sm font-mono"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-xs text-gray-600">Longitude</span>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      autoComplete="off"
                                      placeholder="e.g. -72.9279"
                                      value={coordText.lng}
                                      onChange={(e) => updateLocationCoordText(loc.id, 'lng', e.target.value)}
                                      className="text-sm font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                              <Button type="button" variant="destructive" size="sm" onClick={() => removeLocationAt(index)}>
                                Remove
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    onClick={handleBaselineSimulation}
                    title="Baseline weathering simulations without rock application"
                    disabled={
                      isSubmittingBaseline || hasActiveBaselineJobs || selectedLocations.length < 1
                    }
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingBaseline
                      ? 'Submitting...'
                      : hasActiveBaselineJobs
                        ? 'Spin-up already submitted'
                        : 'Run spin-up job'}
                  </Button>

                  {(isSubmittingBaseline ||
                    hasActiveBaselineJobs ||
                    baselineStatus ||
                    baselineError ||
                    baselineNotice ||
                    baselineCheckInfo) && (
                    <div className={`flex items-center justify-between gap-3 p-3 rounded-lg text-sm ${baselineStatus === 'completed' ? 'bg-green-100 text-green-700' : baselineStatus === 'running' || baselineStatus === 'submitting' ? 'bg-blue-100 text-blue-700' : baselineStatus === 'failed' ? 'bg-red-100 text-red-700' : baselineStatus === 'pending' || baselineStatus === 'submitted' || baselineStatus === 'queued' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                      <div className="min-w-0">
                        {baselineJobIds.length > 1 ? (
                          <div>
                            <strong>Spin-up jobs:</strong> {baselineJobIds.join(', ')}
                          </div>
                        ) : (
                          baselineJobId && (
                            <div>
                              <strong>Spin-up Job:</strong> {baselineJobId}
                            </div>
                          )
                        )}
                        {baselineBatchId?.trim() ? (
                          <div className="text-xs text-gray-600 mt-1">
                            <strong>Batch id (status):</strong> {baselineBatchId}
                          </div>
                        ) : null}
                        <div>
                          <strong>Status:</strong>{' '}
                          {isSubmittingBaseline && !hasActiveBaselineJobs
                            ? 'submitting'
                            : (baselineStatus || 'idle')}
                        </div>
                        {baselineNotice && <div className="text-xs text-gray-700 mt-1">{baselineNotice}</div>}
                        {baselineCheckInfo && (
                          <div className="text-xs text-gray-600 mt-1 border-t border-gray-200 pt-1">{baselineCheckInfo}</div>
                        )}
                        {baselineError && <div>{baselineError}</div>}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          type="button"
                          onClick={handleCheckBaselineStatus}
                          disabled={isCheckingBaselineStatus || !hasActiveBaselineJobs}
                          className="bg-yellow-500 text-white hover:bg-yellow-600 rounded-md py-1.5 px-3 text-sm disabled:opacity-50"
                        >
                          {isCheckingBaselineStatus ? 'Checking...' : 'Check status'}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            setBaselineJobId(null);
                            setBaselineJobIds([]);
                            setBaselineBatchId('');
                            setBaselineStatus(null);
                            setBaselineError(null);
                            setBaselineNotice(null);
                            setBaselineCheckInfo(null);
                            setSpinupJobId(null);
                            setSpinupStatus(null);
                            setSpinupError(null);
                            setSelectedLocations([]);
                            setMapCenter([39.8283, -98.5795]);
                            setMapZoom(4);
                            localStorage.removeItem('scepter_baseline_job_id');
                            localStorage.removeItem('scepter_baseline_job_ids');
                            localStorage.removeItem('scepter_baseline_batch_id');
                            localStorage.removeItem('scepter_baseline_coordinate');
                            localStorage.removeItem('scepter_spinup_job_id');
                          }}
                          className="bg-red-500 text-white hover:bg-red-600 rounded-md py-1.5 px-3 text-sm"
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  )}

                  {baselineStatus === 'completed' && (
                    <Button
                      type="button"
                      onClick={handleDownloadSpinupResults}
                      disabled={isDownloading}
                      className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDownloading ? (downloadStatus || 'Preparing download...') : 'Download spin-up results'}
                    </Button>
                  )}

                  <Button
                    type="button"
                    onClick={() => setCurrentPage(2)}
                    disabled={!canContinueToStep2}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to Step 2
                  </Button>
                </>
              )}

              {/* Page 2: Step 2 - Set Practice Variables */}
              {currentPage === 2 && (
                <form onSubmit={handleRunModel} className="space-y-6">
                  <h4 className="text-md font-semibold mb-4">Set Practice Variables</h4>
                  <div className="bg-white p-4 rounded-2xl shadow-md">
                    <Label className="block mb-2">Feedstock Type</Label>
                    <select
                      className="w-full border rounded-xl p-2 mb-4"
                      value={feedstock}
                      onChange={(e) => setFeedstock(e.target.value)}
                    >
                      <option value="" disabled>Choose Feedstock</option>
                      <option value="Basalt">Basalt</option>
                      <option value="Olivine">Olivine</option>
                    </select>

                    <Label className="block mb-2">Particle Size</Label>
                    <select
                      className="w-full border rounded-xl p-2 mb-4"
                      value={particleSize}
                      onChange={(e) => setParticleSize(e.target.value)}
                    >
                      <option value="" disabled>Select Particle Size</option>
                      <option value="psdrain_100um.in">100um</option>
                      <option value="psdrain_320um.in">320um</option>
                      <option value="psdrain_1220um.in">1220um</option>
                      <option value="psdrain_3000um.in">3000um</option>
                    </select>

                    <Label className="block mb-2">Application Rate (t/ha/year)</Label>
                    <Input
                      type="number"
                      className="w-full border rounded-xl p-2 mb-4"
                      placeholder="Enter rate"
                      value={applicationRate}
                      onChange={(e) => setApplicationRate(e.target.value)}
                    />

                    <Label className="block mb-2">Target Soil pH (optional)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      className="w-full border rounded-xl p-2"
                      placeholder="Enter target pH"
                      value={targetPH}
                      onChange={(e) => setTargetPH(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Button
                      type="button"
                      onClick={handleSaveModel}
                      disabled={isSaving || !hasAnyLocation}
                      className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-md font-semibold"
                    >
                      {isSaving ? 'Saving...' : savedData ? 'Update Model Configuration' : 'Save Model Configuration'}
                    </Button>
                    <Button
                      type="submit"
                      className="w-full bg-green-500 text-white hover:bg-green-600 rounded-md p-2"
                    >
                      Run SCEPTER Model
                    </Button>

                    {(spinupJobId || spinupStatus) && (
                      <div className="space-y-3">
                        <div className={`flex items-center justify-between gap-3 p-3 rounded-lg text-sm ${spinupStatus === 'completed' ? 'bg-green-100 text-green-700' : spinupStatus === 'running' ? 'bg-blue-100 text-blue-700' : spinupStatus === 'failed' || spinupStatus === 'error' ? 'bg-red-100 text-red-700' : spinupStatus === 'pending' || spinupStatus === 'submitted' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                          <div className="min-w-0">
                            {spinupJobId && <div><strong>SCEPTER Job:</strong> {spinupJobId}</div>}
                            {spinupStatus && <div><strong>Status:</strong> {spinupStatus}</div>}
                            {spinupError && <div>{spinupError}</div>}
                          </div>
                          <Button
                            type="button"
                            onClick={handleCheckSpinupStatus}
                            disabled={!spinupJobId || isCheckingSpinupStatus}
                            className="shrink-0 bg-yellow-500 text-white hover:bg-yellow-600 rounded-md py-1.5 px-3 text-sm disabled:opacity-50"
                          >
                            {isCheckingSpinupStatus ? 'Checking...' : 'Check status'}
                          </Button>
                        </div>
                        {spinupStatus === 'completed' && (
                          <Button
                            type="button"
                            onClick={handleDownloadResults}
                            disabled={isDownloading}
                            className={`w-full py-2 rounded-md font-semibold ${isDownloading ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'}`}
                          >
                            {isDownloading ? (downloadStatus || 'Preparing download...') : 'Download Model Results'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}