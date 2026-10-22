"""Insight articles added through /admin, read from content/insights/<slug>.json.

The admin page commits one JSON file plus two photos per article; build_site.py turns them into pages.
Everything here is plain standard library, and every value is validated again at build time, because the
JSON lives in a public repository and must never be trusted blindly.

Body text format (what editors paste): "# " or "## " start a section (a big heading, listed in the reading
navigation), "### " is a small heading inside a section, "- " or "* " start a bullet, and every other line is
its own paragraph.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from html import escape
import json
import math
import re
import shutil
from pathlib import Path

CONTENT_DIR = Path('content') / 'insights'
LABEL = '观点'
CATEGORY = 'insights'
CHARS_PER_MINUTE = 300
MAX_TITLE, MAX_SUMMARY, MAX_META_TITLE, MAX_META_DESCRIPTION, MAX_ALT, MAX_BODY = 120, 200, 80, 200, 200, 60000
MAX_IMAGE_SIDE = 10000

SLUG_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
IMAGE_RE = re.compile(r'^/images/insights/[a-z0-9]+(?:-[a-z0-9]+)*(?:-640)?\.(?:webp|jpg)$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
HEADING_RE = re.compile(r'^(#{1,3})\s+(\S.*)$')
EMPTY_HEADING_RE = re.compile(r'^#{1,3}$')
BULLET_RE = re.compile(r'^[-*•]\s+(\S.*)$')
SMALL_HEADING_LEVEL = 3

# ('p', (text,)) for a paragraph, ('h3', (text,)) for a small heading, ('ul', (item, ...)) for a bullet list.
Block = tuple


@dataclass(frozen=True)
class Section:
    heading: str | None
    blocks: tuple[Block, ...]


def parse_body(text: str) -> list[Section]:
    """Split pasted article text into sections; text before the first heading has no heading."""
    sections: list[tuple[str | None, list[Block]]] = []
    bullets: list[str] = []

    def flush_bullets() -> None:
        if bullets:
            sections[-1][1].append(('ul', tuple(bullets)))
            bullets.clear()

    for raw in text.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        line = raw.strip()
        if not line or EMPTY_HEADING_RE.match(line):
            continue
        heading = HEADING_RE.match(line)
        if heading:
            flush_bullets()
            text = heading.group(2).strip()
            if len(heading.group(1)) == SMALL_HEADING_LEVEL:
                if not sections:
                    sections.append((None, []))
                sections[-1][1].append(('h3', (text,)))
            else:
                sections.append((text, []))
            continue
        if not sections:
            sections.append((None, []))
        bullet = BULLET_RE.match(line)
        if bullet:
            bullets.append(bullet.group(1).strip())
            continue
        flush_bullets()
        sections[-1][1].append(('p', (line,)))
    if sections:
        flush_bullets()
    return [Section(heading, tuple(blocks)) for heading, blocks in sections if blocks]


def render_blocks(section: Section) -> str:
    """The section's paragraphs, small headings and lists as HTML. All text is escaped."""
    parts = []
    for kind, items in section.blocks:
        if kind == 'ul':
            parts.append('<ul class="article-list">' + ''.join(f'<li>{escape(item)}</li>' for item in items) + '</ul>')
        elif kind == 'h3':
            parts.append(f'<h3>{escape(items[0])}</h3>')
        else:
            parts.append(f'<p>{escape(items[0])}</p>')
    return ''.join(parts)


def reading_minutes(text: str) -> int:
    """Whole minutes to read the article, at least one."""
    characters = 0
    for section in parse_body(text):
        characters += len(re.sub(r'\s+', '', section.heading or ''))
        for _, items in section.blocks:
            characters += sum(len(re.sub(r'\s+', '', item)) for item in items)
    return max(1, math.ceil(characters / CHARS_PER_MINUTE))


def _text(raw: dict, key: str, limit: int, *, required: bool = True, multiline: bool = False) -> str:
    value = raw.get(key, '')
    if not isinstance(value, str):
        raise ValueError(f'{key} must be text')
    value = value.strip()
    if required and not value:
        raise ValueError(f'{key} is required')
    if len(value) > limit:
        raise ValueError(f'{key} is longer than {limit} characters')
    if '\x00' in value or (not multiline and re.search(r'[\r\n]', value)):
        raise ValueError(f'{key} contains characters that are not allowed')
    return value


def _date(raw: dict, key: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not DATE_RE.match(value):
        raise ValueError(f'{key} must be YYYY-MM-DD')
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f'{key} is not a real date') from error
    return value


def _side(image: dict, key: str) -> int:
    value = image.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_IMAGE_SIDE:
        raise ValueError(f'image {key} must be a whole number from 1 to {MAX_IMAGE_SIDE}')
    return value


def _image(raw: dict, slug: str, title: str) -> dict:
    image = raw.get('image')
    if not isinstance(image, dict):
        raise ValueError('image is required')
    src, small = image.get('src'), image.get('small')
    if not isinstance(src, str) or not IMAGE_RE.match(src):
        raise ValueError('image src is not an insights image path')
    extension = src.rsplit('.', 1)[1]
    if src != f'/images/insights/{slug}.{extension}' or small != f'/images/insights/{slug}-640.{extension}':
        raise ValueError('image paths must be named after the article slug')
    alt = _text(image, 'alt', MAX_ALT, required=False) or title
    return {'src': src, 'small': small, 'width': _side(image, 'width'), 'height': _side(image, 'height'), 'alt': alt}


def validate_record(raw: object, builtin_slugs: set[str]) -> dict:
    """Check one stored article and return it in the shape build_site.py renders. Raises ValueError."""
    if not isinstance(raw, dict):
        raise ValueError('record must be an object')
    slug = raw.get('slug')
    if not isinstance(slug, str) or len(slug) > 80 or not SLUG_RE.match(slug):
        raise ValueError('slug must be lowercase letters, digits and single hyphens (80 characters at most)')
    if slug in builtin_slugs:
        raise ValueError(f'slug "{slug}" is already used by a built-in article')
    title = _text(raw, 'title', MAX_TITLE)
    summary = _text(raw, 'summary', MAX_SUMMARY)
    body = _text(raw, 'body', MAX_BODY, multiline=True)
    sections = parse_body(body)
    if not any(kind in ('p', 'ul') for section in sections for kind, _ in section.blocks):
        raise ValueError('body has no readable paragraphs')
    return {
        'slug': slug, 'title': title, 'summary': summary,
        'meta_title': _text(raw, 'metaTitle', MAX_META_TITLE, required=False) or title,
        'meta_description': _text(raw, 'metaDescription', MAX_META_DESCRIPTION, required=False) or summary,
        'body': body, 'sections': sections, 'minutes': str(reading_minutes(body)),
        'category': CATEGORY, 'label': LABEL,
        'image': _image(raw, slug, title),
        'published': _date(raw, 'published'), 'modified': _date(raw, 'modified'),
    }


def remove_stale_pages(folder: Path, keep: set[str]) -> list[str]:
    """Delete generated article folders in insights/ that no longer have an article; returns their names.

    insights/ holds only pages this generator wrote, so a folder that is not a current article is
    left over from an article that was deleted. Links are skipped, never followed.
    """
    if not folder.is_dir():
        return []
    removed = []
    for child in sorted(folder.iterdir()):
        if child.is_symlink() or not child.is_dir() or child.name in keep:
            continue
        shutil.rmtree(child)
        removed.append(child.name)
    return removed


def load_insights(root: Path, builtin_slugs: set[str]) -> tuple[list[dict], list[str]]:
    """Every valid stored article, newest first, plus a warning for each file that was skipped."""
    directory = root / CONTENT_DIR
    if not directory.is_dir():
        return [], []
    articles: list[dict] = []
    warnings: list[str] = []
    for path in sorted(directory.glob('*.json')):
        try:
            article = validate_record(json.loads(path.read_text(encoding='utf-8')), builtin_slugs)
        except (OSError, ValueError) as error:
            warnings.append(f'{path.name}: {error}')
            continue
        if path.stem != article['slug']:
            warnings.append(f'{path.name}: file name must match the slug "{article["slug"]}"')
            continue
        missing = [article['image'][key] for key in ('src', 'small') if not (root / article['image'][key].lstrip('/')).is_file()]
        if missing:
            warnings.append(f'{path.name}: image file missing ({", ".join(missing)})')
            continue
        articles.append(article)
    articles.sort(key=lambda item: item['published'], reverse=True)
    return articles, warnings
