import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HATENA_USERNAME = process.env.HATENA_USERNAME;
if (!HATENA_USERNAME) {
  console.error('Error: HATENA_USERNAME environment variable is not set.');
  process.exit(1);
}
const RSS_BASE_URL = `https://b.hatena.ne.jp/${HATENA_USERNAME}/bookmark.rss`;
const OUTPUT_PATH = join(__dirname, '..', 'fetched', 'hatena-bookmarks.json');
const META_PATH = join(__dirname, '..', 'fetched', 'hatena-bookmarks-meta.json');
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

async function fetchRssPage(page) {
  const url = `${RSS_BASE_URL}?page=${page}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const xml = await res.text();
  return parseBookmarksFromRss(xml);
}

async function fetchItems(existingUrlSet, isIncremental) {
  const allNewItems = [];
  let rssPage = 1;

  while (true) {
    console.log(`Fetching RSS page=${rssPage} ...`);
    const items = await fetchRssPage(rssPage);

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
