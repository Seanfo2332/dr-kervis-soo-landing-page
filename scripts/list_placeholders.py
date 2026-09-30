"""List every photo or video slot still waiting for real material.

Run after building: python scripts/list_placeholders.py
Each slot is a `data-placeholder` element in the generated HTML (see placeholder() in build_site.py).
When real media arrives, replace the placeholder call in build_site.py and rebuild.
"""
from collections import defaultdict
from html import unescape
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SLOT = re.compile(r'data-placeholder="(?P<kind>[^"]+)".*?<span class="placeholder-label">(?P<label>[^<]*)</span>', re.DOTALL)


def find_slots() -> dict[str, list[tuple[str, str]]]:
    """Map each page URL to its (kind, label) placeholder slots."""
    pages: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for html_file in sorted(ROOT.rglob('*.html')):
        relative = html_file.relative_to(ROOT)
        if relative.parts[0] in {'scripts', 'tests', 'node_modules', '.git', '.vercel'}:
            continue
        text = html_file.read_text(encoding='utf-8')
        url = '/' + relative.as_posix().removesuffix('index.html')
        for match in SLOT.finditer(text):
            pages[url].append((match['kind'], unescape(match['label'])))
    return pages


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')  # Chinese labels on Windows consoles
    pages = find_slots()
    total = sum(len(slots) for slots in pages.values())
    print(f'{total} placeholder slot(s) on {len(pages)} page(s)\n')
    for url, slots in pages.items():
        counts: dict[tuple[str, str], int] = defaultdict(int)
        for slot in slots:
            counts[slot] += 1
        for (kind, label), count in counts.items():
            times = f' x{count}' if count > 1 else ''
            print(f'  {url:<38} {kind:<10} {label}{times}')


if __name__ == '__main__':
    main()
