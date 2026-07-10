// Persistence layer for the kiosk's DPoP keypair + session token, backed by
// iOS Keychain on native (see secureStorage.js, SecureStoragePlugin.swift).
//
// Why: the WebView reloads on Cloudflare deploys, iPad reboots, iOS memory
// recycling, app updates, and force-quits. In-memory refs alone leave the
// backend session orphaned and unrecoverable. With persistence, the kiosk
// can re-attach to its existing session after any reload as long as the
// server hasn't revoked it.
//
// Web is intentionally non-persistent — browser sessions are dev/admin
// contexts where reload-survival is not a requirement.
//
// See docs/session-recovery-keychain.md for the full design.

import { secureStorageSet, secureStorageGet, secureStorageRemove } from './secureStorage.js';
import { exportPublicJwk } from './dpop.js';

const STORAGE_KEY = 'kiosk.active_session';
// Schema version history:
//   v1: original — no `ui` field. Entries that survived a hydration cycle
//       under early v2 reader code got re-persisted as v1-empty, perpetuating
//       a missing company name.
//   v2: added `ui` { companyName, companyLogo, companyLogoMediaId }.
//   v3: added `cognito_user_sub` (Cognito subject claim of the staff user
//       who created the session). Restore verifies it matches the current
//       kioskJwt; mismatched / missing sub triggers wipe + fresh Setup.
//       Also tightens the missing-critical-fields check on read.
//
// When bumping SCHEMA_VERSION:
//   1. Add an entry to MIGRATIONS below mapping the previous version to
//      either an upgrade function (additive change — synthesizes the new
//      field on existing entries) or `null` (breaking change — entry is
//      no longer recoverable and the user must re-Setup).
//   2. If unsure, prefer `null` — wipe-and-restart is always safe.
const SCHEMA_VERSION = 3;

// Migration table: from-version → (parsed) => upgraded payload | null.
// Return null to signal a breaking change; restoreKioskCredentials wipes
// the entry and falls through to fresh Setup. Return the upgraded payload
// (with bumped `version`) for additive changes that can be safely upgraded
// in place. Missing entries are treated as breaking (wipe).
//
// v1 → v2 added an optional `ui` field (could have been additive — but
// v2 entries themselves are unrecoverable as below, so the v1 path never
// reaches a current schema regardless).
// v2 → v3 added required `cognito_user_sub` which cannot be synthesized
// from a v2 entry without re-Setup, so this is breaking.
const MIGRATIONS = {
  1: () => null,
  2: () => null,
};

function migrateToCurrent(parsed) {
  // Walk the migration chain until parsed.version === SCHEMA_VERSION or a
  // step returns null (breaking change / unknown version → caller wipes).
  // Cap iterations as a safety net against a misconfigured table that loops.
  let steps = 0;
  while (parsed && parsed.version !== SCHEMA_VERSION) {
    if (++steps > 16) return null;
    const migrate = MIGRATIONS[parsed.version];
    if (!migrate) return null;
    parsed = migrate(parsed);
  }
  return parsed;
}

const DPOP_KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
const DPOP_KEY_USAGES = ['sign', 'verify'];

/**
 * Persist the kiosk's session credentials to iOS Keychain (native only).
 * Web is a no-op.
 *
 * Call this anywhere session_token or the DPoP keypair changes — start,
 * refresh, applySession, etc. Centralizing through this helper guarantees
 * the persisted entry tracks in-memory state.
 *
 * @param {Object} args
 * @param {string} args.sessionToken
 * @param {CryptoKeyPair} args.dpopKeyPair
 * @param {string} [args.sessionId]
 * @param {string} args.stationId
 * @param {string} args.orgId
 * @param {string} args.cognitoUserSub               Cognito `sub` claim of the staff
 *                                                   user who created the session.
 *                                                   Restore compares against the
 *                                                   currently-signed-in user; mismatch
 *                                                   triggers wipe.
 * @param {Object} [args.ui]                         UI snapshot (company name + logo)
 * @param {string} [args.ui.companyName]
 * @param {string} [args.ui.companyLogo]             Resolved logo URL (or empty)
 * @param {string} [args.ui.companyLogoMediaId]      Logo media id for re-resolution
 * @returns {Promise<void>}
 */
export async function persistKioskCredentials({
  sessionToken,
  dpopKeyPair,
  sessionId,
  stationId,
  orgId,
  cognitoUserSub,
  ui,
}) {
  if (!sessionToken || !dpopKeyPair?.privateKey) return;
  // Don't persist a session without the user binding — without `sub` we
  // can't safely verify ownership on restore. Skip silently; in-memory
  // session continues to work, but no Keychain entry is written.
  if (!cognitoUserSub) return;
  const dpopPrivateJwk = await crypto.subtle.exportKey('jwk', dpopKeyPair.privateKey);
  const payload = {
    version: SCHEMA_VERSION,
    session_token: sessionToken,
    session_id: sessionId || null,
    dpop_private_jwk: dpopPrivateJwk,
    station_id: stationId || null,
    org_id: orgId || null,
    cognito_user_sub: cognitoUserSub,
    ui: ui ? {
      companyName: ui.companyName || '',
      companyLogo: ui.companyLogo || '',
      companyLogoMediaId: ui.companyLogoMediaId || '',
    } : null,
    stored_at: new Date().toISOString(),
  };
  await secureStorageSet(STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Attempt to restore previously-persisted kiosk credentials.
 * Returns null if nothing is persisted, the schema version is unrecognized,
 * a required field is missing/empty, the JWK fails to import, or the
 * persisted `cognito_user_sub` doesn't match the current signed-in user.
 * In every failure case the entry is wiped so the next launch starts clean.
 *
 * Re-imports the persisted DPoP private JWK as a CryptoKey so the caller
 * can hydrate dpopRef directly. Also reconstructs publicJwk from the
 * private key for completeness.
 *
 * @param {Object} [options]
 * @param {string} [options.expectedCognitoUserSub]  When provided, restore is
 *   rejected unless the persisted `cognito_user_sub` matches. Defends against
 *   restoring a previous user's session on a shared device.
 * @returns {Promise<{
 *   sessionToken: string,
 *   sessionId: string|null,
 *   stationId: string|null,
 *   orgId: string|null,
 *   cognitoUserSub: string,
 *   ui: object|null,
 *   dpopKeyPair: CryptoKeyPair,
 *   publicJwk: JsonWebKey,
 * }|null>}
 */
export async function restoreKioskCredentials({ expectedCognitoUserSub } = {}) {
  const raw = await secureStorageGet(STORAGE_KEY);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await wipeKioskCredentials();
    return null;
  }
  // Run through the migration chain. Returns null for breaking-change
  // versions or unknown versions, in which case we wipe and force fresh
  // Setup (same effective behavior as the prior strict version check).
  parsed = migrateToCurrent(parsed);
  if (!parsed) {
    await wipeKioskCredentials();
    return null;
  }
  // Required-field check. session_token / dpop_private_jwk / station_id /
  // org_id / cognito_user_sub are all essential for a usable restored session.
  // Missing any of them means the entry is corrupted; wipe and force fresh Setup.
  if (
    !parsed.session_token ||
    !parsed.dpop_private_jwk ||
    !parsed.station_id ||
    !parsed.org_id ||
    !parsed.cognito_user_sub
  ) {
    await wipeKioskCredentials();
    return null;
  }
  // User-binding check. If a different staff user is signed in than the one
  // who created this session, do not resurrect it. Wipe and let them start
  // their own Setup → Launch cycle.
  if (expectedCognitoUserSub && parsed.cognito_user_sub !== expectedCognitoUserSub) {
    await wipeKioskCredentials();
    return null;
  }

  let privateKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'jwk',
      parsed.dpop_private_jwk,
      DPOP_KEY_ALGORITHM,
      true,
      ['sign'],
    );
  } catch {
    await wipeKioskCredentials();
    return null;
  }

  // Reconstruct the public JWK from the private one so callers don't need
  // to re-derive it. Strip the private fields and toggle key_ops.
  const publicJwk = { ...parsed.dpop_private_jwk };
  delete publicJwk.d;
  publicJwk.key_ops = ['verify'];

  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      DPOP_KEY_ALGORITHM,
      true,
      ['verify'],
    );
  } catch {
    await wipeKioskCredentials();
    return null;
  }

  const dpopKeyPair = { privateKey, publicKey };

  return {
    sessionToken: parsed.session_token,
    sessionId: parsed.session_id || null,
    stationId: parsed.station_id || null,
    orgId: parsed.org_id || null,
    cognitoUserSub: parsed.cognito_user_sub,
    ui: parsed.ui ? {
      companyName: parsed.ui.companyName || '',
      companyLogo: parsed.ui.companyLogo || '',
      companyLogoMediaId: parsed.ui.companyLogoMediaId || '',
    } : null,
    dpopKeyPair,
    publicJwk: await exportPublicJwk(dpopKeyPair),
  };
}

/**
 * Remove persisted kiosk credentials. Idempotent.
 * Call from every wipe trigger (sign-out, end-session, idle timeout,
 * server revocation responses, station mismatch, first-run-after-install).
 *
 * @returns {Promise<void>}
 */
export async function wipeKioskCredentials() {
  await secureStorageRemove(STORAGE_KEY);
}
