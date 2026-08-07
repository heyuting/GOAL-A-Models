import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_HPC_UNAVAILABLE,
  fetchHpcStatus,
} from '@/services/hpcStatusService';

const POLL_MS = 15000;

/**
 * In-flow alert below the fixed GOAL-A nav (parent uses pt-24).
 * Not dismissible; clears only when HPC is available again.
 * Avoids fixed/sticky positioning so it cannot sit behind the title bar.
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
      className="w-full border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
    >
      <p className="mx-auto max-w-5xl text-sm leading-relaxed">
        {DEFAULT_HPC_UNAVAILABLE}
      </p>
    </div>
  );
}
