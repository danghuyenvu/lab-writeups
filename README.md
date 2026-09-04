# Lab Writeups

A personal portfolio site for lab writeups, built with Vite + React + TypeScript + Tailwind CSS.
Drop a markdown file in, push to GitHub, and the site updates itself.

## Running locally

```
npm install
npm run dev
```

Open http://localhost:5173

## Adding a new writeup

Create a new `.md` file in `src/content/writeups/`. Filename becomes the URL slug
(e.g. `my-lab.md` → `/writeups/my-lab`). Start the file with frontmatter, then write
normal markdown below it:

```markdown
---
title: My Lab Title
date: 2026-04-01
category: Web Security
tags: [xss, burp]
difficulty: Easy
summary: One sentence shown in the list view.
---

## Objective
...your writeup content...
```

That's it — no need to touch any React code. The homepage and category filters update automatically.

## Adding images to a writeup

Put image files in `public/images/<your-slug>/`, then reference them in your markdown
with a path starting with `/`:

```markdown
![Nmap scan output](/images/my-lab/scan.png)
```

Using `public/images/<slug>/...` (rather than one flat folder) keeps each writeup's
screenshots organized and avoids filename collisions between labs.

Don't use relative paths like `./scan.png` — they won't resolve correctly since markdown
files aren't bundled the same way as code. Always start the path with `/images/...`; the
site automatically adjusts it to work both locally and once deployed to GitHub Pages.

## Deploying to GitHub Pages

1. Push this repo to GitHub (repo name matters, see next step).
2. Open `vite.config.ts` and set `base` to `/<your-repo-name>/`
   (e.g. `base: '/lab-writeups/'`). Skip this step, use `base: '/'`, if this
   is a User/Org page repo named `<yourusername>.github.io`.
3. In your GitHub repo: **Settings → Pages → Source → GitHub Actions**.
4. Push to `main`. The included workflow (`.github/workflows/deploy.yml`)
   builds and deploys automatically. Check the **Actions** tab for progress.
5. Your site will be live at `https://<yourusername>.github.io/<repo-name>/`.

Every future push to `main` (including just adding a new `.md` writeup) redeploys automatically.

## Project structure

```
src/
  content/writeups/   <- your .md files live here
  lib/writeups.ts     <- loads & parses the markdown files (no need to edit)
  pages/              <- Home (list) and WriteupPage (single writeup)
  components/         <- shared layout
```

## Customizing the look

Colors and fonts are defined as CSS variables in `src/index.css` under `@theme`.
Change `--color-accent` for a different highlight color, or swap the Google Fonts
link in `index.html` for different typefaces.
