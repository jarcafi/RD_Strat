#!/usr/bin/env zsh

cat <<'EOF'
╔══════════════════════════════════════════════════════════════╗
║                      RD_Strat Shortcuts                     ║
╚══════════════════════════════════════════════════════════════╝

Git Workflow (single branch):
  deploy "message"      Stage, commit and push to 'main'

Viewer:
  python3 -m http.server 8000
  open http://localhost:8000/viewer/

Backtest:
  python3 tools/backtest_viewer_strategy.py --help

Utilities:
  shortcuts             Show this help

══════════════════════════════════════════════════════════════
This repo uses a single-branch backup workflow on 'main'.
══════════════════════════════════════════════════════════════
EOF
