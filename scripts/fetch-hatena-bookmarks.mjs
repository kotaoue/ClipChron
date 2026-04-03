import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HATENA_USERNAME = process.env.HATENA_USERNAME;
if (!HATENA_USERNAME) {
  console.error('Error: HATENA_USERNAME environment variable is not set.');
  process.exit(1);
}
const RSS_BASE_URL = `https://b.hatena.ne.jp/${HATENA_USERNAME}/rss`;
const OUTPUT_PATH = join(__dirname, '..', 'fetched', 'hatena-bookmarks.json');
const PAGE_SIZE = 20;
const REQUEST_DELAY_MS = 1000;

function unwrapCDATA(text) {
  const m = text.trim().match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return m ? m[1] : text.trim();
}

function getElementText(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = xml.match(regex);
  return m ? unwrapCDATA(m[1]) : '';
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const itemXml = m[1];
    const title = getElementText(itemXml, 'title');
    const url = getElementText(itemXml, 'link');
    const description = getElementText(itemXml, 'description');
    const savedAt = getElementText(itemXml, 'dc:date');

    const tags = [];
    const subjRegex = /<dc:subject[^>]*>([\s\S]*?)<\/dc:subject>/g;
    let s;
    while ((s = subjRegex.exec(itemXml)) !== null) {
      const subject = unwrapCDATA(s[1]);
      if (subject) tags.push(subject);
    }

    if (url) items.push({ title, url, description, savedAt, tags });
  }
  return items;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllItems() {
  const allItems = [];
  let offset = 0;

  while (true) {
    const url = offset === 0 ? RSS_BASE_URL : `${RSS_BASE_URL}?of=${offset}`;
    console.log(`Fetching offset=${offset} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const xml = await res.text();

    const items = parseRSS(xml);
    console.log(`  -> ${items.length} items`);
    allItems.push(...items);

    if (items.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
    await sleep(REQUEST_DELAY_MS);
  }

  return allItems;
}

async function main() {
  console.log('Fetching all Hatena Bookmarks...');
  const newItems = await fetchAllItems();
  console.log(`Fetched ${newItems.length} items in total`);

  let existing = [];
  if (existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    } catch {
      console.warn('Could not parse existing file, starting fresh');
    }
  }

  const byUrl = new Map(existing.map((item) => [item.url, item]));
  for (const item of newItems) byUrl.set(item.url, item);

  const merged = [...byUrl.values()].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );

  writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`Saved ${merged.length} bookmarks (${newItems.length} fetched) to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
