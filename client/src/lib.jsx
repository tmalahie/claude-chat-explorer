export async function api(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res.json();
}

// Deeplink that the Claude Code VSCode extension handles (registerUriHandler
// '/open' case → resumes the session). Works as a normal browser link.
export function vscodeDeeplink(sessionId) {
  return `vscode://anthropic.claude-code/open?session=${encodeURIComponent(sessionId)}`;
}

function triggerUri(uri) {
  // Fire a custom-protocol URL without navigating the app away.
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = uri;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 1500);
}

// The extension resumes a session using the focused window's workspace folder,
// so we must focus that project's window FIRST (vscode://file/<cwd>) and only
// then fire the resume deeplink — otherwise the session id isn't found in the
// active window's project and you get an empty conversation.
export function openInVscode(sessionId, cwd) {
  if (cwd) {
    triggerUri(`vscode://file${cwd.startsWith('/') ? '' : '/'}${cwd}`);
    setTimeout(() => triggerUri(vscodeDeeplink(sessionId)), 1600);
  } else {
    triggerUri(vscodeDeeplink(sessionId));
  }
}

export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = (now - d) / 86400000;
  if (diffDays < 7) return WEEKDAYS[d.getDay()];
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtFullTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtBubbleTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDayDivider(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const AVATAR_COLORS = [
  ['#ff885e', '#ff516a'],
  ['#ffcd6a', '#ffa85c'],
  ['#82b1ff', '#665fff'],
  ['#a0de7e', '#54cb68'],
  ['#53edd6', '#28c9b7'],
  ['#72d5fd', '#2a9ef1'],
  ['#e0a2f3', '#d669ed'],
];

export function avatarGradient(id) {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [a, b] = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function initialOf(text) {
  const t = (text || '').trim();
  if (!t) return '?';
  return t[0].toUpperCase();
}

export function highlightSnippet(snippet, query) {
  if (!query) return [snippet];
  const parts = [];
  const lower = snippet.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  while (i < snippet.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push(snippet.slice(i));
      break;
    }
    if (idx > i) parts.push(snippet.slice(i, idx));
    parts.push(<mark key={idx}>{snippet.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
  }
  return parts;
}

export function shortPath(p) {
  if (!p) return '';
  const segs = p.split('/').filter(Boolean);
  return segs.slice(-2).join('/') || p;
}
