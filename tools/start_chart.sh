#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="/Users/Jaro/miniconda3/envs/irm/bin/python"
if [[ ! -x "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
  else
    PYTHON_BIN=""
  fi
fi
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Python not found (need python3). Install it or set PYTHON_BIN in start_chart.sh." >&2
  exit 1
fi

SOURCE_DIR="$ROOT/../rd_backtest/fx_eurusd_1m_data/eurusd_1m_dukascopy"
VANTAGE_DIR="$ROOT/data/vantage_1m"
FXCM_DIR="$ROOT/data/fxcm_weekly"
BROKER="auto"
OUT_DIR=""
if [[ -d "$VANTAGE_DIR" ]] && ls "$VANTAGE_DIR"/EURUSD_*_1m.parquet >/dev/null 2>&1; then
  SOURCE_DIR="$VANTAGE_DIR"
elif [[ -d "$FXCM_DIR" ]] && ls "$FXCM_DIR"/EURUSD_*_W*.parquet >/dev/null 2>&1; then
  SOURCE_DIR="$FXCM_DIR"
fi
START_DATE=""
END_DATE=""
TIMEFRAMES="5,30"
SKIP_EXPORT=1
REGEN_ZONES=0
ZONE_ATR_MULT="1.5"
ZONE_MIN_RUN="1"
ZONE_MIN_GAP_BARS="3"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-dir)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --start)
      START_DATE="$2"
      shift 2
      ;;
    --end)
      END_DATE="$2"
      shift 2
      ;;
    --timeframes)
      TIMEFRAMES="$2"
      shift 2
      ;;
    --zones)
      REGEN_ZONES=1
      shift
      ;;
    --atr-mult)
      ZONE_ATR_MULT="$2"
      shift 2
      ;;
    --zone-min-run)
      ZONE_MIN_RUN="$2"
      shift 2
      ;;
    --min-gap-bars)
      ZONE_MIN_GAP_BARS="$2"
      shift 2
      ;;
    --broker)
      BROKER="$2"
      shift 2
      ;;
    --export)
      SKIP_EXPORT=0
      shift
      ;;
    --skip-export)
      SKIP_EXPORT=1
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
  done

if command -v lsof >/dev/null 2>&1; then
  PID=$(lsof -ti tcp:8000 || true)
  if [[ -n "${PID}" ]]; then
    echo "Stopping existing server on port 8000 (pid ${PID})..."
    kill "${PID}" || true
    sleep 0.3
  fi
fi

if [[ -z "${START_DATE}" ]] && [[ -z "${END_DATE}" ]]; then
  START_DATE=""
  END_DATE=""
fi

if [[ "$BROKER" != "auto" ]]; then
  if [[ "$BROKER" == "vantage" ]]; then
    SOURCE_DIR="$VANTAGE_DIR"
  elif [[ "$BROKER" == "fxcm" ]]; then
    if [[ -d "$ROOT/data/fxcm_1m" ]]; then
      SOURCE_DIR="$ROOT/data/fxcm_1m"
    else
      SOURCE_DIR="$FXCM_DIR"
    fi
  else
    echo "Unknown broker: $BROKER (use vantage|fxcm|auto)" >&2
    exit 1
  fi
fi

BROKER_LABEL="$BROKER"
if [[ "$BROKER" == "auto" ]]; then
  if [[ -d "$VANTAGE_DIR" ]] && ls "$VANTAGE_DIR"/EURUSD_*_1m.parquet >/dev/null 2>&1; then
    SOURCE_DIR="$VANTAGE_DIR"
    BROKER_LABEL="vantage"
  elif [[ -d "$ROOT/data/fxcm_1m" ]] && ls "$ROOT/data/fxcm_1m"/EURUSD_*_1m.parquet >/dev/null 2>&1; then
    SOURCE_DIR="$ROOT/data/fxcm_1m"
    BROKER_LABEL="fxcm"
  elif [[ -d "$FXCM_DIR" ]] && ls "$FXCM_DIR"/EURUSD_*_W*.parquet >/dev/null 2>&1; then
    SOURCE_DIR="$FXCM_DIR"
    BROKER_LABEL="fxcm"
  else
    BROKER_LABEL="dukascopy"
  fi
fi

OUT_DIR="$ROOT/data/$BROKER_LABEL"

if [[ ${SKIP_EXPORT} -eq 0 ]]; then
  echo "Exporting candles..."
  "$PYTHON_BIN" "$ROOT/tools/export_candles.py" \
    --source-dir "$SOURCE_DIR" \
    --start "$START_DATE" --end "$END_DATE" \
    --timeframes "$TIMEFRAMES" \
    --out-dir "$OUT_DIR"
  REGEN_ZONES=1
else
  echo "Skipping export. Use --export to regenerate JSON."
fi

if [[ ${REGEN_ZONES} -eq 1 ]]; then
  IFS=',' read -r -a TF_LIST <<< "$TIMEFRAMES"
  for tf in "${TF_LIST[@]}"; do
    tf="${tf// /}"
    candles_json="$OUT_DIR/eurusd_${tf}min.json"
    zones_json="$OUT_DIR/zones_${tf}min.json"
    if [[ -f "$candles_json" ]]; then
      echo "Generating zones ${tf}min (atr_mult=${ZONE_ATR_MULT}, min_run=${ZONE_MIN_RUN}, min_gap=${ZONE_MIN_GAP_BARS})..."
      "$PYTHON_BIN" "$ROOT/tools/generate_zones.py" \
        --candles "$candles_json" \
        --out "$zones_json" \
        --atr-mult "$ZONE_ATR_MULT" \
        --min-run "$ZONE_MIN_RUN" \
        --min-gap-bars "$ZONE_MIN_GAP_BARS"
    else
      echo "Skipping zones ${tf}min (missing ${candles_json})."
    fi
  done
fi

cd "$ROOT"
"$PYTHON_BIN" -m http.server 8000 >/tmp/rd_strat_http.log 2>&1 &
sleep 0.5
open http://localhost:8000/
