import { useEffect, useRef, useState } from 'react';
import { api, fmtBytes, fmtFullTime, openInVscode } from '../lib.jsx';

export default function MetaModal({ projectId, conv, onClose, onSaved }) {
  const meta = conv.meta || {};
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyId = () => {
    navigator.clipboard?.writeText(conv.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-side shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="font-semibold">Conversation details</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-side-hover hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1 px-5 py-4">
          {/* Title (read-only) */}
          <div className="pb-2">
            <label className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">Title</label>
            <div className="text-[15px]">
              {conv.title || <span className="text-muted italic">Untitled conversation</span>}
            </div>
          </div>

          <div className="border-t border-line pt-2">
            <ReadOnly label="ID">
              <button
                onClick={copyId}
                title="Copy id"
                className="flex items-center gap-1.5 font-mono text-xs break-all text-muted transition-colors hover:text-accent"
              >
                {conv.id}
                <span className="shrink-0">{copied ? '✓' : '⧉'}</span>
              </button>
            </ReadOnly>

            <FolderRow projectId={projectId} conv={conv} meta={meta} onSaved={onSaved} />

            <ReadOnly label="Git branch">{meta.gitBranch || '—'}</ReadOnly>
            <ReadOnly label="Messages">{meta.messageCount ?? '—'}</ReadOnly>
            <ReadOnly label="First message">{fmtFullTime(meta.firstTimestamp) || '—'}</ReadOnly>
            <ReadOnly label="Last activity">{fmtFullTime(meta.lastTimestamp) || '—'}</ReadOnly>
            <ReadOnly label="Claude Code version">{meta.version || '—'}</ReadOnly>
            <ReadOnly label="File size">{fmtBytes(meta.fileSize) || '—'}</ReadOnly>
            <ReadOnly label="File">
              <span className="font-mono text-xs break-all">{meta.file || '—'}</span>
            </ReadOnly>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            onClick={() => openInVscode(conv.id, conv.cwd)}
            title="Open this conversation in the Claude Code VSCode extension (focuses the project folder first, then resumes)"
            className="mr-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-side-hover"
          >
            Open in VSCode <span className="leading-none">↗</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-side-hover hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline-editable project folder: text + pencil → input with path autocomplete.
// Saving appends a cwd entry to the transcript (single source of truth).
function FolderRow({ projectId, conv, meta, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const listId = `folders-${conv.id}`;

  const current = meta.cwd || '';

  function startEdit() {
    setValue(current);
    setError(null);
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Debounced directory autocomplete
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => {
      api(`/api/fs/complete?path=${encodeURIComponent(value)}`)
        .then((d) => setSuggestions(d.entries || []))
        .catch(() => setSuggestions([]));
    }, 150);
    return () => clearTimeout(t);
  }, [value, editing]);

  async function commit() {
    setSaving(true);
    setError(null);
    try {
      const r = await api(
        `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conv.id)}/cwd`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cwd: value }),
        }
      );
      onSaved({ cwd: r.cwd, meta: { ...meta, cwd: r.cwd } });
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="group flex items-center gap-3 py-1.5 text-sm">
        <span className="w-36 shrink-0 text-muted">Project folder</span>
        <span className="min-w-0 flex-1 font-mono text-xs break-all text-ink/90">{current || '—'}</span>
        <button
          onClick={startEdit}
          title="Edit project folder"
          className="shrink-0 rounded p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-1.5 text-sm">
      <span className="w-36 shrink-0 pt-2 text-muted">Project folder</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            list={listId}
            value={value}
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.stopPropagation(); // don't close the modal, just cancel the edit
                setEditing(false);
                setError(null);
              }
            }}
            placeholder={current || '/path/to/project'}
            className="min-w-0 flex-1 rounded-lg bg-app px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-muted/50 focus:ring-1 focus:ring-accent"
          />
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button
            onClick={commit}
            disabled={saving}
            title="Save (Enter)"
            className="shrink-0 rounded p-1 text-accent hover:brightness-125 disabled:opacity-40"
          >
            ✓
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            title="Cancel (Esc)"
            className="shrink-0 rounded p-1 text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        <p className="mt-1 text-xs text-muted">
          Sets the folder this conversation resumes in. Written to the conversation log.
        </p>
      </div>
    </div>
  );
}

function ReadOnly({ label, children }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-36 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-ink/90">{children}</span>
    </div>
  );
}
