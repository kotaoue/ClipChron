import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookmarks } from '@/db/schema';
import { count, desc, eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '100')));
  const offset = (page - 1) * limit;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.source, 'hatena'))
      .orderBy(desc(bookmarks.savedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(bookmarks).where(eq(bookmarks.source, 'hatena')),
  ]);

  return NextResponse.json({
    bookmarks: rows,
    total: Number(total),
    page,
    hasMore: offset + rows.length < Number(total),
  });
}
