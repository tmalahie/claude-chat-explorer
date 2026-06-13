# Claude Chat Explorer 💬

A local, read-only web app to browse and search all your Claude Code conversations stored in `~/.claude/projects`, with a Telegram-style interface.

## Features

- **Landing page** listing all your Claude Code projects (real paths, chat counts, last activity)
- **Telegram-style chat view**: conversation list on the left, messages on the right
- **Header bar** showing the conversation title and id — click it to open a **details modal** with all metadata (id, project folder, git branch, message count, timestamps, version, file size). You can **rename the conversation** (handy for untitled ones that are hard to spot in VSCode) and add a private **note**.
- **Full-text search** across all conversations of a project (top-left search bar) — clicking a result opens the conversation, scrolls to the message and flashes it
- Markdown rendering for assistant messages, collapsible long messages, collapsible thinking blocks, compact tool-call chips, day dividers
- 100% read-only over your transcripts — your edits (titles/notes) are stored in a **sidecar file** (`server/data/overrides.json`), so the original `~/.claude` files are never modified

## Run

```bash
npm run setup   # first time only: installs deps + builds the frontend
npm start       # serves everything at http://localhost:9876
```

## Run automatically at login (macOS)

Install a LaunchAgent that starts the app in the background at login and keeps it alive:

```bash
scripts/install-autostart.sh          # uses port 9876 by default
PORT=8123 scripts/install-autostart.sh # or pick another port
```

- App: <http://localhost:9876>
- Logs: `/tmp/claude-chat-explorer.log` and `/tmp/claude-chat-explorer.err.log`
- Remove it: `scripts/uninstall-autostart.sh`

## How it works

- `server/index.js` — Express server (port 9876, override with `PORT`) that serves the built frontend and a small JSON API:
  - `GET /api/projects` — project dirs in `~/.claude/projects` (symlinked duplicates skipped); the real path is detected from the `cwd` field of the newest session file
  - `GET /api/projects/:id/conversations` — one entry per top-level `*.jsonl` file; title comes from the summary entry or the first real user message (a custom title overrides it), preview from the file tail
  - `GET /api/projects/:id/conversations/:convId` — parsed messages (text, thinking, tool calls) plus a `meta` block; meta/sidechain entries are skipped, huge blocks truncated at 20k chars
  - `PATCH /api/projects/:id/conversations/:convId` — body `{ title?, note? }`; saves to the sidecar overrides file (empty title reverts to the auto-detected one)
  - `GET /api/projects/:id/search?q=` — two-phase parallel `grep` (`-l` to find files, then `-n` for matching lines on the newest 80), newest results first
- `client/` — Vite + React + Tailwind v4 SPA (React Router, react-markdown)

Titles and previews are cached in memory keyed by file mtime, so the first load of a big project is the slowest. Search on a 500MB+ project takes ~1–2s; smaller projects are near-instant.

## Dev

```bash
node server/index.js        # API + static serving on :9876
npm --prefix client run dev # Vite dev server on :5173, proxies /api to :9876
```

After frontend changes: `npm run build` and refresh (or just refresh if using the dev server).
