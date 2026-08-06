const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function getApiUrl(endpoint) {
  const path = endpoint.replace(/^\//, '');
  if (API_BASE_URL) return `${API_BASE_URL}/${path}`;
  return `/${path}`;
}

const defaultHeaders = {
  'ngrok-skip-browser-warning': 'true',
};

/** Tell the Duo MFA watcher to poll more aggressively (e.g. right after job submit). */
export function notifyHpcSshPending() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hpc-ssh-pending'));
  }
}

export async function fetchMfaStatus() {
  const response = await fetch(getApiUrl('api/auth/mfa-status'), {
    cache: 'no-store',
    headers: {
      ...defaultHeaders,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`MFA status failed (${response.status})`);
  }
  return response.json();
}

export async function submitMfaResponse({ choice, authId }) {
  const response = await fetch(getApiUrl('api/auth/mfa-response'), {
    method: 'POST',
    headers: {
      ...defaultHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      choice,
      auth_id: authId,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `MFA response failed (${response.status})`);
  }
  return data;
}
