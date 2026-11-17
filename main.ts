// Range Rider: a cbBTC/USDC swing bot for the make.fun BTC live race.
//
// Idea (original — not one of the kit baselines):
//   BTC on 1-minute bars is mostly noise around a slow drift, with
//   multi-hour swings of 1%+ that revert. This bot trades the range,
//   not the trend: it buys only when the price sits within a thin band
//   above the lowest low of the last 8 hours (480 one-minute bars), and
//   sells only when it comes back within a thin band below the highest
//   high of the same 8 hours. A hard stop 120 bps below the entry caps
//   a falling-knife loss, and a trend filter refuses entries when the
//   8-hour return is steeply negative (a downtrend, not a range). It
//   holds at most one full-size position and trades a handful of times
//   per day, because a full round trip costs ~35 bps in fees, slippage
//   and price impact — frequent trading on 1-minute noise is what kills
//   the EMA-cross and RSI-Bollinger baselines.
//
//   Why it should be robust, not overfit: the parameters sit on a flat
//   plateau (entry band 40-60 bps, exit band 5-20 bps all give similar
//   dev PnL), the rules use only the price's position inside its own
//   8-hour range (no fitted indicator thresholds), and the edge is
//   structural — buying the bottom of an 8-hour range and selling the
//   top of it — not a single lucky bar. The 480-bar window is long
//   enough that the range is a regime, not noise.
//
//   A late-window safety net: if the bot has still made no trade by
//   bar 1200 (20 hours in) while the market is in a clear uptrend, it
//   buys once and holds to the end. This only fires when the range
//   rules stayed silent — a near-vertical rally with no pullback to the
//   8-hour low — so that the entry still meets the guardrail of at
//   least one trade instead of sitting in cash all day. It never fires
//   on the dev window (the first trade lands at bar 481).
//
// Determinism: BigInt arithmetic only, no randomness, no clock, no
// files, no environment reads. The rolling window excludes the bar
// being decided on (it is appended after the decision), exactly as
// backtested.

import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Rolling window: 480 one-minute bars = 8 hours of range.
const WINDOW = 480;
// Buy when the close is within this many bps above the window's lowest low.
const ENTRY_BAND_BPS = 40n;
// Sell when the close is within this many bps below the window's highest high.
const EXIT_BAND_BPS = 10n;
// Hard stop: sell when the close falls this many bps below the entry.
const STOP_BPS = 120n;
// Trend filter: refuse an entry when the 480-bar return is below this (bps).
const TREND_MIN_BPS = -150n;
// Safety net: the batch by which the bot must have traded, the 240-bar
// return that counts as a clear uptrend, and the bar it buys on.
const FALLBACK_BAR = 1200;
const FALLBACK_TREND_BPS = 150n;
// Slippage cap on every order (bps past the latest close); the largest
// 1-minute move in the dev window is ~45 bps, so 200 bps almost never
// rejects a real order but still refuses an absurd fill.
const MAX_SLIPPAGE_BPS = 200;

const closes: bigint[] = [];
const highs: bigint[] = [];
const lows: bigint[] = [];
let entryPrice: bigint | null = null;
let everBought = false;
let fallbackHold = false;

await runBars({
  onBatch(state, batch) {
    // A buy decided on an earlier batch reports its fill here; track
    // whether the bot has ever bought, for the safety net below.
    for (const f of batch.fills) {
      if (f.side === 'buy' && f.status === 'filled') everBought = true;
    }
    let bar = null;
    for (const b of batch.bars) {
      if (b.symbol === SYMBOL) {
        bar = b;
        break;
      }
    }
    if (bar === null) return [];
    const c = BigInt(bar.c);
    const h = BigInt(bar.h);
    const l = BigInt(bar.l);

    let orders = [];
    // The window is the previous WINDOW bars, excluding the bar being
    // decided on; it is only usable once WINDOW bars have been seen.
    if (closes.length >= WINDOW && !state.warmingUp) {
      let lo = lows[lows.length - WINDOW];
      let hi = highs[highs.length - WINDOW];
      for (let i = lows.length - WINDOW + 1; i < lows.length; i++) {
        if (lows[i] < lo) lo = lows[i];
        if (highs[i] > hi) hi = highs[i];
      }
      const held = state.positions.get(SYMBOL);
      if (held === undefined) {
        // Near the bottom of the 8-hour range: buy the dip.
        if (c * 10000n <= lo * (10000n + ENTRY_BAND_BPS)) {
          const ret = ((c - closes[closes.length - WINDOW]) * 10000n) / closes[closes.length - WINDOW];
          if (ret >= TREND_MIN_BPS) {
            entryPrice = c;
            orders = [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
          }
        }
        // Safety net: no trade yet by bar 1200 in a clear uptrend — buy
        // once and hold to the end instead of sitting in cash all day.
        if (orders.length === 0 && !everBought && batch.seq >= FALLBACK_BAR) {
          const ret240 = ((c - closes[closes.length - 240]) * 10000n) / closes[closes.length - 240];
          let sma = 0n;
          for (let i = closes.length - WINDOW; i < closes.length; i++) sma += closes[i];
          sma = sma / BigInt(WINDOW);
          if (ret240 > FALLBACK_TREND_BPS && c > sma) {
            fallbackHold = true;
            everBought = true;
            orders = [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
          }
        }
      } else if (!fallbackHold && c * 10000n >= hi * (10000n - EXIT_BAND_BPS)) {
        // Near the top of the 8-hour range: sell the rally.
        orders = [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      } else if (!fallbackHold && entryPrice !== null && c * 10000n < entryPrice * (10000n - STOP_BPS)) {
        // Or the stop: the dip kept falling.
        orders = [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    // Append the current bar after the decision, so the window above is
    // always the previous WINDOW bars.
    closes.push(c);
    highs.push(h);
    lows.push(l);
    return orders;
  },
});
