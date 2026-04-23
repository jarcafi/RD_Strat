const chartEl = document.getElementById('chart');
const chart = LightweightCharts.createChart(chartEl, {
  layout: {
    background: { color: '#0b0f14' },
    textColor: '#e6edf3',
  },
  grid: {
    vertLines: { color: '#18202b' },
    horzLines: { color: '#18202b' },
  },
  rightPriceScale: {
    borderColor: '#243042',
  },
  timeScale: {
    borderColor: '#243042',
    timeVisible: true,
    secondsVisible: false,
  },
  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal,
    horzLine: { visible: false, labelVisible: false },
    vertLine: { visible: true, labelVisible: true },
  },
});

const PRICE_STEP_PCT = 0.00001;
const MAGNET_PCT = 0.0002;
const PIP_VALUE = 0.0001;
const LIQ_CLUSTER_PIPS = 1;
const IMPULSE_ATR_PERIOD = 14;
const MAX_DECIMALS = 8;
const MIN_STEP = 1e-8;

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  const abs = Math.abs(value);
  const step = Math.max(abs * PRICE_STEP_PCT, MIN_STEP);
  const decimals = Math.min(MAX_DECIMALS, Math.max(0, Math.ceil(-Math.log10(step))));
  return value.toFixed(decimals);
}

function formatTimestamp(ts) {
  if (ts === null || ts === undefined || Number.isNaN(ts)) {
    return '';
  }
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function formatDatetimeLocal(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function parseDatetimeLocal(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

const candleSeries = chart.addCandlestickSeries({
  upColor: '#22c55e',
  downColor: '#ef4444',
  wickUpColor: '#22c55e',
  wickDownColor: '#ef4444',
  borderVisible: false,
  priceLineVisible: false,
  lastValueVisible: false,
  priceFormat: {
    type: 'custom',
    minMove: MIN_STEP,
    formatter: formatPrice,
  },
});

const zonesOverlay = document.createElement('canvas');
zonesOverlay.className = 'zones-layer';
chartEl.appendChild(zonesOverlay);
const zonesCtx = zonesOverlay.getContext('2d');

let activeZones = [];
let rawZones = [];
let overlaySize = { width: 0, height: 0 };
let levelLines = [];
let hoverPriceLine = null;
let candleCache = null;
let renderPending = false;
let tradeMarkers = [];
let currentTrades = [];

const statusEl = document.getElementById('status');
const tfSelect = document.getElementById('tf');
const brokerSelect = document.getElementById('broker');
const reloadBtn = document.getElementById('reload');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const showZonesEl = document.getElementById('show-zones');
const showDemandEl = document.getElementById('show-demand');
const showSupplyEl = document.getElementById('show-supply');
const showLiquidityEl = document.getElementById('show-liquidity');
const liqBosOnlyEl = document.getElementById('liq-bos-only');
const liqSwingWindowEl = document.getElementById('liq-swing-window');
const liqBosWindowEl = document.getElementById('liq-bos-window');
const liqMinCandlesEl = document.getElementById('liq-min-candles');
const liqClusterPipsEl = document.getElementById('liq-cluster-pips');
const liqMaxPipsEl = document.getElementById('liq-max-pips');
const liqMinDipEl = document.getElementById('liq-min-dip');
const zoneMinRunEl = document.getElementById('zone-min-run');
const zoneImpulseAtrEl = document.getElementById('zone-impulse-atr');
const zoneMinGapEl = document.getElementById('zone-min-gap');
const opacityEl = document.getElementById('zones-opacity');
const opacityValueEl = document.getElementById('opacity-value');
const demandColorEl = document.getElementById('demand-color');
const supplyColorEl = document.getElementById('supply-color');
const showTradesEl = document.getElementById('show-trades');
const showLongTradesEl = document.getElementById('show-long-trades');
const showShortTradesEl = document.getElementById('show-short-trades');
const entryPrimaryEl = document.getElementById('entry-primary');
const entryBreakEl = document.getElementById('entry-break');
const tradeUseSlEl = document.getElementById('trade-use-sl');
const tradeUseTpEl = document.getElementById('trade-use-tp');
const tradeAutoRrEl = document.getElementById('trade-auto-rr');
const tradeUseBeEl = document.getElementById('trade-use-be');
const tradeCloseEndEl = document.getElementById('trade-close-end');
const tradeRrEl = document.getElementById('trade-rr');
const backtestPanelEl = document.getElementById('backtest-panel');
const btVisibleEl = document.getElementById('bt-visible');
const btUseRangeEl = document.getElementById('bt-use-range');
const btStartEl = document.getElementById('bt-start');
const btEndEl = document.getElementById('bt-end');
const btTradesEl = document.getElementById('bt-trades');
const btWinsEl = document.getElementById('bt-wins');
const btLossesEl = document.getElementById('bt-losses');
const btWinrateEl = document.getElementById('bt-winrate');
const btAvgREl = document.getElementById('bt-avg-r');
const btTotalREl = document.getElementById('bt-total-r');
const btLongsEl = document.getElementById('bt-longs');
const btShortsEl = document.getElementById('bt-shorts');
const btPrimaryEl = document.getElementById('bt-primary');
const btBreakEl = document.getElementById('bt-break');
const btSlEl = document.getElementById('bt-sl');
const btCloseEl = document.getElementById('bt-close');
const btDetailsEl = document.getElementById('bt-trade-details');
const btDetailsBodyEl = document.getElementById('bt-trade-details-body');

const settings = {
  showZones: true,
  showDemand: true,
  showSupply: true,
  showLiquidity: true,
  liqBosOnly: true,
  liqSwingWindow: 6,
  liqBosWindow: 6,
  liqMinCandles: 2,
  liqClusterPips: 2,
  liqMaxPips: 10,
  liqMinDipPips: 3,
  zoneMinRun: 3,
  zoneImpulseAtr: 1.5,
  zoneMinGap: 3,
  showTrades: true,
  showLongTrades: true,
  showShortTrades: true,
  entryPrimary: true,
  entryBreak: false,
  tradeUseSl: true,
  tradeUseTp: true,
  tradeAutoRr: true,
  tradeUseBe: true,
  tradeCloseEnd: true,
  tradeRr: 1.5,
  backtestUseRange: true,
  backtestStart: '',
  backtestEnd: '',
  opacity: 0.3,
  demandColor: '#22c55e',
  supplyColor: '#ef4444',
};

function setStatus(message) {
  statusEl.textContent = message;
}

function loadSettings() {
  const saved = window.localStorage.getItem('rd_strat_settings');
  if (!saved) {
    return;
  }
  try {
    const parsed = JSON.parse(saved);
    Object.assign(settings, parsed);
    if (typeof settings.showLiquidity !== 'boolean') {
      if (typeof settings.showLiquidityLines === 'boolean') {
        settings.showLiquidity = settings.showLiquidityLines;
      } else if (typeof settings.useLiquidity === 'boolean') {
        settings.showLiquidity = settings.useLiquidity;
      } else {
        settings.showLiquidity = true;
      }
    }
    if (typeof settings.liqBosOnly !== 'boolean') {
      settings.liqBosOnly = true;
    }
    if (typeof settings.liqSwingWindow !== 'number') {
      settings.liqSwingWindow = 6;
    }
    if (typeof settings.liqBosWindow !== 'number') {
      settings.liqBosWindow = 6;
    }
    if (typeof settings.liqClusterPips !== 'number') {
      settings.liqClusterPips = 2;
    }
    if (typeof settings.zoneMinGap !== 'number') {
      settings.zoneMinGap = 3;
    }
    if (typeof settings.showTrades !== 'boolean') {
      settings.showTrades = true;
    }
    if (typeof settings.showLongTrades !== 'boolean') {
      settings.showLongTrades = true;
    }
    if (typeof settings.showShortTrades !== 'boolean') {
      settings.showShortTrades = true;
    }
    if (typeof settings.entryPrimary !== 'boolean') {
      settings.entryPrimary = true;
    }
    if (typeof settings.entryBreak !== 'boolean') {
      settings.entryBreak = false;
    }
    if (typeof settings.tradeUseSl !== 'boolean') {
      settings.tradeUseSl = true;
    }
    if (typeof settings.tradeUseTp !== 'boolean') {
      settings.tradeUseTp = true;
    }
    if (typeof settings.tradeAutoRr !== 'boolean') {
      settings.tradeAutoRr = true;
    }
    if (typeof settings.tradeUseBe !== 'boolean') {
      settings.tradeUseBe = true;
    }
    if (typeof settings.tradeCloseEnd !== 'boolean') {
      settings.tradeCloseEnd = true;
    }
    if (typeof settings.tradeRr !== 'number' || Number.isNaN(settings.tradeRr)) {
      settings.tradeRr = 1.5;
    }
    if (typeof settings.backtestUseRange !== 'boolean') {
      settings.backtestUseRange = true;
    }
    if (typeof settings.backtestStart !== 'string') {
      settings.backtestStart = '';
    }
    if (typeof settings.backtestEnd !== 'string') {
      settings.backtestEnd = '';
    }
    if (typeof settings.liqSwingSpan === 'number') {
      delete settings.liqSwingSpan;
    }
    delete settings.showLiquidityLines;
    delete settings.showValidOnly;
    delete settings.useLiquidity;
  } catch (err) {
    // ignore invalid settings
  }
}

function saveSettings() {
  window.localStorage.setItem('rd_strat_settings', JSON.stringify(settings));
}

function clearZones() {
  activeZones = [];
  scheduleRenderZones();
}

function clearLevels() {
  levelLines.forEach((line) => candleSeries.removePriceLine(line));
  levelLines = [];
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

async function loadJsonOptional(path, fallback = []) {
  const response = await fetch(path);
  if (response.ok) {
    return response.json();
  }
  if (response.status === 404) {
    return fallback;
  }
  throw new Error(`Failed to load ${path}`);
}

function resizeZonesOverlay() {
  if (!zonesCtx) {
    return;
  }
  const rect = chartEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  overlaySize = { width: rect.width, height: rect.height };
  zonesOverlay.width = Math.max(1, Math.floor(rect.width * dpr));
  zonesOverlay.height = Math.max(1, Math.floor(rect.height * dpr));
  zonesOverlay.style.width = `${rect.width}px`;
  zonesOverlay.style.height = `${rect.height}px`;
  zonesCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function applySettingsToUI() {
  showZonesEl.checked = settings.showZones;
  showDemandEl.checked = settings.showDemand;
  showSupplyEl.checked = settings.showSupply;
  showLiquidityEl.checked = settings.showLiquidity;
  liqBosOnlyEl.checked = settings.liqBosOnly;
  liqSwingWindowEl.value = settings.liqSwingWindow;
  liqBosWindowEl.value = settings.liqBosWindow;
  liqMinCandlesEl.value = settings.liqMinCandles;
  liqClusterPipsEl.value = settings.liqClusterPips;
  liqMaxPipsEl.value = settings.liqMaxPips;
  liqMinDipEl.value = settings.liqMinDipPips;
  zoneMinRunEl.value = settings.zoneMinRun;
  zoneImpulseAtrEl.value = settings.zoneImpulseAtr;
  zoneMinGapEl.value = settings.zoneMinGap;
  showTradesEl.checked = settings.showTrades;
  showLongTradesEl.checked = settings.showLongTrades;
  showShortTradesEl.checked = settings.showShortTrades;
  entryPrimaryEl.checked = settings.entryPrimary;
  entryBreakEl.checked = settings.entryBreak;
  tradeUseSlEl.checked = settings.tradeUseSl;
  tradeUseTpEl.checked = settings.tradeUseTp;
  tradeAutoRrEl.checked = settings.tradeAutoRr;
  tradeUseBeEl.checked = settings.tradeUseBe;
  tradeCloseEndEl.checked = settings.tradeCloseEnd;
  tradeRrEl.value = settings.tradeRr;
  btUseRangeEl.checked = settings.backtestUseRange;
  if (!settings.backtestStart || !settings.backtestEnd) {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    settings.backtestStart = formatDatetimeLocal(start);
    settings.backtestEnd = formatDatetimeLocal(now);
  }
  btStartEl.value = settings.backtestStart;
  btEndEl.value = settings.backtestEnd;
  opacityEl.value = settings.opacity.toFixed(2);
  opacityValueEl.textContent = settings.opacity.toFixed(2);
  demandColorEl.value = settings.demandColor;
  supplyColorEl.value = settings.supplyColor;
}

function updateSettingsFromUI() {
  settings.showZones = showZonesEl.checked;
  settings.showDemand = showDemandEl.checked;
  settings.showSupply = showSupplyEl.checked;
  settings.showLiquidity = showLiquidityEl.checked;
  settings.liqBosOnly = liqBosOnlyEl.checked;
  settings.liqSwingWindow = Math.max(1, parseInt(liqSwingWindowEl.value, 10) || 1);
  settings.liqBosWindow = Math.max(1, parseInt(liqBosWindowEl.value, 10) || 1);
  settings.liqMinCandles = Math.max(1, parseInt(liqMinCandlesEl.value, 10) || 1);
  settings.liqClusterPips = Math.max(0.1, parseFloat(liqClusterPipsEl.value) || 0.1);
  settings.liqMaxPips = Math.max(1, parseFloat(liqMaxPipsEl.value) || 1);
  settings.liqMinDipPips = Math.max(0, parseFloat(liqMinDipEl.value) || 0);
  settings.zoneMinRun = Math.max(1, parseInt(zoneMinRunEl.value, 10) || 1);
  settings.zoneImpulseAtr = Math.max(0, parseFloat(zoneImpulseAtrEl.value) || 0);
  settings.zoneMinGap = Math.max(0, parseInt(zoneMinGapEl.value, 10) || 0);
  settings.showTrades = showTradesEl.checked;
  settings.showLongTrades = showLongTradesEl.checked;
  settings.showShortTrades = showShortTradesEl.checked;
  settings.entryPrimary = entryPrimaryEl.checked;
  settings.entryBreak = entryBreakEl.checked;
  settings.tradeUseSl = tradeUseSlEl.checked;
  settings.tradeUseTp = tradeUseTpEl.checked;
  settings.tradeAutoRr = tradeAutoRrEl.checked;
  settings.tradeUseBe = tradeUseBeEl.checked;
  settings.tradeCloseEnd = tradeCloseEndEl.checked;
  settings.tradeRr = Math.max(0.1, parseFloat(tradeRrEl.value) || 0.1);
  settings.backtestUseRange = btUseRangeEl.checked;
  settings.backtestStart = btStartEl.value;
  settings.backtestEnd = btEndEl.value;
  settings.opacity = parseFloat(opacityEl.value);
  settings.demandColor = demandColorEl.value;
  settings.supplyColor = supplyColorEl.value;
  opacityValueEl.textContent = settings.opacity.toFixed(2);
  saveSettings();
  if (candleCache && rawZones.length) {
    activeZones = applyLiquidityFilter(filterZonesByImpulse(filterZonesByRun(rawZones)));
  }
  updateTradeMarkers();
  scheduleRenderZones();
}

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') {
    return `rgba(59,130,246,${alpha})`;
  }
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) {
    return `rgba(59,130,246,${alpha})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildCandleCache(candles) {
  const times = new Array(candles.length);
  const lows = new Array(candles.length);
  const highs = new Array(candles.length);
  const opens = new Array(candles.length);
  const closes = new Array(candles.length);
  const atr = new Array(candles.length).fill(null);
  const trValues = new Array(candles.length);
  let trSum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    times[i] = candles[i].time;
    lows[i] = candles[i].low;
    highs[i] = candles[i].high;
    opens[i] = candles[i].open;
    closes[i] = candles[i].close;
    const prevClose = i > 0 ? closes[i - 1] : closes[i];
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose),
    );
    trValues[i] = tr;
    trSum += tr;
    if (i >= IMPULSE_ATR_PERIOD) {
      trSum -= trValues[i - IMPULSE_ATR_PERIOD];
    }
    if (i >= IMPULSE_ATR_PERIOD - 1) {
      atr[i] = trSum / IMPULSE_ATR_PERIOD;
    }
  }
  return { times, lows, highs, opens, closes, atr };
}

function findLeftIndex(times, target) {
  let lo = 0;
  let hi = times.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] >= target) {
      res = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return res;
}

function findRightIndex(times, target) {
  let lo = 0;
  let hi = times.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] <= target) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res;
}

function findLiquidityTouch(cache, startIdx, endIdx, level, isDemand) {
  const { lows, highs } = cache;
  for (let i = startIdx; i <= endIdx; i += 1) {
    if (isDemand) {
      if (lows[i] <= level) {
        return i;
      }
    } else if (highs[i] >= level) {
      return i;
    }
  }
  return -1;
}

function findBreakOfStructure(cache, pivotIdx, endIdx, isDemand, bosLevel) {
  const { lows, highs } = cache;
  for (let i = pivotIdx + 1; i <= endIdx; i += 1) {
    if (isDemand) {
      if (highs[i] > bosLevel) {
        return i;
      }
    } else if (lows[i] < bosLevel) {
      return i;
    }
  }
  return -1;
}

function confirmSwingLow(cache, idx, limitIdx) {
  const { lows, highs } = cache;
  const minDip = settings.liqMinDipPips * PIP_VALUE;
  const window = Math.max(1, settings.liqSwingWindow);
  const end = Math.min(limitIdx, idx + window);
  if (end <= idx) {
    return false;
  }
  const pivotLow = lows[idx];
  let maxHigh = highs[idx + 1] ?? pivotLow;
  for (let i = idx + 1; i <= end; i += 1) {
    if (lows[i] < pivotLow) {
      return false;
    }
    if (highs[i] > maxHigh) {
      maxHigh = highs[i];
    }
  }
  return maxHigh - pivotLow >= minDip;
}

function confirmSwingHigh(cache, idx, limitIdx) {
  const { lows, highs } = cache;
  const minDip = settings.liqMinDipPips * PIP_VALUE;
  const window = Math.max(1, settings.liqSwingWindow);
  const end = Math.min(limitIdx, idx + window);
  if (end <= idx) {
    return false;
  }
  const pivotHigh = highs[idx];
  let minLow = lows[idx + 1] ?? pivotHigh;
  for (let i = idx + 1; i <= end; i += 1) {
    if (highs[i] > pivotHigh) {
      return false;
    }
    if (lows[i] < minLow) {
      minLow = lows[i];
    }
  }
  return pivotHigh - minLow >= minDip;
}

function findPriorSwingLevel(cache, startIdx, pivotIdx, wantHigh) {
  const { lows, highs } = cache;
  const leftBound = Math.max(startIdx, 0);
  for (let i = pivotIdx - 1; i >= leftBound; i -= 1) {
    if (wantHigh) {
      if (confirmSwingHigh(cache, i, pivotIdx)) {
        return highs[i];
      }
    } else if (confirmSwingLow(cache, i, pivotIdx)) {
      return lows[i];
    }
  }
  return null;
}

function findLiquidityPivot(cache, zone, startIdx, endIdx, isDemand) {
  const { lows, highs } = cache;
  const maxDistance = settings.liqMaxPips * PIP_VALUE;
  const pivots = [];

  for (let i = startIdx; i <= endIdx; i += 1) {
    if (isDemand) {
      if (!confirmSwingLow(cache, i, endIdx)) {
        continue;
      }
      const level = lows[i];
      if (level <= zone.high) {
        continue;
      }
      const dist = level - zone.high;
      if (dist > maxDistance) {
        continue;
      }
      const cluster = countCluster(lows, i, startIdx, endIdx, level);
      if (cluster < settings.liqMinCandles) {
        continue;
      }
      pivots.push({ index: i, level, dist });
    } else {
      if (!confirmSwingHigh(cache, i, endIdx)) {
        continue;
      }
      const level = highs[i];
      if (level >= zone.low) {
        continue;
      }
      const dist = zone.low - level;
      if (dist > maxDistance) {
        continue;
      }
      const cluster = countCluster(highs, i, startIdx, endIdx, level);
      if (cluster < settings.liqMinCandles) {
        continue;
      }
      pivots.push({ index: i, level, dist });
    }
  }

  return pivots;
}

function countCluster(values, idx, startIdx, endIdx, level) {
  const tolerance = settings.liqClusterPips * PIP_VALUE;
  const window = Math.max(1, settings.liqSwingWindow);
  const left = Math.max(startIdx, idx - window);
  const right = Math.min(endIdx, idx + window);
  let count = 1;
  for (let i = idx - 1; i >= left; i -= 1) {
    if (Math.abs(values[i] - level) <= tolerance) {
      count += 1;
    } else {
      break;
    }
  }
  for (let i = idx + 1; i <= right; i += 1) {
    if (Math.abs(values[i] - level) <= tolerance) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}
function applyLiquidityFilter(zones) {
  if (!candleCache) {
    return (zones || []).map((zone) => ({ ...zone, isValid: true }));
  }
  const { times } = candleCache;
  return (zones || []).map((zone) => {
    const label = (zone.label || '').toLowerCase();
    const isDemand = label.includes('demand');
    const isSupply = label.includes('supply');
    if (!isDemand && !isSupply) {
      return { ...zone, isValid: true };
    }
    const startIdx = findLeftIndex(times, zone.start);
    const endIdx = findRightIndex(times, zone.end);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return { ...zone, isValid: false };
    }
    const rangeStart = Math.min(startIdx + 2, endIdx);
    if (rangeStart >= endIdx) {
      return { ...zone, isValid: false, liquidity: [] };
    }

    const pivots = findLiquidityPivot(candleCache, zone, rangeStart, endIdx, isDemand);
    if (!pivots || pivots.length === 0) {
      return { ...zone, isValid: false, liquidity: [] };
    }

    const liquidityLines = pivots
      .map((pivot) => {
        const bosLevel = findPriorSwingLevel(candleCache, startIdx, pivot.index, isDemand);
        const bosLimit = Math.min(endIdx, pivot.index + settings.liqBosWindow);
        const bosIdx = bosLevel === null ? -1 : findBreakOfStructure(candleCache, pivot.index, bosLimit, isDemand, bosLevel);
        if (settings.liqBosOnly && bosIdx === -1) {
          return null;
        }
        const sweepIdx = findLiquidityTouch(candleCache, pivot.index + 1, endIdx, pivot.level, isDemand);
        const lineEndIdx = sweepIdx === -1 ? endIdx : Math.max(pivot.index, sweepIdx - 1);
        return {
          level: pivot.level,
          start: times[pivot.index],
          end: times[lineEndIdx],
          swept: sweepIdx !== -1,
          bos: bosIdx === -1 ? null : times[bosIdx],
          bosLevel,
        };
      })
      .filter(Boolean);

    return { ...zone, isValid: liquidityLines.length > 0, liquidity: liquidityLines };
  });
}

function zoneColors(zone) {
  const label = (zone.label || '').toLowerCase();
  const fillAlpha = settings.opacity;
  const strokeAlpha = Math.min(0.9, settings.opacity + 0.35);
  if (label.includes('supply')) {
    return {
      fill: hexToRgba(settings.supplyColor, fillAlpha),
      stroke: hexToRgba(settings.supplyColor, strokeAlpha),
    };
  }
  if (label.includes('demand')) {
    return {
      fill: hexToRgba(settings.demandColor, fillAlpha),
      stroke: hexToRgba(settings.demandColor, strokeAlpha),
    };
  }
  if (zone.color) {
    return { fill: zone.color, stroke: zone.color };
  }
  return {
    fill: hexToRgba('#3b82f6', fillAlpha),
    stroke: hexToRgba('#3b82f6', strokeAlpha),
  };
}

function renderZones() {
  if (!zonesCtx) {
    return;
  }
  zonesCtx.clearRect(0, 0, overlaySize.width, overlaySize.height);
  if (!settings.showZones || !activeZones || activeZones.length === 0) {
    return;
  }
  const timeScale = chart.timeScale();
  const visibleRange = timeScale.getVisibleRange();
  if (!visibleRange) {
    return;
  }
  const from = typeof visibleRange.from === 'number' ? visibleRange.from : null;
  const to = typeof visibleRange.to === 'number' ? visibleRange.to : null;
  if (from === null || to === null) {
    return;
  }

  activeZones.forEach((zone) => {
    const label = (zone.label || '').toLowerCase();
    if (label.includes('supply') && !settings.showSupply) {
      return;
    }
    if (label.includes('demand') && !settings.showDemand) {
      return;
    }
    const low = Math.min(zone.low, zone.high);
    const high = Math.max(zone.low, zone.high);
    const start = Math.max(zone.start, from);
    const end = Math.min(zone.end, to);
    if (end <= from || start >= to) {
      return;
    }
    const x1 = timeScale.timeToCoordinate(start);
    const x2 = timeScale.timeToCoordinate(end);
    const y1 = candleSeries.priceToCoordinate(high);
    const y2 = candleSeries.priceToCoordinate(low);
    if (x1 === null || x2 === null || y1 === null || y2 === null) {
      return;
    }
    const left = Math.min(x1, x2);
    const width = Math.max(1, Math.abs(x2 - x1));
    const top = Math.min(y1, y2);
    const height = Math.max(1, Math.abs(y2 - y1));
    const colors = zoneColors(zone);
    zonesCtx.fillStyle = colors.fill;
    zonesCtx.fillRect(left, top, width, height);
    zonesCtx.strokeStyle = colors.stroke;
    zonesCtx.strokeRect(left, top, width, height);

    if (settings.showLiquidity && Array.isArray(zone.liquidity)) {
      zone.liquidity.forEach((liq) => {
        const liqStart = Math.max(liq.start, from);
        const liqEnd = Math.min(liq.end, to);
        if (liqEnd > from && liqStart < to) {
          const lx1 = timeScale.timeToCoordinate(liqStart);
          const lx2 = timeScale.timeToCoordinate(liqEnd);
          const ly = candleSeries.priceToCoordinate(liq.level);
          if (lx1 !== null && lx2 !== null && ly !== null) {
            zonesCtx.strokeStyle = 'rgba(226,232,240,0.85)';
            zonesCtx.lineWidth = 1;
            zonesCtx.beginPath();
            zonesCtx.moveTo(lx1, ly);
            zonesCtx.lineTo(lx2, ly);
            zonesCtx.stroke();
          }
        }
      });
    }
  });
}

function computeTradeMarkers(zones) {
  const markers = [];
  const trades = computeTrades(zones);
  trades.forEach((trade) => {
    const entryShape = trade.side === 'long' ? 'arrowUp' : 'arrowDown';
    const entryPos = trade.side === 'long' ? 'belowBar' : 'aboveBar';
    markers.push({
      time: trade.entryTime,
      position: entryPos,
      color: trade.side === 'long' ? '#22c55e' : '#ef4444',
      shape: entryShape,
      text: trade.entryType,
    });
    const closePos = trade.side === 'long' ? 'aboveBar' : 'belowBar';
    markers.push({
      time: trade.closeTime,
      position: closePos,
      color: '#e2e8f0',
      shape: 'circle',
      text: trade.stopHit ? 'SL' : (trade.tpHit ? 'TP' : 'CL'),
    });
  });
  return markers;
}

function computeTrades(zones) {
  if (!candleCache || !zones || zones.length === 0) {
    return [];
  }
  if (!settings.showTrades) {
    return [];
  }
  const { times, opens, highs, lows, closes } = candleCache;
  const trades = [];
  const tfIs30 = tfSelect.value === '30min';
  const stopOffset = tfIs30 ? PIP_VALUE : 0;
  const useSl = settings.tradeUseSl;
  const useTp = settings.tradeUseTp;
  const useBeSetting = settings.tradeUseBe;
  const useAutoRr = settings.tradeAutoRr && tfSelect.value === '5min';
  const closeOnEnd = settings.tradeCloseEnd;
  const rr = Math.max(0, settings.tradeRr || 0);

  zones.forEach((zone) => {
    if (!zone || zone.isValid === false) {
      return;
    }
    const label = (zone.label || '').toLowerCase();
    const isDemand = label.includes('demand');
    const isSupply = label.includes('supply');
    if (!isDemand && !isSupply) {
      return;
    }
    if (isDemand && !settings.showLongTrades) {
      return;
    }
    if (isSupply && !settings.showShortTrades) {
      return;
    }
    if (!settings.entryPrimary && !settings.entryBreak) {
      return;
    }

    const zoneLow = Math.min(zone.low, zone.high);
    const zoneHigh = Math.max(zone.low, zone.high);
    const startIdx = findLeftIndex(times, zone.start);
    const endIdx = findRightIndex(times, zone.end);
    if (startIdx === -1 || endIdx <= startIdx) {
      return;
    }

    if (!Array.isArray(zone.liquidity) || zone.liquidity.length === 0) {
      return;
    }
    const bosTimes = zone.liquidity
      .map((liq) => liq && liq.bos)
      .filter((value) => typeof value === 'number');
    if (bosTimes.length === 0) {
      return;
    }
    const bosTime = Math.min(...bosTimes);
    const bosIdx = findLeftIndex(times, bosTime);
    if (bosIdx === -1) {
      return;
    }
    const scanStart = Math.min(Math.max(startIdx + 1, bosIdx), endIdx);
    if (scanStart >= endIdx) {
      return;
    }

    let tapSeen = false;
    let deepLow = null;
    let deepHigh = null;
    let entryIdx = -1;
    let entryType = '';

    for (let i = scanStart; i <= endIdx; i += 1) {
      const o = opens[i];
      const h = highs[i];
      const l = lows[i];
      const c = closes[i];
      const closeInside = c >= zoneLow && c <= zoneHigh;
      if (closeInside) {
        entryIdx = -1;
        break;
      }
      const touched = l <= zoneHigh && h >= zoneLow;
      if (touched) {
        tapSeen = true;
        deepLow = deepLow === null ? l : Math.min(deepLow, l);
        deepHigh = deepHigh === null ? h : Math.max(deepHigh, h);
      }
      if (!tapSeen) {
        continue;
      }

      let primaryOk = false;
      if (settings.entryPrimary) {
        if (isDemand && c > zoneHigh && c > o) {
          primaryOk = true;
        }
        if (isSupply && c < zoneLow && c < o) {
          primaryOk = true;
        }
      }

      let breakOk = false;
      if (settings.entryBreak && i > 0) {
        if (isDemand && h > highs[i - 1]) {
          breakOk = true;
        }
        if (isSupply && l < lows[i - 1]) {
          breakOk = true;
        }
      }

      if (primaryOk || breakOk) {
        entryIdx = i;
        entryType = primaryOk ? 'P' : 'B';
        break;
      }
    }

    if (entryIdx === -1 || deepLow === null || deepHigh === null) {
      return;
    }

    const entryTime = times[entryIdx];
    const entryPrice = entryType === 'B'
      ? (isDemand ? highs[entryIdx - 1] : lows[entryIdx - 1])
      : closes[entryIdx];

    const stopLevel = isDemand ? deepLow - stopOffset : deepHigh + stopOffset;
    const risk = isDemand ? entryPrice - stopLevel : stopLevel - entryPrice;
    if (!useSl || risk <= 0) {
      return;
    }

    let tpR = rr;
    let beR = null;
    if (useAutoRr) {
      const slPips = risk / PIP_VALUE;
      if (slPips <= 1.5) {
        tpR = 4.5;
        beR = 3;
      } else if (slPips <= 3.5) {
        tpR = 3;
        beR = 2;
      } else if (slPips <= 5.5) {
        tpR = 2.5;
        beR = 2;
      } else {
        tpR = 2;
        beR = null;
      }
    }

    const tpLevel = useTp && tpR > 0
      ? (isDemand ? entryPrice + risk * tpR : entryPrice - risk * tpR)
      : null;
    const beLevel = useBeSetting && beR !== null
      ? (isDemand ? entryPrice + risk * beR : entryPrice - risk * beR)
      : null;
    let activeStop = stopLevel;
    let beActive = false;
    let closeIdx = -1;
    let stopHit = false;
    let tpHit = false;
    for (let j = entryIdx + 1; j <= endIdx; j += 1) {
      const h = highs[j];
      const l = lows[j];
      if (useSl && isDemand && l <= activeStop) {
        closeIdx = j;
        stopHit = true;
        break;
      }
      if (useSl && isSupply && h >= activeStop) {
        closeIdx = j;
        stopHit = true;
        break;
      }
      if (tpLevel !== null && useTp && isDemand && h >= tpLevel) {
        closeIdx = j;
        tpHit = true;
        break;
      }
      if (tpLevel !== null && useTp && isSupply && l <= tpLevel) {
        closeIdx = j;
        tpHit = true;
        break;
      }
      if (!beActive && beLevel !== null) {
        if (isDemand && h >= beLevel) {
          activeStop = entryPrice;
          beActive = true;
        }
        if (isSupply && l <= beLevel) {
          activeStop = entryPrice;
          beActive = true;
        }
      }
    }
    if (closeIdx === -1) {
      if (!closeOnEnd) {
        return;
      }
      closeIdx = endIdx;
    }
    const closeTime = times[closeIdx];
    const closePrice = stopHit ? activeStop : (tpHit ? tpLevel : closes[closeIdx]);

    trades.push({
      side: isDemand ? 'long' : 'short',
      entryType,
      entryIdx,
      entryTime,
      entryPrice,
      stopLevel,
      tpLevel,
      closeIdx,
      closeTime,
      closePrice,
      stopHit,
      tpHit,
      beActive,
      zoneLabel: zone.label || '',
      zoneStart: zone.start,
      zoneEnd: zone.end,
      zoneLow,
      zoneHigh,
      bosTime,
    });
  });

  return trades;
}

function updateTradeMarkers() {
  if (!candleSeries || !candleCache) {
    return;
  }
  if (!settings.showTrades) {
    tradeMarkers = [];
    currentTrades = [];
    candleSeries.setMarkers([]);
    updateBacktestPanel([]);
    updateTradeDetails(null);
    return;
  }
  currentTrades = computeTrades(activeZones || []);
  tradeMarkers = tradesToMarkers(currentTrades);
  candleSeries.setMarkers(tradeMarkers);
  updateBacktestPanel(currentTrades);
  updateTradeDetails(null);
}

function tradesToMarkers(trades) {
  return (trades || []).flatMap((trade) => {
    const entryShape = trade.side === 'long' ? 'arrowUp' : 'arrowDown';
    const entryPos = trade.side === 'long' ? 'belowBar' : 'aboveBar';
    const entryColor = trade.side === 'long' ? '#22c55e' : '#ef4444';
    const closePos = trade.side === 'long' ? 'aboveBar' : 'belowBar';
    return [
      {
        time: trade.entryTime,
        position: entryPos,
        color: entryColor,
        shape: entryShape,
        text: trade.entryType,
      },
      {
        time: trade.closeTime,
        position: closePos,
        color: '#e2e8f0',
        shape: 'circle',
        text: trade.stopHit ? 'SL' : (trade.tpHit ? 'TP' : 'CL'),
      },
    ];
  });
}

function updateBacktestPanel(trades) {
  if (!backtestPanelEl) {
    return;
  }
  if (!settings.showTrades) {
    backtestPanelEl.classList.add('hidden');
    if (btDetailsEl) {
      btDetailsEl.classList.add('hidden');
    }
    return;
  }
  backtestPanelEl.classList.remove('hidden');
  const range = chart.timeScale().getVisibleRange();
  let filtered = trades || [];
  const useRange = btUseRangeEl && btUseRangeEl.checked;
  if (useRange) {
    const start = parseDatetimeLocal(btStartEl.value);
    const end = parseDatetimeLocal(btEndEl.value);
    if (start && end) {
      let startTs = Math.floor(start.getTime() / 1000);
      let endTs = Math.floor(end.getTime() / 1000);
      if (startTs > endTs) {
        [startTs, endTs] = [endTs, startTs];
      }
      filtered = filtered.filter((t) => t.entryTime >= startTs && t.entryTime <= endTs);
    }
  } else if (btVisibleEl && btVisibleEl.checked && range && typeof range.from === 'number' && typeof range.to === 'number') {
    filtered = filtered.filter((t) => t.entryTime >= range.from && t.entryTime <= range.to);
  }
  const totals = {
    trades: filtered.length,
    wins: 0,
    losses: 0,
    totalR: 0,
    longs: 0,
    shorts: 0,
    primary: 0,
    break: 0,
    sl: 0,
    close: 0,
  };
  filtered.forEach((t) => {
    const risk = t.side === 'long' ? t.entryPrice - t.stopLevel : t.stopLevel - t.entryPrice;
    const reward = t.side === 'long' ? t.closePrice - t.entryPrice : t.entryPrice - t.closePrice;
    const r = risk > 0 ? reward / risk : 0;
    totals.totalR += r;
    if (r > 0) {
      totals.wins += 1;
    } else if (r < 0) {
      totals.losses += 1;
    }
    if (t.side === 'long') {
      totals.longs += 1;
    } else {
      totals.shorts += 1;
    }
    if (t.entryType === 'P') {
      totals.primary += 1;
    } else {
      totals.break += 1;
    }
    if (t.stopHit) {
      totals.sl += 1;
    } else {
      totals.close += 1;
    }
  });
  const winRate = totals.trades ? Math.round((totals.wins / totals.trades) * 100) : 0;
  const avgR = totals.trades ? totals.totalR / totals.trades : 0;
  btTradesEl.textContent = String(totals.trades);
  btWinsEl.textContent = String(totals.wins);
  btLossesEl.textContent = String(totals.losses);
  btWinrateEl.textContent = `${winRate}%`;
  btAvgREl.textContent = avgR.toFixed(2);
  btTotalREl.textContent = totals.totalR.toFixed(2);
  btLongsEl.textContent = String(totals.longs);
  btShortsEl.textContent = String(totals.shorts);
  btPrimaryEl.textContent = String(totals.primary);
  btBreakEl.textContent = String(totals.break);
  btSlEl.textContent = String(totals.sl);
  btCloseEl.textContent = String(totals.close);
}

function updateTradeDetails(trade) {
  if (!btDetailsEl || !btDetailsBodyEl) {
    return;
  }
  if (!trade) {
    btDetailsEl.classList.add('hidden');
    return;
  }
  btDetailsEl.classList.remove('hidden');
  const riskPips = Math.abs(trade.entryPrice - trade.stopLevel) / PIP_VALUE;
  const rewardPips = Math.abs(trade.closePrice - trade.entryPrice) / PIP_VALUE;
  const rValue = riskPips > 0 ? rewardPips / riskPips : 0;
  const result = trade.stopHit ? 'SL' : (trade.tpHit ? 'TP' : 'CL');
  const lines = [
    `Side: ${trade.side.toUpperCase()} (${trade.entryType})`,
    `Entry: ${formatTimestamp(trade.entryTime)} @ ${formatPrice(trade.entryPrice)}`,
    `Stop: ${formatPrice(trade.stopLevel)} (${riskPips.toFixed(1)} pips)`,
    trade.tpLevel ? `TP: ${formatPrice(trade.tpLevel)}` : 'TP: n/a',
    `Result: ${result} (R ${rValue.toFixed(2)})`,
    `BoS: ${trade.bosTime ? formatTimestamp(trade.bosTime) : 'n/a'}`,
    `Zone: ${formatTimestamp(trade.zoneStart)} → ${formatTimestamp(trade.zoneEnd)}`,
  ];
  btDetailsBodyEl.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
}

function filterZonesByRun(zones) {
  if (!settings.zoneMinRun || settings.zoneMinRun <= 1) {
    return zones || [];
  }
  return (zones || []).filter((zone) => {
    if (typeof zone.run_len !== 'number') {
      const runLen = computeRunLen(zone);
      if (runLen === null) {
        return true;
      }
      return runLen >= settings.zoneMinRun;
    }
    return zone.run_len >= settings.zoneMinRun;
  });
}

function computeRunLen(zone) {
  if (!candleCache) {
    return null;
  }
  const { times, opens, closes } = candleCache;
  const baseIdx = findLeftIndex(times, zone.start);
  if (baseIdx === -1) {
    return null;
  }
  const label = (zone.label || '').toLowerCase();
  const isDemand = label.includes('demand');
  const isSupply = label.includes('supply');
  if (!isDemand && !isSupply) {
    return null;
  }
  let runLen = 0;
  let idx = baseIdx + 1;
  while (idx < times.length) {
    const isBull = closes[idx] > opens[idx];
    const isBear = closes[idx] < opens[idx];
    if (isDemand && isBull) {
      runLen += 1;
      idx += 1;
      continue;
    }
    if (isSupply && isBear) {
      runLen += 1;
      idx += 1;
      continue;
    }
    break;
  }
  return runLen;
}

function computeImpulseRatio(zone) {
  if (!candleCache) {
    return null;
  }
  const { times, opens, closes, atr } = candleCache;
  const baseIdx = findLeftIndex(times, zone.start);
  if (baseIdx === -1 || baseIdx + 1 >= times.length) {
    return null;
  }
  const label = (zone.label || '').toLowerCase();
  const isDemand = label.includes('demand');
  const isSupply = label.includes('supply');
  if (!isDemand && !isSupply) {
    return null;
  }
  let idx = baseIdx + 1;
  const runStart = idx;
  if (isDemand) {
    while (idx < times.length && closes[idx] > opens[idx]) {
      idx += 1;
    }
  } else {
    while (idx < times.length && closes[idx] < opens[idx]) {
      idx += 1;
    }
  }
  const runEnd = idx - 1;
  if (runEnd < runStart) {
    return null;
  }
  const move = isDemand
    ? closes[runEnd] - opens[runStart]
    : opens[runStart] - closes[runEnd];
  const atrVal = atr[baseIdx];
  if (!atrVal || atrVal <= 0) {
    return null;
  }
  return move / atrVal;
}

function filterZonesByImpulse(zones) {
  if (!settings.zoneImpulseAtr || settings.zoneImpulseAtr <= 0) {
    return zones || [];
  }
  return (zones || []).filter((zone) => {
    if (typeof zone.impulse_ratio === 'number') {
      return zone.impulse_ratio >= settings.zoneImpulseAtr;
    }
    const ratio = computeImpulseRatio(zone);
    if (ratio === null) {
      return true;
    }
    zone.impulse_ratio = ratio;
    return ratio >= settings.zoneImpulseAtr;
  });
}

function scheduleRenderZones() {
  if (renderPending) {
    return;
  }
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    renderZones();
  });
}

function drawZones(zones) {
  activeZones = zones || [];
  scheduleRenderZones();
}

function drawLevels(levels) {
  clearLevels();
  if (!levels || levels.length === 0) {
    return;
  }
  levels.forEach((level) => {
    const line = candleSeries.createPriceLine({
      price: level.price,
      color: level.color || '#f59e0b',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: level.label || '',
    });
    levelLines.push(line);
  });
}

function updateHoverPriceLine(candle, mousePrice) {
  if (!candle || mousePrice === null || mousePrice === undefined) {
    return;
  }
  const picks = [
    { label: 'O', price: candle.open },
    { label: 'H', price: candle.high },
    { label: 'L', price: candle.low },
    { label: 'C', price: candle.close },
  ];
  let best = picks[0];
  let bestDist = Math.abs(mousePrice - picks[0].price);
  for (let i = 1; i < picks.length; i += 1) {
    const dist = Math.abs(mousePrice - picks[i].price);
    if (dist < bestDist) {
      best = picks[i];
      bestDist = dist;
    }
  }
  const threshold = Math.max(Math.abs(mousePrice) * MAGNET_PCT, MIN_STEP * 10);
  const snap = bestDist <= threshold;
  const price = snap ? best.price : mousePrice;
  const title = snap ? best.label : '';
  if (!hoverPriceLine) {
    hoverPriceLine = candleSeries.createPriceLine({
      price,
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title,
    });
  } else {
    hoverPriceLine.applyOptions({
      price,
      title,
    });
  }
}

async function loadWithBase(basePath, broker, tf) {
  const root = `${basePath}/${broker}`;
  const candles = await loadJson(`${root}/eurusd_${tf}.json`);
  const zones =
    (await loadJsonOptional(`${root}/zones_${tf}.json`, null)) ??
    (await loadJsonOptional(`${root}/zones.json`, []));
  const levels =
    (await loadJsonOptional(`${root}/levels_${tf}.json`, null)) ??
    (await loadJsonOptional(`${root}/levels.json`, []));
  return { candles, zones, levels };
}

async function loadChart() {
  const tf = tfSelect.value;
  const broker = brokerSelect.value;
  setStatus(`Loading ${broker} ${tf}...`);
  try {
    const baseCandidates = ['../data', '/data'];
    let payload = null;
    let basePath = null;
    let loadedBroker = null;
    const brokerCandidates = broker === 'vantage' ? ['vantage', 'fxcm'] : ['fxcm', 'vantage'];
    for (const candidate of baseCandidates) {
      for (const brokerCandidate of brokerCandidates) {
        try {
          payload = await loadWithBase(candidate, brokerCandidate, tf);
          basePath = candidate;
          loadedBroker = brokerCandidate;
          break;
        } catch (err) {
          // try next candidate
        }
      }
      if (payload) {
        break;
      }
    }
    if (!payload) {
      throw new Error('Failed to load data. Start server from rd_strat and open /viewer/.');
    }

    const { candles, zones, levels } = payload;
    candleSeries.setData(candles);
    candleCache = buildCandleCache(candles);
    rawZones = zones || [];
    activeZones = applyLiquidityFilter(filterZonesByImpulse(filterZonesByRun(rawZones)));
    resizeZonesOverlay();
    drawZones(activeZones);
    drawLevels(levels);
    updateTradeMarkers();

    chart.timeScale().fitContent();
    scheduleRenderZones();
    if (loadedBroker && loadedBroker !== broker) {
      brokerSelect.value = loadedBroker;
    }
    setStatus(`Loaded ${loadedBroker} ${tf} (${candles.length} bars) from ${basePath}`);
  } catch (err) {
    setStatus(err.message);
  }
}

reloadBtn.addEventListener('click', () => loadChart());
tfSelect.addEventListener('change', () => loadChart());
brokerSelect.addEventListener('change', () => loadChart());
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});
showZonesEl.addEventListener('change', () => updateSettingsFromUI());
showDemandEl.addEventListener('change', () => updateSettingsFromUI());
showSupplyEl.addEventListener('change', () => updateSettingsFromUI());
showLiquidityEl.addEventListener('change', () => updateSettingsFromUI());
liqBosOnlyEl.addEventListener('change', () => updateSettingsFromUI());
liqSwingWindowEl.addEventListener('change', () => updateSettingsFromUI());
liqBosWindowEl.addEventListener('change', () => updateSettingsFromUI());
liqMinCandlesEl.addEventListener('change', () => updateSettingsFromUI());
liqClusterPipsEl.addEventListener('change', () => updateSettingsFromUI());
liqMaxPipsEl.addEventListener('change', () => updateSettingsFromUI());
liqMinDipEl.addEventListener('change', () => updateSettingsFromUI());
zoneMinRunEl.addEventListener('change', () => updateSettingsFromUI());
zoneImpulseAtrEl.addEventListener('change', () => updateSettingsFromUI());
zoneMinGapEl.addEventListener('change', () => updateSettingsFromUI());
showTradesEl.addEventListener('change', () => updateSettingsFromUI());
showLongTradesEl.addEventListener('change', () => updateSettingsFromUI());
showShortTradesEl.addEventListener('change', () => updateSettingsFromUI());
entryPrimaryEl.addEventListener('change', () => updateSettingsFromUI());
entryBreakEl.addEventListener('change', () => updateSettingsFromUI());
tradeUseSlEl.addEventListener('change', () => updateSettingsFromUI());
tradeUseTpEl.addEventListener('change', () => updateSettingsFromUI());
tradeAutoRrEl.addEventListener('change', () => updateSettingsFromUI());
tradeUseBeEl.addEventListener('change', () => updateSettingsFromUI());
tradeCloseEndEl.addEventListener('change', () => updateSettingsFromUI());
tradeRrEl.addEventListener('change', () => updateSettingsFromUI());
btVisibleEl.addEventListener('change', () => updateBacktestPanel(currentTrades));
btUseRangeEl.addEventListener('change', () => updateSettingsFromUI());
btStartEl.addEventListener('change', () => updateSettingsFromUI());
btEndEl.addEventListener('change', () => updateSettingsFromUI());
opacityEl.addEventListener('input', () => updateSettingsFromUI());
demandColorEl.addEventListener('input', () => updateSettingsFromUI());
supplyColorEl.addEventListener('input', () => updateSettingsFromUI());

loadSettings();
applySettingsToUI();
resizeZonesOverlay();
window.addEventListener('resize', () => {
  resizeZonesOverlay();
  scheduleRenderZones();
});
chart.timeScale().subscribeVisibleTimeRangeChange(() => scheduleRenderZones());
chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
  scheduleRenderZones();
  updateBacktestPanel(currentTrades);
});
const rightScale = chart.priceScale('right');
if (rightScale && rightScale.subscribeVisibleLogicalRangeChange) {
  rightScale.subscribeVisibleLogicalRangeChange(() => scheduleRenderZones());
}

chart.subscribeCrosshairMove((param) => {
  if (!param || !param.point || param.time === undefined) {
    if (hoverPriceLine) {
      candleSeries.removePriceLine(hoverPriceLine);
      hoverPriceLine = null;
    }
    return;
  }
  const candle = param.seriesData.get(candleSeries);
  if (!candle) {
    return;
  }
  const mousePrice = candleSeries.coordinateToPrice(param.point.y);
  updateHoverPriceLine(candle, mousePrice);
});

chart.subscribeClick((param) => {
  if (!param || param.time === undefined || !candleCache) {
    updateTradeDetails(null);
    return;
  }
  const idx = findLeftIndex(candleCache.times, param.time);
  if (idx === -1) {
    updateTradeDetails(null);
    return;
  }
  const trade = (currentTrades || []).find((t) => t.entryIdx === idx || t.closeIdx === idx);
  updateTradeDetails(trade || null);
});

loadChart();
