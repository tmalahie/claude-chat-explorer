import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  avatarGradient,
  fmtListTime,
  highlightSnippet,
  initialOf,
  shortPath,
} from '../lib.jsx';
import Conversation from '../components/Conversation.jsx';

export default function ChatPage() {
  const { projectId, convId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetMessage = searchParams.get('m');

  const [project, setProject] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api(`/api/projects/${encodeURIComponent(projectId)}/conversations`)
      .then((d) => {
        setProject(d.project);
        setConversations(d.conversations);
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api(`/api/projects/${encodeURIComponent(projectId)}/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, projectId]);

  const showResults = query.trim().length >= 2;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-90 max-w-[40vw] shrink-0 flex-col border-r border-line bg-side">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Link
            to="/"
            title="Back to projects"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted transition-colors hover:bg-side-hover hover:text-ink"
          >
            ←
          </Link>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
              🔍
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages"
              className="w-full rounded-full bg-app py-2 pr-8 pl-9 text-sm outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted hover:text-ink"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="truncate px-4 pb-2 text-xs text-muted" title={project?.path}>
          {project ? shortPath(project.path) : projectId}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <div className="p-4 text-sm text-red-300">{error}</div>}

          {!showResults && !conversations && !error && (
            <div className="p-4 text-sm text-muted">Loading conversations…</div>
          )}

          {!showResults &&
            conversations &&
            conversations.map((c) => (
              <ConversationItem
                key={c.id}
                conv={c}
                active={c.id === convId}
                onClick={() => navigate(`/p/${encodeURIComponent(projectId)}/c/${c.id}`)}
              />
            ))}

          {!showResults && conversations && conversations.length === 0 && (
            <div className="p-4 text-sm text-muted">No conversations in this project.</div>
          )}

          {showResults && (
            <SearchResults
              results={results}
              searching={searching}
              query={query.trim()}
              onOpen={(r) =>
                navigate(
                  `/p/${encodeURIComponent(projectId)}/c/${r.conversationId}?m=${encodeURIComponent(r.uuid || '')}`
                )
              }
            />
          )}
        </div>
      </aside>

      {/* Conversation pane */}
      <main className="flex min-w-0 flex-1 flex-col">
        {convId ? (
          <Conversation
            projectId={projectId}
            convId={convId}
            targetMessage={targetMessage}
            highlight={query.trim()}
            onMetaUpdated={(id, newTitle) =>
              setConversations((cs) =>
                cs ? cs.map((c) => (c.id === id ? { ...c, title: newTitle } : c)) : cs
              )
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-full bg-side px-5 py-2 text-sm text-muted">
              Select a conversation to start reading
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ConversationItem({ conv, active, onClick }) {
  const title = conv.title || 'Untitled conversation';
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-side-active' : 'hover:bg-side-hover'
      }`}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-medium text-white"
        style={{ background: avatarGradient(conv.id) }}
      >
        {initialOf(title)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-medium">{title}</span>
          <span className={`shrink-0 text-xs ${active ? 'text-ink/70' : 'text-muted'}`}>
            {fmtListTime(conv.lastActivity)}
          </span>
        </div>
        <div className={`truncate text-sm ${active ? 'text-ink/70' : 'text-muted'}`}>
          {conv.preview || '—'}
        </div>
      </div>
    </button>
  );
}

function SearchResults({ results, searching, query, onOpen }) {
  if (searching && !results) return <div className="p-4 text-sm text-muted">Searching…</div>;
  if (!results) return null;
  return (
    <div>
      <div className="px-4 py-2 text-xs font-medium tracking-wide text-muted uppercase">
        {results.length === 0 ? 'No messages found' : `${results.length} message${results.length === 1 ? '' : 's'} found`}
        {searching && ' · updating…'}
      </div>
      {results.map((r, i) => (
        <button
          key={`${r.conversationId}-${r.uuid}-${i}`}
          onClick={() => onOpen(r)}
          className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-side-hover"
        >
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-medium text-white"
            style={{ background: avatarGradient(r.conversationId) }}
          >
            {initialOf(r.conversationTitle)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{r.conversationTitle}</span>
              <span className="shrink-0 text-xs text-muted">{fmtListTime(r.timestamp)}</span>
            </div>
            <div className="line-clamp-2 text-sm text-muted">
              {r.role === 'user' && <span className="text-accent">You: </span>}
              {highlightSnippet(r.snippet, query)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
