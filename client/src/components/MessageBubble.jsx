import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COLLAPSE_CHARS = 2500;

export default function MessageBubble({ message, time, defaultExpanded = false }) {
  // Inline event notice (e.g. a project-folder switch), centered like a system line
  if (message.role === 'event') {
    const text = message.blocks.map((b) => b.text).join(' ');
    return (
      <div
        id={message.uuid ? `msg-${message.uuid}` : undefined}
        className="my-1 flex justify-center"
      >
        <span className="rounded-full bg-side px-3 py-1 text-xs text-muted">📁 {text}</span>
      </div>
    );
  }

  const isUser = message.role === 'user';
  const textBlocks = message.blocks.filter((b) => b.type === 'text');
  const thinkingBlocks = message.blocks.filter((b) => b.type === 'thinking');
  const toolBlocks = message.blocks.filter((b) => b.type === 'tool_use');
  const imageBlocks = message.blocks.filter((b) => b.type === 'image');

  // Tool-only assistant turns render as a compact centered chip row
  if (textBlocks.length === 0 && imageBlocks.length === 0 && toolBlocks.length > 0 && thinkingBlocks.length === 0) {
    return (
      <div id={message.uuid ? `msg-${message.uuid}` : undefined} className="flex justify-center rounded-lg">
        <ToolChips tools={toolBlocks} />
      </div>
    );
  }

  if (textBlocks.length === 0 && imageBlocks.length === 0 && thinkingBlocks.length === 0) return null;

  return (
    <div
      id={message.uuid ? `msg-${message.uuid}` : undefined}
      className={`flex rounded-lg ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`relative max-w-[85%] rounded-2xl px-3.5 py-2 ${
          isUser ? 'rounded-br-sm bg-bubble-out' : 'rounded-bl-sm bg-bubble-in'
        }`}
      >
        {thinkingBlocks.map((b, i) => (
          <Thinking key={`th-${i}`} text={b.text} />
        ))}
        {imageBlocks.length > 0 && (
          <div className="mb-1 text-sm text-muted">🖼 {imageBlocks.length} image{imageBlocks.length > 1 ? 's' : ''} attached</div>
        )}
        {textBlocks.map((b, i) => (
          <CollapsibleText
            key={i}
            text={b.text}
            truncated={b.truncated}
            isUser={isUser}
            defaultExpanded={defaultExpanded}
          />
        ))}
        {toolBlocks.length > 0 && (
          <div className="mt-1.5">
            <ToolChips tools={toolBlocks} />
          </div>
        )}
        <div className={`mt-0.5 text-right text-[11px] ${isUser ? 'text-ink/50' : 'text-muted/70'}`}>
          {time}
        </div>
      </div>
    </div>
  );
}

function CollapsibleText({ text, truncated, isUser, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const long = text.length > COLLAPSE_CHARS;
  const shown = long && !expanded ? text.slice(0, COLLAPSE_CHARS) : text;

  return (
    <div className="text-[15px]">
      {isUser ? (
        <div className="md whitespace-pre-wrap">{shown}</div>
      ) : (
        <div className="md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{shown}</ReactMarkdown>
        </div>
      )}
      {long && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-sm font-medium text-accent hover:underline"
        >
          {expanded ? 'Show less' : `Show more (${Math.round(text.length / 1000)}k chars)`}
        </button>
      )}
      {truncated && expanded && (
        <div className="mt-1 text-xs text-muted italic">Message truncated for display.</div>
      )}
    </div>
  );
}

function Thinking({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-muted transition-colors hover:text-accent"
      >
        💭 thinking {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-1 max-h-72 overflow-y-auto rounded-lg bg-black/25 p-2.5 text-sm whitespace-pre-wrap text-muted italic">
          {text}
        </div>
      )}
    </div>
  );
}

function ToolChips({ tools }) {
  return (
    <div className="flex max-w-full flex-wrap justify-center gap-1.5">
      {tools.map((t, i) => (
        <span
          key={i}
          title={t.input}
          className="inline-flex items-center gap-1 rounded-full bg-side px-2.5 py-1 text-xs text-muted"
        >
          🔧 {t.name}
        </span>
      ))}
    </div>
  );
}
