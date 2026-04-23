import argparse
from pathlib import Path
from typing import List

import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate supply/demand zones from candle JSON.")
    parser.add_argument(
        "--candles",
        default=str(Path("rd_strat/data/vantage/eurusd_5min.json")),
        help="Path to candle JSON (list of {time,open,high,low,close}).",
    )
    parser.add_argument(
        "--out",
        default=str(Path("rd_strat/data/vantage/zones_5min.json")),
        help="Output zones JSON path.",
    )
    parser.add_argument("--atr-period", type=int, default=14)
    parser.add_argument("--atr-mult", type=float, default=2.0)
    parser.add_argument("--min-run", type=int, default=3, help="Minimum consecutive candles for impulse.")
    parser.add_argument(
        "--zone-extend-bars",
        type=int,
        default=None,
        help="How many bars to extend zones (default: 1 day based on timeframe).",
    )
    parser.add_argument("--min-gap-bars", type=int, default=3, help="Minimum bars between zones of same type.")
    parser.add_argument("--max-zones", type=int, default=0, help="Keep only most recent zones (0 = no limit).")
    return parser.parse_args()


def compute_atr(df: pd.DataFrame, period: int) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            (df["high"] - df["low"]).abs(),
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.rolling(period).mean()


def load_candles(path: Path) -> pd.DataFrame:
    data = pd.read_json(path)
    df = pd.DataFrame(data)
    df["time"] = pd.to_datetime(df["time"], unit="s")
    df = df.set_index("time").sort_index()
    return df


def find_retest_end(
    df: pd.DataFrame, start_idx: int, zone_low: float, zone_high: float
) -> int:
    n = len(df)
    for k in range(start_idx, n):
        if df["low"].iloc[k] <= zone_high and df["high"].iloc[k] >= zone_low:
            return k
    return -1


def find_zones(
    df: pd.DataFrame,
    atr_period: int,
    atr_mult: float,
    min_run: int,
    zone_extend_bars: int,
    min_gap_bars: int,
) -> List[dict]:
    atr = compute_atr(df, atr_period)
    bull = df["close"] > df["open"]
    bear = df["close"] < df["open"]

    zones: List[dict] = []
    last_demand = -10**9
    last_supply = -10**9
    open_zones: List[dict] = []

    n = len(df)
    bull_run_len = 0
    bull_run_start = None
    bear_run_len = 0
    bear_run_start = None

    for idx in range(1, n):
        new_zones: List[dict] = []

        if bull.iloc[idx]:
            if bull_run_len == 0:
                bull_run_start = idx
            bull_run_len += 1
        else:
            if bull_run_len >= min_run and bull_run_start is not None:
                run_start = bull_run_start
                run_end = idx - 1
                base_idx = None
                for j in range(run_start - 1, -1, -1):
                    if bear.iloc[j]:
                        base_idx = j
                        break
                if base_idx is None:
                    bull_run_len = 0
                    bull_run_start = None
                    continue
                atr_val = atr.iloc[base_idx]
                move = df["close"].iloc[run_end] - df["open"].iloc[run_start]
                if pd.notna(atr_val) and atr_val > 0 and move >= atr_mult * atr_val:
                    if base_idx - last_demand >= min_gap_bars:
                        base = df.iloc[base_idx]
                        zone_low = float(base["low"])
                        zone_high = float(base["high"])
                        next_candle = df.iloc[run_start] if run_start is not None else None
                        if next_candle is not None and float(next_candle["low"]) < zone_low:
                            zone_low = float(next_candle["low"])
                        end_idx = n - 1 if zone_extend_bars <= 0 else min(base_idx + zone_extend_bars, n - 1)
                        new_zones.append(
                            {
                                "start": int(df.index[base_idx].timestamp()),
                                "end": int(df.index[end_idx].timestamp()),
                                "low": zone_low,
                                "high": zone_high,
                                "label": "Demand",
                                "color": "rgba(34,197,94,0.5)",
                                "run_len": int(bull_run_len),
                                "_end_idx": end_idx,
                                "_min_retest_idx": idx,
                            }
                        )
                        last_demand = base_idx
            bull_run_len = 0
            bull_run_start = None

        if bear.iloc[idx]:
            if bear_run_len == 0:
                bear_run_start = idx
            bear_run_len += 1
        else:
            if bear_run_len >= min_run and bear_run_start is not None:
                run_start = bear_run_start
                run_end = idx - 1
                base_idx = None
                for j in range(run_start - 1, -1, -1):
                    if bull.iloc[j]:
                        base_idx = j
                        break
                if base_idx is None:
                    bear_run_len = 0
                    bear_run_start = None
                    continue
                atr_val = atr.iloc[base_idx]
                move = df["open"].iloc[run_start] - df["close"].iloc[run_end]
                if pd.notna(atr_val) and atr_val > 0 and move >= atr_mult * atr_val:
                    if base_idx - last_supply >= min_gap_bars:
                        base = df.iloc[base_idx]
                        zone_low = float(base["low"])
                        zone_high = float(base["high"])
                        next_candle = df.iloc[run_start] if run_start is not None else None
                        if next_candle is not None and float(next_candle["high"]) > zone_high:
                            zone_high = float(next_candle["high"])
                        end_idx = n - 1 if zone_extend_bars <= 0 else min(base_idx + zone_extend_bars, n - 1)
                        new_zones.append(
                            {
                                "start": int(df.index[base_idx].timestamp()),
                                "end": int(df.index[end_idx].timestamp()),
                                "low": zone_low,
                                "high": zone_high,
                                "label": "Supply",
                                "color": "rgba(239,68,68,0.5)",
                                "run_len": int(bear_run_len),
                                "_end_idx": end_idx,
                                "_min_retest_idx": idx,
                            }
                        )
                        last_supply = base_idx
            bear_run_len = 0
            bear_run_start = None

        if new_zones:
            open_zones.extend(new_zones)

        if open_zones:
            next_open: List[dict] = []
            candle_close = df["close"].iloc[idx]
            for zone in open_zones:
                if idx >= zone["_min_retest_idx"]:
                    if zone["low"] <= candle_close <= zone["high"]:
                        zone["end"] = int(df.index[idx].timestamp())
                        zones.append(zone)
                        continue
                if idx >= zone["_end_idx"]:
                    zone["end"] = int(df.index[zone["_end_idx"]].timestamp())
                    zones.append(zone)
                    continue
                next_open.append(zone)
            open_zones = next_open

    for zone in open_zones:
        zone["end"] = int(df.index[zone["_end_idx"]].timestamp())
        zones.append(zone)

    for zone in zones:
        zone.pop("_end_idx", None)
        zone.pop("_min_retest_idx", None)

    return zones


def main() -> None:
    args = parse_args()
    candles_path = Path(args.candles).expanduser()
    out_path = Path(args.out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    df = load_candles(candles_path)
    zone_extend_bars = args.zone_extend_bars
    if zone_extend_bars is None:
        delta = df.index.to_series().diff().dropna().median()
        minutes = int(round(delta.total_seconds() / 60.0)) if pd.notna(delta) else 0
        zone_extend_bars = int(round(24 * 60 / minutes)) if minutes > 0 else 0

    zones = find_zones(
        df,
        atr_period=args.atr_period,
        atr_mult=args.atr_mult,
        min_run=args.min_run,
        zone_extend_bars=zone_extend_bars,
        min_gap_bars=args.min_gap_bars,
    )

    if args.max_zones > 0 and len(zones) > args.max_zones:
        zones = sorted(zones, key=lambda z: z["start"])
        zones = zones[-args.max_zones :]

    pd.Series(zones).to_json(out_path, orient="values")
    print(f"Saved {len(zones)} zones to {out_path}")


if __name__ == "__main__":
    main()
