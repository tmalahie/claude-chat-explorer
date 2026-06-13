import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const PORT = process.env.PORT || 3000;

const app = express();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeProjectDir(projectId) {
  if (!/^[A-Za-z0-9._-]+$/.test(projectId)) throw new Error('invalid project id');
  return path.join(PROJECTS_DIR, projectId);
}

function safeConversationFile(projectId, convId) {
  if (!/^[A-Za-z0-9-]+$/.test(convId)) throw new Error('invalid conversation id');
  return path.join(safeProjectDir(projectId), `${convId}.jsonl`);
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Is this entry a real chat message we want to show?
function isDisplayable(entry) {
  if (!entry || (entry.type !== 'user' && entry.type !== 'assistant')) return false;
  if (entry.isMeta || entry.isSidechain) return false;
  if (!entry.message) return false;
  return true;
}

// Extract renderable blocks from a message's content
function getBlocks(message) {
  const content = message.content;
  const blocks = [];
  if (typeof content === 'string') {
    if (content.trim()) blocks.push({ type: 'text', text: content });
    return blocks;
  }
  if (!Array.isArray(content)) return blocks;
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      blocks.push({ type: 'text', text: b.text });
    } else if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
      blocks.push({ type: 'thinking', text: b.thinking });
    } else if (b.type === 'tool_use') {
      let input = '';
      try {
        input = JSON.stringify(b.input ?? {});
      } catch {}
      blocks.push({ type: 'tool_use', name: b.name || 'tool', input: input.slice(0, 400) });
    } else if (b.type === 'image' || (b.type === 'tool_result' && Array.isArray(b.content) && b.content.some((c) => c?.type === 'image'))) {
      if (b.type === 'image') blocks.push({ type: 'image' });
    }
  }
  return blocks;
}

function plainTextOf(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

// Clean a raw message text into a one-line label (titles, previews)
function cleanLabel(text) {
  if (!text) return '';
  return text
    .replace(/<command-name>([^<]*)<\/command-name>/g, '$1')
    .replace(/<command-args>([^<]*)<\/command-args>/g, ' $1')
    .replace(/<command-message>[^<]*<\/command-message>/g, '')
    .replace(/<(local-command-stdout|system-reminder|ide_opened_file|ide_selection|ide_diagnostics|browser_instruction|task-notification|system_warning|browser)\b[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<browser\b[^>]*><\/browser>/g, '')
    .replace(/<[a-z][a-z0-9_-]*(\s[^>]*)?>/gi, ' ')
    .replace(/<\/[a-z][a-z0-9_-]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBadTitleCandidate(text) {
  if (!text) return true;
  if (text.startsWith('Caveat:')) return true;
  if (text.startsWith('This session is being continued')) return true;
  return false;
}

// Read the first part of a JSONL file and derive a title
const titleCache = new Map(); // file -> { mtimeMs, title }

async function getTitle(file, stat) {
  const st = stat || (await fsp.stat(file).catch(() => null));
  if (!st) return null;
  const cached = titleCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.title;

  let title = null;
  let fallback = null;
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lines = 0;
  try {
    for await (const line of rl) {
      lines++;
      if (lines > 500) break;
      const entry = parseLine(line);
      if (!entry) continue;
      if (entry.type === 'summary' && typeof entry.summary === 'string' && entry.summary.trim()) {
        title = entry.summary.trim();
        break;
      }
      if (entry.type === 'user' && isDisplayable(entry)) {
        const text = cleanLabel(plainTextOf(entry.message));
        if (!text) continue;
        if (isBadTitleCandidate(text)) {
          if (!fallback) fallback = text;
          continue;
        }
        title = text;
        break;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  title = (title || fallback || null)?.slice(0, 150) ?? null;
  titleCache.set(file, { mtimeMs: st.mtimeMs, title });
  return title;
}

// Read the tail of a JSONL file and derive a preview (last message)
const previewCache = new Map(); // file -> { mtimeMs, preview, ts }

async function getPreview(file, stat) {
  const st = stat || (await fsp.stat(file).catch(() => null));
  if (!st) return { preview: null, ts: null };
  const cached = previewCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached;

  const CHUNK = 1024 * 1024;
  const size = st.size;
  const start = Math.max(0, size - CHUNK);
  let data = '';
  try {
    const fd = await fsp.open(file, 'r');
    try {
      const buf = Buffer.alloc(Math.min(CHUNK, size));
      await fd.read(buf, 0, buf.length, start);
      data = buf.toString('utf8');
    } finally {
      await fd.close();
    }
  } catch {
    return { preview: null, ts: null };
  }

  let lines = data.split('\n');
  if (start > 0) lines = lines.slice(1); // drop partial first line

  let preview = null;
  let ts = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const entry = parseLine(lines[i]);
    if (!entry) continue;
    if (!ts && entry.timestamp) ts = entry.timestamp;
    if (isDisplayable(entry)) {
      const text = cleanLabel(plainTextOf(entry.message));
      if (text) {
        preview = (entry.type === 'assistant' ? '' : 'You: ') + text.slice(0, 200);
        if (!ts) ts = entry.timestamp || null;
        break;
      }
    }
  }
  const result = { mtimeMs: st.mtimeMs, preview, ts };
  previewCache.set(file, result);
  return result;
}

// Detect the real cwd of a project from its newest session file
const cwdCache = new Map(); // projectId -> cwd

async function getProjectCwd(projectId, newestFile) {
  if (cwdCache.has(projectId)) return cwdCache.get(projectId);
  let cwd = null;
  if (newestFile) {
    try {
      const fd = await fsp.open(newestFile, 'r');
      try {
        const buf = Buffer.alloc(64 * 1024);
        const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
        const m = buf.toString('utf8', 0, bytesRead).match(/"cwd":"([^"]+)"/);
        if (m) cwd = m[1];
      } finally {
        await fd.close();
      }
    } catch {}
  }
  if (cwd) cwdCache.set(projectId, cwd);
  return cwd;
}

async function listJsonlFiles(dir) {
  const names = await fsp.readdir(dir).catch(() => []);
  const files = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const full = path.join(dir, name);
    const st = await fsp.stat(full).catch(() => null);
    if (st && st.isFile()) files.push({ file: full, name, stat: st });
  }
  files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return files;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get('/api/projects', async (req, res) => {
  try {
    const names = await fsp.readdir(PROJECTS_DIR);
    const projects = [];
    await Promise.all(
      names.map(async (name) => {
        const dir = path.join(PROJECTS_DIR, name);
        const lst = await fsp.lstat(dir).catch(() => null);
        if (!lst || !lst.isDirectory() || lst.isSymbolicLink()) return;
        const files = await listJsonlFiles(dir);
        if (files.length === 0) return;
        const cwd = await getProjectCwd(name, files[0]?.file);
        projects.push({
          id: name,
          path: cwd || name.replace(/-/g, '/'),
          conversationCount: files.length,
          lastActivity: new Date(files[0].stat.mtimeMs).toISOString(),
        });
      })
    );
    projects.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:projectId/conversations', async (req, res) => {
  try {
    const dir = safeProjectDir(req.params.projectId);
    const files = await listJsonlFiles(dir);
    const conversations = await Promise.all(
      files.map(async ({ file, name, stat }) => {
        const [title, tail] = await Promise.all([getTitle(file, stat), getPreview(file, stat)]);
        return {
          id: name.replace(/\.jsonl$/, ''),
          title: title || null,
          preview: tail.preview || null,
          lastActivity: tail.ts || new Date(stat.mtimeMs).toISOString(),
        };
      })
    );
    const visible = conversations.filter((c) => c.title || c.preview);
    visible.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
    const cwd = await getProjectCwd(req.params.projectId, files[0]?.file);
    res.json({ project: { id: req.params.projectId, path: cwd || req.params.projectId }, conversations: visible });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MAX_BLOCK_CHARS = 20000;

app.get('/api/projects/:projectId/conversations/:convId', async (req, res) => {
  try {
    const file = safeConversationFile(req.params.projectId, req.params.convId);
    const st = await fsp.stat(file).catch(() => null);
    if (!st) return res.status(404).json({ error: 'conversation not found' });

    const messages = [];
    let title = null;
    let fallbackTitle = null;

    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      const entry = parseLine(line);
      if (!entry) continue;
      if (entry.type === 'summary' && typeof entry.summary === 'string' && !title) {
        title = entry.summary.trim();
        continue;
      }
      if (!isDisplayable(entry)) continue;
      const blocks = getBlocks(entry.message).map((b) => {
        if (b.text && b.text.length > MAX_BLOCK_CHARS) {
          return { ...b, text: b.text.slice(0, MAX_BLOCK_CHARS), truncated: true };
        }
        return b;
      });
      if (blocks.length === 0) continue;
      if (!title && entry.type === 'user') {
        const text = cleanLabel(plainTextOf(entry.message));
        if (text && !isBadTitleCandidate(text)) title = text.slice(0, 150);
        else if (text && !fallbackTitle) fallbackTitle = text.slice(0, 150);
      }
      messages.push({
        uuid: entry.uuid,
        role: entry.type,
        timestamp: entry.timestamp || null,
        blocks,
      });
    }

    res.json({
      id: req.params.convId,
      title: title || fallbackTitle || null,
      messageCount: messages.length,
      messages,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple search: grep candidate files, then parse matching messages
// More chunks than cores: file sizes vary a lot, smaller chunks balance load
const GREP_PARALLEL = 32;

function chunked(arr, n) {
  const size = Math.ceil(arr.length / n);
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Phase 1: which files mention the query at all (-l stops at first match: fast)
function grepListChunk(query, files) {
  return new Promise((resolve) => {
    const proc = spawn('grep', ['-l', '-i', '-F', '-e', query, ...files, '/dev/null'], {
      env: { ...process.env, LC_ALL: 'C' },
    });
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.on('error', () => resolve([]));
    proc.on('close', () => resolve(out.split('\n').filter((f) => f && f !== '/dev/null')));
  });
}

// Phase 2: extract the matching lines from a set of files
function grepLinesChunk(query, files, perFileMax, byFile) {
  return new Promise((resolve) => {
    // /dev/null guarantees >1 file so grep always prefixes filenames
    const proc = spawn(
      'grep',
      ['-n', '-i', '-F', '-m', String(perFileMax), '-e', query, ...files, '/dev/null'],
      { env: { ...process.env, LC_ALL: 'C' } }
    );
    let buf = '';
    let total = 0;
    proc.stdout.on('data', (d) => {
      total += d.length;
      if (total > 64e6) {
        proc.kill();
        return;
      }
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        handleLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    });
    function handleLine(line) {
      // format: <file>:<lineno>:<json>  (uuid filenames contain no ':')
      const c1 = line.indexOf(':');
      if (c1 === -1) return;
      const file = line.slice(0, c1);
      const c2 = line.indexOf(':', c1 + 1);
      if (c2 === -1) return;
      if (!byFile.has(file)) byFile.set(file, []);
      const arr = byFile.get(file);
      if (arr.length < perFileMax) arr.push(line.slice(c2 + 1));
    }
    proc.on('error', resolve);
    proc.on('close', resolve);
  });
}

const MAX_SEARCH_FILES = 80;

// Two-phase parallel grep: returns Map<file, rawJsonLine[]> for the newest
// MAX_SEARCH_FILES conversations that mention the query.
async function grepSearch(dir, query, perFileMax) {
  const all = await listJsonlFiles(dir); // already sorted newest first
  const byFile = new Map();
  if (all.length === 0) return byFile;

  const candidates = all.map((f) => f.file);
  const matchedSets = await Promise.all(
    chunked(candidates, GREP_PARALLEL).map((c) => grepListChunk(query, c))
  );
  const matched = new Set(matchedSets.flat());
  const files = candidates.filter((f) => matched.has(f)).slice(0, MAX_SEARCH_FILES);
  if (files.length === 0) return byFile;

  await Promise.all(
    chunked(files, GREP_PARALLEL).map((c) => grepLinesChunk(query, c, perFileMax, byFile))
  );
  return byFile;
}

app.get('/api/projects/:projectId/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    const dir = safeProjectDir(req.params.projectId);
    const qLower = q.toLowerCase();

    const MAX_RESULTS = 300;
    const MAX_PER_CONV = 20;

    const byFile = await grepSearch(dir, q, MAX_PER_CONV * 3);

    // newest conversations first
    const entries = await Promise.all(
      [...byFile.entries()].map(async ([f, lines]) => ({
        f,
        lines,
        st: await fsp.stat(f).catch(() => null),
      }))
    );
    entries.sort((a, b) => (b.st?.mtimeMs || 0) - (a.st?.mtimeMs || 0));

    const results = [];
    for (const { f: file, lines } of entries) {
      if (results.length >= MAX_RESULTS) break;
      const convId = path.basename(file, '.jsonl');
      const convTitle = (await getTitle(file)) || convId.slice(0, 8);
      let perConv = 0;

      for (const raw of lines) {
        if (perConv >= MAX_PER_CONV || results.length >= MAX_RESULTS) break;
        const entry = parseLine(raw);
        if (!entry || !isDisplayable(entry)) continue;
        const text = plainTextOf(entry.message);
        const idx = text.toLowerCase().indexOf(qLower);
        if (idx === -1) continue;
        const from = Math.max(0, idx - 40);
        const to = Math.min(text.length, idx + q.length + 120);
        const snippet =
          (from > 0 ? '…' : '') +
          text.slice(from, to).replace(/\s+/g, ' ').trim() +
          (to < text.length ? '…' : '');
        results.push({
          conversationId: convId,
          conversationTitle: convTitle,
          uuid: entry.uuid,
          role: entry.type,
          timestamp: entry.timestamp || null,
          snippet,
        });
        perConv++;
      }
    }

    results.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Static frontend (SPA)
// ---------------------------------------------------------------------------

app.use(express.static(CLIENT_DIST));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  } else {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`Claude Chat Explorer running at http://localhost:${PORT}`);
});
