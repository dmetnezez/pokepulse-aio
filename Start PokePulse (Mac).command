#!/bin/bash
# Double-click to start PokéPulse AIO on macOS.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Opening the download page..."
  echo "Install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -r -p "Press Enter to close."
  exit 1
fi

fail() { echo; echo "Something went wrong. Copy the error above and send it for help."; read -r -p "Press Enter to close."; exit 1; }

if [ ! -d node_modules ]; then
  echo "First run: installing (takes a few minutes)..."
  npm install --no-audit --no-fund || fail
fi
if [ ! -f .next/BUILD_ID ]; then
  echo "Building..."
  npm run build || fail
fi

echo
echo "PokéPulse is starting. Keep this window open — closing it stops the bot."
(sleep 6 && open "http://localhost:3000") &
caffeinate -i npm start   # caffeinate keeps the Mac awake while the bot runs
