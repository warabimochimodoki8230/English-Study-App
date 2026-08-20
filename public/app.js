const state={section:'vocab',level:'basic',mode:'all',search:'',questions:[],index:0,answered:0,correct:0,score:{}};
const sections={
  vocab:{title:'単語',description:'重要語をレベル別に確認。普通の常用語から共通テスト・二次・英検まで。',levels:[['basic','🟢 基礎'],['standard','🔵 標準'],['developed','🟡 発展'],['advanced','🟠 上級'],['hard','🔴 難関']]},
  idiom:{title:'熟語',description:'重要熟語・群動詞・語法的なまとまりを、意味と文脈の両方から確認。',levels:[['basic','基礎'],['standard','標準'],['entrance','入試'],['hard','発展']]},
  grammar:{title:'文法',description:'総文法の確認と、入試型の文法クイズへ。',levels:[['overview','3.1 総文法'],['quiz','3.2 文法クイズ']]},
  reading:{title:'長文',description:'通常長文・共通テスト型から始め、国公立二次・難関大へ拡張。',levels:[['normal','通常長文'],['common','共通テスト'],['national','国公立二次'],['hard','難関大']]}
};
const files={vocab:{basic:["data/vocab/basic-01.json", "data/vocab/basic-02.json", "data/vocab/basic-03.json", "data/vocab/basic-04.json", "data/vocab/mega-basic-01.json","data/vocab/max2-basic-01.json","data/vocab/dict-basic-01.json"],standard:["data/vocab/standard-01.json", "data/vocab/standard-02.json", "data/vocab/standard-03.json", "data/vocab/standard-04.json", "data/vocab/mega-standard-01.json", "data/vocab/mega-standard-02.json","data/vocab/max2-standard-01.json","data/vocab/dict-standard-01.json","data/vocab/dict-standard-02.json"],developed:["data/vocab/developed-01.json", "data/vocab/developed-02.json", "data/vocab/developed-03.json", "data/vocab/developed-04.json", "data/vocab/mega-developed-01.json", "data/vocab/mega-developed-02.json","data/vocab/max2-developed-01.json","data/vocab/dict-developed-01.json"],advanced:["data/vocab/advanced-01.json", "data/vocab/advanced-02.json", "data/vocab/advanced-03.json", "data/vocab/advanced-04.json", "data/vocab/mega-advanced-01.json","data/vocab/max2-advanced-01.json","data/vocab/dict-advanced-01.json"],hard:["data/vocab/hard-01.json", "data/vocab/hard-02.json", "data/vocab/hard-03.json", "data/vocab/hard-04.json", "data/vocab/mega-hard-01.json", "data/vocab/mega-hard-02.json"]},idiom:{basic:['data/idioms/basic-01.json','data/idioms/basic-02.json'],standard:['data/idioms/standard-01.json','data/idioms/standard-02.json'],entrance:['data/idioms/entrance-01.json','data/idioms/entrance-02.json'],hard:['data/idioms/hard-01.json','data/idioms/hard-02.json']},grammar:{overview:['data/grammar/overview-01.json','data/grammar/overview-02.json'],quiz:['data/grammar/quiz-01.json','data/grammar/quiz-02.json']},reading:{normal:[],common:[],national:[],hard:[]}};


const $=id=>document.getElementById(id);
const key=q=>`${q.type}:${q.id}`;
function loadProgress(){try{state.score=JSON.parse(localStorage.getItem('eng-god-progress')||'{}')}catch{state.score={}}renderStats()}
function saveProgress(){localStorage.setItem('eng-god-progress',JSON.stringify(state.score));renderStats()}
function renderStats(){const vals=Object.values(state.score);const answered=vals.filter(v=>v.answered).length;const correct=vals.filter(v=>v.correct).length;$('answeredCount').textContent=answered;$('correctCount').textContent=correct;$('accuracy').textContent=answered?`${Math.round(correct/answered*100)}%`:'0%'}
function renderNav(){const nav=$('categoryNav');nav.innerHTML='';for(const [id,s] of Object.entries(sections)){const h=document.createElement('div');h.className='nav-section';h.textContent=id==='vocab'?'① 単語':id==='idiom'?'② 熟語':id==='grammar'?'③ 文法':'⑤ 長文';nav.append(h);const b=document.createElement('button');b.className=`nav-item ${state.section===id?'active':''}`;b.textContent=s.title;b.onclick=()=>{state.section=id;state.level=s.levels[0][0];resetQuestionArea();renderAll()};nav.append(b)}}
function renderAll(){renderNav();const s=sections[state.section];$('pageTitle').textContent=s.title;$('pageDescription').textContent=s.description;const tabs=$('levelTabs');tabs.innerHTML='';s.levels.forEach(([id,label])=>{const b=document.createElement('button');b.className=`level-btn ${state.level===id?'active':''}`;b.textContent=label;b.onclick=()=>{state.level=id;resetQuestionArea();renderAll()};tabs.append(b)});$('searchInput').value=state.search;$('modeSelect').value=state.mode;updateInfo()}
async function fetchJson(url){
  try{
    const sep=url.includes('?')?'&':'?';
    const res=await fetch(`${url}${sep}v=20260820` ,{cache:'no-cache'});
    if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  }catch(err){
    console.warn('[英語神問題] データ読み込み失敗:',url,err);
    return null;
  }
}

function normalizeVocab(items){
  if(!Array.isArray(items)) return [];
  return items.map((x,i)=>{
    if(!x||typeof x!=='object') return null;
    const word=String(x.word??x.question??'').trim();
    const meaning=String(x.meaning??x.ja??x.answer??'').trim();
    if(!word||!meaning) return null;
    return {
      ...x,
      type:'vocab',
      level:x.level||state.level,
      id:x.id||`v-${state.level}-${i}-${word}`,
      word,
      meaning,
      synonyms:Array.isArray(x.synonyms)?x.synonyms:[],
      family:typeof x.family==='string'?x.family:'',
      exampleSentence:x.exampleSentence||'',
      exampleJa:x.exampleJa||'',
      tags:Array.isArray(x.tags)?x.tags:[]
    };
  }).filter(Boolean);
}

async function fetchData(){
  state.questions=[];

  if(state.section==='vocab'){
    // 単語は index.json を正本にする。今後 JSON を追加しても app.js の改修は不要。
    const manifest=await fetchJson('data/vocab/index.json');
    let urls=[];
    if(manifest&&Array.isArray(manifest.files)){
      urls=manifest.files
        .map(x=>x&&x.file)
        .filter(Boolean)
        .map(file=>`data/vocab/${file}`);
    }
    // index.json が読めない場合の保険として、従来の固定リストを使用。
    if(!urls.length) urls=files.vocab?.[state.level]||[];

    const pieces=await Promise.all(urls.map(fetchJson));
    state.questions=pieces.flatMap(normalizeVocab).filter(q=>q.level===state.level);
  }else{
    const urls=files[state.section]?.[state.level]||[];
    const pieces=await Promise.all(urls.map(fetchJson));
    state.questions=pieces.flatMap(x=>Array.isArray(x)?x:[]);
  }
  filterQuestions();
}
function filterQuestions(){let qs=[...state.questions];const q=state.search.trim().toLowerCase();if(q)qs=qs.filter(x=>`${x.word||''} ${x.meaning||''} ${x.ja||''} ${(x.tags||[]).join(' ')}`.toLowerCase().includes(q));if(state.mode==='weak')qs=qs.filter(x=>state.score[key(x)]?.wrong);if(state.mode==='unanswered')qs=qs.filter(x=>!state.score[key(x)]?.answered);state.filtered=qs;updateInfo()}
function updateInfo(){$('datasetInfo').textContent=`${state.section} / ${state.level}：${state.filtered?.length||0}問`}
function resetQuestionArea(){$('questionArea').classList.add('hidden');$('questionArea').innerHTML='';$('emptyState').style.display='block';state.questions=[];state.filtered=[]}
function startQuiz(){if(!state.filtered?.length){$('emptyState').style.display='block';$('emptyState').querySelector('h2').textContent=state.section==='reading'?'長文データは準備中です':'該当する問題がありません';return}state.questions=[...state.filtered].sort(()=>Math.random()-.5);state.index=0;$('emptyState').style.display='none';showQuestion()}
function uniquePoolText(pool, exclude){return [...new Set(pool.filter(Boolean).filter(x=>x!==exclude))]}
function fillChoices(correct, candidates){
  const out=[correct];
  for(const c of candidates.sort(()=>Math.random()-.5)){
    if(c && !out.includes(c)) out.push(c);
    if(out.length>=4) break;
  }
  return out;
}
function buildVocabQuestion(q){
  const pool=state.questions.filter(x=>x.type==='vocab' && x.word && x.word!==q.word);
  const usable=['meaning','context','jp','synonym','family'].filter(m=>{
    if(m==='context') return !!q.exampleSentence;
    if(m==='synonym') return !!(q.synonyms&&q.synonyms.length);
    if(m==='family') return !!(q.family&&q.family.trim());
    return true;
  });
  const mode=usable[Math.floor(Math.random()*usable.length)]||'meaning';
  if(mode==='meaning'){
    const opts=fillChoices(q.meaning,uniquePoolText(pool.map(x=>x.meaning),q.meaning));
    return {mode,question:q.word,prompt:'最も適切な日本語の意味を選べ。',answer:q.meaning,choices:opts,extra:''};
  }
  if(mode==='context'){
    const idx=q.exampleSentence.toLowerCase().indexOf(q.word.toLowerCase());
    const sentence=idx>=0?q.exampleSentence.slice(0,idx)+'_____ '+q.exampleSentence.slice(idx+q.word.length):q.exampleSentence.replace(/\S+/, '_____');
    const opts=fillChoices(q.word,uniquePoolText(pool.map(x=>x.word),q.word));
    return {mode,question:sentence,prompt:'文脈に最も適する語を選べ。',answer:q.word,choices:opts,extra:q.exampleJa||''};
  }
  if(mode==='jp'){
    const opts=fillChoices(q.word,uniquePoolText(pool.map(x=>x.word),q.word));
    return {mode,question:q.meaning,prompt:'この意味に合う英単語を選べ。',answer:q.word,choices:opts,extra:''};
  }
  if(mode==='synonym'){
    const target=q.synonyms[0];
    const opts=fillChoices(target,uniquePoolText(pool.map(x=>x.synonyms?.[0]),target));
    return {mode,question:q.word,prompt:`最も近い意味の語を選べ。\n（${q.meaning}）`,answer:target,choices:opts,extra:''};
  }
  const fam=q.family.split(';').map(x=>x.trim()).filter(Boolean); const target=fam[0];
  const distract=uniquePoolText(pool.flatMap(x=>x.family?.split(';').map(y=>y.trim())||[]),target);
  const opts=fillChoices(target,distract);
  return {mode,question:`「${q.word}」の語族・派生語として最も適切なものを選べ。`,prompt:'語彙のネットワークまで確認。',answer:target,choices:opts,extra:''};
}
function makeQuestionView(q){return q.type==='vocab'?buildVocabQuestion(q):{mode:'standard',question:q.question,prompt:q.prompt||'',answer:q.answer,choices:q.choices.map(c=>c.text),extra:''};}
function showQuestion(){
  const q=state.questions[state.index]; if(!q)return;
  const v=makeQuestionView(q);
  const area=$('questionArea'); area.classList.remove('hidden');
  const choices=[...v.choices].sort(()=>Math.random()-.5);
  area.innerHTML=`<div class="q-meta"><span class="tag">${q.level||state.level}</span><span>${state.index+1} / ${state.questions.length}</span><span class="tag">${v.mode}</span></div><div class="question">${escapeHtml(v.question)}<small>${escapeHtml(v.prompt||'')}</small></div><div class="answers" id="answers"></div><div id="explain"></div><div class="next-row"><button id="nextBtn" class="primary-btn" style="display:none">次の問題</button></div>`;
  const box=$('answers');
  choices.forEach(text=>{const b=document.createElement('button');b.className='answer-btn';b.textContent=text;b.onclick=()=>answer(q,text===v.answer,b,v);box.append(b)});
  $('nextBtn').onclick=()=>{state.index++;showQuestion()};
  q._activeAnswer=v.answer;
}
function answer(q,isCorrect,btn,v){
  const k=key(q); const rec=state.score[k]||{answered:0,correct:0,wrong:0}; rec.answered+=1;
  if(isCorrect){rec.correct+=1;btn.classList.add('correct')}else{rec.wrong+=1;btn.classList.add('wrong')}
  state.score[k]=rec;
  document.querySelectorAll('.answer-btn').forEach(b=>b.disabled=true);
  if(!isCorrect){document.querySelectorAll('.answer-btn').forEach(b=>{if(b.textContent===q._activeAnswer)b.classList.add('correct')})}
  let explanation=q.explanation||'この問題のポイントを確認しましょう。';
  if(q.type==='vocab') explanation += `<br><br><strong>${escapeHtml(q.exampleSentence||'')}</strong><br>${escapeHtml(q.exampleJa||'')}`;
  $('explain').innerHTML=`<div class="explanation"><strong>${isCorrect?'正解！':'不正解'}</strong><br>${escapeHtml(explanation).replace(/&lt;br&gt;/g,'<br>')}</div>`;
  $('nextBtn').style.display='inline-block'; saveProgress();
}
function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
$('startBtn').onclick=startQuiz;$('shuffleBtn').onclick=()=>{state.mode='all';state.search='';state.section='vocab';state.level='basic';loadAndStart()};$('searchInput').oninput=async e=>{state.search=e.target.value;filterQuestions()};$('modeSelect').onchange=e=>{state.mode=e.target.value;filterQuestions()};$('resetProgress').onclick=()=>{if(confirm('学習進捗をすべて削除します。よろしいですか？')){state.score={};saveProgress()}};
async function loadAndStart(){renderAll();await fetchData();startQuiz()}
(async()=>{loadProgress();renderAll();await fetchData()})();
