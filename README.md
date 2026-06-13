# Claude Chat Explorer 💬

A local, read-only web app to browse and search all your Claude Code conversations stored in `~/.claude/projects`, with a Telegram-style interface.

## Features

- **Landing page** listing all your Claude Code projects (real paths, chat counts, last activity)
- **Telegram-style chat view**: conversation list on the left, messages on the right
- **Header bar** showing the conversation title and id (click the id to copy it)
- **Full-text search** across all conversations of a project (top-left search bar) — clicking a result opens the conversation, scrolls to the message and flashes it
- Markdown rendering for assistant messages, collapsible long messages, collapsible thinking blocks, compact tool-call chips, day dividers
- 100% local and read-only — nothing ever modifies your `~/.claude` data

## Run

```bash
npm run setup   # first time only: installs deps + builds the frontend
npm start       # serves everything at http://localhost:3000
```

## How it works

- `server/index.js` — Express server (port 3000) that serves the built frontend and a small JSON API:
  - `GET /api/projects` — project dirs in `~/.claude/projects` (symlinked duplicates skipped); the real path is detected from the `cwd` field of the newest session file
  - `GET /api/projects/:id/conversations` — one entry per top-level `*.jsonl` file; title comes from the summary entry or the first real user message, preview from the file tail
  - `GET /api/projects/:id/conversations/:convId` — parsed messages (text, thinking, tool calls); meta/sidechain entries are skipped, huge blocks truncated at 20k chars
  - `GET /api/projects/:id/search?q=` — two-phase parallel `grep` (`-l` to find files, then `-n` for matching lines on the newest 80), newest results first
- `client/` — Vite + React + Tailwind v4 SPA (React Router, react-markdown)

Titles and previews are cached in memory keyed by file mtime, so the first load of a big project is the slowest. Search on a 500MB+ project takes ~1–2s; smaller projects are near-instant.

## Dev

```bash
node server/index.js        # API + static serving on :3000
npm --prefix client run dev # Vite dev server on :5173, proxies /api to :3000
```

After frontend changes: `npm run build` and refresh.
