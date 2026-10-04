"""The 916 gala record page and the appearance cards on /speaking/.

Wording sticks to what the photos and the coverage show. The degree-conferment segment is
captioned without naming an institution until the official wording is confirmed.
"""
from collections.abc import Callable

EVENT_ID = 'gala-2026'  # matches Article.event in press_data.py
EVENT_PATH = '/speaking/xing-yu-grand-honours-2026/'
EVENT_NAME = '2026 星域荣耀盛典'
EVENT_DATE = '2026-09-16'
EVENT_DATE_LABEL = '2026.09.16'
VIDEO_PATH = '/images/events/gala-reel.mp4'
POSTER_PATH = '/images/events/gala-reel-poster.webp'
VIDEO_LABEL = '916 星域荣耀盛典精选影像'
VIDEO_DURATION_LABEL = '约 1 分 47 秒'
VIDEO_DURATION_ISO = 'PT1M47S'
VIDEO_UPLOADED = '2026-10-01'  # the day the reel was added to this site (schema.org uploadDate)
OG_IMAGE = '/images/events/gala-podium-og.jpg'
# Cards are about 620px wide on desktop, so the 640px file is enough; phones use the full width.
APPEARANCE_SIZES = '(max-width: 680px) calc(100vw - 48px), (max-width: 1360px) 46vw, 620px'

# The reel has live sound but no captions yet, so its content is described in running order.
VIDEO_SEGMENTS = (
    '红毯与后台：嘉宾合影，现场气氛热烈',
    '舞台上的「苏才育博士生日庆祝与合作伙伴周年庆」庆祝与礼花',
    '颁奖环节：证书与奖项颁发，并有现场演唱',
    '合作备忘录签署仪式',
    '学位颁授环节',
    '红毯人像与大合影',
)

Renderer = Callable[..., str]

# (image, alt text, caption)
GALLERY = (
    ('events/gala-podium.webp', '苏才育博士手持麦克风在讲台前致辞，身后大屏显示 VYBE 与星域集团标识', f'开幕致辞 · {EVENT_DATE_LABEL}'),
    ('events/gala-degree.webp', '学位颁授环节：苏才育博士身着学位袍，与颁授嘉宾在舞台上合影', f'学位颁授环节 · {EVENT_DATE_LABEL}'),
    ('events/gala-birthday.webp', '舞台上众人手持礼花庆祝，背景大屏写着苏才育博士生日庆祝', f'生日庆祝与合作伙伴周年 · {EVENT_DATE_LABEL}'),
)

# (image, alt text, when, title, description, link target or '')
APPEARANCES = (
    ('events/gala-podium.webp', '苏才育博士在星域荣耀盛典上致辞', EVENT_DATE_LABEL, '916 星域荣耀盛典',
     'VYBE 正式启动、电影发布与多项合作仪式。查看精选影像、现场照片与相关报道。', EVENT_PATH),
    ('events/vybe-event.webp', '苏才育博士在舞台上演讲，大屏显示他的姓名与 VYBE 标识', '2026.07', '星域 × VYBE 活动',
     '舞台演讲现场影像。', ''),
    ('events/csr-portrait.webp', '苏才育博士身着米色西装，在活动现场的人像', '2026.06', '企业社会责任活动',
     '活动现场人像。', ''),
    ('impact3.jpg', '苏才育博士在星域集团开幕仪式上发言', '', '星域集团开幕仪式',
     '以创办人兼董事长身份出席并发言。', '/speaking/zocco-group-opening/'),
)


def appearance_cards(image: Renderer, link: Renderer) -> str:
    cards = []
    for name, alt, when, title, description, href in APPEARANCES:
        action = link('查看活动', href) if href else ''
        # The date span is always present (even when empty) so titles line up across a row.
        cards.append(f'<article class="appearance"><figure>{image(name, alt, sizes=APPEARANCE_SIZES)}</figure>'
                     f'<div><span class="appearance-date">{when}</span><h3>{title}</h3><p>{description}</p>{action}</div></article>')
    return f'<div class="appearance-grid">{"".join(cards)}</div>'


def video_block() -> str:
    segments = ''.join(f'<li>{segment}</li>' for segment in VIDEO_SEGMENTS)
    return (f'<div class="video-wrap"><video controls preload="none" playsinline poster="{POSTER_PATH}" width="1280" height="720" aria-label="{VIDEO_LABEL}">'
            f'<source src="{VIDEO_PATH}" type="video/mp4">您的浏览器不支持视频播放。<a href="{VIDEO_PATH}">下载视频</a></video>'
            f'<p class="photo-caption">活动精选影像 · {VIDEO_DURATION_LABEL} · 含现场声音，暂无字幕；下方提供内容概述。</p>'
            f'<details class="video-description"><summary>影片内容概述</summary><ol>{segments}</ol></details></div>')


def gallery_block(image: Renderer) -> str:
    figures = ''.join(f'<figure>{image(name, alt)}<figcaption class="photo-caption">{caption}</figcaption></figure>' for name, alt, caption in GALLERY)
    return f'<div class="event-gallery">{figures}</div>'


def event_sections(image: Renderer, link: Renderer, coverage_html: str) -> list[tuple[str, str, str]]:
    facts = ('<dl class="facts"><div><dt>活动</dt><dd>2026 星域荣耀盛典</dd></div>'
             '<div><dt>日期</dt><dd>2026 年 9 月 16 日 · 马来西亚日</dd></div>'
             '<div><dt>地点</dt><dd>八打灵再也 Hextar World · D Theatre</dd></div>'
             '<div><dt>出席</dt><dd>致开幕词；并担任电影《我们重新开始的那一天》（片名暂译）制片人（据星报报道）</dd></div></dl>')
    overview = (facts + '<p>据星报报道，当晚举行了 VYBE 马来西亚正式启动，并正式推出电影《我们重新开始的那一天》（片名暂译）；'
                '据潮新闻的晚间流程回顾，活动另有合作仪式、学位颁授、颁奖与生日庆祝等环节。'
                '到场嘉宾来自企业、教育、科技、影视与创作者社群。</p>')
    invite = ('<p>如希望邀请苏才育博士参与会议、论坛、校园交流或媒体访问，请提供主题、活动形式、日期与地点。</p>'
              + link('邀请演讲', '/contact/?type=speaking', True))
    return [
        ('overview', '活动概览', overview),
        ('video', '精选影像', video_block()),
        ('photos', '现场照片', gallery_block(image)),
        ('coverage', '相关报道', coverage_html),
        ('invite', '活动与演讲邀请', invite),
    ]


def event_schema(domain: str) -> list[dict]:
    """Event + VideoObject structured data for the record page."""
    page = domain + EVENT_PATH
    return [
        {'@type': 'Event', '@id': page + '#event', 'name': EVENT_NAME, 'startDate': EVENT_DATE,
         'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
         'location': {'@type': 'Place', 'name': 'D Theatre, Hextar World',
                      'address': {'@type': 'PostalAddress', 'addressLocality': 'Petaling Jaya', 'addressCountry': 'MY'}},
         'image': [domain + '/images/events/gala-podium.webp'], 'url': page, 'video': {'@id': page + '#video'},
         'description': 'VYBE 马来西亚正式启动、合作仪式、颁奖与电影发布，苏才育博士致开幕词。'},
        {'@type': 'VideoObject', '@id': page + '#video', 'name': VIDEO_LABEL, 'description': '916 星域荣耀盛典的精选活动影像。',
         'thumbnailUrl': domain + POSTER_PATH, 'uploadDate': VIDEO_UPLOADED, 'duration': VIDEO_DURATION_ISO, 'contentUrl': domain + VIDEO_PATH},
    ]
