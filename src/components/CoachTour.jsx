import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

const HIGHLIGHT_CLASS = 'coach-target-highlight';

const readDismissed = (storageKey) => {
  if (!storageKey) return false;
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = (storageKey, value) => {
  if (!storageKey) return;
  try {
    if (value) localStorage.setItem(storageKey, '1');
    else localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
};

/**
 * Speech-balloon coach mark anchored to [data-coach-id="..."].
 * Parent chooses which step is active based on current UI state.
 */
export default function CoachTour({
  storageKey,
  step = null, // { id, title, text, placement?: 'left'|'right'|'top'|'bottom' }
  stepNumber = 1,
  stepCount = 1,
}) {
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));
  const [coords, setCoords] = useState(null);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeDismissed(storageKey, true);
  }, [storageKey]);

  const restart = useCallback(() => {
    setDismissed(false);
    writeDismissed(storageKey, false);
  }, [storageKey]);

  const updatePosition = useCallback(() => {
    if (dismissed || !step?.id) {
      setCoords(null);
      return;
    }
    const el = document.querySelector(`[data-coach-id="${step.id}"]`);
    if (!el) {
      setCoords(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setCoords(null);
      return;
    }
    const placement = step.placement || 'left';
    const gap = 12;
    let top = r.top + r.height / 2;
    let left = r.left;
    if (placement === 'left') {
      left = r.left - gap;
      top = r.top + r.height / 2;
    } else if (placement === 'right') {
      left = r.right + gap;
      top = r.top + r.height / 2;
    } else if (placement === 'top') {
      left = r.left + r.width / 2;
      top = r.top - gap;
    } else if (placement === 'bottom') {
      left = r.left + r.width / 2;
      top = r.bottom + gap;
    }
    setCoords({ top, left, placement, width: r.width, height: r.height });
  }, [dismissed, step]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, step?.id, stepNumber]);

  useEffect(() => {
    if (dismissed || !step?.id) return undefined;

    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    const interval = window.setInterval(updatePosition, 500);

    const el = document.querySelector(`[data-coach-id="${step.id}"]`);
    if (el) {
      el.classList.add(HIGHLIGHT_CLASS);
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.clearInterval(interval);
      document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => {
        node.classList.remove(HIGHLIGHT_CLASS);
      });
    };
  }, [dismissed, step?.id, updatePosition]);

  const restartButton = (
    <button
      type="button"
      onClick={restart}
      className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 hover:underline"
    >
      <HelpCircle className="h-4 w-4" aria-hidden="true" />
      Show click guide
    </button>
  );

  if (dismissed) {
    return <div className="mb-3">{restartButton}</div>;
  }

  if (!step?.id || !coords) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">Guide ready — follow the balloon on the page.</span>
        <button type="button" onClick={dismiss} className="text-xs text-gray-500 hover:underline">
          Skip guide
        </button>
      </div>
    );
  }

  const transformByPlacement = {
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
  };

  const arrowByPlacement = {
    left:
      'absolute top-1/2 -right-2 h-0 w-0 -translate-y-1/2 border-y-8 border-y-transparent border-l-8 border-l-green-50',
    right:
      'absolute top-1/2 -left-2 h-0 w-0 -translate-y-1/2 border-y-8 border-y-transparent border-r-8 border-r-green-50',
    top:
      'absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-x-transparent border-t-8 border-t-green-50',
    bottom:
      'absolute -top-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-x-transparent border-b-8 border-b-green-50',
  };

  const balloon = createPortal(
    <div
      className="pointer-events-none fixed z-[10000]"
      style={{
        top: coords.top,
        left: coords.left,
        transform: transformByPlacement[coords.placement] || transformByPlacement.left,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto relative max-w-[240px] rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 shadow-lg">
        <div className={arrowByPlacement[coords.placement] || arrowByPlacement.left} />
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-green-800/70">
            Step {stepNumber} of {stepCount}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded p-0.5 text-green-800/70 hover:bg-green-100 hover:text-green-900"
            aria-label="Skip guide"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {step.title ? (
          <div className="mb-0.5 text-sm font-semibold text-green-900">{step.title}</div>
        ) : null}
        <p className="text-sm leading-snug text-green-900/90">{step.text}</p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 text-xs font-medium text-green-800 underline hover:text-green-900"
        >
          Skip guide
        </button>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-green-900/80">
          Follow the balloon — it points to what to click next.
        </span>
        <button type="button" onClick={dismiss} className="text-xs text-gray-500 hover:underline">
          Skip guide
        </button>
      </div>
      {balloon}
      <style>{`
        .${HIGHLIGHT_CLASS} {
          outline: 3px solid #22c55e !important;
          outline-offset: 3px;
          box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.25) !important;
          position: relative;
          z-index: 20;
        }
      `}</style>
    </>
  );
}
