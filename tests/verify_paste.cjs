// Checks admin/paste.js, which turns formatted text pasted from Word, Google Docs, ChatGPT and similar into the
// "## / ### / - " text the article box understands:  NODE_PATH=<folder with playwright> node tests/verify_paste.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { start } = require('./admin_harness.cjs');

const CASES = [
  ['headings, bold-only lines, lists and plain paragraphs (a typical formatted article)',
    `<p>九位得奖者获表彰其在社会影响力及相关领域的贡献。</p>
     <p><strong>TNCSEA Shining Business Award 2026得奖名单:</strong></p>
     <p>Thomas、Dato Kamil Othman、Henn（国贤）。</p>
     <h2>VYBE呈献全球创作者与娱乐荣誉大奖</h2>
     <p><strong>年度十大娱乐直播创作者得奖名单：</strong></p>
     <p>凯儿、鸿、雪人。</p>
     <p>此外，大会也颁发多项专业荣誉：</p>
     <ul><li>Outstanding Entertainment Guild Leader Award：Beryl</li><li>Outstanding Talent Manager Award：Chloe</li></ul>`,
    ['九位得奖者获表彰其在社会影响力及相关领域的贡献。', '', '### TNCSEA Shining Business Award 2026得奖名单', '', 'Thomas、Dato Kamil Othman、Henn（国贤）。', '',
      '## VYBE呈献全球创作者与娱乐荣誉大奖', '', '### 年度十大娱乐直播创作者得奖名单', '', '凯儿、鸿、雪人。', '', '此外，大会也颁发多项专业荣誉：', '',
      '- Outstanding Entertainment Guild Leader Award：Beryl', '- Outstanding Talent Manager Award：Chloe'].join('\n')],
  ['h1 and h2 become big headings, h3 to h6 small ones', '<h1>甲</h1><h3>乙</h3><h4>丙</h4><h6>丁</h6>', '## 甲\n\n### 乙\n\n### 丙\n\n### 丁'],
  ['Google Docs wrapper that is not really bold', `<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700;">小标题</span></p><p dir="ltr"><span style="font-weight:400;">正文一。</span></p></b>`, '### 小标题\n\n正文一。'],
  ['Word style bold paragraph', '<p class=MsoNormal><b><span lang=ZH-CN>粗体标题</span></b><o:p></o:p></p><p class=MsoNormal><span>正文。</span></p>', '### 粗体标题\n\n正文。'],
  ['a bold sentence that ends with a full stop stays a paragraph', '<p><b>这是一整段加粗的话，它以句号结尾。</b></p>', '这是一整段加粗的话，它以句号结尾。'],
  ['a very long bold line stays a paragraph', `<p><b>${'长'.repeat(90)}</b></p>`, '长'.repeat(90)],
  ['bold inside a normal paragraph stays in the paragraph', '<p>普通文字<b>加粗</b>普通文字</p>', '普通文字加粗普通文字'],
  ['line breaks make separate lines', '<p>第一行<br>第二行</p>', '第一行\n\n第二行'],
  ['non-breaking spaces and entities', '<p>A&nbsp;B &amp; C</p>', 'A B & C'],
  ['styles, scripts and comments are ignored', '<!--StartFragment--><style>p{color:red}</style><script>alert(1)</script><p>正文</p><!--EndFragment-->', '正文'],
  ['links keep only their words', '<p>看 <a href="https://x.example">这里</a>。</p>', '看 这里。'],
  ['nested lists are flattened', '<ul><li>一<ul><li>二</li></ul></li><li>三</li></ul>', '- 一\n- 二\n- 三'],
  ['numbered lists become bullets', '<ol><li>甲</li><li>乙</li></ol>', '- 甲\n- 乙'],
  ['list items that contain paragraphs', '<ul><li><p>甲</p></li><li><p>乙</p></li></ul>', '- 甲\n- 乙'],
  ['divs act as paragraphs', '<div>第一</div><div>第二</div>', '第一\n\n第二'],
  ['table rows become lines', '<table><tr><td>姓名</td><td>奖项</td></tr><tr><td>甲</td><td>乙</td></tr></table>', '姓名 | 奖项\n\n甲 | 乙'],
  ['formatting inside a heading is flattened', '<h2>大 <em>标题</em></h2><p>内容</p>', '## 大 标题\n\n内容'],
  ['empty headings and empty paragraphs are dropped', '<h2> </h2><p>&nbsp;</p><p>内容</p>', '内容'],
  ['nothing readable gives an empty result', '<p> </p><div></div>', ''],
];

const SHOULD_CONVERT = [
  ['<p><strong>x</strong></p>', true], ['<h2>x</h2>', true], ['<ul><li>x</li></ul>', true], ['<table><tr><td>x</td></tr></table>', true],
  ['<span style="font-weight:700">x</span>', true], ['<p>just text</p>', false], ['<div><span>line</span></div>', false], ['', false],
];

(async () => {
  const site = await start();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ baseURL: site.url })).newPage();
    await page.goto('/admin/');
    const results = await page.evaluate(async ({ cases, convertChecks }) => {
      const { htmlToArticleText, hasFormatting } = await import('/admin/paste.js');
      return { converted: cases.map(([, html]) => htmlToArticleText(html)), predicate: convertChecks.map(([html]) => hasFormatting(html)) };
    }, { cases: CASES, convertChecks: SHOULD_CONVERT });
    CASES.forEach(([name, , expected], index) => assert.equal(results.converted[index], expected, name));
    SHOULD_CONVERT.forEach(([html, expected], index) => assert.equal(results.predicate[index], expected, `hasFormatting(${html})`));
    console.log(`PASS: ${CASES.length} paste conversions and ${SHOULD_CONVERT.length} format checks`);
  } finally {
    await browser.close();
    await site.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
