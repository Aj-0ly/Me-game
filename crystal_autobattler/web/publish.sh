#!/bin/bash
# Publish DTF to GitHub Pages in ONE command (run from the web/ folder).
# First time only: git remote add origin https://github.com/<you>/<repo>.git
set -e
cd "$(dirname "$0")"
git add -A
git commit -m "${1:-update $(date +%Y-%m-%d_%H%M)}" || true
git push -u origin main 2>/dev/null || git push -u origin master
echo "Pushed. GitHub → Settings → Pages → branch main, /(root). Live in ~1 min."
