import { NextResponse } from 'next/server';

// TODO (Phase 2): implement bookmark search/list endpoint
export async function GET() {
  return NextResponse.json({ bookmarks: [] });
}
