const defaultScopes = ['openid', 'email', 'profile'];

function normalizeDomain(domain) {
  if (!domain) return '';
  return domain.endsWith('/') ? domain.slice(0, -1) : domain;
}

export function getHostedUiConfig() {
  const domain = normalizeDomain(import.meta.env.VITE_COGNITO_DOMAIN);
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

  // Redirect/logout URIs derive from wherever the app is actually served —
  // localhost:5317 in dev, the workers.dev URL before DNS exists, the custom
  // domain after — so one build works everywhere and nothing is baked in.
  //
  // This holds on native too: the Capacitor shell runs as a LIVE web view
  // (server.url = the hosted https origin, see capacitor.config.ts), so
  // `window.location.origin` is that same https origin and Cognito redirects
  // back to it in-place. No custom-scheme deep link — the app navigates the
  // web view itself through the Hosted UI (2026-07-13). The VITE_ vars remain
  // as explicit overrides only. (Cognito must have each serving origin's
  // callback/logout URLs registered on the app client.)
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI
    || `${window.location.origin}/auth/callback`;
  const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI
    || `${window.location.origin}/auth/logout`;

  return {
    domain,
    clientId,
    redirectUri,
    logoutUri,
  };
}

export function buildAuthorizeUrl({ state, codeChallenge, scopes = defaultScopes }) {
  const { domain, clientId, redirectUri } = getHostedUiConfig();
  if (!domain || !clientId || !redirectUri) {
    throw new Error('Missing Cognito Hosted UI configuration');
  }

  const url = new URL(`${domain}/oauth2/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function buildLogoutUrl() {
  const { domain, clientId, logoutUri } = getHostedUiConfig();
  if (!domain || !clientId || !logoutUri) {
    throw new Error('Missing Cognito Hosted UI configuration');
  }

  const url = new URL(`${domain}/logout`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('logout_uri', logoutUri);
  return url.toString();
}

// Shared POST to the Cognito `/oauth2/token` endpoint for both the
// authorization-code and refresh grants (one seam; the deferred DPoP header
// retrofits here once, not per-grant).
//
// The body is read as TEXT and parsed AFTER the ok check: the token endpoint
// sits behind the auth.safepass.com bridge / Cloudflare in production, which
// can return a non-JSON error page (HTML 502, empty 504). Parsing before the
// status check would throw a bare JSON SyntaxError that the silent-refresh
// path can't distinguish from a dead refresh token — surfacing the HTTP status
// instead keeps that decision honest (2026-07-13 review).
async function postToTokenEndpoint(params, fallbackMessage) {
  const { domain, clientId } = getHostedUiConfig();
  if (!domain || !clientId) {
    throw new Error('Missing Cognito Hosted UI configuration');
  }

  const body = new URLSearchParams(params);
  body.set('client_id', clientId);

  const response = await fetch(`${domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null; // non-JSON body (gateway error page) — handled below
    }
  }

  if (!response.ok) {
    const message = payload?.error_description || payload?.error
      || `${fallbackMessage} (HTTP ${response.status})`;
    throw new Error(message);
  }
  if (!payload) {
    throw new Error(`${fallbackMessage}: unexpected response from the token endpoint`);
  }
  return payload;
}

// Refresh-token grant. Cognito does not rotate the refresh token on this grant
// by default — callers keep their existing refresh token unless the response
// carries a new one.
export function refreshTokens({ refreshToken }) {
  return postToTokenEndpoint(
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    'Token refresh failed',
  );
}

export function exchangeCodeForToken({ code, codeVerifier }) {
  const { redirectUri } = getHostedUiConfig();
  if (!redirectUri) {
    throw new Error('Missing Cognito Hosted UI configuration');
  }
  return postToTokenEndpoint(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    },
    'Token exchange failed',
  );
}
