import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchMfaStatus } from '@/services/hpcMfaService';

const IDLE_POLL_MS = 4000;
const ACTIVE_POLL_MS = 1500;
const BURST_POLL_MS = 1000;
const BURST_DURATION_MS = 3 * 60 * 1000;

/**
 * Status banner for Yale HPC SSH via OpenSSH ControlMaster.
 *
 * The proxy no longer accepts Duo choices from the browser. Authenticate once
 * on the API host with `./ssh_login_bouchet.sh`, then this UI only reports
 * whether that ControlMaster session is alive.
 */
export default function DuoMfaPrompt({ enabled = true }) {
  const [status, setStatus] = useState(null);
  const [burstUntil, setBurstUntil] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await fetchMfaStatus();
      setStatus(data);
      if (data?.status === 'authenticated' || data?.status === 'idle') {
        setDismissedAt(null);
      }
    } catch {
      // Proxy may be offline; keep quiet.
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onPending = () => setBurstUntil(Date.now() + BURST_DURATION_MS);
    window.addEventListener('hpc-ssh-pending', onPending);

    let timer;
    const schedule = () => {
      const needsAttention =
        status?.status === 'mfa_required' || status?.status === 'failed';
      const active = needsAttention || Date.now() < burstUntil;
      const delay =
        Date.now() < burstUntil
          ? BURST_POLL_MS
          : active
            ? ACTIVE_POLL_MS
            : IDLE_POLL_MS;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, delay);
    };

    poll();
    schedule();

    return () => {
      window.removeEventListener('hpc-ssh-pending', onPending);
      clearTimeout(timer);
    };
  }, [enabled, poll, status?.status, burstUntil]);

  if (!enabled) return null;

  const needsLogin =
    status?.status === 'mfa_required' || status?.status === 'failed';
  const showModal =
    needsLogin &&
    !(dismissedAt && status?.updated_at && status.updated_at <= dismissedAt);

  if (!showModal) return null;

  const instructions =
    status?.instructions ||
    'On the API (Spinup) host run:\n  ./ssh_login_bouchet.sh\nComplete Duo in that terminal once, then retry from this page.';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gray-900/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duo-mfa-title"
        className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h3 id="duo-mfa-title" className="text-xl font-semibold text-gray-900 mb-2">
          {status?.title || 'Yale HPC OpenSSH session'}
        </h3>

        <p className="text-sm text-gray-600 mb-3">
          Bouchet SSH uses OpenSSH on the API host. Duo and your private key stay
          with OpenSSH — this browser cannot finish authentication.
        </p>

        <pre className="mb-4 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700">
          {instructions}
        </pre>

        {status?.error ? (
          <p className="mb-4 text-sm text-red-600">{status.error}</p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={() => poll()}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
          >
            Check connection again
          </Button>
          <Button
            type="button"
            onClick={() => {
              setDismissedAt(status?.updated_at || Date.now() / 1000);
            }}
            className="flex-1 bg-gray-800 text-white hover:bg-gray-900"
          >
            Dismiss
          </Button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Host alias: {status?.host_alias || 'bouchet'}
          {status?.backend ? ` · backend: ${status.backend}` : ''}
        </p>
      </div>
    </div>
  );
}
