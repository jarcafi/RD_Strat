RD Strat Rules

Purpose
- Capture the strategy that is currently implemented in the `rd_strat` viewer.
- Use this as the working spec before moving the logic into reusable backtest code.
- Separate "already coded" rules from open discretionary ideas that still live only in your head.

Scope
- Instrument: EURUSD
- Timeframes: 5m and 30m
- Current implementation source of truth: `rd_strat/viewer/app.js`

0) Current State
- The viewer already contains mechanical logic for:
- Supply / demand zone validation
- Liquidity detection above demand and below supply
- Break of structure confirmation
- Entry triggering after a zone tap
- SL / TP / break-even handling
- Basic trade statistics in the UI

- What is still missing:
- A clean written spec matching your intended strategy exactly
- A reusable engine outside the browser viewer
- Explicit regime, session, news, and risk rules at system level
- Confirmation that the current coded rules match your intended discretionary logic one to one

1) Zone Construction

1.1 Demand zone
- Find a bullish impulse: at least `Min run` consecutive bullish candles after a bearish base candle.
- The impulse must move at least `Impulse (ATR)` times ATR from run start to run end.
- Base candle = last bearish candle before the bullish run.
- Zone bounds = low to high of the base candle.
- If the first bullish candle after the base makes a lower low than the base, extend zone low to that low.

1.2 Supply zone
- Find a bearish impulse: at least `Min run` consecutive bearish candles after a bullish base candle.
- The impulse must move at least `Impulse (ATR)` times ATR from run start to run end.
- Base candle = last bullish candle before the bearish run.
- Zone bounds = low to high of the base candle.
- If the first bearish candle after the base makes a higher high than the base, extend zone high to that high.

1.3 Zone lifespan
- Zones are extended forward in time.
- In the generator script, the default extension is about one trading day in bars.
- In the viewer, only zones that survive later validation are considered tradable.

1.4 Zone spacing
- Same-type zones require a minimum separation in bars via `Min gap`.

2) Liquidity Model

2.1 General idea
- A zone is not valid by itself.
- It needs nearby liquidity outside the zone.
- Demand expects liquidity above the zone.
- Supply expects liquidity below the zone.

2.2 Swing confirmation
- Liquidity anchors are swing pivots.
- Swing low:
- The candidate low must not be broken within the confirmation window.
- Price must bounce up by at least `Min dip (pips)`.

- Swing high:
- The candidate high must not be broken within the confirmation window.
- Price must drop by at least `Min dip (pips)`.

2.3 Liquidity clustering
- A liquidity point is stronger if multiple nearby candles print similar highs or lows.
- Similarity threshold = `Cluster pips`.
- Required cluster size = `Min candles`.

2.4 Liquidity distance from zone
- Demand liquidity must sit above zone high.
- Supply liquidity must sit below zone low.
- Max allowed distance from the zone = `Distance (pips)`.

2.5 Break of structure
- For each liquidity pivot, the code finds the prior opposite swing.
- Demand:
- Liquidity pivot is a swing low above the zone.
- BoS is valid when price later breaks above the prior swing high.

- Supply:
- Liquidity pivot is a swing high below the zone.
- BoS is valid when price later breaks below the prior swing low.

- If `BoS only` is enabled, only liquidity with confirmed BoS keeps the zone valid.

2.6 Sweep handling
- The liquidity line stays active until price sweeps that level or until zone expiry.
- A zone remains tradable as long as at least one valid liquidity line exists.

3) Trade Preconditions
- Only demand zones can create long trades.
- Only supply zones can create short trades.
- A zone must be valid after liquidity filtering.
- A valid BoS must exist for the zone.
- Trading starts only after the earliest BoS linked to that zone.

4) Entry Logic

4.1 Tap requirement
- After BoS, price must tap the zone.
- Tap means candle range overlaps the zone.
- While price taps, the code tracks the deepest excursion into or through the zone.

4.2 Invalidation during setup
- If a candle closes inside the zone during setup scanning, the setup is discarded.

4.3 Primary entry
- Long:
- After a tap, enter when a candle closes bullish and closes above zone high.

- Short:
- After a tap, enter when a candle closes bearish and closes below zone low.

4.4 Break entry
- Long:
- After a tap, enter if current high breaks previous candle high.

- Short:
- After a tap, enter if current low breaks previous candle low.

4.5 Entry price
- Primary entry uses candle close.
- Break entry uses previous candle high for longs and previous candle low for shorts.

5) Stop Loss Logic

5.1 Base stop
- Long stop = deepest tap low.
- Short stop = deepest tap high.

5.2 30m adjustment
- On 30m, stop gets an extra 1 pip buffer.
- On 5m, no extra fixed pip buffer is added.

5.3 No-trade case
- If stop distance is zero or negative, no trade is taken.

6) Take Profit and Break-Even

6.1 Manual RR mode
- TP = entry plus or minus risk times `TP (R)`.

6.2 Auto RR mode
- Only used on 5m.
- If SL <= 1.5 pips:
- TP = 4.5R
- Move to BE at 3R

- If SL <= 3.5 pips:
- TP = 3R
- Move to BE at 2R

- If SL <= 5.5 pips:
- TP = 2.5R
- Move to BE at 2R

- If SL > 5.5 pips:
- TP = 2R
- No automatic BE level

6.3 Break-even execution
- Once BE trigger is reached, stop is moved to entry.

7) Trade Exit Logic
- Trade closes on first event:
- SL hit
- TP hit
- Zone expiry if `Close at zone end` is enabled

- If zone expiry close is disabled and neither SL nor TP is hit, the trade is ignored.

8) Backtest Accounting in Viewer
- Results are measured in `R`.
- Win = positive R.
- Loss = negative R.
- Stats shown:
- Trade count
- Wins / losses
- Win rate
- Avg R
- Total R
- Long / short split
- Primary / break split
- SL / other closes

9) What This Spec Still Does Not Define
- Higher-timeframe directional bias
- Session restrictions
- News handling
- Multi-zone conflict resolution
- Maximum concurrent trades
- Risk sizing in money or percent
- Whether repeated taps on the same zone should allow multiple entries
- Whether liquidity should be taken before or after the zone interaction in your intended model
- Whether discretionary concepts like "clean impulse", "strong departure", or "quality zone" need stricter filters than the current mechanical version

10) Next Target
- Freeze the exact intended rules in this file.
- Move the logic from `viewer/app.js` into a reusable Python strategy module.
- Run the same rules on EURUSD data and compare results with the viewer.
- Then iterate on the rules only after the implementation is reproducible.
