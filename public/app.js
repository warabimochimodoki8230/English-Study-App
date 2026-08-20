const state = {
  section: 'vocab',
  level: 'basic',
  mode: 'all',
  vocabMode: 'en-ja',
  search: '',
  questions: [],
  filtered: [],
  index: 0,
  score: {}
};

const sections = {
  vocab: {
    title: '単語',
    description: '基礎・標準はインプット優先。発展以降で文脈・類義語・語族まで広げます。',
    levels: [['basic', '🟢 基礎'], ['standard', '🔵 標準'], ['developed', '🟡 発展'], ['advanced', '🟠 上級'], ['hard', '🔴 難関']]
  },
  idiom: {
    title: '熟語',
    description: '重要熟語・群動詞・入試頻出表現。',
    levels: [['basic', '基礎'], ['standard', '標準'], ['entrance', '入試'], ['hard', '発展']]
  },
  grammar: {
    title: '文法',
    description: '総文法の確認と文法クイズ。',
    levels: [['overview', '3.1 総文法'], ['quiz', '3.2 文法クイズ']]
  },
  reading: {
    title: '長文',
    description: '長文コンテンツは準備中です。',
    levels: [['normal', '通常長文'], ['common', '共通テスト'], ['national', '国公立二次'], ['hard', '難関大']]
  }
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
const progressKey = 'eng-god-progress';
const key = (q) => `${q.type || state.section}:${q.id}`;
let manifests = null;

function loadProgress() {
  try {
    state.score = JSON.parse(localStorage.getItem(progressKey) || '{}');
  } catch {
    state.score = {};
  }
  renderStats();
}

function saveProgress() {
  localStorage.setItem(progressKey, JSON.stringify(state.score));
  renderStats();
}

function renderStats() {
  const vals = Object.values(state.score);
  const answered = vals.reduce((n, v) => n + (v.answered || 0), 0);
  const correct = vals.reduce((n, v) => n + (v.correct || 0), 0);
  $('answeredCount').textContent = answered;
  $('correctCount').textContent = correct;
  $('accuracy').textContent = answered ? `${Math.round((correct / answered) * 100)}%` : '0%';
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
      state.section = id;
      state.level = s.levels[0][0];
      state.search = '';
      resetQuestionArea();
      renderAll();
      await fetchData();
    };
    nav.append(b);
  }
}

function updateVocabModeOptions() {
  const sel = $('vocabModeSelect');
  if (!sel) return;

  const rank = levelRank[state.level] ?? 0;
  const allowed = Object.entries(vocabModes).filter(([, m]) => rank >= m.minLevel);
  sel.innerHTML = '';

  for (const [id, m] of allowed) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = m.label;
    sel.append(option);
  }

  if (!allowed.some(([id]) => id === state.vocabMode)) {
    state.vocabMode = 'en-ja';
  }
  sel.value = state.vocabMode;
  sel.style.display = state.section === 'vocab' ? 'block' : 'none';
}

function renderAll() {
  renderNav();
  const s = sections[state.section];
  $('pageTitle').textContent = s.title;
  $('pageDescription').textContent = s.description;

  const tabs = $('levelTabs');
  tabs.innerHTML = '';
  for (const [id, label] of s.levels) {
    const b = document.createElement('button');
    b.className = `level-btn ${state.level === id ? 'active' : ''}`;
    b.textContent = label;
    b.onclick = async () => {
      state.level = id;
      resetQuestionArea();
      renderAll();
      await fetchData();
    };
    tabs.append(b);
  }

  $('searchInput').value = state.search;
  $('modeSelect').value = state.mode;
  updateVocabModeOptions();
  updateInfo();
}

async function readManifest(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function bootManifests() {
  const [v, i, g] = await Promise.all([
    readManifest('data/vocab/index.json'),
    readManifest('data/idioms/index.json'),
    readManifest('data/grammar/index.json')
  ]);
  manifests = { vocab: v, idiom: i, grammar: g };
}

function urlsFor(section, level) {
  if (!manifests || section === 'reading') return [];
  if (section === 'vocab') {
    return (manifests.vocab.levels?.[level]?.files || []).map((f) => `data/vocab/${f}`);
  }
  const manifest = manifests[section];
  const files = manifest?.files?.[level] || [];
  const dir = section === 'idiom' ? 'idioms' : 'grammar';
  return files.map((f) => `data/${dir}/${f}`);
}

async function fetchData() {
  state.questions = [];
  updateInfo('読み込み中…');

  const urls = urlsFor(state.section, state.level);
  if (!urls.length) {
    state.filtered = [];
    updateInfo(state.section === 'reading' ? '長文データは準備中です' : '該当データなし');
    return;
  }

  const settled = await Promise.all(urls.map(async (u) => {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    } catch {
      return [];
    }
  }));

  state.questions = settled.flat().filter(Boolean).map(normalizeQuestion);
  filterQuestions();
}

function normalizeQuestion(q) {
  if (q.type === 'vocab' || (!q.type && q.word)) return { ...q, type: 'vocab' };
  if (Array.isArray(q.choices)) return q;
  return { ...q, choices: [] };
}

function filterQuestions() {
  let qs = [...state.questions];
  const query = state.search.trim().toLowerCase();

  if (query) {
    qs = qs.filter((x) => {
      const tags = Array.isArray(x.tags) ? x.tags.join(' ') : String(x.tags || '');
      return `${x.word || ''} ${x.meaning || ''} ${x.ja || ''} ${x.question || ''} ${x.prompt || ''} ${tags}`
        .toLowerCase()
        .includes(query);
    });
  }

  if (state.mode === 'weak') qs = qs.filter((x) => state.score[key(x)]?.wrong);
  if (state.mode === 'unanswered') qs = qs.filter((x) => !state.score[key(x)]?.answered);

  state.filtered = qs;
  updateInfo();
}

function updateInfo(text) {
  $('datasetInfo').textContent = text || `${sections[state.section].title} / ${state.level}：${state.filtered?.length || 0}問`;
}

function resetQuestionArea() {
  $('questionArea').classList.add('hidden');
  $('questionArea').innerHTML = '';
  $('emptyState').style.display = 'block';
  state.questions = [];
  state.filtered = [];
  updateInfo();
}

function startQuiz() {
  if (!state.filtered?.length) {
    $('emptyState').style.display = 'block';
    $('emptyState').querySelector('h2').textContent = state.section === 'reading' ? '長文データは準備中です' : '該当する問題がありません';
    return;
  }
  state.questions = [...state.filtered].sort(() => Math.random() - 0.5);
  state.index = 0;
  $('emptyState').style.display = 'none';
  showQuestion();
}

function fillChoices(correct, candidates) {
  const out = [correct];
  for (const c of candidates.filter(Boolean).sort(() => Math.random() - 0.5)) {
    if (!out.includes(c)) out.push(c);
    if (out.length >= 4) break;
  }
  return out;
}

function pickVocabMode(q) {
  const rank = levelRank[q.level || state.level] ?? 0;
  let selected = state.vocabMode;

  if (selected === 'random') {
    const allowed = rank < 2 ? ['en-ja', 'ja-en'] : ['en-ja', 'ja-en', 'context', 'synonym', 'family'];
    selected = allowed[Math.floor(Math.random() * allowed.length)];
  }

  if ((vocabModes[selected]?.minLevel ?? 0) > rank) selected = 'en-ja';
  return selected;
}

function vocabQuestion(q) {
  const pool = state.filtered.filter((x) => x.type === 'vocab' && x.word && x.word.toLowerCase() !== q.word.toLowerCase());
  const mode = pickVocabMode(q);

  if (mode === 'en-ja') {
    return {
      mode,
      question: q.word,
      prompt: `${q.pos ? `【${q.pos}】 ` : ''}最も適切な日本語の意味を選べ。`,
      answer: q.meaning,
      choices: fillChoices(q.meaning, pool.map((x) => x.meaning))
    };
  }

  if (mode === 'ja-en') {
    return {
      mode,
      question: q.meaning,
      prompt: 'この意味に合う英単語を選べ。',
      answer: q.word,
      choices: fillChoices(q.word, pool.map((x) => x.word))
    };
  }

  if (mode === 'context') {
    const example = q.exampleSentence || `${q.word} is used in this context.`;
    const escaped = q.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    const sentence = rx.test(example) ? example.replace(rx, '_____') : example;
    return {
      mode,
      question: sentence,
      prompt: '文脈に最も適する語を選べ。',
      answer: q.word,
      choices: fillChoices(q.word, pool.map((x) => x.word)),
      extra: q.exampleJa || ''
    };
  }

  if (mode === 'synonym') {
    const synonyms = Array.isArray(q.synonyms) ? q.synonyms.filter(Boolean) : [];
    if (!synonyms.length) return vocabQuestion({ ...q, _forceMode: 'en-ja' });
    const answer = synonyms[0];
    return {
      mode,
      question: q.word,
      prompt: '最も近い意味の語を選べ。',
      answer,
      choices: fillChoices(answer, pool.flatMap((x) => Array.isArray(x.synonyms) ? x.synonyms : []))
    };
  }

  const family = String(q.family || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (!family.length) return vocabQuestion({ ...q, _forceMode: 'en-ja' });
  const answer = family[0];
  return {
    mode,
    question: `「${q.word}」の語族・派生語として適切なものを選べ。`,
    prompt: '語彙のつながりも確認する。',
    answer,
    choices: fillChoices(answer, pool.flatMap((x) => String(x.family || '').split(';').map((s) => s.trim())))
  };
}

function genericQuestion(q) {
  let choices = [];
  if (Array.isArray(q.choices)) {
    choices = q.choices.map((c) => typeof c === 'string' ? c : c?.text).filter(Boolean);
  }
  const answer = q.answer || q.meaning || '';
  if (!choices.length && answer) choices = [answer];
  return {
    mode: 'standard',
    question: q.question || q.word || '',
    prompt: q.prompt || '',
    answer,
    choices: fillChoices(answer, choices)
  };
}

function makeQuestion(q) {
  return q.type === 'vocab' ? vocabQuestion(q) : genericQuestion(q);
}

function showQuestion() {
  const q = state.questions[state.index];
  if (!q) return;

  const view = makeQuestion(q);
  const choices = [...view.choices].sort(() => Math.random() - 0.5);
  const area = $('questionArea');
  area.classList.remove('hidden');
  area.innerHTML = `
    <div class="q-meta">
      <span class="tag">${escapeHtml(q.level || state.level)}</span>
      <span>${state.index + 1} / ${state.questions.length}</span>
      <span class="tag">${escapeHtml(view.mode)}</span>
    </div>
    <div class="question">${escapeHtml(view.question)}<small>${escapeHtml(view.prompt || '')}</small></div>
    <div class="answers" id="answers"></div>
    <div id="explain"></div>
    <div class="next-row"><button id="nextBtn" class="primary-btn" style="display:none">次の問題</button></div>
  `;

  const box = $('answers');
  choices.forEach((text) => {
    const b = document.createElement('button');
    b.className = 'answer-btn';
    b.textContent = text;
    b.onclick = () => answer(q, text === view.answer, b, view);
    box.append(b);
  });

  $('nextBtn').onclick = () => {
    state.index++;
    if (state.index >= state.questions.length) {
      state.index = 0;
      state.questions = [...state.filtered].sort(() => Math.random() - 0.5);
    }
    showQuestion();
  };
}

function answer(q, isCorrect, btn, view) {
  const k = key(q);
  const rec = state.score[k] || { answered: 0, correct: 0, wrong: 0 };
  rec.answered++;

  if (isCorrect) {
    rec.correct++;
    btn.classList.add('correct');
  } else {
    rec.wrong++;
    btn.classList.add('wrong');
    document.querySelectorAll('.answer-btn').forEach((b) => {
      if (b.textContent === view.answer) b.classList.add('correct');
    });
  }

  state.score[k] = rec;
  document.querySelectorAll('.answer-btn').forEach((b) => { b.disabled = true; });

  let explanation = q.explanation || 'この問題のポイントを確認しましょう。';
  if (q.type === 'vocab' && q.exampleSentence) {
    explanation += `\n例文：${q.exampleSentence}\n${q.exampleJa || ''}`;
  }

  $('explain').innerHTML = `<div class="explanation"><strong>${isCorrect ? '正解！' : '不正解'}</strong><br>${escapeHtml(explanation).replace(/\n/g, '<br>')}</div>`;
  $('nextBtn').style.display = 'inline-block';
  saveProgress();
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

$('startBtn').onclick = startQuiz;
$('shuffleBtn').onclick = async () => {
  state.mode = 'all';
  state.search = '';
  state.section = 'vocab';
  state.level = 'basic';
  state.vocabMode = 'en-ja';
  resetQuestionArea();
  renderAll();
  await fetchData();
  startQuiz();
};
$('searchInput').oninput = (e) => { state.search = e.target.value; filterQuestions(); };
$('modeSelect').onchange = (e) => { state.mode = e.target.value; filterQuestions(); };
$('vocabModeSelect').onchange = (e) => { state.vocabMode = e.target.value; resetQuestionArea(); renderAll(); };
$('resetProgress').onclick = () => {
  if (confirm('学習進捗をすべて削除します。よろしいですか？')) {
    state.score = {};
    saveProgress();
  }
};

(async () => {
  loadProgress();
  renderAll();
  try {
    await bootManifests();
    await fetchData();
  } catch (e) {
    updateInfo('データの読み込みに失敗しました。JSON/配信先を確認してください。');
    console.error(e);
  }
})();
