import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
const X_USER_ID = process.env.X_USER_ID;

if (!X_BEARER_TOKEN) {
  console.error('Error: X_BEARER_TOKEN environment variable is not set.');
  process.exit(1);
}
if (!X_USER_ID) {
  console.error('Error: X_USER_ID environment variable is not set.');
  process.exit(1);
}

const API_BASE_URL = `https://api.twitter.com/2/users/${X_USER_ID}/liked_tweets`;
const FETCHED_DIR = join(__dirname, '..', 'fetched', 'x', 'likes');
const META_PATH = join(FETCHED_DIR, 'x-likes-meta.json');
const REQUEST_DELAY_MS = 3500; // X API: 5 requests per 15 min for app-only auth
const FETCH_TIMEOUT_MS = 30000;
const MAX_RESULTS = 100;
const DEFAULT_META = { completeFetchDone: false };

function yearMonth(dateStr) {
  // Returns "YYYY-MM" from an ISO 8601 date string, e.g. "2024-03-08T02:05:53Z" -> "2024-03"
  return dateStr.slice(0, 7);
}

function monthlyFilePath(ym) {
  return join(FETCHED_DIR, `x-likes-${ym}.json`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLikesPage(paginationToken) {
  const params = new URLSearchParams({
    max_results: String(MAX_RESULTS),
    'tweet.fields': 'created_at,text',
  });
  if (paginationToken) {
    params.set('pagination_token', paginationToken);
  }
  const url = `${API_BASE_URL}?${params}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: 'Bearer ' + X_BEARER_TOKEN },
  });

  if (res.status === 429) {
    const resetHeader = res.headers.get('x-rate-limit-reset');
    const waitMs = resetHeader
      ? Math.max(0, Number(resetHeader) * 1000 - Date.now()) + 1000
      : 15 * 60 * 1000;
    console.log(`Rate limited. Waiting ${Math.round(waitMs / 1000)}s...`);
    await sleep(waitMs);
    return fetchLikesPage(paginationToken);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json();
}

async function fetchItems(existingIdSet, isIncremental) {
  const allNewItems = [];
  let paginationToken = null;
  let page = 1;

  while (true) {
    console.log(`Fetching page=${page}...`);
    const data = await fetchLikesPage(paginationToken);

    const tweets = data.data ?? [];
    console.log(`  -> ${tweets.length} tweets`);

    if (tweets.length === 0) break;

    const newItems = tweets
      .filter((t) => !existingIdSet.has(t.id))
      .map((t) => ({
        id: t.id,
        text: t.text,
        url: `https://x.com/i/web/status/${t.id}`,
        createdAt: t.created_at,
      }));

    allNewItems.push(...newItems);
    console.log(`  -> ${newItems.length} new items`);

    if (isIncremental && newItems.length === 0) {
      console.log('No new items found, stopping fetch');
      break;
    }

    paginationToken = data.meta?.next_token;
    if (!paginationToken) break;

    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  return allNewItems;
}

async function main() {
  // Ensure the output directory exists
  if (!existsSync(FETCHED_DIR)) {
    mkdirSync(FETCHED_DIR, { recursive: true });
  }

  // Load all existing likes from monthly files
  const existing = [];
  const monthlyFiles = readdirSync(FETCHED_DIR)
    .filter((f) => /^x-likes-\d{4}-\d{2}\.json$/.test(f))
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
  console.log(`Loaded ${existing.length} existing likes from ${monthlyFiles.length} files`);

  if (meta.completeFetchDone) {
    console.log('Fetching new X likes (incremental)...');
  } else {
    console.log('Fetching all X likes (full fetch)...');
  }

  const newItems = await fetchItems(existingIdSet, meta.completeFetchDone);
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
    console.log('No new likes to add.');
    return;
  }

  // Group new items by year-month (based on tweet creation date), then merge into monthly files
  const byMonth = new Map();
  for (const item of newItems) {
    if (!item.createdAt) continue;
    const ym = yearMonth(item.createdAt);
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
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`  ${ym}: wrote ${merged.length} likes (${items.length} new) to ${filePath}`);
    totalWritten += items.length;
  }

  console.log(`Saved ${totalWritten} new likes across ${byMonth.size} monthly file(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
