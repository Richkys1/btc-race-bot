# Range Rider — a cbBTC swing bot

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Richkys1/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Richkys1/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A BTC trading bot for make.fun's [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261117-0603) bounty. It trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, on 1,000 USDC of paper money — nothing is traded for real.

## Strategy: trade the range, not the trend

BTC on 1-minute bars is mostly noise around a slow drift, with multi-hour swings of 1%+ that revert. Range Rider buys only when the price sits within 40 bps above the lowest low of the last 8 hours (480 one-minute bars), and sells only when it comes back within 10 bps below the highest high of the same 8 hours. A hard stop 120 bps below the entry caps a falling-knife loss, and a trend filter refuses entries when the 8-hour return is steeply negative (a downtrend, not a range). A late-window safety net buys once and holds if the bot has still made no trade by bar 1200 in a clear uptrend, so the entry still meets the guardrail of at least one trade.

It holds at most one full-size position and trades a handful of times per day: a full round trip costs ~35 bps in fees, slippage and price impact, so frequent trading on 1-minute noise loses money — that is what kills the EMA-cross and RSI-Bollinger baselines on the dev window.

## Dev result (local grade, kit harness)

- **Net PnL +28.83 USDC** on the 1,440-bar dev window (buy-and-hold: +1.07, momentum: +2.45, EMA-cross: −106.21, RSI-Bollinger: −24.25, ADX-momentum: −32.66)
- 5 trades, win rate 0.67, max drawdown 0.75%, 0 rejected orders
- At 2× fees the net PnL is still +26.37 USDC
- Deterministic: two executions reproduce byte for byte

## Run it

```sh
node main.ts
```

`main.ts` speaks `agent-fun/bars-replay/v1` on stdin/stdout via the vendored SDK shim (`vendor/makefun-bars.ts`, a byte-for-byte copy of the kit's shim). Standard library only; no network, no clock, no files outside the repo. BigInt arithmetic throughout, so the two graded executions agree exactly.

---

<sub>Entered on [make.fun](https://make.fun/?ref=xmc7n7gx&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
