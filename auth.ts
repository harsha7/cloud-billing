// JumpCloud single sign-on (OpenID Connect, Authorization Code + PKCE, no client secret).
// The ID token is kept in sessionStorage for this tab only and sent to the data functions
// as "auth_token" in the request body, so they can verify it (signature, audience, group).

export const AUTH_CONFIG = {
  issuer: 'https://oauth.id.jumpcloud.com/',
  authorizeUrl: 'https://oauth.id.jumpcloud.com/oauth2/auth',
  tokenUrl: 'https://oauth.id.jumpcloud.com/oauth2/token',
  // One CloudSpend OIDC app per JumpCloud organization. People type their email on one sign-in
  // screen and are sent to the organization whose username prefix matches (first match wins;
  // anything that matches none goes to the first organization).
  orgs: [
    { id: 'ric', label: 'RIC', clientId: 'bba53a9d-1ba5-4c39-b2bf-f6b1cc7c23bf', emailPrefixes: ['ric-'] },
    { id: 'rediron', label: 'RedIron', clientId: '6632b7c7-f8f7-4a72-8060-a3ef24c697c7', emailPrefixes: ['ri-'] },
  ] as { id: string; label: string; clientId: string; emailPrefixes: string[] }[],
  // Who may sign in is decided in JumpCloud: the user groups ticked on the Cloudspend app.
  // Optionally also restrict here by group name (empty list = anyone JumpCloud lets in).
  allowedGroups: [] as string[],
  // 'off'  = no sign-in
  // 'test' = sign-in only when the page is opened with ?sso=1 (for trying it out)
  // 'on'   = everyone must sign in
  mode: 'on' as 'off' | 'test' | 'on',
};

const K = { token: 'cs.auth.idtoken', pending: 'cs.auth.pending', test: 'cs.auth.test' };

const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* storage blocked */ } },
};

export const redirectUri = () => window.location.origin + ((import.meta as any).env?.BASE_URL || '/');

export function authEnabled(): boolean {
  if (AUTH_CONFIG.mode === 'on') return true;
  if (AUTH_CONFIG.mode === 'off') return false;
  const q = new URLSearchParams(window.location.search);
  if (q.get('sso') === '1') ss.set(K.test, '1');
  if (q.get('sso') === '0') ss.del(K.test);
  return ss.get(K.test) === '1';
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export type AuthUser = { name: string; email: string; groups: string[]; exp: number; org: string; raw: Record<string, any> };

const orgForAud = (aud: any) => {
  const list = Array.isArray(aud) ? aud : [aud];
  return AUTH_CONFIG.orgs.find(o => list.includes(o.clientId));
};

function decodeJwt(token: string): Record<string, any> | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(Array.from(atob(part + '==='.slice((part.length + 3) % 4)))
      .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(json);
  } catch { return null; }
}

function groupsOf(claims: Record<string, any>): string[] {
  const g = claims.memberOf ?? claims.groups ?? [];
  return (Array.isArray(g) ? g : [g]).map(String);
}

function toUser(token: string | null): AuthUser | null {
  if (!token) return null;
  const c = decodeJwt(token);
  if (!c || typeof c.exp !== 'number') return null;
  const name = c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || c.preferred_username || c.username || c.email || 'Signed in';
  const org = orgForAud(c.aud);
  if (!org) return null;
  return { name, email: c.email || '', groups: groupsOf(c), exp: c.exp, org: org.label, raw: c };
}

export function currentUser(): AuthUser | null {
  const u = toUser(ss.get(K.token));
  if (!u) return null;
  if (u.exp * 1000 <= Date.now() + 15000) { ss.del(K.token); return null; }
  return u;
}

export const isAllowed = (u: AuthUser | null) => !!u && (AUTH_CONFIG.allowedGroups.length === 0
  || u.groups.some(g => AUTH_CONFIG.allowedGroups.some(a => a.toLowerCase() === g.toLowerCase())));

/** The token the data functions check, or undefined when sign-in is not in use. */
export function authToken(): string | undefined {
  if (!authEnabled()) return undefined;
  return currentUser() ? ss.get(K.token) || undefined : undefined;
}

/** Adds the sign-in token to a request body for the data functions. */
export function withAuth<T extends object>(body: T): T & { auth_token?: string } {
  const t = authToken();
  return t ? { ...body, auth_token: t } : body;
}

/** Which JumpCloud organization an email belongs to, by its username prefix. */
export function orgForEmail(email: string) {
  const e = email.trim().toLowerCase();
  return AUTH_CONFIG.orgs.find(o => o.emailPrefixes.some(p => e.startsWith(p.toLowerCase())))
    || AUTH_CONFIG.orgs.find(o => o.id === 'rediron') || AUTH_CONFIG.orgs[0];
}

export async function startSignIn(email: string) {
  const org = orgForEmail(email);
  const verifier = randomString(48);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(16), nonce = randomString(16);
  ss.set(K.pending, JSON.stringify({ verifier, state, nonce, clientId: org.clientId }));
  const p = new URLSearchParams({
    response_type: 'code', client_id: org.clientId, redirect_uri: redirectUri(),
    scope: 'openid profile email', state, nonce,
    code_challenge: b64url(digest), code_challenge_method: 'S256',
    login_hint: email.trim(),
  });
  window.location.assign(`${AUTH_CONFIG.authorizeUrl}?${p.toString()}`);
}

/** Finishes the sign-in when JumpCloud sends the browser back with ?code=…&state=… */
export async function completeSignInIfReturning(): Promise<{ handled: boolean; error?: string }> {
  const q = new URLSearchParams(window.location.search);
  const code = q.get('code'), state = q.get('state'), err = q.get('error');
  if (!code && !err) return { handled: false };
  const clean = () => window.history.replaceState({}, document.title, redirectUri());
  if (err) { clean(); return { handled: true, error: `${err}: ${q.get('error_description') || 'sign-in was not completed'}` }; }
  let pending: { verifier: string; state: string; nonce: string; clientId: string } | null = null;
  try { pending = JSON.parse(ss.get(K.pending) || 'null'); } catch { pending = null; }
  ss.del(K.pending);
  if (!pending || pending.state !== state) { clean(); return { handled: true, error: 'The sign-in response did not match this tab. Please sign in again.' }; }
  try {
    const resp = await fetch(AUTH_CONFIG.tokenUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri(), client_id: pending.clientId, code_verifier: pending.verifier }).toString(),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok || !j.id_token) throw new Error(j.error_description || j.error || `token request failed (HTTP ${resp.status})`);
    const c = decodeJwt(j.id_token);
    const aud = c && (Array.isArray(c.aud) ? c.aud : [c.aud]);
    if (!c || !aud || c.iss !== AUTH_CONFIG.issuer || !aud.includes(pending.clientId) || !orgForAud(c.aud)) throw new Error('the sign-in token was not issued for CloudSpend');
    if (c.nonce && c.nonce !== pending.nonce) throw new Error('the sign-in token did not match this request');
    ss.set(K.token, j.id_token);
    clean();
    return { handled: true };
  } catch (e: any) {
    clean();
    return { handled: true, error: e?.message || String(e) };
  }
}

export function signOut() {
  ss.del(K.token);
  ss.del(K.pending);
}
