"""
Folio — Rebalance Engine

Takes ASP planner output + portfolio state + user investor profile + scenario
and produces a concrete, beginner-readable rebalance plan with specific trades.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data"))
from etf_universe import get_universe, top_pick, BUCKET_LABELS

# ── Target allocations by risk profile (%) ─────────────────────────────────────
_BASE_ALLOC: dict[str, dict[str, float]] = {
    "conservative": {
        "us_equity_broad": 15, "us_equity_growth":  0, "us_equity_value":  5,
        "dividend":        10, "international":      5, "bonds_medium":    25,
        "bonds_short":     15, "bonds_tips":          5, "defensive":        5,
        "real_estate":      5, "commodities":         0, "financials":       0,
        "cash":            10,
    },
    "moderate": {
        "us_equity_broad": 30, "us_equity_growth": 10, "us_equity_value":  5,
        "dividend":        10, "international":     10, "bonds_medium":    15,
        "bonds_short":      5, "bonds_tips":         0, "defensive":        5,
        "real_estate":      5, "commodities":        5, "financials":       0,
        "cash":             0,
    },
    "aggressive": {
        "us_equity_broad": 30, "us_equity_growth": 25, "us_equity_value":  5,
        "dividend":         5, "international":     15, "bonds_medium":     5,
        "bonds_short":      0, "bonds_tips":         0, "defensive":        5,
        "real_estate":      5, "commodities":        5, "financials":       0,
        "cash":             0,
    },
}

# Scenario adjustments (additive deltas, then normalised to 100%)
_SCENARIO_DELTA: dict[str, dict[str, float]] = {
    "market_crash": {
        "us_equity_broad": -10, "us_equity_growth": -10, "international": -5,
        "bonds_medium": +10, "bonds_short": +5, "commodities": +5,
        "cash": +10, "defensive": +5, "dividend": +5, "real_estate": -5,
    },
    "recession": {
        "us_equity_broad": -10, "us_equity_growth": -10, "international": -5,
        "bonds_medium": +10, "bonds_short": +5, "defensive": +10, "dividend": +5,
        "real_estate": -5,
    },
    "tech_selloff": {
        "us_equity_growth": -15, "us_equity_broad": -5,
        "defensive": +10, "dividend": +5, "bonds_medium": +5,
    },
    "rate_hike": {
        "bonds_medium": -10, "bonds_long": -5, "bonds_short": +10,
        "financials": +5, "bonds_tips": +5, "us_equity_value": +5,
    },
    "bull_market": {
        "us_equity_broad": +10, "us_equity_growth": +10,
        "bonds_medium": -10, "bonds_short": -5, "cash": -5,
    },
}

# Map goal → nudge on top of risk profile
_GOAL_NUDGE: dict[str, dict[str, float]] = {
    "wealth_growth":  {"us_equity_growth": +5, "bonds_medium": -5},
    "retirement":     {"dividend": +5, "bonds_medium": +5, "us_equity_growth": -10},
    "home_purchase":  {"bonds_short": +10, "cash": +5, "us_equity_growth": -15},
    "family_future":  {"us_equity_broad": +5, "dividend": +5, "us_equity_growth": -10},
    "emergency":      {"cash": +10, "bonds_short": +10, "us_equity_growth": -20},
    "learning":       {},
}

# Ticker → canonical bucket override
_TICKER_BUCKET: dict[str, str] = {
    "BND": "bonds_medium",  "AGG": "bonds_medium",  "IEF": "bonds_medium",
    "TLT": "bonds_long",    "SHY": "bonds_short",   "SHV": "bonds_short",
    "SGOV": "bonds_short",  "TIP": "bonds_tips",     "SCHP": "bonds_tips",
    "LQD": "bonds_corporate","HYG": "bonds_corporate",
    "VTI": "us_equity_broad","VOO": "us_equity_broad","SPY": "us_equity_broad",
    "IVV": "us_equity_broad","ITOT": "us_equity_broad",
    "QQQ": "us_equity_growth","VUG": "us_equity_growth","IWF": "us_equity_growth",
    "VTV": "us_equity_value","IVE": "us_equity_value",
    "SCHD": "dividend",      "VYM": "dividend",      "DVY": "dividend",
    "VXUS": "international", "EFA": "international", "VEA": "international",
    "VWO": "international",  "EEM": "international",
    "XLV": "defensive",      "XLU": "defensive",     "XLP": "defensive",
    "USMV": "defensive",
    "VNQ": "real_estate",    "IYR": "real_estate",   "SCHH": "real_estate",
    "GLD": "commodities",    "IAU": "commodities",   "PDBC": "commodities",
    "XLF": "financials",     "KBE": "financials",
    "AAPL": "us_equity_growth","MSFT": "us_equity_growth","GOOGL": "us_equity_growth",
    "META": "us_equity_growth","AMZN": "us_equity_growth","NVDA": "us_equity_growth",
    "TSLA": "us_equity_growth","JPM": "financials","BAC": "financials","GS": "financials",
}
_TYPE_BUCKET = {"bond": "bonds_medium", "etf": "us_equity_broad",
                "fund": "us_equity_broad", "cash": "cash"}


def _holding_bucket(symbol: str, asset_type: str) -> str:
    return _TICKER_BUCKET.get(symbol.upper()) or _TYPE_BUCKET.get(asset_type, "us_equity_growth")


def _target_allocation(risk_str: str, goal: str, scenario: str | None) -> dict[str, float]:
    key   = risk_str if risk_str in _BASE_ALLOC else "moderate"
    alloc = dict(_BASE_ALLOC[key])

    for bucket, delta in _GOAL_NUDGE.get(goal, {}).items():
        if bucket in alloc:
            alloc[bucket] = max(0, alloc[bucket] + delta)

    if scenario in _SCENARIO_DELTA:
        for bucket, delta in _SCENARIO_DELTA[scenario].items():
            if bucket in alloc:
                alloc[bucket] = max(0, alloc[bucket] + delta)

    total = sum(alloc.values()) or 1
    alloc = {k: round(v / total * 100, 1) for k, v in alloc.items()}
    return {k: v for k, v in alloc.items() if v > 0}


# ── Main entry point ───────────────────────────────────────────────────────────

def generate_rebalance_plan(
    portfolio:  dict,
    prices:     dict,
    betas:      dict,
    profile:    dict,
    scenario:   str | None,
    asp_result: dict,
) -> tuple[dict, str]:
    """
    Returns (plan_dict, reasoning_paragraph).

    plan_dict keys:
      target_allocation  — {bucket: target_pct}
      gap_analysis       — {bucket: {current_pct, target_pct, gap_pct, label}}
      trades             — [{action, ticker, name, shares, price, value, bucket, reason, is_new}]
      before             — {holdings, total_value, cash}
      after              — {holdings, total_value}
    """
    holdings = portfolio.get("holdings", [])
    cash     = float(portfolio.get("cash", 0))

    risk_str = (profile.get("risk_level") or "Moderate").lower()
    goal_raw = profile.get("goal") or "wealth_growth"

    # ── 1. Value current portfolio ─────────────────────────────────────────
    valued: list[dict] = []
    total = cash
    for h in holdings:
        price = float(prices.get(h["symbol"]) or h.get("avg_cost") or 0)
        val   = h["shares"] * price
        total += val
        valued.append({**h, "current_price": price, "current_value": val})
    if total == 0:
        total = 1

    # ── 2. Current bucket allocation ──────────────────────────────────────
    current_by_bucket: dict[str, float] = {"cash": cash / total * 100}
    for h in valued:
        b = _holding_bucket(h["symbol"], h.get("type", "stock"))
        current_by_bucket[b] = current_by_bucket.get(b, 0) + h["current_value"] / total * 100

    # ── 3. Target allocation ──────────────────────────────────────────────
    target = _target_allocation(risk_str, goal_raw, scenario)

    # ── 4. Gap analysis ───────────────────────────────────────────────────
    all_buckets = set(list(current_by_bucket.keys()) + list(target.keys()))
    gap_analysis: dict[str, dict] = {}
    for b in all_buckets:
        cur = round(current_by_bucket.get(b, 0), 1)
        tgt = round(target.get(b, 0), 1)
        gap_analysis[b] = {
            "current_pct": cur,
            "target_pct":  tgt,
            "gap_pct":     round(tgt - cur, 1),
            "label":       BUCKET_LABELS.get(b, b.replace("_", " ").title()),
        }

    # ── 5. Generate sell trades (overweight holdings) ─────────────────────
    trades: list[dict] = []
    for h in valued:
        b   = _holding_bucket(h["symbol"], h.get("type", "stock"))
        gap = gap_analysis.get(b, {}).get("gap_pct", 0)
        cur = gap_analysis.get(b, {}).get("current_pct", 0)
        tgt = gap_analysis.get(b, {}).get("target_pct", 0)

        if gap < -3 and h["current_value"] > 0 and h["current_price"] > 0:
            overweight_val = abs(gap / 100) * total
            sell_val    = min(overweight_val, h["current_value"] * 0.6)
            sell_shares = max(1, int(sell_val / h["current_price"]))
            sell_val    = round(sell_shares * h["current_price"], 2)
            trades.append({
                "action":  "sell",
                "ticker":  h["symbol"],
                "name":    h.get("name", h["symbol"]),
                "shares":  sell_shares,
                "price":   round(h["current_price"], 2),
                "value":   sell_val,
                "bucket":  b,
                "reason":  _sell_reason(h, b, cur, tgt, scenario, betas.get(h["symbol"], 1.0)),
                "is_new":  False,
            })

    # ── 6. Generate buy trades (underweight buckets) ───────────────────────
    sell_proceeds        = sum(t["value"] for t in trades if t["action"] == "sell")
    buy_budget           = cash + sell_proceeds
    underweight: list[tuple[str, float]] = sorted(
        [(b, g["gap_pct"]) for b, g in gap_analysis.items() if g["gap_pct"] > 3 and b != "cash"],
        key=lambda x: -x[1],
    )
    total_pos_gap = sum(g for _, g in underweight) or 1

    for b, gap_pct in underweight:
        if buy_budget <= 10:
            break
        etf = top_pick(b)
        if not etf:
            continue

        # If ETF price is 0 (fallback entry), try to fetch it live
        etf_price = etf.get("price", 0)
        if etf_price <= 0:
            try:
                import yfinance as yf
                info = yf.Ticker(etf["ticker"]).info
                etf_price = (info.get("currentPrice") or info.get("regularMarketPrice")
                             or info.get("navPrice") or info.get("previousClose") or 0)
                etf_price = round(float(etf_price), 2)
            except Exception:
                continue
        if etf_price <= 0:
            continue

        bucket_budget = min(buy_budget, (gap_pct / total_pos_gap) * (cash + sell_proceeds))
        buy_shares    = max(1, int(bucket_budget / etf_price))
        buy_val       = round(buy_shares * etf_price, 2)
        buy_budget   -= buy_val

        trades.append({
            "action":  "buy",
            "ticker":  etf["ticker"],
            "name":    BUCKET_LABELS.get(b, b),
            "shares":  buy_shares,
            "price":   etf_price,
            "value":   buy_val,
            "bucket":  b,
            "reason":  _buy_reason(b, gap_analysis[b]["current_pct"],
                                   gap_analysis[b]["target_pct"], scenario, etf),
            "is_new":  True,
        })

    # ── 7. Before snapshot ────────────────────────────────────────────────
    before_holdings = [
        {
            "ticker": h["symbol"],
            "name":   h.get("name", h["symbol"]),
            "value":  round(h["current_value"], 2),
            "pct":    round(h["current_value"] / total * 100, 1),
            "bucket": _holding_bucket(h["symbol"], h.get("type", "stock")),
            "price":  round(h["current_price"], 2),
            "shares": h["shares"],
        }
        for h in valued
    ]

    # ── 8. After snapshot ─────────────────────────────────────────────────
    after_holdings = _compute_after(valued, trades, prices, total)

    # ── 9. Reasoning paragraph ────────────────────────────────────────────
    reasoning = _build_reasoning(
        trades, gap_analysis, target, risk_str, scenario, asp_result, profile, total,
    )

    plan = {
        "target_allocation": target,
        "gap_analysis":      gap_analysis,
        "trades":            trades,
        "before": {
            "holdings":    before_holdings,
            "total_value": round(total, 2),
            "cash":        round(cash, 2),
        },
        "after": {
            "holdings":    after_holdings,
            "total_value": round(sum(h["value"] for h in after_holdings) + max(0, buy_budget), 2),
        },
    }
    return plan, reasoning


def _sell_reason(h: dict, bucket: str, cur: float, tgt: float,
                 scenario: str | None, beta: float) -> str:
    sym    = h["symbol"]
    excess = round(cur - tgt, 1)
    label  = BUCKET_LABELS.get(bucket, bucket)

    if beta > 1.4 and scenario in ("market_crash", "recession"):
        return (f"{sym} has a high beta of {beta:.2f} — highly volatile in downturns. "
                f"Trimming reduces how much your portfolio swings when markets fall.")
    if scenario == "tech_selloff" and bucket == "us_equity_growth":
        return (f"{sym} is in the growth/tech bucket, which takes the biggest hit in a tech selloff. "
                f"Your allocation is {excess:.0f}% above target — trimming now limits your exposure.")
    if scenario in ("market_crash", "recession") and bucket in ("us_equity_growth", "us_equity_broad"):
        return (f"In a {scenario.replace('_', ' ')}, growth stocks drop the most. "
                f"Reducing {sym} from {cur:.0f}% toward the {tgt:.0f}% target protects your capital.")
    return (f"{sym} makes up {cur:.0f}% of your portfolio — {excess:.0f}% above your {tgt:.0f}% target. "
            f"Selling some locks in gains and brings your {label} exposure back in line.")


def _buy_reason(bucket: str, cur: float, tgt: float,
                scenario: str | None, etf: dict) -> str:
    label  = BUCKET_LABELS.get(bucket, bucket)
    gap    = round(tgt - cur, 1)
    ticker = etf["ticker"]

    if bucket in ("bonds_medium", "bonds_short") and scenario in ("market_crash", "recession"):
        return (f"Bonds act as a shock absorber when stocks fall. Your {label} is only {cur:.0f}% "
                f"vs the {tgt:.0f}% target — {ticker} closes that gap and cushions the portfolio.")
    if bucket == "defensive" and scenario in ("market_crash", "recession", "tech_selloff"):
        return (f"Utilities, healthcare, and staples hold their value when markets drop. "
                f"{ticker} fills your {label} gap ({cur:.0f}% → {tgt:.0f}%).")
    if bucket == "commodities" and scenario in ("market_crash", "rate_hike"):
        return (f"Gold and commodities often rise when stocks fall or inflation picks up. "
                f"{ticker} adds that hedge — you currently have {cur:.0f}% vs {tgt:.0f}% target.")
    if bucket == "us_equity_broad" and scenario == "bull_market":
        return (f"Bull markets reward broad equity exposure. {ticker} is the most cost-efficient way "
                f"to close your {gap:.0f}% gap in {label}.")
    return (f"You're {gap:.0f}% underweight in {label}. "
            f"{ticker} is the top-ranked ETF in this category by assets under management.")


def _compute_after(valued: list[dict], trades: list[dict],
                   prices: dict, total: float) -> list[dict]:
    shares_map: dict[str, dict] = {
        h["symbol"]: {
            "name":  h.get("name", h["symbol"]),
            "shares": float(h["shares"]),
            "price":  h["current_price"],
            "type":   h.get("type", "stock"),
        }
        for h in valued
    }
    for t in trades:
        sym = t["ticker"]
        if t["action"] == "sell":
            if sym in shares_map:
                shares_map[sym]["shares"] = max(0, shares_map[sym]["shares"] - t["shares"])
        else:
            if sym in shares_map:
                shares_map[sym]["shares"] += t["shares"]
            else:
                shares_map[sym] = {"name": t.get("name", sym), "shares": float(t["shares"]),
                                   "price": t["price"], "type": "etf"}

    after_total = sum(
        info["shares"] * (prices.get(sym) or info["price"])
        for sym, info in shares_map.items() if info["shares"] > 0
    ) or 1

    result = []
    for sym, info in shares_map.items():
        if info["shares"] <= 0:
            continue
        price = prices.get(sym) or info["price"]
        val   = info["shares"] * price
        result.append({
            "ticker": sym,
            "name":   info["name"],
            "shares": round(info["shares"], 4),
            "price":  round(price, 2),
            "value":  round(val, 2),
            "pct":    round(val / after_total * 100, 1),
            "bucket": _holding_bucket(sym, info.get("type", "stock")),
        })
    result.sort(key=lambda x: -x["value"])
    return result


def _build_reasoning(
    trades:       list[dict],
    gap_analysis: dict,
    target:       dict,
    risk_str:     str,
    scenario:     str | None,
    asp_result:   dict,
    profile:      dict,
    total:        float,
) -> str:
    sells = [t for t in trades if t["action"] == "sell"]
    buys  = [t for t in trades if t["action"] == "buy"]
    sc    = scenario.replace("_", " ").title() if scenario else None
    goal  = profile.get("goal", "").replace("_", " ")

    parts = []

    opener = (f"Given a {sc} scenario" if sc else "Based on your current allocation")
    parts.append(
        f"{opener} and your {risk_str} risk profile, "
        f"this plan realigns your portfolio toward your target allocation."
    )

    if sells:
        sell_desc = ", ".join(
            f"{t['ticker']} (sell {t['shares']} share{'s' if t['shares'] != 1 else ''})"
            for t in sells[:3]
        )
        parts.append(f"Trim: {sell_desc}.")

    if buys:
        buy_desc = ", ".join(
            f"{t['ticker']} (buy {t['shares']} share{'s' if t['shares'] != 1 else ''})"
            for t in buys[:3]
        )
        parts.append(f"Add: {buy_desc}.")

    biggest = max(gap_analysis.items(), key=lambda x: abs(x[1]["gap_pct"]), default=None)
    if biggest:
        b, info = biggest
        if info["gap_pct"] > 3:
            parts.append(
                f"Biggest gap: {info['label']} is at {info['current_pct']:.0f}% vs "
                f"your {info['target_pct']:.0f}% target."
            )
        elif info["gap_pct"] < -3:
            parts.append(
                f"Biggest overweight: {info['label']} at {info['current_pct']:.0f}% "
                f"vs {info['target_pct']:.0f}% target — trimming here frees up capital."
            )

    verdict = (asp_result.get("verdict") or ["proceed"])[0]
    if verdict == "do_not_proceed":
        parts.append(
            "The risk engine flagged serious concerns — review the signals before executing any trades."
        )
    elif verdict == "proceed_with_caution":
        parts.append("Some risk signals are active — proceed carefully and monitor the flagged items.")

    return " ".join(parts)
