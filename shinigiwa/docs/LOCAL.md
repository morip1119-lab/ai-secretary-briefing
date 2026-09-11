# 手元の PC で動かす（Windows / macOS）

ブラウザでポチポチ操作できる状態を、ターミナルをほとんど触らずに作るための手順。

必要なのは **Node.js だけ**。Git は要らない。

---

## 1. 置き場所を作って一式を落とす（Windows）

スタートメニューで「PowerShell」と打って **Windows PowerShell** を開き、
下のかたまりをまるごと貼り付けて Enter。

```powershell
$ProgressPreference = 'SilentlyContinue'

$parent = 'C:\Users\morip\LIVECREATE Dropbox\森川卓典\森川フォルダ\cursor\projects'
$branch = 'cursor/shinigiwa-x-auto-post-system-37df'
$dest   = Join-Path $parent 'shinigiwa'

$tmp = Join-Path $env:TEMP ('shinigiwa-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zip = Join-Path $tmp 'src.zip'

Invoke-WebRequest -Uri "https://codeload.github.com/morip1119-lab/ai-secretary-briefing/zip/refs/heads/$branch" -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force

$src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item -Path (Join-Path $src.FullName 'shinigiwa\*') -Destination $dest -Recurse -Force
Remove-Item $tmp -Recurse -Force

Copy-Item (Join-Path $dest '.env.example') (Join-Path $dest '.env')
explorer $dest
notepad (Join-Path $dest '.env')
```

これで
`C:\Users\morip\LIVECREATE Dropbox\森川卓典\森川フォルダ\cursor\projects\shinigiwa`
の中に一式が入り、エクスプローラーとメモ帳（`.env`）が開く。

> 別の PC でやる場合は `$parent` の行だけ自分の置き場所に書き換える。

macOS の場合は同じことをターミナルで。

```bash
cd ~/projects
curl -L -o /tmp/shinigiwa.zip \
  "https://codeload.github.com/morip1119-lab/ai-secretary-briefing/zip/refs/heads/cursor/shinigiwa-x-auto-post-system-37df"
unzip -q /tmp/shinigiwa.zip -d /tmp/shinigiwa-src
mv /tmp/shinigiwa-src/*/shinigiwa ./shinigiwa
cp shinigiwa/.env.example shinigiwa/.env
```

---

## 2. API キーを入れる

開いたメモ帳（`shinigiwa\.env`）の中に、この行がある。

```
ANTHROPIC_API_KEY=
```

`=` の右にキーを貼り付けて、上書き保存して閉じる。

- `=` の前後にスペースを入れない
- クォートで囲まない
- **`.env.example` のほうには絶対に書かない**（こちらは GitHub に公開されている）

キーがまだ無い状態でも動かしてみたいときは、`LLM_PROVIDER=mock` にしておけば
`data/subjects.json` に書いてある構成をそのまま組み立てる（文章の質は落ちる）。

---

## 3. 起動する

フォルダの中の **`start.bat` をダブルクリック**。

初回だけ、必要な部品のインストールとフォントの取得が走る（数分）。
終わると黒い画面にこう出て、ブラウザが勝手に開く。

```
✓ レビュー画面: http://localhost:4321
```

**黒い画面は閉じないこと。** これがサーバー本体で、閉じるとブラウザ側も動かなくなる。
終わるときは黒い画面で `Ctrl + C`、またはウィンドウを閉じる。

macOS は `start.command` をダブルクリック（初回だけ「開発元を確認できません」と出たら、
右クリック →「開く」）。

---

## 4. ブラウザでの流れ

| やること | 画面の操作 |
| --- | --- |
| 原稿をつくる | 左上の「生成」。ネタ台帳の上位から自動で選ばれる |
| 中身を直す | 右側の本文を直接編集して「保存」 |
| 画像を作り直す | テーマを選んで「画像を作る」 |
| 安全チェック | 保存するたびに右下に出る。赤が出ている間は承認できない |
| 承認する | 「承認」 |
| X に貼る | 「本文をコピー」→ X に貼る。画像は「画像を保存」 |
| 投稿したら | 投稿の URL を貼って「投稿した」 |

**「投稿した」を押すのを飛ばさないこと。** ここを押さないと同じ人物がまた候補に出てくる。

---

## 5. 更新を取り込む

こちら側でコードやネタ台帳を増やしたら、**`update.bat` をダブルクリック**すれば取り込める。

上書きされるのはコードだけで、次のものには触らない。

- `.env`（API キー）
- `data/posts/`、`data/state.json`、`data/metrics.json`（原稿と投稿履歴）
- `data/media/`、`data/export/`（画像と書き出し）

`data/subjects.json`（ネタ台帳）は **増えた分を足すだけ** のマージをする。
「投稿済み」の印は消えない。

`config/config.json`（運用方針）は勝手に上書きせず、変更があれば
`config/config.json.new` を横に置く。中身を見比べて、必要なら差し替える。

> まだ `master` に取り込まれていない間は、`update.bat` が
> 「ブランチを指定してください」と言ってくる。その場合は黒い画面で
> `node scripts\update.mjs --branch cursor/shinigiwa-x-auto-post-system-37df`

---

## 6. Dropbox の中に置く場合の注意

Dropbox 配下だと、`node_modules`（数万ファイル）を同期しようとして
インストールが固まったり、ファイルが壊れたりすることがある。

`start.bat` が Dropbox 配下だと気づいたら、
`node_modules` と `data/media` に Dropbox の除外フラグを自動で立てるようにしてある。
フォルダのアイコンに灰色のマイナス印が付いていれば効いている。

手で設定する場合は、フォルダを右クリック →「Dropbox」→「このフォルダを同期しない」。

---

## 7. うまくいかないとき

**「Node.js が入っていません」と出る**
`start.bat` が開いたページから LTS 版を入れて、もう一度ダブルクリック。

**ブラウザが開かない**
黒い画面に出ている `http://localhost:4321` を自分でコピーしてブラウザに貼る。

**「ポート 4321 はすでに使われています」と出る**
別のウィンドウで起動済み。そちらのブラウザをそのまま使う。
どうしても2つ動かしたいときは黒い画面で `node src\cli.js review --port 4322`。

**画面は出るが「サーバーに接続できません」と出る**
黒い画面を閉じてしまっている。`start.bat` をもう一度ダブルクリック。

**画像の日本語が豆腐（□）になる**
フォントの取得に失敗している。黒い画面で `npm run setup:fonts`。

**原稿の生成でエラーになる**
`.env` の `ANTHROPIC_API_KEY` を確認する。黒い画面で `node src\cli.js doctor` を叩くと
どこが欠けているかが並ぶ。
