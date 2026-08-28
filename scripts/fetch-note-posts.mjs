import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTE_USERNAME = process.env.NOTE_USERNAME;
if (!NOTE_USERNAME) {
  console.error('Error: NOTE_USERNAME environment variable is not set.');
  process.exit(1);
}

const NOTE_SESSION_COOKIE = process.env.NOTE_SESSION_COOKIE;
const API_BASE_URL = `https://note.com/api/v2/creators/${NOTE_USERNAME}/contents?kind=note`;
const FETCHED_DIR = join(__dirname, '..', 'fetched', 'note', 'posts');
const META_PATH = join(FETCHED_DIR, 'note-posts-meta.json');
const REQUEST_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_META = { completeFetchDone: false };

function yearMonth(savedAt) {
  return savedAt.slice(0, 7);
}

function monthlyFilePath(ym) {
  return join(FETCHED_DIR, `note-posts-${ym}.json`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(value) {
  const timestamp = value ? Date.parse(value) : NaN;
  if (Number.isNaN(timestamp)) return '';
  return new Date(timestamp).toISOString();
}

function parseNoteItem(item) {
  const key = item?.key ?? '';
  const url = item?.noteUrl ?? item?.url ?? (key ? `https://note.com/${NOTE_USERNAME}/n/${key}` : '');
  const savedAt = toIsoDate(item?.publishAt ?? item?.publishedAt ?? item?.createdAt);
  const body = typeof item?.body === 'string' ? stripHtml(item.body) : '';
  const description = (item?.description ?? body).trim();

  return {
    title: (item?.name ?? item?.title ?? '').trim() || url,
    url,
    description: description || null,
    savedAt,
    tags: Array.isArray(item?.hashtags) ? item.hashtags.map((t) => t?.name).filter(Boolean) : [],
  };
}

async function fetchApiPage(page) {
  const url = `${API_BASE_URL}&page=${page}`;
  const headers = { accept: 'application/json' };
  if (NOTE_SESSION_COOKIE) headers.cookie = NOTE_SESSION_COOKIE;

  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url}) ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchItems(existingUrlSet, isIncremental) {
  const allNewItems = [];
  let page = 1;

  while (true) {
    console.log(`Fetching note API page=${page} ...`);
    const payload = await fetchApiPage(page);
    const contents = payload?.data?.contents ?? [];
    if (!Array.isArray(contents) || contents.length === 0) break;

    const items = contents.map(parseNoteItem).filter((item) => item.url && item.savedAt);
    const newItems = items.filter((item) => !existingUrlSet.has(item.url));
    allNewItems.push(...newItems);
    console.log(`  -> ${items.length} items (${newItems.length} new)`);

    if (isIncremental && newItems.length === 0) {
      console.log('No new items found, stopping incremental fetch');
      break;
    }

    const isLastPage = payload?.data?.isLastPage ?? false;
    if (isLastPage) break;

    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  return allNewItems;
}

async function main() {
  mkdirSync(FETCHED_DIR, { recursive: true });

  const existing = [];
  const monthlyFiles = readdirSync(FETCHED_DIR)
    .filter((f) => /^note-posts-\d{4}-\d{2}\.json$/.test(f))
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

  const existingUrlSet = new Set(existing.map((item) => item.url));
  console.log(`Loaded ${existing.length} existing note posts from ${monthlyFiles.length} files`);
  console.log(meta.completeFetchDone ? 'Fetching note posts (incremental)...' : 'Fetching note posts (full fetch)...');

  const newItems = await fetchItems(existingUrlSet, meta.completeFetchDone);
  console.log(`Fetched ${newItems.length} new note posts`);

  if (!meta.completeFetchDone) {
    writeFileSync(META_PATH, JSON.stringify({ completeFetchDone: true }, null, 2), 'utf-8');
  }

  if (newItems.length === 0) {
    console.log('No new note posts to add.');
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
    const byUrl = new Map(monthExisting.map((item) => [item.url, item]));
    for (const item of items) byUrl.set(item.url, item);
    const merged = [...byUrl.values()].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`  ${ym}: wrote ${merged.length} posts (${items.length} new) to ${filePath}`);
    totalWritten += items.length;
  }

  console.log(`Saved ${totalWritten} new note posts across ${byMonth.size} monthly file(s)`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`Fetch failed: ${message}`);
  process.exit(1);
});
