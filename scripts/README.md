# Scripts

This directory contains scripts for fetching bookmark data from external services.

## fetch-hatena-bookmarks.mjs

Fetches bookmarks from Hatena Bookmark via RSS and saves them to `fetched/hatena-bookmarks.json`.

The script operates in two modes controlled by `fetched/hatena-bookmarks-meta.json`:

- **Full fetch** (first run, or when the meta file is absent): fetches all pages from the RSS feed and writes `hatena-bookmarks-meta.json` with `completeFetchDone: true` on success.
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

The fetched data is written to `fetched/hatena-bookmarks.json`. Each entry has the following fields:

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
