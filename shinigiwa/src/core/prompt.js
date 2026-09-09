import { loadConfig } from './config.js';

export const DRAFT_SCHEMA = `{
  "badge": "悲劇 | 衝撃 | 栄光と転落 | 実話 のいずれか",
  "hook": "1行目。人物名を出さずに『落差』だけで惹きつける一文（40〜60字程度）",
  "lead": "2〜3行の導入。何年に何が起きたのかを提示し、結末を匂わせる",
  "sections": [
    { "title": "見出し（▼は付けない。8〜14字）", "bullets": ["事実ベースの一文", "事実ベースの一文"] }
  ],
  "take": "この話が刺さる理由。既存記事の要約ではなく、書き手独自の観察を1〜2文",
  "closing": "余韻を残す締めの1〜2文",
  "sources": ["参照した情報源のURL"]
}`;

export function systemPrompt(config = loadConfig()) {
  return `あなたは「${config.channel.name}」という X アカウントの構成作家です。
このアカウントは、頂点を極めた人物がどのような最期を迎えたかを淡々と描くことで、読者に人生の落差を突きつけます。

【書き方の原則】
1. 落差がすべて。「どれだけ高く昇ったか」を先に立てて、「どこまで落ちたか」で殴る。
2. 煽らない。事実の並べ方だけで感情を動かす。感嘆符や過剰な形容詞は使わない。
3. 一文は短く。箇条書きは1行1事実。読者はスマホで流し読みしている。
4. 数字と固有名詞を入れる（年、年齢、金額、期間）。具体が信頼を生む。
5. 死の「方法」の詳細は絶対に書かない。何が起きたかの事実だけに留める。
6. 確定していない死因は「〜とされる」「〜と報じられた」と必ずぼかす。
7. 存命の関係者を犯人扱い・断定的に非難しない。
8. 事実として確認できないことは書かない。想像で埋めない。空欄のままにする。
9. 年号・年齢・金額・期間は、与えられたデータに書かれている値だけを使う。
   与えられていない数字は「推測して補う」のではなく、その記述ごと省く。

【禁止】
- 本文中に URL を書くこと
- ハッシュタグの乱用
- 「衝撃の真実」「知られざる闇」のような中身のない煽り文句
- 他アカウントの文章の言い回しをそのままなぞること

【出力形式】
必ず次の JSON だけを出力する。前後に説明文やコードフェンスを付けない。
${DRAFT_SCHEMA}`;
}

export function userPrompt(subject, config = loadConfig()) {
  const ed = config.editorial;
  const [minSec, maxSec] = ed.sectionCount;
  const [minBul, maxBul] = ed.bulletsPerSection;

  const facts = JSON.stringify(
    {
      name: subject.name,
      nameEn: subject.nameEn,
      field: subject.field,
      region: subject.region,
      birthYear: subject.birthYear,
      deathYear: subject.deathYear,
      ageAtDeath: subject.ageAtDeath,
      deathCause: subject.deathCause,
      deathCategory: subject.deathCategory,
      causeConfirmed: subject.causeConfirmed,
      knownFacts: subject.facts ?? [],
      story: subject.story ?? null,
      sources: subject.sources ?? [],
      notes: subject.notes ?? '',
    },
    null,
    2,
  );

  return `次の人物について、上記の原則に従って1本のポストを構成してください。

【与えられた事実】
${facts}

【構成の指定】
- セクションは ${minSec}〜${maxSec} 個。時系列に「栄光 → 綻び → 転落 → 最期」と進むこと。
- 各セクションの箇条書きは ${minBul}〜${maxBul} 個。
- 最後のセクションのタイトルは必ず最期を示すもの（例：あまりに悲しい幕切れ）にする。
- 最期のセクションには享年を入れる。
- 全体で日本語 ${Math.floor(config.posting.charLimit / 4)} 字前後に収める。

【重要】
与えられた事実に含まれていない出来事を創作しないでください。
事実が足りずセクションが埋まらない場合は、セクション数を減らして構いません。`;
}
