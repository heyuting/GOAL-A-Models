import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchMfaStatus, submitMfaResponse } from '@/services/hpcMfaService';

const IDLE_POLL_MS = 4000;
const ACTIVE_POLL_MS = 1500;
const BURST_POLL_MS = 1000;
const BURST_DURATION_MS = 3 * 60 * 1000;

/**
 * Global Duo MFA prompt for Yale HPC SSH.
 * Polls the proxy API; when Duo asks for option 1/2 (or a passcode),
 * shows a modal and posts the user's choice back to finish SSH auth.
 */
export default function DuoMfaPrompt({ enabled = true }) {
  const [status, setStatus] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [burstUntil, setBurstUntil] = useState(0);
  const [dismissedFailedAt, setDismissedFailedAt] = useState(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await fetchMfaStatus();
      setStatus(data);
      if (data?.status === 'mfa_required') {
        setError('');
        setDismissedFailedAt(null);
      }
      if (data?.status === 'authenticated' || data?.status === 'idle') {
        setPasscode('');
        setSubmitting(false);
        setDismissedFailedAt(null);
      }
      if (data?.status === 'failed' && data?.error) {
        setError(data.error);
      }
      if (data?.status === 'connecting' || data?.status === 'waiting_approval') {
        setDismissedFailedAt(null);
      }
    } catch {
      // Proxy may be offline (local/VPN/ngrok); keep quiet.
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
      const active =
        status?.status === 'mfa_required' ||
        status?.status === 'connecting' ||
        status?.status === 'waiting_approval' ||
        Date.now() < burstUntil;
      const delay = Date.now() < burstUntil
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

  const handleSubmit = async (choice) => {
    if (!choice || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await submitMfaResponse({
        choice,
        authId: status?.auth_id,
      });
      setStatus(data);
      setPasscode('');
    } catch (err) {
      setError(err.message || 'Failed to send Duo response');
      setSubmitting(false);
      return;
    }
    // Keep submitting=true briefly; waiting_approval / next poll clears it.
  };

  if (!enabled) return null;

  const showFailed =
    status?.status === 'failed' &&
    status?.error &&
    !(dismissedFailedAt && status?.updated_at && status.updated_at <= dismissedFailedAt);

  const showModal =
    status?.status === 'mfa_required' ||
    status?.status === 'waiting_approval' ||
    status?.status === 'connecting' ||
    showFailed;

  if (!showModal) return null;

  const options = Array.isArray(status?.options) ? status.options : [];
  const isChallenge = status?.status === 'mfa_required';
  const isWaiting =
    status?.status === 'waiting_approval' || status?.status === 'connecting';
  const isFailed = showFailed;

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
          {status?.title || 'Yale HPC Duo verification'}
        </h3>

        {isWaiting && (
          <p className="text-sm text-gray-600 mb-4">
            {status?.status === 'connecting'
              ? 'Connecting to Bouchet and starting Duo authentication…'
              : 'Approve the Duo notification on your phone, or wait for the next prompt.'}
          </p>
        )}

        {isChallenge && (
          <>
            {status?.instructions ? (
              <pre className="mb-4 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700">
                {status.instructions}
              </pre>
            ) : (
              <p className="text-sm text-gray-600 mb-4">
                Choose a Duo option or enter a passcode to continue the HPC connection.
              </p>
            )}

            {options.length > 0 ? (
              <div className="flex flex-col gap-2 mb-4">
                {options.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSubmit(String(opt.value))}
                    className="w-full justify-start bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {opt.value}. {opt.label}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2 mb-4">
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit('1')}
                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                >
                  1 — Duo Push
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit('2')}
                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                >
                  2 — Passcode / other
                </Button>
              </div>
            )}

            <div className="flex gap-2 items-center">
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={status?.prompt || 'Passcode or option'}
                value={passcode}
                disabled={submitting}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(passcode);
                }}
                className="flex-1"
              />
              <Button
                type="button"
                disabled={submitting || !passcode.trim()}
                onClick={() => handleSubmit(passcode)}
                className="bg-gray-800 text-white hover:bg-gray-900"
              >
                Send
              </Button>
            </div>
          </>
        )}

        {isFailed && (
          <>
            <p className="text-sm text-red-600 mb-4">
              {status?.error || error || 'Duo authentication failed.'}
            </p>
            <Button
              type="button"
              onClick={() => {
                setDismissedFailedAt(status?.updated_at || Date.now() / 1000);
                setError('');
                setSubmitting(false);
              }}
              className="w-full bg-gray-800 text-white hover:bg-gray-900"
            >
              Dismiss
            </Button>
          </>
        )}

        {error && !isFailed && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}

        {(isWaiting || submitting) && !isFailed && (
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Waiting for Duo…
          </div>
        )}
      </div>
    </div>
  );
}
