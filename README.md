# ClipChron — Your personal bookmark archive

A personal archive that collects and searches your likes and bookmarks. (Clip + Chronicle)

🔗 **Live demo:** https://clip-chron.vercel.app/

## Roadmap

- **Phase 1** — Skeleton: directory layout, DB schema, shared configuration, and documentation ✅
- **Phase 2** — Fetchers: collect bookmarks from note / Zenn / X / はてなBookmark / Feedly via GitHub Actions
- **Phase 3** — Search UI: full-text search interface hosted on Vercel ✅

## Prerequisites

- Node.js `22.14.0` (see `.node-version`)
- [Vercel](https://vercel.com) account
- Vercel Postgres (Neon) database

> **Phase 1 note:** No API tokens are needed at this stage.

## Getting started

```bash
cp .env.local.example .env.local
# Fill in the values in .env.local
npm install
npm run db:migrate   # Run once on first setup to create tables
npm run dev
```

## Environment variables

See `.env.local.example` for all required variables.

## note data flow

1. Fetch from your note account:

   ```bash
   NOTE_USERNAME=<your_note_username> node scripts/fetch-note-posts.mjs
   ```

2. Import fetched data into DB:

   ```bash
   npm run db:seed
   ```

3. Search in UI via the `note` tab (internally uses `/api/bookmarks?source=note`).

### Authentication setup for note fetch

- `NOTE_USERNAME` is required.
- `NOTE_SESSION_COOKIE` is optional. Set it only when note API access requires logged-in session data (for example account-restricted data).
- You can copy `Cookie` header value from browser developer tools while logged in to your own account, then place it in `.env.local`.
