"""Third-party coverage of Dr Kervis Soo, as listed on the Media page and the homepage.

Every entry was opened and checked (headline, outlet, date). Rules:
- `headline` is the page's own title as shown to readers and search engines, minus the site-name suffix.
- `summary` is written in our own words; the articles are linked, never republished.
- `kind` says how the piece was published, so visitors can tell reporting from placed content.
- Thumbnails are the site's own photographs of him, never the publishers' images.
Add an entry here (date as YYYY-MM-DD, YYYY-MM, or '' if the page states none) and rebuild.
"""
from dataclasses import dataclass
import re

# kind -> (Chinese label, English label, one-line explanation shown on the Media page)
KINDS = {
    'news': ('新闻报道', 'News', '新闻媒体发布的报道。'),
    'release': ('新闻稿', 'Press release', '通过新闻稿分发服务发布的稿件，内容由发稿方提供。'),
    'feature': ('品牌专题', 'Brand feature', '媒体网站上以介绍人物或品牌为主的专题内容。'),
    'platform': ('平台发布', 'Platform post', '由平台账号自行上传的稿件；平台声明其不代表平台立场。'),
}
# topic -> label for the filter buttons
TOPICS = {'ai': '人工智能与科技', 'business': '事业与品牌', 'impact': '社会贡献', 'person': '人物与学历'}

assert not set(KINDS) & set(TOPICS) and not any(key.startswith('all') for key in (*KINDS, *TOPICS)), 'filter keys must be unique'

# thumbnail path under /images -> (width, height)
THUMB_SIZES = {
    'events/gala-podium-640.webp': (640, 427),
    'events/gala-birthday-640.webp': (640, 427),
    'about-640.webp': (640, 427),
    'impact1-640.webp': (640, 427),
    'impact3.jpg': (810, 540),
}


@dataclass(frozen=True)
class Article:
    headline: str
    outlet: str
    kind: str
    date: str
    url: str
    summary: str
    topic: str
    thumb: str
    event: str = ''  # set to an event id to list the piece on that event's page
    lang: str = 'zh-CN'  # language of the headline, for screen readers
    headline_zh: str = ''  # Chinese display title; headline retains the source's original wording.

    @property
    def display_headline(self) -> str:
        text = self.headline_zh or self.headline
        for original, chinese in [('Dr Kervis苏才育', '苏才育博士'), ('Dr Kervis', '苏才育博士'),
                                  ('（KervisSoo）', ''), ('Kervis', '苏才育博士'), ('AI', '人工智能')]:
            text = text.replace(original, chinese)
        return re.sub(r'(?<=[\u4e00-\u9fff]) +(?=[\u4e00-\u9fff])', '', text)

    def __post_init__(self) -> None:
        # Fail the build on a typo instead of silently dropping a filter or a thumbnail.
        if self.kind not in KINDS or self.topic not in TOPICS or self.thumb not in THUMB_SIZES:
            raise ValueError(f'Unknown kind/topic/thumbnail in: {self.headline}')
        if self.date and not re.fullmatch(r'\d{4}-\d{2}(-\d{2})?', self.date):
            raise ValueError(f'Bad date {self.date!r} in: {self.headline}')
        if self.lang != 'zh-CN' and not self.headline_zh:
            raise ValueError(f'Chinese display title required: {self.headline}')


ARTICLES = (
    Article('916 Xing Yu Grand Gala Brings Cross-Industry Forces Together as VYBE Officially Launches',
            'ACCESS Newswire · Yahoo Finance', 'release', '2026-09-23',
            'https://finance.yahoo.com/technology/ai/articles/916-xing-yu-grand-gala-111500195.html',
            '新闻稿：916 星域荣耀盛典在八打灵再也举行，VYBE 正式启动并宣布多项合作。',
            'business', 'events/gala-birthday-640.webp', event='gala-2026', lang='en',
            headline_zh='916 星域荣耀盛典汇聚跨界力量，VYBE 正式启动'),
    Article("Malaysian movie 'The Day We Start Again' is now officially launched as Xing Yu Grand Honours sparks a buzz",
            'The Star', 'news', '2026-09-21',
            'https://www.thestar.com.my/aseanplus/aseanplus-news/2026/09/21/malaysian-movie-039the-day-we-start-again039-is-now-officially-launched-as-xing-yu-grand-honours-sparks-a-buzz',
            '报道马来西亚电影在盛典上正式推出；苏才育博士致开幕词并担任制片人。',
            'business', 'events/gala-podium-640.webp', event='gala-2026', lang='en',
            headline_zh='星域荣耀盛典引发热议，马来西亚电影《我们重新开始的那一天》（片名暂译）正式发布'),
    Article('916星域国际盛典汇聚跨界力量，VYBE正式启动',
            '潮新闻', 'platform', '2026-09-20',
            'https://tidenews.com.cn/tmh_news.html?id=6aafc620917a92000168c7d1',
            '回顾 9 月 16 日晚间主会场流程：VYBE 启动、合作仪式、颁奖、电影发布与生日庆祝等环节。',
            'business', 'events/gala-birthday-640.webp', event='gala-2026'),
    Article('916 Xing Yu Grand Honours Cetus Bualan, "The Day We Start Again" Dilancarkan Secara Rasmi',
            'Newswav', 'news', '2026-09-28',
            'https://newswav.com/article/916-xing-yu-grand-honours-cetus-bualan-the-day-we-start-again-dilancarkan-s-A2609_Bu5MtK',
            '马来文报道：同一场盛典、VYBE 正式启动与电影发布。',
            'business', 'events/gala-podium-640.webp', event='gala-2026', lang='ms',
            headline_zh='916 星域荣耀盛典引发热议，电影《我们重新开始的那一天》（片名暂译）正式发布'),
    Article('东盟AI娱乐生态发起人苏才育博士｜星域集团官方品牌人物志',
            'The Insider X', 'feature', '2026-06-09',
            'https://theinsiderx.com/dr-kervis-soo-asean-ai-entertainment-ecosystem/',
            '品牌人物志：回顾他从居銮到创办星域集团的历程与定位。',
            'person', 'about-640.webp'),
    Article('2026年星域集团AI音乐娱乐产业生态战略发布会隆重举行',
            '潮新闻', 'platform', '2026-01-22',
            'https://tidenews.com.cn/tmh_news.html?id=6972d2f464cf240001d5daa2',
            '记述 2026 年 1 月在吉隆坡举行的人工智能音乐娱乐产业生态战略发布会。',
            'ai', 'about-640.webp'),
    Article('“星域集团 AI 音乐生态圈” | 大马人入场 AI 音乐娱乐产业全攻略',
            'The Insider X', 'feature', '2026-01-22',
            'https://theinsiderx.com/zocco-group-ai-music-ecosystem/',
            '解析人工智能音乐生态圈对创作者与商户意味着什么。',
            'ai', 'about-640.webp'),
    Article('Dr Kervis AI Honorary Fellow: A New Era for Zocco Group',
            'On Asia News', 'feature', '2026-01-12',
            'https://onasianews.com/dr-kervis-ai-honorary-fellow/',
            '专题报道：借荣誉院士一事，谈人工智能如何提升日常办公效率。',
            'ai', 'impact3.jpg', lang='en', headline_zh='苏才育博士获授人工智能荣誉院士，星域集团迈向新阶段'),
    Article('Dr Kervis 荣获 AI 领域荣誉院士由林肯大学副校长拿督比比颁授',
            '潮新闻', 'platform', '2026-01-12',
            'https://tidenews.com.cn/tmh_news.html?id=6965101502c9650001fb1f2c',
            '报道他获林肯大学学院颁授人工智能领域荣誉院士。',
            'ai', 'impact3.jpg'),
    Article('“Dr Kervis AI荣誉院士”：解析大马企业 AI 转型痛点与实战建议',
            'The Insider X', 'feature', '2026-01-12',
            'https://theinsiderx.com/dr-kervis-ai-honorary-fellow/',
            '以荣誉院士为切入点，探讨大马企业人工智能转型的要点。',
            'ai', 'impact3.jpg'),
    Article('“Kervis 是谁”？马来西亚职场人必看的 AI 转型与实战经验攻略',
            'Insider News Asia', 'feature', '2026-01-02',
            'https://insidernewsasia.com/who-is-kervis/',
            '以“他是谁”为题，介绍其务实应用人工智能的观点。',
            'ai', 'about-640.webp'),
    Article('“星域百万慈善基金”：从Dr Kervis苏才育的初心到科技助善的革命',
            'Insider News Asia', 'feature', '2025-10-21',
            'https://insidernewsasia.com/xingyu-group-million-charity-fund/',
            '介绍星域百万慈善基金的缘起，以及公益透明、可追踪的理念。',
            'impact', 'impact1-640.webp'),
    Article('Dr Kervis苏才育——跨界企业家多元版图，从公益、影视到数字经济、汽车与餐饮的全链路布局',
            '搜狐', 'platform', '2025-08-16',
            'https://www.sohu.com/a/924634809_121910989',
            '梳理其在影视、数字经济、汽车与餐饮等领域的跨界布局。',
            'business', 'impact3.jpg'),
    Article('Dr Kervis苏才育——跨界企业家多元版图，从公益、影视到数字经济、汽车与餐饮的全链路布局',
            '新浪', 'platform', '',
            'https://super.sina.cn/shequn/post/detail_1097557542871126016.html',
            '新浪平台上的同一篇跨界布局文章；页面未标注发布日期。',
            'business', 'impact3.jpg'),
    Article('苏才育博士领军星域集团携手SYY医美高端快时尚医美，体系化美学体验馆，强势登陆马来西亚合作投资，打造本土医美新标杆',
            '潮新闻', 'platform', '2025-08-15',
            'https://tidenews.com.cn/tmh_news.html?id=689ffee96c70b000015630cf',
            '报道星域集团与 SYY 医美的合作投资及体验馆计划。',
            'business', 'impact3.jpg'),
    Article('荣耀时刻：苏才育（KervisSoo）荣膺管理博士学位，以学术与品格双修书写人生高峰',
            '潮新闻', 'platform', '2025-04-08',
            'https://tidenews.com.cn/tmh_news.html?id=67f48dd0a58f8d0001b0c2d8',
            '报道他在马来亚大学毕业典礼上获颁管理博士学位。',
            'person', 'about-640.webp'),
)


def display_date(date: str) -> str:
    """'2026-09-21' -> '2026.09.21'; '2026-09' -> '2026.09'; '' -> a plain note."""
    return date.replace('-', '.') if date else '日期未标注'
