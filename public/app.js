const state = {
  section: 'vocab',
  levels: ['basic'],
  mode: 'all',
  vocabMode: 'en-ja',
  search: '',
  questions: [],
  filtered: [],
  index: 0,
  score: {},
  recentIds: [],
  quiz: {
    active: false,
    total: 10,
    remaining: 0,
    difficulty: ['basic', 'standard', 'developed', 'advanced', 'hard'],
    pool: [],
    seen: new Set(),
    current: null,
    answered: 0,
    correct: 0,
    sessionRecent: []
  },
  study: { active: false, pool: [], seen: new Set(), recent: [], current: null }
};

const sections = {
  vocab: { title: '単語', description: '基礎・標準はインプット優先。発展以降で文脈・類義語・語族まで広げます。', levels: [['basic', '🟢 基礎'], ['standard', '🔵 標準'], ['developed', '🟡 発展'], ['advanced', '🟠 上級'], ['hard', '🔴 難関']] },
  idiom: { title: '熟語', description: '重要熟語・群動詞・入試頻出表現。', levels: [['basic', '基礎'], ['standard', '標準'], ['entrance', '入試'], ['hard', '発展']] },
  grammar: { title: '文法', description: '総文法の確認と文法クイズ。', levels: [['overview', '3.1 総文法'], ['quiz', '3.2 文法クイズ']] },
  reading: { title: '長文', description: '長文コンテンツは準備中です。', levels: [['normal', '通常長文'], ['common', '共通テスト'], ['national', '国公立二次'], ['hard', '難関大']] }
};

const vocabModes = {
  'en-ja': { label: '英 → 日', minLevel: 0 },
  'ja-en': { label: '日 → 英', minLevel: 0 },
  context: { label: '文脈・空所補充', minLevel: 2 },
  synonym: { label: '類義語', minLevel: 2 },
  family: { label: '語族・派生語', minLevel: 2 },
  random: { label: 'ランダム', minLevel: 0 }
};

const levelRank = { basic: 0, standard: 1, developed: 2, advanced: 3, hard: 4 };
const $ = (id) => document.getElementById(id);
const progressKey = 'english-god:user-progress:v6';
const progressSchema = 2;
const APP_VERSION = '20260821-v6';
const scheduler = {
  targetRetention: 0.82,
  maxStabilityDays: 365,
  maxRecent: 12,
  minCandidatePool: 12
};
let broadcast = null;
const key = (q) => `${q.type || state.section}:${q.id}`;
let manifests = null;

function freshProgressState() {
  return { schema: progressSchema, updatedAt: Date.now(), records: {} };
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(progressKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.records && typeof parsed.records === 'object') {
      state.score = parsed.records;
    } else if (parsed && typeof parsed === 'object') {
      state.score = parsed.records || parsed;
    } else {
      state.score = {};
    }
  } catch {
    state.score = {};
  }
  migrateProgress();
  initProgressSync();
  renderStats();
}

function migrateProgress() {
  const now = Date.now();
  for (const rec of Object.values(state.score)) {
    if (!rec || typeof rec !== 'object') continue;
    rec.answered = Number(rec.answered || 0);
    rec.correct = Number(rec.correct || 0);
    rec.wrong = Number(rec.wrong || 0);
    rec.streak = Number(rec.streak || 0);
    rec.lastAnswered = Number(rec.lastAnswered || 0);
    rec.ease = Math.min(2.8, Math.max(1.3, Number(rec.ease || 2.3)));
    rec.stabilityDays = Math.max(0.15, Number(rec.stabilityDays || rec.intervalDays || 1));
    rec.intervalDays = Math.max(0, Number(rec.intervalDays || 0));
    rec.lapses = Number(rec.lapses || 0);
    rec.nextDue = Number(rec.nextDue || (rec.lastAnswered ? rec.lastAnswered : now));
    rec.lastResult = rec.lastResult === 'correct' || rec.lastResult === 'wrong' ? rec.lastResult : null;
    rec.updatedAt = Number(rec.updatedAt || now);
  }
}

function progressSnapshot() {
  return JSON.stringify({ schema: progressSchema, updatedAt: Date.now(), records: state.score });
}

function saveProgress({ broadcastUpdate = true } = {}) {
  const payload = progressSnapshot();
  try { localStorage.setItem(progressKey, payload); } catch (e) { console.warn('progress save failed', e); }
  renderStats();
  if (broadcastUpdate && broadcast) {
    broadcast.postMessage({ type: 'progress-updated', payload, source: window.__englishGodSyncSource });
  }
}

function initProgressSync() {
  const syncSource = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  window.__englishGodSyncSource = syncSource;
  try {
    if ('BroadcastChannel' in window) {
      broadcast = new BroadcastChannel('english-god-progress');
      broadcast.onmessage = (e) => {
        if (!e.data || e.data.source === syncSource || e.data.type !== 'progress-updated') return;
        try {
          const incoming = JSON.parse(e.data.payload);
          state.score = incoming.records || {};
          migrateProgress();
          renderStats();
          if (!state.quiz.active && state.section === 'vocab') filterQuestions();
        } catch {}
      };
    }
  } catch {}
  window.addEventListener('storage', (e) => {
    if (e.key !== progressKey || !e.newValue) return;
    try {
      const incoming = JSON.parse(e.newValue);
      state.score = incoming.records || {};
      migrateProgress();
      renderStats();
      if (!state.quiz.active && state.section === 'vocab') filterQuestions();
    } catch {}
  });
  window.addEventListener('beforeunload', () => broadcast?.close());
}

function exportProgress() {
  const blob = new Blob([progressSnapshot()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `english-god-progress-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importProgressFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed.records !== 'object') throw new Error('Invalid progress file');
  state.score = parsed.records;
  migrateProgress();
  saveProgress();
  filterQuestions();
}

function renderStats() {
  const vals = Object.values(state.score);
  const answered = vals.reduce((n, v) => n + (v.answered || 0), 0);
  const correct = vals.reduce((n, v) => n + (v.correct || 0), 0);
  $('answeredCount').textContent = answered;
  $('correctCount').textContent = correct;
  $('accuracy').textContent = answered ? `${Math.round(correct / answered * 100)}%` : '0%';
}

function recordFor(q) {
  const k = key(q);
  return state.score[k] || (state.score[k] = {
    answered: 0, correct: 0, wrong: 0, streak: 0, lapses: 0,
    ease: 2.3, stabilityDays: 1, intervalDays: 0,
    lastAnswered: 0, lastResult: null, nextDue: Date.now(), updatedAt: Date.now()
  });
}

function renderNav() {
  const nav = $('categoryNav');
  nav.innerHTML = '';
  for (const [id, s] of Object.entries(sections)) {
    const h = document.createElement('div');
    h.className = 'nav-section';
    h.textContent = id === 'vocab' ? '① 単語' : id === 'idiom' ? '② 熟語' : id === 'grammar' ? '③ 文法' : '⑤ 長文';
    nav.append(h);
    const b = document.createElement('button');
    b.className = `nav-item ${state.section === id ? 'active' : ''}`;
    b.textContent = s.title;
    b.onclick = async () => {
      state.quiz.active = false;
      state.section = id;
      state.levels = [s.levels[0][0]];
      state.search = '';
      resetQuestionArea();
      renderAll();
      await fetchData();
    };
    nav.append(b);
  }
}

function renderLevelTabs() {
  const tabs = $('levelTabs');
  tabs.innerHTML = '';
  for (const [id, label] of sections[state.section].levels) {
    const b = document.createElement('button');
    b.className = `level-btn ${state.levels.includes(id) ? 'active' : ''}`;
    b.textContent = label;
    b.title = state.section === 'vocab' ? '複数選択できます' : '選択中のレベル';
    b.onclick = async () => {
      if (state.section === 'vocab') {
        if (state.levels.includes(id) && state.levels.length > 1) state.levels = state.levels.filter(x => x !== id);
        else if (!state.levels.includes(id)) state.levels = [...state.levels, id];
        else state.levels = [id];
      } else {
        state.levels = [id];
      }
      state.quiz.active = false;
      resetQuestionArea();
      renderAll();
      await fetchData();
    };
    tabs.append(b);
  }
}

function updateVocabModeOptions() {
  const sel = $('vocabModeSelect');
  if (!sel) return;
  const maxRank = Math.max(...state.levels.map(x => levelRank[x] ?? 0));
  const allowed = Object.entries(vocabModes).filter(([, m]) => maxRank >= m.minLevel);
  sel.innerHTML = '';
  for (const [id, m] of allowed) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = m.label;
    sel.append(option);
  }
  if (!allowed.some(([id]) => id === state.vocabMode)) state.vocabMode = 'en-ja';
  sel.value = state.vocabMode;
  sel.style.display = state.section === 'vocab' ? 'block' : 'none';
}

function renderQuizSettings() {
  const panel = $('quizSettings');
  if (!panel) return;
  const show = state.section === 'vocab';
  panel.classList.toggle('hidden', !show);
  $('quizCountInput').value = state.quiz.total;
  document.querySelectorAll('#quizDifficultyChips .level-btn').forEach(btn => {
    btn.classList.toggle('active', state.quiz.difficulty.includes(btn.dataset.level));
  });
}

function renderAll() {
  renderNav();
  const s = sections[state.section];
  $('pageTitle').textContent = s.title;
  $('pageDescription').textContent = s.description;
  renderLevelTabs();
  $('searchInput').value = state.search;
  $('modeSelect').value = state.mode;
  updateVocabModeOptions();
  renderQuizSettings();
  updateInfo();
}

async function readManifest(path) {
  const r = await fetch(`${path}?v=${APP_VERSION}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function isVocab(q) { return Boolean(q && (q.type === 'vocab' || String(q.word || '').trim())); }
function eligibleVocab(q, mode) {
  if (!isVocab(q)) return false;
  const word = String(q.word || q.answer || '').trim();
  const meaning = String(q.meaning || q.answerJa || q.ja || '').trim();
  if (mode === 'en-ja' || mode === 'ja-en') return Boolean(word && meaning);
  if (mode === 'context') return Boolean(word && q.exampleSentence);
  if (mode === 'synonym') return Array.isArray(q.synonyms) && q.synonyms.length > 0;
  if (mode === 'family') return String(q.family || '').split(';').some(Boolean);
  return Boolean(word);
}
function vocabFilteredQuestions() {
  const mode = state.vocabMode === 'random' ? null : state.vocabMode;
  let qs = state.filtered.filter(isVocab);
  if (mode) qs = qs.filter(q => eligibleVocab(q, mode));
  return qs;
}

async function bootManifests() {
  const [v, i, g] = await Promise.all([
    readManifest('data/vocab/index.json'),
    readManifest('data/idioms/index.json'),
    readManifest('data/grammar/index.json')
  ]);
  manifests = { vocab: v, idiom: i, grammar: g };
}

function urlsFor(section, levelIds) {
  if (!manifests || section === 'reading') return [];
  if (section === 'vocab') {
    return [...new Set(levelIds.flatMap(level => (manifests.vocab.levels?.[level]?.files || []).map(f => `data/vocab/${f}`)))];
  }
  const ids = Array.isArray(levelIds) ? levelIds : [levelIds];
  const dir = section === 'idiom' ? 'idioms' : 'grammar';
  return [...new Set(ids.flatMap(level => (manifests[section]?.files?.[level] || []).map(f => `data/${dir}/${f}`)))];
}

async function fetchData() {
  state.questions = [];
  updateInfo('読み込み中…');
  const urls = urlsFor(state.section, state.levels);
  if (!urls.length) { state.filtered = []; updateInfo(state.section === 'reading' ? '長文データは準備中です' : '該当データなし'); return; }
  const settled = await Promise.all(urls.map(async u => {
    try {
      const r = await fetch(`${u}?v=${APP_VERSION}`, { cache: 'no-store' });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    } catch { return []; }
  }));
  state.questions = settled.flat().map(normalizeQuestion).filter(Boolean);
  filterQuestions();
}

function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  if (q.type === 'vocab' || q.word) {
    const word = String(q.word || q.answer || '').trim();
    const meaning = String(q.meaning || q.answerJa || q.ja || '').trim();
    return { ...q, type: 'vocab', word, meaning };
  }
  if (Array.isArray(q.choices)) return { ...q, choices: q.choices };
  return { ...q, choices: [] };
}

function filterQuestions() {
  let qs = [...state.questions];
  const query = state.search.trim().toLowerCase();
  if (query) qs = qs.filter(x => `${x.word || ''} ${x.meaning || ''} ${x.ja || ''} ${x.question || ''} ${x.prompt || ''} ${(Array.isArray(x.tags) ? x.tags.join(' ') : x.tags || '')}`.toLowerCase().includes(query));
  if (state.mode === 'weak') qs = qs.filter(x => state.score[key(x)]?.wrong);
  if (state.mode === 'unanswered') qs = qs.filter(x => !state.score[key(x)]?.answered);
  state.filtered = qs;
  updateInfo();
  if (state.section === 'vocab') {
    $('datasetInfo').textContent = `単語 / ${state.levels.map(x => sections.vocab.levels.find(y => y[0] === x)?.[1]?.replace(/^[^ ]+ /,'') || x).join(' + ')} / ${vocabModes[state.vocabMode]?.label || 'ランダム'}：${vocabFilteredQuestions().length}問`;
  }
}

function updateInfo(text) {
  $('datasetInfo').textContent = text || `${sections[state.section].title} / ${state.levels.join(' + ')}：${state.filtered?.length || 0}問`;
}

function resetQuestionArea({ clearData = true } = {}) {
  $('questionArea').classList.add('hidden');
  $('questionArea').innerHTML = '';
  $('emptyState').style.display = 'block';
  if (clearData) { state.questions = []; state.filtered = []; }
  updateInfo();
}

function resetQuizView() {
  $('questionArea').classList.add('hidden');
  $('questionArea').innerHTML = '';
  $('emptyState').style.display = 'block';
  state.index = 0;
  state.quiz.active = false;
  state.quiz.seen.clear();
  state.quiz.pool = [];
}

function ensureDifficultySet() {
  if (!state.quiz.difficulty.length) state.quiz.difficulty = ['basic'];
}

function buildQuizPool() {
  ensureDifficultySet();
  let pool = state.questions.filter(isVocab).filter(q => state.quiz.difficulty.includes(q.level || state.levels[0]));
  if (state.vocabMode !== 'random') pool = pool.filter(q => eligibleVocab(q, state.vocabMode));
  return pool;
}

async function startCustomQuiz() {
  const raw = Number.parseInt($('quizCountInput').value, 10);
  state.quiz.total = Math.min(200, Math.max(1, Number.isFinite(raw) ? raw : 10));
  $('quizCountInput').value = state.quiz.total;
  ensureDifficultySet();

  // 4択クイズで選んだ難易度を実際に読み込む。通常学習で別難易度を開いていなくても動く。
  state.levels = [...state.quiz.difficulty];
  resetQuestionArea();
  renderAll();
  await fetchData();

  const pool = buildQuizPool();
  state.quiz.pool = [...pool];
  state.quiz.seen.clear();
  state.quiz.sessionRecent = [];
  state.quiz.remaining = Math.min(state.quiz.total, pool.length);
  state.quiz.active = true;
  state.quiz.answered = 0;
  state.quiz.correct = 0;
  state.quiz.current = null;
  if (!pool.length) {
    showEmpty('この設定では問題がありません', '難易度や問題形式を変更してください。');
    return;
  }
  $('emptyState').style.display = 'none';
  showNextScheduledQuestion();
}

function rankRecord(q) {
  return state.score[key(q)] || {};
}

function retrievalProbability(rec, now = Date.now()) {
  if (!rec?.answered || !rec.lastAnswered) return 1;
  const elapsedDays = Math.max(0, (now - rec.lastAnswered) / 86400000);
  const stability = Math.max(0.15, rec.stabilityDays || 1);
  return Math.exp(-elapsedDays / stability);
}

function dueScore(q) {
  const rec = rankRecord(q);
  if (!rec.answered) return 100000 + Math.random() * 1000;
  const now = Date.now();
  const dueMs = rec.nextDue || now;
  const overdueDays = Math.max(0, (now - dueMs) / 86400000);
  const elapsedDays = rec.lastAnswered ? Math.max(0, (now - rec.lastAnswered) / 86400000) : 999;
  const recall = retrievalProbability(rec, now);
  const accuracy = rec.answered ? rec.correct / rec.answered : 0;
  const weakness = (1 - accuracy) * 60 + (rec.lapses || 0) * 18 + Math.max(0, 0.65 - recall) * 80;
  const dueBoost = overdueDays * 120;
  const freshPenalty = Math.max(0, 1.25 - elapsedDays) * 260;
  const futurePenalty = Math.max(0, (dueMs - now) / 86400000) * 22;
  return dueBoost + weakness + Math.min(elapsedDays * 2.5, 45) - freshPenalty - futurePenalty + Math.random() * 8;
}

function chooseScheduled(pool, { excludeRecent = true } = {}) {
  const seen = state.quiz.active ? state.quiz.seen : state.study.seen;
  const sessionRecent = state.quiz.active ? (state.quiz.sessionRecent || []) : (state.study.recent || []);
  const recentLimit = state.quiz.active ? 6 : 4;
  let candidates = pool.filter(q => !seen.has(key(q)));
  if (!candidates.length) {
    seen.clear();
    candidates = pool.filter(q => !sessionRecent.slice(-recentLimit).includes(key(q)));
    if (!candidates.length) candidates = [...pool];
  }
  if (excludeRecent) {
    const blocked = new Set([...state.recentIds.slice(0, recentLimit), ...sessionRecent.slice(-recentLimit)]);
    const nonRecent = candidates.filter(q => !blocked.has(key(q)));
    if (nonRecent.length >= Math.min(scheduler.minCandidatePool, candidates.length)) candidates = nonRecent;
  }
  candidates.sort((a, b) => dueScore(b) - dueScore(a));
  const top = candidates.slice(0, Math.min(16, candidates.length));
  return top[Math.floor(Math.random() * top.length)] || candidates[0];
}

function showNextScheduledQuestion() {
  if (!state.quiz.active) return;
  if (state.quiz.answered >= state.quiz.remaining) { finishCustomQuiz(); return; }
  const q = chooseScheduled(state.quiz.pool);
  if (!q) { finishCustomQuiz(); return; }
  state.quiz.current = q;
  state.quiz.seen.add(key(q));
  state.quiz.sessionRecent.push(key(q));
  state.recentIds = [key(q), ...state.recentIds.filter(x => x !== key(q))].slice(0, 8);
  showQuestion(q, { customQuiz: true });
}

function startStudySession() {
  state.quiz.active = false;
  state.study.pool = vocabFilteredQuestions();
  state.study.seen.clear();
  state.study.recent = [...state.recentIds];
  state.study.current = null;
  if (!state.study.pool.length) {
    showEmpty('この形式で使える問題がありません', 'レベルや問題形式を変更してください。');
    return;
  }
  $('emptyState').style.display = 'none';
  showNextStudyQuestion();
}

function showNextStudyQuestion() {
  if (!state.study.active && state.study.pool.length) state.study.active = true;
  const q = chooseScheduled(state.study.pool);
  if (!q) { showEmpty('該当する問題がありません', 'レベルや問題形式を確認してください。'); return; }
  state.study.current = q;
  state.study.seen.add(key(q));
  state.study.recent = [key(q), ...state.study.recent.filter(x => x !== key(q))].slice(0, 8);
  state.recentIds = [key(q), ...state.recentIds.filter(x => x !== key(q))].slice(0, 8);
  showQuestion(q, { study: true });
}

function finishCustomQuiz() {
  state.quiz.active = false;
  $('questionArea').classList.remove('hidden');
  $('questionArea').innerHTML = `<div class="result-box"><h2>4択クイズ終了</h2><p>${state.quiz.answered}問中 <strong>${state.quiz.correct}問正解</strong>（${state.quiz.answered ? Math.round(state.quiz.correct/state.quiz.answered*100) : 0}%）</p><button id="restartQuiz" class="primary-btn">もう一度</button></div>`;
  $('restartQuiz').onclick = startCustomQuiz;
}

function showEmpty(title, text) {
  $('questionArea').classList.add('hidden');
  $('emptyState').style.display = 'block';
  $('emptyState').querySelector('h2').textContent = title;
  $('emptyState').querySelector('p').textContent = text;
}

function normalizeText(text) {
  return String(text || '').trim().toLowerCase().replace(/[・、，,;；/／\s]+/g, ' ');
}

function relatedValues(q, field) {
  if (field === 'family') return String(q.family || '').split(';').map(x => x.trim()).filter(Boolean);
  if (field === 'synonyms') return Array.isArray(q.synonyms) ? q.synonyms.filter(Boolean) : [];
  return [];
}

function fillChoices(correct, candidates, minPool = [], answerRelated = []) {
  const answer = String(correct || '').trim();
  const seen = new Set([normalizeText(answer)]);
  const out = [];
  const add = (x) => {
    const text = String(x || '').trim();
    const n = normalizeText(text);
    if (!text || seen.has(n)) return false;
    seen.add(n); out.push(text); return true;
  };
  const ranked = [...candidates, ...minPool]
    .filter(Boolean)
    .filter(x => !answerRelated.some(a => normalizeText(a) === normalizeText(x)))
    .sort(() => Math.random() - 0.5);
  for (const c of ranked) { if (out.length >= 3) break; add(c); }
  return [answer, ...out].slice(0, 4);
}

function buildDistractors(q, pool, field) {
  const current = normalizeText(q.word);
  const others = pool.filter(x => isVocab(x) && normalizeText(x.word) !== current);
  const sourceValues = field === 'meaning' ? x => x.meaning : field === 'word' ? x => x.word : x => x;
  const samePos = q.pos ? others.filter(x => !x.pos || String(x.pos).toLowerCase() === String(q.pos).toLowerCase()) : others;
  const candidates = samePos.map(sourceValues).filter(Boolean);
  const fallback = others.map(sourceValues).filter(Boolean);
  const related = [...relatedValues(q, 'synonyms'), ...relatedValues(q, 'family')];
  return fillChoices(sourceValues(q), candidates, fallback, related);
}

function modeCandidateValues(q, pool, mode) {
  const current = normalizeText(q.word);
  const others = pool.filter(x => isVocab(x) && normalizeText(x.word) !== current);
  const samePos = q.pos ? others.filter(x => !x.pos || normalizeText(x.pos) === normalizeText(q.pos)) : others;
  if (mode === 'en-ja') return [...samePos.map(x => x.meaning), ...others.map(x => x.meaning)];
  if (mode === 'ja-en' || mode === 'context') return [...samePos.map(x => x.word), ...others.map(x => x.word)];
  if (mode === 'synonym') return [...samePos.flatMap(x => Array.isArray(x.synonyms) ? x.synonyms : []), ...others.flatMap(x => Array.isArray(x.synonyms) ? x.synonyms : [])];
  if (mode === 'family') return [...samePos.flatMap(x => String(x.family || '').split(';')), ...others.flatMap(x => String(x.family || '').split(';'))];
  return [];
}

function modeCanGenerateFourChoices(q, mode, pool) {
  if (mode === 'context' && !q.exampleSentence) return false;
  if (mode === 'synonym' && !Array.isArray(q.synonyms) || mode === 'synonym' && !q.synonyms.length) return false;
  if (mode === 'family' && !String(q.family || '').split(';').map(s => s.trim()).filter(Boolean).length) return false;
  const answer = mode === 'en-ja' ? q.meaning
    : mode === 'ja-en' || mode === 'context' ? q.word
    : mode === 'synonym' ? q.synonyms?.[0]
    : String(q.family || '').split(';').map(s => s.trim()).filter(Boolean)[0];
  const answerRelated = mode === 'synonym' ? q.synonyms.slice(1) : mode === 'family' ? String(q.family || '').split(';').map(s => s.trim()).filter(Boolean).slice(1) : [];
  const candidates = modeCandidateValues(q, pool, mode);
  const seen = new Set([normalizeText(answer), ...answerRelated.map(normalizeText)]);
  let count = 0;
  for (const value of candidates) {
    const n = normalizeText(value);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    count++;
    if (count >= 3) return true;
  }
  return false;
}

function pickVocabMode(q) {
  const rank = levelRank[q.level || state.levels[0]] ?? 0;
  const pool = state.quiz.active ? state.quiz.pool : state.questions.filter(isVocab);
  let selected = q._forceMode || state.vocabMode;
  const eligible = rank < 2 ? ['en-ja', 'ja-en'] : ['en-ja', 'ja-en', 'context', 'synonym', 'family'];
  if (selected === 'random') {
    const ready = eligible.filter(mode => modeCanGenerateFourChoices(q, mode, pool));
    selected = (ready.length ? ready : ['en-ja'])[Math.floor(Math.random() * (ready.length ? ready : ['en-ja']).length)];
  }
  if ((vocabModes[selected]?.minLevel ?? 0) > rank || !modeCanGenerateFourChoices(q, selected, pool)) selected = 'en-ja';
  return selected;
}

function vocabQuestion(q) {
  const currentWord = String(q.word || '').trim().toLowerCase();
  const pool = state.quiz.active ? state.quiz.pool : state.questions.filter(isVocab);
  const others = pool.filter(x => String(x.word || '').trim().toLowerCase() !== currentWord);
  const mode = pickVocabMode(q);
  const samePos = q.pos ? others.filter(x => !x.pos || x.pos === q.pos) : others;
  if (mode === 'en-ja') {
    return { mode, question: q.word, prompt: `${q.pos ? `【${q.pos}】 ` : ''}最も適切な日本語の意味を選べ。`, answer: q.meaning, choices: fillChoices(q.meaning, samePos.map(x => x.meaning), others.map(x => x.meaning), [q.word]) };
  }
  if (mode === 'ja-en') {
    return { mode, question: q.meaning, prompt: 'この日本語の意味に合う英単語を選べ。', answer: q.word, choices: fillChoices(q.word, samePos.map(x => x.word), others.map(x => x.word), [q.meaning]) };
  }
  if (mode === 'context') {
    const example = q.exampleSentence || `${q.word} is used in this context.`;
    const rx = new RegExp(q.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const sentence = rx.test(example) ? example.replace(rx, '_____') : example;
    return { mode, question: sentence, prompt: '文脈に最も適する語を選べ。', answer: q.word, choices: fillChoices(q.word, samePos.map(x => x.word), others.map(x => x.word), [q.meaning]), extra: q.exampleJa || '' };
  }
  if (mode === 'synonym') {
    const synonyms = Array.isArray(q.synonyms) ? q.synonyms.filter(Boolean) : [];
    if (!synonyms.length) return vocabQuestion({ ...q, _forceMode: 'en-ja' });
    const answer = synonyms[0];
    const distractors = samePos.flatMap(x => Array.isArray(x.synonyms) ? x.synonyms : []);
    return { mode, question: q.word, prompt: '最も近い意味の語を選べ。', answer, choices: fillChoices(answer, distractors, others.flatMap(x => Array.isArray(x.synonyms) ? x.synonyms : []), synonyms.slice(1)) };
  }
  const family = String(q.family || '').split(';').map(s => s.trim()).filter(Boolean);
  if (!family.length) return vocabQuestion({ ...q, _forceMode: 'en-ja' });
  const answer = family[0];
  return { mode, question: `「${q.word}」の語族・派生語として適切なものを選べ。`, prompt: '語彙のつながりも確認する。', answer, choices: fillChoices(answer, samePos.flatMap(x => String(x.family || '').split(';').map(s => s.trim())), others.flatMap(x => String(x.family || '').split(';').map(s => s.trim())), family.slice(1)) };
}

function genericQuestion(q) {
  const choices = Array.isArray(q.choices) ? q.choices.map(c => typeof c === 'string' ? c : c?.text).filter(Boolean) : [];
  const answer = q.answer || q.meaning || '';
  return { mode: 'standard', question: q.question || q.word || '', prompt: q.prompt || '', answer, choices: fillChoices(answer, choices) };
}

function makeQuestion(q) { return q.type === 'vocab' ? vocabQuestion(q) : genericQuestion(q); }

function showQuestion(q = state.questions[state.index], opts = {}) {
  if (!q) return;
  const view = makeQuestion(q);
  const choices = [...view.choices].sort(() => Math.random() - 0.5);
  const area = $('questionArea');
  area.classList.remove('hidden');
  $('emptyState').style.display = 'none';
  area.innerHTML = `<div class="q-meta"><span class="tag">${escapeHtml(q.level || state.levels[0])}</span><span>${opts.customQuiz ? `${state.quiz.answered + 1} / ${state.quiz.remaining}` : opts.study ? '復習スケジュール' : `${state.index + 1} / ${state.questions.length}`}</span><span class="tag">${escapeHtml(vocabModes[view.mode]?.label || view.mode)}</span></div><div class="question">${escapeHtml(view.question)}<small>${escapeHtml(view.prompt || '')}</small></div><div class="answers" id="answers"></div><div id="explain"></div><div class="next-row"><button id="nextBtn" class="primary-btn" style="display:none">次の問題</button></div>`;
  const box = $('answers');
  choices.forEach(text => {
    const b = document.createElement('button');
    b.className = 'answer-btn';
    b.textContent = text;
    b.onclick = () => answer(q, text === view.answer, b, view, opts);
    box.append(b);
  });
  $('nextBtn').onclick = () => {
    if (state.quiz.active && opts.customQuiz) showNextScheduledQuestion();
    else if (opts.study) showNextStudyQuestion();
    else {
      state.index++;
      if (state.index >= state.questions.length) state.index = 0;
      showQuestion();
    }
  };
}

function schedule(rec, isCorrect) {
  const now = Date.now();
  const previousStability = Math.max(0.15, rec.stabilityDays || 1);
  const previousEase = Math.min(2.8, Math.max(1.3, rec.ease || 2.3));
  rec.lastAnswered = now;
  rec.lastResult = isCorrect ? 'correct' : 'wrong';
  if (!isCorrect) {
    rec.streak = 0;
    rec.lapses = (rec.lapses || 0) + 1;
    rec.ease = Math.max(1.3, previousEase - 0.18);
    rec.stabilityDays = Math.max(0.25, previousStability * 0.28);
    rec.intervalDays = Math.max(0.25, Math.min(1.5, rec.stabilityDays * 0.6));
    rec.nextDue = now + rec.intervalDays * 86400000;
  } else {
    rec.streak = (rec.streak || 0) + 1;
    rec.ease = Math.min(2.8, previousEase + 0.05);
    const streakBonus = Math.min(rec.streak, 6) * 0.08;
    const growth = 1.55 + (rec.ease - 2.0) * 0.45 + streakBonus;
    rec.stabilityDays = Math.min(scheduler.maxStabilityDays, Math.max(1, previousStability * growth));
    const target = scheduler.targetRetention;
    rec.intervalDays = Math.max(0.5, Math.min(365, -Math.log(target) * rec.stabilityDays));
    if (rec.streak === 1) rec.intervalDays = Math.max(1, rec.intervalDays * 0.7);
    rec.nextDue = now + rec.intervalDays * 86400000;
  }
  rec.updatedAt = now;
}

function answer(q, isCorrect, btn, view, opts = {}) {
  const k = key(q);
  const rec = recordFor(q);
  rec.answered++;
  if (isCorrect) { rec.correct++; btn.classList.add('correct'); if (state.quiz.active) state.quiz.correct++; }
  else { rec.wrong++; btn.classList.add('wrong'); document.querySelectorAll('.answer-btn').forEach(b => { if (b.textContent === view.answer) b.classList.add('correct'); }); }
  if (state.quiz.active) state.quiz.answered++;
  schedule(rec, isCorrect);
  state.score[k] = rec;
  document.querySelectorAll('.answer-btn').forEach(b => { b.disabled = true; });
  let explanation = q.explanation || 'この問題のポイントを確認しましょう。';
  if (q.type === 'vocab' && q.exampleSentence) explanation += `\n例文：${q.exampleSentence}\n${q.exampleJa || ''}`;
  $('explain').innerHTML = `<div class="explanation"><strong>${isCorrect ? '正解！' : '不正解'}</strong><br>${escapeHtml(explanation).replace(/\n/g, '<br>')}</div>`;
  $('nextBtn').style.display = 'inline-block';
  saveProgress();
}

function escapeHtml(s = '') { return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

$('startBtn').onclick = () => { if (state.section === 'vocab') startStudySession(); else { state.quiz.active = false; const source = state.filtered; if (!source.length) return showEmpty('該当する問題がありません', '範囲や検索条件を確認してください。'); state.questions = [...source]; state.index = 0; showQuestion(); } };
$('startCustomQuizBtn').onclick = startCustomQuiz;
$('shuffleBtn').onclick = () => {
  if (state.section !== 'vocab') { startQuiz(); return; }
  state.quiz.total = 10;
  state.quiz.difficulty = [...state.levels];
  state.vocabMode = 'random';
  renderAll();
  startCustomQuiz();
};
$('searchInput').oninput = e => { state.search = e.target.value; filterQuestions(); };
$('modeSelect').onchange = e => { state.mode = e.target.value; filterQuestions(); };
$('vocabModeSelect').onchange = e => { state.vocabMode = e.target.value; resetQuizView(); renderAll(); filterQuestions(); };
$('quizCountInput').onchange = e => { state.quiz.total = Math.min(200, Math.max(1, Number.parseInt(e.target.value, 10) || 10)); e.target.value = state.quiz.total; };
document.querySelectorAll('#quizDifficultyChips .level-btn').forEach(btn => btn.onclick = () => {
  const id = btn.dataset.level;
  if (state.quiz.difficulty.includes(id)) {
    if (state.quiz.difficulty.length > 1) state.quiz.difficulty = state.quiz.difficulty.filter(x => x !== id);
  } else state.quiz.difficulty = [...state.quiz.difficulty, id];
  renderQuizSettings();
});
$('exportProgress').onclick = exportProgress;
$('importProgress').onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try { await importProgressFile(file); alert('進捗を読み込みました。'); }
  catch (err) { console.error(err); alert('進捗ファイルを読み込めませんでした。'); }
  e.target.value = '';
};
$('resetProgress').onclick = () => { if (confirm('学習進捗をすべて削除します。よろしいですか？')) { state.score = {}; saveProgress(); filterQuestions(); } };

(async () => {
  loadProgress();
  renderAll();
  try { await bootManifests(); await fetchData(); }
  catch (e) { updateInfo('データの読み込みに失敗しました。JSON/配信先を確認してください。'); console.error(e); }
})();
