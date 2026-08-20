// SmartNews W2A LP — Sheet 駆動の記事セクション更新 + Adjust install CTA
// 使い方:
//   1. index.html を含む prototypes/ 内の HTML から <script src="_lp.js"></script> を読み込む
//   2. LP 側で: <script>fetchAndRender('gardening')</script> を呼ぶ
//   3. .article-list 要素の中身が Sheet から取得した記事で置き換わる (失敗時は既存 mock が残る)
//   4. install CTA (a.store-btn.primary, a.nav-cta) は platform 判定して Adjust URL に置換

const SHEET_ID = '1cBwvf7KP2Y6rj0ybszNZ3jQX0uknWMQDzqWqg3QpWKQ';

const ADJUST_URLS = {
  ios:     'https://app.adjust.com/23xg3zdu',
  android: 'https://app.adjust.com/23uy7w87',
};
// Desktop / その他: App Store 選択ページ (SmartNews 公式 fallback)
const FALLBACK_INSTALL_URL = 'https://smartnews.com/en/download/';

function _detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua))          return 'android';
  return 'other';
}

function _installUrl() {
  const p = _detectPlatform();
  const base = ADJUST_URLS[p];
  if (!base) return FALLBACK_INSTALL_URL;
  // Google Ads → Adjust → LP 経由で来た場合、LP URL に wbraid/gclid 等が付与されているので Adjust に転送 (attribution 保持)
  const src = new URLSearchParams(location.search);
  const forward = ['wbraid', 'gclid', 'campaign', 'adgroup', 'creative', 'external_click_id'];
  const kept = new URLSearchParams();
  forward.forEach(k => { const v = src.get(k); if (v) kept.set(k, v); });
  const suffix = kept.toString();
  return suffix ? `${base}?${suffix}` : base;
}

function _swapInstallCtas() {
  const url = _installUrl();
  // .store-btn.primary (hero / bottom CTA) + .nav-cta (top bar)
  const targets = document.querySelectorAll('a.store-btn.primary, a.nav-cta');
  targets.forEach(a => {
    a.href = url;
    a.setAttribute('rel', 'noopener');
  });
  console.info(`[W2A] install CTAs → ${url} (platform=${_detectPlatform()}, count=${targets.length})`);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _swapInstallCtas);
  } else {
    _swapInstallCtas();
  }
}

function _parseCsv(text) {
  // Google Sheets gviz の CSV 出力は RFC 4180 準拠 (ダブルクォート囲みでカンマ・改行対応)
  const rows = [];
  let cur = [''];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i+1] === '"') { cur[cur.length-1] += '"'; i++; }
        else inQ = false;
      } else {
        cur[cur.length-1] += c;
      }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') cur.push('');
      else if (c === '\n') { rows.push(cur); cur = ['']; }
      else if (c === '\r') { /* skip */ }
      else cur[cur.length-1] += c;
    }
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows;
}

function _rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const [header, ...data] = rows;
  return data.filter(r => r.some(c => c.trim())).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h.trim()] = (r[i] || '').trim(); });
    return o;
  });
}

function _renderArticles(articles, listEl) {
  // 記事タップも install 導線 (Adjust URL) にする。元の記事 URL には遷移させない
  // = W2A LP の目的は install であって記事閲覧ではない (記事は install 動機付けの material)
  const installHref = _installUrl();
  const html = articles.map(a => {
    const thumb = a.image_url
      ? `<div class="thumb has-image" style="background-image:url('${_escAttr(a.image_url)}')"></div>`
      : `<div class="thumb">${a.emoji || '📰'}</div>`;
    return `
    <a class="article" href="${_escAttr(installHref)}" rel="noopener">
      ${thumb}
      <div class="body">
        <div class="src">${_esc(a.source)}</div>
        <div class="title">${_esc(a.title)}</div>
        <div class="meta">${_esc(a.published_ago)}</div>
      </div>
    </a>
  `;
  }).join('');
  listEl.innerHTML = html;
}

function _escAttr(s) {
  return (s || '').replace(/["'<>]/g, c => ({
    '"': '%22', "'": '%27', '<': '%3C', '>': '%3E'
  }[c]));
}

function _esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function fetchAndRender(slug, listSelector = '.article-list') {
  const listEl = document.querySelector(listSelector);
  if (!listEl) { console.warn(`[W2A] ${listSelector} not found`); return; }
  if (!SHEET_ID || SHEET_ID === 'REPLACE_WITH_SHEET_ID') {
    console.warn('[W2A] SHEET_ID 未設定、mock 記事を維持');
    return;
  }
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = _parseCsv(text);
    const items = _rowsToObjects(rows);
    if (items.length === 0) throw new Error('no rows');
    _renderArticles(items, listEl);
    console.info(`[W2A] rendered ${items.length} articles for "${slug}"`);
  } catch (err) {
    console.warn(`[W2A] fetch failed for "${slug}", keeping mock:`, err);
  }
}
