import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllWriteups, getAllCategories } from '../lib/writeups';

export default function Home() {
  const writeups = useMemo(() => getAllWriteups(), []);
  const categories = useMemo(() => getAllCategories(), []);
  const [active, setActive] = useState<string | null>(null);

  const filtered = active ? writeups.filter((w) => w.categories.includes(active)) : writeups;

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold mb-2">Lab Writeups</h1>
        <p className="text-[var(--color-ink-soft)] max-w-[60ch]">
          Notes and reports from labs and exercises — methodology, findings, and what I learned
          working through each one.
        </p>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8 font-mono text-xs">
          <button
            onClick={() => setActive(null)}
            className={`px-3 py-1 rounded-full border transition-colors ${
              active === null
                ? 'bg-[var(--color-ink)] text-[var(--color-paper)] border-[var(--color-ink)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-accent)]'
            }`}
          >
            all
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`px-3 py-1 rounded-full border transition-colors ${
                active === cat
                  ? 'bg-[var(--color-ink)] text-[var(--color-paper)] border-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-accent)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="font-mono text-sm text-[var(--color-ink-soft)]">
          No writeups yet. Drop a .md file into src/content/writeups/ to get started.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-line)]">
          {filtered.map((w) => (
            <li key={w.slug} className="py-5 first:pt-0">
              <Link to={`/writeups/${w.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-4 mb-1.5">
                  <h2 className="font-medium group-hover:text-[var(--color-accent)] transition-colors">
                    {w.title}
                  </h2>
                  {w.date && (
                    <time className="font-mono text-xs text-[var(--color-ink-soft)] shrink-0">
                      {w.date}
                    </time>
                  )}
                </div>
                {w.summary && (
                  <p className="text-sm text-[var(--color-ink-soft)] mb-2 max-w-[60ch]">
                    {w.summary}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 font-mono text-[11px] text-[var(--color-ink-soft)]">
                  <span className="text-[var(--color-accent)]">{w.categories.join(' · ')}</span>
                  {w.difficulty && <span>· {w.difficulty}</span>}
                  {w.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
