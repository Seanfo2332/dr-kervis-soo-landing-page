"""Markup for the coverage list: Media page, homepage strip, and the event page."""
from html import escape

from press_data import KINDS, THUMB_SIZES, TOPICS, Article, display_date


def sort_by_date(articles: tuple[Article, ...]) -> list[Article]:
    """Newest first; entries with no stated date go last."""
    return sorted(articles, key=lambda article: article.date or '0', reverse=True)


def coverage_rows(articles: list[Article]) -> str:
    """One row per article: photo, type label, headline, summary, outlet, date, and the link to the original."""
    rows = []
    for number, article in enumerate(articles, 1):
        zh, en, _ = KINDS[article.kind]
        lang_attr = '' if article.lang == 'zh-CN' else f' lang="{article.lang}"'
        width, height = THUMB_SIZES[article.thumb]
        stamp = f'<time datetime="{article.date}">{display_date(article.date)}</time>' if article.date else f'<span>{display_date(article.date)}</span>'
        original = (f'<a class="ref-original" href="{escape(article.url, quote=True)}" target="_blank" rel="noopener noreferrer">'
                    f'Read Original Coverage<small>查看原文</small><span class="arrow" aria-hidden="true">↗</span>'
                    f'<span class="sr-only"> — {escape(article.outlet)}：{escape(article.headline)}（在新窗口打开）</span></a>')
        rows.append(
            f'<article class="reference-row" data-category="{article.topic} {article.kind}">'
            f'<span class="ref-number" aria-hidden="true">{number:02}</span>'
            f'<img class="ref-thumb" src="/images/{article.thumb}" alt="" width="{width}" height="{height}" loading="lazy" decoding="async">'
            f'<div class="ref-body"><span class="ref-type ref-type--{article.kind}">{zh} · {en}</span>'
            f'<h3{lang_attr}>《{escape(article.headline)}》</h3><p class="ref-summary">{escape(article.summary)}</p>{original}</div>'
            f'<div class="ref-meta"><span class="publication-name">{escape(article.outlet)}</span>{stamp}</div>'
            f'</article>')
    return ''.join(rows) + '<p class="legend-note">缩图为官网自有照片，并非媒体原图，与报道内容不一定对应。</p>'


def type_legend() -> str:
    """Plain-language key to the four labels, so visitors can tell reporting from placed content."""
    items = ''.join(f'<div><dt><span class="ref-type ref-type--{kind}">{zh} · {en}</span></dt><dd>{note}</dd></div>'
                    for kind, (zh, en, note) in KINDS.items())
    return f'<dl class="type-legend">{items}</dl><p class="legend-note">每条记录均已打开核对，并链接到原文。</p>'


def filter_groups() -> list[tuple[str, list[tuple[str, str]]]]:
    """Two independent filter groups, topic and publication type; a row must match both selections."""
    kinds = [(kind, zh) for kind, (zh, _en, _note) in KINDS.items()]
    return [('按主题筛选', [('all', '全部 All')] + list(TOPICS.items())),
            ('按类型筛选', [('all-types', '全部类型 All')] + kinds)]
