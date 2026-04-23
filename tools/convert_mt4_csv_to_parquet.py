import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert MT4 History Center CSV to daily Parquet files.")
    parser.add_argument(
        "--csv",
        default=str(Path("rd_strat/data/vantage_raw/EURUSD1.csv")),
        help="Path to MT4 CSV export.",
    )
    parser.add_argument(
        "--out-dir",
        default=str(Path("rd_strat/data/vantage_1m")),
        help="Output directory for daily parquet files.",
    )
    parser.add_argument("--start", default="2021-01-01", help="Start date YYYY-MM-DD")
    parser.add_argument("--end", default="2024-12-31", help="End date YYYY-MM-DD")
    parser.add_argument(
        "--tz-offset-hours",
        type=float,
        default=0.0,
        help="Shift timestamps by this many hours (e.g. 1 or -1).",
    )
    parser.add_argument("--chunksize", type=int, default=200_000, help="Rows per chunk.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing parquet files.")
    return parser.parse_args()


def parse_datetime(df: pd.DataFrame, offset_hours: float) -> pd.Series:
    dt = pd.to_datetime(
        df["date"].astype(str) + " " + df["time"].astype(str),
        format="%Y.%m.%d %H:%M",
        errors="coerce",
    )
    if offset_hours:
        dt = dt + pd.Timedelta(hours=offset_hours)
    return dt


def write_day(day_df: pd.DataFrame, out_dir: Path, overwrite: bool) -> Optional[Path]:
    if day_df.empty:
        return None
    day = day_df["DateTime"].iloc[0].date().isoformat()
    out_path = out_dir / f"EURUSD_{day}_1m.parquet"
    if out_path.exists() and not overwrite:
        return None
    day_df = day_df.sort_values("DateTime")
    day_df = day_df.set_index("DateTime")
    day_df.to_parquet(out_path)
    return out_path


def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv).expanduser()
    out_dir = Path(args.out_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)

    start = pd.Timestamp(args.start)
    end = pd.Timestamp(args.end) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)

    cols = ["date", "time", "open", "high", "low", "close", "tickcount"]

    buffer = pd.DataFrame(columns=cols + ["DateTime"])
    total_written = 0
    total_rows = 0

    reader = pd.read_csv(csv_path, names=cols, header=None, chunksize=args.chunksize)
    for idx, chunk in enumerate(reader, start=1):
        chunk["DateTime"] = parse_datetime(chunk, args.tz_offset_hours)
        chunk = chunk.dropna(subset=["DateTime"])
        chunk = chunk[(chunk["DateTime"] >= start) & (chunk["DateTime"] <= end)]
        if chunk.empty:
            continue

        if not buffer.empty:
            chunk = pd.concat([buffer, chunk], ignore_index=True)
            buffer = pd.DataFrame(columns=cols + ["DateTime"])

        total_rows += len(chunk)
        chunk = chunk.sort_values("DateTime")
        last_date = chunk["DateTime"].iloc[-1].normalize()
        to_write = chunk[chunk["DateTime"].dt.normalize() < last_date]
        buffer = chunk[chunk["DateTime"].dt.normalize() == last_date]

        for day, day_df in to_write.groupby(to_write["DateTime"].dt.normalize()):
            out_path = write_day(day_df, out_dir, args.overwrite)
            if out_path is not None:
                total_written += 1

        if idx % 10 == 0:
            print(f"Processed {idx} chunks, rows={total_rows}, files={total_written}")

    if not buffer.empty:
        out_path = write_day(buffer, out_dir, args.overwrite)
        if out_path is not None:
            total_written += 1

    print(f"Done. Rows kept: {total_rows}, files written: {total_written}")
    print(f"Output dir: {out_dir}")


if __name__ == "__main__":
    main()
