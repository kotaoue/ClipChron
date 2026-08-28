import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QIITA_ACCESS_TOKEN = process.env.QIITA_ACCESS_TOKEN;
const QIITA_USERNAME = process.env.QIITA_USERNAME;

if (!QIITA_ACCESS_TOKEN) {
  console.error('Error: QIITA_ACCESS_TOKEN environment variable is not set.');
  process.exit(1);
}
if (!QIITA_USERNAME) {
  console.error('Error: QIITA_USERNAME environment variable is not set.');
  process.exit(1);
}

const API_BASE_URL = `https://qiita.com/api/v2/users/${QIITA_USERNAME}/stocks`;
const FETCHED_DIR = join(__dirname, '..', 'fetched', 'qiita', 'stocks');
const META_PATH = join(FETCHED_DIR, 'qiita-stocks-meta.json');
const REQUEST_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const PER_PAGE = 100;
const DEFAULT_META = { completeFetchDone: false };

function yearMonth(savedAt) {
  // Returns "YYYY-MM" from an ISO 8601 date string, e.g. "2026-03-08T02:05:53+09:00" -> "2026-03"
  return savedAt.slice(0, 7);
}

function monthlyFilePath(ym) {
  return join(FETCHED_DIR, `qiita-stocks-${ym}.json`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${QIITA_ACCESS_TOKEN}`
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(page) {
  const url = `${API_BASE_URL}?page=${page}&per_page=${PER_PAGE}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const totalCount = Number(res.headers.get('total-count') ?? '0');
  const items = await res.json();
  return { items, totalCount };
}

function mapItem(raw) {
  // Qiita stocks API returns Item objects; created_at is the article creation date.
  // There is no "stocked_at" field in the Qiita API v2 response, so we use created_at.
  const rawDescription = typeof raw.body === 'string'
    ? raw.body.replace(/[#*`\[\]!|>~\-_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
    : '';
  return {
    id: raw.id,
    title: raw.title,
    url: raw.url,
    description: rawDescription,
    savedAt: raw.created_at,
    tags: (raw.tags ?? []).map((t) => t.name),
  };
}

async function fetchItems(existingIdSet, isIncremental) {
  const allNewItems = [];

  const { items: firstPageItems, totalCount } = await fetchPage(1);
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / PER_PAGE) : 1;

  console.log(`Total stocks: ${totalCount} -> ${totalPages} pages`);

  const firstMapped = firstPageItems.map(mapItem);
  const firstNewItems = firstMapped.filter((item) => !existingIdSet.has(item.id));
  allNewItems.push(...firstNewItems);
  console.log(`Page 1/${totalPages}: ${firstPageItems.length} items, ${firstNewItems.length} new`);

  if (isIncremental && firstNewItems.length === 0) {
    console.log('No new items found on page 1, stopping fetch');
    return allNewItems;
  }

  for (let page = 2; page <= totalPages; page++) {
    await sleep(REQUEST_DELAY_MS);
    console.log(`Fetching page=${page}/${totalPages} ...`);
    const { items } = await fetchPage(page);
    const mapped = items.map(mapItem);
    const newItems = mapped.filter((item) => !existingIdSet.has(item.id));
    allNewItems.push(...newItems);
    console.log(`  -> ${newItems.length} new items`);

    if (isIncremental && newItems.length === 0) {
      console.log('No new items found, stopping fetch');
      break;
    }
  }

  return allNewItems;
}

async function main() {
  mkdirSync(FETCHED_DIR, { recursive: true });

  const existing = [];
  const monthlyFiles = readdirSync(FETCHED_DIR)
    .filter((f) => /^qiita-stocks-\d{4}-\d{2}\.json$/.test(f))
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
  console.log(`Loaded ${existing.length} existing stocks from ${monthlyFiles.length} files`);

  if (meta.completeFetchDone) {
    console.log('Fetching new Qiita stocks (incremental)...');
  } else {
    console.log('Fetching all Qiita stocks (full fetch)...');
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
    console.log('No new stocks to add.');
    return;
  }

  // Group new items by year-month, then merge into the appropriate monthly files
  const byMonth = new Map();
  for (const item of newItems) {
    if (!item.savedAt) continue;
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
    console.log(`  ${ym}: wrote ${merged.length} stocks (${items.length} new) to ${filePath}`);
    totalWritten += items.length;
  }

  console.log(`Saved ${totalWritten} new stocks across ${byMonth.size} monthly file(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
