import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HATENA_USERNAME = process.env.HATENA_USERNAME;
if (!HATENA_USERNAME) {
  console.error('Error: HATENA_USERNAME environment variable is not set.');
  process.exit(1);
}
const JSON_BASE_URL = `https://b.hatena.ne.jp/${HATENA_USERNAME}/bookmark.json`;
const OUTPUT_PATH = join(__dirname, '..', 'fetched', 'hatena-bookmarks.json');
const META_PATH = join(__dirname, '..', 'fetched', 'hatena-bookmarks-meta.json');
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_META = { completeFetchDone: false };

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function parseBookmarks(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => item && item.url)
    .map((item) => ({
      title: item.title ?? '',
      url: item.url,
      description: item.comment ?? '',
      savedAt: item.created_datetime ?? '',
      tags: Array.isArray(item.tags) ? item.tags : [],
    }));
}

async function fetchItems(existingUrlSet, isIncremental) {
  const allNewItems = [];
  let offset = 0;

  while (true) {
    const url = `${JSON_BASE_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`Fetching offset=${offset} ...`);
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();

    const items = parseBookmarks(data);
    console.log(`  -> ${items.length} items`);

    if (items.length === 0) break;

    const newItems = items.filter((item) => !existingUrlSet.has(item.url));
    allNewItems.push(...newItems);
    console.log(`  -> ${newItems.length} new items`);

    if (isIncremental && newItems.length === 0) {
      console.log('No new items found, stopping fetch');
      break;
    }

    if (items.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
    await sleep(REQUEST_DELAY_MS);
  }

  return allNewItems;
}

async function main() {
  let existing = [];
  if (existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    } catch {
      console.warn('Could not parse existing file, starting fresh');
    }
  }

  let meta = { ...DEFAULT_META };
  if (existsSync(META_PATH)) {
    try {
      meta = JSON.parse(readFileSync(META_PATH, 'utf-8'));
    } catch {
      console.warn('Could not parse metadata file, will perform full fetch');
    }
  }

  const existingUrlSet = new Set(existing.map((item) => item.url));
  console.log(`Loaded ${existing.length} existing bookmarks`);

  if (meta.completeFetchDone) {
    console.log('Fetching new Hatena Bookmarks (incremental)...');
  } else {
    console.log('Fetching all Hatena Bookmarks (full fetch)...');
  }

  const newItems = await fetchItems(existingUrlSet, meta.completeFetchDone);
  console.log(`Fetched ${newItems.length} new items`);

  if (!meta.completeFetchDone) {
    try {
      writeFileSync(META_PATH, JSON.stringify({ completeFetchDone: true }, null, 2), 'utf-8');
      console.log('Full fetch complete. Future runs will use incremental mode.');
    } catch (err) {
      console.warn(`Warning: could not write metadata file to ${META_PATH}: ${err.message}`);
    }
  }

  if (newItems.length === 0) {
    console.log('No new bookmarks to add.');
    return;
  }

  const byUrl = new Map(existing.map((item) => [item.url, item]));
  for (const item of newItems) byUrl.set(item.url, item);

  const merged = [...byUrl.values()].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );

  writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`Saved ${merged.length} bookmarks (${newItems.length} new) to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
