const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const DEFAULT_HPC_UNAVAILABLE =
  'Yale HPC is currently unavailable. Please try again later, or contact yuting.smeglin@yale.edu if the problem continues.';

function getApiUrl(endpoint) {
  const path = endpoint.replace(/^\//, '');
  if (API_BASE_URL) return `${API_BASE_URL}/${path}`;
  return `/${path}`;
}

/**
 * Shared-lab Bouchet session status (OpenSSH ControlMaster on the API host).
 */
export async function fetchHpcStatus() {
  const response = await fetch(getApiUrl('api/auth/mfa-status'), {
    cache: 'no-store',
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`HPC status failed (${response.status})`);
  }
  return response.json();
}

/**
 * Normalize API / status errors so users see the clean HPC message,
 * not logger lines like "ERROR:app:Baseline batch submission error…".
 */
export function formatApiError(raw, fallback = 'Request failed. Please try again.') {
  if (raw == null) return fallback;
  let text = typeof raw === 'string' ? raw : String(raw);
  text = text.trim();
  if (!text) return fallback;

  const hpcMatch = text.match(
    /Yale HPC is currently unavailable\.[^\n]*/i
  );
  if (hpcMatch) return hpcMatch[0].trim();

  // Strip common log prefixes if a raw log line leaked into the UI.
  text = text.replace(
    /^(?:ERROR|WARNING|INFO):(?:app|werkzeug|root):\s*/i,
    ''
  );
  text = text.replace(
    /^Baseline batch submission error for [^:]+:\s*/i,
    ''
  );
  text = text.replace(/^Error in [^:]+:\s*/i, '');
  text = text.replace(
    /^No OpenSSH ControlMaster[^\n]*/i,
    DEFAULT_HPC_UNAVAILABLE
  );
  if (/ssh_login_bouchet|ControlMaster/i.test(text)) {
    return DEFAULT_HPC_UNAVAILABLE;
  }

  return text.trim() || fallback;
}

export { DEFAULT_HPC_UNAVAILABLE };
