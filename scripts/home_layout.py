"""Homepage composition following the ten sections of the content framework (PDF, section 01).

Copy comes from the shared content in build_site.py. All visitor-facing copy is
Simplified Chinese, including hero labels, section headings and button labels.
Scroll structure: a pinned light hero, a navy panel that slides over it (who he is, the reel,
the journey), a sideways-scrolling row of business cards, then the record sections as panels.
"""
from html import escape

from event_layout import EVENT_PATH, POSTER_PATH, VIDEO_LABEL, VIDEO_PATH

HOME_COVERAGE_COUNT = 3  # newest verified articles shown on the homepage
IDENTITY_TAGS = ('企业家', '创新实践者', '慈善家', '青年发展倡导者')

# Real photographs floating around the reel title (decorative; the reel link carries the label).
REEL_PHOTOS = (
    ('events/gala-podium-640.webp', 640, 427),
    ('events/vybe-event-640.webp', 640, 427),
    ('about-640.webp', 640, 427),
    ('events/gala-birthday-640.webp', 640, 427),
    ('impact1-640.webp', 640, 427),
    ('events/csr-portrait-640.webp', 640, 960),
)

# Business cards: (image, width, height, alt text, tag). The tag marks 人工智能 concept images as such.
CARD_IMAGES = {
    'company': ('generated/business-city-640.webp', 640, 429, '现代城市建筑与开阔露台，人工智能生成的商业主题概念影像', '人工智能概念影像'),
    'ai-content': ('generated/ai-perspective-640.webp', 640, 429, '折叠金属与深蓝玻璃的人工智能生成概念静物', '人工智能概念影像'),
    'creator-economy': ('events/vybe-event-640.webp', 640, 427, '苏才育博士在舞台上演讲，大屏显示他的姓名与 VYBE 标识', ''),
    'film-technology': ('generated/creator-studio-640.webp', 640, 429, '创作工作室与摄影机的人工智能生成概念影像', '人工智能概念影像'),
    'brand-business': ('events/gala-birthday-640.webp', 640, 427, '舞台上众人手持礼花庆祝，背景大屏写着苏才育博士生日庆祝与合作伙伴周年庆', ''),
}
REEL_SUB = '916 星域荣耀盛典 · 1:47'

# Full-bleed stage photos (hero and Speaking panel): a wide image for desktop and a portrait crop of the speaker
# for narrow screens. The files are made by process_media.py; the breakpoints match the stacked layouts in 30-home.css
# (hero) and 35-records.css (Speaking).
STAGE_SIZE = (2200, 1467)
STAGE_PORTRAIT_SIZE = (900, 1200)
HERO_STACK_BREAKPOINT = 900
SPEAKING_STACK_BREAKPOINT = 960
HERO_PHOTO_ALT = '苏才育博士在 2026 年 9 月星域荣耀盛典上致辞：他身穿白色西装、手持麦克风站在讲台前，身后大屏显示他的肖像与 VYBE、星域标识'
SPEAKING_PHOTO_ALT = '苏才育博士身穿白色西装、手持麦克风在舞台上演讲，身后大屏显示他的姓名与 VYBE 标识'



def _stage_photo(stem: str, alt: str, class_name: str, breakpoint: int, eager: bool = False) -> str:
    """Full-bleed backdrop: the wide image, with the portrait crop swapped in at narrow widths."""
    (wide_w, wide_h), (portrait_w, portrait_h) = STAGE_SIZE, STAGE_PORTRAIT_SIZE
    loading = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<picture class="{class_name}"><source media="(max-width: {breakpoint}px)" srcset="/images/events/{stem}-portrait.webp" width="{portrait_w}" height="{portrait_h}">'
            f'<img src="/images/events/{stem}-wide.webp" alt="{escape(alt)}" width="{wide_w}" height="{wide_h}" {loading} decoding="async"></picture>')


def _hero(link, social: str) -> str:
    photo = _stage_photo('gala-podium', HERO_PHOTO_ALT, 'hero-photo', HERO_STACK_BREAKPOINT, eager=True)
    return f'''
    <section class="hero on-navy" data-tone="dark" aria-labelledby="hero-title"><div class="hero-inner">
      {photo}
      <div class="hero-content">
        <div class="hero-main">
          <p class="eyebrow hero-eyebrow">企业家 · 人工智能与数字经济倡导者 · 慈善家</p>
          <h1 id="hero-title" class="hero-title"><span class="hero-row hero-row-1">苏才育</span><span class="hero-row hero-chinese">博士</span></h1>
          <p class="hero-sub">成就事业，助人成长，创造影响。</p>
        </div>
        <div class="hero-side">
          <p class="hero-role">星域集团创办人兼董事长</p>
          <div class="hero-cta actions">{link('探索他的来时路', '/story/', True)}{link('了解他的事业', '/business/')}</div>
        </div>
      </div>
      <a class="scroll-btn" href="#introduction" aria-label="向下浏览"><span aria-hidden="true">↓</span></a>
      {social}
    </div></section>'''


def _reel() -> str:
    photos = ''.join(f'<img src="/images/{name}" alt="" width="{width}" height="{height}" loading="lazy" decoding="async">' for name, width, height in REEL_PHOTOS)
    return (f'<a class="reel" href="{EVENT_PATH}#video" data-reel aria-haspopup="dialog" aria-label="播放精选影像 · {REEL_SUB} · 精选影像">'
            f'<span class="reel-collage" aria-hidden="true">{photos}</span>'
            '<span class="reel-title" aria-hidden="true">播放精选影像</span>'
            f'<span class="reel-sub" aria-hidden="true">{REEL_SUB}</span></a>')


def _who_and_journey(link, bio: str) -> str:
    tags = ''.join(f'<span class="tag">{tag}</span>' for tag in IDENTITY_TAGS)
    return f'''
    <section class="section panel on-navy who" id="introduction" data-tone="dark"><div class="wrap">
      <p class="section-label reveal">认识苏才育博士</p>
      <h2 class="statement reveal">持续探索，让想法走向<em>实践</em>。</h2>
      <div class="who-grid reveal">
        <div><p class="lead">从数字内容到人工智能，<br>连接科技、商业与人的成长。</p><div class="tag-row">{tags}</div><div class="actions">{link('完整人物简介', '/dr-kervis-soo/', True)}</div></div>
        <div><p class="body-copy">{bio}</p></div>
      </div>
      {_reel()}
      <div class="journey">
        <p class="section-label reveal">来时路</p>
        <h2 class="statement reveal">从居銮的求学时光，到创办星域集团；从数字内容，到人工智能应用。<em>不断学习</em>，是贯穿这段旅程的线索。</h2>
        <div class="mini-timeline reveal"><div><strong>1992</strong><span>出生于马来西亚</span></div><div><strong>2025</strong><span>管理学博士</span></div><div><strong>2026</strong><span>人工智能荣誉院士</span></div></div>
        <div class="actions">{link('查看完整历程', '/story/', True)}</div>
      </div>
    </div></section>'''


def _card(href: str, key: str, number: str, label: str, title: str, text: str, company: bool = False) -> str:
    name, width, height, alt, tag = CARD_IMAGES[key]
    tag_html = f'<figcaption class="card-tag">{escape(tag)}</figcaption>' if tag else ''
    css = 'card card-company' if company else 'card'
    return (f'<a class="{css}" href="{href}"><figure class="card-media"><img src="/images/{name}" alt="{escape(alt)}" width="{width}" height="{height}" loading="lazy" decoding="async">{tag_html}</figure>'
            f'<div class="card-body"><span class="card-num">{number}</span><span class="en">{escape(label)}</span><h3>{escape(title)}</h3><p>{escape(text)}</p></div><span class="arrow" aria-hidden="true">↗</span></a>')


def _business(link, businesses) -> str:
    cards = _card('/business/zocco-group/', 'company', '00', '创办人兼董事长', '星域集团', '连接内容、科技、创作者与品牌。', company=True)
    cards += ''.join(_card(f'/business/{item["slug"]}/', item['slug'], f'0{number}', item['label'], item['title'], item['desc']) for number, item in enumerate(businesses, 1))
    return f'''
    <section class="panel hscroll" id="business" data-hscroll aria-labelledby="business-title"><div class="hscroll-pin">
      <div class="wrap hscroll-head"><div><p class="section-label">事业版图</p><h2 class="title" id="business-title">事业的交汇，<br>也是新机会的起点。</h2></div>
      <div class="hscroll-note"><p>连接内容、科技、创作者与品牌。<br>在星域集团，探索数字时代的商业可能。</p>{link('探索事业版图', '/business/')}</div></div>
      <div class="hscroll-track" role="group" aria-label="事业版图">{cards}</div>
    </div></section>'''


def _insights(link, articles, insight_item) -> str:
    cards = ''.join(insight_item(article) for article in articles)
    return f'''
    <section class="section panel bg-sand insights-section"><div class="wrap">
      <div class="section-head reveal"><div><p class="section-label">人工智能与观点</p><h2 class="title">关于未来的思考。</h2></div>{link('阅读观点', '/insights/', True)}</div>
      <div class="insight-grid home-insights">{cards}</div>
    </div></section>'''


def _impact(image, link) -> str:
    return f'''
    <section class="section panel on-navy impact-section" data-tone="dark"><div class="wrap">
      <div class="impact-layout"><div class="impact-copy reveal"><p class="section-label">社会贡献</p><h2 class="title">让成长，<br>成为更多人的机会。</h2><p class="body-copy">取之社会，用之社会。从教育支持、青年发展到社区公益，以持续的参与，为更多人打开机会。</p><div class="actions">{link('了解社会贡献', '/social-impact/', True)}</div></div><figure class="impact-photo">{image('impact1.jpg', '星域集团慈善基金成立活动的真实现场照片')}<figcaption class="photo-caption">星域集团慈善基金 · 活动记录</figcaption></figure></div>
      <div class="impact-projects"><a href="/social-impact/charitable-foundation/"><span>青年与社区</span><h3>星域集团慈善基金</h3><span class="arrow" aria-hidden="true">↗</span></a><a href="/social-impact/newgen-education/"><span>教育与传承</span><h3>苏亚辉与陈亚莲教育基金</h3><span class="arrow" aria-hidden="true">↗</span></a><a href="/social-impact/school-community/"><span>母校与公益</span><h3>回馈成长的起点</h3><span class="arrow" aria-hidden="true">↗</span></a></div>
    </div></section>'''


def _recognition(link) -> str:
    return f'''
    <section class="section panel recognition-section"><div class="wrap recognition-layout">
      <div class="reveal"><p class="section-label">奖项与认可</p><h2 class="title">学习与实践的印记。</h2><div class="actions">{link('查看全部荣誉', '/awards/', True)}</div></div>
      <div><a class="record-row" href="/awards/ai-honorary-fellow/"><span class="year">2026</span><div><span class="record-type">荣誉身份</span><h3>人工智能领域荣誉院士</h3><p>林肯大学学院</p></div><span class="arrow" aria-hidden="true">↗</span></a><a class="record-row" href="/dr-kervis-soo/#education"><span class="year">2025</span><div><span class="record-type">学术学历</span><h3>管理学博士</h3><p>马来亚大学</p></div><span class="arrow" aria-hidden="true">↗</span></a></div>
    </div></section>'''


def _media(link, coverage_rows, coverage) -> str:
    return f'''
    <section class="section panel bg-sand media-section"><div class="wrap"><div class="section-head reveal"><div><p class="section-label">媒体与公众记录</p><h2 class="title">从不同视角，看见实践。</h2></div>{link('查看媒体报道', '/media/', True)}</div>{coverage_rows(coverage[:HOME_COVERAGE_COUNT])}</div></section>'''


def _speaking(link) -> str:
    photo = _stage_photo('vybe-event', SPEAKING_PHOTO_ALT, 'speaking-photo', SPEAKING_STACK_BREAKPOINT)
    return f'''
    <section class="panel on-navy speaking-section" data-tone="dark" aria-labelledby="speaking-title">{photo}<div class="wrap speaking-strip"><div class="speaking-copy reveal"><p class="section-label">演讲与公开活动</p><h2 class="title" id="speaking-title">在对话中，<br>打开新的视角。</h2><p class="body-copy">人工智能与数字经济、创业与领导力、创作者生态。以实际经营的视角，与不同领域的人交流。</p><div class="actions">{link('邀请演讲', '/contact/?type=speaking', True)}{link('查看公开活动', '/speaking/')}</div></div></div></section>'''


def _reel_dialog() -> str:
    return (f'<dialog class="reel-dialog" id="reel-dialog" aria-label="{VIDEO_LABEL}"><button class="dialog-close" type="button" aria-label="关闭视频">✕</button>'
            f'<video controls playsinline preload="none" aria-label="{VIDEO_LABEL}" data-poster="{POSTER_PATH}" data-src="{VIDEO_PATH}"></video>'
            f'<a class="dialog-note" href="{EVENT_PATH}#video">阅读影像说明</a></dialog>')


def render_home(image, link, bio, businesses, articles, insight_item, coverage_rows, coverage, closing, social):
    return ''.join((
        f'<div class="stage">{_hero(link, social)}{_who_and_journey(link, bio)}</div>',
        _business(link, businesses),
        _insights(link, articles, insight_item),
        _impact(image, link),
        _recognition(link),
        _media(link, coverage_rows, coverage),
        _speaking(link),
        closing(),
        _reel_dialog(),
    ))
