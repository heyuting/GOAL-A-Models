const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
