import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../state/useAuth.js';
import { buildAuthorizeUrl, exchangeCodeForToken } from '../lib/cognitoHostedUi.js';
import { generateCodeChallenge, generateCodeVerifier } from '../lib/pkce.js';
import { getUserFacingError } from '../lib/userErrors.js';
import { isNative } from '../lib/platform.js';

const storageKeys = {
  verifier: 'kiosk_pkce_verifier',
  state: 'kiosk_pkce_state',
};

// The login page for the kiosk application, allowing users to authenticate and access the kiosk interface.
// Uses Cognito Hosted UI + PKCE and keeps tokens in memory only.
//
// On native (Capacitor), OAuth opens in an in-app browser (SFSafariViewController /
// Chrome Custom Tabs) and the callback arrives via the registered URL scheme
// (safepasskiosk://localhost/auth/callback) through the App plugin's appUrlOpen event.

const Login = () => {
  const { signIn, signOut, status, error } = useAuth();
  const [localError, setLocalError] = useState(null);
  const [loading, setLoading] = useState(false);
  const listenerRef = useRef(null);

  useEffect(() => {
    if (window.location.pathname === '/auth/logout') {
      signOut();
      window.history.replaceState({}, document.title, '/');
    }
  }, [signOut]);

  // Web-only: handle the OAuth callback via URL query params after redirect.
  useEffect(() => {
    if (isNative) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const errorParam = params.get('error');

    if (errorParam) {
      setLocalError(getUserFacingError(params.get('error_description') || errorParam, 'signIn'));
      return;
    }

    if (!code) return;

    const storedState = sessionStorage.getItem(storageKeys.state);
    const verifier = sessionStorage.getItem(storageKeys.verifier);

    if (!storedState || storedState !== returnedState) {
      setLocalError('Invalid sign-in state. Please try again.');
      return;
    }
    if (!verifier) {
      setLocalError('Missing PKCE verifier. Please try again.');
      return;
    }

    const exchange = async () => {
      try {
        setLoading(true);
        const tokenResponse = await exchangeCodeForToken({ code, codeVerifier: verifier });
        sessionStorage.removeItem(storageKeys.state);
        sessionStorage.removeItem(storageKeys.verifier);
        window.history.replaceState({}, document.title, '/');
        const kioskToken = tokenResponse.access_token || tokenResponse.id_token;
        if (!kioskToken) {
          throw new Error('Token response missing access token.');
        }
        await signIn({ token: kioskToken });
      } catch (exchangeError) {
        setLocalError(getUserFacingError(exchangeError, 'signIn'));
      } finally {
        setLoading(false);
      }
    };

    exchange();
  }, [signIn]);

  // Native: exchange the auth code received via appUrlOpen callback.
  const handleNativeCallback = async (url) => {
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      const returnedState = parsed.searchParams.get('state');
      const errorParam = parsed.searchParams.get('error');

      // Close the in-app browser
      const { Browser } = await import('@capacitor/browser');
      await Browser.close().catch(() => {});

      if (errorParam) {
        setLocalError(getUserFacingError(
          parsed.searchParams.get('error_description') || errorParam, 'signIn',
        ));
        setLoading(false);
        return;
      }

      if (!code) return;

      const storedState = sessionStorage.getItem(storageKeys.state);
      const verifier = sessionStorage.getItem(storageKeys.verifier);

      if (!storedState || storedState !== returnedState) {
        setLocalError('Invalid sign-in state. Please try again.');
        setLoading(false);
        return;
      }
      if (!verifier) {
        setLocalError('Missing PKCE verifier. Please try again.');
        setLoading(false);
        return;
      }

      const tokenResponse = await exchangeCodeForToken({ code, codeVerifier: verifier });
      sessionStorage.removeItem(storageKeys.state);
      sessionStorage.removeItem(storageKeys.verifier);
      const kioskToken = tokenResponse.access_token || tokenResponse.id_token;
      if (!kioskToken) {
        throw new Error('Token response missing access token.');
      }
      await signIn({ token: kioskToken });
    } catch (err) {
      setLocalError(getUserFacingError(err, 'signIn'));
    } finally {
      setLoading(false);
    }
  };

  // Register the native URL callback listener on mount.
  useEffect(() => {
    if (!isNative) return;

    let cancelled = false;

    const setup = async () => {
      const { App } = await import('@capacitor/app');
      if (cancelled) return;
      listenerRef.current = await App.addListener('appUrlOpen', ({ url }) => {
        if (url && url.includes('/auth/callback')) {
          handleNativeCallback(url);
        }
      });
    };

    setup();

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
    };
  }, [signIn]);

  const handleHostedLogin = async () => {
    setLocalError(null);
    setLoading(true);
    try {
      const state = crypto.randomUUID();
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      sessionStorage.setItem(storageKeys.state, state);
      sessionStorage.setItem(storageKeys.verifier, verifier);
      const url = buildAuthorizeUrl({ state, codeChallenge: challenge });

      if (isNative) {
        // Open Cognito in an in-app browser; the callback will arrive via appUrlOpen.
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url, presentationStyle: 'fullscreen' });
      } else {
        window.location.assign(url);
      }
    } catch (err) {
      setLoading(false);
      setLocalError(getUserFacingError(err, 'signIn'));
    }
  };

  return (
    <div>
      <h1>Staff Sign-In</h1>
      <p>Sign in with your SafePass account to continue</p>
      <button className="cta" onClick={handleHostedLogin} disabled={loading || status === 'signing_in'}>
        {loading ? 'Redirecting...' : 'Sign In'}
      </button>
      {(localError || error) && <p style={{ color: 'var(--sp-text-error)' }}>{localError || error}</p>}
    </div>
  );
};

export default Login;
