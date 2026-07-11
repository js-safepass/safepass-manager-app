import { isNative } from './platform.js';

const defaultScopes = ['openid', 'email', 'profile'];

function normalizeDomain(domain) {
  if (!domain) return '';
  return domain.endsWith('/') ? domain.slice(0, -1) : domain;
}

export function getHostedUiConfig() {
  const domain = normalizeDomain(import.meta.env.VITE_COGNITO_DOMAIN);
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

  // In the native app, use the custom-scheme redirect URI so the OS routes
  // the OAuth callback back into the Capacitor WebView.
  const redirectUri = isNative && import.meta.env.VITE_COGNITO_NATIVE_REDIRECT_URI
    ? import.meta.env.VITE_COGNITO_NATIVE_REDIRECT_URI
    : import.meta.env.VITE_COGNITO_REDIRECT_URI;
  const logoutUri = isNative && import.meta.env.VITE_COGNITO_NATIVE_LOGOUT_URI
    ? import.meta.env.VITE_COGNITO_NATIVE_LOGOUT_URI
    : import.meta.env.VITE_COGNITO_LOGOUT_URI;

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

export async function exchangeCodeForToken({ code, codeVerifier }) {
  const { domain, clientId, redirectUri } = getHostedUiConfig();
  if (!domain || !clientId || !redirectUri) {
    throw new Error('Missing Cognito Hosted UI configuration');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', clientId);
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  body.set('code_verifier', codeVerifier);

  const response = await fetch(`${domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload.error_description || payload.error || 'Token exchange failed';
    throw new Error(message);
  }

  return payload;
}

// Refresh-token grant against the bridge token endpoint. Cognito does not
// rotate the refresh token on this grant by default — callers keep their
// existing refresh token unless the response carries a new one.
export async function refreshTokens({ refreshToken }) {
  const { domain, clientId } = getHostedUiConfig();
  if (!domain || !clientId) {
    throw new Error('Missing Cognito Hosted UI configuration');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('client_id', clientId);
  body.set('refresh_token', refreshToken);

  const response = await fetch(`${domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload.error_description || payload.error || 'Token refresh failed';
    throw new Error(message);
  }

  return payload;
}
