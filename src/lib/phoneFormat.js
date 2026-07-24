// As-you-type US phone formatting for the visitor form — a legacy-app
// ergonomic carried forward (plan step 3). Deliberately conservative:
// anything starting with '+' is international and left completely alone;
// otherwise the digits format as (xxx) xxx-xxxx, capped at 10. The wire
// value stays whatever the field shows — the backend accepts free-form.
//
// Pure and unit-tested; VisitorFormModal is the wiring.
export function formatPhoneInput(raw) {
  if (!raw) return '';
  const s = String(raw);
  if (s.trimStart().startsWith('+')) return s;
  const d = s.replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
