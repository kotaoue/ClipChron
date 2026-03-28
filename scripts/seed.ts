import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { books } from '../src/db/schema';

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
  const filePath = path.join(process.cwd(), 'fetched', 'bookmeter-wish-list.json');

  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found. Skipping seed.`);
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

  console.log(`Seeded ${entries.length} books`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
