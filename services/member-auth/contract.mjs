export const AUTH_PATH = '/api/member/auth';
export const COOKIE_PREFIX = 'barcode_id';
const mutations = new Set(['sign-up/email','sign-in/email','sign-out','send-verification-email','request-password-reset','reset-password','update-user','revoke-sessions']);
export function allowedEndpoint(path, method) {
  if (method === 'POST') return mutations.has(path);
  return method === 'GET' && (path === 'get-session' || path === 'verify-email' || /^reset-password\/[A-Za-z0-9_-]{1,256}$/.test(path));
}
export function memberCookies(header = '') {
  return header.split(';').map(value => value.trim()).filter(value => /^(?:__Secure-)?barcode_id\.[A-Za-z0-9_.-]+=/.test(value)).join('; ');
}
export function safeRedirect(value, origin) {
  try { const url = new URL(value, origin); return url.origin === origin && (url.pathname === '/account' || url.pathname === '/account/reset-password') ? url.href : null; } catch { return null; }
}
export function normalizeBody(path, body, origin) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request');
  const fields = {
    'sign-up/email':['email','password','name','callbackURL'],
    'sign-in/email':['email','password','callbackURL','rememberMe'],
    'sign-out':[], 'send-verification-email':['email','callbackURL'],
    'request-password-reset':['email','redirectTo'],
    'reset-password':['token','newPassword'], 'update-user':['name'], 'revoke-sessions':[],
  }[path];
  if (!fields || Object.keys(body).some(key => !fields.includes(key))) throw new Error('Unsupported account field');
  const result = {...body};
  for (const key of ['callbackURL','redirectTo']) if (key in result && !safeRedirect(result[key],origin)) throw new Error('Invalid return link');
  if ('name' in result) {
    if (typeof result.name !== 'string' || !result.name.trim() || result.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(result.name)) throw new Error('Display name must be 1 to 80 characters');
    result.name = result.name.trim();
  }
  if (path === 'sign-up/email' || path === 'send-verification-email') {
    const callback = result.callbackURL ? new URL(safeRedirect(result.callbackURL,origin)) : null;
    result.callbackURL = callback?.pathname === '/account' && !callback.hash ? callback.href : `${origin}/account`;
  }
  if (path === 'request-password-reset') result.redirectTo = `${origin}/account/reset-password`;
  return result;
}
