import { useEffect, useRef, useState } from 'react';
import { api, fmtBytes, fmtFullTime } from '../lib.jsx';

export default function MetaModal({ projectId, conv, onClose, onSaved }) {
  const meta = conv.meta || {};
  const [title, setTitle] = useState(conv.customTitle || '');
  const [note, setNote] = useState(conv.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, note]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await api(
        `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conv.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, note }),
        }
      );
      onSaved({
        customTitle: r.customTitle,
        note: r.note,
        title: r.customTitle || conv.derivedTitle || null,
      });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

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

        <div className="space-y-4 px-5 py-4">
          {/* Editable: title */}
          <Field label="Title">
            <input
              ref={firstField}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={conv.derivedTitle || 'Untitled conversation'}
              className="w-full rounded-lg bg-app px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-muted">
              {conv.customTitle
                ? 'Custom title. Clear the field to fall back to the auto-detected one.'
                : 'Auto-detected from the first message. Type to set a custom title.'}
            </p>
          </Field>

          {/* Editable: note */}
          <Field label="Note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add a private note for this conversation…"
              className="w-full resize-y rounded-lg bg-app px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:ring-1 focus:ring-accent"
            />
          </Field>

          <div className="border-t border-line pt-3">
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
            <ReadOnly label="Project folder">
              <span className="font-mono text-xs break-all">{meta.cwd || '—'}</span>
            </ReadOnly>
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

          {error && <div className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-side-hover hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-side-active px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase">{label}</label>
      {children}
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
