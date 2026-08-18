#!/usr/bin/env python3
"""Assemble the static pages from src/ into the repository root.

Every page shares the same frame, left rail and status bar. Keeping that shell
in one file means adding a nav item is one edit rather than fourteen. The
output is plain HTML committed to the repo — GitHub Pages serves it directly,
so this script is a development convenience and never a runtime dependency.

Usage:  python3 build.py [--check]

    --check   exit non-zero if any output is stale, without writing.
              Use it to catch "edited src/, forgot to build".
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
SHELL = SRC / "_shell.html"

# Front matter is an HTML comment at the top of each source file, so sources
# stay valid HTML and open fine in a browser on their own.
FRONT_MATTER = re.compile(r"\A\s*<!--\s*(.*?)\s*-->\s*", re.DOTALL)

DEFAULTS = {
    "title": "Paton Hall",
    "desc": "An industrial hub in downtown Hamilton focused on electronics, "
            "machinery, robotics, peer education, industrial certifications, "
            "product demos and launches.",
    "nav": "",
    "class": "",
    # Short display name for the page, used by the shell's mobile rail
    # label. Empty on every page whose rail never collapses behind the
    # menu button, which is all of them except the Calendar today.
    "pagename": "",
}


def parse(path):
    """Split a source file into (metadata, content)."""
    raw = path.read_text(encoding="utf-8")
    meta = dict(DEFAULTS)
    match = FRONT_MATTER.match(raw)
    if match:
        for line in match.group(1).splitlines():
            if ":" in line:
                key, _, value = line.partition(":")
                meta[key.strip()] = value.strip()
        raw = raw[match.end():]
    return meta, raw.rstrip() + "\n"


def mark_active(shell, nav_key):
    """Add the active class and fill to the nav button for this page.

    Done here rather than in JavaScript so the current page is obvious with
    scripting disabled, and so the sketch layer picks up the fill token on its
    first pass instead of after a repaint.
    """
    if not nav_key:
        return shell
    needle = f'data-nav="{nav_key}"'
    if needle not in shell:
        raise SystemExit(f'build: no nav button with data-nav="{nav_key}"')

    pattern = r'(<a class="nav-btn)([^>]*?' + re.escape(needle) + r'[^>]*?)(>)'
    page, count = re.subn(
        pattern,
        lambda m: (m.group(1) + " is-active" + m.group(2) +
                   ' aria-current="page" data-sketch-fill="--nav-active-fill"' +
                   m.group(3)),
        shell, count=1,
    )
    if count != 1:
        raise SystemExit(f'build: could not mark "{nav_key}" active')
    return page


def render(path, shell):
    meta, content = parse(path)
    page = shell
    page = mark_active(page, meta["nav"])
    page = page.replace("{{TITLE}}", meta["title"])
    page = page.replace("{{DESC}}", meta["desc"])
    page = page.replace("{{BODYCLASS}}", meta["class"])
    page = page.replace("{{PAGENAME}}", meta["pagename"])
    page = page.replace("{{ROOT}}", "")
    page = page.replace("{{CONTENT}}", content)
    return page


def main():
    check = "--check" in sys.argv
    shell = SHELL.read_text(encoding="utf-8")

    sources = sorted(p for p in SRC.glob("*.html") if not p.name.startswith("_"))
    if not sources:
        raise SystemExit("build: no sources in src/")

    stale, written = [], []
    for src in sources:
        out = ROOT / src.name
        page = render(src, shell)
        if out.exists() and out.read_text(encoding="utf-8") == page:
            continue
        if check:
            stale.append(out.name)
        else:
            out.write_text(page, encoding="utf-8")
            written.append(out.name)

    if check:
        if stale:
            print("stale (run: python3 build.py):", ", ".join(stale))
            return 1
        print(f"up to date ({len(sources)} pages)")
        return 0

    print(f"built {len(written)} of {len(sources)} pages"
          + (": " + ", ".join(written) if written else " (all current)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
