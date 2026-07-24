// Display name for a visit's inline host_contact (dto.HostContactIn mirrors:
// a freeform `name` OR first/last parts, all optional). Null when there is
// no usable name — callers render their own "—".
export function hostContactName(hostContact) {
  if (!hostContact) return null;
  const name = hostContact.name
    || [hostContact.first_name, hostContact.last_name].filter(Boolean).join(' ');
  return name || null;
}
