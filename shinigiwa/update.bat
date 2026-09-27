@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 死に際チャンネル / 更新

where node >nul 2>nul
if errorlevel 1 goto nonode

node scripts\update.mjs %*
if not errorlevel 1 goto done

rem 更新スクリプト自体が古いと、新しい更新スクリプトを取ってこられず詰む。
rem 失敗したときだけ、スクリプトを取り直してもう一度試す。
echo.
echo   更新スクリプトが古い可能性があるので、取り直して再実行します
node scripts\repair-updater.mjs
if errorlevel 1 goto norepair

echo.
node scripts\update.mjs %*

:done
pause
exit /b

:norepair
echo.
echo   更新スクリプトを取り直せませんでした。
echo   ネットワークと、GitHub にアクセスできるかを確認してください。
echo.
pause
exit /b 1

:nonode
echo.
echo   Node.js が入っていません。先に start.bat を実行してください。
echo.
pause
exit /b 1
