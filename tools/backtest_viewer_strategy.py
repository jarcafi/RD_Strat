import argparse
import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List, Optional

PIP_VALUE = 0.0001
IMPULSE_ATR_PERIOD = 14


@dataclass
class Settings:
    zone_min_run: int = 3
    zone_impulse_atr: float = 1.5
    liq_bos_only: bool = True
    liq_swing_window: int = 6
    liq_bos_window: int = 6
    liq_min_candles: int = 2
    liq_cluster_pips: float = 2.0
    liq_max_pips: float = 10.0
    liq_min_dip_pips: float = 3.0
    entry_primary: bool = True
    entry_break: bool = False
    trade_use_sl: bool = True
    trade_use_tp: bool = True
    trade_auto_rr: bool = True
    trade_use_be: bool = True
    trade_close_end: bool = True
    trade_rr: float = 1.5
    include_longs: bool = True
    include_shorts: bool = True


@dataclass
class Trade:
    side: str
    entry_type: str
    entry_idx: int
    entry_time: int
    entry_price: float
    stop_level: float
    tp_level: Optional[float]
    close_idx: int
    close_time: int
    close_price: float
    stop_hit: bool
    tp_hit: bool
    be_active: bool
    zone_label: str
    zone_start: int
    zone_end: int
    zone_low: float
    zone_high: float
    bos_time: int


class CandleCache:
    def __init__(self, candles: List[dict]):
        self.times = [int(c["time"]) for c in candles]
        self.opens = [float(c["open"]) for c in candles]
        self.highs = [float(c["high"]) for c in candles]
        self.lows = [float(c["low"]) for c in candles]
        self.closes = [float(c["close"]) for c in candles]
        self.atr = self._compute_atr()

    def _compute_atr(self) -> List[Optional[float]]:
        atr: List[Optional[float]] = [None] * len(self.times)
        tr_values: List[float] = [0.0] * len(self.times)
        tr_sum = 0.0
        for i in range(len(self.times)):
            prev_close = self.closes[i - 1] if i > 0 else self.closes[i]
            tr = max(
                self.highs[i] - self.lows[i],
                abs(self.highs[i] - prev_close),
                abs(self.lows[i] - prev_close),
            )
            tr_values[i] = tr
            tr_sum += tr
            if i >= IMPULSE_ATR_PERIOD:
                tr_sum -= tr_values[i - IMPULSE_ATR_PERIOD]
            if i >= IMPULSE_ATR_PERIOD - 1:
                atr[i] = tr_sum / IMPULSE_ATR_PERIOD
        return atr


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backtest the current rd_strat viewer logic in Python.")
    parser.add_argument("--candles", required=True, help="Path to candle JSON.")
    parser.add_argument("--zones", required=True, help="Path to zones JSON.")
    parser.add_argument("--timeframe", default="5min", choices=["5min", "30min"], help="Viewer timeframe rules.")
    parser.add_argument("--out-dir", help="Directory for CSV/JSON outputs.")
    parser.add_argument("--zone-min-run", type=int, default=3)
    parser.add_argument("--zone-impulse-atr", type=float, default=1.5)
    parser.add_argument("--liq-bos-only", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--liq-swing-window", type=int, default=6)
    parser.add_argument("--liq-bos-window", type=int, default=6)
    parser.add_argument("--liq-min-candles", type=int, default=2)
    parser.add_argument("--liq-cluster-pips", type=float, default=2.0)
    parser.add_argument("--liq-max-pips", type=float, default=10.0)
    parser.add_argument("--liq-min-dip-pips", type=float, default=3.0)
    parser.add_argument("--entry-primary", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--entry-break", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--trade-use-sl", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--trade-use-tp", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--trade-auto-rr", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--trade-use-be", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--trade-close-end", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--trade-rr", type=float, default=1.5)
    parser.add_argument("--include-longs", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--include-shorts", action=argparse.BooleanOptionalAction, default=True)
    return parser.parse_args()


def load_json(path: Path) -> list:
    return json.loads(path.read_text(encoding="utf-8"))


def build_settings(args: argparse.Namespace) -> Settings:
    return Settings(
        zone_min_run=max(1, args.zone_min_run),
        zone_impulse_atr=max(0.0, args.zone_impulse_atr),
        liq_bos_only=bool(args.liq_bos_only),
        liq_swing_window=max(1, args.liq_swing_window),
        liq_bos_window=max(1, args.liq_bos_window),
        liq_min_candles=max(1, args.liq_min_candles),
        liq_cluster_pips=max(0.1, args.liq_cluster_pips),
        liq_max_pips=max(1.0, args.liq_max_pips),
        liq_min_dip_pips=max(0.0, args.liq_min_dip_pips),
        entry_primary=bool(args.entry_primary),
        entry_break=bool(args.entry_break),
        trade_use_sl=bool(args.trade_use_sl),
        trade_use_tp=bool(args.trade_use_tp),
        trade_auto_rr=bool(args.trade_auto_rr),
        trade_use_be=bool(args.trade_use_be),
        trade_close_end=bool(args.trade_close_end),
        trade_rr=max(0.1, args.trade_rr),
        include_longs=bool(args.include_longs),
        include_shorts=bool(args.include_shorts),
    )


def find_left_index(times: List[int], target: int) -> int:
    lo = 0
    hi = len(times) - 1
    res = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if times[mid] >= target:
            res = mid
            hi = mid - 1
        else:
            lo = mid + 1
    return res


def find_right_index(times: List[int], target: int) -> int:
    lo = 0
    hi = len(times) - 1
    res = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if times[mid] <= target:
            res = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return res


def confirm_swing_low(cache: CandleCache, idx: int, limit_idx: int, settings: Settings) -> bool:
    min_dip = settings.liq_min_dip_pips * PIP_VALUE
    window = max(1, settings.liq_swing_window)
    end = min(limit_idx, idx + window)
    if end <= idx:
        return False
    pivot_low = cache.lows[idx]
    max_high = cache.highs[idx + 1] if idx + 1 < len(cache.highs) else pivot_low
    for i in range(idx + 1, end + 1):
        if cache.lows[i] < pivot_low:
            return False
        if cache.highs[i] > max_high:
            max_high = cache.highs[i]
    return max_high - pivot_low >= min_dip


def confirm_swing_high(cache: CandleCache, idx: int, limit_idx: int, settings: Settings) -> bool:
    min_dip = settings.liq_min_dip_pips * PIP_VALUE
    window = max(1, settings.liq_swing_window)
    end = min(limit_idx, idx + window)
    if end <= idx:
        return False
    pivot_high = cache.highs[idx]
    min_low = cache.lows[idx + 1] if idx + 1 < len(cache.lows) else pivot_high
    for i in range(idx + 1, end + 1):
        if cache.highs[i] > pivot_high:
            return False
        if cache.lows[i] < min_low:
            min_low = cache.lows[i]
    return pivot_high - min_low >= min_dip


def count_cluster(values: List[float], idx: int, start_idx: int, end_idx: int, level: float, settings: Settings) -> int:
    tolerance = settings.liq_cluster_pips * PIP_VALUE
    window = max(1, settings.liq_swing_window)
    left = max(start_idx, idx - window)
    right = min(end_idx, idx + window)
    count = 1
    for i in range(idx - 1, left - 1, -1):
        if abs(values[i] - level) <= tolerance:
            count += 1
        else:
            break
    for i in range(idx + 1, right + 1):
        if abs(values[i] - level) <= tolerance:
            count += 1
        else:
            break
    return count


def find_prior_swing_level(
    cache: CandleCache, start_idx: int, pivot_idx: int, want_high: bool, settings: Settings
) -> Optional[float]:
    left_bound = max(start_idx, 0)
    for i in range(pivot_idx - 1, left_bound - 1, -1):
        if want_high:
            if confirm_swing_high(cache, i, pivot_idx, settings):
                return cache.highs[i]
        else:
            if confirm_swing_low(cache, i, pivot_idx, settings):
                return cache.lows[i]
    return None


def find_break_of_structure(
    cache: CandleCache, pivot_idx: int, end_idx: int, is_demand: bool, bos_level: float
) -> int:
    for i in range(pivot_idx + 1, end_idx + 1):
        if is_demand:
            if cache.highs[i] > bos_level:
                return i
        else:
            if cache.lows[i] < bos_level:
                return i
    return -1


def find_liquidity_touch(cache: CandleCache, start_idx: int, end_idx: int, level: float, is_demand: bool) -> int:
    for i in range(start_idx, end_idx + 1):
        if is_demand:
            if cache.lows[i] <= level:
                return i
        else:
            if cache.highs[i] >= level:
                return i
    return -1


def find_liquidity_pivots(
    cache: CandleCache, zone: dict, start_idx: int, end_idx: int, is_demand: bool, settings: Settings
) -> List[dict]:
    max_distance = settings.liq_max_pips * PIP_VALUE
    pivots: List[dict] = []
    for i in range(start_idx, end_idx + 1):
        if is_demand:
            if not confirm_swing_low(cache, i, end_idx, settings):
                continue
            level = cache.lows[i]
            if level <= zone["high"]:
                continue
            dist = level - zone["high"]
            if dist > max_distance:
                continue
            cluster = count_cluster(cache.lows, i, start_idx, end_idx, level, settings)
            if cluster < settings.liq_min_candles:
                continue
            pivots.append({"index": i, "level": level, "dist": dist})
        else:
            if not confirm_swing_high(cache, i, end_idx, settings):
                continue
            level = cache.highs[i]
            if level >= zone["low"]:
                continue
            dist = zone["low"] - level
            if dist > max_distance:
                continue
            cluster = count_cluster(cache.highs, i, start_idx, end_idx, level, settings)
            if cluster < settings.liq_min_candles:
                continue
            pivots.append({"index": i, "level": level, "dist": dist})
    return pivots


def compute_run_len(cache: CandleCache, zone: dict) -> Optional[int]:
    base_idx = find_left_index(cache.times, int(zone["start"]))
    if base_idx == -1:
        return None
    label = str(zone.get("label", "")).lower()
    is_demand = "demand" in label
    is_supply = "supply" in label
    if not is_demand and not is_supply:
        return None
    run_len = 0
    idx = base_idx + 1
    while idx < len(cache.times):
        is_bull = cache.closes[idx] > cache.opens[idx]
        is_bear = cache.closes[idx] < cache.opens[idx]
        if is_demand and is_bull:
            run_len += 1
            idx += 1
            continue
        if is_supply and is_bear:
            run_len += 1
            idx += 1
            continue
        break
    return run_len


def compute_impulse_ratio(cache: CandleCache, zone: dict) -> Optional[float]:
    base_idx = find_left_index(cache.times, int(zone["start"]))
    if base_idx == -1 or base_idx + 1 >= len(cache.times):
        return None
    label = str(zone.get("label", "")).lower()
    is_demand = "demand" in label
    is_supply = "supply" in label
    if not is_demand and not is_supply:
        return None
    idx = base_idx + 1
    run_start = idx
    if is_demand:
        while idx < len(cache.times) and cache.closes[idx] > cache.opens[idx]:
            idx += 1
    else:
        while idx < len(cache.times) and cache.closes[idx] < cache.opens[idx]:
            idx += 1
    run_end = idx - 1
    if run_end < run_start:
        return None
    move = (
        cache.closes[run_end] - cache.opens[run_start]
        if is_demand
        else cache.opens[run_start] - cache.closes[run_end]
    )
    atr_value = cache.atr[base_idx]
    if atr_value is None or atr_value <= 0:
        return None
    return move / atr_value


def filter_zones(cache: CandleCache, zones: List[dict], settings: Settings) -> List[dict]:
    filtered: List[dict] = []
    for zone in zones:
        zone_copy = dict(zone)
        run_len = zone_copy.get("run_len")
        if run_len is None:
            run_len = compute_run_len(cache, zone_copy)
        if run_len is not None and run_len < settings.zone_min_run:
            continue
        zone_copy["run_len"] = run_len

        if settings.zone_impulse_atr > 0:
            ratio = zone_copy.get("impulse_ratio")
            if ratio is None:
                ratio = compute_impulse_ratio(cache, zone_copy)
            if ratio is not None and ratio < settings.zone_impulse_atr:
                continue
            zone_copy["impulse_ratio"] = ratio

        filtered.append(zone_copy)
    return filtered


def apply_liquidity_filter(cache: CandleCache, zones: List[dict], settings: Settings) -> List[dict]:
    output: List[dict] = []
    for zone in zones:
        zone_copy = dict(zone)
        label = str(zone_copy.get("label", "")).lower()
        is_demand = "demand" in label
        is_supply = "supply" in label
        if not is_demand and not is_supply:
            zone_copy["isValid"] = True
            output.append(zone_copy)
            continue

        start_idx = find_left_index(cache.times, int(zone_copy["start"]))
        end_idx = find_right_index(cache.times, int(zone_copy["end"]))
        if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
            zone_copy["isValid"] = False
            zone_copy["liquidity"] = []
            output.append(zone_copy)
            continue

        range_start = min(start_idx + 2, end_idx)
        if range_start >= end_idx:
            zone_copy["isValid"] = False
            zone_copy["liquidity"] = []
            output.append(zone_copy)
            continue

        pivots = find_liquidity_pivots(cache, zone_copy, range_start, end_idx, is_demand, settings)
        if not pivots:
            zone_copy["isValid"] = False
            zone_copy["liquidity"] = []
            output.append(zone_copy)
            continue

        liquidity_lines = []
        for pivot in pivots:
            bos_level = find_prior_swing_level(cache, start_idx, pivot["index"], is_demand, settings)
            bos_limit = min(end_idx, pivot["index"] + settings.liq_bos_window)
            bos_idx = -1 if bos_level is None else find_break_of_structure(cache, pivot["index"], bos_limit, is_demand, bos_level)
            if settings.liq_bos_only and bos_idx == -1:
                continue
            sweep_idx = find_liquidity_touch(cache, pivot["index"] + 1, end_idx, pivot["level"], is_demand)
            line_end_idx = end_idx if sweep_idx == -1 else max(pivot["index"], sweep_idx - 1)
            liquidity_lines.append(
                {
                    "level": pivot["level"],
                    "start": cache.times[pivot["index"]],
                    "end": cache.times[line_end_idx],
                    "swept": sweep_idx != -1,
                    "bos": None if bos_idx == -1 else cache.times[bos_idx],
                    "bosLevel": bos_level,
                }
            )

        zone_copy["isValid"] = len(liquidity_lines) > 0
        zone_copy["liquidity"] = liquidity_lines
        output.append(zone_copy)
    return output


def compute_trades(cache: CandleCache, zones: List[dict], settings: Settings, timeframe: str) -> List[Trade]:
    if not settings.entry_primary and not settings.entry_break:
        return []
    trades: List[Trade] = []
    tf_is_30 = timeframe == "30min"
    stop_offset = PIP_VALUE if tf_is_30 else 0.0
    use_auto_rr = settings.trade_auto_rr and timeframe == "5min"

    for zone in zones:
        if zone.get("isValid") is False:
            continue
        label = str(zone.get("label", "")).lower()
        is_demand = "demand" in label
        is_supply = "supply" in label
        if not is_demand and not is_supply:
            continue
        if is_demand and not settings.include_longs:
            continue
        if is_supply and not settings.include_shorts:
            continue

        zone_low = min(float(zone["low"]), float(zone["high"]))
        zone_high = max(float(zone["low"]), float(zone["high"]))
        start_idx = find_left_index(cache.times, int(zone["start"]))
        end_idx = find_right_index(cache.times, int(zone["end"]))
        if start_idx == -1 or end_idx <= start_idx:
            continue

        liquidity = zone.get("liquidity") or []
        bos_times = [liq.get("bos") for liq in liquidity if isinstance(liq.get("bos"), int)]
        if not bos_times:
            continue
        bos_time = min(bos_times)
        bos_idx = find_left_index(cache.times, bos_time)
        if bos_idx == -1:
            continue
        scan_start = min(max(start_idx + 1, bos_idx), end_idx)
        if scan_start >= end_idx:
            continue

        tap_seen = False
        deep_low = None
        deep_high = None
        entry_idx = -1
        entry_type = ""

        for i in range(scan_start, end_idx + 1):
            o = cache.opens[i]
            h = cache.highs[i]
            l = cache.lows[i]
            c = cache.closes[i]
            close_inside = zone_low <= c <= zone_high
            if close_inside:
                entry_idx = -1
                break
            touched = l <= zone_high and h >= zone_low
            if touched:
                tap_seen = True
                deep_low = l if deep_low is None else min(deep_low, l)
                deep_high = h if deep_high is None else max(deep_high, h)
            if not tap_seen:
                continue

            primary_ok = False
            if settings.entry_primary:
                if is_demand and c > zone_high and c > o:
                    primary_ok = True
                if is_supply and c < zone_low and c < o:
                    primary_ok = True

            break_ok = False
            if settings.entry_break and i > 0:
                if is_demand and h > cache.highs[i - 1]:
                    break_ok = True
                if is_supply and l < cache.lows[i - 1]:
                    break_ok = True

            if primary_ok or break_ok:
                entry_idx = i
                entry_type = "P" if primary_ok else "B"
                break

        if entry_idx == -1 or deep_low is None or deep_high is None:
            continue

        entry_price = (
            cache.highs[entry_idx - 1] if entry_type == "B" and is_demand else
            cache.lows[entry_idx - 1] if entry_type == "B" and is_supply else
            cache.closes[entry_idx]
        )
        stop_level = deep_low - stop_offset if is_demand else deep_high + stop_offset
        risk = entry_price - stop_level if is_demand else stop_level - entry_price
        if not settings.trade_use_sl or risk <= 0:
            continue

        tp_r = settings.trade_rr
        be_r = None
        if use_auto_rr:
            sl_pips = risk / PIP_VALUE
            if sl_pips <= 1.5:
                tp_r = 4.5
                be_r = 3.0
            elif sl_pips <= 3.5:
                tp_r = 3.0
                be_r = 2.0
            elif sl_pips <= 5.5:
                tp_r = 2.5
                be_r = 2.0
            else:
                tp_r = 2.0

        tp_level = (
            entry_price + risk * tp_r if settings.trade_use_tp and is_demand else
            entry_price - risk * tp_r if settings.trade_use_tp and is_supply else
            None
        )
        be_level = (
            entry_price + risk * be_r if settings.trade_use_be and be_r is not None and is_demand else
            entry_price - risk * be_r if settings.trade_use_be and be_r is not None and is_supply else
            None
        )

        active_stop = stop_level
        be_active = False
        close_idx = -1
        stop_hit = False
        tp_hit = False

        for j in range(entry_idx + 1, end_idx + 1):
            h = cache.highs[j]
            l = cache.lows[j]
            if is_demand and l <= active_stop:
                close_idx = j
                stop_hit = True
                break
            if is_supply and h >= active_stop:
                close_idx = j
                stop_hit = True
                break
            if tp_level is not None and is_demand and h >= tp_level:
                close_idx = j
                tp_hit = True
                break
            if tp_level is not None and is_supply and l <= tp_level:
                close_idx = j
                tp_hit = True
                break
            if not be_active and be_level is not None:
                if is_demand and h >= be_level:
                    active_stop = entry_price
                    be_active = True
                if is_supply and l <= be_level:
                    active_stop = entry_price
                    be_active = True

        if close_idx == -1:
            if not settings.trade_close_end:
                continue
            close_idx = end_idx

        close_price = active_stop if stop_hit else tp_level if tp_hit else cache.closes[close_idx]
        trades.append(
            Trade(
                side="long" if is_demand else "short",
                entry_type=entry_type,
                entry_idx=entry_idx,
                entry_time=cache.times[entry_idx],
                entry_price=entry_price,
                stop_level=stop_level,
                tp_level=tp_level,
                close_idx=close_idx,
                close_time=cache.times[close_idx],
                close_price=float(close_price),
                stop_hit=stop_hit,
                tp_hit=tp_hit,
                be_active=be_active,
                zone_label=str(zone.get("label", "")),
                zone_start=int(zone["start"]),
                zone_end=int(zone["end"]),
                zone_low=zone_low,
                zone_high=zone_high,
                bos_time=bos_time,
            )
        )

    return trades


def summarize_trades(trades: List[Trade]) -> dict:
    totals = {
        "trades": len(trades),
        "wins": 0,
        "losses": 0,
        "total_r": 0.0,
        "avg_r": 0.0,
        "win_rate": 0.0,
        "longs": 0,
        "shorts": 0,
        "primary": 0,
        "break": 0,
        "sl_hits": 0,
        "tp_hits": 0,
        "closes": 0,
    }
    for trade in trades:
        risk = trade.entry_price - trade.stop_level if trade.side == "long" else trade.stop_level - trade.entry_price
        reward = trade.close_price - trade.entry_price if trade.side == "long" else trade.entry_price - trade.close_price
        r_value = reward / risk if risk > 0 else 0.0
        totals["total_r"] += r_value
        if r_value > 0:
            totals["wins"] += 1
        elif r_value < 0:
            totals["losses"] += 1
        if trade.side == "long":
            totals["longs"] += 1
        else:
            totals["shorts"] += 1
        if trade.entry_type == "P":
            totals["primary"] += 1
        else:
            totals["break"] += 1
        if trade.stop_hit:
            totals["sl_hits"] += 1
        elif trade.tp_hit:
            totals["tp_hits"] += 1
        else:
            totals["closes"] += 1
    if totals["trades"] > 0:
        totals["avg_r"] = totals["total_r"] / totals["trades"]
        totals["win_rate"] = totals["wins"] / totals["trades"]
    return totals


def main() -> None:
    args = parse_args()
    settings = build_settings(args)
    candles_path = Path(args.candles).expanduser()
    zones_path = Path(args.zones).expanduser()

    candles = load_json(candles_path)
    zones = load_json(zones_path)
    cache = CandleCache(candles)

    filtered_zones = filter_zones(cache, zones, settings)
    validated_zones = apply_liquidity_filter(cache, filtered_zones, settings)
    trades = compute_trades(cache, validated_zones, settings, args.timeframe)
    summary = summarize_trades(trades)

    print(json.dumps(summary, indent=2))

    if args.out_dir:
        out_dir = Path(args.out_dir).expanduser()
        out_dir.mkdir(parents=True, exist_ok=True)

        (out_dir / "zones_validated.json").write_text(
            json.dumps(validated_zones, indent=2),
            encoding="utf-8",
        )

        trade_rows = [asdict(t) for t in trades]
        with (out_dir / "trades.csv").open("w", encoding="utf-8", newline="") as handle:
            fieldnames = list(trade_rows[0].keys()) if trade_rows else [field.name for field in Trade.__dataclass_fields__.values()]
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in trade_rows:
                writer.writerow(row)

        with (out_dir / "summary.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(summary.keys()))
            writer.writeheader()
            writer.writerow(summary)

        (out_dir / "settings.json").write_text(json.dumps(asdict(settings), indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
