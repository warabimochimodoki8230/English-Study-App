const state = {
  section: 'vocab',
  view: 'study',
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
    countMode: '10',
    remaining: 0,
    difficulty: ['basic', 'standard', 'developed', 'advanced', 'hard'],
    pool: [],
    seen: new Set(),
    current: null,
    answered: 0,
    correct: 0,
    sessionRecent: []
  },
  study: { active: false, pool: [], seen: new Set(), recent: [], current: null },
  readingTimer: { passageId: null, targetMinutes: 5, startedAt: 0, elapsedMs: 0, running: false, paused: false, interval: null },
  allVocab: []
};

const sections = {
  vocab: { title: '単語', description: '基礎・標準はインプット優先。発展以降で文脈・類義語・語族まで広げます。', levels: [['basic', '🟢 基礎'], ['standard', '🔵 標準'], ['developed', '🟡 発展'], ['advanced', '🟠 上級'], ['hard', '🔴 難関']] },
  idiom: { title: '熟語', description: '重要熟語・群動詞・入試頻出表現。', levels: [['basic', '基礎'], ['standard', '標準'], ['entrance', '入試'], ['hard', '発展']] },
  grammar: { title: '文法', description: '総文法の確認と文法クイズ。', levels: [['overview', '3.1 総文法'], ['quiz', '3.2 文法クイズ']] },
  reading: { title: '長文', description: '通常長文・共通テスト・国公立二次・難関大の読解問題。', levels: [['normal', '通常長文'], ['common', '共通テスト'], ['national', '国公立二次'], ['hard', '難関大']] }
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
const APP_VERSION = '20260821-v19';
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
  const mastered = vals.filter(v => (v.answered || 0) >= 3 && (v.correct || 0) / Math.max(1, v.answered || 0) >= 0.8 && (v.stabilityDays || 0) >= 3).length;
  $('answeredCount').textContent = answered;
  $('correctCount').textContent = correct;
  $('accuracy').textContent = answered ? `${Math.round(correct / answered * 100)}%` : '0%';
  if ($('statusAccuracy')) $('statusAccuracy').textContent = answered ? `${Math.round(correct / answered * 100)}%` : '0%';
  if ($('masteredCount')) $('masteredCount').textContent = mastered;
  renderLearningAnalytics();
}

function vocabularyRecordRows() {
  return Object.entries(state.score).filter(([k, v]) => k.startsWith('vocab:') && v && typeof v === 'object');
}

function analyticsRiskFor(q) {
  const rec = state.score[key(q)];
  if (!rec || !rec.answered) {
    const rank = levelRank[q.level || 'standard'] ?? 1;
    return rank >= 3 ? 72 + rank * 4 : 35 + rank * 5;
  }
  const acc = (rec.correct || 0) / Math.max(1, rec.answered || 0);
  const recall = retrievalProbability(rec);
  return Math.min(99, Math.round((1 - acc) * 60 + (1 - recall) * 35 + (rec.lapses || 0) * 3));
}

function renderLearningAnalytics() {
  const panel = $('learningAnalytics');
  const mini = $('analyticsMini');
  const genreMini = $('genreMini');
  if (!panel) return;

  const defs = [
    ['vocab', '単語'],
    ['idiom', '熟語'],
    ['grammar', '文法'],
    ['reading', '長文']
  ];
  const rows = defs.map(([type, label]) => {
    const rs = Object.entries(state.score).filter(([k]) => k.startsWith(type + ':')).map(([,r]) => r || {});
    const answered = rs.reduce((n,r)=>n+(r.answered||0),0);
    const correct = rs.reduce((n,r)=>n+(r.correct||0),0);
    const accuracy = answered ? Math.round(correct/answered*100) : 0;
    const unique = rs.filter(r=>(r.answered||0)>0).length;
    const wrong = rs.reduce((n,r)=>n+(r.wrong||0),0);
    return {type,label,answered,correct,accuracy,unique,wrong};
  });

  const vocabRecords = vocabularyRecordRows();
  const wrongWords = vocabRecords
    .filter(([, r]) => (r.wrong || 0) > 0)
    .sort((a,b) => ((b[1].wrong||0) - (a[1].wrong||0)) || (((a[1].correct||0)/(a[1].answered||1)) - ((b[1].correct||0)/(b[1].answered||1))))
    .slice(0,8)
    .map(([k,r]) => ({ k, r }));

  const byLevel = {};
  for (const q of state.allVocab) {
    const rec = state.score[key(q)];
    if (!rec?.answered) continue;
    const level = q.level || 'standard';
    byLevel[level] ||= { answered:0, correct:0, unique:0 };
    byLevel[level].answered += rec.answered||0;
    byLevel[level].correct += rec.correct||0;
    byLevel[level].unique += 1;
  }
  const predicted = state.allVocab
    .filter(q => !state.score[key(q)]?.answered || analyticsRiskFor(q) >= 65)
    .sort((a,b) => analyticsRiskFor(b)-analyticsRiskFor(a))
    .slice(0,8);
  const answeredUnique = vocabRecords.filter(([,r]) => r.answered).length;
  const vocabAnswered = vocabRecords.reduce((n,[,r])=>n+(r.answered||0),0);
  const vocabCorrect = vocabRecords.reduce((n,[,r])=>n+(r.correct||0),0);
  const vocabAccuracy = vocabAnswered ? Math.round(vocabCorrect/vocabAnswered*100) : 0;
  const total = state.allVocab.length || 0;
  const coverage = total ? Math.round(answeredUnique/total*100) : 0;
  const weakHtml = wrongWords.length ? wrongWords.map(({k,r})=>`<li><span>${escapeHtml(k.split(':').slice(1).join(':'))}</span><span class="analytics-badge">${r.wrong||0}回ミス</span></li>`).join('') : '<li><span>まだ間違えた単語はありません。</span></li>';
  const predHtml = predicted.length ? predicted.map(q=>`<li><span>${escapeHtml(q.word)} <small style="color:var(--muted)">${escapeHtml(q.meaning||'')}</small></span><span class="analytics-badge">要注意候補</span></li>`).join('') : '<li><span>現在は候補がありません。</span></li>';
  const levelLabels={basic:'基礎',standard:'標準',developed:'発展',advanced:'上級',hard:'難関'};
  const levelHtml=Object.entries(levelLabels).map(([id,label])=>{const r=byLevel[id]||{answered:0,correct:0,unique:0}; const a=r.answered?Math.round(r.correct/r.answered*100):0; return `<div class="analytics-level"><span>${label}</span><strong>${a}%</strong><span>${r.unique}語</span></div>`}).join('');

  const genreTable = rows.map(r=>`<div class="genre-stat-row"><div class="genre-name"><strong>${r.label}</strong><span>${r.unique}問/項目を回答</span></div><strong class="genre-num">${r.answered}</strong><strong class="genre-num">${r.correct}</strong><strong class="genre-acc">${r.accuracy}%</strong></div>`).join('');
  const miniHtml = rows.map(r=>`<div class="mini-genre"><span>${r.label}</span><strong>${r.accuracy}%</strong><small>${r.answered}回 / ${r.correct}正解</small></div>`).join('');
  if (genreMini) genreMini.innerHTML = `<div class="mini-title">ジャンル別</div>${miniHtml}`;
  if (mini) mini.innerHTML = `<div class="analytics-title">学習分析</div><div style="font-size:11px;color:var(--muted);margin-top:5px">全体${rows.reduce((n,r)=>n+r.answered,0)}回答 / ${rows.reduce((n,r)=>n+r.correct,0)}正解</div>`;

  panel.innerHTML=`<div class="analytics-head"><div><div class="analytics-title">学習状況・分析</div><div class="analytics-sub">ジャンル別の実績と、実際のミス・復習履歴から算出した要注意候補を分けて表示します。</div></div></div>
    <div class="analytics-grid">${rows.map(r=>`<div class="analytics-stat"><span>${r.label}</span><strong>${r.accuracy}%</strong><small>${r.answered}回答 / ${r.correct}正解</small></div>`).join('')}</div>
    <div class="analytics-panel genre-panel"><h4>ジャンル別の回答実績</h4><div class="genre-stat-head"><span>ジャンル</span><span>回答</span><span>正解</span><span>正解率</span></div>${genreTable}</div>
    <div class="analytics-grid analytics-grid-secondary"><div class="analytics-stat"><span>単語学習率</span><strong>${coverage}%</strong></div><div class="analytics-stat"><span>単語正答率</span><strong>${vocabAccuracy}%</strong></div><div class="analytics-stat"><span>学習済み単語</span><strong>${answeredUnique}</strong></div><div class="analytics-stat"><span>要注意候補</span><strong>${predicted.length}</strong></div></div>
    <div class="analytics-columns"><div class="analytics-panel"><h4>実際に間違えた単語</h4><ul class="analytics-list">${weakHtml}</ul></div><div class="analytics-panel"><h4>傾向的に間違えそうな単語</h4><ul class="analytics-list">${predHtml}</ul></div></div>
    <div class="analytics-panel" style="margin-top:14px"><h4>単語・難易度別の実績</h4>${levelHtml}</div>`;
  panel.classList.toggle('hidden', state.view !== 'analytics');
}

function renderNav() {
  const nav = $('categoryNav');
  nav.innerHTML = '';
  const analysisBtn = document.createElement('button');
  analysisBtn.className = `nav-item analysis-nav-item ${state.view === 'analytics' ? 'active' : ''}`;
  analysisBtn.textContent = '学習分析';
  analysisBtn.onclick = () => { state.view = 'analytics'; state.quiz.active = false; stopReadingTimer(); resetQuestionArea({clearData:false}); renderAll(); };
  nav.append(analysisBtn);
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
      if (state.section === 'reading') stopReadingTimer();
      state.section = id;
      state.view = 'study';
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

function renderSessionControls() {
  const session = $('sessionModeSelect');
  const preset = $('quizCountPreset');
  const input = $('quizCountInput');
  if (!session || !preset || !input) return;
  session.innerHTML = '';
  if (state.section === 'vocab') {
    session.append(new Option('通常学習', 'study'));
    session.append(new Option('4択クイズ', 'quiz'));
    session.value = state.quizMode || 'study';
    state.quizMode ||= 'study';
  } else {
    session.append(new Option('4択クイズ', 'quiz'));
    session.value = 'quiz';
  }
  const isQuiz = session.value === 'quiz';
  preset.disabled = !isQuiz;
  input.disabled = !isQuiz;
  input.classList.toggle('visible', isQuiz && preset.value === 'custom');
  preset.value = state.quiz.countMode || '10';
  if (!['10','20','50','100','all','custom'].includes(preset.value)) preset.value='10';
}

function renderAll() {
  renderNav();
  const s = sections[state.section];
  const isAnalytics = state.view === 'analytics';
  $('pageTitle').textContent = isAnalytics ? '学習分析' : s.title;
  $('pageDescription').textContent = isAnalytics ? '単語・熟語・文法・長文をジャンル別に確認し、苦手傾向を見つけます。' : s.description;
  renderLevelTabs();
  $('searchInput').value = state.search;
  $('modeSelect').value = state.mode;
  updateVocabModeOptions();
  renderSessionControls();
  $('studyControls').classList.toggle('hidden', isAnalytics);
  $('questionArea').classList.toggle('hidden', isAnalytics || !$('questionArea').innerHTML.trim());
  $('emptyState').style.display = isAnalytics ? 'none' : ($('questionArea').innerHTML.trim() ? 'none' : 'block');
  renderLearningAnalytics();
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
  const [v, i, g, r] = await Promise.all([
    readManifest('data/vocab/index.json'),
    readManifest('data/idioms/index.json'),
    readManifest('data/grammar/index.json'),
    readManifest('data/reading/index.json')
  ]);
  manifests = { vocab: v, idiom: i, grammar: g, reading: r };
}

function urlsFor(section, levelIds) {
  if (!manifests) return [];
  if (section === 'vocab') {
    return [...new Set(levelIds.flatMap(level => (manifests.vocab.levels?.[level]?.files || []).map(f => `data/vocab/${f}`)))];
  }
  if (section === 'reading') {
    const ids = Array.isArray(levelIds) ? levelIds : [levelIds];
    return [...new Set(ids.flatMap(level => (manifests.reading.levels?.[level]?.files || []).map(f => `data/reading/${f}`)))];
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
  const raw = settled.flat();
  if (state.section === 'reading') {
    state.questions = raw.flatMap(p => {
      if (!p || !Array.isArray(p.questions)) return [];
      return p.questions.map((q, i) => ({ ...q, type: 'reading', level: q.level || p.level, passageId: p.id, title: p.title, passage: p.passage, passageTags: p.tags || [], passageTranslation: p.passageTranslation || '', targetMinutes: Number(q.targetMinutes || p.targetMinutes || 5), passageQuestionIndex: i + 1, passageQuestionTotal: p.questions.length, isLastInPassage: i === p.questions.length - 1 }));
    }).map(normalizeQuestion).filter(Boolean);
  } else {
    state.questions = raw.map(normalizeQuestion).filter(Boolean);
  }
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
  if (state.section === 'reading') stopReadingTimer();
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
  const preset = $('quizCountPreset')?.value || state.quiz.countMode || '10';
  state.quiz.countMode = preset;
  const raw = Number.parseInt($('quizCountInput')?.value, 10);
  const requested = preset === 'all' ? Infinity : preset === 'custom' ? (Number.isFinite(raw) ? raw : 10) : Number.parseInt(preset,10);
  state.quiz.total = requested === Infinity ? 999999 : Math.min(500, Math.max(1, requested || 10));
  if ($('quizCountInput')) $('quizCountInput').value = state.quiz.total === 999999 ? 10 : state.quiz.total;
  state.quiz.difficulty = state.section === 'vocab' ? [...state.levels] : [...state.levels];
  ensureDifficultySet();
  if (state.section === 'vocab') state.levels = [...state.quiz.difficulty];
  resetQuestionArea();
  renderAll();
  await fetchData();
  const pool = state.section === 'vocab' ? buildQuizPool() : [...state.filtered];
  state.quiz.pool = [...pool];
  state.quiz.seen.clear();
  state.quiz.sessionRecent = [];
  state.quiz.remaining = requested === Infinity ? pool.length : Math.min(state.quiz.total, pool.length);
  state.quiz.active = true;
  state.quiz.answered = 0;
  state.quiz.correct = 0;
  state.quiz.current = null;
  if (!pool.length) { showEmpty('この設定では問題がありません', '難易度や問題形式を変更してください。'); return; }
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
  return String(text ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function choiceText(choice) {
  if (choice == null) return '';
  if (typeof choice === 'string' || typeof choice === 'number') return String(choice).trim();
  return String(choice.text ?? choice.label ?? choice.value ?? '').trim();
}

function canonicalAnswer(choices, answer = '') {
  const explicit = String(answer ?? '').trim();
  const explicitKey = normalizeText(explicit);
  if (explicitKey) {
    const exactChoice = (Array.isArray(choices) ? choices : [])
      .map(choiceText)
      .find(text => normalizeText(text) === explicitKey);
    if (exactChoice) return exactChoice;
  }
  const flagged = (Array.isArray(choices) ? choices : [])
    .find(c => c && typeof c === 'object' && c.correct === true);
  return choiceText(flagged) || explicit;
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

function readingQuestion(q) {
  const choices = Array.isArray(q.choices) ? q.choices : [];
  return {
    mode: 'reading',
    question: q.question || '',
    prompt: q.prompt || '本文の内容に基づいて最も適切なものを選べ。',
    answer: canonicalAnswer(choices, q.answer),
    choices,
    passageTitle: q.title || '',
    passage: q.passage || '',
    explanation: q.explanation || '本文の内容と設問条件を確認しましょう。'
  };
}

function genericQuestion(q) {
  const rawChoices = Array.isArray(q.choices) ? q.choices : [];
  const choices = rawChoices.map(choiceText).filter(Boolean);
  const answer = canonicalAnswer(rawChoices, q.answer || q.meaning || '');
  return { mode: 'standard', question: q.question || q.word || '', prompt: q.prompt || '', answer, choices: fillChoices(answer, choices) };
}

function makeQuestion(q) { return q.type === 'vocab' ? vocabQuestion(q) : q.type === 'reading' ? readingQuestion(q) : genericQuestion(q); }

function showQuestion(q = state.questions[state.index], opts = {}) {
  if (!q) return;
  if (q.type === 'reading') return showReadingQuestion(q, opts);
  const view = makeQuestion(q);
  const choices = [...view.choices].sort(() => Math.random() - 0.5);
  const area = $('questionArea');
  area.classList.remove('hidden');
  $('emptyState').style.display = 'none';
  area.innerHTML = `<div class="q-meta"><span class="tag">${escapeHtml(q.level || state.levels[0])}</span><span>${opts.customQuiz ? `${state.quiz.answered + 1} / ${state.quiz.remaining}` : opts.study ? '復習スケジュール' : `${state.index + 1} / ${state.questions.length}`}</span><span class="tag">${escapeHtml(vocabModes[view.mode]?.label || view.mode)}</span></div><div class="question">${escapeHtml(view.question)}<small>${escapeHtml(view.prompt || '')}</small></div><div class="answers" id="answers"></div><div id="explain"></div><div class="next-row"><button id="nextBtn" class="primary-btn" style="display:none">次の問題</button></div>`;
  const box = $('answers');
  const answerKey = normalizeText(canonicalAnswer(view.choices, view.answer));
  choices.forEach(text => {
    const b = document.createElement('button');
    b.className = 'answer-btn';
    b.textContent = choiceText(text);
    b.onclick = () => answer(q, normalizeText(b.textContent) === answerKey, b, view, opts);
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

function stopReadingTimer() {
  const t=state.readingTimer;
  if (t.interval) clearInterval(t.interval);
  t.interval=null; t.running=false; t.paused=false; t.startedAt=0; t.elapsedMs=0; t.passageId=null;
}
function currentReadingElapsedMs() {
  const t=state.readingTimer;
  if (!t.running) return t.elapsedMs;
  return t.elapsedMs + (Date.now() - t.startedAt);
}
function formatTimer(ms) {
  const total=Math.max(0,Math.floor(ms/1000));
  const h=Math.floor(total/3600), m=Math.floor((total%3600)/60), s=total%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function startOrResumeReadingTimer(q) {
  const t=state.readingTimer;
  if (t.passageId!==q.passageId) {
    stopReadingTimer();
    t.passageId=q.passageId; t.targetMinutes=Number(q.targetMinutes||5); t.elapsedMs=0;
    t.startedAt=Date.now(); t.running=true; t.paused=false;
    t.interval=setInterval(updateReadingTimerUI,250);
    return;
  }
  if (t.running || t.paused) return;
  t.startedAt=Date.now(); t.running=true; t.paused=false;
  t.interval=setInterval(updateReadingTimerUI,250);
}
function pauseReadingTimer() {
  const t=state.readingTimer; if (!t.running) return;
  t.elapsedMs=currentReadingElapsedMs(); t.running=false; t.paused=true;
  if (t.interval) clearInterval(t.interval); t.interval=null; updateReadingTimerUI();
}
function updateReadingTimerUI() {
  const box=document.querySelector('.reading-timer'); if (!box) return;
  const t=state.readingTimer; const elapsed=currentReadingElapsedMs(); const over=elapsed>t.targetMinutes*60000;
  const el=box.querySelector('.timer-time'); if (el) el.textContent=formatTimer(elapsed);
  const tgt=box.querySelector('.timer-target'); if (tgt) tgt.textContent=`目安 ${t.targetMinutes}分`;
  box.classList.toggle('over',over); box.classList.toggle('paused',t.paused);
  const btn=box.querySelector('[data-timer-toggle]'); if(btn) btn.textContent=t.paused||!t.running?'再開':'一時停止';
}
function readingTimeResultHtml() {
  const t=state.readingTimer; const ms=currentReadingElapsedMs(); const target=t.targetMinutes*60000; const diff=ms-target; const label=diff<=0?`目安より ${formatTimer(Math.abs(diff))} 早く完了`:`目安より ${formatTimer(diff)} 超過`;
  return `<div class="reading-time-result">⏱ 実測 <strong>${formatTimer(ms)}</strong> / 目安 ${t.targetMinutes}分 · ${label}</div>`;
}

function showReadingQuestion(q, opts = {}) {
  startOrResumeReadingTimer(q);
  const view = readingQuestion(q);
  const choices = [...view.choices].sort(() => Math.random() - 0.5);
  const area = $('questionArea');
  area.classList.remove('hidden');
  $('emptyState').style.display = 'none';
  const timerHtml = `<div class="reading-timer"><div><div class="timer-time">00:00:00</div><div class="timer-target">目安 ${Number(q.targetMinutes||5)}分</div></div><div class="timer-actions"><button type="button" data-timer-toggle>一時停止</button><button type="button" data-timer-reset>リセット</button></div></div>`;
  const passageHtml = `<div class="reading-passage"><div class="reading-title">${escapeHtml(view.passageTitle)}</div><div class="reading-text">${escapeHtml(view.passage)}</div></div>`;
  area.innerHTML = `${timerHtml}${passageHtml}<div class="q-meta"><span class="tag">${escapeHtml(q.level || 'reading')}</span><span>${opts.study ? '読解トレーニング' : `${state.index + 1} / ${state.questions.length}`}</span><span class="tag">長文</span><span class="tag">第${q.passageQuestionIndex}問 / ${q.passageQuestionTotal}</span></div><div class="question">${escapeHtml(view.question)}<small>${escapeHtml(view.prompt)}</small></div><div class="answers" id="answers"></div><div id="explain"></div><div class="next-row"><button id="nextBtn" class="primary-btn" style="display:none">次の問題</button></div>`;
  area.querySelector('[data-timer-toggle]').onclick=()=>{ if(state.readingTimer.running) pauseReadingTimer(); else { state.readingTimer.startedAt=Date.now(); state.readingTimer.running=true; state.readingTimer.paused=false; state.readingTimer.interval=setInterval(updateReadingTimerUI,250); } updateReadingTimerUI(); };
  area.querySelector('[data-timer-reset]').onclick=()=>{ state.readingTimer.elapsedMs=0; state.readingTimer.startedAt=Date.now(); state.readingTimer.running=true; state.readingTimer.paused=false; if(state.readingTimer.interval) clearInterval(state.readingTimer.interval); state.readingTimer.interval=setInterval(updateReadingTimerUI,250); updateReadingTimerUI(); };
  const box=$('answers');
  const answerKey = normalizeText(canonicalAnswer(view.choices, view.answer));
  choices.forEach(text=>{ const b=document.createElement('button'); b.className='answer-btn'; b.textContent=choiceText(text); b.onclick=()=>answer(q,normalizeText(b.textContent)===answerKey,b,view,opts); box.append(b); });
  $('nextBtn').onclick=()=>{ state.index++; if(state.index>=state.questions.length){ stopReadingTimer(); state.index=0; } showQuestion(state.questions[state.index], opts); };
  updateReadingTimerUI();
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
  const timeResult = q.type === 'reading' && q.isLastInPassage ? readingTimeResultHtml() : '';
  if (q.type === 'reading' && q.isLastInPassage) { if (q.passageTranslation) explanation += `\n\n【長文全訳】\n${q.passageTranslation}`; stopReadingTimer(); }
  $('explain').innerHTML = `<div class="explanation"><strong>${isCorrect ? '正解！' : '不正解'}</strong><br>${escapeHtml(explanation).replace(/\n/g, '<br>')}${timeResult}</div>`;
  $('nextBtn').style.display = 'inline-block';
  saveProgress();
}

function escapeHtml(s = '') { return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

$('startBtn').onclick = async () => {
  if (state.view === 'analytics') { state.view = 'study'; renderAll(); return; }
  const sessionMode = $('sessionModeSelect')?.value || (state.section === 'vocab' ? 'study' : 'quiz');
  if (sessionMode === 'quiz') {
    await startCustomQuiz();
    return;
  }
  startStudySession();
};
$('searchInput').oninput = e => { state.search = e.target.value; filterQuestions(); };
$('modeSelect').onchange = e => { state.mode = e.target.value; filterQuestions(); };
$('vocabModeSelect').onchange = e => { state.vocabMode = e.target.value; state.view='study'; resetQuizView(); renderAll(); filterQuestions(); };
$('sessionModeSelect').onchange = e => { state.quizMode = e.target.value; renderSessionControls(); };
$('quizCountPreset').onchange = e => { state.quiz.countMode = e.target.value; renderSessionControls(); };
$('quizCountInput').oninput = e => { const n = Math.min(500, Math.max(1, Number.parseInt(e.target.value,10)||1)); e.target.value = n; state.quiz.total = n; state.quiz.countMode = 'custom'; if ($('quizCountPreset')) $('quizCountPreset').value = 'custom'; };
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
  try { await bootManifests(); await fetchData(); loadAllVocabForAnalytics(); }
  catch (e) { updateInfo('データの読み込みに失敗しました。JSON/配信先を確認してください。'); console.error(e); }
})();
