"""Homepage composition, using the shared content and image helpers."""


def render_home(image, link, eyebrow, bio, businesses, articles, insight_item, reference_rows, references, closing):
    business_links = ''.join(
        f'<a class="business-row" href="/business/{item["slug"]}/"><div><span class="en">{item["en"]}</span><h3>{item["title"]}</h3><p>{item["desc"]}</p></div><span class="arrow" aria-hidden="true">↗</span></a>'
        for item in businesses)
    insights = ''.join(insight_item(article) for article in articles)
    return f'''
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-grid wrap">
        <div class="hero-content">
          {eyebrow('Entrepreneur. Innovator. Philanthropist.')}
          <h1 id="hero-title">Dr Kervis<br> Soo<span class="hero-chinese">苏才育博士</span></h1>
          <p class="hero-manifesto">以科技连接可能，<br>以事业创造价值。</p>
          <p class="hero-role">Founder &amp; Chairman, Zocco Group<br>星域集团创办人兼董事长</p>
          <div class="actions">{link('认识 Dr Kervis', '/dr-kervis-soo/', True)}{link('探索事业', '/business/')}</div>
        </div>
        <figure class="hero-portrait">{image('hero.jpg', 'Dr Kervis Soo 苏才育博士的正式肖像', 'hero-photo', True)}</figure>
      </div>
    </section>

    <section class="section about-section" id="introduction"><div class="wrap intro-grid">
      <div class="reveal"><p class="section-label">About Dr Kervis</p><h2 class="title">持续探索，<br>让想法走向实践。</h2>{link('完整人物简介', '/dr-kervis-soo/')}</div>
      <div class="intro-text reveal"><p class="lead">从数字内容到人工智能，<br>连接科技、商业与人的成长。</p><p class="body-copy">{bio}</p></div>
    </div></section>

    <section class="section story-section"><div class="wrap portrait-story">
      <figure>{image('about.png', '苏才育博士坐在桌前的个人肖像')}<figcaption class="photo-caption">Dr Kervis Soo · 苏才育博士</figcaption></figure>
      <div class="story-copy reveal"><p class="section-label">His journey</p><h2 class="title">一路学习，<br>一路向前。</h2><p class="body-copy">从居銮的求学时光，到创办星域集团；从数字内容，到人工智能应用。不断学习，是贯穿这段旅程的线索。</p>
      <div class="mini-timeline"><div><strong>1992</strong><span>出生于马来西亚</span></div><div><strong>2025</strong><span>管理学博士</span></div><div><strong>2026</strong><span>AI 荣誉院士</span></div></div>{link('走进他的来时路', '/story/')}</div>
    </div></section>

    <section class="section business-section"><div class="wrap">
      <div class="section-head reveal"><div><p class="section-label">Business &amp; companies</p><h2 class="title">事业的交汇，<br>也是新机会的起点。</h2></div><div class="section-head-note"><p>连接内容、科技、创作者与品牌。<br>在星域集团，探索数字时代的商业可能。</p>{link('探索事业版图', '/business/')}</div></div>
      <div class="business-feature"><figure>{image('generated/business-city.webp', '现代城市建筑与开阔露台，AI 生成的商业主题概念影像')}<figcaption class="photo-caption">AI 概念影像</figcaption></figure><a class="business-signature" href="/business/zocco-group/"><span>Zocco Group<small>星域集团 · 创办人兼董事长</small></span><span class="arrow" aria-hidden="true">↗</span></a></div>
      <div class="business-fields">{business_links}</div>
    </div></section>

    <section class="section insights-section"><div class="wrap">
      <div class="section-head reveal"><div><p class="section-label">Ideas &amp; perspectives</p><h2 class="title">关于未来的思考。</h2></div>{link('阅读全部观点', '/insights/')}</div>
      <div class="insight-grid home-insights">{insights}</div>
    </div></section>

    <section class="section impact-section"><div class="wrap">
      <div class="impact-layout"><div class="impact-copy reveal"><p class="section-label">Social impact</p><h2 class="title">让成长，<br>成为更多人的机会。</h2><p class="body-copy">取之社会，用之社会。从教育支持、青年发展到社区公益，以持续的参与，为更多人打开机会。</p>{link('了解社会贡献', '/social-impact/')}</div><figure class="impact-photo">{image('impact1.jpg', '星域集团慈善基金成立活动的真实现场照片')}<figcaption class="photo-caption">星域集团慈善基金 · 活动记录</figcaption></figure></div>
      <div class="impact-projects"><a href="/social-impact/charitable-foundation/"><span>青年与社区</span><h3>星域集团慈善基金</h3><span class="arrow" aria-hidden="true">↗</span></a><a href="/social-impact/newgen-education/"><span>教育与传承</span><h3>NEWGEN 教育基金</h3><span class="arrow" aria-hidden="true">↗</span></a><a href="/social-impact/school-community/"><span>母校与公益</span><h3>回馈成长的起点</h3><span class="arrow" aria-hidden="true">↗</span></a></div>
    </div></section>

    <section class="section recognition-section"><div class="wrap recognition-layout">
      <div class="reveal"><p class="section-label">Education &amp; recognition</p><h2 class="title">学习与实践的印记。</h2>{link('学历与荣誉', '/awards/')}</div>
      <div><a class="record-row" href="/awards/ai-honorary-fellow/"><span class="year">2026</span><div><span class="record-type">荣誉身份 / Honorary appointment</span><h3>人工智能领域荣誉院士</h3><p>Lincoln University College · 林肯大学学院</p></div><span class="arrow" aria-hidden="true">↗</span></a><a class="record-row" href="/dr-kervis-soo/#education"><span class="year">2025</span><div><span class="record-type">学术学历 / Academic qualification</span><h3>管理学博士 · DBA</h3><p>University of Malaya · 马来亚大学</p></div><span class="arrow" aria-hidden="true">↗</span></a></div>
    </div></section>

    <section class="section media-section"><div class="wrap"><div class="section-head reveal"><div><p class="section-label">In the media</p><h2 class="title">从不同视角，看见实践。</h2></div>{link('浏览媒体记录', '/media/')}</div>{reference_rows(references[:3])}</div></section>

    <section class="section speaking-section"><div class="wrap speaking-strip"><figure>{image('impact3.jpg', '苏才育博士在星域集团开幕仪式上发言的真实现场照片')}</figure><div class="speaking-copy reveal"><p class="section-label">Speaking &amp; appearances</p><h2 class="title">在对话中，<br>打开新的视角。</h2><p class="body-copy">AI 与数字经济、创业与领导力、创作者生态。以实际经营的视角，与不同领域的人交流。</p><div class="actions">{link('邀请演讲', '/contact/?type=speaking', True)}{link('公开活动', '/speaking/')}</div></div></div></section>
    {closing()}'''
