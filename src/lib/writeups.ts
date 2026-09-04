// Loads every .md file in src/content/writeups/ at build time.
// Each file needs a frontmatter block like:
//
// ---
// title: Buffer Overflow on Vulnerable Server
// date: 2026-03-14
// category: Binary Exploitation
// tags: [pwn, x86, ropchain]
// difficulty: Hard
// summary: One-line description shown on the list page.
// ---
//
// # Your writeup content in normal markdown starts here.

export interface WriteupMeta {
  slug: string;
  title: string;
  date: string;
  categories: string[];
  tags: string[];
  difficulty?: string;
  summary?: string;
}

export interface Writeup extends WriteupMeta {
  content: string;
}

// Minimal YAML-ish frontmatter parser (avoids pulling Node-oriented libs into the browser bundle).
function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const [, block, content] = match;
  const data: Record<string, unknown> = {};

  for (const line of block.split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value: unknown = line.slice(idx + 1).trim();

    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (typeof value === 'string') {
      value = value.replace(/^["']|["']$/g, '');
    }
    data[key] = value;
  }

  return { data, content: content.trim() };
}

// Eagerly import raw text of every markdown file in content/writeups.
const modules = import.meta.glob('/src/content/writeups/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function slugFromPath(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.md$/, '');
}

const writeups: Writeup[] = Object.entries(modules).map(([path, raw]) => {
  const { data, content } = parseFrontmatter(raw);
  const slug = slugFromPath(path);
  const categories = Array.isArray(data.category)
    ? (data.category as string[])
    : data.category
      ? [data.category as string]
      : ['Uncategorized'];
  return {
    slug,
    title: (data.title as string) ?? slug,
    date: (data.date as string) ?? '',
    categories,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    difficulty: data.difficulty as string | undefined,
    summary: data.summary as string | undefined,
    content,
  };
});

export function getAllWriteups(): Writeup[] {
  return [...writeups].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getWriteupBySlug(slug: string): Writeup | undefined {
  return writeups.find((w) => w.slug === slug);
}

export function getAllCategories(): string[] {
  return [...new Set(writeups.flatMap((w) => w.categories))].sort();
}
