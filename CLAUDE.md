# Booked & Visible website

Static HTML/CSS marketing site, no build step, no test suite. Deployed via
Cloudflare Pages, which auto-deploys straight from `main` on every push —
there is no staging environment and no review gate, so a push to `main` is
live within moments.

## Before touching anything: check sync

This repo has a history of being edited two ways — locally via git, and
directly on github.com's web UI (see the many "Add files via upload"
commits in `git log`). Both edit the same `main` branch, so a local
checkout can silently drift behind origin with no local signal that it
happened. On 2026-09-03 a local checkout was found to be 10 days and ~100
commits behind origin, including an entire new page (AI Visibility),
cookie-consent-gated analytics, and mobile-responsive-grid fixes — none of
which were visible from the local files alone.

Run this before starting any work, every session:

```
./scripts/check-sync.sh
```

If it reports local is behind, `git pull` (or `git reset --hard
origin/main` if there's no local work worth keeping) before editing
anything. If it reports local is ahead with commits that look like an
earlier/duplicate draft of something already on origin, diff the specific
files (`git diff origin/main -- <path>`) before assuming the local version
is the one to keep — on 2026-09-03, two unpushed local commits turned out
to be an earlier, already-superseded draft of a landing-pages pricing
feature that had since been rebuilt more completely directly on origin.

## Git auth

Push authentication is via the `gh` CLI (`gh auth status` to check), logged
in as `bookedandvisible493` with git wired through `gh auth setup-git`. If
`git push` ever fails with "could not read Username for
'https://github.com'", that means this auth was lost (e.g. a different
machine/session) — run `gh auth login --web` to restore it. Do not fall
back to editing files through GitHub's web upload UI unless `gh auth
login` is genuinely unavailable; it works but is far more error-prone for
multi-file changes since GitHub's web editor is a rich code-editor widget,
not a plain textarea, so scripted text injection into it isn't reliable.

## Verifying changes before pushing

There's no dev server config checked in. To preview locally:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`. Note this does NOT reproduce the CSP
headers in `_headers` (those are applied by Cloudflare Pages, not by the
static file server) — if a change touches `_headers`, verify it by
checking the deployed site's response headers after pushing, not the local
preview.
