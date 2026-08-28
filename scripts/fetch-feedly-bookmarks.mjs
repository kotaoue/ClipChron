import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDLY_ACCESS_TOKEN = process.env.FEEDLY_ACCESS_TOKEN;
if (!FEEDLY_ACCESS_TOKEN) {
  console.error('Error: FEEDLY_ACCESS_TOKEN environment variable is not set.');
  process.exit(1);
}

const FETCHED_DIR = join(__dirname, '..', 'fetched', 'feedly', 'bookmarks');
const META_PATH = join(FETCHED_DIR, 'feedly-bookmarks-meta.json');
const API_BASE_URL = 'https://cloud.feedly.com/v3';
const REQUEST_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_META = { completeFetchDone: false };

function yearMonth(savedAt) {
  return savedAt.slice(0, 7);
}

function monthlyFilePath(ym) {
  return join(FETCHED_DIR, `feedly-bookmarks-${ym}.json`);
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: ['Bearer', FEEDLY_ACCESS_TOKEN].join(' '),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getSavedStreamId() {
  const profile = await fetchJsonWithTimeout(`${API_BASE_URL}/profile`);
  if (!profile?.id) throw new Error('Could not determine Feedly user ID from /v3/profile');
  return `${profile.id}/tag/global.saved`;
}

function toBookmark(item) {
  const url = item?.alternate?.find((a) => a?.href)?.href ?? '';
  const savedAtMs = item?.published ?? item?.updated ?? item?.crawled;
  if (!item?.id || !url || !savedAtMs) return null;

  return {
    id: item.id,
    title: item.title || url,
    url,
    description: stripHtml(item?.summary?.content ?? ''),
    savedAt: new Date(savedAtMs).toISOString(),
    tags: Array.isArray(item?.categories)
      ? item.categories.map((c) => c?.label).filter(Boolean)
      : [],
  };
}

async function fetchItems(streamId, existingIdSet, isIncremental) {
  const allNewItems = [];
  let continuation = null;
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      streamId,
      count: '100',
      ranked: 'newest',
    });
    if (continuation) params.set('continuation', continuation);

    console.log(`Fetching Feedly page=${page} ...`);
    const data = await fetchJsonWithTimeout(`${API_BASE_URL}/streams/contents?${params.toString()}`);
    const items = Array.isArray(data?.items) ? data.items.map(toBookmark).filter(Boolean) : [];
    console.log(`  -> ${items.length} items`);

    const newItems = items.filter((item) => !existingIdSet.has(item.id));
    allNewItems.push(...newItems);
    console.log(`  -> ${newItems.length} new items`);

    if (isIncremental && newItems.length === 0) {
      console.log('No new items found, stopping fetch');
      break;
    }

    continuation = data?.continuation ?? null;
    if (!continuation) break;

    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  return allNewItems;
}

async function main() {
  mkdirSync(FETCHED_DIR, { recursive: true });

  const existing = [];
  const monthlyFiles = readdirSync(FETCHED_DIR)
    .filter((f) => /^feedly-bookmarks-\d{4}-\d{2}\.json$/.test(f))
    .sort();

  for (const file of monthlyFiles) {
    try {
      const raw = readFileSync(join(FETCHED_DIR, file), 'utf-8');
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) existing.push(...entries);
    } catch {
      console.warn(`Warning: could not parse ${file}, skipping`);
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

  const existingIdSet = new Set(existing.map((item) => item.id));
  console.log(`Loaded ${existing.length} existing bookmarks from ${monthlyFiles.length} files`);

  const streamId = await getSavedStreamId();
  if (meta.completeFetchDone) {
    console.log('Fetching new Feedly bookmarks (incremental)...');
  } else {
    console.log('Fetching all Feedly bookmarks (full fetch)...');
  }

  const newItems = await fetchItems(streamId, existingIdSet, meta.completeFetchDone);
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

  const byMonth = new Map();
  for (const item of newItems) {
    const ym = yearMonth(item.savedAt);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(item);
  }

  let totalWritten = 0;
  for (const [ym, items] of [...byMonth.entries()].sort()) {
    const filePath = monthlyFilePath(ym);
    let monthExisting = [];
    if (existsSync(filePath)) {
      try {
        monthExisting = JSON.parse(readFileSync(filePath, 'utf-8'));
      } catch {
        console.warn(`Warning: could not parse ${filePath}, overwriting`);
      }
    }
    const byId = new Map(monthExisting.map((item) => [item.id, item]));
    for (const item of items) byId.set(item.id, item);
    const merged = [...byId.values()].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
    writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`  ${ym}: wrote ${merged.length} bookmarks (${items.length} new) to ${filePath}`);
    totalWritten += items.length;
  }

  console.log(`Saved ${totalWritten} new bookmarks across ${byMonth.size} monthly file(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
