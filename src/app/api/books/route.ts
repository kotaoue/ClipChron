import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

type BookmeterEntry = {
  no: number;
  title: string;
  url: string;
  author: string;
  authorUrl: string;
  thumb: string | null;
  date: string;
};

type WishBook = BookmeterEntry & { yearMonth: string };

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '100')));
  const offset = (page - 1) * limit;

  const fetchedDir = path.join(process.cwd(), 'fetched');
  const files = await readdir(fetchedDir);

  const wishFiles = files
    .filter((f) => /^bookmeter-wish-\d{4}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();

  const seenUrls = new Set<string>();
  const allBooks: WishBook[] = [];

  for (const file of wishFiles) {
    const yearMonth = file.replace('bookmeter-wish-', '').replace('.json', '');
    try {
      const raw = await readFile(path.join(fetchedDir, file), 'utf-8');
      const entries: BookmeterEntry[] = JSON.parse(raw);
      for (const entry of entries) {
        if (!seenUrls.has(entry.url)) {
          seenUrls.add(entry.url);
          allBooks.push({ ...entry, yearMonth });
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  const total = allBooks.length;
  const slice = allBooks.slice(offset, offset + limit);

  return NextResponse.json({
    books: slice,
    total,
    page,
    hasMore: offset + slice.length < total,
  });
}
