// GET /v1/whoami has TWO shapes (auth-contract §3). When the session is
// MFA-gated (`mfa_required === true && mfa_satisfied === false`), the backend
// TRIMS the payload to identity + MFA flags only — NO `assignments` /
// `effective_permissions` / `org_ids` / `scope_*`. Screens must never assume
// the authz surface is present.
//
// Pure and unit-tested; state/SessionContext.jsx is the only wiring.

// True when the payload is the trimmed, MFA-gated shape: the gate will 401 any
// protected call until the user satisfies MFA. `mfa_satisfied` is the exact
// gate outcome, so trust it over inferring from field presence.
export function isWhoamiMfaGated(whoami) {
  return whoami?.mfa_required === true && whoami?.mfa_satisfied === false;
}

// org_ids is absent in the trimmed shape — always read through a default so a
// trimmed payload doesn't look like "no orgs".
export function whoamiOrgIds(whoami) {
  return Array.isArray(whoami?.org_ids) ? whoami.org_ids : [];
}

// Classifies a whoami payload into the session state the app should render:
//   'mfa_required' — trimmed, MFA-gated: render the MFA-completion screen
//   'no_access'    — authenticated but granted no orgs for this app
//   'ready'        — full shape with at least one org
// The MFA check comes FIRST: a trimmed payload has no org_ids, which must not
// be misread as no_access.
export function classifyWhoami(whoami) {
  if (isWhoamiMfaGated(whoami)) return 'mfa_required';
  if (whoamiOrgIds(whoami).length === 0) return 'no_access';
  return 'ready';
}
