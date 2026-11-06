@echo off
title PokePulse AIO
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  echo Install the LTS version, then double-click this file again.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing ^(takes a few minutes^)...
  call npm install --no-audit --no-fund || goto :fail
)
if not exist .next\BUILD_ID (
  echo Building...
  call npm run build || goto :fail
)

echo.
echo PokePulse is starting. Keep this window open - closing it stops the bot.
start "" cmd /c "timeout /t 6 >nul && start http://localhost:3000"
call npm start
goto :eof

:fail
echo.
echo Something went wrong. Copy the error above and send it for help.
pause
