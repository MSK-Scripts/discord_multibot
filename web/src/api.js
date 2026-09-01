/**
 * The API client.
 *
 * Every mutating request echoes the CSRF cookie back in a header. That is the
 * double-submit pattern: a cross-origin attacker can make the browser SEND the
 * cookie but cannot READ it to build the matching header.
 */

const CSRF_COOKIE = 'mb_csrf';

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error || `Request failed (${status})`);
    this.status = status;
    this.detail = payload?.detail;
    // Set when this member has no access at all. Lets the UI show a
    // "limited to staff" screen instead of an endless sign-in loop.
    this.portalClosed = payload?.portalClosed === true;
  }
}

async function request(path, { method = 'GET', body, raw = null } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = 'application/octet-stream';
  if (method !== 'GET') headers['x-csrf-token'] = readCookie(CSRF_COOKIE);

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });

  // The session is gone or expired, so back to the Discord login.
  if (res.status === 401) {
    window.location.href = '/auth/login';
    return new Promise(() => {}); // never resolves, we are navigating away
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  me: () => request('/me'),

  status: () => request('/status'),
  guild: () => request('/guild'),

  config: () => request('/config'),
  patchConfig: (patch) => request('/config', { method: 'PATCH', body: { patch } }),
  putConfigRaw: (text) => request('/config/raw', { method: 'PUT', body: { text } }),

  texts: () => request('/texts'),
  patchTexts: (patch) => request('/texts', { method: 'PATCH', body: { patch } }),
  putTextsRaw: (text) => request('/texts/raw', { method: 'PUT', body: { text } }),

  env: () => request('/env'),
  patchEnv: (patch) => request('/env', { method: 'PATCH', body: { patch } }),

  bot: () => request('/bot'),
  botLogs: () => request('/bot/logs'),
  botAction: (action) => request(`/bot/${action}`, { method: 'POST' }),

  points: (limit = 25) => request(`/points?limit=${limit}`),
  adjustPoints: (userId, delta) => request(`/points/${userId}`, { method: 'POST', body: { delta } }),

  announce: (payload) => request('/announce', { method: 'POST', body: payload }),
  templates: () => request('/announce/templates'),
  saveTemplate: (row) => request('/announce/templates', { method: 'PUT', body: row }),
  deleteTemplate: (id) => request(`/announce/templates/${id}`, { method: 'DELETE' }),

  access: () => request('/access'),
  saveAccess: (row) => request('/access', { method: 'PUT', body: row }),
  deleteAccess: (type, id) => request(`/access/${type}/${id}`, { method: 'DELETE' }),

  settings: () => request('/settings'),
  saveSettings: (accent) => request('/settings', { method: 'PUT', body: { accent } }),
  uploadFavicon: (file) => request('/settings/favicon', { method: 'POST', raw: file }),
  clearFavicon: () => request('/settings/favicon', { method: 'DELETE' }),
};

export async function logout() {
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': readCookie(CSRF_COOKIE) },
  }).catch(() => {});
  window.location.href = '/auth/login';
}
