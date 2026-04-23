RD Strat

Purpose
- New strategy sandbox based on clear rules and visual validation.

Folders
- data/: candles JSON + zones/levels JSON
- viewer/: TradingView-like chart viewer (HTML/JS)
- tools/: data export helpers

Quick start
1) Export candles (example range)
   cd rd_strat
   /Users/Jaro/miniconda3/envs/irm/bin/python tools/export_candles.py \
     --source-dir ../rd_backtest/fx_eurusd_1m_data/eurusd_1m_dukascopy \
     --start 2024-06-01 --end 2024-06-14 --timeframes 5,30

2) Open viewer (local server recommended)
   cd rd_strat
   python -m http.server 8000
   open http://localhost:8000/

Quick start (auto open)
- rd_strat/tools/start_viewer.sh

Shortcut (restart + export + open)
- rd_strat/tools/start_chart.sh --start 2024-06-01 --end 2024-06-14

Shortcut (simple command)
- rd_strat/tools/rdchart

Optional alias (run from anywhere)
- Add to ~/.zshrc:
  alias rdchart="/Users/Jaro/Desktop/random/RD Codex/rd_strat/tools/rdchart"

Rules live in rules.md

Current viewer strategy backtest
1) Run the same supply/demand + liquidity logic outside the browser
   python3 rd_strat/tools/backtest_viewer_strategy.py \
     --candles rd_strat/data/vantage/eurusd_5min.json \
     --zones rd_strat/data/vantage/zones_5min.json \
     --timeframe 5min \
     --out-dir rd_strat/data/vantage/backtest_5min

2) Outputs
- `zones_validated.json`: zones after run/impulse/liquidity filtering
- `trades.csv`: trade list produced by the current viewer rules
- `summary.csv`: aggregate `R` stats
- `settings.json`: exact run configuration

Vercel deployment
1) Treat `rd_strat/` as its own static site.
2) In Vercel, set the project root directory to `rd_strat`.
3) Deploy it as a plain static project. No build step is required.
4) The included `vercel.json` redirects `/` to `/viewer/` and keeps JSON data revalidating cleanly.

CLI flow
- `cd rd_strat`
- `vercel`
- `vercel --prod`

Recommended
- Use Vercel for sharing and remote access.
- Use localhost only while iterating locally on viewer code or data exports.
