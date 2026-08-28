# Scripts

This directory contains scripts for fetching bookmark data from external services.

## fetch-hatena-bookmarks.mjs

Fetches bookmarks from Hatena Bookmark via the RSS feed and saves them as monthly files in `fetched/`.

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

Bookmarks are written to monthly files in `fetched/`, named `hatena-bookmarks-YYYY-MM.json` (e.g. `hatena-bookmarks-2026-03.json`). Each file contains an array of entries for that month sorted by `savedAt` descending. Each entry has the following fields:

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

---

## fetch-qiita-stocks.mjs

Fetches items stocked (ストックした記事) by a Qiita user via the [Qiita API v2](https://qiita.com/api/v2/docs) and saves them as monthly files in `fetched/qiita/stocks/`.

The script fetches **100 items per API page** and operates in two modes controlled by `fetched/qiita/stocks/qiita-stocks-meta.json`:

- **Full fetch** (first run, or when the meta file is absent): fetches all pages and writes `qiita-stocks-meta.json` with `completeFetchDone: true` on success.
- **Incremental fetch** (every subsequent run): fetches from page 1 and stops as soon as a page contains no new (unseen) item IDs, keeping daily CI runs efficient.

> **Note:** The Qiita API v2 `stocks` endpoint returns article metadata. The `savedAt` field is set to the article's `created_at` (publication date), because the API does not expose when the item was stocked.

### Prerequisites

- Node.js `22.14.0` (see `.node-version`)
- A Qiita personal access token with the `read_qiita` scope

### Obtaining a Qiita access token

1. Log in to [qiita.com](https://qiita.com).
2. Go to **Settings** → **Applications** → **Personal access tokens**.
3. Click **Generate new token**.
4. Enter a description (e.g. `ClipChron`), select the `read_qiita` scope, and click **Generate token**.
5. Copy the token immediately — it is only shown once.

Store the token in `.env.local` as `QIITA_ACCESS_TOKEN` for local runs, and as a repository secret named `QIITA_ACCESS_TOKEN` for CI.

### Usage

```bash
QIITA_ACCESS_TOKEN=<your_token> QIITA_USERNAME=<your_username> node scripts/fetch-qiita-stocks.mjs
```

**Example:**

```bash
QIITA_ACCESS_TOKEN=abc123 QIITA_USERNAME=OhYeah node scripts/fetch-qiita-stocks.mjs
```

### Output

Stocks are written to monthly files in `fetched/qiita/stocks/`, named `qiita-stocks-YYYY-MM.json` (e.g. `qiita-stocks-2026-03.json`). Each file contains an array of entries for that month sorted by `savedAt` descending. Each entry has the following fields:

| Field         | Type     | Description                              |
|---------------|----------|------------------------------------------|
| `id`          | string   | Qiita article ID                         |
| `title`       | string   | Article title                            |
| `url`         | string   | Article URL                              |
| `description` | string   | First 200 characters of the article body (markdown stripped) |
| `savedAt`     | string   | ISO 8601 article creation date           |
| `tags`        | string[] | Tags attached to the article             |

### Seeding the database

After fetching, run the seed script to import the data into the database:

```bash
npm run db:seed
```

### GitHub Actions CI

A workflow at `.github/workflows/fetch-qiita-stocks.yml` runs daily at 02:50 JST. It requires two repository secrets:

| Secret               | Value                                |
|----------------------|--------------------------------------|
| `QIITA_ACCESS_TOKEN` | Personal access token (`read_qiita`) |
| `QIITA_USERNAME`     | Your Qiita username                  |

To set these secrets, go to **Settings** → **Secrets and variables** → **Actions** in the repository.

