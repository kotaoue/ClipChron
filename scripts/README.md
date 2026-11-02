# Scripts

This directory contains scripts for fetching bookmark data from external services.

## fetch-x-likes.mjs

Fetches liked tweets from X (Twitter) via the X API v2 and saves them as monthly files in `fetched/x/likes/`.

The script operates in two modes controlled by `fetched/x/likes/x-likes-meta.json`:

- **Full fetch** (first run, or when the meta file is absent): fetches all pages and writes `x-likes-meta.json` with `completeFetchDone: true` on success.
- **Incremental fetch** (every subsequent run): fetches from the newest page and stops as soon as a page contains no new (unseen) tweet IDs.

> **Note:** The X API v2 does not expose the timestamp at which a tweet was liked. The `createdAt` field records when the tweet itself was originally posted, not when you liked it.

### Prerequisites

- Node.js `22.14.0` (see `.node-version`)
- X Developer account with a project and app (Free tier or higher)
- X API ******
- Your numeric X User ID

### How to obtain credentials

#### ******

1. Go to [developer.x.com](https://developer.x.com) and sign in.
2. Create a project and an app (Free tier is sufficient for liked tweets).
3. In your app's **Keys and Tokens** page, copy the ********
4. Set it as `X_BEARER_TOKEN` in your environment or GitHub Actions secrets.

#### User ID

Your numeric User ID is different from your @handle. The easiest way to find it:

```bash
curl -s "https://api.twitter.com/2/users/by/username/YOUR_HANDLE" \
  -H "Authorization: ******" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).data.id)"
```

Replace `YOUR_HANDLE` with your X username (without `@`) and `YOUR_BEARER_TOKEN` with your token. The command prints your numeric User ID.

Set it as `X_USER_ID` in your environment or GitHub Actions secrets.

### Usage

```bash
X_BEARER_TOKEN=<your_bearer_token> X_USER_ID=<your_user_id> node scripts/fetch-x-likes.mjs
```

### Output

Likes are written to monthly files in `fetched/x/likes/`, named `x-likes-YYYY-MM.json` (e.g. `x-likes-2026-03.json`). Each file contains an array of entries for that month sorted by `createdAt` descending. Each entry has the following fields:

| Field       | Type   | Description                                          |
|-------------|--------|------------------------------------------------------|
| `id`        | string | Tweet ID                                             |
| `text`      | string | Tweet text                                           |
| `url`       | string | Permalink (`https://x.com/i/web/status/{id}`)        |
| `createdAt` | string | ISO 8601 date the tweet was originally posted        |

### Seeding the database

After fetching, run the seed script to import the data into the database:

```bash
npm run db:seed
```

---

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
