import argparse
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import pandas as pd

PIP_SIZE = 0.0001


def parse_date(value: Optional[str]) -> Optional[pd.Timestamp]:
    if not value:
        return None
    return pd.Timestamp(value)


def parse_filename_range(path: Path) -> Optional[Tuple[pd.Timestamp, pd.Timestamp]]:
    parts = path.stem.split("_")
    if len(parts) < 2:
        return None
    if len(parts) >= 3 and parts[1].isdigit() and parts[2].upper().startswith("W"):
        try:
            year = int(parts[1])
            week = int(parts[2][1:])
            start = pd.Timestamp(datetime.strptime(f"{year}-W{week:02d}-1", "%G-W%V-%u"))
            end = start + pd.Timedelta(days=6)
            return start.normalize(), end.normalize()
        except Exception:
            return None
    try:
        dt = pd.Timestamp(parts[1])
        return dt.normalize(), dt.normalize()
    except Exception:
        return None


def list_parquet_ranges(source_dir: Path) -> List[Tuple[pd.Timestamp, pd.Timestamp]]:
    files = sorted(source_dir.glob("EURUSD_*.parquet"))
    ranges: List[Tuple[pd.Timestamp, pd.Timestamp]] = []
    for path in files:
        rng = parse_filename_range(path)
        if rng is None:
            continue
        ranges.append(rng)
    return ranges


def available_date_range(source_dir: Path) -> Tuple[pd.Timestamp, pd.Timestamp]:
    ranges = list_parquet_ranges(source_dir)
    if not ranges:
        raise FileNotFoundError(f"No parquet files in {source_dir}")
    starts = [rng[0] for rng in ranges]
    ends = [rng[1] for rng in ranges]
    return min(starts), max(ends)


def load_parquet_range(source_dir: Path, start: Optional[pd.Timestamp], end: Optional[pd.Timestamp]) -> pd.DataFrame:
    files = sorted(source_dir.glob("EURUSD_*.parquet"))
    if not files:
        raise FileNotFoundError(f"No parquet files in {source_dir}")

    selected: List[Path] = []
    for path in files:
        rng = parse_filename_range(path)
        if rng is not None:
            rng_start, rng_end = rng
            if start and rng_end < start.normalize():
                continue
            if end and rng_start > end.normalize():
                continue
        selected.append(path)

    if not selected:
        raise FileNotFoundError("No parquet files matched the date range.")

    range_start = start
    range_end = end
    if range_end is not None and range_end == range_end.normalize():
        range_end = range_end + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1)

    frames = []
    for idx, path in enumerate(selected, start=1):
        df = pd.read_parquet(path)
        if "DateTime" in df.columns:
            dt = pd.to_datetime(df["DateTime"], format="%m/%d/%Y %H:%M:%S.%f", errors="coerce")
            missing = dt.isna()
            if missing.any():
                dt.loc[missing] = pd.to_datetime(
                    df.loc[missing, "DateTime"],
                    format="%m/%d/%Y %H:%M",
                    errors="coerce",
                )
            df = df.copy()
            df["DateTime"] = dt
            df = df.dropna(subset=["DateTime"])
            df = df.set_index("DateTime")
        if {"BidOpen", "AskOpen", "BidHigh", "AskHigh", "BidLow", "AskLow", "BidClose", "AskClose"}.issubset(
            df.columns
        ) and not {"open", "high", "low", "close"}.issubset(df.columns):
            df = df.copy()
            df["open"] = (df["BidOpen"] + df["AskOpen"]) / 2.0
            df["high"] = (df["BidHigh"] + df["AskHigh"]) / 2.0
            df["low"] = (df["BidLow"] + df["AskLow"]) / 2.0
            df["close"] = (df["BidClose"] + df["AskClose"]) / 2.0
        if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
            df = df.copy()
            df.index = df.index.tz_convert(None)
        if range_start is not None or range_end is not None:
            df = df.sort_index()
            if range_start is not None and range_end is not None:
                df = df.loc[range_start:range_end]
            elif range_start is not None:
                df = df.loc[range_start:]
            elif range_end is not None:
                df = df.loc[:range_end]
        frames.append(df)
        print(f"Loaded {idx}/{len(selected)}: {path.name}")

    return pd.concat(frames).sort_index()


def resample_bars(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    rule = rule.replace("H", "h")
    agg = {
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
    }
    if "tickcount" in df.columns:
        agg["tickcount"] = "sum"
    if "avg_spread" in df.columns:
        agg["avg_spread"] = "mean"
    out = df.resample(rule, label="right", closed="right").agg(agg)
    out = out.dropna(subset=["open", "high", "low", "close"])
    return out


def to_lightweight_json(df: pd.DataFrame) -> List[dict]:
    rows = []
    for ts, row in df.iterrows():
        rows.append(
            {
                "time": int(pd.Timestamp(ts).timestamp()),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
            }
        )
    return rows


def generate_sample_overlays(df: pd.DataFrame, out_dir: Path) -> None:
    if df.empty:
        return
    closes = df["close"]
    low = float(closes.quantile(0.25))
    mid = float(closes.quantile(0.5))
    high = float(closes.quantile(0.75))

    idx = df.index
    start = idx.min()
    end = idx.max()
    total_seconds = (end - start).total_seconds()
    z1_start = start + pd.Timedelta(seconds=total_seconds * 0.2)
    z1_end = start + pd.Timedelta(seconds=total_seconds * 0.35)
    z2_start = start + pd.Timedelta(seconds=total_seconds * 0.6)
    z2_end = start + pd.Timedelta(seconds=total_seconds * 0.75)

    zones = [
        {
            "start": int(z1_start.timestamp()),
            "end": int(z1_end.timestamp()),
            "low": low - 0.0008,
            "high": low + 0.0008,
            "label": "Zone A",
            "color": "rgba(34,197,94,0.25)",
        },
        {
            "start": int(z2_start.timestamp()),
            "end": int(z2_end.timestamp()),
            "low": high - 0.0008,
            "high": high + 0.0008,
            "label": "Zone B",
            "color": "rgba(59,130,246,0.25)",
        },
    ]

    levels = [
        {"price": low, "label": "Q1", "color": "#10b981"},
        {"price": mid, "label": "Median", "color": "#f59e0b"},
        {"price": high, "label": "Q3", "color": "#3b82f6"},
    ]

    (out_dir / "zones.json").write_text(pd.Series(zones).to_json(orient="values"), encoding="utf-8")
    (out_dir / "levels.json").write_text(pd.Series(levels).to_json(orient="values"), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export EURUSD candles for rd_strat viewer.")
    parser.add_argument("--source-dir", required=True, help="Parquet source directory.")
    parser.add_argument("--start", help="Start date (YYYY-MM-DD).")
    parser.add_argument("--end", help="End date (YYYY-MM-DD).")
    parser.add_argument("--timeframes", default="5,30", help="Comma-separated minutes, e.g. 5,30")
    parser.add_argument("--out-dir", help="Output directory for JSON.")
    parser.add_argument("--no-overlays", action="store_true", help="Do not generate sample zones/levels.")
    parser.add_argument(
        "--overwrite-overlays",
        action="store_true",
        help="Overwrite existing zones/levels when generating samples.",
    )
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    if args.out_dir:
        out_dir = Path(args.out_dir)
    else:
        out_dir = Path(__file__).resolve().parent.parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    start = parse_date(args.start)
    end = parse_date(args.end)

    print(f"Loading parquet from {source_dir}...")
    min_date, max_date = available_date_range(source_dir)
    req_start = start.normalize() if start is not None else None
    req_end = end.normalize() if end is not None else None
    if req_start and req_end:
        req_days = (req_end - req_start).days + 1
    elif req_start and not req_end:
        req_end = max_date
        req_days = (req_end - req_start).days + 1
    elif req_end and not req_start:
        req_start = min_date
        req_days = (req_end - req_start).days + 1
    else:
        req_start = min_date
        req_end = max_date
        req_days = (req_end - req_start).days + 1

    req_start = req_start if req_start is None else max(req_start, min_date)
    req_end = req_end if req_end is None else min(req_end, max_date)

    try:
        df = load_parquet_range(source_dir, req_start, req_end)
    except FileNotFoundError as exc:
        fallback_end = max_date
        fallback_start = max_date - pd.Timedelta(days=req_days - 1)
        if fallback_start < min_date:
            fallback_start = min_date
        print(
            "No files matched the requested date range. "
            f"Using available range {fallback_start.date()} to {fallback_end.date()}."
        )
        df = load_parquet_range(source_dir, fallback_start, fallback_end)

    timeframes = [int(x.strip()) for x in args.timeframes.split(",") if x.strip()]
    for tf in timeframes:
        rule = f"{tf}min"
        bars = resample_bars(df, rule)
        payload = to_lightweight_json(bars)
        out_path = out_dir / f"eurusd_{tf}min.json"
        out_path.write_text(pd.Series(payload).to_json(orient="values"), encoding="utf-8")
        print(f"Saved {out_path} ({len(payload)} bars)")

    if not args.no_overlays:
        zones_path = out_dir / "zones.json"
        levels_path = out_dir / "levels.json"
        if (zones_path.exists() or levels_path.exists()) and not args.overwrite_overlays:
            print("Overlays already exist. Skipping sample overlay generation.")
        else:
            generate_sample_overlays(resample_bars(df, "5min"), out_dir)
            print(f"Saved sample overlays to {out_dir}")


if __name__ == "__main__":
    main()
