#!/usr/bin/env node
/**
 * 육아 뉴스 수집기 (API 키 불필요)
 *  - 구글 뉴스 검색 RSS + 기관·언론사 RSS → 제목·요약·링크만 저장 (본문 수집 안 함)
 *  - 중복 제거, 분류, 지역 태그, 신청·마감 날짜 추출, 주간 키워드
 *
 * 사용:
 *   node scripts/fetch-news.mjs
 *   node scripts/fetch-news.mjs --fixture scripts/fixtures/sample.json   (네트워크 없이 테스트)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'news.json');
const CONFIG = JSON.parse(await readFile(path.join(ROOT, 'scripts', 'config.json'), 'utf8'));
const DAY = 86400000;
const UA = 'Mozilla/5.0 (compatible; kids-news-bot/1.0; +https://github.com)';

// ---------- 텍스트 정리 ----------
const ENTITIES = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ', '&middot;': '·', '&hellip;': '…', '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? ' ');
export function cleanText(s = '') {
  // RSS 설명란은 HTML이 한 번 더 인코딩된 경우가 있어 디코드 → 태그 제거 → 디코드 순서로 처리
  let t = String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = decode(t).replace(/<[^>]+>/g, ' ');
  return decode(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
export function normKey(title) {
  return cleanText(title).replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 24);
}
export function sourceOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^(www|m|news|n)\./, '');
    const hit = Object.keys(CONFIG.sourceNames).find((d) => host === d || host.endsWith('.' + d));
    return hit ? CONFIG.sourceNames[hit] : host;
  } catch { return ''; }
}

// ---------- 분류 ----------
export function isRelevant(text) { return CONFIG.relevance.some((w) => text.includes(w)); }
const BLOCK_RE = (CONFIG.blockPatterns || []).length ? new RegExp(CONFIG.blockPatterns.join('|')) : null;
// 연예·해외·예시 기사 제외
let FIXTURE_MODE = false;
export function isBlocked(it) {
  if (!it) return true;
  if (!FIXTURE_MODE && (it.via === 'fixture' || /example\.com/.test(it.link))) return true;
  if ((CONFIG.blockSources || []).some((s) => (it.source || '').includes(s))) return true;
  return BLOCK_RE ? BLOCK_RE.test(`${it.title} ${it.desc}`) : false;
}
export function classify(text) {
  const cats = CONFIG.categories.filter((c) => c.words.some((w) => text.includes(w))).map((c) => c.id);
  return cats.length ? cats : ['etc'];
}
export function regionsOf(text) {
  return CONFIG.regions.filter((r) => {
    const al = [r, ...(CONFIG.regionAliases[r] || [])];
    // '서울대', '대전환' 같은 오탐을 줄이기 위해 지역명 뒤 글자 일부 제외
    return al.some((a) => new RegExp(`${a}(?![대환])`).test(text));
  });
}

// ---------- 신청·마감 날짜 추출 ----------
const ACTION = [
  { type: '마감', re: /마감|까지|종료/ },
  { type: '신청', re: /신청|접수|모집|예약|등록/ },
  { type: '행사', re: /개최|열린|열려|개막|개장|개관|진행|운영/ }
];
export function extractEvents(text, pubISO) {
  const pub = new Date(pubISO);
  const out = [];
  const re = /(\d{1,2})\s*월\s*(\d{1,2})\s*일|(\d{1,2})\.\s?(\d{1,2})\.?\s*\([월화수목금토일]\)/g;
  let m;
  while ((m = re.exec(text))) {
    const mon = Number(m[1] || m[3]), day = Number(m[2] || m[4]);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) continue;
    let year = pub.getFullYear();
    if (mon < pub.getMonth() + 1 - 6) year += 1;
    const date = new Date(Date.UTC(year, mon - 1, day));
    const diff = (date - pub) / DAY;
    if (diff < -3 || diff > 180) continue;
    const win = text.slice(Math.max(0, m.index - 12), m.index + m[0].length + 18);
    const act = ACTION.find((a) => a.re.test(win));
    if (!act) continue;
    const iso = date.toISOString().slice(0, 10);
    if (!out.some((e) => e.date === iso && e.type === act.type)) {
      out.push({ date: iso, type: act.type, text: cleanText(win) });
    }
  }
  return out.slice(0, 3);
}
export function extractAmounts(text) {
  const out = [];
  const re = /(월\s?)?(\d[\d,]*(?:\.\d+)?)\s?(만|억)\s?원/g;
  let m;
  while ((m = re.exec(text)) && out.length < 2) {
    const s = `${m[1] ? '월 ' : ''}${m[2]}${m[3]} 원`;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

// ---------- 기사 정규화 ----------
export function toItem(raw, via) {
  let title = cleanText(raw.title);
  // 구글 뉴스 제목 끝의 " - 언론사" 제거
  if (raw.source && title.endsWith(` - ${raw.source}`)) title = title.slice(0, -(raw.source.length + 3)).trim();
  let desc = cleanText(raw.description);
  if (desc.startsWith(title) || title.startsWith(desc.slice(0, 20))) desc = ''; // 제목 반복뿐인 요약 제거
  desc = desc.slice(0, 160);
  const link = raw.originallink || raw.link;
  const pub = new Date(raw.pubDate);
  if (!title || !link || Number.isNaN(pub.getTime())) return null;
  const text = `${title} ${desc}`;
  return {
    id: normKey(title),
    title, desc, link,
    source: raw.source || sourceOf(raw.sourceUrl || link),
    pubDate: pub.toISOString(),
    cats: classify(text),
    regions: regionsOf(text),
    events: extractEvents(text, pub.toISOString()),
    amounts: extractAmounts(text),
    via
  };
}

// ---------- 주간 키워드 ----------
// 끝 글자가 조사처럼 보여도 잘리면 안 되는 단어
const KEEP = ['영유아', '어린이', '다자녀', '아이', '유아', '자녀', '늘봄', '부모급여', '아동수당', '육아휴직'];
const JOSA = /(으로|에서|까지|부터|에게|이라|이다|하는|했다|한다|된다|됐다|은|는|이|가|을|를|에|의|도|로|와|과|만|서)$/;
export function weeklyKeywords(items, now = Date.now(), top = 15) {
  const stop = new Set([...CONFIG.stopwords, ...CONFIG.regions]);
  const count = new Map();
  items.filter((it) => now - Date.parse(it.pubDate) < 7 * DAY).forEach((it) => {
    const seen = new Set();
    it.title.split(/[^가-힣A-Za-z0-9+]+/).forEach((tok) => {
      let t = KEEP.find((k) => tok.startsWith(k) && tok.length - k.length <= 2) || tok.replace(JOSA, '');
      if (t.length < 2 || t.length > 8 || /^\d+(월|일|년|명|곳|세|개|만|억|차|호)?$/.test(t) || stop.has(t) || seen.has(t)) return;
      seen.add(t);
      count.set(t, (count.get(t) || 0) + 1);
    });
  });
  return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, top).map(([word, n]) => ({ word, n }));
}

// ---------- 병합 ----------
export function merge(existing, incoming, now = Date.now()) {
  const map = new Map();
  for (const it of existing) if (!isBlocked(it)) map.set(it.id, it);
  for (const it of incoming) {
    if (!it || !it.id || isBlocked(it)) continue;
    if (!isRelevant(`${it.title} ${it.desc}`)) continue;
    if (!map.has(it.id)) map.set(it.id, it);
  }
  return [...map.values()]
    .filter((it) => now - Date.parse(it.pubDate) < CONFIG.keepDays * DAY)
    .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate))
    .slice(0, CONFIG.maxItems);
}

// ---------- RSS 파싱 ----------
export function parseRss(xml, fallbackSource) {
  const pick = (block, tag) => (block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)) || [])[1] || '';
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([b]) => {
    const src = b.match(/<source(?:\s+url="([^"]*)")?[^>]*>([\s\S]*?)<\/source>/);
    return {
      title: pick(b, 'title'),
      link: cleanText(pick(b, 'link')),
      description: pick(b, 'description'),
      pubDate: pick(b, 'pubDate') || pick(b, 'dc:date'),
      source: src ? cleanText(src[2]) : fallbackSource,
      sourceUrl: src ? src[1] : undefined
    };
  });
}

// ---------- 수집 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
async function collect() {
  const raws = [], errors = [];
  const g = CONFIG.googleNews;
  for (const q of g.queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} ${g.window}`)}&${g.params}`;
    try { parseRss(await getText(url)).forEach((r) => raws.push([r, 'google'])); }
    catch (e) { errors.push(`[구글뉴스 ${q}] ${e.message}`); }
    await sleep(g.delayMs);
  }
  for (const f of CONFIG.rssFeeds) {
    try { parseRss(await getText(f.url), f.name).forEach((r) => raws.push([r, 'rss'])); }
    catch (e) { errors.push(`[RSS ${f.url}] ${e.message}`); }
  }
  return { raws, errors };
}

async function main() {
  const fx = process.argv.indexOf('--fixture');
  FIXTURE_MODE = fx > -1;
  let raws, errors = [];
  if (fx > -1) {
    const data = JSON.parse(await readFile(path.resolve(process.argv[fx + 1]), 'utf8'));
    raws = data.items.map((r) => [r, 'fixture']);
  } else ({ raws, errors } = await collect());

  let existing = [];
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8'));
    existing = prev.sample ? [] : (prev.items || []); // 예시 데이터는 이어 붙이지 않음
  } catch { existing = []; }
  if (fx > -1) existing = [];

  const now = fx > -1 && process.env.FIXTURE_NOW ? Date.parse(process.env.FIXTURE_NOW) : Date.now();
  const items = merge(existing, raws.map(([r, via]) => toItem(r, via)), now);
  const out = {
    updatedAt: new Date(now).toISOString(),
    sample: fx > -1,
    categories: CONFIG.categories.map(({ id, name }) => ({ id, name })),
    regions: CONFIG.regions,
    keywords: weeklyKeywords(items, now),
    count: items.length,
    items
  };
  await writeFile(OUT, JSON.stringify(out, null, 1));
  errors.forEach((e) => console.warn('⚠', e));
  console.log(`✅ ${raws.length}건 수집 → 저장 ${items.length}건 (신규 ${items.length - existing.filter((e) => items.some((i) => i.id === e.id)).length}건)`);
  if (!raws.length && !fx) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
