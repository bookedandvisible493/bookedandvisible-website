#!/usr/bin/env python3
"""Keep shared content blocks identical on every page that uses them.

A block lives once in blocks/<name>.inc. A page opts in by wrapping the spot in
    <!-- BLOCK:<name>:START ... -->
    <!-- BLOCK:<name>:END -->
Run `python3 scripts/sync_blocks.py` after editing a block to rewrite every page
(static HTML, so search engines see the content). `--check` exits 1 if any page is stale.
To add a project to Recent work: edit blocks/recent-work.inc (newest first), then sync.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = ("redesign-mocks/", "archive/", "Claude outputs/", "payhip-updates/", ".claude/", "node_modules/")


def main():
    check = "--check" in sys.argv
    blocks = {os.path.basename(p)[:-4]: open(p, encoding="utf-8").read().rstrip("\n")
              for p in glob.glob(os.path.join(ROOT, "blocks", "*.inc"))}
    stale, changed = [], []
    for path in sorted(glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)):
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        if rel.startswith(SKIP):
            continue
        text = new = open(path, encoding="utf-8").read()
        for name, body in blocks.items():
            pat = re.compile(r"(<!-- BLOCK:%s:START[^>]*-->).*?(<!-- BLOCK:%s:END -->)" % (re.escape(name), re.escape(name)), re.S)
            new = pat.sub(lambda m: m.group(1) + "\n" + body + "\n" + m.group(2), new)
        if new != text:
            (stale if check else changed).append(rel)
            if not check:
                open(path, "w", encoding="utf-8").write(new)
    if check and stale:
        print("Out of sync (run python3 scripts/sync_blocks.py): " + ", ".join(stale))
        return 1
    print("Updated: " + ", ".join(changed) if changed else "All blocks already in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
