import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtListTime, shortPath } from '../lib.jsx';

export default function ProjectsPage() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/api/projects')
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10 text-center">
          <div className="mb-3 text-5xl">💬</div>
          <h1 className="text-3xl font-semibold tracking-tight">Claude Chat Explorer</h1>
          <p className="mt-2 text-muted">
            Browse every Claude Code conversation on this machine — pick a project to start.
          </p>
        </header>

        {error && (
          <div className="rounded-xl bg-red-950/60 p-4 text-red-300">Failed to load projects: {error}</div>
        )}
        {!projects && !error && <div className="py-16 text-center text-muted">Loading projects…</div>}

        {projects && (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/p/${encodeURIComponent(p.id)}`}
                  className="group flex items-center gap-4 rounded-xl bg-side px-5 py-4 transition-colors hover:bg-side-hover"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-side-active/40 text-xl">
                    📁
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{shortPath(p.path)}</div>
                    <div className="truncate text-sm text-muted">{p.path}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm text-muted">
                      {p.conversationCount} chat{p.conversationCount === 1 ? '' : 's'}
                    </div>
                    <div className="text-xs text-muted/70">{fmtListTime(p.lastActivity)}</div>
                  </div>
                  <div className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5">›</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
