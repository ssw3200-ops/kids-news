(() => {
  const PAGE = 20;
  const SAVE_KEY = 'kidsNews.saved';
  const PREF_KEY = 'kidsNews.pref';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 무시 */ } }
  };
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 1800); };

  let DATA = { items: [], categories: [], keywords: [] };
  const pref = ls.get(PREF_KEY, {});
  const state = { cat: 'all', region: pref.region || '', q: '', shown: PAGE, evShown: 5 };
  let saved = new Set(ls.get(SAVE_KEY, []));

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
      <a href="${esc(it.link)}" target="_blank" rel="noopener"><h3>${esc(it.title)}</h3>
      ${it.desc ? `<p class="desc">${esc(it.desc)}</p>` : ''}</a>
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
    ls.set(PREF_KEY, { region: state.region }); render();
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
})();
