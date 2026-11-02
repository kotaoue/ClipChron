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

## Zenn データソースの設定

Zenn は `scripts/fetch-zenn-bookmarks.mjs` で取得できます。取得結果は `fetched/zenn/bookmarks/zenn-bookmarks-YYYY-MM.json` に保存され、`npm run db:seed` で DB に取り込まれます。画面上では「Zenn」タブで検索できます。

- 必須設定: `ZENN_USERNAME`（自分の Zenn ユーザー名）
- 認証: 公開 API を使うためアクセストークン不要
- GitHub Actions で動かす場合: Repository Secret `ZENN_USERNAME` を追加
