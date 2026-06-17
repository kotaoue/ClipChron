# Scripts

This directory contains scripts for fetching bookmark data from external services.

## fetch-hatena-bookmarks.mjs

Fetches bookmarks from Hatena Bookmark via the RSS feed and saves them as monthly files in `fetched/hatena/bookmarks/`.

The script fetches **20 items per RSS page** and operates in two modes controlled by `fetched/hatena-bookmarks-meta.json`:

- **Full fetch** (first run, or when the meta file is absent): fetches all pages and writes `hatena-bookmarks-meta.json` with `completeFetchDone: true` on success.
- **Incremental fetch** (every subsequent run): fetches from the newest page and stops as soon as a page contains no new (unseen) URLs, keeping daily CI runs to 1–2 requests.

### Prerequisites

- Node.js `22.14.0` (see `.node-version`)

### Usage

```bash
HATENA_USERNAME=<your_hatena_username> node scripts/fetch-hatena-bookmarks.mjs
```

**Example:**

```bash
HATENA_USERNAME=OhYeah node scripts/fetch-hatena-bookmarks.mjs
```

### Output

Bookmarks are written to monthly files in `fetched/hatena/bookmarks/`, named `hatena-bookmarks-YYYY-MM.json` (e.g. `hatena-bookmarks-2026-03.json`). Each file contains an array of entries for that month sorted by `savedAt` descending. Each entry has the following fields:

| Field         | Type     | Description                        |
|---------------|----------|------------------------------------|
| `title`       | string   | Bookmark title                     |
| `url`         | string   | Bookmarked URL                     |
| `description` | string   | Bookmark comment                   |
| `savedAt`     | string   | ISO 8601 date the bookmark was saved |
| `tags`        | string[] | Tags attached to the bookmark      |

### Seeding the database

After fetching, run the seed script to import the data into the database:

```bash
npm run db:seed
```

## fetch-note-posts.mjs

Fetches note posts from note's creator API and saves them as monthly files in `fetched/note/posts/`.

The script supports:

- **Full fetch** (first run, or when `note-posts-meta.json` is absent): walks pages until the API reports the last page.
- **Incremental fetch** (subsequent runs): starts from page 1 and stops as soon as a page has no new URLs.

### Prerequisites

- Node.js `22.14.0` (see `.node-version`)
- `NOTE_USERNAME` environment variable
- Optional: `NOTE_SESSION_COOKIE` if your account/feed requires authentication

### Usage

```bash
NOTE_USERNAME=<your_note_username> node scripts/fetch-note-posts.mjs
```

**Example (authenticated):**

```bash
NOTE_USERNAME=yourname NOTE_SESSION_COOKIE='note_session_v5=...' node scripts/fetch-note-posts.mjs
```

### Output

Posts are written to monthly files named `note-posts-YYYY-MM.json` under `fetched/note/posts/`.
Each entry has:

| Field         | Type     | Description                                 |
|---------------|----------|---------------------------------------------|
| `title`       | string   | Post title                                  |
| `url`         | string   | note URL                                    |
| `description` | string?  | Description/body preview                    |
| `savedAt`     | string   | ISO 8601 published timestamp                |
| `tags`        | string[] | Hashtags (if available from API response)   |
