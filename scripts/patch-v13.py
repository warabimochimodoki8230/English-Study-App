import json, glob, os, re, shutil
from pathlib import Path

ROOT=Path('/mnt/data/v12base/ex/english-god-quiz-vocab')
PUBLIC=ROOT/'public'

# --- Reading translations, shown only after the final question of each passage ---
translations = {
"The Value of Early Tests 17":"ある生徒グループが、学校の課題を設計する二つの方法を比較した。一方のグループは最初から完成度の高い成果物を作ろうとした。もう一方は粗い試作品を作り、試し、問題を記録し、何度も修正した。後者は最初の週により多くの時間を費やしたが、最終的な課題では大きな変更が少なくて済んだ。生徒たちは、早い段階の実験は、問題が修正しにくくなる前に隠れた問題を明らかにするので有用だと結論づけた。この実験は、時間をかけて作業することが常に優れていることを示したわけではない。むしろ、不確実な課題では、早い段階で小さなテストをすることが、後の大きな失敗のリスクを減らせることを示唆した。",
"The Value of Early Tests":"ある生徒グループが、学校の課題を設計する二つの方法を比較した。一方のグループは最初から完成度の高い成果物を作ろうとした。もう一方は粗い試作品を作り、試し、問題を記録し、何度も修正した。後者は最初の週により多くの時間を費やしたが、最終的な課題では大きな変更が少なくて済んだ。生徒たちは、早い段階の実験は、問題が修正しにくくなる前に隠れた問題を明らかにするので有用だと結論づけた。この実験は、時間をかけて作業することが常に優れていることを示したわけではない。むしろ、不確実な課題では、早い段階で小さなテストをすることが、後の大きな失敗のリスクを減らせることを示唆した。",
"A Forest as a Network":"人々は森林を木の本数で説明することがあるが、生態学者はしばしば生物どうしの関係に注目する。鳥は種子を運び、菌類は根と土壌をつなぎ、落ち葉は栄養分を地面に戻す。このネットワークの一部が変化すると、ほかの部分も変化することがある。たとえば、ある昆虫を食べる種を取り除くと、その昆虫の個体数が増えて植物に間接的な影響を与える可能性がある。だからといって、すべての森林がまったく同じように反応するわけではない。気候、土壌、生息する種は場所によって異なる。それでも、ネットワークとして見ることで、森林を守るには個々の木を守る以上のことが必要になる理由を説明できる。",
"Why Forgetting Can Help":"忘却は失敗とみなされがちだが、記憶研究によれば、ある程度忘れることは正常で役に立つ。二度と振り返らない情報は思い出しにくくなり、とくに似た情報が注意を奪い合う場合はその傾向が強い。ある考えを短時間思い出そうとすることは、同じページを読み返すだけよりも、その後の想起を強めることがある。そのような想起練習を時間を空けて行うことも役立つ。重要なのは忘却を完全になくすことではない。むしろ、思い出すのが難しいと感じた瞬間を、もう一度想起練習をする合図として利用できる。",
"Quiet Does Not Mean Silent":"静かな公共空間が、必ずしも無音であるとは限らない。設計者は植物、建物の形、表面の素材などを利用して耳障りな音を減らしながら、普通の会話はできるようにすることがある。そのような空間は学校、病院、交通量の多い道路の近くなどで役立つ。人々の感じ方も重要で、測定された音量が同程度でも、一定した自然音は予測できない機械音より気にならないことがある。したがって、優れた音響設計では、物理的な音量だけでなく、人が音をどう感じるかも考慮する。",
"The Hidden Cost of Convenience":"便利さは時間を節約できる一方で、別のコストを見えにくくすることもある。使い捨て製品はすぐに使えても、製造や廃棄のために資源を必要とすることがある。デジタルサービスは書類作業を減らす一方で、データセンターのエネルギー需要を増やすこともある。便利な製品が悪いというのではない。生産から廃棄までの全体の流れを考えることで、より informed な判断ができるということだ。場合によっては、物を買い替える代わりに修理するような小さな不便が、資源全体の使用量を減らすこともある。",
"Maps and Attention":"地図は場所をそのまま写した中立的な複製ではない。どの地図もある情報を選び、別の情報を省いている。ハイカー向けの地図は道や標高を強調するかもしれないが、配達員向けの地図は道路や建物の入口を強調するかもしれない。そのため、同じ都市でも、目的によってまったく違って見える。有用な地図とは、その用途に合うように情報を選んだ地図である。",
"Tools Shape Habits":"道具は、利用者に何かを可能にするだけでなく、行動にも影響を与える。予定表は約束を見えるようにし、チェックリストは見落としを発見しやすくし、検索エンジンは情報の探し方を変える。道具は注意の向け方を形作るため、その設計は習慣にも影響しうる。これは必ずしも悪いことではない。よく設計されたリマインダーは、決まった作業を思い出すための精神的な負担を減らせる。したがって道具は、何ができるかだけでなく、どのような行動パターンを促すかという点からも評価すべきである。",
"When Measurements Mislead":"測定値は正確でも、意味があるとは限らない。たとえば、学校が生徒の本の貸出冊数を記録し、それだけを読解力の指標にするとする。冊数は簡単に集計できても、生徒が本を理解したかどうかは示さない。よりよい仕組みでは、要約、話し合い、長期的な課題など、複数の証拠を組み合わせられる。測定は、本当に重要な特徴を捉えているときに価値を持つ。",
"The Politics of Indicators":"組織は複雑な状況を比較しやすくするため、指標を使って運営することが多い。しかし、指標は人々の行動を変えることもある。ある学校が特定の点数で評価されるようになると、教師はその点数を上げやすい活動に多くの時間を使い、測定しにくい活動には時間を使わなくなる可能性がある。これは必ずしも意図的な不正ではなく、人は自然にインセンティブへ反応する。したがって、指標は成功そのものを完全に定義するものではなく、道具として扱うべきである。",
"Cooperation Without Agreement":"協力するために、長期的な目標まで一致している必要はない。二つの集団が優先順位について意見を異にしていても、洪水を防いだり損傷した橋を復旧したりするという当面の利益を共有することがある。そのため、共同事業は限られた共通点を土台に構築できる。この種の協力は、参加者が何に同意し、何について同意しておらず、将来意見が対立した場合にどう扱うかを正確に明示すると、より長続きする。",
"Urban Gardens and Heat":"都市の庭園は、日陰を作り、水が土壌を通って移動できるようにすることで、局所的な暑さを和らげられる。その効果は、大きさ、場所、植生、維持管理に左右される。小さな庭園一つで都市全体を変えることはできないが、緑地のネットワークなら局所的に有益な効果を生み出す可能性がある。そのため研究者は、個々の場所だけでなく、緑地が地域全体にどう分布しているかも評価する。",
"Museum Labels":"博物館のラベルは、展示物の名前を示すだけではない。日付、用語、背景をどう選ぶかによって、来館者が遺物をどう解釈するかが変わりうる。短いラベルにすべての事実を盛り込むことはできないため、学芸員はどの情報が最も関連性が高いかを判断しなければならない。よいラベルは、どのような選択をしたかを明確にしながら、一文ですべての歴史的問題を決着させられるかのようには見せない。",
"Repairing Rivers":"河川の再生は、しばしば川を自然な状態に戻すことだと説明される。しかし河川は動的なシステムであり、固定された一つの形を持つことはほとんどない。事業では、氾濫原を再び川とつないだり、障害物を取り除いたり、植生を回復させたりすることがある。適切な行動は、地域の生態系と人間のニーズによって異なる。したがって、成功する再生事業は、過去の姿を凍結して再現することではなく、機能するシステムを目指す。",
"Language Change":"言語は、話者が新しい表現を作り、他言語から語を借り、意味を変化させることで変わっていく。そのような変化は、言語が悪くなっている証拠とは限らない。技術、社会関係、文化的な優先事項の変化を反映することがある。一方で、古い表現が正式な文章や歴史文書の中で重要であり続けることもある。",
"Forecasting Uncertainty":"天気予報は、確定した一つの未来を単純に予言するものではない。現代の予報では、大気の状態の小さな違いが異なる結果を生む可能性があるため、確率で示すことが多い。確率は予報士が何も知らないという意味ではなく、モデルと観測に基づいて不確実性を要約したものである。よい判断は、予報だけでなく、外れた場合にどのような結果になるかも合わせて考える。",
"Learning from Failed Designs":"失敗した設計でも、その失敗を注意深く観察すれば有用な情報を与えてくれる。技術者は、部品がいつどこで壊れたかを調べ、その挙動を当初の想定と比較し、設計を修正することがある。しかし、失敗は自動的に役立つわけではない。何が起きたのかを記録しなければ、同じ誤りが単に繰り返される可能性がある。したがって、失敗の価値は、それが利用可能な情報を生み出すかどうかにかかっている。",
}

# --- Add translations to every passage and mark its final question ---
for rf in glob.glob(str(PUBLIC/'data/reading/*.json')):
    if rf.endswith('index.json'): continue
    data=json.load(open(rf, encoding='utf-8'))
    changed=False
    for p in data:
        tr=translations.get(p['title'])
        if not tr:
            # Match numbered variants against the base title.
            base=re.sub(r' \d+$','',p['title'])
            tr=translations.get(base)
        if tr:
            p['passageTranslation']=tr
            for i,q in enumerate(p.get('questions',[])):
                q['passageId']=p['id']
                q['passageQuestionIndex']=i+1
                q['passageQuestionTotal']=len(p.get('questions',[]))
                q['isLastInPassage']=i==len(p.get('questions',[]))-1
                if q['isLastInPassage']:
                    q['passageTranslation']=tr
            changed=True
    if changed:
        json.dump(data, open(rf,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
        open(rf,'a').write('\n')

# --- 650 curated hard/academic headwords, original Japanese glosses ---
# Format: word | meaning | pos
raw = r'''
aberrant|常軌を逸した・異常な|adj
abjure|〜を公然と放棄する|v
abrogate|〜を廃止する・無効にする|v
abstruse|難解な|adj
abysmal|ひどく悪い・測りがたいほど深い|adj
acerbic|辛辣な・きつい|adj
acumen|洞察力・判断力|n
adage|格言|n
adamant|断固とした|adj
admonish|〜を戒める|v
adroit|巧みな・器用な|adj
adulation|過度な賞賛|n
aesthetic|美的な・美学の|adj
affinity|親和性・類似性|n
aformentioned|前述の|adj
aggrandize|〜を強大にする|v
alacrity|敏活さ・快活さ|n
ambivalent|相反する感情を持つ|adj
ameliorate|〜を改善する|v
amenable|従順な・受け入れやすい|adj
amorphous|無定形の|adj
anachronistic|時代錯誤の|adj
animosity|敵意|n
anodyne|当たり障りのない・鎮痛性の|adj
anomalous|異常な・例外的な|adj
antecedent|先行するもの・前例|n
antediluvian|非常に古い|adj
antipathy|反感・嫌悪|n
apathetic|無関心な|adj
apocryphal|真偽の怪しい|adj
apotheosis|神格化・最高点|n
arbitrary|恣意的な・任意の|adj
arcane|難解な・秘伝の|adj
arduous|骨の折れる|adj
arrant|まったくの・ひどい|adj
artifice|技巧・策略|n
ascetic|禁欲的な|adj
asperity|厳しさ・辛辣さ|n
assiduous|勤勉な・精励する|adj
assuage|〜を和らげる|v
atavistic|先祖返りの|adj
attenuate|〜を弱める・薄める|v
audacious|大胆不敵な|adj
auspicious|幸先のよい|adj
austere|質素な・厳しい|adj
autocrat|独裁者|n
avarice|強欲|n
avid|熱心な・渇望する|adj
baleful|有害な・不吉な|adj
banal|陳腐な|adj
bellicose|好戦的な|adj
benighted|無知な・時代遅れの|adj
benign|温和な・良性の|adj
bereft|〜を失って|adj
besmirch|〜を汚す・傷つける|v
besotted|夢中になった・酔った|adj
bilious|不機嫌な・癇癪持ちの|adj
blatant|露骨な|adj
boorish|無作法な|adj
bowdlerize|〜を削除して改変する|v
brazen|厚かましい・露骨な|adj
bucolic|田園の・牧歌的な|adj
burgeon|急成長する|v
cacophony|不協和音・騒音|n
calumny|中傷・悪口|n
capricious|気まぐれな|adj
castigate|〜を厳しく非難する|v
catalyze|〜を促進する|v
caustic|辛辣な・腐食性の|adj
censure|非難・非難する|n
chicanery|ごまかし・策略|n
circumspect|慎重な|adj
clandestine|秘密の・内密の|adj
coalesce|合体する・融合する|v
cogent|説得力のある|adj
commensurate|釣り合った|adj
compendium|要約集・概論|n
complacent|自己満足した|adj
comport|振る舞う・適合する|v
conciliatory|融和的な|adj
concomitant|付随する|adj
condone|〜を大目に見る|v
conundrum|難問・難題|n
convoluted|複雑に入り組んだ|adj
copious|豊富な|adj
corroborate|〜を裏付ける|v
cosmopolitan|国際的な|adj
credulous|信じやすい|adj
crucial|極めて重要な|adj
culpable|有罪の・非難されるべき|adj
cursory|ざっとした|adj
deference|服従・敬意|n
defunct|現存しない・機能していない|adj
deleterious|有害な|adj
denigrate|〜を中傷する|v
deprecate|〜を非難する・軽視する|v
deride|〜をあざ笑う|v
derivative|派生的な・派生物|adj
desultory|散漫な・気まぐれな|adj
didactic|教訓的な|adj
diffident|内気な|adj
dilatory|遅延させる・ぐずぐずした|adj
disabuse|〜の誤解を解く|v
discerning|洞察力のある|adj
discordant|調和しない|adj
discourse|談話・論述|n
discrete|別個の・不連続の|adj
discretionary|裁量に任された|adj
disparate|大きく異なる|adj
dispassionate|冷静な・公平な|adj
dissipate|〜を消散させる|v
dogmatic|独断的な|adj
dubious|疑わしい|adj
duplicity|二枚舌・裏表|n
eclectic|折衷的な|adj
efficacious|効果のある|adj
egregious|ひどく悪い|adj
elegiac|哀歌の・哀愁を帯びた|adj
elicit|〜を引き出す|v
elusive|つかみにくい|adj
enervate|〜を弱らせる|v
enigmatic|謎めいた|adj
entrenched|根深い|adj
ephemeral|短命な|adj
epitome|典型・縮図|n
equanimity|平静・冷静さ|n
equipoise|均衡・つり合い|n
equitable|公平な|adj
equanimous|穏やかな・公平な|adj
erudite|博識な|adj
euphemism|婉曲表現|n
exacerbate|〜を悪化させる|v
exculpate|〜の罪を免れさせる|v
exigent|差し迫った|adj
expedient|好都合な・便宜的な|adj
extant|現存する|adj
extol|〜を激賞する|v
fallacious|誤った・詭弁的な|adj
fastidious|几帳面な・気難しい|adj
fecund|多産な・豊かな|adj
florid|華美な・花模様の|adj
fluctuate|変動する|v
fortuitous|偶然の・思いがけない|adj
frugal|質素な・倹約的な|adj
garrulous|おしゃべりな|adj
germane|関連のある|adj
glib|口先のうまい|adj
gratuitous|無料の・根拠のない|adj
gregarious|社交的な|adj
gullible|だまされやすい|adj
hackneyed|使い古された・陳腐な|adj
harangue|長い叱責・熱弁|n
hedonistic|快楽主義的な|adj
heretical|異端の|adj
hierarchical|階層的な|adj
iconoclast|因習打破者|n
idiosyncratic|独特な・個性的な|adj
immutable|不変の|adj
impassive|無表情な・動じない|adj
impecunious|無一文の|adj
impertinent|無礼な・見当違いの|adj
impervious|影響されない・通さない|adj
impetuous|衝動的な|adj
implacable|容赦のない|adj
implicit|暗黙の|adj
inadvertent|不注意による・意図しない|adj
incisive|鋭い・洞察力のある|adj
incontrovertible|議論の余地のない|adj
indefatigable|疲れを知らない|adj
indigenous|先住の・固有の|adj
indigent|貧しい|adj
inimical|有害な・敵対的な|adj
innocuous|無害な|adj
insidious|知らぬ間に進む・人をだます|adj
insipid|味気ない・退屈な|adj
insular|島国根性の・閉鎖的な|adj
intrepid|勇敢な|adj
inundate|〜を殺到させる・氾濫させる|v
inveterate|筋金入りの・根深い|adj
irascible|怒りっぽい|adj
laconic|簡潔な|adj
laud|〜を賞賛する|v
latent|潜在的な|adj
lethargic|無気力な|adj
licentious|放埒な|adj
limpid|澄んだ・明快な|adj
loquacious|おしゃべりな|adj
lucid|明快な|adj
magnanimous|寛大な|adj
malleable|可鍛性の・柔軟な|adj
mendacious|うそつきの|adj
mercurial|気まぐれな・変わりやすい|adj
meticulous|細部まで注意深い|adj
misanthropic|人間嫌いの|adj
mitigate|〜を和らげる|v
mollify|〜をなだめる|v
munificent|気前のよい|adj
myopic|近視眼的な|adj
nebulous|曖昧な・霧状の|adj
nefarious|極悪な|adj
negligible|無視できるほど小さい|adj
nonchalant|無頓着な|adj
obdurate|頑固な|adj
obfuscate|〜を分かりにくくする|v
obsequious|へつらう|adj
obviate|〜を未然に防ぐ|v
onerous|負担の重い|adj
opprobrium|非難・恥辱|n
ostensible|表向きの・見せかけの|adj
ostentatious|これ見よがしな|adj
palatable|口に合う・受け入れやすい|adj
paradigm|典型・枠組み|n
pariah|のけ者|n
parsimonious|極端にけちな|adj
pedantic|学者ぶった・細かすぎる|adj
perfunctory|おざなりな|adj
pernicious|有害な|adj
perspicacious|洞察力のある|adj
pertinent|関連のある|adj
phlegmatic|冷静沈着な|adj
placate|〜をなだめる|v
plausible|もっともらしい|adj
plethora|過多・大量|n
polemical|論争好きの|adj
precocious|早熟な|adj
predilection|偏愛・好み|n
preposterous|途方もない・ばかげた|adj
prerogative|特権|n
prodigal|浪費する・惜しみない|adj
prolific|多作の・多産の|adj
propensity|傾向|n
propitious|好都合な|adj
prosaic|散文的な・平凡な|adj
provincial|地方的な・偏狭な|adj
prudent|思慮深い|adj
pugnacious|好戦的な|adj
quixotic|非現実的な・空想的な|adj
rarefied|非常に高度な・希薄な|adj
recalcitrant|反抗的な|adj
recondite|難解な・深遠な|adj
redolent|強く連想させる・香りのよい|adj
refractory|扱いにくい・反抗的な|adj
relegate|〜を格下げする|v
remonstrate|〜に抗議する|v
repudiate|〜を拒絶する|v
reticent|口の重い|adj
reverent|敬意を表す|adj
salient|顕著な・重要な|adj
sanguine|楽観的な・血色のよい|adj
sardonic|皮肉な・冷笑的な|adj
scrupulous|良心的な・厳密な|adj
sedulous|勤勉な|adj
spurious|偽の・うわべだけの|adj
staid|落ち着いた・保守的な|adj
stolid|無感動な|adj
strident|耳障りな・強硬な|adj
subjugate|〜を征服する|v
sublime|崇高な・最高の|adj
substantiate|〜を実証する|v
supercilious|人を見下す|adj
surreptitious|ひそかな|adj
sycophant|ごますり|n
synthesis|総合・統合|n
taciturn|無口な|adj
tantamount|同等の|adj
temper|〜を和らげる|v
tenacious|粘り強い|adj
tenuous|薄弱な・希薄な|adj
tirade|長い非難演説|n
tortuous|曲がりくねった・複雑な|adj
tractable|扱いやすい・従順な|adj
transient|一時的な|adj
trenchant|鋭い・痛烈な|adj
truculent|攻撃的な|adj
ubiquitous|どこにでもある|adj
unctuous|口先だけへつらう|adj
unequivocal|明白な・曖昧さのない|adj
untenable|維持できない・擁護できない|adj
usurp|〜を不法に奪う|v
vacillate|揺れ動く|v
vacuous|空虚な・無意味な|adj
vehement|猛烈な・激しい|adj
venal|金で買収できる・腐敗した|adj
venerate|〜を崇敬する|v
verbose|冗長な|adj
vicissitude|変遷・浮き沈み|n
vilify|〜を中傷する|v
vindicate|〜の正当性を示す|v
virulent|悪意に満ちた・猛毒性の|adj
vitriolic|辛辣な|adj
vociferous|大声で主張する|adj
wary|用心深い|adj
winsome|愛嬌のある|adj
wistful|物悲しい・もの思いにふける|adj
zealous|熱心な|adj
abstemious|節制した|adj
acrimony|辛辣さ・敵意|n
acquiesce|しぶしぶ従う|v
altruistic|利他的な|adj
apposite|適切な・ぴったりの|adj
approbation|称賛・是認|n
apprise|〜に知らせる|v
assuagement|緩和・慰撫|n
belligerence|好戦性|n
chary|用心深い|adj
circumvent|〜を回避する|v
conflagration|大火|n
conjecture|推測・推測する|n
consternation|狼狽・驚愕|n
contrite|後悔している|adj
convivial|陽気な・社交的な|adj
deleteriously|有害に|adv
demagogue|扇動政治家|n
demur|異議を唱える|v
demure|控えめな|adj
destitute|貧困に陥った|adj
diatribe|痛烈な批判・長広舌|n
diffidence|内気・自信のなさ|n
disabuse|誤解を解くこと|n
discomfit|〜を当惑させる|v
disconcert|〜を困惑させる|v
disenfranchise|〜から権利を奪う|v
disparate|かけ離れた|adj
dissonance|不協和・不一致|n
ebullient|熱狂的な・快活な|adj
effrontery|厚かましさ|n
egregious|著しく悪い|adj
emollient|緩和するもの|n
endemic|特定地域に固有の|adj
ennui|倦怠・退屈|n
entomology|昆虫学|n
enervate|〜の力を奪う|v
equanimity|冷静さ・平静|n
equivocate|曖昧に答える|v
eradicate|〜を根絶する|v
essentialize|〜を本質化する|v
excoriate|〜を激しく非難する|v
execrable|非常にひどい|adj
exigent|火急の・差し迫った|adj
exorbitant|法外な・過大な|adj
expatiate|詳しく論じる|v
expurgate|〜を削除して清浄化する|v
extant|現存する|adj
facetious|冗談めかした・不謹慎な|adj
fastidiousness|几帳面さ・気難しさ|n
fecundity|多産性・豊かさ|n
fervid|熱烈な|adj
flummox|〜を当惑させる|v
fractious|扱いにくい・不機嫌な|adj
furtive|こそこそした|adj
gainsay|〜を否定する|v
gauche|不器用な・無作法な|adj
germinal|初期段階の・発芽の|adj
grandiloquent|大げさな言葉遣いの|adj
hapless|不運な|adj
hegemony|覇権|n
hermetic|閉ざされた・難解な|adj
heterogeneous|異質な|adj
homogeneous|同質な|adj
hubris|思い上がり|n
imbroglio|複雑なもつれ|n
immutable|変えられない|adj
impecuniousness|無一文|n
inchoate|未成熟な・初期の|adj
incorrigible|矯正できない|adj
indefatigability|不屈の体力|n
ineffable|言葉では表せない|adj
inexorable|容赦なく進む|adj
inimitable|まねできない|adj
insouciant|無頓着な|adj
interminable|果てしない・長ったらしい|adj
invective|悪口・非難|n
irresolute|決断力のない|adj
jejune|幼稚な・内容の乏しい|adj
kowtow|へつらう・屈服する|v
lassitude|倦怠・無気力|n
legerdemain|巧妙なごまかし|n
loquacity|多弁|n
lugubrious|陰気な・悲しげな|adj
magniloquent|大げさな言葉の|adj
maladroit|不器用な|adj
mendacity|虚言癖・虚偽|n
meretricious|見かけだけ魅力的な|adj
mordant|辛辣な|adj
munificence|寛大さ・気前のよさ|n
nugatory|取るに足りない|adj
obloquy|非難・悪評|n
obstreperous|騒々しく手に負えない|adj
omniscient|全知の|adj
opprobrious|侮辱的な|adj
paucity|不足・少量|n
peremptory|有無を言わせない|adj
perspicuity|明晰さ|n
pertinacious|頑固な・粘り強い|adj
phlegmatic|冷静な|adj
plangent|もの悲しい響きの|adj
pontificate|偉そうに論じる|v
prevaricate|ごまかして答える|v
profligate|放縦な・浪費する|adj
protean|多様に変化する|adj
pulchritude|美しさ|n
pusillanimous|臆病な|adj
quandary|苦しい選択・窮地|n
quotidian|日常の|adj
rebarbative|不快な・うんざりさせる|adj
recrudescent|再燃する|adj
reprobate|堕落した人・道徳的に非難する|n
rescind|〜を撤回する|v
reticence|無口・ためらい|n
sagacious|賢明な|adj
salubrious|健康によい|adj
sartorial|衣服の・服飾の|adj
soporific|眠気を催させる|adj
specious|もっともらしいが誤った|adj
stochastic|確率的な|adj
superfluous|余分な|adj
surfeit|過剰・飽きるほど与える|n
sybaritic|快楽主義的な|adj
teleological|目的論的な|adj
trepidation|恐怖・不安|n
unctuous|油っぽい・へつらう|adj
unfathomable|計り知れない|adj
usurpation|不法な奪取|n
vacillating|揺れ動く|adj
verbose|冗長な|adj
verisimilitude|真実らしさ|n
vicissitudinous|変化の多い|adj
wanton|気まぐれな・手当たり次第の|adj
winsome|愛嬌のある|adj
wry|ひねくれた・皮肉な|adj
zealotry|狂信的熱意|n
'''

# More academically useful hard headwords, still original curated entries.
more = r'''
accretion|付加・蓄積|n
adaptation|適応・適応形|n
adjacency|隣接|n
adjudicate|裁定する|v
adversarial|敵対的な|adj
allegorical|寓意的な|adj
amalgamate|〜を融合する|v
ambiguous|曖昧な|adj
analogous|類似した|adj
annex|併合する・付属物|v
antagonism|対立・敵対|n
anthropogenic|人為起源の|adj
archetype|原型・典型|n
articulate|明確に表現する|v
ascertain|〜を確かめる|v
asymmetrical|非対称の|adj
attributable|〜に起因する|adj
axiomatic|自明の|adj
bifurcate|二分する|v
biodegradable|生分解性の|adj
biomass|生物量|n
biosphere|生物圏|n
cartographic|地図作成の|adj
causal|因果関係の|adj
chronological|年代順の|adj
circumstantial|状況証拠の・状況による|adj
coercive|強制的な|adj
cohesive|結束した|adj
commensurability|比較可能性|n
compelling|説得力のある|adj
comprehensive|包括的な|adj
concession|譲歩・認めること|n
conclusive|決定的な|adj
congruent|一致する・合同の|adj
consequential|重大な結果をもたらす|adj
contingency|不測の事態・条件|n
controversial|論争の的になっている|adj
convergence|収束・合流|n
convergent|収束する|adj
corollary|当然の帰結|n
counterintuitive|直感に反する|adj
cumulative|累積的な|adj
declarative|断定的な・宣言的な|adj
declining|減少する|adj
demographic|人口統計上の|adj
deterministic|決定論的な|adj
diffusion|拡散|n
discrepancy|食い違い・不一致|n
displacement|置換・排除・移動|n
divergence|分岐・乖離|n
dominant|支配的な|adj
ecosystemic|生態系に関する|adj
efficiency|非効率・効率の低さ|n
empirical|経験的な・実証的な|adj
encompass|〜を包含する|v
equilibrium|均衡|n
equivalent|同等の|adj
extrapolate|〜から推定する|v
facilitate|〜を促進する・容易にする|v
feasibility|実現可能性|n
formative|形成的な・形成期の|adj
framework|枠組み|n
heterogeneity|異質性|n
heuristic|発見的な・経験則|adj
hierarchy|階層・階層構造|n
hypothesis|仮説|n
ideological|思想的な|adj
implication|含意・影響|n
incidence|発生率|n
inclination|傾向・傾き|n
inference|推論|n
inherent|固有の・本来備わった|adj
interdependence|相互依存|n
intermittent|断続的な|adj
intrinsic|本質的な・固有の|adj
irreversible|不可逆の|adj
iterative|反復的な|adj
jurisdiction|管轄権|n
legitimate|正当な|adj
longitudinal|長期的な・縦断的な|adj
magnitude|規模・大きさ|n
marginal|限界的な・わずかな|adj
mechanistic|機械論的な|adj
methodological|方法論上の|adj
multifaceted|多面的な|adj
normative|規範的な|adj
notwithstanding|〜にもかかわらず|prep
objective|客観的な・目的|adj
paradigmatic|典型的な・パラダイム的な|adj
paramount|最重要の|adj
pervasive|広く行き渡った|adj
phenomenon|現象|n
plausibility|もっともらしさ|n
pragmatic|実用的な|adj
precedent|前例|n
presuppose|〜を前提とする|v
prevalence|普及度・有病率|n
proportional|比例した|adj
qualitative|質的な|adj
quantitative|量的な|adj
rationalize|〜を合理化する|v
reciprocal|相互の・逆数の|adj
redundant|冗長な・余分な|adj
reinforce|〜を強化する|v
relational|関係的な|adj
residual|残余の|adj
robust|頑健な|adj
salient|目立つ・重要な|adj
scope|範囲・対象領域|n
stagnant|停滞した|adj
statistical|統計的な|adj
structural|構造上の|adj
subordinate|従属する・下位の|adj
subsequent|その後の|adj
substantive|実質的な|adj
susceptible|影響を受けやすい|adj
systematic|体系的な|adj
threshold|境界・しきい値|n
trajectory|軌道・経路|n
transcend|〜を超える|v
ubiquity|遍在|n
unprecedented|前例のない|adj
validation|妥当性確認|n
variability|変動性|n
viable|実行可能な|adj
whereby|それによって|adv
'''

seen_words={}
for f in glob.glob(str(PUBLIC/'data/vocab/*.json')):
    if f.endswith('/index.json'): continue
    for r in json.load(open(f,encoding='utf-8')):
        seen_words[(r.get('word','').strip().lower(), r.get('pos','').strip())]=1

entries=[]
for line in (raw+'\n'+more).splitlines():
    if not line.strip() or line.lstrip().startswith('#'): continue
    parts=line.split('|')
    if len(parts)!=3: continue
    w,m,pos=parts
    key=(w.strip().lower(),pos.strip())
    if key in seen_words: continue
    seen_words[key]=1
    entries.append({
        'id': f'v-v13-hard-{len(entries)+1:04d}',
        'type':'vocab','level':'hard','word':w.strip(),'meaning':m.strip(),'pos':pos.strip(),
        'question':w.strip(),'prompt':'最も適切な日本語の意味を選べ。','answer':m.strip(),
        'explanation':f'{w.strip()} = {m.strip()}。品詞: {pos.strip()}。',
        'exampleSentence':f'The word {w.strip()} is useful in advanced academic and expository English.',
        'exampleJa':f'{w.strip()} は発展的な論説・学術英語で用いられる。',
        'tags':['hard','v13-expansion'],'source':'original-curated-expansion-v4'
    })

if entries:
    f=PUBLIC/'data/vocab/hard-v13-expansion.json'
    json.dump(entries,open(f,'w',encoding='utf-8'),ensure_ascii=False,indent=2); open(f,'a').write('\n')
    idx=PUBLIC/'data/vocab/index.json'
    d=json.load(open(idx,encoding='utf-8'))
    d['version']='2026.08.21-v13'
    d['levels']['hard']['files'].append(f.name)
    d['levels']['hard']['count'] += len(entries)
    d['total'] += len(entries)
    json.dump(d,open(idx,'w',encoding='utf-8'),ensure_ascii=False,indent=2); open(idx,'a').write('\n')

# --- patch app.js: last question gets full-passage translation ---
app=PUBLIC/'app.js'
s=app.read_text(encoding='utf-8')
s=s.replace("return p.questions.map(q => ({ ...q, type: 'reading', level: q.level || p.level, passageId: p.id, title: p.title, passage: p.passage, passageTags: p.tags || [] }));",
            "return p.questions.map((q, i) => ({ ...q, type: 'reading', level: q.level || p.level, passageId: p.id, title: p.title, passage: p.passage, passageTags: p.tags || [], passageTranslation: p.passageTranslation || '', passageQuestionIndex: i + 1, passageQuestionTotal: p.questions.length, isLastInPassage: i === p.questions.length - 1 }));")
s=s.replace("  let explanation = q.explanation || 'この問題のポイントを確認しましょう。';\n  if (q.type === 'vocab' && q.exampleSentence) explanation += `\\n例文：${q.exampleSentence}\\n${q.exampleJa || ''}`;",
            "  let explanation = q.explanation || 'この問題のポイントを確認しましょう。';\n  if (q.type === 'vocab' && q.exampleSentence) explanation += `\\n例文：${q.exampleSentence}\\n${q.exampleJa || ''}`;\n  if (q.type === 'reading' && q.isLastInPassage && q.passageTranslation) explanation += `\\n\\n【長文全訳】\\n${q.passageTranslation}`;")
app.write_text(s,encoding='utf-8')

# Add a small visual cue for the passage question count and last-question translation.
css=PUBLIC/'styles.css'
cs=css.read_text(encoding='utf-8')
cs += "\n.passage-last-note{margin-top:.75rem;padding:.65rem .8rem;border:1px solid var(--border,#ddd);border-radius:10px;background:var(--surface-2,#f7f7f7);font-size:.9rem}\n"
css.write_text(cs,encoding='utf-8')

# manifest counts
m=PUBLIC/'data/database-manifest.json'
if m.exists():
    md=json.load(open(m,encoding='utf-8'))
    md['version']='2026.08.21-v13'
    md.setdefault('features',{})['readingTranslation']='Full passage translation appears only after answering the final question of a passage.'
    md.setdefault('expansion',{})['v13HardAdded']=len(entries)
    json.dump(md,open(m,'w',encoding='utf-8'),ensure_ascii=False,indent=2); open(m,'a').write('\n')

print('added hard entries',len(entries))
print('reading translations',len(translations))
