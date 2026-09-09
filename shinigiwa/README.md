# 死に際チャンネル

X（旧Twitter）で「頂点を極めた人物が、どう終わったのか」を投稿し続けるための半自動運用システム。

ネタの選定から原稿生成、安全チェック、画像カード作成、予約、投稿、実績の集計までを 1 本のパイプラインで扱う。
最初は人間が承認してから出し、慣れてきたら承認を自動化して完全自動運転に切り替えられる構成になっている。

---

## 1. まず動かす

```bash
cd shinigiwa
npm install
npm run setup:fonts          # 画像カード用の日本語フォントを取得
cp .env.example .env         # X の認証情報などを入れる
node src/cli.js doctor       # 設定の診断
```

`doctor` が緑で揃えば準備完了。X の認証情報がまだでも、`DRY_RUN=true` のまま原稿と画像の生成だけは試せる。

```bash
node src/cli.js subjects         # ネタ台帳をスコア順に見る
node src/cli.js generate --count 3   # 原稿を3本つくる
node src/cli.js review           # ブラウザで確認・編集・承認
```

`review` を叩くと http://localhost:4321 が立ち上がる。左に原稿一覧、右に X 風のプレビューと安全チェックの結果が出る。

---

## 2. 毎日の流れ

```
ネタ台帳            generate          review           queue            publish
data/subjects.json ──▶ 原稿+画像 ──▶ 人間が承認 ──▶ 投稿枠に割当 ──▶ X に投稿
                          │                                              │
                          └────────── guard（安全チェック）              ▼
                                                                    metrics / stats
                                                                （何が伸びたかを集計）
```

| コマンド | 役割 |
| --- | --- |
| `node src/cli.js subjects` | ネタ台帳を「バズりやすさ」順に一覧表示 |
| `node src/cli.js generate --count 3` | 上位のネタから原稿と画像を生成 |
| `node src/cli.js review` | ブラウザで確認・本文編集・承認／却下 |
| `node src/cli.js approve <postId>` | CLI から承認 |
| `node src/cli.js queue` | 承認済みを投稿枠（時刻）に割り当て |
| `node src/cli.js publish` | 投稿時刻を過ぎたものを X に投稿 |
| `node src/cli.js auto` | 補充→予約→投稿をまとめて実行（cron 用） |
| `node src/cli.js metrics` | 投稿の実績を取得（読み取り課金あり） |
| `node src/cli.js stats` | 伸びたネタ・時間帯の傾向を集計 |
| `node src/cli.js image <postId> --theme sepia` | 画像だけ作り直す |
| `node src/cli.js doctor` | 設定・認証・フォントの診断 |

`DRY_RUN=true` の間、`publish` は API を叩かず本文をコンソールに出すだけ。
本番投稿に切り替えるのは、手動で 20〜30 本出してフォーマットが固まってからで十分。

---

## 3. ネタを追加する

`data/subjects.json` に人物を追加する。ここが品質のほぼ全てなので、事実は必ず一次に近い情報源で確認する。

```jsonc
{
  "id": "howard-hughes",            // 半角英数のユニークID
  "name": "ハワード・ヒューズ",
  "region": "overseas",             // japan | overseas
  "field": "実業家・映画製作者",
  "birthYear": 1905,
  "deathYear": 1976,                // 必須。ここが無いと投稿できない
  "ageAtDeath": 70,
  "deathCategory": "solitary",      // overdose/suicide/solitary/poverty/murder/accident/illness/execution/scandal
  "deathCause": "腎不全",
  "causeConfirmed": true,           // false にすると断定表現がエラーになる
  "hook": "1行目。人物名を出さず落差だけで惹きつける",
  "lead": "導入の2〜3行",
  "story": {
    "sections": [
      { "title": "すべてを手に入れた男", "bullets": ["…", "…"] },
      { "title": "あまりに静かな最期",   "bullets": ["…", "…"] }
    ]
  },
  "take": "この話が刺さる理由（自分の言葉で書く）",
  "closing": "余韻を残す締め",
  "signals": {                      // 0〜10。スコアリングに使う
    "fame": 9,            // どれだけ高く昇ったか
    "fallDepth": 9,       // どこまで落ちたか
    "jpRecognition": 6,   // 日本人にどれだけ通じるか
    "gapSurprise": 10,    // 落差の意外性
    "storyClarity": 9     // 一本の物語として明快か
  },
  "sources": ["https://en.wikipedia.org/wiki/Howard_Hughes"],
  "status": "ready"                 // idea | ready | used
}
```

スコアは `fame × fallDepth` を軸にしている。片方だけ高くても伸びない、というこのチャンネルの前提を式に落としてある。

### LLM に書かせる場合

`story.sections` を自分で埋めるのが面倒なら、`.env` の `LLM_PROVIDER` を `anthropic` か `openai` にする。
その場合 `facts` 配列に箇条書きで事実を放り込んでおけば、構成は LLM が組む。

ただし **LLM は平気で年号と数字を間違える**。`causeConfirmed` と `sources` は人間が入れる前提の設計にしてある。

---

## 4. 安全チェック（guard）

このジャンルは事実の扱いを一度間違えると、アカウントごと消える。
`generate` と `publish` の直前に必ず以下を検査し、**エラーが 1 つでもあれば投稿できない**。

| 検査 | 内容 |
| --- | --- |
| 存命者の除外 | `deathYear` が無い人物は扱えない |
| 没後年数 | 既定で没後 3 年未満は対象外（`safety.minYearsSinceDeath`） |
| 出典 | 最低 1 件必須 |
| 断定の抑制 | `causeConfirmed: false` の題材は「〜とされる」等が無いと弾く |
| 死の手段 | 具体的な方法の描写を含む本文を弾く（WHO の報道ガイドライン準拠） |
| 自殺の扱い | 相談窓口のフッターを自動付与。無いと弾く |
| 名誉毀損リスク | 「殺された」「犯人は」等の断定語を警告 |
| 本文の URL | 禁止（リーチが落ちるうえ API 課金が 1 投稿 $0.20 になる） |
| 文字数 | 上限超過を弾く |
| 重複 | 同一人物を 180 日以内に再投稿しない |

しきい値は全て `config/config.json` の `safety` で調整できる。緩めるときは、緩めた理由を自分で説明できる範囲に留めること。

詳しくは [docs/SAFETY.md](docs/SAFETY.md)。

---

## 5. 画像

既定では **文字だけのオリジナルカード**（1200×675 PNG）を自動生成する。

他人が撮った写真や報道写真を無断で使うと著作権・肖像権で確実に詰むので、既定では一切使わない設計にしている。
テーマは `noir` / `ash` / `sepia` の 3 種類。`config.image.theme` か `image` コマンドの `--theme` で切り替える。

---

## 6. 自動投稿

### ローカルの cron

```cron
*/30 * * * * cd /path/to/shinigiwa && /usr/bin/node src/cli.js auto >> /tmp/shinigiwa.log 2>&1
```

### GitHub Actions

リポジトリ直下の `.github/workflows/shinigiwa.yml` が 30 分おきに `auto` を実行する。

1. Secrets に `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` を登録
2. リポジトリ変数 `SHINIGIWA_LIVE` を `true` にするまで本番投稿はされない（二重の安全弁）
3. 完全自動にするには `config.posting.autoApprove` を `true` にする

`autoApprove` を有効にしても、guard を通らなかった原稿は投稿されない。警告が 1 つでも出た原稿も既定では止まる。

---

## 7. お金の話

| 項目 | 金額 | 備考 |
| --- | --- | --- |
| X API 投稿 | $0.015 / 投稿 | 2026年2月から従量課金制。無料枠は廃止 |
| X API 投稿（URL入り） | $0.200 / 投稿 | 13倍。だから本文にもリプライにも URL を入れない |
| X API 読み取り | $0.005 / 件 | `metrics` を回すときだけ発生 |
| **1日3投稿の月額** | **約 $3** | 出典リプライ込み |
| X Premium | 別途月額 | 長文ポストと収益化の両方に必須 |
| LLM API | 使う場合のみ | `mock` なら $0 |

収益化の条件は 2026年9月8日から新制度「Original Content Rewards」に変わっている。詳細と戦略は [docs/STRATEGY.md](docs/STRATEGY.md)。

---

## 8. ディレクトリ

```
shinigiwa/
├── config/config.json     運用ポリシー（投稿頻度・安全基準・スコア重み）
├── data/
│   ├── subjects.json      ネタ台帳 ← ここが資産
│   ├── posts/*.json       生成された原稿
│   ├── media/*.png        画像（原稿から再生成できるので git 管理外）
│   ├── state.json         投稿履歴（重複防止に使う）
│   └── metrics.json       実績
├── src/
│   ├── cli.js             コマンドの入口
│   ├── commands/          各コマンド
│   ├── core/              スコアリング・生成・整形・検査・画像・投稿
│   └── server/            レビュー用のローカル Web UI
├── scripts/setup-fonts.mjs
└── test/                  node --test
```

```bash
npm test    # 16 件のテスト（整形・安全チェック・時刻変換・折り返し）
```
