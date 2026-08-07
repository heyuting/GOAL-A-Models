import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHpcStatus } from '@/services/hpcStatusService';

const POLL_MS = 15000;
const DEFAULT_UNAVAILABLE_MSG =
  'Yale HPC is currently unavailable. Please try again later, or contact yuting.smeglin@yale.edu if the problem continues.';

/**
 * Banner for logged-in users when the shared lab Bouchet session is down.
 * Placed in normal document flow under the fixed nav (not sticky top-0).
 */
export default function HpcStatusBanner({ enabled = true }) {
  const [message, setMessage] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await fetchHpcStatus();
      const available = data?.available === true || data?.status === 'authenticated';
      if (available) {
        setMessage(null);
        setDismissed(false);
      } else {
        setMessage(data?.error || DEFAULT_UNAVAILABLE_MSG);
      }
    } catch {
      // Proxy offline or CORS — don't spam the UI with a false HPC outage.
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, poll]);

  if (!enabled || !message || dismissed) return null;

  return (
    <div
      role="alert"
      className="relative z-10 mb-4 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        <p className="flex-1 text-sm leading-relaxed">{message}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded px-2 py-0.5 text-sm text-amber-900/80 hover:bg-amber-100 hover:text-amber-950"
          aria-label="Dismiss HPC status banner"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
