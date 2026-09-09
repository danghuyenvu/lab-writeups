import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { getWriteupBySlug } from '../lib/writeups';

function resolveImageSrc(src?: string): string {
  if (!src) return '';
  if (/^https?:\/\//.test(src)) return src; // external URLs pass through untouched
  const base = import.meta.env.BASE_URL; // e.g. "/lab-writeups/"
  return base.replace(/\/$/, '') + '/' + src.replace(/^\//, '');
}

export default function WriteupPage() {
  const { slug } = useParams<{ slug: string }>();
  const writeup = useMemo(() => (slug ? getWriteupBySlug(slug) : undefined), [slug]);

  if (!writeup) {
    return (
      <div>
        <p className="font-mono text-sm text-[var(--color-ink-soft)] mb-4">
          Writeup not found.
        </p>
        <Link to="/" className="text-[var(--color-accent)] underline text-sm">
          Back to all writeups
        </Link>
      </div>
    );
  }

  return (
    <article>
      <Link
        to="/"
        className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-accent)] transition-colors"
      >
        ← all writeups
      </Link>

      <header className="mt-6 mb-8">
        <h1 className="text-2xl font-semibold mb-3">{writeup.title}</h1>
        <div className="flex flex-wrap gap-2 font-mono text-[11px] text-[var(--color-ink-soft)]">
          {writeup.date && <time>{writeup.date}</time>}
          <span className="text-[var(--color-accent)]">{writeup.categories.join(' · ')}</span>
          {writeup.difficulty && <span>· {writeup.difficulty}</span>}
          {writeup.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </header>

      <div className="prose-lab">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            img: ({ src, alt }) => (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img src={resolveImageSrc(src as string)} alt={alt ?? ''} loading="lazy" />
            ),
          }}
        >
          {writeup.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
