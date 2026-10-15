'use strict';
// 수영 코치 — 모든 데이터는 data/ 아래 .md 파일. 이 파일은 그걸 읽어서 화면을 그린다.

const $app = document.getElementById('app');
const DIFFS = ['물 마심', '숨 참기', '몸이 가라앉음', '다리가 안 뜸', '기타'];
const WEEK = '일월화수목금토';
const S = { files: {}, online: true, fb: null, calMonth: null };

// ───────────── 저장소: 서버의 md 파일 + 오프라인 사본 ─────────────

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 동작 */ } }

async function loadFiles() {
  try {
    const r = await fetch('/api/files', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    S.files = (await r.json()).files;
    S.online = true;
  } catch {
    S.files = lsGet('files', {});
    S.online = false;
  }
  const pending = lsGet('pending', {});
  Object.assign(S.files, pending);
  lsSet('files', S.files);
  if (S.online && Object.keys(pending).length) await flush();
}

async function put(path, text) {
  const r = await fetch('/api/file?path=' + encodeURIComponent(path), {
    method: 'PUT', body: text, headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
  if (!r.ok) throw new Error(r.status);
}

async function flush() {
  const pending = lsGet('pending', {});
  for (const [p, t] of Object.entries(pending)) {
    try { await put(p, t); delete pending[p]; lsSet('pending', pending); S.online = true; }
    catch { S.online = false; return; }
  }
}

async function saveFile(path, text) {
  S.files[path] = text;
  lsSet('files', S.files);
  try { await put(path, text); S.online = true; }
  catch {
    const pending = lsGet('pending', {});
    pending[path] = text;
    lsSet('pending', pending);
    S.online = false;
  }
}

// ───────────── md 읽기 ─────────────

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const q = s => JSON.stringify(String(s ?? ''));

function parseVal(v) {
  if (v.startsWith('[')) {
    try { return JSON.parse(v); }
    catch { return v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); }
  }
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { /* 그대로 */ } }
  return v.replace(/^'(.*)'$/, '$1');
}

function parseFM(text) {
  const m = (text || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text || '' };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = parseVal(line.slice(i + 1).trim());
  }
  return { meta, body: text.slice(m[0].length) };
}

function parseLesson(path, text) {
  const { meta, body } = parseFM(text);
  const L = {
    path, id: String(meta.id ?? path), stage: String(meta['단계'] ?? ''), order: +meta['순서'] || 0,
    title: meta['제목'] || path, supp: meta['보충'] || '', safety: '', sec: {}, menu: [],
  };
  let cur = null, item = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) { cur = line.slice(3).trim(); L.sec[cur] = []; item = null; continue; }
    if (line.startsWith('# ')) continue;
    if (!cur) { if (line.startsWith('>')) L.safety += line.replace(/^>\s?/, '') + ' '; continue; }
    if (cur.includes('연습 메뉴')) {
      if (line.startsWith('### ')) { item = { name: line.slice(4).replace(/^\d+\.\s*/, '').trim(), fields: [] }; L.menu.push(item); continue; }
      if (!item || !line.trim()) continue;
      const f = line.match(/^\s*-\s*([^:]{1,10}):\s*(.*)$/);
      if (f) item.fields.push([f[1].trim(), f[2]]);
      else if (item.fields.length) item.fields[item.fields.length - 1][1] += ' ' + line.trim();
      continue;
    }
    if (line.trim()) L.sec[cur].push(line.replace(/^\s*[-*]\s+/, ''));
  }
  return L;
}
const sec = (L, key) => { const k = Object.keys(L.sec).find(k => k.includes(key)); return k ? L.sec[k] : []; };

function curriculum() {
  const all = Object.entries(S.files).filter(([p]) => p.startsWith('curriculum/')).map(([p, t]) => parseLesson(p, t));
  const main = all.filter(l => !l.supp).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const supp = all.filter(l => l.supp);
  return { all, main, supp };
}

function logs() {
  return Object.entries(S.files)
    .filter(([p]) => /^log\/.+\.md$/.test(p))
    .map(([p, t]) => {
      const { meta } = parseFM(t);
      return {
        path: p, date: String(meta['날짜'] || p.slice(4, 14)), lessonId: String(meta['수업'] ?? ''),
        title: meta['제목'] || '', round: +meta['회차'] || 1, pool: meta['수영장'] || '',
        done: arr(meta['된 것']), notDone: arr(meta['안 된 것']), diffs: arr(meta['힘들었던 점']),
        next: meta['다음'] || '', memo: meta['메모'] || '',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path));
}

function profile() {
  const { meta } = parseFM(S.files['profile.md'] || '');
  return { area: meta['동네'] || '', myPool: meta['다니는 수영장'] || '', pick: String(meta['수업 지정'] || '') };
}

async function saveProfile(p) {
  const text = `---
동네: ${q(p.area)}
다니는 수영장: ${q(p.myPool)}
수업 지정: ${q(p.pick)}
---
# 내 정보

- 사는 동네: ${p.area}
- 다니는 수영장: ${p.myPool || '(없음)'}

> 앱이 쓰는 파일이에요. 직접 고쳐도 됩니다.
> '수업 지정'에 수업 번호(예: "05")를 넣으면 다음 수업이 그걸로 바뀌고, 기록을 남기면 다시 비워집니다.
`;
  await saveFile('profile.md', text);
}

// ───────────── 선생님: 다음 수업 정하기 ─────────────

function trailing(list, id) { let n = 0; for (let i = list.length - 1; i >= 0 && list[i].lessonId === id; i--) n++; return n; }

function mainNext(C, Ls) {
  const isSupp = id => C.supp.some(s => s.id === id);
  const mainLogs = Ls.filter(l => !isSupp(l.lessonId));
  const lm = mainLogs[mainLogs.length - 1];
  const idx = lm ? C.main.findIndex(l => l.id === lm.lessonId) : -1;
  if (idx < 0) return { lesson: C.main[0], idx: 0, round: 1, prev: null };
  if (lm.next === '넘어가기') {
    if (idx + 1 >= C.main.length) return { finished: true, idx: C.main.length };
    return { lesson: C.main[idx + 1], idx: idx + 1, round: 1, prev: null };
  }
  return { lesson: C.main[idx], idx, round: trailing(mainLogs, lm.lessonId) + 1, prev: lm };
}

function plan() {
  const C = curriculum(), Ls = logs(), prof = profile();
  const isSupp = id => C.supp.some(s => s.id === id);
  const M = mainNext(C, Ls);
  const last = Ls[Ls.length - 1];

  if (prof.pick) {
    const l = C.all.find(x => x.id === prof.pick);
    if (l) { const prev = [...Ls].reverse().find(x => x.lessonId === l.id) || null; return { ...M, lesson: l, finished: false, round: prev ? trailing(Ls, l.id) + 1 : 1, prev, why: '직접 고른 수업' }; }
  }
  if (last && isSupp(last.lessonId) && last.next === '반복') {
    const l = C.supp.find(s => s.id === last.lessonId);
    return { ...M, lesson: l, finished: false, round: trailing(Ls, l.id) + 1, prev: last, why: `보충 수업 (${l.supp})` };
  }
  // 힘들었던 점이 두 번 연속 같으면 보충 수업을 끼워 넣는다.
  if (Ls.length >= 2) {
    const a = Ls[Ls.length - 1], b = Ls[Ls.length - 2];
    if (!isSupp(a.lessonId) && !isSupp(b.lessonId)) {
      for (const d of a.diffs.filter(d => d !== '기타' && b.diffs.includes(d))) {
        const s = C.supp.find(x => x.supp === d);
        if (s) return { ...M, lesson: s, finished: false, round: 1, prev: null, why: `'${d}'이(가) 두 번 연속이라 보충 수업을 먼저 해요` };
      }
    }
  }
  return M;
}

// 같은 수업을 다시 할 때: 지난번에 안 된 것부터, 횟수를 조금 늘린다. 다 됐는데 반복이면 순서만 바꾼다.
function bump(s) {
  return s.replace(/(\d+)(\s*)(번|회)(?!.*\d+\s*(?:번|회))/, (m, n, sp, u) => `${+n + (+n >= 5 ? 2 : 1)}${sp}${u}`);
}
function variantMenu(L, prev, round) {
  let items = L.menu.map(m => ({ name: m.name, fields: m.fields.map(f => [...f]), note: '' }));
  if (round <= 1 || !prev || !items.length) return { items, note: '' };
  const failed = new Set(prev.notDone);
  if (failed.size) {
    const f = items.filter(m => failed.has(m.name)), ok = items.filter(m => !failed.has(m.name));
    if (f.length) {
      f.forEach(m => { m.note = '지난번에 안 된 것 · 횟수 늘림'; m.fields.forEach(fl => { if (fl[0].includes('몇')) fl[1] = bump(fl[1]); }); });
      return { items: [...f, ...ok], note: `${round}번째. 지난번에 안 된 것부터, 횟수를 조금 늘렸어요.` };
    }
  }
  const k = (round - 1) % items.length;
  return { items: [...items.slice(k), ...items.slice(0, k)], note: `${round}번째. 순서를 바꿔 봤어요.` };
}

// ───────────── 수영장 ─────────────

const POOL_COLS = [
  ['name', '이름'], ['dist', '거리'], ['hours', '자유수영 시간'], ['fee1', '1회 요금'], ['feeM', '월 자유수영 요금'],
  ['lanes', '레인·수심'], ['phone', '전화'], ['reserve', '예약 방법'], ['memo', '메모'], ['map', '지도'],
];
function colKey(h) {
  h = h.replace(/\s/g, '');
  if (h.includes('이름')) return 'name';
  if (h.includes('거리')) return 'dist';
  if (h.includes('자유수영시간') || h === '시간') return 'hours';
  if (h.includes('1회')) return 'fee1';
  if (h.includes('월')) return 'feeM';
  if (h.includes('레인') || h.includes('수심')) return 'lanes';
  if (h.includes('전화')) return 'phone';
  if (h.includes('예약')) return 'reserve';
  if (h.includes('메모')) return 'memo';
  if (h.includes('지도')) return 'map';
  return null;
}
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());

function parsePools() {
  const text = S.files['pools.md'] || '# 수영장 목록\n';
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex(l => l.trim().startsWith('|') && l.includes('이름'));
  if (h < 0) return { pools: [], pre: text.trimEnd(), post: '' };
  const keys = cells(lines[h]).map(colKey);
  let end = h + 2;
  const pools = [];
  for (; end < lines.length && lines[end].trim().startsWith('|'); end++) {
    const c = cells(lines[end]), p = {};
    keys.forEach((k, i) => { if (k) p[k] = c[i] || ''; });
    if (p.name) pools.push(p);
  }
  return { pools, pre: lines.slice(0, h).join('\n').trimEnd(), post: lines.slice(end).join('\n').trim() };
}

function mapUrl(name) {
  const city = (profile().area.split(/\s+/)[0] || '').replace(/(특별|광역)?시$|도$/, '');
  const qs = city && !name.includes(city) ? `${city} ${name}` : name;
  return 'https://map.naver.com/p/search/' + encodeURIComponent(qs);
}

async function savePools(pools) {
  const { pre, post } = parsePools();
  const clean = s => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();
  const head = '| ' + POOL_COLS.map(c => c[1]).join(' | ') + ' |';
  const sep = '|' + POOL_COLS.map(() => '---').join('|') + '|';
  const rows = pools.map(p => '| ' + POOL_COLS.map(([k]) => k === 'map' ? `[네이버 지도](${mapUrl(p.name)})` : clean(p[k])).join(' | ') + ' |');
  const text = [pre, '', head, sep, ...rows, '', post].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  await saveFile('pools.md', text);
}

function parseDays(t) {
  const d = new Set();
  const all = n => n.forEach(x => d.add(x));
  if (/매일|모든\s*요일/.test(t)) all([0, 1, 2, 3, 4, 5, 6]);
  if (/평일/.test(t)) all([1, 2, 3, 4, 5]);
  if (/주말/.test(t)) all([0, 6]);
  const ORDER = '월화수목금토일', js = c => (ORDER.indexOf(c) + 1) % 7;
  t.replace(/매일|평일|주말|공휴일|휴일|요일|모든/g, ' ')
    .replace(/([월화수목금토일])\s*[-~]\s*([월화수목금토일])/g, (m, a, b) => {
      for (let k = ORDER.indexOf(a); ; k = (k + 1) % 7) { d.add(js(ORDER[k])); if (ORDER[k] === b) break; }
      return ' ';
    })
    .replace(/[월화수목금토일]/g, c => { d.add(js(c)); return ' '; });
  return d;
}

function parseHours(s) {
  if (!s) return null;
  const out = [];
  for (const seg of s.split('/')) {
    const cut = seg.search(/\d/);
    const days = parseDays(cut < 0 ? seg : seg.slice(0, cut));
    if (!days.size) continue;
    const ranges = [...seg.matchAll(/(\d{1,2}):(\d{2})\s*[-~–]\s*(\d{1,2}):(\d{2})/g)].map(m => [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
    out.push({ days, ranges });
  }
  return out.length ? out : null;
}

const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function todayInfo(p, now = new Date()) {
  const unsure = /확인\s*필요/.test(p.hours || '');
  const P = parseHours(p.hours);
  if (!P) return { status: 'unknown', rank: 2, text: '시간 확인 필요', unsure: true };
  const segs = P.filter(x => x.days.has(now.getDay()));
  const ranges = segs.flatMap(x => x.ranges).sort((a, b) => a[0] - b[0]);
  const list = ranges.map(r => `${hm(r[0])}-${hm(r[1])}`).join(', ');
  const m = now.getHours() * 60 + now.getMinutes();
  if (!segs.length) return { status: 'unknown', rank: 2, text: '오늘 시간 정보 없음', unsure };
  if (!ranges.length) return { status: 'closed', rank: 4, text: '오늘 자유수영 없음', unsure };
  const open = ranges.find(r => m >= r[0] && m < r[1]);
  if (open) return { status: 'open', rank: 0, text: `지금 열림 · ${hm(open[1])}까지`, list, unsure };
  const next = ranges.find(r => r[0] > m);
  if (next) return { status: 'later', rank: 1, text: `오늘 ${hm(next[0])}부터`, list, unsure };
  return { status: 'done', rank: 3, text: '오늘은 끝남', list, unsure };
}
const distNum = s => { const m = String(s || '').match(/\d+/); return m ? +m[0] : 9999; };

// ───────────── 화면 공통 ─────────────

function render(html, nav = '') {
  $app.innerHTML = html;
  document.querySelector('.navbar')?.remove();
  if (nav) document.body.insertAdjacentHTML('beforeend', `<nav class="navbar"><div class="inner">${nav}</div></nav>`);
  window.scrollTo(0, 0);
}
const topBar = (title = '') => `<div class="topbar"><button class="linkbtn" data-go="">← 홈</button><span class="muted small">${esc(title)}</span></div>`;
const go = hash => { location.hash = hash ? '#/' + hash : '#/'; };
function statusLine() {
  const n = Object.keys(lsGet('pending', {})).length;
  if (n) return `<p class="status">오프라인 · 기록 ${n}개 저장 대기 (집 와이파이에서 열면 자동 저장)</p>`;
  return S.online ? '' : '<p class="status">오프라인 · 마지막으로 받은 내용을 보여 주는 중</p>';
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* 지원 안 하면 무시 */ }
}

// ───────────── 홈 / 처음 설정 ─────────────

function viewOnboard() {
  render(`
    <div class="home-title"><h1>수영 코치</h1></div>
    <div class="card stack" style="margin-top:4vh">
      <h2 style="margin-top:0">사는 동네를 알려 주세요</h2>
      <p class="muted small">구·동까지만. 한 번만 물어봐요.</p>
      <input id="area" type="text" placeholder="예: 청주시 흥덕구 복대동" autocomplete="off">
      <button class="primary" id="save">시작하기</button>
    </div>`);
  document.getElementById('save').onclick = async () => {
    const area = document.getElementById('area').value.trim();
    if (!area) return;
    await saveProfile({ ...profile(), area });
    route();
  };
}

function viewHome() {
  if (!profile().area) return viewOnboard();
  const P = plan();
  const sub = P.finished ? '모든 수업 완료' : `다음: ${P.lesson.id.startsWith('보충') ? '' : P.lesson.id + '. '}${P.lesson.title}`;
  render(`
    <div class="home-title"><h1>수영 코치</h1></div>
    <div class="home-buttons">
      <button class="bigbtn" data-go="pools"><span class="emoji">📍</span>수영장 찾기<span class="sub">어디로 갈까</span></button>
      <button class="bigbtn primary" data-go="lesson"><span class="emoji">🏊</span>오늘의 수업<span class="sub">${esc(sub)}</span></button>
    </div>
    <div class="home-foot">
      <button class="linkbtn" data-go="log">기록</button>
      <button class="linkbtn" data-go="settings">설정</button>
    </div>
    ${statusLine()}`);
}

// ───────────── 오늘의 수업 (카드) ─────────────

function myPoolStrip() {
  const name = profile().myPool;
  if (!name) return '';
  const p = parsePools().pools.find(x => x.name === name);
  if (!p) return '';
  const t = todayInfo(p);
  const days = `${WEEK[new Date().getDay()]}요일`;
  return `<div class="poolstrip">📍 <b>${esc(p.name)}</b> · ${days} ${esc(t.list || t.text)}${t.list ? ` <span class="muted">(${esc(t.text)})</span>` : ''}${t.unsure ? ' · 시간 확인 필요' : ''}</div>`;
}

function buildCards(L, V, P) {
  const cards = [];
  const stageTag = L.supp ? '<span class="tag warn">보충 수업</span>' : `<span class="tag">${L.stage === '2' ? '2단계' : '1단계'} · ${esc(L.id)}</span>`;
  const never = sec(L, '절대');
  cards.push(`
    ${myPoolStrip()}
    <div class="safety">${inline(L.safety.replace(/^⚠️\s*/, '⚠️ ').trim() || '⚠️ 얕은 쪽에서만 · 안전요원 있는 시간에만 · 몸이 이상하면 바로 나오기')}</div>
    <div>${stageTag} ${P.round > 1 ? `<span class="tag warn">${P.round}번째</span>` : ''}</div>
    <h1>${esc(L.title)}</h1>
    ${P.why ? `<p class="note">${esc(P.why)}</p>` : ''}
    <div class="field-label">오늘의 목표</div>
    <p class="goal">${inline(sec(L, '목표').join(' '))}</p>
    ${V.note ? `<p class="note">${esc(V.note)}</p>` : ''}
    ${never.length ? `<div class="never"><h2>절대 하지 말 것</h2><ul>${never.map(x => `<li>${inline(x)}</li>`).join('')}</ul></div>` : ''}
    <p style="margin-top:16px"><button class="linkbtn" data-go="pick">다른 수업 고르기</button></p>`);
  const prep = sec(L, '준비');
  if (prep.length) cards.push(`<div class="step-count">준비</div><div class="item-name">몸풀기</div><ul class="how">${prep.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`);
  V.items.forEach((m, i) => {
    const reps = m.fields.find(f => f[0].includes('몇'));
    const rest = m.fields.filter(f => f !== reps);
    cards.push(`
      <div class="step-count">연습 ${i + 1} / ${V.items.length}</div>
      ${m.note ? `<span class="tag warn">${esc(m.note)}</span>` : ''}
      <div class="item-name">${esc(m.name)}</div>
      ${reps ? `<div class="reps">${inline(reps[1])}</div>` : ''}
      ${rest.map(([k, v]) => `<div class="field-label">${esc(k)}</div><p class="how">${inline(v)}</p>`).join('')}`);
  });
  const ok = sec(L, '잘 되고'), ng = sec(L, '잘못되고');
  if (ok.length || ng.length) cards.push(`
    <div class="step-count">혼자 체크하기</div>
    <h2>잘 되고 있다는 신호</h2><ul class="checklist ok">${ok.map(x => `<li>${inline(x)}</li>`).join('')}</ul>
    <h2>잘못되고 있다는 신호</h2><ul class="checklist ng">${ng.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`);
  const mis = sec(L, '흔한 실수');
  if (mis.length) cards.push(`<div class="step-count">흔한 실수와 고치는 법</div><ul class="how">${mis.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`);
  const yt = sec(L, '영상').map(x => x.replace(/`/g, '').trim());
  cards.push(`
    <div class="step-count">마무리</div>
    <h2>다음 수업으로 넘어가는 조건</h2>
    <ul class="how">${sec(L, '넘어가는 조건').map(x => `<li>${inline(x)}</li>`).join('')}</ul>
    ${yt.length ? `<h2>참고 영상 (유튜브 검색)</h2><ul>${yt.map(x => `<li><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(x)}" target="_blank" rel="noopener">${esc(x)}</a></li>`).join('')}</ul>` : ''}
    <div style="margin-top:20px"><button class="primary" data-go="done" style="min-height:80px;font-size:1.2em">다녀왔어요</button></div>`);
  return cards;
}

function viewLesson() {
  const P = plan();
  if (P.finished) {
    return render(`${topBar()}<div class="card"><h1>모든 수업을 마쳤어요</h1><p>자유형·배영·평영 25m까지 왔습니다. 이제는 거리를 조금씩 늘려 보세요.</p><button data-go="pick">수업 다시 고르기</button></div>`);
  }
  const L = P.lesson, V = variantMenu(L, P.prev, P.round);
  const cards = buildCards(L, V, P);
  const key = `card:${L.id}:${P.round}`;
  let i = Math.min(lsGet(key, 0), cards.length - 1);
  const show = () => {
    lsSet(key, i);
    render(`${topBar(L.id.startsWith('보충') ? '보충' : '수업 ' + L.id)}<section class="card lesson-card">${cards[i]}</section>`,
      `<button id="prev" ${i === 0 ? 'disabled style="opacity:.35"' : ''}>◀ 이전</button>
       <span class="count">${i + 1}/${cards.length}</span>
       <button id="next" class="primary" ${i === cards.length - 1 ? 'disabled style="opacity:.35"' : ''}>다음 ▶</button>`);
    document.getElementById('prev').onclick = () => { if (i > 0) { i--; show(); } };
    document.getElementById('next').onclick = () => { if (i < cards.length - 1) { i++; show(); } };
  };
  let x0 = null;
  $app.ontouchstart = e => { x0 = e.touches[0].clientX; };
  $app.ontouchend = e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (dx < -60 && i < cards.length - 1) { i++; show(); }
    if (dx > 60 && i > 0) { i--; show(); }
  };
  keepAwake(true);
  show();
}

function viewPick() {
  const C = curriculum();
  const btn = l => `<button class="choice" data-pick="${esc(l.id)}">${esc(l.supp ? '보충' : l.id)} · ${esc(l.title.replace(/^보충 — /, ''))}</button>`;
  render(`${topBar('수업 고르기')}
    <h1>수업 고르기</h1>
    <p class="muted small">고른 수업은 다음 기록을 남길 때까지 '오늘의 수업'이 됩니다.</p>
    <h2>1단계 — 자유형 25m까지</h2><div class="stack">${C.main.filter(l => l.stage !== '2').map(btn).join('')}</div>
    <h2>2단계 — 배영·평영</h2><div class="stack">${C.main.filter(l => l.stage === '2').map(btn).join('')}</div>
    <h2>보충 수업</h2><div class="stack">${C.supp.map(btn).join('')}</div>
    ${profile().pick ? '<p style="margin-top:16px"><button data-pick="">직접 고른 것 취소 (앱이 정하게)</button></p>' : ''}`);
  $app.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => {
    await saveProfile({ ...profile(), pick: b.dataset.pick });
    go('lesson');
  });
}

// ───────────── 다녀왔어요 ─────────────

const CHEER = {
  '넘어가기': ['다음 수업으로 갑니다.', '조건 통과. 다음 걸로 넘어가요.', '한 칸 앞으로.'],
  '반복': ['같은 걸 한 번 더 하면 됩니다.', '반복이 실력이 됩니다.', '오늘 물에 들어간 것도 연습입니다.'],
};
const pickOne = a => a[Math.floor(Math.random() * a.length)];

function viewDone() {
  const P = plan();
  if (P.finished) return go('lesson');
  const L = P.lesson;
  if (!S.fb || S.fb.lessonId !== L.id) S.fb = { lessonId: L.id, step: 1, done: new Set(), diffs: new Set(), etc: '', choice: '', memo: '' };
  const F = S.fb;
  const names = L.menu.map(m => m.name);
  const nav = (back, next, nextLabel = '다음 ▶') => `<button id="back">◀ 이전</button><button id="fwd" class="primary">${nextLabel}</button>`;
  const bindNav = (onNext) => {
    document.getElementById('back').onclick = () => { if (F.step > 1) { F.step--; viewDone(); } else go('lesson'); };
    document.getElementById('fwd').onclick = onNext;
  };

  if (F.step === 1) {
    render(`${topBar('다녀왔어요 1/4')}<h1>오늘 된 것을 눌러 주세요</h1><p class="muted small">안 된 건 그냥 두면 돼요.</p>
      <div class="stack">${names.map((n, i) => `<button class="choice ${F.done.has(n) ? 'on' : ''}" data-i="${i}"><span class="box">${F.done.has(n) ? '✓' : ''}</span>${esc(n)}</button>`).join('')}</div>`, nav());
    $app.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const n = names[b.dataset.i]; F.done.has(n) ? F.done.delete(n) : F.done.add(n); viewDone(); });
    return bindNav(() => { F.step = 2; viewDone(); });
  }
  if (F.step === 2) {
    render(`${topBar('다녀왔어요 2/4')}<h1>힘들었던 점은?</h1><p class="muted small">여러 개 골라도 돼요. 없으면 그냥 다음.</p>
      <div class="stack">${DIFFS.map(d => `<button class="choice ${F.diffs.has(d) ? 'on' : ''}" data-d="${d}"><span class="box">${F.diffs.has(d) ? '✓' : ''}</span>${d}</button>`).join('')}
      ${F.diffs.has('기타') ? `<input id="etc" type="text" placeholder="어떤 점이 힘들었나요?" value="${esc(F.etc)}">` : ''}</div>`, nav());
    $app.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const d = b.dataset.d; F.etc = document.getElementById('etc')?.value ?? F.etc; F.diffs.has(d) ? F.diffs.delete(d) : F.diffs.add(d); viewDone(); });
    return bindNav(() => { F.etc = document.getElementById('etc')?.value ?? F.etc; F.step = 3; viewDone(); });
  }
  if (F.step === 3) {
    const allDone = names.length > 0 && names.every(n => F.done.has(n));
    const rec = allDone ? '넘어가기' : '반복';
    const opt = (v, title, sub) => `<button class="choice ${v === rec ? 'rec' : ''} ${F.choice === v ? 'on' : ''}" data-c="${v}" style="flex-direction:column;align-items:flex-start;min-height:88px">
      <span>${title} ${v === rec ? '<span class="tag good">추천</span>' : ''}</span><span class="muted small" style="font-weight:500">${sub}</span></button>`;
    render(`${topBar('다녀왔어요 3/4')}<h1>다음엔?</h1>
      <div class="card" style="margin-bottom:14px"><div class="field-label" style="margin-top:0">넘어가는 조건</div><ul>${sec(L, '넘어가는 조건').map(x => `<li>${inline(x)}</li>`).join('')}</ul></div>
      <p class="small">${allDone ? '오늘 메뉴를 다 해냈어요. 조건도 채웠다면 넘어가요.' : `안 된 것이 ${names.length - F.done.size}개 있어서 한 번 더를 추천해요.`}</p>
      <div class="stack">${opt('반복', '같은 수업 한 번 더', '순서와 횟수를 조금 바꿔서')}${opt('넘어가기', '다음 수업으로', L.supp ? '원래 수업으로 돌아가기' : '조건을 채웠을 때')}</div>`,
      `<button id="back">◀ 이전</button>`);
    $app.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { F.choice = b.dataset.c; F.step = 4; viewDone(); });
    document.getElementById('back').onclick = () => { F.step = 2; viewDone(); };
    return;
  }
  if (F.step === 4) {
    render(`${topBar('다녀왔어요 4/4')}<h1>한 줄 메모</h1><p class="muted small">안 써도 돼요.</p>
      <textarea id="memo" placeholder="예: 코에 물이 덜 들어갔다">${esc(F.memo)}</textarea>`, nav(null, null, '저장'));
    return bindNav(async () => { F.memo = document.getElementById('memo').value.trim(); await saveLog(P); });
  }
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function saveLog(P) {
  const F = S.fb, L = P.lesson, date = localDate();
  const path = `log/${date}.md`;
  if (S.files[path] && !confirm('오늘 기록이 이미 있어요. 새 기록으로 바꿀까요?')) return;
  const names = L.menu.map(m => m.name);
  const done = names.filter(n => F.done.has(n)), notDone = names.filter(n => !F.done.has(n));
  const diffs = DIFFS.filter(d => F.diffs.has(d));
  const pool = profile().myPool;
  const list = a => a.length ? a.map(x => `- ${x}`).join('\n') : '- (없음)';
  const text = `---
날짜: ${date}
수업: ${q(L.id)}
제목: ${q(L.title)}
회차: ${P.round}
수영장: ${q(pool)}
된 것: ${JSON.stringify(done)}
안 된 것: ${JSON.stringify(notDone)}
힘들었던 점: ${JSON.stringify(diffs)}
기타 내용: ${q(F.etc)}
다음: ${F.choice}
메모: ${q(F.memo)}
---
# ${date} 수영 기록

- **수업**: ${L.supp ? '' : L.id + '. '}${L.title}${P.round > 1 ? ` (${P.round}번째)` : ''}
- **수영장**: ${pool || '-'}
- **다음**: ${F.choice === '넘어가기' ? '다음 수업으로' : '같은 수업 한 번 더'}

## 된 것
${list(done)}

## 안 된 것
${list(notDone)}

## 힘들었던 점
${list(diffs.map(d => d === '기타' && F.etc ? `기타: ${F.etc}` : d))}

## 메모
${F.memo || '-'}
`;
  await saveFile(path, text);
  if (profile().pick) await saveProfile({ ...profile(), pick: '' });
  const choice = F.choice;
  S.fb = null;
  const N = plan();
  const nextTitle = N.finished ? '모든 수업 완료' : `${N.lesson.supp ? '보충 · ' : N.lesson.id + '. '}${N.lesson.title}`;
  render(`${topBar()}
    <div class="card stack" style="margin-top:6vh;text-align:center">
      <p style="font-size:1.2em;font-weight:700">${esc(pickOne(CHEER[choice] || CHEER['반복']))}</p>
      ${N.why ? `<p class="note">${esc(N.why)}</p>` : ''}
      <p class="muted small">다음 수업</p>
      <p style="font-size:1.3em;font-weight:800">${esc(nextTitle)}</p>
      <button class="primary" data-go="">홈으로</button>
    </div>${statusLine()}`);
}

// ───────────── 수영장 찾기 ─────────────

function viewPools() {
  const { pools } = parsePools();
  const now = new Date(), mine = profile().myPool;
  const list = pools.map((p, i) => ({ p, i, t: todayInfo(p, now) }))
    .sort((a, b) => a.t.rank - b.t.rank || distNum(a.p.dist) - distNum(b.p.dist));
  const badge = t => ({ open: 'good', later: '', unknown: 'warn' }[t.status] ?? 'warn');
  const tel = s => (String(s).match(/[\d-]{7,}/) || [''])[0];
  render(`${topBar('수영장 찾기')}
    <h1>어디로 갈까</h1>
    <p class="muted small">${WEEK[now.getDay()]}요일 ${hm(now.getHours() * 60 + now.getMinutes())} 기준 · 지금 열린 곳이 위로 · ${esc(profile().area)}</p>
    <div class="stack">
    ${list.map(({ p, i, t }) => `
      <article class="card pool ${p.name === mine ? 'mine' : ''}">
        <div class="name">${p.name === mine ? '★ ' : ''}${esc(p.name)}</div>
        <div><span class="tag ${badge(t)}">${esc(t.text)}</span> ${p.dist ? `<span class="muted small">${esc(p.dist)}</span>` : ''}</div>
        ${t.list ? `<div class="today small">오늘: ${esc(t.list)}${t.unsure ? ' (확인 필요)' : ''}</div>` : ''}
        <div class="fees">1회 <b>${esc(p.fee1 || '확인 필요')}</b> · 월 <b>${esc(p.feeM || '확인 필요')}</b></div>
        <details><summary>자세히</summary><dl>
          <dt>자유수영</dt><dd>${esc(p.hours || '확인 필요')}</dd>
          <dt>레인·수심</dt><dd>${esc(p.lanes || '-')}</dd>
          <dt>예약</dt><dd>${esc(p.reserve || '-')}</dd>
          <dt>전화</dt><dd>${esc(p.phone || '-')}</dd>
          <dt>메모</dt><dd>${esc(p.memo || '-')}</dd>
        </dl></details>
        <div class="actions">
          <a class="btn" href="${mapUrl(p.name)}" target="_blank" rel="noopener">🗺 지도</a>
          ${tel(p.phone) ? `<a class="btn" href="tel:${tel(p.phone)}">📞 전화</a>` : '<button disabled style="opacity:.4">📞 전화</button>'}
          <button data-mine="${i}">${p.name === mine ? '★ 다니는 곳' : '☆ 여기 다님'}</button>
          <button data-go="pool/${i}">✏️ 고치기</button>
        </div>
      </article>`).join('')}
    </div>
    <div style="margin-top:16px"><button data-go="pool/new">+ 수영장 추가</button></div>
    <p class="muted small" style="margin-top:12px">원본은 data/pools.md 입니다. 파일을 직접 고쳐도 여기에 반영돼요.</p>
    ${statusLine()}`);
  $app.querySelectorAll('[data-mine]').forEach(b => b.onclick = async () => {
    const name = pools[b.dataset.mine].name;
    await saveProfile({ ...profile(), myPool: profile().myPool === name ? '' : name });
    if (location.hash === '#/pools') viewPools();
  });
}

function viewPoolEdit(idx) {
  const { pools } = parsePools();
  const isNew = idx === 'new';
  const p = isNew ? {} : pools[+idx];
  if (!p) return go('pools');
  const fields = POOL_COLS.filter(([k]) => k !== 'map');
  const hints = {
    dist: '예: 도보 15분 · 버스 20분',
    hours: '예: 평일 06:00-07:50, 12:00-12:50 / 토 09:00-11:50 / 일 휴관  (모르면 "확인 필요")',
    fee1: '예: 3,000원', feeM: '예: 50,000원',
  };
  render(`${topBar(isNew ? '수영장 추가' : '수영장 고치기')}
    <h1>${isNew ? '수영장 추가' : esc(p.name)}</h1>
    ${fields.map(([k, label]) => `<label class="f" for="f-${k}">${label}</label>
      ${k === 'hours' || k === 'memo' ? `<textarea id="f-${k}">${esc(p[k])}</textarea>` : `<input type="text" id="f-${k}" value="${esc(p[k])}">`}
      ${hints[k] ? `<div class="hint">${hints[k]}</div>` : ''}`).join('')}
    <div class="stack" style="margin-top:20px">
      <button class="primary" id="save">저장</button>
      ${isNew ? '' : '<button id="del" style="color:var(--bad)">이 수영장 지우기</button>'}
    </div>`);
  document.getElementById('save').onclick = async () => {
    const np = {};
    fields.forEach(([k]) => { np[k] = document.getElementById('f-' + k).value.trim(); });
    if (!np.name) return alert('이름은 꼭 적어 주세요.');
    const prof = profile();
    if (!isNew && prof.myPool === p.name && np.name !== p.name) await saveProfile({ ...prof, myPool: np.name });
    if (isNew) pools.push(np); else pools[+idx] = np;
    await savePools(pools);
    go('pools');
  };
  const del = document.getElementById('del');
  if (del) del.onclick = async () => {
    if (!confirm(`${p.name}을(를) 목록에서 지울까요?`)) return;
    pools.splice(+idx, 1);
    await savePools(pools);
    go('pools');
  };
}

// ───────────── 기록 보기 ─────────────

function viewLog() {
  const C = curriculum(), Ls = logs(), M = mainNext(C, Ls);
  const total = C.main.length, pos = Math.min(M.idx, total);
  const cur = M.finished ? '모든 수업 완료' : `${M.lesson.id}. ${M.lesson.title}`;
  const went = new Set(Ls.map(l => l.date));
  const today = new Date();
  const base = S.calMonth || new Date(today.getFullYear(), today.getMonth(), 1);
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cellsHtml = [];
  for (let i = 0; i < first; i++) cellsHtml.push('<div></div>');
  for (let d = 1; d <= days; d++) {
    const ds = localDate(new Date(y, m, d));
    cellsHtml.push(`<div class="d ${went.has(ds) ? 'went' : ''} ${ds === localDate(today) ? 'today' : ''}">${d}</div>`);
  }
  const monthCount = Ls.filter(l => l.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).length;
  render(`${topBar('기록')}
    <h1>기록</h1>
    <div class="card">
      <div class="field-label" style="margin-top:0">진행</div>
      <p style="font-weight:800;font-size:1.2em;margin:0.2em 0">${pos} / ${total} 수업 완료</p>
      <div class="progress"><div style="width:${total ? (pos / total) * 100 : 0}%"></div></div>
      <p class="small muted">지금: ${esc(cur)}</p>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="calhead"><button id="pm">◀</button><b>${y}년 ${m + 1}월 · ${monthCount}번 감</b><button id="nm">▶</button></div>
      <div class="cal" style="margin-top:10px">${[...WEEK].map(w => `<div class="dow">${w}</div>`).join('')}${cellsHtml.join('')}</div>
    </div>
    <p class="muted small" style="margin-top:12px">하루 기록은 data/log/날짜.md 파일에 있어요.</p>`);
  document.getElementById('pm').onclick = () => { S.calMonth = new Date(y, m - 1, 1); viewLog(); };
  document.getElementById('nm').onclick = () => { S.calMonth = new Date(y, m + 1, 1); viewLog(); };
}

// ───────────── 설정 ─────────────

function viewSettings() {
  const prof = profile(), { pools } = parsePools();
  const pending = Object.keys(lsGet('pending', {})).length;
  const swOk = 'serviceWorker' in navigator && window.isSecureContext;
  render(`${topBar('설정')}
    <h1>설정</h1>
    <label class="f" for="area">사는 동네</label>
    <input id="area" type="text" value="${esc(prof.area)}">
    <label class="f" for="mine">다니는 수영장</label>
    <select id="mine"><option value="">(없음)</option>${pools.map(p => `<option ${p.name === prof.myPool ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <div class="stack" style="margin-top:16px">
      <button class="primary" id="save">저장</button>
      <button data-go="pick">수업 직접 고르기</button>
      <button id="reload">md 파일 다시 불러오기</button>
    </div>
    <div class="card small" style="margin-top:20px">
      <p>연결: ${S.online ? '맥북 서버와 연결됨' : '오프라인'}${pending ? ` · 저장 대기 ${pending}개` : ''}</p>
      <p>오프라인 사용: ${swOk ? '가능 (한 번 연 화면은 인터넷 없이 열림)' : '<b>불가</b> — 휴대폰은 https 주소로 열어야 해요 (README 참고)'}</p>
      <p class="muted">데이터 위치: 맥북의 swim-coach/data 폴더 (.md 파일)</p>
    </div>`);
  document.getElementById('save').onclick = async () => {
    await saveProfile({ ...profile(), area: document.getElementById('area').value.trim(), myPool: document.getElementById('mine').value });
    go('');
  };
  document.getElementById('reload').onclick = async () => { await loadFiles(); if (location.hash === '#/settings') viewSettings(); };
}

// ───────────── 라우터 ─────────────

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h !== 'lesson') { keepAwake(false); $app.ontouchstart = $app.ontouchend = null; }
  if (h !== 'done' && S.fb && S.fb.step > 1 && !h.startsWith('done')) { /* 작성 중인 답은 메모리에 남겨 둔다 */ }
  if (!profile().area && h !== '') return go('');
  if (h === 'lesson') return viewLesson();
  if (h === 'done') return viewDone();
  if (h === 'pools') return viewPools();
  if (h.startsWith('pool/')) return viewPoolEdit(h.slice(5));
  if (h === 'log') return viewLog();
  if (h === 'settings') return viewSettings();
  if (h === 'pick') return viewPick();
  return viewHome();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-go]');
  if (el) { e.preventDefault(); go(el.dataset.go); }
});
window.addEventListener('hashchange', route);
window.addEventListener('online', async () => { await flush(); });
document.addEventListener('visibilitychange', async () => {
  // md 파일을 밖에서 고쳤을 수 있으니 다시 볼 때 새로 읽는다. (입력 중인 화면은 건드리지 않음)
  if (document.visibilityState !== 'visible') return;
  const h = location.hash.replace(/^#\/?/, '');
  await loadFiles();
  if (!['done', 'settings', 'lesson'].includes(h) && !h.startsWith('pool/')) route();
  if (h === 'lesson') keepAwake(true);
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

loadFiles().then(route);
