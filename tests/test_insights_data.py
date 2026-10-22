"""Unit tests for scripts/insights_data.py: python -m unittest discover -s tests -p "test_*.py"."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import insights_data as data  # noqa: E402


def record(**overrides):
    base = {
        'slug': 'my-first-insight',
        'title': '一篇新的观点文章',
        'summary': '这是一句话摘要。',
        'metaTitle': '一篇新的观点文章',
        'metaDescription': '这是给搜索引擎看的描述。',
        'body': '## 第一部分\n\n第一段。\n\n第二段。',
        'image': {'src': '/images/insights/my-first-insight.webp', 'small': '/images/insights/my-first-insight-640.webp',
                  'width': 1600, 'height': 1067, 'alt': '配图'},
        'published': '2026-10-21',
        'modified': '2026-10-21',
    }
    base.update(overrides)
    return base


class ParseBodyTests(unittest.TestCase):
    def test_one_or_two_hashes_start_a_new_section(self):
        sections = data.parse_body('# 一\n\n甲\n\n## 二\n\n乙')
        self.assertEqual([s.heading for s in sections], ['一', '二'])

    def test_three_hashes_make_a_small_heading_inside_the_section(self):
        sections = data.parse_body('## 大标题\n引言\n### 小标题\n内容\n### 另一个小标题\n更多内容')
        self.assertEqual([s.heading for s in sections], ['大标题'])
        self.assertEqual(sections[0].blocks, (('p', ('引言',)), ('h3', ('小标题',)), ('p', ('内容',)), ('h3', ('另一个小标题',)), ('p', ('更多内容',))))

    def test_a_small_heading_before_any_big_one_has_no_section_heading(self):
        sections = data.parse_body('### 开头的小标题\n内容\n## 正文\n更多')
        self.assertIsNone(sections[0].heading)
        self.assertEqual(sections[0].blocks, (('h3', ('开头的小标题',)), ('p', ('内容',))))

    def test_a_small_heading_ends_a_bullet_list(self):
        sections = data.parse_body('## 要点\n- 甲\n- 乙\n### 之后\n- 丙')
        self.assertEqual(sections[0].blocks, (('ul', ('甲', '乙')), ('h3', ('之后',)), ('ul', ('丙',))))

    def test_hash_tags_without_a_space_are_text(self):
        sections = data.parse_body('#话题 很热门\n## 标题\n内容')
        self.assertEqual(sections[0].blocks, (('p', ('#话题 很热门',)),))

    def test_four_or_more_hashes_are_not_headings(self):
        sections = data.parse_body('#### 不是标题')
        self.assertEqual(sections[0].blocks, (('p', ('#### 不是标题',)),))

    def test_every_line_is_its_own_paragraph(self):
        # Chinese text pasted from Word or WeChat has no blank lines between paragraphs.
        sections = data.parse_body('## 标题\n第一段\n第二段\n\n第三段')
        self.assertEqual(sections[0].blocks, (('p', ('第一段',)), ('p', ('第二段',)), ('p', ('第三段',))))

    def test_consecutive_bullets_form_one_list(self):
        sections = data.parse_body('## 要点\n- 甲\n- 乙\n* 丙\n\n结尾')
        self.assertEqual(sections[0].blocks, (('ul', ('甲', '乙', '丙')), ('p', ('结尾',))))

    def test_text_before_first_heading_has_no_heading(self):
        sections = data.parse_body('引言\n\n## 正文\n\n内容')
        self.assertIsNone(sections[0].heading)
        self.assertEqual(sections[1].heading, '正文')

    def test_windows_line_endings_and_extra_blank_lines(self):
        sections = data.parse_body('## 标题\r\n\r\n\r\n段落\r\n')
        self.assertEqual(sections[0].blocks, (('p', ('段落',)),))

    def test_empty_headings_and_empty_sections_are_dropped(self):
        sections = data.parse_body('##\n\n## 有内容\n\n正文\n\n## 没内容')
        self.assertEqual([s.heading for s in sections], ['有内容'])

    def test_blank_text_gives_no_sections(self):
        self.assertEqual(data.parse_body('  \n\n \n'), [])


class RenderTests(unittest.TestCase):
    def test_html_in_text_is_escaped(self):
        section = data.parse_body('## <script>alert(1)</script>\n\n<b>粗体</b> & "引号"')[0]
        html = data.render_blocks(section)
        self.assertNotIn('<b>', html)
        self.assertIn('&lt;b&gt;粗体&lt;/b&gt; &amp; &quot;引号&quot;', html)

    def test_small_headings_render_as_h3_and_are_escaped(self):
        section = data.parse_body('## T\n### <i>小</i> & 标题\n正文')[0]
        self.assertEqual(data.render_blocks(section), '<h3>&lt;i&gt;小&lt;/i&gt; &amp; 标题</h3><p>正文</p>')

    def test_renders_paragraphs_and_lists(self):
        section = data.parse_body('## T\n\n段落\n- 甲\n- 乙')[0]
        self.assertEqual(data.render_blocks(section), '<p>段落</p><ul class="article-list"><li>甲</li><li>乙</li></ul>')


class ReadingMinutesTests(unittest.TestCase):
    def test_minimum_one_minute(self):
        self.assertEqual(data.reading_minutes('短'), 1)

    def test_rounds_up_per_three_hundred_characters(self):
        self.assertEqual(data.reading_minutes('字' * 300), 1)
        self.assertEqual(data.reading_minutes('字' * 301), 2)

    def test_small_headings_count_as_reading_text(self):
        self.assertEqual(data.reading_minutes('### ' + '字' * 301), 2)

    def test_ignores_whitespace_and_heading_markers(self):
        self.assertEqual(data.reading_minutes('## ' + '字' * 299 + '\n\n \n'), 1)


class ValidateRecordTests(unittest.TestCase):
    def test_valid_record_is_normalised(self):
        article = data.validate_record(record(), builtin_slugs=set())
        self.assertEqual(article['slug'], 'my-first-insight')
        self.assertEqual(article['label'], '观点')
        self.assertEqual(article['minutes'], '1')
        self.assertEqual(article['category'], 'insights')
        self.assertEqual(article['image']['width'], 1600)

    def test_meta_fields_default_to_title_and_summary(self):
        article = data.validate_record(record(metaTitle='', metaDescription=''), builtin_slugs=set())
        self.assertEqual(article['meta_title'], '一篇新的观点文章')
        self.assertEqual(article['meta_description'], '这是一句话摘要。')

    def test_rejects_bad_slugs(self):
        for slug in ('', 'Has-Capitals', '../escape', 'a/b', 'trailing-', '-leading', 'double--dash', 'x' * 81, '中文'):
            with self.subTest(slug=slug), self.assertRaises(ValueError):
                data.validate_record(record(slug=slug), builtin_slugs=set())

    def test_rejects_slug_that_clashes_with_a_built_in_article(self):
        with self.assertRaises(ValueError):
            data.validate_record(record(slug='ai-in-the-workflow'), builtin_slugs={'ai-in-the-workflow'})

    def test_rejects_missing_or_empty_required_text(self):
        for field in ('title', 'summary', 'body'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                data.validate_record(record(**{field: '  '}), builtin_slugs=set())

    def test_rejects_body_with_only_headings(self):
        for body in ('## 只有标题', '### 只有小标题', '## 大\n### 小'):
            with self.subTest(body=body), self.assertRaises(ValueError):
                data.validate_record(record(body=body), builtin_slugs=set())

    def test_rejects_image_paths_outside_the_insights_folder(self):
        for src in ('/images/hero.jpg', 'https://evil.example/x.webp', '/images/insights/../hero.jpg', '/images/insights/x.svg'):
            image = dict(record()['image'], src=src)
            with self.subTest(src=src), self.assertRaises(ValueError):
                data.validate_record(record(image=image), builtin_slugs=set())

    def test_rejects_bad_dates(self):
        for value in ('2026-13-01', '21/10/2026', '', '2026-10-32'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                data.validate_record(record(published=value), builtin_slugs=set())

    def test_rejects_bad_image_dimensions(self):
        for width in (0, -5, 'wide', 100000):
            image = dict(record()['image'], width=width)
            with self.subTest(width=width), self.assertRaises(ValueError):
                data.validate_record(record(image=image), builtin_slugs=set())


class LoadInsightsTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / 'content' / 'insights').mkdir(parents=True)
        (self.root / 'images' / 'insights').mkdir(parents=True)

    def tearDown(self):
        self._tmp.cleanup()

    def add(self, **overrides):
        item = record(**overrides)
        if 'image' not in overrides:
            slug = item['slug']
            item['image'] = {'src': f'/images/insights/{slug}.webp', 'small': f'/images/insights/{slug}-640.webp', 'width': 10, 'height': 10, 'alt': ''}
        (self.root / 'content' / 'insights' / f"{item['slug']}.json").write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')
        for key in ('src', 'small'):
            (self.root / item['image'][key].lstrip('/')).write_bytes(b'x')
        return item

    def test_newest_first_then_slug(self):
        self.add(slug='older', published='2026-10-01', image={'src': '/images/insights/older.webp', 'small': '/images/insights/older-640.webp', 'width': 10, 'height': 10, 'alt': ''})
        self.add(slug='newer', published='2026-10-20', image={'src': '/images/insights/newer.webp', 'small': '/images/insights/newer-640.webp', 'width': 10, 'height': 10, 'alt': ''})
        articles, warnings = data.load_insights(self.root, builtin_slugs=set())
        self.assertEqual([a['slug'] for a in articles], ['newer', 'older'])
        self.assertEqual(warnings, [])

    def test_missing_folder_is_not_an_error(self):
        empty = Path(self._tmp.name) / 'nowhere'
        self.assertEqual(data.load_insights(empty, builtin_slugs=set()), ([], []))

    def test_invalid_json_is_skipped_with_a_warning(self):
        (self.root / 'content' / 'insights' / 'broken.json').write_text('{not json', encoding='utf-8')
        self.add()
        articles, warnings = data.load_insights(self.root, builtin_slugs=set())
        self.assertEqual(len(articles), 1)
        self.assertEqual(len(warnings), 1)
        self.assertIn('broken.json', warnings[0])

    def test_invalid_record_is_skipped_with_a_warning(self):
        self.add(slug='ok-one')
        item = self.add(slug='bad-one')
        item['title'] = ''
        (self.root / 'content' / 'insights' / 'bad-one.json').write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')
        articles, warnings = data.load_insights(self.root, builtin_slugs=set())
        self.assertEqual([a['slug'] for a in articles], ['ok-one'])
        self.assertIn('bad-one.json', warnings[0])

    def test_missing_image_file_is_skipped_with_a_warning(self):
        item = self.add()
        (self.root / item['image']['small'].lstrip('/')).unlink()
        articles, warnings = data.load_insights(self.root, builtin_slugs=set())
        self.assertEqual(articles, [])
        self.assertIn('image', warnings[0])

    def test_file_name_must_match_slug(self):
        item = record(slug='real-slug')
        (self.root / 'content' / 'insights' / 'other-name.json').write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')
        articles, warnings = data.load_insights(self.root, builtin_slugs=set())
        self.assertEqual(articles, [])
        self.assertIn('other-name.json', warnings[0])

    def test_duplicate_slug_across_files_keeps_first_only(self):
        # Two files cannot share a slug because the file name must equal the slug; a built-in clash is rejected.
        self.add(slug='ai-in-the-workflow')
        articles, warnings = data.load_insights(self.root, builtin_slugs={'ai-in-the-workflow'})
        self.assertEqual(articles, [])
        self.assertEqual(len(warnings), 1)


class RemoveStalePagesTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self._tmp.name) / 'insights'
        self.folder.mkdir()
        (self.folder / 'index.html').write_text('list', encoding='utf-8')
        for slug in ('keep-me', 'removed-article'):
            (self.folder / slug).mkdir()
            (self.folder / slug / 'index.html').write_text(slug, encoding='utf-8')

    def tearDown(self):
        self._tmp.cleanup()

    def test_removes_pages_with_no_article_behind_them(self):
        removed = data.remove_stale_pages(self.folder, keep={'keep-me'})
        self.assertEqual(removed, ['removed-article'])
        self.assertFalse((self.folder / 'removed-article').exists())

    def test_keeps_current_pages_and_the_list_page(self):
        data.remove_stale_pages(self.folder, keep={'keep-me'})
        self.assertTrue((self.folder / 'keep-me' / 'index.html').is_file())
        self.assertTrue((self.folder / 'index.html').is_file())

    def test_missing_folder_is_fine(self):
        self.assertEqual(data.remove_stale_pages(self.folder / 'nowhere', keep=set()), [])

    def test_never_follows_a_link_out_of_the_folder(self):
        outside = Path(self._tmp.name) / 'outside'
        outside.mkdir()
        (outside / 'precious.txt').write_text('keep', encoding='utf-8')
        link = self.folder / 'linked'
        try:
            link.symlink_to(outside, target_is_directory=True)
        except OSError:
            self.skipTest('symbolic links are not available here')
        data.remove_stale_pages(self.folder, keep=set())
        self.assertTrue((outside / 'precious.txt').is_file())


if __name__ == '__main__':
    unittest.main()
