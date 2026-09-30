"""Homepage composition following the ten sections of the content framework (PDF, section 01).

Copy comes from the shared content in build_site.py; wording the PDF specifies
(hero label, tagline, section names, button labels, closing headline) takes priority.
"""

IDENTITY_TAGS = ('Entrepreneur', 'Innovator', 'Philanthropist', 'Youth Advocate')

# Real photographs only, shown in the journey pill: (file, width, height).
# The pill is decorative (the link carries its own label); the same photos appear with alt text elsewhere.
PILL_PHOTOS = (
    ('hero.jpg', 1200, 800),
    ('about.webp', 1200, 800),
    ('impact1.webp', 1200, 800),
    ('impact3.jpg', 810, 540),
)


def cta(en: str, zh: str) -> str:
    """Button label: what happens next in English, with the Chinese beside it."""
    return f'{en}<small>{zh}</small>'


def _hero(link) -> str:
    return f'''
    <section class="hero on-navy" aria-labelledby="hero-title"><div class="hero-stage">
      <p class="eyebrow hero-eyebrow">ENTREPRENEUR · AI &amp; DIGITAL ECONOMY ADVOCATE · PHILANTHROPIST</p>
      <h1 id="hero-title" class="hero-title"><span class="hero-row hero-row-1"><span class="hero-word hero-word-dr">Dr</span> <span class="hero-word hero-word-kervis">Kervis</span></span> <span class="hero-row hero-row-2">Soo<span class="hero-chinese">苏才育博士</span></span></h1>
      <img class="hero-cutout" src="/images/hero-cutout.webp" width="496" height="640" alt="Dr Kervis Soo 苏才育博士的正式肖像" fetchpriority="high" decoding="async">
      <div class="hero-copy"><p class="hero-tagline">Building businesses. Empowering people. Creating impact.</p><p class="hero-role">Founder &amp; Chairman, Zocco Group<br>星域集团创办人兼董事长</p></div>
      <div class="hero-cta actions">{link(cta('Discover His Journey', '探索他的来时路'), '/story/', True)}{link(cta('Explore His Work', '了解他的事业'), '/business/')}</div>
    </div></section>'''


def _introduction(link, bio: str) -> str:
    tags = ''.join(f'<span class="tag">{tag}</span>' for tag in IDENTITY_TAGS)
    return f'''
    <section class="section on-navy about-section" id="introduction"><div class="wrap intro-grid">
      <div class="reveal"><p class="section-label">Who Is Dr Kervis? · 他是谁</p><h2 class="title">持续探索，<br>让想法走向实践。</h2><div class="tag-row">{tags}</div><div class="actions">{link(cta('Read Full Biography', '完整人物简介'), '/dr-kervis-soo/', True)}</div></div>
      <div class="intro-text reveal"><p class="lead">从数字内容到人工智能，<br>连接科技、商业与人的成长。</p><p class="body-copy">{bio}</p></div>
    </div></section>'''


def _photo_pill() -> str:
    """A capsule of his real photographs, drifting slowly; links to the full story."""
    def tile(photo, hidden: bool) -> str:
        name, width, height = photo
        hide = ' aria-hidden="true"' if hidden else ''
        return f'<img src="/images/{name}" alt=""{hide} width="{width}" height="{height}" loading="lazy" decoding="async">'
    track = ''.join(tile(photo, False) for photo in PILL_PHOTOS) + ''.join(tile(photo, True) for photo in PILL_PHOTOS)
    return f'''<a class="photo-pill reveal" href="/story/" aria-label="His Journey 来时路：查看完整历程"><span class="photo-pill-track">{track}</span><span class="photo-pill-label"><span class="latin">His Journey</span><small>来时路</small></span></a>'''


def _journey(link) -> str:
    return f'''
    <section class="section on-navy story-section"><div class="wrap">
      <div class="story-head">
        <div class="reveal"><p class="section-label">His Journey · 来时路</p><h2 class="title">一路学习，<br>一路向前。</h2></div>
        <div class="story-copy reveal"><p class="body-copy">从居銮的求学时光，到创办星域集团；从数字内容，到人工智能应用。不断学习，是贯穿这段旅程的线索。</p>
        <div class="mini-timeline"><div><strong>1992</strong><span>出生于马来西亚</span></div><div><strong>2025</strong><span>管理学博士</span></div><div><strong>2026</strong><span>AI 荣誉院士</span></div></div>
        <div class="actions">{link(cta('Explore The Full Journey', '查看完整历程'), '/story/', True)}</div></div>
      </div>
      {_photo_pill()}
    </div></section>'''


def _business(image, link, businesses) -> str:
    rows = ''.join(
        f'<a class="business-row" href="/business/{item["slug"]}/"><div><span class="en">{item["en"]}</span><h3>{item["title"]}</h3><p>{item["desc"]}</p></div><span class="arrow" aria-hidden="true">↗</span></a>'
        for item in businesses)
    return f'''
    <section class="section business-section"><div class="wrap">
      <div class="section-head reveal"><div><p class="section-label">Business &amp; Companies · 事业版图</p><h2 class="title">事业的交汇，<br>也是新机会的起点。</h2></div><div class="section-head-note"><p>连接内容、科技、创作者与品牌。<br>在星域集团，探索数字时代的商业可能。</p>{link(cta('Explore His Businesses', '探索事业版图'), '/business/')}</div></div>
      <div class="business-feature"><figure>{image('generated/business-city.webp', '现代城市建筑与开阔露台，AI 生成的商业主题概念影像')}<figcaption class="photo-caption">AI 概念影像</figcaption></figure><a class="business-signature" href="/business/zocco-group/"><span>Zocco Group<small>星域集团 · 创办人兼董事长</small></span><span class="arrow" aria-hidden="true">↗</span></a></div>
      <div class="business-fields">{rows}</div>
    </div></section>'''


def _insights(link, articles, insight_item) -> str:
    cards = ''.join(insight_item(article) for article in articles)
    return f'''
    <section class="section bg-sand insights-section"><div class="wrap">
      <div class="section-head reveal"><div><p class="section-label">AI &amp; Insights · AI 与观点</p><h2 class="title">关于未来的思考。</h2></div>{link(cta('Read His Insights', '阅读观点'), '/insights/', True)}</div>
      <div class="insight-grid home-insights">{cards}</div>
    </div></section>'''


def _impact(image, link) -> str:
    return f'''
    <section class="section on-navy impact-section"><div class="wrap">
      <div class="impact-layout"><div class="impact-copy reveal"><p class="section-label">Social Impact · 社会贡献</p><h2 class="title">让成长，<br>成为更多人的机会。</h2><p class="body-copy">取之社会，用之社会。从教育支持、青年发展到社区公益，以持续的参与，为更多人打开机会。</p><div class="actions">{link(cta('Explore Social Impact', '了解社会贡献'), '/social-impact/', True)}</div></div><figure class="impact-photo">{image('impact1.jpg', '星域集团慈善基金成立活动的真实现场照片')}<figcaption class="photo-caption">星域集团慈善基金 · 活动记录</figcaption></figure></div>
      <div class="impact-projects"><a href="/social-impact/charitable-foundation/"><span>青年与社区</span><h3>星域集团慈善基金</h3><span class="arrow" aria-hidden="true">↗</span></a><a href="/social-impact/newgen-education/"><span>教育与传承</span><h3>NEWGEN 教育基金</h3><span class="arrow" aria-hidden="true">↗</span></a><a href="/social-impact/school-community/"><span>母校与公益</span><h3>回馈成长的起点</h3><span class="arrow" aria-hidden="true">↗</span></a></div>
    </div></section>'''


def _recognition(link) -> str:
    return f'''
    <section class="section recognition-section"><div class="wrap recognition-layout">
      <div class="reveal"><p class="section-label">Awards &amp; Recognition · 奖项与认可</p><h2 class="title">学习与实践的印记。</h2><div class="actions">{link(cta('View All Recognition', '查看全部荣誉'), '/awards/', True)}</div></div>
      <div><a class="record-row" href="/awards/ai-honorary-fellow/"><span class="year">2026</span><div><span class="record-type">荣誉身份 / Honorary appointment</span><h3>人工智能领域荣誉院士</h3><p>Lincoln University College · 林肯大学学院</p></div><span class="arrow" aria-hidden="true">↗</span></a><a class="record-row" href="/dr-kervis-soo/#education"><span class="year">2025</span><div><span class="record-type">学术学历 / Academic qualification</span><h3>管理学博士 · DBA</h3><p>University of Malaya · 马来亚大学</p></div><span class="arrow" aria-hidden="true">↗</span></a></div>
    </div></section>'''


def _media(link, reference_rows, references) -> str:
    return f'''
    <section class="section bg-sand media-section"><div class="wrap"><div class="section-head reveal"><div><p class="section-label">Media &amp; Public Record · 媒体与公众记录</p><h2 class="title">从不同视角，看见实践。</h2></div>{link(cta('View Media Coverage', '查看媒体报道'), '/media/', True)}</div>{reference_rows(references[:3])}</div></section>'''


def _speaking(image, link) -> str:
    return f'''
    <section class="section speaking-section"><div class="wrap speaking-strip"><figure>{image('impact3.jpg', '苏才育博士在星域集团开幕仪式上发言的真实现场照片')}</figure><div class="speaking-copy reveal"><p class="section-label">Speaking &amp; Appearances · 演讲与公开活动</p><h2 class="title">在对话中，<br>打开新的视角。</h2><p class="body-copy">AI 与数字经济、创业与领导力、创作者生态。以实际经营的视角，与不同领域的人交流。</p><div class="actions">{link(cta('Invite Dr Kervis', '邀请演讲'), '/contact/?type=speaking', True)}{link(cta('View Appearances', '查看公开活动'), '/speaking/')}</div></div></div></section>'''


def render_home(image, link, bio, businesses, articles, insight_item, reference_rows, references, closing):
    return ''.join((
        _hero(link),
        _introduction(link, bio),
        _journey(link),
        _business(image, link, businesses),
        _insights(link, articles, insight_item),
        _impact(image, link),
        _recognition(link),
        _media(link, reference_rows, references),
        _speaking(image, link),
        closing(),
    ))
