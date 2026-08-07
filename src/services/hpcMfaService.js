const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function getApiUrl(endpoint) {
  const path = endpoint.replace(/^\//, '');
  if (API_BASE_URL) return `${API_BASE_URL}/${path}`;
  return `/${path}`;
}

const defaultHeaders = {
  'ngrok-skip-browser-warning': 'true',
};

/**
 * Tell the HPC SSH status watcher to poll more aggressively
 * (e.g. right after a job submit that needs Bouchet).
 */
export function notifyHpcSshPending() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hpc-ssh-pending'));
  }
}

/**
 * Poll OpenSSH ControlMaster status from the proxy.
 * When status is mfa_required / failed, an operator must run
 * ./ssh_login_bouchet.sh on the API host (browser Duo is not used).
 */
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
