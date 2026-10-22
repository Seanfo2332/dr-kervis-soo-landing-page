// Turns formatted text copied from Word, Google Docs, ChatGPT and similar into the plain text the article box
// understands: "## " big heading, "### " small heading, "- " bullet, every other line a paragraph.
// The pasted HTML is read in an inert document, so nothing in it is ever run or loaded.
const SMALL_HEADING_MAX_LENGTH = 80;
const SENTENCE_END = /[。！？.!?]$/;
const TRAILING_COLON = /\s*[:：]\s*$/;
const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION',
  'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR']);
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'IMG', 'SVG', 'IFRAME', 'OBJECT', 'VIDEO', 'AUDIO', 'CANVAS']);
const BLOCK_SELECTOR = [...BLOCK_TAGS].join(',').toLowerCase();
const BOLD_STYLE = /font-weight\s*:\s*(bold|bolder|[6-9]00)/i;
const FORMATTED_HTML = /<(h[1-6]|li|b|strong|table)[\s>]/i;
const MIN_BOLD_WEIGHT = 600;

const clean = (text) => text.replace(/[\s ​]+/g, ' ').trim();
const isElement = (node) => node.nodeType === 1;
const isSkipped = (node) => !isElement(node) || SKIPPED_TAGS.has(node.tagName);

// Whether the HTML carries structure worth converting; plain text pastes are left to the browser.
export function hasFormatting(html) {
  return FORMATTED_HTML.test(html) || BOLD_STYLE.test(html);
}

// The text lines inside a node. Line breaks and block boundaries split lines; source whitespace never does.
function linesOf(root) {
  let text = '';
  const visit = (node) => {
    if (node.nodeType === 3) {
      text += node.nodeValue.replace(/[\r\n\t]+/g, ' ');
      return;
    }
    if (isSkipped(node)) return;
    if (node.tagName === 'BR') {
      text += '\n';
      return;
    }
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock) text += '\n';
    node.childNodes.forEach(visit);
    if (isBlock) text += '\n';
  };
  root.childNodes.forEach(visit);
  return text.split('\n').map(clean).filter(Boolean);
}

// An explicit font-weight on the nearest element decides; otherwise <b> and <strong> are bold.
function boldAt(element) {
  const declared = /font-weight\s*:\s*([a-z0-9]+)/i.exec(element.getAttribute('style') || '');
  if (declared) {
    const value = declared[1].toLowerCase();
    return value === 'bold' || value === 'bolder' || Number(value) >= MIN_BOLD_WEIGHT;
  }
  return element.tagName === 'B' || element.tagName === 'STRONG' ? true : null;
}

function isBoldOnly(block) {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let found = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!clean(node.nodeValue)) continue;
    found = true;
    let bold = false;
    for (let element = node.parentElement; element; element = element.parentElement) {
      const weight = boldAt(element);
      if (weight !== null) {
        bold = weight;
        break;
      }
      if (element === block) break;
    }
    if (!bold) return false;
  }
  return found;
}

const looksLikeSmallHeading = (text) => Array.from(text).length <= SMALL_HEADING_MAX_LENGTH && !SENTENCE_END.test(text);

function addLeafBlock(element, out) {
  const lines = linesOf(element);
  if (lines.length === 1 && isBoldOnly(element) && looksLikeSmallHeading(lines[0])) {
    out.push({ kind: 'h3', text: lines[0].replace(TRAILING_COLON, '') });
    return;
  }
  lines.forEach((text) => out.push({ kind: 'p', text }));
}

function addListItems(list, out) {
  for (const item of list.children) {
    if (item.tagName !== 'LI') continue;
    const holder = item.ownerDocument.createElement('div');
    const nested = [];
    for (const child of item.childNodes) {
      if (isElement(child) && (child.tagName === 'UL' || child.tagName === 'OL')) nested.push(child);
      else holder.append(child.cloneNode(true));
    }
    const text = linesOf(holder).join(' ');
    if (text) out.push({ kind: 'li', text });
    nested.forEach((inner) => addListItems(inner, out));
  }
}

function addBlock(element, out) {
  const tag = element.tagName;
  if (/^H[1-6]$/.test(tag)) {
    const text = linesOf(element).join(' ');
    if (text) out.push({ kind: tag === 'H1' || tag === 'H2' ? 'h2' : 'h3', text });
  } else if (tag === 'UL' || tag === 'OL') {
    addListItems(element, out);
  } else if (tag === 'TABLE') {
    element.querySelectorAll('tr').forEach((row) => {
      const cells = [...row.children].map((cell) => linesOf(cell).join(' ')).filter(Boolean);
      if (cells.length) out.push({ kind: 'p', text: cells.join(' | ') });
    });
  } else if (element.querySelector(BLOCK_SELECTOR)) {
    walk(element, out);
  } else {
    addLeafBlock(element, out);
  }
}

// Walks the children of a container: blocks are handled on their own, and loose text between them becomes a paragraph.
function walk(container, out) {
  const document = container.ownerDocument;
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const holder = document.createElement('div');
    run.forEach((node) => holder.append(node.cloneNode(true)));
    addLeafBlock(holder, out);
    run = [];
  };
  for (const node of container.childNodes) {
    if (node.nodeType === 3) run.push(node);
    else if (isSkipped(node)) continue;
    else if (BLOCK_TAGS.has(node.tagName) || node.querySelector(BLOCK_SELECTOR)) {
      flush();
      addBlock(node, out);
    } else run.push(node);
  }
  flush();
}

const PREFIX = { h2: '## ', h3: '### ', li: '- ', p: '' };

export function htmlToArticleText(html) {
  const out = [];
  walk(new DOMParser().parseFromString(html, 'text/html').body, out);
  return out
    .map((block, index) => `${index === 0 ? '' : block.kind === 'li' && out[index - 1].kind === 'li' ? '\n' : '\n\n'}${PREFIX[block.kind]}${block.text}`)
    .join('');
}
