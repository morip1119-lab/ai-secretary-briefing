@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 死に際チャンネル

where node >nul 2>nul
if errorlevel 1 goto nonode

node scripts\start.mjs
echo.
echo   終了しました。このウィンドウは閉じて構いません。
pause >nul
exit /b

:nonode
echo.
echo   Node.js が入っていません。
echo   いま開くページから LTS 版をインストールして、
echo   もう一度この start.bat をダブルクリックしてください。
echo.
start https://nodejs.org/ja/download
pause
exit /b 1
