import { expect, test, vi } from 'vitest';
import { listAllPages } from './listAllPages.js';

test('follows meta.cursor to exhaustion and flattens the pages', async () => {
  const pages = {
    undefined: { data: [1, 2], meta: { cursor: 'c1' } },
    c1: { data: [3], meta: { cursor: 'c2' } },
    c2: { data: [4], meta: {} }, // absent cursor = last page
  };
  const fetchPage = vi.fn(async ({ cursor }) => pages[String(cursor)]);
  await expect(listAllPages(fetchPage)).resolves.toEqual([1, 2, 3, 4]);
  expect(fetchPage).toHaveBeenCalledTimes(3);
  expect(fetchPage).toHaveBeenCalledWith({ limit: 200, cursor: undefined });
  expect(fetchPage).toHaveBeenCalledWith({ limit: 200, cursor: 'c1' });
});

test('a single page without a cursor returns immediately', async () => {
  const fetchPage = vi.fn(async () => ({ data: ['only'], meta: { limit: 50 } }));
  await expect(listAllPages(fetchPage)).resolves.toEqual(['only']);
  expect(fetchPage).toHaveBeenCalledTimes(1);
});

test('maxPages caps a cursor that never drains', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const fetchPage = vi.fn(async () => ({ data: ['x'], meta: { cursor: 'again' } }));
    const items = await listAllPages(fetchPage, { maxPages: 3 });
    expect(items).toEqual(['x', 'x', 'x']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});
