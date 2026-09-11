#!/bin/bash
# macOS / Linux 用。ダブルクリック（mac）か ./start.command で起動する。
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js が入っていません。https://nodejs.org/ja/download から LTS 版を入れてください。"
  echo ""
  read -r -n 1 -p "  何かキーを押すと閉じます"
  exit 1
fi

node scripts/start.mjs
