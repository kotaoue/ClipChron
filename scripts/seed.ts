import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { books, readBooks, bookmarks as hatenaBookmarks } from '../src/db/schema';

type BookmeterEntry = {
  no: number;
  title: string;
  url: string;
  author: string;
  authorUrl: string;
  thumb: string;
  date: string;
};

export async function seed() {
  await seedWishList();
  await seedReadBooks();
  await seedHatenaBookmarks();
}

async function seedWishList() {
  const filePath = path.join(process.cwd(), 'fetched', 'bookmeter', 'wish-list.json');

  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found. Skipping wish list seed.`);
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries: BookmeterEntry[] = JSON.parse(raw);

  await db
    .insert(books)
    .values(entries)
    .onConflictDoUpdate({
      target: books.no,
      set: {
        title: sql`excluded.title`,
        url: sql`excluded.url`,
        author: sql`excluded.author`,
        authorUrl: sql`excluded.author_url`,
        thumb: sql`excluded.thumb`,
        date: sql`excluded.date`,
        updatedAt: new Date(),
      },
    });

  console.log(`Seeded ${entries.length} wish list books`);
}

async function seedReadBooks() {
  const fetchedDir = path.join(process.cwd(), 'fetched', 'bookmeter', 'read');
  const files = fs
    .readdirSync(fetchedDir)
    .filter((f) => /^bookmeter-read-\d{4}-\d{2}\.json$/.test(f))
    .sort();

  let total = 0;
  for (const file of files) {
    const yearMonth = file.replace('bookmeter-read-', '').replace('.json', '');
    try {
      const raw = fs.readFileSync(path.join(fetchedDir, file), 'utf-8');
      const parsed = JSON.parse(raw);
      // Read book files use { books: [...] } format; fall back to direct array for compatibility
      const entries: BookmeterEntry[] = Array.isArray(parsed) ? parsed : (parsed.books ?? []);
      if (entries.length === 0) continue;

      await db
        .insert(readBooks)
        .values(entries.map((e) => ({ ...e, yearMonth })))
        .onConflictDoUpdate({
          target: [readBooks.yearMonth, readBooks.no],
          set: {
            title: sql`excluded.title`,
            url: sql`excluded.url`,
            author: sql`excluded.author`,
            authorUrl: sql`excluded.author_url`,
            thumb: sql`excluded.thumb`,
            date: sql`excluded.date`,
            updatedAt: new Date(),
          },
        });

      total += entries.length;
    } catch (err) {
      console.warn(`Warning: failed to seed ${file}:`, err);
    }
  }

  console.log(`Seeded ${total} read books from ${files.length} files`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

type HatenaBookmarkEntry = {
  title: string;
  url: string;
  description: string;
  savedAt: string;
  tags: string[];
};

async function seedHatenaBookmarks() {
  const fetchedDir = path.join(process.cwd(), 'fetched', 'hatena', 'bookmarks');
  const files = fs
    .readdirSync(fetchedDir)
    .filter((f) => /^hatena-bookmarks-\d{4}-\d{2}\.json$/.test(f))
    .sort();

  if (files.length === 0) {
    console.warn('Warning: no hatena-bookmarks-YYYY-MM.json files found. Skipping Hatena bookmark seed.');
    return;
  }

  let total = 0;
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(fetchedDir, file), 'utf-8');
      const entries: HatenaBookmarkEntry[] = JSON.parse(raw);
      if (!Array.isArray(entries) || entries.length === 0) continue;

      const rows = entries
        .filter((e) => e.url && e.savedAt)
        .map((e) => ({
          id: `hatena:${e.url}`,
          source: 'hatena' as const,
          title: e.title || e.url,
          url: e.url,
          description: e.description || null,
          savedAt: new Date(e.savedAt),
        }));

      if (rows.length === 0) continue;

      await db
        .insert(hatenaBookmarks)
        .values(rows)
        .onConflictDoUpdate({
          target: hatenaBookmarks.id,
          set: {
            title: sql`excluded.title`,
            url: sql`excluded.url`,
            description: sql`excluded.description`,
            savedAt: sql`excluded.saved_at`,
          },
        });

      total += rows.length;
    } catch (err) {
      console.warn(`Warning: failed to seed ${file}:`, err);
    }
  }

  console.log(`Seeded ${total} Hatena bookmarks from ${files.length} files`);
}
