import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--color-line)]">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-baseline justify-between">
          <Link to="/" className="font-mono text-sm tracking-tight text-[var(--color-ink)]">
            lab-writeups<span className="text-[var(--color-accent)]">.</span>
          </Link>
          <nav className="font-mono text-xs text-[var(--color-ink-soft)] flex gap-5">
            <a
              href="https://github.com/danghuyenvu"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--color-accent)] transition-colors"
            >
              github
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--color-line)] mt-16">
        <div className="max-w-3xl mx-auto px-6 py-6 font-mono text-xs text-[var(--color-ink-soft)]">
          Built with Vite + React. Source on GitHub.
        </div>
      </footer>
    </div>
  );
}
