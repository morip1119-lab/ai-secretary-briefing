# 死に際チャンネル

X（旧Twitter）で「頂点を極めた人物が、どう終わったのか」を投稿し続けるための半自動運用システム。

ネタの選定から原稿生成、安全チェック、画像カード作成、投稿枠の割り当て、書き出し、実績の集計までを 1 本のパイプラインで扱う。

**既定は「手動投稿モード」**。X API は使わず、本文と画像を書き出すところまでをシステムがやり、
投稿は自分で貼る。X API の申請が済んでいなくても今日から回せる。
あとから `config.posting.mode` を `api` にすれば、そのまま自動投稿に移行できる。

---

## 1. まず動かす

```bash
cd shinigiwa
npm install
npm run setup:fonts          # 画像カード用の日本語フォントを取得
cp .env.example .env         # LLM の API キーを入れる
node src/cli.js doctor       # 設定の診断
```

`.env` に要るのは基本これだけ。

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

キーが無い場合は `LLM_PROVIDER=mock` にすれば、`data/subjects.json` に手で書いた構成をそのまま組み立てる。

```bash
node src/cli.js subjects             # ネタ台帳をスコア順に見る
node src/cli.js generate --count 3   # 原稿を3本つくる
node src/cli.js review               # ブラウザで確認・編集・承認
node src/cli.js queue                # 投稿時刻を割り当て
node src/cli.js export               # 本文.txt と画像.png を書き出す
```

`review` を叩くと http://localhost:4321 が立ち上がる。左に原稿一覧、右に X 風のプレビューと安全チェックの結果が出る。
本文と出典はボタン一発でクリップボードにコピーでき、画像もその場で保存できる。

---

## 2. 毎日の流れ（手動投稿モード）

```
ネタ台帳            generate          review           queue           export        自分で貼る
data/subjects.json ──▶ 原稿+画像 ──▶ 人間が承認 ──▶ 投稿枠に割当 ──▶ txt+png ──▶ X に投稿
                          │                                                              │
                          └────────── guard（安全チェック）                              ▼
                                                                                  posted で記録
```

投稿したら **必ず `posted` で記録する**。ここを飛ばすと同じ人物がまた候補に出てくる。
レビュー画面の「投稿した」ボタンでも同じことができる。

| コマンド | 役割 |
| --- | --- |
| `node src/cli.js subjects` | ネタ台帳を「バズりやすさ」順に一覧表示 |
| `node src/cli.js generate --count 3` | 上位のネタから原稿と画像を生成 |
| `node src/cli.js review` | ブラウザで確認・本文編集・承認・コピー・投稿記録 |
| `node src/cli.js approve <postId>` | CLI から承認 |
| `node src/cli.js queue` | 承認済みを投稿枠（時刻）に割り当て |
| `node src/cli.js export` | 手動で貼れるよう `data/export/<日付>/` に書き出し |
| `node src/cli.js posted <postId> --url <投稿URL>` | 手動で投稿したことを記録 |
| `node src/cli.js auto` | 補充→予約→書き出しをまとめて実行 |
| `node src/cli.js metrics` / `stats` | 実績の取得と傾向の集計（API 連携時） |
| `node src/cli.js image <postId> --theme sepia` | 画像だけ作り直す |
| `node src/cli.js doctor` | 設定・キー・フォントの診断 |

`export` の書き出し先には `README.md` が入っていて、何時にどれを投稿するか、
投稿後にどのコマンドを叩けばいいかが並んでいる。

### API 連携に移行するとき

1. Developer Portal で App を作り、権限を "Read and write" にしてキーを4つ取る
2. `.env` に `X_API_KEY` 他を入れる
3. `config/config.json` の `posting.mode` を `"api"` に変える
4. `DRY_RUN=true` のまま `publish` を叩いて出力を確認してから `false` にする

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
これに加えて、**没後20年以内の題材には最大15点のボーナス**が付く（記憶が新しいほど反応が大きいため）。

### LLM に書かせる場合（既定）

`LLM_PROVIDER=anthropic` にすると、構成は LLM が組む。台帳側には `story.sections` を書かずに、
事実を箇条書きで並べた `facts` を置くだけでいい。

```jsonc
{
  "id": "…", "name": "…", "birthYear": 1969, "deathYear": 2023, "ageAtDeath": 54,
  "facts": [
    "1994年から10年続いたシットコムの主要キャスト",
    "後半シーズンのギャラは1話あたり100万ドル",
    "アルコールと処方薬の依存を回顧録で公表",
    "2023年10月、自宅で意識不明の状態で発見",
    "検死結果はケタミンの急性作用による事故死"
  ],
  "sources": ["…"]
}
```

**LLM は平気で年号と数字を間違える。** そのため guard に数値の突き合わせを入れてあり、
本文に出てくる年号が生没年の外側だったり、享年が台帳と食い違うと警告が出る。
`causeConfirmed` と `sources` は LLM に触らせず、常に台帳の値を正としている。

---

## 4. 安全チェック（guard）

このジャンルは事実の扱いを一度間違えると、アカウントごと消える。
`generate` と `publish` の直前に必ず以下を検査し、**エラーが 1 つでもあれば投稿できない**。

| 検査 | 判定 | 内容 |
| --- | --- | --- |
| 存命者の除外 | エラー | `deathYear` が無い人物は扱えない |
| 出典 | エラー | 最低 1 件必須 |
| 断定の抑制 | エラー | `causeConfirmed: false` の題材は「〜とされる」等が無いと弾く |
| 死の手段 | エラー | 具体的な方法の描写を含む本文を弾く |
| 本文の URL | エラー | 禁止（リーチが落ちるうえ API 課金が 1 投稿 $0.20 になる） |
| 文字数 | エラー | 上限超過を弾く |
| 重複 | エラー | 同一人物を 180 日以内に再投稿しない |
| 没後年数 | 警告 | 没後 7 年以内は「裏取りしろ」と警告（ブロックはしない） |
| 数値の整合 | 警告 | 本文の年号・享年が台帳と食い違うと警告（LLM の捏造対策） |
| 名誉毀損リスク | 警告 | 「殺された」「犯人は」等の断定語を検出 |
| 自殺の扱い | 設定次第 | 既定では相談窓口を付けない。付ける設定にすると必須化される |

しきい値は全て `config/config.json` の `safety` で調整できる。緩めるときは、緩めた理由を自分で説明できる範囲に留めること。

詳しくは [docs/SAFETY.md](docs/SAFETY.md)。

---

## 5. 画像

既定では **文字だけのオリジナルカード**（1200×675 PNG）を自動生成する。

他人が撮った写真や報道写真を無断で使うと著作権・肖像権で確実に詰むので、既定では一切使わない設計にしている。
テーマは `noir` / `ash` / `sepia` の 3 種類。`config.image.theme` か `image` コマンドの `--theme` で切り替える。

---

## 6. 自動化

### ローカルの cron

```cron
# 毎朝7時に3本ぶん作って書き出しておく（手動投稿モード）
0 7 * * * cd /path/to/shinigiwa && /usr/bin/node src/cli.js auto >> /tmp/shinigiwa.log 2>&1
```

### GitHub Actions

リポジトリ直下の `.github/workflows/shinigiwa.yml` が定期的に `auto` を実行する。

- **手動投稿モード**では、原稿の在庫を補充してコミットするところまでを行う
- **API モード**に切り替えると、そのまま投稿までを行う
  1. Secrets に `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` を登録
  2. リポジトリ変数 `SHINIGIWA_LIVE` を `true` にするまで本番投稿はされない（二重の安全弁）
  3. 承認まで自動にするには `config.posting.autoApprove` を `true` にする

`autoApprove` を有効にしても、guard を通らなかった原稿は投稿されない。警告が 1 つでも出た原稿も既定では止まる。

---

## 7. お金の話

いまの設定（手動投稿）では **X API の課金は発生しない**。

| 項目 | 金額 | 備考 |
| --- | --- | --- |
| LLM API | 月 $2〜5 程度 | 1日3本を Claude Sonnet で生成した場合のおおよその目安 |
| X Premium | 別途月額 | 長文ポストと収益化の両方に必須。手動投稿でも要る |
| X API | $0 | 手動投稿モードでは使わない |

API モードに切り替えた場合のみ以下が発生する。

| 項目 | 金額 | 備考 |
| --- | --- | --- |
| 投稿 | $0.015 / 投稿 | 2026年2月から従量課金制。無料枠は廃止 |
| 投稿（URL入り） | $0.200 / 投稿 | 13倍。だから本文にもリプライにも URL を入れない |
| 読み取り | $0.005 / 件 | `metrics` を回すときだけ発生 |
| 1日3投稿の月額 | 約 $3 | 出典リプライ込み |

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
│   ├── export/<日付>/     手動投稿用の書き出し（txt + png + README）
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
npm test    # 24 件のテスト（整形・安全チェック・スコア・LLM出力の取り込み・時刻変換・折り返し）
```
