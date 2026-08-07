import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_HPC_UNAVAILABLE,
  fetchHpcStatus,
} from '@/services/hpcStatusService';

const POLL_MS = 15000;

/**
 * Amber alert row for the fixed site header when shared-lab HPC is down.
 * Not dismissible; clears only when HPC is available again.
 * Must be rendered inside the fixed <nav> (below the blue bar), not as a
 * separate fixed layer — that caused clipping behind GOAL-A.
 */
export default function HpcStatusBanner({ enabled = true }) {
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await fetchHpcStatus();
      const available = data?.available === true || data?.status === 'authenticated';
      setUnavailable(!available);
    } catch {
      // Proxy offline — do not claim HPC is down.
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setUnavailable(false);
      return undefined;
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, poll]);

  if (!enabled || !unavailable) return null;

  return (
    <div
      role="alert"
      className="border-t border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
    >
      <p className="mx-auto max-w-5xl text-sm leading-relaxed">
        {DEFAULT_HPC_UNAVAILABLE}
      </p>
    </div>
  );
}
