import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HATENA_USERNAME = process.env.HATENA_USERNAME;
if (!HATENA_USERNAME) {
  console.error('Error: HATENA_USERNAME environment variable is not set.');
  process.exit(1);
}
const RSS_BASE_URL = `https://b.hatena.ne.jp/${HATENA_USERNAME}/bookmark.rss`;
const FETCHED_DIR = join(__dirname, '..', 'fetched');
const META_PATH = join(FETCHED_DIR, 'hatena-bookmarks-meta.json');
const REQUEST_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_META = { completeFetchDone: false };

function yearMonth(savedAt) {
  // Returns "YYYY-MM" from an ISO 8601 date string, e.g. "2026-03-08T02:05:53Z" -> "2026-03"
  return savedAt.slice(0, 7);
}

function monthlyFilePath(ym) {
  return join(FETCHED_DIR, `hatena-bookmarks-${ym}.json`);
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

function decodeXmlEntities(text) {
  if (!text) return '';

  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function getFirstTagText(xml, tagName) {
  const escapedTag = tagName.replace(':', '\\:');
  const match = xml.match(new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`, 'i'));
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

function getAllTagText(xml, tagName) {
  const escapedTag = tagName.replace(':', '\\:');
  const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`, 'gi');
  return [...xml.matchAll(regex)].map((match) => decodeXmlEntities(match[1].trim())).filter(Boolean);
}

function parseBookmarksFromRss(xml) {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  return items
    .map((match) => {
      const itemXml = match[0];
      return {
        title: getFirstTagText(itemXml, 'title'),
        url: getFirstTagText(itemXml, 'link'),
        description: getFirstTagText(itemXml, 'description'),
        savedAt: getFirstTagText(itemXml, 'dc:date'),
        tags: getAllTagText(itemXml, 'dc:subject'),
      };
    })
    .filter((item) => item.url);
}

async function fetchRssPageRaw(page) {
  const url = `${RSS_BASE_URL}?page=${page}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

function parseTotalCount(xml) {
  const channelBlock = xml.match(/<channel[\s\S]*?<\/channel>/i)?.[0] ?? '';
  const desc = getFirstTagText(channelBlock, 'description');
  const match = desc.match(/\(([\d,]+)\)/);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
}

async function fetchItems(existingUrlSet, isIncremental) {
  const allNewItems = [];

  const firstXml = await fetchRssPageRaw(1);
  const totalCount = parseTotalCount(firstXml);
  const itemsPerPage = 20;
  const totalPages = totalCount != null
    ? Math.ceil(totalCount / itemsPerPage)
    : null;

  if (totalPages != null) {
    console.log(`Total bookmarks: ${totalCount} -> ${totalPages} pages`);
  }

  let rssPage = 1;
  while (totalPages == null ? true : rssPage <= totalPages) {
    console.log(`Fetching RSS page=${rssPage}${totalPages != null ? `/${totalPages}` : ''} ...`);
    const xml = rssPage === 1 ? firstXml : await fetchRssPageRaw(rssPage);
    const items = parseBookmarksFromRss(xml);

    console.log(`  -> ${items.length} items`);

    if (items.length === 0) break;

    const newItems = items.filter((item) => !existingUrlSet.has(item.url));
    allNewItems.push(...newItems);
    console.log(`  -> ${newItems.length} new items`);

    if (isIncremental && newItems.length === 0) {
      console.log('No new items found, stopping fetch');
      break;
    }

    rssPage += 1;
    if (rssPage <= (totalPages ?? Infinity)) await sleep(REQUEST_DELAY_MS);
  }

  return allNewItems;
}

async function main() {
  // Load all existing bookmarks from monthly files
  const existing = [];
  const monthlyFiles = readdirSync(FETCHED_DIR)
    .filter((f) => /^hatena-bookmarks-\d{4}-\d{2}\.json$/.test(f))
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
  console.log(`Loaded ${existing.length} existing bookmarks from ${monthlyFiles.length} files`);

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
    const byUrl = new Map(monthExisting.map((item) => [item.url, item]));
    for (const item of items) byUrl.set(item.url, item);
    const merged = [...byUrl.values()].sort(
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
