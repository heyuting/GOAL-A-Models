import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  formatLocationLimit,
  getLocationLimit,
  hasUnlimitedLocations,
} from '@/config/userTiers';

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
  // Unknown free-form text (especially log lines) should not become a synthetic status token.
  return '';
};

const MODEL_RUN_ACTIVE_STATUSES = new Set(['pending', 'queued', 'submitted', 'submitting', 'running']);
const MODEL_RUN_RETRYABLE_STATUSES = new Set(['failed', 'error', 'cancelled', 'timeout']);

const isModelRunInProgress = (status) =>
  MODEL_RUN_ACTIVE_STATUSES.has(normalizeBaselineStatusToken(String(status || '')));

const isModelRunRetryable = (status) =>
  MODEL_RUN_RETRYABLE_STATUSES.has(normalizeBaselineStatusToken(String(status || '')));

const isModelRunCompleted = (status) =>
  normalizeBaselineStatusToken(String(status || '')) === 'completed';

const formatUsdEstimate = (usd) => {
  if (usd == null || !Number.isFinite(Number(usd))) return null;
  return `$${Number(usd).toFixed(2)}`;
};

const formatDurationFromSeconds = (seconds) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const total = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const extractUsageFromStatusPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const resources = payload.resources;
  const aws = payload.aws_cost_estimate;
  if (!resources && !aws) return null;
  return {
    resources: resources || null,
    aws_cost_estimate: aws || null,
  };
};

const aggregateUsageFromStatusRows = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return null;
  let totalElapsed = 0;
  let totalUsd = 0;
  let maxRss = 0;
  let hasElapsed = false;
  let hasUsd = false;
  let requestedCpus = null;
  let requestedMemGb = null;

  for (const row of rows) {
    const usage = extractUsageFromStatusPayload(row?.result);
    if (!usage) continue;
    const r = usage.resources || {};
    const c = usage.aws_cost_estimate || {};
    if (r.requested_cpus != null) requestedCpus = r.requested_cpus;
    if (r.requested_memory_gb != null) requestedMemGb = r.requested_memory_gb;
    if (r.elapsed_seconds != null) {
      totalElapsed += Number(r.elapsed_seconds);
      hasElapsed = true;
    }
    if (c.usd != null) {
      totalUsd += Number(c.usd);
      hasUsd = true;
    }
    if (r.max_rss_mb != null) {
      maxRss = Math.max(maxRss, Number(r.max_rss_mb));
    }
  }

  if (!hasElapsed && !hasUsd) return null;

  return {
    resources: {
      requested_cpus: requestedCpus,
      requested_memory_gb: requestedMemGb,
      elapsed_seconds: hasElapsed ? totalElapsed : null,
      elapsed: hasElapsed ? formatDurationFromSeconds(totalElapsed) : null,
      max_rss_mb: maxRss || null,
    },
    aws_cost_estimate: hasUsd
      ? {
          instance_type: rows[0]?.result?.aws_cost_estimate?.instance_type || 'm6i.xlarge',
          usd: totalUsd,
          note: 'Sum across locations (parallel AWS jobs would bill concurrently).',
        }
      : null,
  };
};

const JobUsageSummary = ({ usage, label }) => {
  if (!usage?.resources && !usage?.aws_cost_estimate) return null;
  const r = usage.resources || {};
  const aws = usage.aws_cost_estimate || {};
  const elapsedLabel =
    r.elapsed ||
    formatDurationFromSeconds(r.elapsed_seconds) ||
    (r.elapsed_is_estimate ? 'estimating…' : null);

  return (
    <div className="mt-2 pt-2 border-t border-current/20 text-xs space-y-1">
      {label ? <div className="font-semibold">{label}</div> : null}
      <div>
        <span className="font-semibold">Resources:</span>{' '}
        {r.requested_cpus ?? '—'} CPU
        {r.requested_memory_gb != null ? `, ${r.requested_memory_gb} GB requested` : ''}
        {r.max_rss_mb != null ? `, peak ${r.max_rss_mb} MB RAM` : ''}
      </div>
      {elapsedLabel ? (
        <div>
          <span className="font-semibold">Runtime:</span> {elapsedLabel}
          {r.elapsed_is_estimate ? ' (estimated so far)' : ''}
          {r.total_cpu ? ` · CPU time ${r.total_cpu}` : ''}
        </div>
      ) : null}
      {aws.usd != null ? (
        <div>
          <span className="font-semibold">AWS estimate:</span>{' '}
          {formatUsdEstimate(aws.usd)} on {aws.instance_type || 'm6i.xlarge'} on-demand
          {aws.region ? ` (${aws.region})` : ''}
        </div>
      ) : null}
      {aws.note ? <div className="opacity-80">{aws.note}</div> : null}
    </div>
  );
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
  // For per-job status endpoints, treat explicit root `status` as authoritative.
  if (typeof result.status === 'string' && String(result.status).trim() !== '') {
    const rootStatus = normalizeBaselineStatusToken(String(result.status).trim());
    if (rootStatus) return rootStatus;
  }
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

/** GET run-model batch ZIP (whole batch directory). */
const runModelBatchDownloadUrls = (batchId) => {
  const enc = encodeURIComponent(String(batchId).trim());
  return [
    `api/run-scepter-model-batch/${enc}/download`,
    `api/scepter/run-model-batch/${enc}/download`,
  ];
};

const runModelSingleDownloadUrls = (jobId) => {
  const enc = encodeURIComponent(String(jobId).trim());
  return [`api/run-scepter-model/${enc}/download`, `api/scepter/run-model/${enc}/download`];
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

const formatBytes = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return '—';
  if (num < 1024) return `${Math.round(num)} B`;
  if (num < 1024 ** 2) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 ** 3) return `${(num / (1024 ** 2)).toFixed(1)} MB`;
  return `${(num / (1024 ** 3)).toFixed(2)} GB`;
};

const formatEtaSeconds = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) return null;
  if (sec < 5) return 'a few seconds';
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  if (sec < 3600) return `~${Math.ceil(sec / 60)} min`;
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return `~${h}h ${m}m`;
};

/**
 * Read a fetch Response as a Blob while reporting transfer progress.
 * Uses Content-Length when present; otherwise reports bytes received + speed.
 */
const readResponseBlobWithProgress = async (response, onProgress) => {
  const totalHeader =
    response.headers.get('content-length') ||
    response.headers.get('x-content-length') ||
    response.headers.get('x-file-size');
  const totalParsed = totalHeader ? parseInt(totalHeader, 10) : NaN;
  const hasTotal = Number.isFinite(totalParsed) && totalParsed > 0;
  const total = hasTotal ? totalParsed : null;
  const contentType = response.headers.get('content-type') || 'application/zip';

  const emit = (partial) => {
    if (typeof onProgress === 'function') onProgress(partial);
  };

  if (!response.body?.getReader) {
    emit({ phase: 'receiving', loaded: 0, total, percent: null, speed: null, etaSec: null });
    const blob = await response.blob();
    emit({
      phase: 'done',
      loaded: blob.size,
      total: blob.size,
      percent: 100,
      speed: null,
      etaSec: 0,
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  const started = Date.now();
  let lastEmit = 0;

  emit({ phase: 'receiving', loaded: 0, total, percent: hasTotal ? 0 : null, speed: null, etaSec: null });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    const now = Date.now();
    if (now - lastEmit >= 250) {
      lastEmit = now;
      const elapsedSec = Math.max(0.25, (now - started) / 1000);
      const speed = loaded / elapsedSec;
      const percent = hasTotal ? Math.min(99, Math.floor((loaded / total) * 100)) : null;
      const etaSec = hasTotal && speed > 0 ? (total - loaded) / speed : null;
      emit({ phase: 'receiving', loaded, total, percent, speed, etaSec });
    }
  }

  emit({
    phase: 'assembling',
    loaded,
    total: total ?? loaded,
    percent: hasTotal ? 100 : null,
    speed: null,
    etaSec: 0,
  });
  const blob = new Blob(chunks, { type: contentType });
  emit({
    phase: 'done',
    loaded: blob.size,
    total: blob.size,
    percent: 100,
    speed: null,
    etaSec: 0,
  });
  return blob;
};

const formatDownloadProgressMessage = (p, fallback = 'Downloading...') => {
  if (!p) return fallback;
  if (p.phase === 'connecting') return 'Connecting to server…';
  if (p.phase === 'assembling') {
    return `Almost done — preparing file (${formatBytes(p.loaded)})…`;
  }
  if (p.phase === 'saving') return 'Saving file to your computer…';
  if (p.phase === 'done') return 'Download complete!';
  if (p.phase === 'failed') return 'Download failed';

  const sizePart = p.total
    ? `${formatBytes(p.loaded)} / ${formatBytes(p.total)}`
    : `${formatBytes(p.loaded)} received`;
  const pctPart = p.percent != null ? ` · ${p.percent}%` : '';
  const speedPart = p.speed > 0 ? ` · ${formatBytes(p.speed)}/s` : '';
  const etaLabel = formatEtaSeconds(p.etaSec);
  const etaPart = etaLabel ? ` · ${etaLabel} left` : p.total ? '' : ' · large file, please wait';
  return `Downloading ${sizePart}${pctPart}${speedPart}${etaPart}`;
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
      // Keep trying alias URLs; some deployments differ between primary and /api/scepter/* routes.
      continue;
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

/** Run-model batch status: primary + /api/scepter/run-model-batch/ alias. */
const fetchRunScepterModelBatchStatusPair = async (rawBatchId) => {
  const id = String(rawBatchId ?? '').trim();
  if (!id) {
    return {
      response: { ok: false, status: 0 },
      result: null,
      text: 'Empty batch id',
    };
  }
  const paths = [
    `api/run-scepter-model-batch/${encodeURIComponent(id)}/status`,
    `api/scepter/run-model-batch/${encodeURIComponent(id)}/status`,
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
  if (sawAbort && !last) throw new DOMException('Run-model batch status timed out', 'AbortError');
  return last || { response: { ok: false, status: 0 }, result: null, text: '' };
};

/** Baseline batch status: primary + /api/scepter/baseline-simulation-batch/ alias. */
const fetchBaselineBatchStatusPair = async (rawBatchId) => {
  const id = String(rawBatchId ?? '').trim();
  if (!id) {
    return {
      response: { ok: false, status: 0 },
      result: null,
      text: 'Empty baseline batch id',
    };
  }
  const enc = encodeURIComponent(id);
  const paths = [
    `api/baseline-simulation-batch/${enc}/status`,
    `api/scepter/baseline-simulation-batch/${enc}/status`,
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
  if (sawAbort && !last) throw new DOMException('Baseline batch status timed out', 'AbortError');
  return last || { response: { ok: false, status: 0 }, result: null, text: '' };
};

/** True when every row failed with an id-format/not-found style client error. */
const areAllRowsClientIdErrors = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.every((r) => !r?.ok && (r?.statusCode === 400 || r?.statusCode === 404));
};

/**
 * Parse pasted spin-up restore text.
 * Accepts a batch id (baseline_batch_…), one or more job ids, or both.
 */
const parsePastedSpinupRestoreIds = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) {
    return { batchId: '', jobIds: [], errors: ['Paste a spin-up batch id or one or more job ids.'] };
  }

  const tokens = text
    .split(/[\n;]+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return [];
      return trimmed.split(/[\s,]+/);
    })
    .map((t) => t.trim())
    .filter(Boolean);

  let batchId = '';
  const jobIds = [];
  const errors = [];

  for (const token of tokens) {
    const normalizedBatch = normalizeBaselineBatchIdForStatus(token);
    if (/^baseline_batch_\d+$/i.test(normalizedBatch)) {
      if (!batchId) batchId = normalizedBatch;
      else if (batchId !== normalizedBatch) {
        errors.push(`Multiple batch ids found; using ${batchId}.`);
      }
      continue;
    }
    // Keep other tokens as job ids (e.g. baseline_…_0, numeric SLURM ids, path-like names)
    if (/^[A-Za-z0-9._/-]+$/.test(token)) {
      jobIds.push(token);
    } else {
      errors.push(`Ignored invalid token: ${token}`);
    }
  }

  if (!batchId && !jobIds.length) {
    return {
      batchId: '',
      jobIds: [],
      errors: ['Could not parse a batch id or job id. Example: baseline_batch_887986'],
    };
  }

  return { batchId, jobIds: [...new Set(jobIds)], errors };
};

const extractJobIdsFromBaselinePayload = (result) => {
  if (!result || typeof result !== 'object') return [];
  const fromTop = Array.isArray(result.job_ids)
    ? result.job_ids.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  if (fromTop.length) return [...new Set(fromTop)];

  const arrays = [result.jobs, result.results, result.children, result.items].filter(Array.isArray);
  const fromJobs = arrays.flatMap((arr) =>
    arr
      .map((j) =>
        String(
          j?.job_id ??
            j?.baseline_job_id ??
            j?.id ??
            j?.name ??
            ''
        ).trim()
      )
      .filter(Boolean)
  );
  return [...new Set(fromJobs)];
};

const extractLocationsFromBaselinePayload = (result) => {
  if (!result || typeof result !== 'object') return [];

  const candidates = [];

  const pushPair = (latRaw, lngRaw, label, id) => {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    candidates.push({ lat, lng, label, id });
  };

  const pushCoordLike = (c, label, id) => {
    if (c == null) return;
    if (Array.isArray(c) && c.length >= 2) {
      pushPair(c[0], c[1], label, id);
      return;
    }
    if (typeof c === 'object') {
      pushPair(
        c.lat ?? c.latitude ?? c.y,
        c.lng ?? c.lon ?? c.longitude ?? c.x,
        label || c.label || c.name || c.location_name,
        id || c.id || c.job_id
      );
    }
  };

  // Common top-level shapes
  if (Array.isArray(result.locations)) {
    result.locations.forEach((loc, i) => pushCoordLike(loc, loc?.label, loc?.id || `loc-${i}`));
  }
  if (Array.isArray(result.coordinates)) {
    const names = Array.isArray(result.location_names) ? result.location_names : [];
    result.coordinates.forEach((c, i) => pushCoordLike(c, names[i], `coord-${i}`));
  }
  if (Array.isArray(result.coordinate) && result.coordinate.length >= 2 && typeof result.coordinate[0] === 'number') {
    pushCoordLike(result.coordinate, result.location_name || result.name);
  }

  // Nested request / input / params often carry the original submit body
  const nestedBags = [
    result.input,
    result.request,
    result.params,
    result.parameters,
    result.config,
    result.data,
    result.payload,
    result.job,
  ].filter((x) => x && typeof x === 'object');

  for (const bag of nestedBags) {
    if (Array.isArray(bag.locations)) {
      bag.locations.forEach((loc, i) => pushCoordLike(loc, loc?.label, loc?.id || `nested-loc-${i}`));
    }
    if (Array.isArray(bag.coordinates)) {
      const names = Array.isArray(bag.location_names) ? bag.location_names : [];
      bag.coordinates.forEach((c, i) => pushCoordLike(c, names[i], `nested-coord-${i}`));
    }
    if (Array.isArray(bag.coordinate) && bag.coordinate.length >= 2) {
      pushCoordLike(bag.coordinate, bag.location_name || bag.name);
    }
  }

  const jobArrays = [result.jobs, result.results, result.children, result.items, result.tasks]
    .filter(Array.isArray);
  for (const arr of jobArrays) {
    arr.forEach((j, i) => {
      if (!j || typeof j !== 'object') return;
      const label = j.label || j.name || j.location_name || j.job_id || j.id;
      const id = j.job_id || j.id || `job-${i}`;
      pushCoordLike(j, label, id);
      pushCoordLike(j.coordinate, label, id);
      pushCoordLike(j.coordinates, label, id);
      pushCoordLike(j.location, label, id);
      pushCoordLike(j.site, label, id);
      if (j.input) {
        pushCoordLike(j.input, label, id);
        pushCoordLike(j.input.coordinate, label, id);
        if (Array.isArray(j.input.coordinates) && typeof j.input.coordinates[0] === 'number') {
          pushCoordLike(j.input.coordinates, label, id);
        }
      }
      if (j.params || j.parameters) {
        const p = j.params || j.parameters;
        pushCoordLike(p, label, id);
        pushCoordLike(p.coordinate, label, id);
      }
    });
  }

  // Deduplicate by rounded lat/lng
  const seen = new Set();
  const stamp = Date.now();
  return candidates
    .map((loc, i) => {
      const key = `${Number(loc.lat).toFixed(5)},${Number(loc.lng).toFixed(5)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: String(loc.id || `restore-${stamp}-${i}`),
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        label: String(
          loc.label ||
            `${getStateCodeFromCoords(Number(loc.lat), Number(loc.lng)) || 'LOC'}_Location_${i + 1}`
        ),
      };
    })
    .filter(Boolean);
};

/** Try a few batch metadata URLs for location hints (best-effort). */
const fetchBaselineBatchLocationHints = async (rawBatchId) => {
  const id = String(rawBatchId ?? '').trim();
  if (!id) return [];
  const enc = encodeURIComponent(id);
  const paths = [
    `api/baseline-simulation-batch/${enc}`,
    `api/scepter/baseline-simulation-batch/${enc}`,
    `api/baseline-simulation-batch/${enc}/manifest`,
    `api/scepter/baseline-simulation-batch/${enc}/manifest`,
  ];
  const found = [];
  for (const path of paths) {
    try {
      const response = await fetchWithTimeout(
        getApiUrl(path),
        { headers: { 'ngrok-skip-browser-warning': 'true' } },
        20_000
      );
      if (!response.ok) continue;
      const text = await response.text();
      if (!text?.trim()) continue;
      let result = null;
      try {
        result = JSON.parse(text);
      } catch {
        continue;
      }
      const locs = extractLocationsFromBaselinePayload(result);
      if (locs.length) found.push(...locs);
    } catch {
      // ignore optional metadata failures
    }
  }
  // Dedup
  const seen = new Set();
  return found.filter((loc) => {
    const key = `${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/**
 * Parse a pasted list of coordinates. Accepts one pair per line (or semicolon-separated),
 * with lat/lng separated by comma, whitespace, or tab. Optional trailing label after a third token.
 * Returns { pairs: [{ lat, lng, label? }], errors: string[] }.
 */
const parsePastedCoordinateList = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { pairs: [], errors: ['Paste at least one latitude, longitude pair.'] };

  const lines = text
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const pairs = [];
  const errors = [];

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const parts = line.split(/[,|\t]+|\s{2,}|\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Line ${lineNo}: need latitude and longitude (got "${line}").`);
      return;
    }

    let lat = parseCoordField(parts[0], 'lat');
    let lng = parseCoordField(parts[1], 'lng');

    // If first token is out of lat range but looks like a longitude, try lng, lat order
    if ((lat === null || lng === null) && Number.isFinite(Number(parts[0])) && Math.abs(Number(parts[0])) > 90) {
      const latAlt = parseCoordField(parts[1], 'lat');
      const lngAlt = parseCoordField(parts[0], 'lng');
      if (latAlt !== null && lngAlt !== null) {
        lat = latAlt;
        lng = lngAlt;
      }
    }

    if (lat === null || lng === null) {
      errors.push(`Line ${lineNo}: invalid coordinates "${line}". Use lat, lng (e.g. 41.3083, -72.9279).`);
      return;
    }

    const label = parts.slice(2).join(' ').trim() || undefined;
    pairs.push({ lat, lng, label });
  });

  return { pairs, errors };
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

/** Prefer authoritative reverse geocode for state code; fallback to nearest-center heuristic. */
const resolveStateCodeFromCoords = async (lat, lng) => {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const fallback = getStateCodeFromCoords(lat, lng);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url = `https://geo.fcc.gov/api/census/area?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json`;
    const response = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!response.ok) return fallback;
    const result = await response.json();
    const code = result?.results?.[0]?.state_code;
    const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (/^[A-Z]{2}$/.test(normalized)) return normalized;
    return fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
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

const SCEPTER_STORAGE_KEYS = [
  'scepter_baseline_job_id',
  'scepter_baseline_job_ids',
  'scepter_baseline_batch_id',
  'scepter_baseline_coordinate',
  'scepter_baseline_status',
  'scepter_spinup_checkpoint',
  'scepter_practice_vars',
  'scepter_selected_locations_ui',
  'scepter_spinup_job_id',
  'scepter_run_model_batch_id',
  'scepter_model_status',
  'scepter_usgs_locations',
];

const clearScepterPersistedSession = () => {
  try {
    for (const key of SCEPTER_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore localStorage errors
  }
};

export default function SCEPTERConfig({ savedData, freshSession = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const maxLocations = getLocationLimit(user);
  const locationsUnlimited = hasUnlimitedLocations(user);
  const locationLimitLabel = formatLocationLimit(maxLocations);
  const shouldStartFreshSession = freshSession && !savedData;
  const freshSessionPreparedRef = useRef(false);
  if (shouldStartFreshSession && !freshSessionPreparedRef.current) {
    clearScepterPersistedSession();
    freshSessionPreparedRef.current = true;
  }
  const [activeModelId, setActiveModelId] = useState(() => savedData?.id || null);
  /** Last user-chosen saved name — auto-sync must not overwrite this. */
  const [savedModelName, setSavedModelName] = useState(() =>
    savedData?.name && String(savedData.name).trim() ? String(savedData.name).trim() : ''
  );
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
  /** From POST run-model batch response, for batch ZIP download. */
  const [runModelBatchId, setRunModelBatchId] = useState(() => {
    try {
      return localStorage.getItem('scepter_run_model_batch_id') || '';
    } catch {
      return '';
    }
  });
  const [spinupStatus, setSpinupStatus] = useState(null);
  const [spinupError, setSpinupError] = useState(null);
  const [isSubmittingRunModel, setIsSubmittingRunModel] = useState(false);
  const [isCheckingSpinupStatus, setIsCheckingSpinupStatus] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [isDownloadingSpinup, setIsDownloadingSpinup] = useState(false);
  const [modelDownloadStatus, setModelDownloadStatus] = useState('');
  const [spinupDownloadStatus, setSpinupDownloadStatus] = useState('');
  const [modelDownloadPercent, setModelDownloadPercent] = useState(null);
  const [spinupDownloadPercent, setSpinupDownloadPercent] = useState(null);
  const [currentPage, setCurrentPage] = useState(1); // 1 = Add Sites, 2 = Practice Variables & Run Model
  const [activePracticeIndex, setActivePracticeIndex] = useState(0);
  /** { id, lat, lng, label }[] — labels like CT_Location_1 */
  const [selectedLocations, setSelectedLocations] = useState([]);
  /** Per-location practice vars keyed by location id. */
  const [practiceVarsById, setPracticeVarsById] = useState({});
  /** When true, edits in Step 2 apply to every selected site. */
  const [applySamePracticeToAll, setApplySamePracticeToAll] = useState(false);
  /** Per-location coordinate strings for inputs (keyed by loc.id) */
  const [coordTextById, setCoordTextById] = useState({});
  /** Invalidates prior baseline status poll loops so only one chain updates UI. */
  const baselinePollGenerationRef = useRef(0);
  /** Prevent overlapping auto-sync requests for saved models. */
  const isAutoSyncingRunTrackingRef = useRef(false);
  /** Last serialized run-tracking payload synced to backend for this saved model. */
  const lastRunTrackingSnapshotRef = useRef('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [modelName, setModelName] = useState('');
  const [baselineJobUsage, setBaselineJobUsage] = useState(null);
  const [modelRunUsage, setModelRunUsage] = useState(null);
  /** User chose "Select on map" — Option 1 stays light blue until they choose USGS. */
  const [mapSelectMode, setMapSelectMode] = useState(true);
  /** Paste-list UI for Step 1 coordinate bulk add. */
  const [pasteCoordsText, setPasteCoordsText] = useState('');
  const [pasteCoordsFeedback, setPasteCoordsFeedback] = useState(null);
  const [isAddingPastedCoords, setIsAddingPastedCoords] = useState(false);
  const [showPasteCoords, setShowPasteCoords] = useState(false);
  /** Restore completed spin-up from pasted batch/job ids. */
  const [restoreSpinupText, setRestoreSpinupText] = useState('');
  const [restoreSpinupSitesText, setRestoreSpinupSitesText] = useState('');
  const [restoreSpinupFeedback, setRestoreSpinupFeedback] = useState(null);
  const [isRestoringSpinup, setIsRestoringSpinup] = useState(false);
  const [showRestoreSpinup, setShowRestoreSpinup] = useState(false);
  /** After restore, auto-advance to Step 2 once spin-up status becomes completed. */
  const pendingRestoreAdvanceRef = useRef(false);

  const hasAnyLocation = selectedLocations.length > 0;
  const hasAnyRunTrackingId = Boolean(
    String(baselineJobId || '').trim() ||
    baselineJobIds.length > 0 ||
    String(baselineBatchId || '').trim() ||
    String(spinupJobId || '').trim() ||
    String(runModelBatchId || '').trim()
  );

  useEffect(() => {
    setActiveModelId(savedData?.id || null);
    if (savedData?.name && String(savedData.name).trim()) {
      setSavedModelName(String(savedData.name).trim());
    }
  }, [savedData]);

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

  useEffect(() => {
    setPracticeVarsById((prev) => {
      const next = { ...prev };
      const ids = new Set(selectedLocations.map((l) => l.id));
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) delete next[id];
      }
      for (const loc of selectedLocations) {
        if (!next[loc.id]) {
          next[loc.id] = {
            feedstock: feedstock || '',
            particleSize: particleSize || '',
            applicationRate: applicationRate || '',
            targetPH: targetPH || '',
          };
        }
      }
      return next;
    });
  }, [selectedLocations, feedstock, particleSize, applicationRate, targetPH]);

  useEffect(() => {
    if (!selectedLocations.length) {
      setActivePracticeIndex(0);
      return;
    }
    setActivePracticeIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= selectedLocations.length) return selectedLocations.length - 1;
      return prev;
    });
  }, [selectedLocations]);

  useEffect(() => {
    if (savedData) return;

    try {
      const raw = localStorage.getItem('scepter_selected_locations_ui');
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) {
        localStorage.removeItem('scepter_selected_locations_ui');
        return;
      }

      setSelectedLocations((prev) => {
        if (prev.length > 0) return prev;

        return parsed
          .map((loc, i) => {
            const lat = Number(loc.lat);
            const lng = Number(loc.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              id: String(loc.id || `cached-${i}`),
              lat,
              lng,
              label: String(loc.label || `${getStateCodeFromCoords(lat, lng) || 'LOC'}_Location_${i + 1}`),
            };
          })
          .filter(Boolean)
          .slice(0, Number.isFinite(maxLocations) ? maxLocations : undefined);
      });
    } catch (error) {
      console.error('Failed to restore cached SCEPTER locations:', error);
      localStorage.removeItem('scepter_selected_locations_ui');
    }
  }, [savedData, maxLocations]);

  useEffect(() => {
    if (savedData) return;

    try {
      if (selectedLocations.length > 0) {
        localStorage.setItem('scepter_selected_locations_ui', JSON.stringify(selectedLocations));
      } else {
        localStorage.removeItem('scepter_selected_locations_ui');
      }
    } catch {
      // Ignore localStorage write errors
    }
  }, [savedData, selectedLocations]);

  useEffect(() => {
    if (savedData) return;

    try {
      const rawPractice = localStorage.getItem('scepter_practice_vars');
      if (!rawPractice) return;
      const parsed = JSON.parse(rawPractice);
      if (!parsed || typeof parsed !== 'object') return;
      setPracticeVarsById((prev) => (Object.keys(prev).length > 0 ? prev : parsed));
    } catch (error) {
      console.error('Failed to restore cached SCEPTER practice variables:', error);
      localStorage.removeItem('scepter_practice_vars');
    }
  }, [savedData]);

  useEffect(() => {
    if (savedData) return;

    try {
      if (Object.keys(practiceVarsById).length > 0) {
        localStorage.setItem('scepter_practice_vars', JSON.stringify(practiceVarsById));
      }
    } catch {
      // Ignore localStorage write errors
    }
  }, [savedData, practiceVarsById]);

  useEffect(() => {
    if (savedData) return;
    try {
      if (baselineStatus) {
        localStorage.setItem('scepter_baseline_status', String(baselineStatus));
      } else {
        localStorage.removeItem('scepter_baseline_status');
      }
    } catch {
      // Ignore localStorage write errors
    }
  }, [savedData, baselineStatus]);

  useEffect(() => {
    if (savedData) return;
    if (normalizeBaselineStatusToken(String(baselineStatus || '')) !== 'completed') return;
    if (!baselineJobId?.trim() && baselineJobIds.length === 0) return;

    try {
      localStorage.setItem(
        'scepter_spinup_checkpoint',
        JSON.stringify({
          baselineJobId: baselineJobId || baselineJobIds[0] || null,
          baselineJobIds,
          baselineBatchId: baselineBatchId || '',
          baselineStatus: 'completed',
          completedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore localStorage write errors
    }
  }, [savedData, baselineStatus, baselineJobId, baselineJobIds, baselineBatchId]);

  useEffect(() => {
    if (savedData) return;
    try {
      if (spinupStatus) {
        localStorage.setItem('scepter_model_status', String(spinupStatus));
      } else {
        localStorage.removeItem('scepter_model_status');
      }
    } catch {
      // Ignore localStorage write errors
    }
  }, [savedData, spinupStatus]);

  useEffect(() => {
    if (savedData) return;

    try {
      const raw = localStorage.getItem('scepter_usgs_locations');
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) {
        localStorage.removeItem('scepter_usgs_locations');
        return;
      }

      const incomingLocations = parsed
        .map((loc, i) => {
          const lat = Number(loc.lat);
          const lng = Number(loc.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            id: String(loc.id || `usgs-${i}`),
            lat,
            lng,
            label: String(loc.label || `USGS_${loc.id || i + 1}`),
          };
        })
        .filter(Boolean);

      if (!incomingLocations.length) {
        localStorage.removeItem('scepter_usgs_locations');
        return;
      }

      setSelectedLocations((prev) => {
        const merged = [...prev];
        for (const loc of incomingLocations) {
          const existingIndex = merged.findIndex((item) => item.id === loc.id);
          if (existingIndex >= 0) {
            merged[existingIndex] = { ...merged[existingIndex], ...loc };
          } else if (!Number.isFinite(maxLocations) || merged.length < maxLocations) {
            merged.push(loc);
          }
        }
        return merged;
      });

      const first = incomingLocations[0];
      setMapCenter([first.lat, first.lng]);
      setMapZoom(8);
      setCurrentPage(1);
      localStorage.removeItem('scepter_usgs_locations');
    } catch (error) {
      console.error('Failed to load USGS locations for SCEPTER:', error);
      localStorage.removeItem('scepter_usgs_locations');
    }
  }, [savedData, maxLocations]);

  // Load saved data when component mounts or savedData changes
  useEffect(() => {
    if (savedData) {
      // Load saved model parameters
      const params = savedData.parameters || {};
      setFeedstock(params.feedstock || '');
      setParticleSize(params.particleSize || '');
      setApplicationRate(params.applicationRate || '');
      setTargetPH(params.targetPH || '');
      if (params.practiceVarsByLocation && typeof params.practiceVarsByLocation === 'object') {
        setPracticeVarsById(params.practiceVarsByLocation);
      }
      if (params.runTracking && typeof params.runTracking === 'object') {
        const rt = params.runTracking;
        const savedBaselineJobIds = Array.isArray(rt.baselineJobIds)
          ? rt.baselineJobIds.map((id) => String(id || '').trim()).filter(Boolean)
          : [];
        const savedBaselineJobId = String(rt.baselineJobId || '').trim();
        const savedBaselineBatchId = normalizeBaselineBatchIdForStatus(rt.baselineBatchId || '') || '';
        const savedBaselineStatus = rt.baselineStatus ? String(rt.baselineStatus) : null;
        const savedModelJobId = String(rt.modelJobId || '').trim();
        const savedModelBatchId = String(rt.modelBatchId || '').trim();
        const savedModelStatus = rt.modelStatus ? String(rt.modelStatus) : null;

        setBaselineJobIds(savedBaselineJobIds);
        setBaselineJobId(savedBaselineJobId || savedBaselineJobIds[0] || null);
        setBaselineBatchId(savedBaselineBatchId);
        const hasBaselineTrackingIds = Boolean(savedBaselineJobId || savedBaselineJobIds.length || savedBaselineBatchId);
        setBaselineStatus(hasBaselineTrackingIds ? savedBaselineStatus : null);
        setSpinupJobId(savedModelJobId || null);
        setRunModelBatchId(savedModelBatchId);
        setSpinupStatus(savedModelStatus);
        lastRunTrackingSnapshotRef.current = JSON.stringify({
          baselineJobId: savedBaselineJobId || savedBaselineJobIds[0] || null,
          baselineJobIds: savedBaselineJobIds,
          baselineBatchId: savedBaselineBatchId || '',
          baselineStatus: savedBaselineStatus || null,
          modelJobId: savedModelJobId || null,
          modelBatchId: savedModelBatchId || '',
          modelStatus: savedModelStatus || null,
        });

        try {
          if (savedBaselineJobId) localStorage.setItem('scepter_baseline_job_id', savedBaselineJobId);
          if (savedBaselineJobIds.length) localStorage.setItem('scepter_baseline_job_ids', JSON.stringify(savedBaselineJobIds));
          if (savedBaselineBatchId) localStorage.setItem('scepter_baseline_batch_id', savedBaselineBatchId);
          if (savedModelJobId) localStorage.setItem('scepter_spinup_job_id', savedModelJobId);
          if (savedModelBatchId) localStorage.setItem('scepter_run_model_batch_id', savedModelBatchId);
        } catch {
          // ignore localStorage write errors
        }
      }
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

  const getPracticeVarsForLocation = (locId) => {
    const row = practiceVarsById?.[locId] || {};
    return {
      feedstock: row.feedstock ?? feedstock ?? '',
      particleSize: row.particleSize ?? particleSize ?? '',
      applicationRate: row.applicationRate ?? applicationRate ?? '',
      targetPH: row.targetPH ?? targetPH ?? '',
    };
  };

  const updatePracticeVarForLocation = (locId, key, value) => {
    setPracticeVarsById((prev) => {
      if (applySamePracticeToAll && selectedLocations.length > 0) {
        const next = { ...prev };
        for (const loc of selectedLocations) {
          next[loc.id] = {
            ...(next[loc.id] || {}),
            [key]: value,
          };
        }
        return next;
      }
      return {
        ...prev,
        [locId]: {
          ...(prev[locId] || {}),
          [key]: value,
        },
      };
    });
  };

  /** Copy the active site's practice vars onto every selected location. */
  const applyCurrentPracticeVarsToAllSites = () => {
    if (selectedLocations.length < 2) return;
    const source = selectedLocations[activePracticeIndex] || selectedLocations[0];
    if (!source) return;
    const vars = getPracticeVarsForLocation(source.id);
    setPracticeVarsById((prev) => {
      const next = { ...prev };
      for (const loc of selectedLocations) {
        next[loc.id] = {
          ...(next[loc.id] || {}),
          feedstock: vars.feedstock,
          particleSize: vars.particleSize,
          applicationRate: vars.applicationRate,
          targetPH: vars.targetPH,
        };
      }
      return next;
    });
    setApplySamePracticeToAll(true);
  };

  const focusPracticeLocationOnMap = (loc) => {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
    setMapCenter([loc.lat, loc.lng]);
    setMapZoom((z) => (z < 2 ? 2 : z));
  };

  /** Clear model-run job/status and persisted run IDs (localStorage). */
  const resetStep2ModelRun = () => {
    setSpinupJobId(null);
    setRunModelBatchId('');
    setSpinupStatus(null);
    setSpinupError(null);
    setIsSubmittingRunModel(false);
    setIsCheckingSpinupStatus(false);
    setIsDownloadingModel(false);
    setModelDownloadStatus('');
    setSpinupDownloadStatus('');
    setModelDownloadPercent(null);
    setSpinupDownloadPercent(null);
    setModelRunUsage(null);
    try {
      localStorage.removeItem('scepter_spinup_job_id');
      localStorage.removeItem('scepter_run_model_batch_id');
      localStorage.removeItem('scepter_model_status');
    } catch {
      // ignore
    }
  };

  /** Full reset: spin-up + model run state, locations, practice vars, map, and SCEPTER localStorage keys. */
  const resetAllScepterSession = () => {
    baselinePollGenerationRef.current += 1;

    resetStep2ModelRun();
    setIsDownloadingSpinup(false);
    setBaselineJobUsage(null);

    setBaselineJobId(null);
    setBaselineJobIds([]);
    setBaselineBatchId('');
    setBaselineStatus(null);
    setBaselineError(null);
    setBaselineNotice(null);
    setBaselineCheckInfo(null);
    setIsSubmittingBaseline(false);
    setIsCheckingBaselineStatus(false);

    setFeedstock('');
    setParticleSize('');
    setApplicationRate('');
    setTargetPH('');
    setSelectedSite(null);
    setPracticeVarsById({});
    setCoordTextById({});
    setSelectedLocations([]);
    setActivePracticeIndex(0);
    setApplySamePracticeToAll(false);
    setSavedModelName('');
    setMapCenter([39.8283, -98.5795]);
    setMapZoom(4);
    setMapSelectMode(true);
    setCurrentPage(1);
    pendingRestoreAdvanceRef.current = false;

    try {
      clearScepterPersistedSession();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!shouldStartFreshSession) return;
    resetAllScepterSession();
    setActiveModelId(null);
    lastRunTrackingSnapshotRef.current = '';
    setSavedModelName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldStartFreshSession]);

  const spinupIsCompleted =
    normalizeBaselineStatusToken(String(baselineStatus || '')) === 'completed';
  const modelRunInProgress = isModelRunInProgress(spinupStatus);
  const modelRunFailed = isModelRunRetryable(spinupStatus);
  const modelRunCompleted = isModelRunCompleted(spinupStatus);
  const hasModelRunIds = Boolean(
    String(spinupJobId || '').trim() || String(runModelBatchId || '').trim()
  );
  /** After spin-up finishes, allow a fresh model submit even if a prior attempt is stuck/lost. */
  const needsModelRunResubmit =
    hasModelRunIds || modelRunInProgress || modelRunFailed || Boolean(String(spinupStatus || '').trim());
  const canSubmitModelRun =
    spinupIsCompleted &&
    !isSubmittingRunModel &&
    !modelRunCompleted;

  const handleRunModel = async (e, options = {}) => {
    const { skipBaselineCheck = false, forceRetry = false } = options;
    e.preventDefault();
    if (isSubmittingRunModel) return;

    if (!skipBaselineCheck) {
      const hasSpinupId = Boolean(
        String(baselineJobId || '').trim() ||
        String(baselineBatchId || '').trim() ||
        baselineJobIds.length > 0
      );
      if (!hasSpinupId || baselineStatus !== 'completed') {
        setSpinupError(
          'Spin-up must be completed before running the SCEPTER model. Run spin-up, or restore a completed spin-up ID.'
        );
        return;
      }
    }

    if (!forceRetry) {
      const hasActiveRunAlready =
        isModelRunInProgress(spinupStatus) ||
        isModelRunCompleted(spinupStatus) ||
        (hasModelRunIds && !isModelRunRetryable(spinupStatus));
      if (hasActiveRunAlready) {
        setSpinupError(
          isModelRunCompleted(spinupStatus)
            ? 'Model run already completed. Use Reset to start over, or Resubmit Model Run if you need another attempt.'
            : 'A model run was already submitted. Use Resubmit Model Run to clear the stuck attempt and submit again (spin-up is kept).'
        );
        return;
      }
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

    const practiceRows = selectedLocations.map((loc, i) => {
      const vars = getPracticeVarsForLocation(loc.id);
      const particleSizeNum = particleSizeToNumber(vars.particleSize);
      const applicationRateNum = vars.applicationRate ? parseFloat(vars.applicationRate) : null;
      const phNum = vars.targetPH && String(vars.targetPH).trim() !== '' ? parseFloat(vars.targetPH) : null;
      return {
        index: i,
        loc,
        vars,
        particleSizeNum,
        applicationRateNum,
        phNum,
      };
    });
    const invalidRow = practiceRows.find(
      (r) =>
        !r.vars.feedstock ||
        r.particleSizeNum == null ||
        r.applicationRateNum == null ||
        !Number.isFinite(r.applicationRateNum) ||
        r.applicationRateNum <= 0
    );
    if (invalidRow) {
      setSpinupError(
        `Set feedstock, particle size, and a positive application rate for ${invalidRow.loc.label || `location ${invalidRow.index + 1}`}.`
      );
      return;
    }
    const invalidPhRow = practiceRows.find(
      (r) => r.vars.targetPH && String(r.vars.targetPH).trim() !== '' && !Number.isFinite(r.phNum)
    );
    if (invalidPhRow) {
      setSpinupError(`Target soil pH must be a number for ${invalidPhRow.loc.label || `location ${invalidPhRow.index + 1}`}.`);
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
      const locations = practiceRows.map((rowData, i) => {
        const { loc, vars, particleSizeNum, applicationRateNum, phNum } = rowData;
        const locLabel = (loc.label || '').trim().replace(/\s+/g, '_') || `loc_${i}`;
        const row = {
          spinup_name: spinupNameForRow(i),
          restart_name: `restart_${locLabel}_${ts}_${i}`,
          feedstock: vars.feedstock,
          feedstock_type: vars.feedstock,
          particle_size: particleSizeNum,
          application_rate: applicationRateNum,
        };
        if (hasBatchIdForRun) row.spinup_batch_id = batchIdForRun;
        if (Number.isFinite(phNum)) row.target_pH = phNum;
        return row;
      });
      body = { locations };
    } else {
      const first = practiceRows[0];
      body = {
        spinup_name: defaultSpinupName,
        restart_name: restartName,
        feedstock: first.vars.feedstock,
        feedstock_type: first.vars.feedstock,
        particle_size: first.particleSizeNum,
        application_rate: first.applicationRateNum,
        coordinates,
        location_names,
      };
      if (hasBatchIdForRun) body.spinup_batch_id = batchIdForRun;
      if (Number.isFinite(first.phNum)) body.target_pH = first.phNum;
    }

    setSpinupError(null);
    setSpinupStatus('submitting');
    setIsSubmittingRunModel(true);
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
      const rawRunBatch =
        result?.batch_id ?? result?.batchId ?? result?.data?.batch_id ?? null;
      const runBatchNorm = rawRunBatch != null ? String(rawRunBatch).trim() : '';
      if (runBatchNorm) {
        setRunModelBatchId(runBatchNorm);
        try {
          localStorage.setItem('scepter_run_model_batch_id', runBatchNorm);
        } catch {
          // ignore
        }
      } else {
        setRunModelBatchId('');
        try {
          localStorage.removeItem('scepter_run_model_batch_id');
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error('SCEPTER run error:', err);
      setSpinupError(err.message || 'Failed to run SCEPTER model. Please try again.');
    } finally {
      setIsSubmittingRunModel(false);
    }
  };

  const handleRetryModelRun = async (e) => {
    e.preventDefault();
    if (!spinupIsCompleted || isSubmittingRunModel || modelRunCompleted) return;

    if (modelRunInProgress || hasModelRunIds) {
      const confirmed = window.confirm(
        'Resubmit the model run using your completed spin-up?\n\n' +
          'Use this if the previous model submission was lost or stuck (for example after a connection issue). ' +
          'This clears the previous model-run tracking and submits a new model run. Spin-up results are kept.'
      );
      if (!confirmed) return;
    }

    resetStep2ModelRun();
    await handleRunModel(e, { skipBaselineCheck: true, forceRetry: true });
  };

  /**
   * Restore a completed HPC spin-up into this session from a pasted batch/job id,
   * so the user can continue to model run / save without re-running spin-up.
   */
  const handleRestoreSpinupFromIds = async ({ forceCompleted = false } = {}) => {
    setRestoreSpinupFeedback(null);
    const { batchId, jobIds: pastedJobIds, errors } = parsePastedSpinupRestoreIds(restoreSpinupText);
    if (!batchId && !pastedJobIds.length) {
      setRestoreSpinupFeedback({
        type: 'error',
        message: errors[0] || 'Paste a spin-up batch id or job id.',
      });
      return;
    }

    setIsRestoringSpinup(true);
    try {
      let resolvedBatchId = batchId;
      let resolvedJobIds = [...pastedJobIds];
      let status = forceCompleted ? 'completed' : '';
      let statusError = null;
      let restoredLocations = [];
      let usage = null;

      // Optional pasted sites (most reliable for practice-variable setup)
      if (restoreSpinupSitesText.trim()) {
        const { pairs, errors: siteErrors } = parsePastedCoordinateList(restoreSpinupSitesText);
        if (pairs.length) {
          const stamp = Date.now();
          restoredLocations = pairs.map((p, i) => ({
            id: `restore-paste-${stamp}-${i}`,
            lat: p.lat,
            lng: p.lng,
            label:
              p.label ||
              `${getStateCodeFromCoords(p.lat, p.lng) || 'LOC'}_Location_${i + 1}`,
          }));
        } else if (siteErrors.length) {
          setRestoreSpinupFeedback({
            type: 'error',
            message: `Could not parse site coordinates: ${siteErrors[0]}`,
          });
          return;
        }
      }

      if (resolvedBatchId) {
        try {
          const { response, result, text } = await fetchBaselineBatchStatusPair(resolvedBatchId);
          if (response.ok && result) {
            const fromPayload = extractJobIdsFromBaselinePayload(result);
            if (fromPayload.length) {
              resolvedJobIds = [...new Set([...resolvedJobIds, ...fromPayload])];
            }
            if (!restoredLocations.length) {
              restoredLocations = extractLocationsFromBaselinePayload(result);
            }
            status =
              extractStatusFromBaselinePayload(result) ||
              (result?.status != null ? normalizeBaselineStatusToken(String(result.status)) : '') ||
              status;
            statusError = result?.error || null;
            usage = extractUsageFromStatusPayload(result);
          } else if (!forceCompleted) {
            const msg =
              result?.error || result?.message || text || `Batch status check failed (${response.status})`;
            statusError = msg;
          }
        } catch (err) {
          if (!forceCompleted) {
            statusError = err?.message || 'Batch status check failed.';
          }
        }

        if (!restoredLocations.length) {
          try {
            const hinted = await fetchBaselineBatchLocationHints(resolvedBatchId);
            if (hinted.length) restoredLocations = hinted;
          } catch {
            // optional
          }
        }
      }

      if (resolvedJobIds.length) {
        try {
          const rows = await Promise.all(resolvedJobIds.map((id) => fetchBaselineSpinupStatusRow(id)));
          const usable = rows.filter((r) => r?.ok);
          if (usable.length) {
            const merged = mergeBaselineStatusRows(rows);
            if (!forceCompleted) {
              status = merged.status || status;
              statusError = merged.error || statusError;
            }
            usage = aggregateUsageFromStatusRows(rows) || usage;
            if (!restoredLocations.length) {
              const fromJobs = [];
              for (const row of usable) {
                const locs = extractLocationsFromBaselinePayload(baselineStatusRowPayload(row));
                if (locs.length) fromJobs.push(...locs);
              }
              if (fromJobs.length) restoredLocations = fromJobs;
            }
            const fromRows = rows.flatMap((r) => extractJobIdsFromBaselinePayload(baselineStatusRowPayload(r)));
            if (fromRows.length) {
              resolvedJobIds = [...new Set([...resolvedJobIds, ...fromRows])];
            }
          } else if (!forceCompleted && !status) {
            statusError =
              statusError ||
              'Could not verify job status. If spin-up finished on HPC, use “Restore as completed”.';
          }
        } catch (err) {
          if (!forceCompleted && !statusError) {
            statusError = err?.message || 'Job status check failed.';
          }
        }
      }

      // Fall back to browser-cached sites from the original spin-up session, if still present
      if (!restoredLocations.length) {
        try {
          const cachedRaw = localStorage.getItem('scepter_baseline_coordinate');
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (Array.isArray(parsed?.locations) && parsed.locations.length) {
              restoredLocations = parsed.locations
                .map((loc, i) => {
                  const lat = Number(loc.lat);
                  const lng = Number(loc.lng);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                  return {
                    id: String(loc.id || `cached-${i}`),
                    lat,
                    lng,
                    label: String(
                      loc.label ||
                        `${getStateCodeFromCoords(lat, lng) || 'LOC'}_Location_${i + 1}`
                    ),
                  };
                })
                .filter(Boolean);
            } else if (Array.isArray(parsed?.coordinate) && parsed.coordinate.length >= 2) {
              const [lat, lng] = parsed.coordinate.map(Number);
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                restoredLocations = [
                  {
                    id: 'cached-single',
                    lat,
                    lng,
                    label:
                      parsed.locationName ||
                      `${getStateCodeFromCoords(lat, lng) || 'LOC'}_Location_1`,
                  },
                ];
              }
            }
          }
          if (!restoredLocations.length) {
            const uiRaw = localStorage.getItem('scepter_selected_locations_ui');
            if (uiRaw) {
              const parsed = JSON.parse(uiRaw);
              if (Array.isArray(parsed) && parsed.length) {
                restoredLocations = parsed
                  .map((loc, i) => {
                    const lat = Number(loc.lat);
                    const lng = Number(loc.lng);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                    return {
                      id: String(loc.id || `ui-${i}`),
                      lat,
                      lng,
                      label: String(loc.label || `Location_${i + 1}`),
                    };
                  })
                  .filter(Boolean);
              }
            }
          }
        } catch {
          // ignore cache parse errors
        }
      }

      if (forceCompleted) {
        status = 'completed';
        statusError = null;
      }

      if (!resolvedJobIds.length && resolvedBatchId) {
        resolvedJobIds = [];
      }

      const primaryJobId = resolvedJobIds[0] || resolvedBatchId || null;
      setBaselineBatchId(resolvedBatchId || '');
      setBaselineJobIds(resolvedJobIds);
      setBaselineJobId(primaryJobId);
      setBaselineStatus(status || (forceCompleted ? 'completed' : 'unknown'));
      setBaselineError(statusError);
      setBaselineNotice(
        forceCompleted
          ? 'Restored spin-up IDs and marked completed (skipped strict status verification).'
          : `Restored spin-up tracking from pasted id${resolvedBatchId ? ` (${resolvedBatchId})` : ''}.`
      );
      setBaselineCheckInfo(null);
      if (usage) setBaselineJobUsage(usage);
      resetStep2ModelRun();

      let locationNote = '';
      let appliedLocations = [];
      if (restoredLocations.length) {
        const capped = Number.isFinite(maxLocations)
          ? restoredLocations.slice(0, maxLocations)
          : restoredLocations;
        appliedLocations = capped.map((loc, i) => ({
          ...loc,
          label:
            loc.label ||
            `${getStateCodeFromCoords(loc.lat, loc.lng) || 'LOC'}_Location_${i + 1}`,
        }));
        setSelectedLocations(appliedLocations);
        setActivePracticeIndex(0);
        if (appliedLocations[0]) {
          setMapCenter([appliedLocations[0].lat, appliedLocations[0].lng]);
          setMapZoom(8);
        }
        locationNote = ` Restored ${appliedLocations.length} site(s) for practice variables.`;
        try {
          localStorage.setItem(
            'scepter_baseline_coordinate',
            JSON.stringify({
              mode: appliedLocations.length > 1 ? 'multiple' : 'single',
              coordinates: appliedLocations.map((l) => [l.lat, l.lng]),
              coordinate: [appliedLocations[0].lat, appliedLocations[0].lng],
              locations: appliedLocations,
              restored: true,
            })
          );
          localStorage.setItem('scepter_selected_locations_ui', JSON.stringify(appliedLocations));
        } catch {
          // ignore
        }
      } else {
        locationNote =
          ' No sites were found on the server response. Paste the same site coordinates in the restore box (or Step 1) so you can set practice variables.';
      }

      try {
        if (resolvedBatchId) localStorage.setItem('scepter_baseline_batch_id', resolvedBatchId);
        else localStorage.removeItem('scepter_baseline_batch_id');
        if (primaryJobId) localStorage.setItem('scepter_baseline_job_id', String(primaryJobId));
        else localStorage.removeItem('scepter_baseline_job_id');
        if (resolvedJobIds.length) {
          localStorage.setItem('scepter_baseline_job_ids', JSON.stringify(resolvedJobIds));
        } else {
          localStorage.removeItem('scepter_baseline_job_ids');
        }
        if ((status || '') === 'completed' || forceCompleted) {
          localStorage.setItem('scepter_baseline_status', 'completed');
          localStorage.setItem(
            'scepter_spinup_checkpoint',
            JSON.stringify({
              baselineJobId: primaryJobId,
              baselineJobIds: resolvedJobIds,
              baselineBatchId: resolvedBatchId || '',
              baselineStatus: 'completed',
              completedAt: new Date().toISOString(),
              restored: true,
            })
          );
        }
      } catch {
        // ignore localStorage errors
      }

      const completed =
        normalizeBaselineStatusToken(String(status || '')) === 'completed' || forceCompleted;
      const hasSitesNow = appliedLocations.length > 0 || selectedLocations.length > 0;
      const parts = [
        completed
          ? 'Spin-up restored as completed.'
          : `Spin-up IDs restored (status: ${status || 'unknown'}). When status is completed, you’ll move to Step 2 automatically — or use “Restore as completed”.`,
      ];
      if (resolvedJobIds.length) parts.push(`${resolvedJobIds.length} job id(s).`);
      if (errors.length) parts.push(errors.join(' '));
      parts.push(locationNote);
      if (completed && hasSitesNow) {
        parts.push(' Moving to Step 2 so you can set practice variables and run the model.');
      } else if (completed && !hasSitesNow) {
        parts.push(' Add site coordinates in the restore panel, then restore again.');
      }

      setRestoreSpinupFeedback({
        type: completed ? (hasSitesNow ? 'success' : 'warn') : statusError ? 'warn' : 'success',
        message: parts.join(' ').trim(),
      });
      if (completed && hasSitesNow) {
        pendingRestoreAdvanceRef.current = false;
        setCurrentPage(2);
      } else if (completed && !hasSitesNow) {
        pendingRestoreAdvanceRef.current = false;
        setCurrentPage(1);
        setShowRestoreSpinup(true);
      } else {
        pendingRestoreAdvanceRef.current = true;
      }
    } finally {
      setIsRestoringSpinup(false);
    }
  };

  useEffect(() => {
    if (!pendingRestoreAdvanceRef.current) return;
    if (normalizeBaselineStatusToken(String(baselineStatus || '')) !== 'completed') return;
    if (selectedLocations.length < 1) return;
    pendingRestoreAdvanceRef.current = false;
    setCurrentPage(2);
    setRestoreSpinupFeedback({
      type: 'success',
      message: 'Spin-up status is completed and sites are ready. Moved to Step 2 for practice variables and model run.',
    });
  }, [baselineStatus, selectedLocations.length]);

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
  const hasSubmittedSpinup =
    hasActiveBaselineJobs ||
    !!String(baselineBatchId || '').trim() ||
    ['pending', 'queued', 'submitted', 'submitting', 'running', 'completed'].includes(
      normalizeBaselineStatusToken(String(baselineStatus || ''))
    );

  useEffect(() => {
    if (!hasActiveBaselineJobs || baselineStatus) return;
    const ids = baselineJobIds.length
      ? baselineJobIds
      : (baselineJobId ? [baselineJobId] : []);
    if (!ids.length) return;
    try {
      const savedStatus = localStorage.getItem('scepter_baseline_status');
      if (savedStatus) {
        const normalized = normalizeBaselineStatusToken(savedStatus);
        setBaselineStatus(normalized || savedStatus);
        if (normalized !== 'completed') {
          pollBaselineBatchStatus(ids);
        }
        return;
      }
    } catch {
      // Ignore invalid cached baseline status
    }
    // Restore visible baseline status after refresh before the first manual check.
    setBaselineStatus('submitted');
    pollBaselineBatchStatus(ids);
  }, [hasActiveBaselineJobs, baselineStatus, baselineJobIds, baselineJobId, pollBaselineBatchStatus]);

  useEffect(() => {
    const jobId = String(spinupJobId || '').trim();
    const batchId = String(runModelBatchId || '').trim();
    if (!jobId && !batchId) return;
    if (spinupStatus) return;
    try {
      const savedStatus = localStorage.getItem('scepter_model_status');
      if (savedStatus) {
        setSpinupStatus(normalizeBaselineStatusToken(savedStatus) || savedStatus);
        return;
      }
    } catch {
      // Ignore invalid cached model status
    }
    // Restore visible model status after refresh before the first manual check.
    setSpinupStatus('submitted');
  }, [spinupJobId, runModelBatchId, spinupStatus]);

  const handleBaselineSimulation = async () => {
    // Prevent duplicate submissions for the same spin-up request.
    if (isSubmittingBaseline || hasSubmittedSpinup) {
      return {
        ok: false,
        reason: 'already_submitted',
        jobIds: baselineJobIds.length ? baselineJobIds : (baselineJobId ? [baselineJobId] : []),
      };
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
      return { ok: false, reason: 'no_locations', jobIds: [] };
    }
    for (const l of selectedLocations) {
      if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) {
        setBaselineError('Enter valid latitude and longitude for every location (see coordinate fields).');
        setIsSubmittingBaseline(false);
        return { ok: false, reason: 'invalid_coordinates', jobIds: [] };
      }
      if (l.lat < -90 || l.lat > 90 || l.lng < -180 || l.lng > 180) {
        setBaselineError('Latitude must be between -90 and 90; longitude between -180 and 180.');
        setIsSubmittingBaseline(false);
        return { ok: false, reason: 'invalid_coordinates', jobIds: [] };
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
        return { ok: false, reason: 'request_failed', jobIds: [] };
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
          return { ok: true, reason: 'submitted', jobIds };
        }
        setBaselineError(
          result?.error ||
            result?.message ||
            'No job id found in response (expected job_id, batch_job_id, baseline_job_id, id, or job_ids).'
        );
        setBaselineStatus('failed');
        return { ok: false, reason: 'missing_job_id', jobIds: [] };
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
      return { ok: true, reason: 'submitted', jobIds: [jobId] };
    } catch (err) {
      console.error('Baseline simulation error:', err);
      setBaselineError(err.message);
      setBaselineStatus('failed');
      return { ok: false, reason: 'request_failed', jobIds: [] };
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
    const batchId = String(baselineBatchId || '').trim();
    setIsCheckingBaselineStatus(true);
    setBaselineError(null);
    const checkedAt = new Date().toLocaleTimeString();
    try {
      if (!ids.length && batchId) {
        const { response, result, text } = await fetchBaselineBatchStatusPair(batchId);
        if (!response.ok) {
          const msg =
            result?.error || result?.message || text || `Baseline batch status check failed (${response.status})`;
          setBaselineError(msg);
          setBaselineCheckInfo(`Checked ${checkedAt}: baseline batch status request failed.`);
          return;
        }
        const status =
          extractStatusFromBaselinePayload(result) ||
          (result?.status != null ? normalizeBaselineStatusToken(String(result.status)) : '') ||
          'unknown';
        setBaselineStatus(status);
        setBaselineError(result?.error || null);
        setBaselineCheckInfo(`Checked ${checkedAt}: ${status}${result?.error ? ` — ${result.error}` : ''}.`);
        return;
      }
      if (!ids.length) {
        setBaselineStatus(null);
        setBaselineError('No spin-up tracking IDs were saved for this model. Run spin-up again (or re-save after run starts).');
        return;
      }
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
      setBaselineJobUsage(aggregateUsageFromStatusRows(rows));
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
    const batchId = String(runModelBatchId ?? '').trim();
    if (!jobId && !batchId) {
      setSpinupError('No SCEPTER job/batch ID. Run the SCEPTER model first.');
      return;
    }
    setIsCheckingSpinupStatus(true);
    setSpinupError(null);
    try {
      const { response, result, text } = batchId
        ? await fetchRunScepterModelBatchStatusPair(batchId)
        : await fetchRunScepterModelStatusPair(jobId);
      if (!response.ok) {
        const msg =
          result?.error || result?.message || text || `Status check failed (${response.status})`;
        setSpinupError(msg);
        const failedStatus = normalizeBaselineStatusToken(String(result?.status || ''));
        setSpinupStatus(failedStatus || 'error');
        setModelRunUsage(extractUsageFromStatusPayload(result));
        return;
      }
      const parsed = extractRunScepterModelStatusFromPayload(result);
      const status =
        parsed ||
        (result?.status != null ? normalizeBaselineStatusToken(String(result.status)) : '') ||
        'unknown';
      setSpinupStatus(status);
      setSpinupError(result?.error || null);
      if (batchId && result?.usage_summary) {
        setModelRunUsage({
          resources: {
            requested_cpus: 4,
            requested_memory_gb: 16,
            elapsed_seconds: result.usage_summary.total_elapsed_seconds,
            elapsed: result.usage_summary.total_elapsed,
            max_rss_mb: result.usage_summary.max_rss_mb,
          },
          aws_cost_estimate: result.usage_summary.aws_cost_estimate || {
            usd: result.usage_summary.total_aws_usd,
            instance_type: 'm6i.xlarge',
            note: result.usage_summary.aws_cost_estimate?.note,
          },
        });
      } else if (batchId && Array.isArray(result?.jobs)) {
        setModelRunUsage(
          aggregateUsageFromStatusRows(
            result.jobs.map((job) => ({ result: job }))
          )
        );
      } else {
        setModelRunUsage(extractUsageFromStatusPayload(result));
      }
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
    if (isDownloadingModel) return;

    const jobId = spinupJobId?.trim();
    const batchIdPreview = String(runModelBatchId ?? '').trim();
    // Batch ZIP can use runModelBatchId alone; single-job path needs a job id and completed status.
    const modelIsCompleted = normalizeBaselineStatusToken(String(spinupStatus || '')) === 'completed';
    const canDownload = Boolean(batchIdPreview) || (Boolean(jobId) && modelIsCompleted);
    if (!canDownload) return;

    setIsDownloadingModel(true);
    setModelDownloadPercent(null);
    setModelDownloadStatus('Connecting to server…');
    setSpinupError(null);

    const reportProgress = (p) => {
      setModelDownloadPercent(p?.percent ?? null);
      setModelDownloadStatus(formatDownloadProgressMessage(p));
    };

    try {
      const batchIdNorm = String(runModelBatchId ?? '').trim();
      const canTryBatch = Boolean(batchIdNorm);

      let batchResponse = null;
      let batchZipFilename = `scepter_results_${batchIdNorm}.zip`;

      if (canTryBatch) {
        setModelDownloadStatus('Requesting batch ZIP…');
        for (const path of runModelBatchDownloadUrls(batchIdNorm)) {
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
        const blob = await readResponseBlobWithProgress(batchResponse, reportProgress);
        reportProgress({ phase: 'saving', loaded: blob.size, total: blob.size, percent: 100 });
        saveBlobAsFileDownload(blob, batchZipFilename);
        setModelDownloadStatus('Download complete!');
        setModelDownloadPercent(100);
        setTimeout(() => {
          setModelDownloadStatus('');
          setModelDownloadPercent(null);
        }, 2500);
        return;
      }

      if (!jobId) {
        throw new Error('Batch download was not available and no model job id was found for a single-file download.');
      }

      setModelDownloadStatus('Requesting model ZIP…');
      let response = null;
      let lastErr = '';
      for (const path of runModelSingleDownloadUrls(jobId)) {
        const r = await fetch(getApiUrl(path), {
          headers: { 'ngrok-skip-browser-warning': 'true' },
          cache: 'no-store',
        });
        if (r.ok) {
          response = r;
          break;
        }
        const text = await r.text();
        const jsonErr = parseBaselineJsonErrorMessage(text);
        lastErr = jsonErr || text || `Download failed (${r.status})`;
        if (r.status !== 400 && r.status !== 404) {
          response = r;
          break;
        }
      }

      if (!response?.ok) {
        throw new Error(lastErr || 'Download failed');
      }

      const blob = await readResponseBlobWithProgress(response, reportProgress);
      reportProgress({ phase: 'saving', loaded: blob.size, total: blob.size, percent: 100 });
      saveBlobAsFileDownload(blob, `scepter_results_${jobId}.zip`);
      setModelDownloadStatus(
        canTryBatch ? 'Download complete (single-job ZIP; batch ZIP unavailable).' : 'Download complete!'
      );
      setModelDownloadPercent(100);
      setTimeout(() => {
        setModelDownloadStatus('');
        setModelDownloadPercent(null);
      }, canTryBatch ? 3500 : 2500);
    } catch (err) {
      console.error('Download error:', err);
      setSpinupError(err.message || 'Failed to download results.');
      setModelDownloadStatus('Download failed');
      setModelDownloadPercent(null);
      setTimeout(() => setModelDownloadStatus(''), 3000);
    } finally {
      setIsDownloadingModel(false);
    }
  };

  const handleDownloadSpinupResults = async () => {
    const jobId = baselineJobId?.trim();
    const spinupIsCompleted = normalizeBaselineStatusToken(String(baselineStatus || '')) === 'completed';
    if (!jobId || !spinupIsCompleted) return;
    if (isDownloadingSpinup) return;

    setIsDownloadingSpinup(true);
    setSpinupDownloadPercent(null);
    setSpinupDownloadStatus('Connecting to server…');
    setBaselineError(null);

    const reportProgress = (p, prefix = '') => {
      setSpinupDownloadPercent(p?.percent ?? null);
      const msg = formatDownloadProgressMessage(p);
      setSpinupDownloadStatus(prefix ? `${prefix}${msg}` : msg);
    };

    try {
      const batchIdNorm =
        normalizeBaselineBatchIdForStatus(baselineBatchId) || String(baselineBatchId ?? '').trim();
      const canTryBatch = /^baseline_batch_\d+$/i.test(batchIdNorm);

      let batchResponse = null;
      let batchZipFilename = `scepter_spinup_${batchIdNorm}.zip`;

      if (canTryBatch) {
        setSpinupDownloadStatus('Requesting batch ZIP (this can take a while for large outputs)…');
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
        const blob = await readResponseBlobWithProgress(batchResponse, reportProgress);
        reportProgress({ phase: 'saving', loaded: blob.size, total: blob.size, percent: 100 });
        saveBlobAsFileDownload(blob, batchZipFilename);
        setSpinupDownloadStatus('Download complete!');
        setSpinupDownloadPercent(100);
        setTimeout(() => {
          setSpinupDownloadStatus('');
          setSpinupDownloadPercent(null);
        }, 2500);
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
        const prefix = ids.length > 1 ? `File ${i + 1}/${ids.length}: ` : '';
        setSpinupDownloadStatus(
          `${prefix}Requesting ZIP…`
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
        const blob = await readResponseBlobWithProgress(response, (p) => reportProgress(p, prefix));
        reportProgress({ phase: 'saving', loaded: blob.size, total: blob.size, percent: 100 }, prefix);
        saveBlobAsFileDownload(blob, `scepter_spinup_${jid}.zip`);
        if (i < ids.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 450));
        }
      }

      setSpinupDownloadStatus(
        usedBatchZip && ids.length > 1
          ? `Downloaded ${ids.length} ZIP file(s) (batch ZIP unavailable on server).`
          : ids.length > 1
            ? `Downloaded ${ids.length} ZIP file(s).`
            : 'Download complete!'
      );
      setSpinupDownloadPercent(100);
      setTimeout(() => {
        setSpinupDownloadStatus('');
        setSpinupDownloadPercent(null);
      }, 3000);
    } catch (err) {
      console.error('Spin-up download error:', err);
      const msg = err.message || 'Failed to download spin-up results.';
      setBaselineError(msg);
      setSpinupDownloadStatus('Download failed');
      setSpinupDownloadPercent(null);
      setTimeout(() => setSpinupDownloadStatus(''), 3000);
    } finally {
      setIsDownloadingSpinup(false);
    }
  };

  const getDefaultScepterModelName = useCallback(() => {
    if (savedModelName && String(savedModelName).trim()) {
      return String(savedModelName).trim();
    }
    if (savedData?.name && String(savedData.name).trim()) {
      return String(savedData.name).trim();
    }

    return selectedLocations.length > 0
      ? `SCEPTER_${selectedLocations.map((l) => l.label).join('_').replace(/\s+/g, '_')}`
      : 'SCEPTER_Custom_Location';
  }, [savedModelName, savedData, selectedLocations]);

  const buildScepterModelDataPayload = useCallback((nameOverride) => {
    const defaultName =
      nameOverride && String(nameOverride).trim()
        ? String(nameOverride).trim()
        : getDefaultScepterModelName();

    return {
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
        practiceVarsByLocation: practiceVarsById,
        runTracking: {
          baselineJobId: baselineJobId || null,
          baselineJobIds,
          baselineBatchId: baselineBatchId || '',
          baselineStatus: baselineStatus || null,
          modelJobId: spinupJobId || null,
          modelBatchId: runModelBatchId || '',
          modelStatus: spinupStatus || null,
        },
      },
      siteData: selectedSite,
    };
  }, [
    getDefaultScepterModelName,
    selectedLocations,
    feedstock,
    particleSize,
    applicationRate,
    targetPH,
    practiceVarsById,
    baselineJobId,
    baselineJobIds,
    baselineBatchId,
    baselineStatus,
    spinupJobId,
    runModelBatchId,
    spinupStatus,
    selectedSite,
  ]);

  const handleSaveModelClick = () => {
    if (!user || !hasAnyLocation || !hasAnyRunTrackingId) {
      return;
    }
    setModelName(getDefaultScepterModelName());
    setShowNameModal(true);
  };

  const handleSaveModel = async (nameOverride) => {
    if (!user) {
      return;
    }

    if (!hasAnyLocation) {
      return;
    }

    if (!nameOverride || !String(nameOverride).trim()) {
      return;
    }

    const trimmedName = String(nameOverride).trim();
    setIsSaving(true);
    setShowNameModal(false);

    try {
      const modelData = buildScepterModelDataPayload(trimmedName);

      if (activeModelId) {
        // Update existing model (including name)
        const updated = await userService.updateUserModel(user.id, activeModelId, modelData);
        if (!updated) {
          throw new Error('Failed to update model. Please try again.');
        }
        setSavedModelName(trimmedName);
        alert(`Model name updated to "${trimmedName}".`);
      } else {
        // Create new model
        const created = await userService.saveUserModel(user.id, modelData);
        const createdId =
          created?.id ??
          created?.data?.id ??
          created?.model?.id ??
          created?.savedModel?.id ??
          null;
        if (createdId) {
          setActiveModelId(createdId);
        }
        setSavedModelName(trimmedName);
        alert(`Model saved as "${trimmedName}".`);
      }
    } catch (error) {
      console.error('Error saving model:', error);
      alert(error?.message || 'Failed to save model. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!activeModelId || !user?.id) return;
    if (!hasAnyLocation) return;
    if (isSaving || isAutoSyncingRunTrackingRef.current) return;

    const runTrackingSnapshot = JSON.stringify({
      baselineJobId: baselineJobId || null,
      baselineJobIds,
      baselineBatchId: baselineBatchId || '',
      baselineStatus: baselineStatus || null,
      modelJobId: spinupJobId || null,
      modelBatchId: runModelBatchId || '',
      modelStatus: spinupStatus || null,
    });
    if (runTrackingSnapshot === lastRunTrackingSnapshotRef.current) return;

    let cancelled = false;
    isAutoSyncingRunTrackingRef.current = true;
    (async () => {
      try {
        // Sync run tracking / parameters only — never overwrite the user-chosen model name.
        const full = buildScepterModelDataPayload(savedModelName || undefined);
        const { name: _omitName, ...syncPayload } = full;
        await userService.updateUserModel(user.id, activeModelId, syncPayload);
        if (!cancelled) {
          lastRunTrackingSnapshotRef.current = runTrackingSnapshot;
        }
      } catch (error) {
        console.error('Error auto-syncing SCEPTER run tracking:', error);
      } finally {
        isAutoSyncingRunTrackingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeModelId,
    user,
    hasAnyLocation,
    isSaving,
    baselineJobId,
    baselineJobIds,
    baselineBatchId,
    baselineStatus,
    spinupJobId,
    runModelBatchId,
    spinupStatus,
    savedModelName,
    buildScepterModelDataPayload,
  ]);

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
  const canContinueToStep2 =
    savedData ||
    selectedLocations.length >= 1 ||
    normalizeBaselineStatusToken(String(baselineStatus || '')) === 'completed';

  const removeLocationAt = (index) => {
    setSelectedLocations((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLocationLabel = useCallback((locId, value) => {
    const raw = String(value ?? '');
    const nextLabel = raw.replace(/\s+/g, ' ').trimStart();
    setSelectedLocations((prev) =>
      prev.map((loc) =>
        loc.id === locId
          ? {
              ...loc,
              // Keep non-empty label; preserve fallback default if user clears input.
              label: nextLabel === '' ? loc.label : nextLabel,
            }
          : loc
      )
    );
  }, []);

  const clearAllMultipleLocations = () => {
    setSelectedLocations([]);
  };

  const addLocationsFromPaste = useCallback(async () => {
    setPasteCoordsFeedback(null);
    const { pairs, errors } = parsePastedCoordinateList(pasteCoordsText);
    if (!pairs.length) {
      setPasteCoordsFeedback({
        type: 'error',
        message: errors[0] || 'No valid coordinates found.',
      });
      return;
    }

    const remaining = locationsUnlimited
      ? pairs.length
      : maxLocations - selectedLocations.length;
    if (!locationsUnlimited && remaining <= 0) {
      setPasteCoordsFeedback({
        type: 'error',
        message: `Maximum of ${locationLimitLabel} locations reached. Remove some before adding more.`,
      });
      return;
    }

    setIsAddingPastedCoords(true);
    try {
      const toAdd = locationsUnlimited ? pairs : pairs.slice(0, remaining);
      const skippedForCap = pairs.length - toAdd.length;
      const stamp = Date.now();
      const newLocs = [];

      for (let i = 0; i < toAdd.length; i++) {
        const { lat, lng, label: pastedLabel } = toAdd[i];
        const stateCodeResolved =
          (await resolveStateCodeFromCoords(lat, lng)) || getStateCodeFromCoords(lat, lng) || 'LOC';
        const nextIndex = selectedLocations.length + i + 1;
        newLocs.push({
          id: `paste-${stamp}-${i}`,
          lat,
          lng,
          label: pastedLabel || `${stateCodeResolved}_Location_${nextIndex}`,
        });
      }

      setSelectedLocations((prev) => {
        if (locationsUnlimited) return [...prev, ...newLocs];
        const room = maxLocations - prev.length;
        if (room <= 0) return prev;
        return [...prev, ...newLocs.slice(0, room)];
      });

      if (newLocs[0]) {
        setMapCenter([newLocs[0].lat, newLocs[0].lng]);
        setMapZoom(8);
      }

      setPasteCoordsText('');
      const parts = [`Added ${newLocs.length} location${newLocs.length === 1 ? '' : 's'}.`];
      if (errors.length) parts.push(`${errors.length} line(s) skipped as invalid.`);
      if (skippedForCap > 0) {
        parts.push(
          `${skippedForCap} skipped (limit is ${locationLimitLabel} locations).`
        );
      }
      setPasteCoordsFeedback({
        type: errors.length || skippedForCap ? 'warn' : 'success',
        message: parts.join(' '),
      });
    } finally {
      setIsAddingPastedCoords(false);
    }
  }, [pasteCoordsText, selectedLocations.length, maxLocations, locationsUnlimited, locationLimitLabel]);

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
      {showNameModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-gray-900/40">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4 text-center text-gray-800">
              Name Your Model Run
            </h2>
            <p className="text-gray-600 mb-4 text-center text-sm">
              Enter a name to identify this model run in your saved models
            </p>

            <div className="mb-6">
              <Label htmlFor="modelName" className="text-sm font-medium text-gray-700 mb-2 block">
                Model Name
              </Label>
              <Input
                id="modelName"
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md"
                placeholder="Enter model name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && modelName.trim()) {
                    handleSaveModel(modelName);
                  }
                }}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => handleSaveModel(modelName)}
                disabled={!modelName.trim() || isSaving}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                onClick={() => {
                  setShowNameModal(false);
                  setModelName('');
                }}
                disabled={isSaving}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-6">
        <div className="w-3/5 min-w-0">
          <h2 className="text-xl font-bold text-center mb-6 text-gray-800">SCEPTER Area of Interest</h2>
          <div className="mt-6">
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '500px', width: '100%' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                attribution='© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
              />
              <MapClickHandler
                onMapClick={async (clickedPoint) => {
                  const stateCodeResolved =
                    (await resolveStateCodeFromCoords(clickedPoint.lat, clickedPoint.lng)) || 'LOC';
                  setSelectedLocations((prev) => {
                    if (Number.isFinite(maxLocations) && prev.length >= maxLocations) return prev;
                    const nextIndex = prev.length + 1;
                    const label = `${stateCodeResolved}_Location_${nextIndex}`;
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

        <div className="w-2/5 min-w-0">
          <h2 className="text-xl font-bold text-center text-gray-800">SCEPTER Model Configuration</h2>
          <Card className="mt-5 rounded-2xl shadow-lg p-6">
            <CardContent className="space-y-6">
              {/* Two-page navigation presenting the 3-step SCEPTER flow */}
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
                  1. Add Sites
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
                  2. Set Variables & Run
                </button>
              </div>

              {/* Page 1: Step 1 - Add Sites */}
              {currentPage === 1 && (
                <>
                  <div className="space-y-3 mb-4">
                    <div>
                      <h4 className="text-md font-semibold">Step 1: Add sites</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Add one or more locations by clicking the map, pasting coordinates, or choosing USGS Water Quality Sites.
                        Or restore a completed HPC spin-up by ID below.
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowRestoreSpinup((v) => !v);
                          setRestoreSpinupFeedback(null);
                        }}
                        className="w-full text-left text-sm font-semibold text-amber-900"
                      >
                        {showRestoreSpinup ? '▾' : '▸'} Restore completed spin-up from ID
                      </button>
                      {showRestoreSpinup ? (
                        <div className="space-y-2">
                          <p className="text-xs text-amber-900/80">
                            Paste a spin-up <span className="font-mono">baseline_batch_…</span> id and/or job ids from HPC.
                            Also paste the same site coordinates used for that spin-up (one <span className="font-mono">lat, lng</span> per line) so practice variables can be set on Step 2.
                          </p>
                          <Label htmlFor="restore-spinup-id" className="text-xs font-medium text-amber-950">
                            Spin-up batch / job ID
                          </Label>
                          <textarea
                            id="restore-spinup-id"
                            value={restoreSpinupText}
                            onChange={(e) => {
                              setRestoreSpinupText(e.target.value);
                              if (restoreSpinupFeedback) setRestoreSpinupFeedback(null);
                            }}
                            rows={2}
                            placeholder={'baseline_batch_887986'}
                            className="w-full rounded-xl border border-amber-300 bg-white p-2 text-sm font-mono resize-y min-h-[56px] focus:outline-none focus:ring-2 focus:ring-amber-400"
                            disabled={isRestoringSpinup}
                          />
                          <Label htmlFor="restore-spinup-sites" className="text-xs font-medium text-amber-950">
                            Site coordinates (recommended)
                          </Label>
                          <textarea
                            id="restore-spinup-sites"
                            value={restoreSpinupSitesText}
                            onChange={(e) => {
                              setRestoreSpinupSitesText(e.target.value);
                              if (restoreSpinupFeedback) setRestoreSpinupFeedback(null);
                            }}
                            rows={4}
                            placeholder={'41.3083, -72.9279\n42.3601, -71.0589 Site_2\n40.7128, -74.0060'}
                            className="w-full rounded-xl border border-amber-300 bg-white p-2 text-sm font-mono resize-y min-h-[96px] focus:outline-none focus:ring-2 focus:ring-amber-400"
                            disabled={isRestoringSpinup}
                          />
                          {restoreSpinupFeedback ? (
                            <p
                              className={`text-sm ${
                                restoreSpinupFeedback.type === 'error'
                                  ? 'text-red-700'
                                  : restoreSpinupFeedback.type === 'warn'
                                    ? 'text-amber-800'
                                    : 'text-green-800'
                              }`}
                            >
                              {restoreSpinupFeedback.message}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() => handleRestoreSpinupFromIds({ forceCompleted: false })}
                              disabled={isRestoringSpinup || !restoreSpinupText.trim()}
                              className="bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              {isRestoringSpinup ? 'Restoring…' : 'Restore & check status'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const confirmed = window.confirm(
                                  'Mark this spin-up as completed even if status cannot be verified?\n\n' +
                                    'Use this when results already finished on HPC and you only need to continue to the model run.'
                                );
                                if (!confirmed) return;
                                handleRestoreSpinupFromIds({ forceCompleted: true });
                              }}
                              disabled={isRestoringSpinup || !restoreSpinupText.trim()}
                              className="disabled:opacity-50"
                            >
                              Restore as completed
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMapSelectMode(true);
                          setShowPasteCoords(false);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-colors ${
                          mapSelectMode && !showPasteCoords
                            ? 'border-blue-300 bg-blue-50 text-blue-900'
                            : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900'
                        }`}
                      >
                        Select on Map
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMapSelectMode(false);
                          setShowPasteCoords(true);
                          setPasteCoordsFeedback(null);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-colors ${
                          showPasteCoords
                            ? 'border-blue-300 bg-blue-50 text-blue-900'
                            : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900'
                        }`}
                      >
                        Paste coordinates
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setMapSelectMode(false);
                          setShowPasteCoords(false);
                          navigate('/usgs-sites');
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-semibold text-gray-900 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
                      >
                        Use USGS sites
                      </button>
                    </div>
                  </div>

                  {showPasteCoords ? (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 mb-4">
                      <div>
                        <Label htmlFor="paste-coords" className="text-sm font-medium text-gray-800">
                          Paste a list of coordinates
                        </Label>
                        <p className="text-xs text-gray-500 mt-1">
                          One pair per line as <span className="font-mono">lat, lng</span>
                          {locationsUnlimited
                            ? ' · no location limit on your account'
                            : selectedLocations.length > 0
                              ? ` · ${maxLocations - selectedLocations.length} slot${maxLocations - selectedLocations.length === 1 ? '' : 's'} remaining`
                              : ` · up to ${locationLimitLabel} locations`}
                          . Optional name after the coordinates.
                        </p>
                      </div>
                      <textarea
                        id="paste-coords"
                        value={pasteCoordsText}
                        onChange={(e) => {
                          setPasteCoordsText(e.target.value);
                          if (pasteCoordsFeedback) setPasteCoordsFeedback(null);
                        }}
                        rows={5}
                        placeholder={'41.3083, -72.9279\n42.3601, -71.0589 Boston\n40.7128\t-74.0060'}
                        className="w-full rounded-xl border border-gray-300 p-3 text-sm font-mono resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                        disabled={
                          isAddingPastedCoords ||
                          (!locationsUnlimited && selectedLocations.length >= maxLocations)
                        }
                      />
                      {pasteCoordsFeedback ? (
                        <p
                          className={`text-sm ${
                            pasteCoordsFeedback.type === 'error'
                              ? 'text-red-700'
                              : pasteCoordsFeedback.type === 'warn'
                                ? 'text-amber-700'
                                : 'text-green-700'
                          }`}
                        >
                          {pasteCoordsFeedback.message}
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        onClick={addLocationsFromPaste}
                        disabled={
                          isAddingPastedCoords ||
                          !pasteCoordsText.trim() ||
                          (!locationsUnlimited && selectedLocations.length >= maxLocations)
                        }
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                      >
                        {isAddingPastedCoords ? 'Adding…' : 'Add pasted locations'}
                      </Button>
                    </div>
                  ) : null}

                  {selectedLocations.length === 0 && !showPasteCoords ? (
                    <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-300">
                      <h3 className="text-sm font-semibold text-yellow-800 mb-2">Add locations</h3>
                      <p className="text-sm text-yellow-700">
                        Click the map, paste a coordinate list, or use USGS Water Quality Sites.
                      </p>
                    </div>
                  ) : null}

                  {selectedLocations.length > 0 ? (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">
                          Selected locations ({selectedLocations.length}
                          {locationsUnlimited ? '' : `/${locationLimitLabel}`})
                        </h3>
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
                              className="relative p-2 pr-12 pb-10 bg-white rounded border border-blue-100"
                            >
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="space-y-0.5">
                                  <span className="text-xs text-gray-600">Location Name</span>
                                  <Input
                                    type="text"
                                    autoComplete="off"
                                    placeholder={`Location ${index + 1}`}
                                    value={loc.label}
                                    onChange={(e) => updateLocationLabel(loc.id, e.target.value)}
                                    className="text-sm"
                                  />
                                </div>
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
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${loc.label}`}
                                title="Remove location"
                                onClick={() => removeLocationAt(index)}
                                className="absolute top-1 right-2 h-8 w-8 rounded-full bg-transparent hover:bg-transparent text-red-600 hover:text-red-700"
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-4 w-4"
                                >
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                </svg>
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    onClick={() => setCurrentPage(2)}
                    disabled={!canContinueToStep2}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to Next Step 
                  </Button>
                </>
              )}

              {/* Page 2: Step 2 - Practice Variables and Step 3 - Combined Run */}
              {currentPage === 2 && (
                <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-md font-semibold">Step 2: Set practice variables</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Configure feedstock and application settings for each selected site, then run Spin-Up and Model Run as one flow.
                      </p>
                    </div>
                    {selectedLocations.length > 1 ? (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={applySamePracticeToAll}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setApplySamePracticeToAll(enabled);
                              if (enabled) applyCurrentPracticeVarsToAllSites();
                            }}
                          />
                          <span>Use the same parameters for all {selectedLocations.length} sites</span>
                        </label>
                        {!applySamePracticeToAll ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={applyCurrentPracticeVarsToAllSites}
                            className="shrink-0"
                          >
                            Apply current site to all
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="bg-white p-3 rounded-2xl shadow-md space-y-4">
                    {selectedLocations.length > 0 ? (
                      <>
                        {(() => {
                          const loc = selectedLocations[activePracticeIndex];
                          const vars = getPracticeVarsForLocation(loc.id);
                          return (
                            <div
                              key={loc.id}
                              className="border rounded-xl p-3 bg-gray-50"
                              onClick={() => focusPracticeLocationOnMap(loc)}
                            >
                              <div className="font-semibold text-sm mb-3">
                                {applySamePracticeToAll && selectedLocations.length > 1
                                  ? `All ${selectedLocations.length} sites`
                                  : `Site ${activePracticeIndex + 1}: ${loc.label}`}
                              </div>
                              <Label className="block mb-2">Feedstock Type</Label>
                              <select
                                className="w-full border rounded-xl p-2 mb-4"
                                value={vars.feedstock}
                                onChange={(e) => updatePracticeVarForLocation(loc.id, 'feedstock', e.target.value)}
                                onFocus={() => focusPracticeLocationOnMap(loc)}
                              >
                                <option value="" disabled>Choose Feedstock</option>
                                <option value="Basalt">Basalt</option>
                                <option value="Olivine">Olivine</option>
                              </select>

                              <Label className="block mb-2">Particle Size</Label>
                              <select
                                className="w-full border rounded-xl p-2 mb-4"
                                value={vars.particleSize}
                                onChange={(e) => updatePracticeVarForLocation(loc.id, 'particleSize', e.target.value)}
                                onFocus={() => focusPracticeLocationOnMap(loc)}
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
                                value={vars.applicationRate}
                                onChange={(e) => updatePracticeVarForLocation(loc.id, 'applicationRate', e.target.value)}
                                onFocus={() => focusPracticeLocationOnMap(loc)}
                              />

                              <Label className="block mb-2">Target Soil pH (optional)</Label>
                              <Input
                                type="number"
                                step="0.1"
                                className="w-full border rounded-xl p-2"
                                placeholder="Enter target pH"
                                value={vars.targetPH}
                                onChange={(e) => updatePracticeVarForLocation(loc.id, 'targetPH', e.target.value)}
                                onFocus={() => focusPracticeLocationOnMap(loc)}
                              />
                            </div>
                          );
                        })()}
                        {selectedLocations.length > 1 && !applySamePracticeToAll ? (
                        <div className="flex items-center justify-between gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const next = Math.max(0, activePracticeIndex - 1);
                              setActivePracticeIndex(next);
                              focusPracticeLocationOnMap(selectedLocations[next]);
                            }}
                            disabled={activePracticeIndex <= 0}
                          >
                            ← Previous
                          </Button>
                          <div className="text-sm font-medium text-gray-700">
                            Site {activePracticeIndex + 1} of {selectedLocations.length}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const next = Math.min(selectedLocations.length - 1, activePracticeIndex + 1);
                              setActivePracticeIndex(next);
                              focusPracticeLocationOnMap(selectedLocations[next]);
                            }}
                            disabled={activePracticeIndex >= selectedLocations.length - 1}
                          >
                            Next →
                          </Button>
                        </div>
                        ) : selectedLocations.length > 1 && applySamePracticeToAll ? (
                          <p className="text-xs text-gray-500 text-center">
                            Edits apply to every selected site. Uncheck the option above to set parameters per site.
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-3">
                        <Button
                          type="button"
                          disabled={
                            isSubmittingBaseline ||
                            hasSubmittedSpinup ||
                            selectedLocations.length < 1
                          }
                          onClick={handleBaselineSimulation}
                          className="w-full bg-green-500 text-white hover:bg-green-600 rounded-md p-2 disabled:opacity-50"
                        >
                          {isSubmittingBaseline
                            ? 'Submitting Spin-Up...'
                            : hasSubmittedSpinup
                              ? 'Spin-Up submitted'
                              : 'Run Spin-Up'}
                        </Button>
                        <div className={`p-3 rounded-lg text-sm ${baselineStatus === 'completed' ? 'bg-green-100 text-green-700' : baselineStatus === 'running' || baselineStatus === 'submitting' ? 'bg-blue-100 text-blue-700' : baselineStatus === 'failed' ? 'bg-red-100 text-red-700' : baselineStatus === 'pending' || baselineStatus === 'submitted' || baselineStatus === 'queued' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                          <div className="min-w-0">
                            {baselineBatchId?.trim() ? (
                              <div className="text-sm mt-1">
                                <span className="font-semibold">Spin-Up batch id:</span>{' '}
                                <span className="text-sm">{baselineBatchId}</span>
                              </div>
                            ) : null}
                            <div className="text-sm">
                              <span className="font-semibold">Spin-Up Status:</span>{' '}
                              <span className="text-sm">{isSubmittingBaseline ? 'submitting' : (baselineStatus || 'idle')}</span>
                            </div>
                            {baselineCheckInfo && <div className="sr-only">{baselineCheckInfo}</div>}
                            {baselineNotice && <div className="text-xs mt-1">{baselineNotice}</div>}
                            {baselineError && <div className="mt-1">{baselineError}</div>}
                            {spinupIsCompleted && (
                              <div className="text-xs mt-2 text-green-800">
                                Spin-up complete. Progress is saved — you can run the model or return later without re-running spin-up.
                              </div>
                            )}
                            <JobUsageSummary usage={baselineJobUsage} label="Spin-up usage" />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={handleCheckBaselineStatus}
                              disabled={isCheckingBaselineStatus}
                              className="bg-yellow-500 text-white hover:bg-yellow-600 rounded-md py-1.5 px-3 text-sm disabled:opacity-50"
                            >
                              {isCheckingBaselineStatus ? 'Checking...' : 'Check status'}
                            </Button>
                            {normalizeBaselineStatusToken(String(baselineStatus || '')) === 'completed' && (
                              <Button
                                type="button"
                                onClick={handleDownloadSpinupResults}
                                disabled={isDownloadingSpinup}
                                className="bg-green-500 text-white hover:bg-green-600 rounded-md py-1.5 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isDownloadingSpinup ? 'Downloading…' : 'Download'}
                              </Button>
                            )}
                          </div>
                          {(isDownloadingSpinup || spinupDownloadStatus) ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-gray-800 break-words">
                                {spinupDownloadStatus || 'Preparing download…'}
                              </p>
                              <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    spinupDownloadPercent == null
                                      ? 'w-1/3 animate-pulse bg-green-400'
                                      : 'bg-green-500'
                                  }`}
                                  style={
                                    spinupDownloadPercent == null
                                      ? undefined
                                      : { width: `${Math.max(2, Math.min(100, spinupDownloadPercent))}%` }
                                  }
                                />
                              </div>
                              {spinupDownloadPercent == null && isDownloadingSpinup ? (
                                <p className="text-[11px] text-gray-600">
                                  Server is preparing or streaming the file. Size unknown until transfer finishes — keep this tab open.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Button
                          type="button"
                          disabled={!canSubmitModelRun}
                          onClick={(e) => (needsModelRunResubmit ? handleRetryModelRun(e) : handleRunModel(e))}
                          className="w-full bg-blue-600 text-white hover:bg-blue-700 rounded-md p-2 disabled:opacity-50"
                        >
                          {isSubmittingRunModel
                            ? 'Submitting Model Run...'
                            : modelRunCompleted
                              ? 'Model run completed'
                              : modelRunFailed
                                ? 'Retry Model Run'
                                : needsModelRunResubmit
                                  ? 'Resubmit Model Run'
                                  : 'Run Model'}
                        </Button>

                        <div className={`p-3 rounded-lg text-sm ${spinupStatus === 'completed' ? 'bg-green-100 text-green-700' : spinupStatus === 'running' ? 'bg-blue-100 text-blue-700' : spinupStatus === 'failed' || spinupStatus === 'error' ? 'bg-red-100 text-red-700' : spinupStatus === 'pending' || spinupStatus === 'submitted' || spinupStatus === 'waiting_for_spinup' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                          <div className="min-w-0">
                            {runModelBatchId?.trim() ? (
                              <div className="text-sm mt-1">
                                <span className="font-semibold">Model batch id:</span>{' '}
                                <span className="text-sm">{runModelBatchId}</span>
                              </div>
                            ) : null}
                            <div className="text-sm">
                              <span className="font-semibold">Model Status:</span>{' '}
                              <span className="text-sm">
                                {spinupStatus
                                  ? (spinupStatus === 'waiting_for_spinup' ? 'waiting for spin-up to complete' : spinupStatus)
                                  : (baselineStatus && baselineStatus !== 'completed' ? 'waiting for spin-up to complete' : 'idle')}
                              </span>
                            </div>
                            {spinupError && <div>{spinupError}</div>}
                            {modelRunFailed && spinupIsCompleted && (
                              <div className="text-xs mt-2">
                                Model run failed. Your completed spin-up is still saved — use Retry Model Run to submit again without restarting spin-up.
                              </div>
                            )}
                            {!modelRunFailed && needsModelRunResubmit && !modelRunCompleted && spinupIsCompleted && (
                              <div className="text-xs mt-2">
                                A previous model submission is still tracked{modelRunInProgress ? ' as in progress' : ''}.
                                If the connection was lost or status never updated, use Resubmit Model Run to try again without re-running spin-up.
                              </div>
                            )}
                            <JobUsageSummary usage={modelRunUsage} label="Model run usage" />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={handleCheckSpinupStatus}
                              disabled={isCheckingSpinupStatus || (!hasModelRunIds && !modelRunFailed)}
                              className="bg-yellow-500 text-white hover:bg-yellow-600 rounded-md py-1.5 px-3 text-sm disabled:opacity-50"
                            >
                              {isCheckingSpinupStatus ? 'Checking...' : 'Check status'}
                            </Button>
                            {needsModelRunResubmit && canSubmitModelRun && (
                              <Button
                                type="button"
                                onClick={handleRetryModelRun}
                                disabled={isSubmittingRunModel}
                                className="bg-blue-600 text-white hover:bg-blue-700 rounded-md py-1.5 px-3 text-sm disabled:opacity-50"
                              >
                                {isSubmittingRunModel
                                  ? 'Submitting...'
                                  : modelRunFailed
                                    ? 'Retry from spin-up'
                                    : 'Resubmit from spin-up'}
                              </Button>
                            )}
                            {(normalizeBaselineStatusToken(String(spinupStatus || '')) === 'completed' || !!runModelBatchId?.trim()) && (
                              <Button
                                type="button"
                                onClick={handleDownloadResults}
                                disabled={isDownloadingModel}
                                className={`rounded-md py-1.5 px-3 text-sm font-semibold ${isDownloadingModel ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'}`}
                              >
                                {isDownloadingModel ? 'Downloading…' : 'Download'}
                              </Button>
                            )}
                          </div>
                          {(isDownloadingModel || modelDownloadStatus) ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-gray-800 break-words">
                                {modelDownloadStatus || 'Preparing download…'}
                              </p>
                              <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    modelDownloadPercent == null
                                      ? 'w-1/3 animate-pulse bg-green-400'
                                      : 'bg-green-500'
                                  }`}
                                  style={
                                    modelDownloadPercent == null
                                      ? undefined
                                      : { width: `${Math.max(2, Math.min(100, modelDownloadPercent))}%` }
                                  }
                                />
                              </div>
                              {modelDownloadPercent == null && isDownloadingModel ? (
                                <p className="text-[11px] text-gray-600">
                                  Server is preparing or streaming the file. Size unknown until transfer finishes — keep this tab open.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {!hasAnyRunTrackingId && (
                      <p className="text-xs text-gray-500">
                        Save unlocks after spin-up or model run creates a tracking ID.
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Button
                        type="button"
                        onClick={handleSaveModelClick}
                        disabled={isSaving || !hasAnyLocation || !hasAnyRunTrackingId}
                        title={!hasAnyRunTrackingId ? 'Save is enabled after run tracking ID is available.' : undefined}
                        className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-md font-semibold disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : savedData ? 'Update Model' : 'Save Model'}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          const confirmed = window.confirm(
                            'Reset everything on this page? This clears sites, practice variables, spin-up and model-run status, and removes saved session data from your browser for SCEPTER.'
                          );
                          if (!confirmed) return;
                          resetAllScepterSession();
                        }}
                        className="w-full bg-red-500 text-white hover:bg-red-600 rounded-md py-2 font-semibold"
                      >
                        Reset
                      </Button>
                    </div>
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