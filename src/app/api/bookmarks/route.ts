import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'fetched', 'bookmeter-wish-list.json');
    const raw = await readFile(filePath, 'utf-8');
    const bookmarks = JSON.parse(raw);
    return NextResponse.json({ bookmarks });
  } catch {
    return NextResponse.json({ bookmarks: [] });
  }
}
