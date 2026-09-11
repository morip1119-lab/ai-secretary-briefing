@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 死に際チャンネル / 更新

where node >nul 2>nul
if errorlevel 1 goto nonode

node scripts\update.mjs %*
pause
exit /b

:nonode
echo.
echo   Node.js が入っていません。先に start.bat を実行してください。
echo.
pause
exit /b 1
