(() => {
  // 비밀번호는 SHA-256 해시로만 저장 (소스에 평문 노출 방지). 바꾸는 법은 README 참고.
  // ⚠ 정적 사이트의 '가벼운 잠금'입니다. data/news.json 자체는 공개 주소로 열립니다.
  const PASSWORD_SHA256 = '797230c2ff79ea02acb5539c2a1759f53170dec0756dd339783c68ad545418b4';
  const AUTH_KEY = 'kidsNews.auth';
  const PAGE = 20;
  const SAVE_KEY = 'kidsNews.saved';
  const PREF_KEY = 'kidsNews.pref';
  const MYKW_KEY = 'kidsNews.myKeywords';
  const MAX_MYKW = 15;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 무시 */ } }
  };
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 1800); };

  let DATA = { items: [], categories: [], keywords: [] };
  const pref = ls.get(PREF_KEY, {});
  const state = { cat: 'all', region: pref.region || '', q: '', shown: PAGE, evShown: 5, onlyMine: !!pref.onlyMine };
  let saved = new Set(ls.get(SAVE_KEY, []));
  let myKws = ls.get(MYKW_KEY, []);

  // ---------- 내 키워드 ----------
  const hayOf = (it) => `${it.title} ${it.desc}`.toLowerCase();
  const kwHit = (it, kw) => { const h = hayOf(it); return kw.toLowerCase().split(/\s+/).every((w) => h.includes(w)); };
  const matchesMine = (it) => myKws.some((kw) => kwHit(it, kw));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function highlight(text) {
    let html = esc(text);
    const words = [...new Set(myKws.flatMap((k) => k.split(/\s+/)))].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!words.length) return html;
    return html.replace(new RegExp(`(${words.map((w) => reEsc(esc(w))).join('|')})`, 'gi'), '<mark>$1</mark>');
  }
  function savePref() { ls.set(PREF_KEY, { region: state.region, onlyMine: state.onlyMine }); }
  function renderMyKws() {
    $('#myKws').innerHTML = myKws.length
      ? myKws.map((k, i) => `<span class="mykw">${esc(k)} <small>${DATA.items.filter((it) => kwHit(it, k)).length}</small><button data-del="${i}" aria-label="${esc(k)} 삭제">×</button></span>`).join('')
      : '<span class="text-sm text-slate-400">아직 등록한 키워드가 없어요</span>';
    $('#onlyMine').checked = state.onlyMine;
    $('#onlyMine').disabled = !myKws.length;
  }

  // ---------- 날짜 표시 ----------
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function dayLabel(iso) {
    const d = new Date(iso), today = new Date();
    const diff = Math.round((new Date(ymd(today)) - new Date(ymd(d))) / 86400000);
    if (diff === 0) return '오늘';
    if (diff === 1) return '어제';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
  }
  function ago(iso) {
    const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return `${Math.max(1, m)}분 전`;
    if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
    const d = new Date(iso); return `${d.getMonth() + 1}.${d.getDate()}`;
  }

  // ---------- 필터 ----------
  const catName = (id) => (DATA.categories.find((c) => c.id === id) || {}).name || '기타';
  function matches(it, { ignoreCat = false } = {}) {
    if (!ignoreCat) {
      if (state.cat === 'saved' && !saved.has(it.id)) return false;
      if (state.cat !== 'all' && state.cat !== 'saved' && !it.cats.includes(state.cat)) return false;
    }
    if (state.onlyMine && myKws.length && !matchesMine(it)) return false;
    if (state.region && !it.regions.includes(state.region)) return false;
    if (state.q) {
      const hay = `${it.title} ${it.desc} ${it.source}`.toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  // ---------- 렌더 ----------
  function renderCats() {
    const base = DATA.items.filter((it) => matches(it, { ignoreCat: true }));
    const cnt = (id) => base.filter((it) => it.cats.includes(id)).length;
    const chips = [['all', '전체', base.length], ...DATA.categories.map((c) => [c.id, c.name, cnt(c.id)]), ['saved', '⭐ 저장', base.filter((it) => saved.has(it.id)).length]];
    $('#cats').innerHTML = chips.map(([id, name, n]) => `<button class="chip ${state.cat === id ? 'on' : ''}" data-cat="${id}">${esc(name)}<small>${n}</small></button>`).join('');
  }

  function renderEvents(list) {
    const today = ymd(new Date());
    const evs = [];
    list.forEach((it) => it.events.forEach((e) => { if (e.date >= today) evs.push({ ...e, it }); }));
    evs.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
    $('#eventsSec').classList.toggle('hidden', !evs.length);
    $('#events').innerHTML = evs.slice(0, state.evShown).map((e) => {
      const d = new Date(e.date + 'T00:00:00');
      const dday = Math.round((d - new Date(today + 'T00:00:00')) / 86400000);
      return `<li class="ev">
        <div class="d"><b>${d.getMonth() + 1}.${d.getDate()}</b><span class="ev-${e.type}">${e.type}</span></div>
        <div class="text-sm min-w-0"><a href="${esc(e.it.link)}" target="_blank" rel="noopener" class="font-semibold">${esc(e.it.title)}</a>
          <div class="text-xs text-slate-500 mt-0.5">${dday === 0 ? '오늘' : `D-${dday}`} · ${esc(e.it.source)}</div></div></li>`;
    }).join('');
    $('#eventsMore').classList.toggle('hidden', evs.length <= state.evShown);
  }

  function renderKeywords() {
    $('#kwSec').classList.toggle('hidden', !DATA.keywords.length);
    $('#keywords').innerHTML = DATA.keywords.map((k) => `<button class="kw" data-kw="${esc(k.word)}">#${esc(k.word)} <small>${k.n}</small></button>`).join('');
  }

  function card(it) {
    const tags = [
      ...it.events.map((e) => `<span class="tag t-event">${e.date.slice(5).replace('-', '.')} ${esc(e.type)}</span>`),
      ...it.amounts.map((a) => `<span class="tag t-amount">${esc(a)}</span>`),
      ...it.regions.map((r) => `<span class="tag t-region">${esc(r)}</span>`),
      ...it.cats.filter((c) => c !== 'etc').map((c) => `<span class="tag t-cat">${esc(catName(c))}</span>`)
    ].join('');
    return `<article class="news">
      <a href="${esc(it.link)}" target="_blank" rel="noopener"><h3>${highlight(it.title)}</h3>
      ${it.desc ? `<p class="desc">${highlight(it.desc)}</p>` : ''}</a>
      <div>${tags}</div>
      <div class="flex items-center justify-between mt-1">
        <span class="meta">${esc(it.source)} · ${ago(it.pubDate)}</span>
        <span class="acts">
          <button data-share="${esc(it.id)}" aria-label="공유">공유</button>
          <button data-save="${esc(it.id)}" class="${saved.has(it.id) ? 'on' : ''}" aria-label="저장">${saved.has(it.id) ? '★ 저장됨' : '☆ 저장'}</button>
        </span>
      </div></article>`;
  }

  function render() {
    const list = DATA.items.filter((it) => matches(it));
    renderCats();
    renderMyKws();
    renderEvents(list);
    $('#count').textContent = `${list.length}건`;
    let html = '', lastDay = '';
    list.slice(0, state.shown).forEach((it) => {
      const dl = dayLabel(it.pubDate);
      if (dl !== lastDay) { html += `<div class="day">${dl}</div>`; lastDay = dl; }
      html += card(it);
    });
    $('#list').innerHTML = html;
    $('#more').classList.toggle('hidden', list.length <= state.shown);
    $('#empty').classList.toggle('hidden', list.length > 0);
  }

  function fillRegions() {
    const cnt = {};
    DATA.items.forEach((it) => it.regions.forEach((r) => { cnt[r] = (cnt[r] || 0) + 1; }));
    const order = ['세종', '대전', ...DATA.regions.filter((r) => r !== '세종' && r !== '대전')];
    $('#region').innerHTML = `<option value="">전국</option>` +
      order.filter((r) => cnt[r] || r === '세종' || r === '대전').map((r) => `<option value="${r}">${r} (${cnt[r] || 0})</option>`).join('');
    $('#region').value = state.region;
  }

  // ---------- 이벤트 ----------
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    state.cat = b.dataset.cat; state.shown = PAGE; render();
  });
  $('#region').addEventListener('change', (e) => {
    state.region = e.target.value; state.shown = PAGE; state.evShown = 5;
    savePref(); render();
  });
  $('#kwForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#kwInput').value.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (myKws.includes(v)) return toast('이미 등록된 키워드예요');
    if (myKws.length >= MAX_MYKW) return toast(`키워드는 ${MAX_MYKW}개까지 등록할 수 있어요`);
    myKws.push(v); ls.set(MYKW_KEY, myKws);
    $('#kwInput').value = '';
    const n = DATA.items.filter((it) => kwHit(it, v)).length;
    toast(n ? `'${v}' 소식 ${n}건을 찾았어요` : `'${v}' 등록 완료 — 새 소식이 들어오면 표시돼요`);
    state.shown = PAGE; render();
  });
  $('#myKws').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    myKws.splice(Number(b.dataset.del), 1); ls.set(MYKW_KEY, myKws);
    if (!myKws.length) state.onlyMine = false;
    savePref(); render();
  });
  $('#onlyMine').addEventListener('change', (e) => {
    state.onlyMine = e.target.checked; state.shown = PAGE; state.evShown = 5;
    savePref(); render();
  });
  let qt;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qt);
    qt = setTimeout(() => { state.q = e.target.value.trim(); state.shown = PAGE; $('#qClear').classList.toggle('hidden', !state.q); render(); }, 200);
  });
  $('#qClear').addEventListener('click', () => { $('#q').value = ''; state.q = ''; $('#qClear').classList.add('hidden'); render(); });
  $('#keywords').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kw]'); if (!b) return;
    $('#q').value = b.dataset.kw; state.q = b.dataset.kw; state.cat = 'all'; state.shown = PAGE;
    $('#qClear').classList.remove('hidden'); render();
    $('#list').scrollIntoView({ behavior: 'smooth' });
  });
  $('#more').addEventListener('click', () => { state.shown += PAGE; render(); });
  $('#eventsMore').addEventListener('click', () => { state.evShown += 10; render(); });
  $('#list').addEventListener('click', async (e) => {
    const sv = e.target.closest('[data-save]');
    if (sv) {
      const id = sv.dataset.save;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      ls.set(SAVE_KEY, [...saved]); render();
      return;
    }
    const sh = e.target.closest('[data-share]');
    if (sh) {
      const it = DATA.items.find((x) => x.id === sh.dataset.share);
      if (!it) return;
      try {
        if (navigator.share) { await navigator.share({ title: it.title, url: it.link }); return; }
      } catch (err) { if (err && err.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(`${it.title}\n${it.link}`); toast('링크를 복사했어요'); }
      catch { toast('공유를 지원하지 않는 환경이에요'); }
    }
  });

  // ---------- 시작 ----------
  function start() {
    fetch('data/news.json', { cache: 'no-cache' })
      .then((r) => r.json())
      .then((d) => {
        DATA = d;
        const u = new Date(d.updatedAt);
        $('#updated').textContent = `마지막 업데이트 ${u.getMonth() + 1}.${u.getDate()} ${String(u.getHours()).padStart(2, '0')}:${String(u.getMinutes()).padStart(2, '0')}`;
        $('#sampleBanner').classList.toggle('hidden', !d.sample);
        fillRegions(); renderKeywords(); render();
      })
      .catch(() => { $('#updated').textContent = '소식을 불러오지 못했어요'; $('#empty').classList.remove('hidden'); });
  }

  // ---------- 비밀번호 잠금 ----------
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function unlock() { $('#lock').remove(); $('#app').classList.remove('hidden'); start(); }
  let authed = false;
  try { authed = sessionStorage.getItem(AUTH_KEY) === PASSWORD_SHA256; } catch { authed = false; }
  if (authed) unlock();
  else {
    $('#lockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!window.crypto?.subtle) { $('#pwErr').textContent = 'https 주소로 접속해 주세요'; $('#pwErr').classList.remove('hidden'); return; }
      const h = await sha256($('#pw').value.trim());
      if (h === PASSWORD_SHA256) {
        try { sessionStorage.setItem(AUTH_KEY, h); } catch { /* 저장 불가 환경 */ }
        unlock();
      } else { $('#pwErr').classList.remove('hidden'); $('#pw').value = ''; }
    });
  }
})();
