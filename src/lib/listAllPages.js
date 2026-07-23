// Walk a keyset-paginated list endpoint to exhaustion and return one flat
// array. Manager list endpoints return { data, meta.cursor } (opaque cursor,
// ABSENT on the last page — the canonical end signal; never infer from page
// size). Mirrors sentinel-ui's core.js util.listAllPages guardrails so a
// buggy cursor can't loop forever.
//
// fetchPage receives ({ limit, cursor }) and must return the page envelope.
export async function listAllPages(fetchPage, { limit = 200, maxPages = 20 } = {}) {
  const items = [];
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await fetchPage({ limit, cursor });
    items.push(...(res?.data || []));
    cursor = res?.meta?.cursor;
    if (!cursor) return items;
  }
  console.warn(`[listAllPages] stopped after ${maxPages} pages — cursor never drained`);
  return items;
}
