import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_HPC_UNAVAILABLE,
  fetchHpcStatus,
} from '@/services/hpcStatusService';

const POLL_MS = 15000;
// Matches nav `h-20` (5rem) so the banner sits fully below the fixed header.
const NAV_OFFSET_CLASS = 'top-20';

/**
 * Banner for logged-in users when the shared lab Bouchet session is down.
 * Fixed under the GOAL-A nav; stays until HPC is available again (not dismissible).
 */
export default function HpcStatusBanner({ enabled = true }) {
  const [message, setMessage] = useState(null);
  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerRef = useRef(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await fetchHpcStatus();
      const available = data?.available === true || data?.status === 'authenticated';
      if (available) {
        setMessage(null);
      } else {
        setMessage(DEFAULT_HPC_UNAVAILABLE);
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

  const visible = Boolean(enabled && message);

  useEffect(() => {
    if (!visible) {
      setBannerHeight(0);
      return undefined;
    }
    const el = bannerRef.current;
    if (!el) return undefined;
    const update = () => setBannerHeight(el.offsetHeight || 0);
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [visible, message]);

  if (!visible) return null;

  return (
    <>
      <div
        ref={bannerRef}
        role="alert"
        className={`fixed ${NAV_OFFSET_CLASS} left-0 right-0 z-40 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm`}
      >
        <div className="mx-auto max-w-5xl">
          <p className="text-sm leading-relaxed">{message}</p>
        </div>
      </div>
      <div style={{ height: bannerHeight }} aria-hidden="true" />
    </>
  );
}
