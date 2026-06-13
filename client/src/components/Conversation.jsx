import { useEffect, useRef, useState } from 'react';
import { api, fmtBubbleTime, fmtDayDivider } from '../lib.jsx';
import MessageBubble from './MessageBubble.jsx';

export default function Conversation({ projectId, convId, targetMessage }) {
  const [conv, setConv] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    setConv(null);
    setError(null);
    api(`/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(convId)}`)
      .then(setConv)
      .catch((e) => setError(e.message));
  }, [projectId, convId]);

  // After load: scroll to target message (from search) or to the bottom
  useEffect(() => {
    if (!conv) return;
    const container = scrollRef.current;
    if (!container) return;
    if (targetMessage) {
      const el = document.getElementById(`msg-${targetMessage}`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.remove('flash');
        // retrigger animation
        void el.offsetWidth;
        el.classList.add('flash');
        return;
      }
    }
    container.scrollTop = container.scrollHeight;
  }, [conv, targetMessage]);

  const copyId = () => {
    navigator.clipboard?.writeText(convId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      {/* Header bar: title + id */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-side px-5 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium">
            {conv ? conv.title || 'Untitled conversation' : 'Loading…'}
          </h2>
          <button
            onClick={copyId}
            title="Click to copy conversation id"
            className="flex max-w-full items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-accent"
          >
            <span className="truncate">{convId}</span>
            <span>{copied ? '✓ copied' : '⧉'}</span>
          </button>
        </div>
        {conv && (
          <div className="shrink-0 text-xs text-muted">{conv.messageCount} messages</div>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 md:px-8 lg:px-16">
        {error && <div className="p-4 text-sm text-red-300">Failed to load conversation: {error}</div>}
        {!conv && !error && <div className="p-4 text-sm text-muted">Loading messages…</div>}
        {conv && (
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            {conv.messages.map((m, i) => {
              const prev = conv.messages[i - 1];
              const showDay =
                m.timestamp &&
                (!prev || new Date(prev.timestamp).toDateString() !== new Date(m.timestamp).toDateString());
              return (
                <div key={m.uuid || i}>
                  {showDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-side px-3 py-1 text-xs text-muted">
                        {fmtDayDivider(m.timestamp)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    time={fmtBubbleTime(m.timestamp)}
                    defaultExpanded={!!targetMessage && m.uuid === targetMessage}
                  />
                </div>
              );
            })}
            {conv.messages.length === 0 && (
              <div className="py-16 text-center text-sm text-muted">No displayable messages in this conversation.</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
