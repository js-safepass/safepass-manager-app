import { useEffect, useState, useRef } from 'react';
import { Alert, Button, Card, Col, Container, Row, Spinner } from 'react-bootstrap';
import AuthBrand from '../components/AuthBrand.jsx';
import { useAuth } from '../state/useAuth.js';
import { buildAuthorizeUrl, exchangeCodeForToken } from '../lib/cognitoHostedUi.js';
import { generateCodeChallenge, generateCodeVerifier } from '../lib/pkce.js';
import { getUserFacingError } from '../lib/userErrors.js';
import { isNative } from '../lib/platform.js';

const storageKeys = {
  verifier: 'manager_pkce_verifier',
  state: 'manager_pkce_state',
};

// Staff sign-in for the SafePass Manager app.
// Uses Cognito Hosted UI + PKCE and keeps tokens in memory only.
//
// On native (Capacitor), OAuth opens in an in-app browser (SFSafariViewController /
// Chrome Custom Tabs) and the callback arrives via the registered URL scheme
// (safepassmanager://localhost/auth/callback) through the App plugin's appUrlOpen event.

const Login = () => {
  const { signIn, signOut, status, error } = useAuth();
  const [localError, setLocalError] = useState(null);
  const [loading, setLoading] = useState(false);
  const listenerRef = useRef(null);

  useEffect(() => {
    if (window.location.pathname === '/auth/logout') {
      signOut({ hosted: false }); // already past the hosted logout redirect
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
        const accessToken = tokenResponse.access_token || tokenResponse.id_token;
        if (!accessToken) {
          throw new Error('Token response missing access token.');
        }
        await signIn({ token: accessToken, refreshToken: tokenResponse.refresh_token });
      } catch (exchangeError) {
        setLocalError(getUserFacingError(exchangeError, 'signIn'));
      } finally {
        setLoading(false);
      }
    };

    exchange();
  }, [signIn]);

  // Register the native URL callback listener on mount. The exchange handler
  // lives inside the effect (it is only reachable from this listener), which
  // also keeps the dependency array honest.
  useEffect(() => {
    if (!isNative) return;

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
        const accessToken = tokenResponse.access_token || tokenResponse.id_token;
        if (!accessToken) {
          throw new Error('Token response missing access token.');
        }
        await signIn({ token: accessToken, refreshToken: tokenResponse.refresh_token });
      } catch (err) {
        setLocalError(getUserFacingError(err, 'signIn'));
      } finally {
        setLoading(false);
      }
    };

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

  // Layout mirrors sentinel-ui's views/pages/auth/login.jsx — SafePass auth
  // pages stay visually identical across apps (user requirement 2026-07-10:
  // consistent auth flows keep people comfortable); this app's identity
  // appears only in the AuthBrand subtext.
  return (
    <div className="login-content">
      <Container className="dvh-100">
        <Row className="align-items-center justify-content-center h-100">
          <Col lg={6}>
            <Card>
              <Card.Body className="text-center">
                <div className="auth-logo my-4 d-flex justify-content-center">
                  <AuthBrand subtext="Visitor Management" />
                </div>

                <p className="text-secondary mb-4">
                  The SafePass system requires authentication. <br />
                  Please sign in to access the application.
                </p>

                <div className="spacer" style={{ height: '20px' }}></div>

                <div className="d-flex justify-content-center">
                  <Button
                    variant="primary"
                    onClick={handleHostedLogin}
                    disabled={loading || status === 'signing_in'}
                    className="me-2"
                  >
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Redirecting…
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                </div>

                {(localError || error) && (
                  <Alert variant="danger" className="mt-4 mb-0">
                    {localError || error}
                  </Alert>
                )}

                <div className="spacer" style={{ height: '20px' }}></div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Login;
