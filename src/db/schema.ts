import { pgTable, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const bookmarks = pgTable('bookmarks', {
  id: text('id').primaryKey(),           // "{source}:{source_id}"
  source: text('source').notNull(),      // 'x' | 'hatena' | 'feedly' | 'zenn' | 'note'
  title: text('title').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const books = pgTable('books', {
  no: integer('no').primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  author: text('author').notNull(),
  authorUrl: text('author_url').notNull(),
  thumb: text('thumb'),
  date: text('date').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const readBooks = pgTable('read_books', {
  yearMonth: text('year_month').notNull(),
  no: integer('no').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  author: text('author').notNull(),
  authorUrl: text('author_url').notNull(),
  thumb: text('thumb'),
  date: text('date').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.yearMonth, table.no] }),
]);

