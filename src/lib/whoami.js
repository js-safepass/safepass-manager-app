// GET /v1/whoami returns ONE shape: identity + the full authz surface
// (assignments / effective_permissions / org_ids / scope_*). MFA is enforced
// by Cognito at the pool level (MfaConfiguration=REQUIRED, 2026-07-17) — a
// valid token IS proof of MFA, so the backend never trims the payload.
//
// Pure and unit-tested; state/SessionContext.jsx is the only wiring.

// Always read org_ids through a default so a malformed payload doesn't crash
// org reconciliation.
export function whoamiOrgIds(whoami) {
  return Array.isArray(whoami?.org_ids) ? whoami.org_ids : [];
}

// Classifies a whoami payload into the session state the app should render:
//   'no_access' — authenticated but granted no orgs for this app
//   'ready'     — at least one granted org
export function classifyWhoami(whoami) {
  if (whoamiOrgIds(whoami).length === 0) return 'no_access';
  return 'ready';
}
