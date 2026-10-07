const TOKEN_KEY = 'elimu_access_token';
const REFRESH_KEY = 'elimu_refresh_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function getRefreshToken() {
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}
export function setTokens(access: string | null, refresh: string | null) {
  try {
    if (access) localStorage.setItem(TOKEN_KEY, access); else localStorage.removeItem(TOKEN_KEY);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh); else localStorage.removeItem(REFRESH_KEY);
  } catch { /* noop */ }
}
export function clearTokens() {
  setTokens(null, null);
}

async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', refresh_token: rt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return data.access_token as string;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  request?: { method: string; url: string };
  constructor(status: number, message: string, extra?: { code?: string; request?: { method: string; url: string } }) {
    super(message);
    this.status = status;
    this.code = extra?.code;
    this.request = extra?.request;
  }
}

export async function api<T = any>(path: string, options: Omit<RequestInit, 'body'> & { body?: any } = {}): Promise<T> {
  const { body, ...rest } = options;
  let token = getToken();
  const doFetch = (t: string | null) =>
    fetch(path, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...(rest.headers || {}),
      },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  let res = await doFetch(token);
  if (res.status === 401 && token) {
    const fresh = await tryRefresh();
    if (fresh) {
      res = await doFetch(fresh);
    } else {
      clearTokens();
      window.dispatchEvent(new Event('elimu:session-expired'));
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const method = (rest.method as string) || 'GET';
    throw new ApiError(res.status, data?.error || data?.message || `Request failed (${res.status})`, {
      code: data?.code,
      request: { method, url: path },
    });
  }
  return data as T;
}

export const get = <T = any>(path: string) => api<T>(path, { method: 'GET' });
export const post = <T = any>(path: string, body?: any) => api<T>(path, { method: 'POST', body });
export const put = <T = any>(path: string, body?: any) => api<T>(path, { method: 'PUT', body });
export const del = <T = any>(path: string, body?: any) => api<T>(path, { method: 'DELETE', body });
