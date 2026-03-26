import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const bookmarks = pgTable('bookmarks', {
  id: text('id').primaryKey(),           // "{source}:{source_id}"
  source: text('source').notNull(),      // 'x' | 'hatena' | 'feedly' | 'zenn' | 'note'
  title: text('title').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});
