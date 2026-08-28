import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ZENN_USERNAME = process.env.ZENN_USERNAME;
if (!ZENN_USERNAME) {
  console.error('Error: ZENN_USERNAME environment variable is not set.');
  process.exit(1);
}

const API_BASE_URL = `https://zenn.dev/api/articles?username=${encodeURIComponent(ZENN_USERNAME)}&order=latest`;
const FETCHED_DIR = join(__dirname, '..', 'fetched', 'zenn', 'bookmarks');
const META_PATH = join(FETCHED_DIR, 'zenn-bookmarks-meta.json');
const REQUEST_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_META = { completeFetchDone: false };

function yearMonth(savedAt) {
  return savedAt.slice(0, 7);
}

function monthlyFilePath(ym) {
  return join(FETCHED_DIR, `zenn-bookmarks-${ym}.json`);
}

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

function getArticles(payload) {
  if (Array.isArray(payload?.articles)) return payload.articles;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeArticle(article) {
  const slug = article.path_slug || article.slug;
  const path = article.path || (slug ? `/${ZENN_USERNAME}/articles/${slug}` : '');
  const url = path.startsWith('http') ? path : `https://zenn.dev${path}`;
  const savedAt = article.published_at || article.body_updated_at || article.created_at || '';
  const topics = Array.isArray(article.topics)
    ? article.topics.map((topic) => topic?.name).filter(Boolean)
    : [];

  return {
    title: article.title || url,
    url,
    description: article.excerpt || article.title || '',
    savedAt,
    tags: topics,
  };
}

async function fetchItems(existingUrlSet, isIncremental) {
  const allNewItems = [];
  let page = 1;

  while (true) {
    const url = `${API_BASE_URL}&page=${page}`;
    console.log(`Fetching Zenn API page=${page} ...`);
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const payload = await res.json();
    const articles = getArticles(payload);
    console.log(`  -> ${articles.length} articles`);
    if (articles.length === 0) break;

    const items = articles
      .map(normalizeArticle)
      .filter((item) => item.url && item.savedAt);

    const newItems = items.filter((item) => !existingUrlSet.has(item.url));
    allNewItems.push(...newItems);
    console.log(`  -> ${newItems.length} new items`);

    if (isIncremental && newItems.length === 0) {
      console.log('No new items found, stopping fetch');
      break;
    }

    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  return allNewItems;
}

async function main() {
  mkdirSync(FETCHED_DIR, { recursive: true });

  const existing = [];
  const monthlyFiles = readdirSync(FETCHED_DIR)
    .filter((f) => /^zenn-bookmarks-\d{4}-\d{2}\.json$/.test(f))
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
  console.log(`Loaded ${existing.length} existing Zenn items from ${monthlyFiles.length} files`);

  if (meta.completeFetchDone) {
    console.log('Fetching new Zenn items (incremental)...');
  } else {
    console.log('Fetching all Zenn items (full fetch)...');
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
    console.log('No new Zenn items to add.');
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
    const merged = [...byUrl.values()].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
    writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`  ${ym}: wrote ${merged.length} items (${items.length} new) to ${filePath}`);
    totalWritten += items.length;
  }

  console.log(`Saved ${totalWritten} new Zenn items across ${byMonth.size} monthly file(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
