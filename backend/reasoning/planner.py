"""
Folio — ASP Rebalancing Planner

Converts portfolio state + market context into Clingo ground facts,
runs rules.lp, and returns a structured verdict dict.

Falls back to a pure-Python re-implementation of the core ASP rules
if clingo is not installed (pip install clingo to enable full model).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

RULES_LP = Path(__file__).resolve().parent / "rules.lp"

# ─── atom sanitiser ──────────────────────────────────────────────────────────
def _atom(symbol: str) -> str:
    s = re.sub(r"[^a-z0-9]", "_", symbol.lower())
    return ("s" + s) if s and s[0].isdigit() else s


# ─── fact builder ─────────────────────────────────────────────────────────────
def build_facts(
    portfolio: dict,
    prices:    dict,
    betas:     dict,
    market:    dict,
    goal:      dict,
    capm:      dict,
) -> str:
    holdings     = portfolio.get("holdings", [])
    cash         = float(portfolio.get("cash", 0))
    risk_profile = portfolio.get("risk_profile", "moderate")

    # Compute values
    total  = cash
    valued = []
    for h in holdings:
        price = float(prices.get(h["symbol"]) or h.get("avg_cost") or 0)
        val   = h["shares"] * price
        total += val
        valued.append({**h, "current_price": price, "current_value": val})
    if total == 0:
        total = 1

    # Portfolio beta (×100 integer, matching ASP convention)
    port_beta = sum(
        (h["current_value"] / total) * betas.get(h["symbol"], 1.0)
        for h in valued
    )
    port_beta_int = int(round(port_beta * 100))

    # Type totals
    type_totals: dict[str, float] = {}
    for h in valued:
        t = h.get("type", "stock")
        type_totals[t] = type_totals.get(t, 0) + h["current_value"] / total * 100
    cash_pct_int = int(round(cash / total * 100))

    lines: list[str] = []

    # ── Single-valued context facts ───────────────────────────────────────
    lines.append(f"risk_profile({risk_profile}).")

    sc = market.get("scenario")
    if sc:
        lines.append(f"scenario({sc}).")

    lines.append(f"vix_level({market.get('vix_level', 'moderate')}).")
    lines.append(f"yield_curve({market.get('yield_curve', 'normal')}).")
    lines.append(f"market_trend({market.get('market_trend', 'neutral')}).")
    lines.append(f"rate_environment({market.get('rate_environment', 'stable')}).")
    lines.append(f"inflation_level({market.get('inflation_level', 'moderate')}).")

    lines.append(f"goal_type({goal.get('type', 'growth')}).")
    lines.append(f"return_gap({capm.get('return_gap', 'achievable')}).")

    wm = goal.get("withdrawal_months")
    if wm and int(wm) > 0:
        lines.append(f"withdrawal_months({int(wm)}).")

    sl = market.get("scenario_loss_pct")
    if sl is not None:
        lines.append(f"scenario_loss_pct({int(abs(sl))}).")

    # ── Portfolio-level facts ─────────────────────────────────────────────
    lines.append(f"portfolio_beta({port_beta_int}).")
    lines.append(f"post_rebalance_beta({port_beta_int}).")
    lines.append(f"cash_pct({cash_pct_int}).")

    # Sector momentum inferred from scenario
    if sc in ("tech_selloff", "recession", "market_crash"):
        lines.append("sector_momentum(tech, negative).")
    elif sc == "bull_market":
        lines.append("sector_momentum(tech, positive).")
        lines.append("sector_momentum(financials, positive).")
    elif sc == "rate_hike":
        lines.append("sector_momentum(financials, positive).")
        lines.append("sector_momentum(tech, negative).")

    # ── Holding facts ─────────────────────────────────────────────────────
    for h in valued:
        atom  = _atom(h["symbol"])
        htype = h.get("type", "stock")
        pct   = int(round(h["current_value"] / total * 100))
        lines.append(f"holding({atom}, {htype}, {pct}).")

        cost = float(h.get("avg_cost") or h["current_price"] or 1)
        upct = int(round((h["current_price"] - cost) / cost * 100)) if cost > 0 else 0
        lines.append(f"unrealized_pct({atom}, {upct}).")

        days = int(h.get("days_held", 400))
        lines.append(f"days_held({atom}, {days}).")

        target_pct = float(h.get("target_pct") or 0)
        drift      = int(round(h["current_value"] / total * 100 - target_pct))
        lines.append(f"drift({atom}, {drift}).")

        lines.append(f"current_shares({atom}, {int(h['shares'])}).")

        if drift > 0 and h["current_price"] > 0:
            sell_val = abs(drift / 100) * total
            sts      = max(1, int(sell_val / h["current_price"]))
            lines.append(f"shares_to_sell({atom}, {sts}).")

    # ── Type totals ───────────────────────────────────────────────────────
    for t, pct in type_totals.items():
        lines.append(f"type_total({t}, {int(round(pct))}).")

    # ── Post-withdrawal value ─────────────────────────────────────────────
    tv = goal.get("target_value")
    if wm and int(wm) > 0 and tv and float(tv) > 0:
        lines.append(f"post_withdrawal_value({max(0, int(total - float(tv)))}).")

    return "\n".join(lines)


# ─── Clingo runner ────────────────────────────────────────────────────────────
def _parse_clingo_model(model) -> dict[str, Any]:
    result: dict[str, Any] = {
        "verdict":         [],
        "flags":           [],
        "violations":      [],
        "recommendations": [],
        "prefer_sell":     [],
    }
    for sym in model.symbols(shown=True):
        name = sym.name
        args = [str(a) for a in sym.arguments]
        if name == "verdict":
            result["verdict"].append(args[0] if args else "?")
        elif name == "flag":
            if len(args) >= 2:
                result["flags"].append({"type": args[0], "detail": args[1]})
        elif name == "violation":
            if len(args) >= 2:
                result["violations"].append({"type": args[0], "detail": args[1]})
        elif name == "recommend":
            if len(args) >= 3:
                result["recommendations"].append(
                    {"action": args[0], "target": args[1], "scope": args[2]}
                )
        elif name == "prefer_sell":
            if len(args) >= 2:
                result["prefer_sell"].append(
                    {"sell_first": args[0], "sell_after": args[1]}
                )
    return result


def _run_clingo(facts: str) -> dict:
    try:
        import clingo
    except ImportError:
        return _python_fallback(facts)

    ctl = clingo.Control(["--models=1"])
    ctl.load(str(RULES_LP))
    ctl.add("base", [], facts)
    ctl.ground([("base", [])])

    result: dict[str, Any] = {}
    satisfiable = False
    with ctl.solve(yield_=True) as handle:
        for model in handle:
            satisfiable = True
            result = _parse_clingo_model(model)

    if not satisfiable:
        result = {
            "verdict":         ["do_not_proceed"],
            "flags":           [{"type": "conflict", "detail": "unsat_model"}],
            "violations":      [],
            "recommendations": [],
            "prefer_sell":     [],
        }
    return result


# ─── Pure-Python fallback ─────────────────────────────────────────────────────
def _python_fallback(facts: str) -> dict:
    """
    Re-implements the key ASP rules in Python.
    Used when clingo is not installed.
    """
    # ── Parse fact atoms from the facts string ────────────────────────────
    def _get(pred, n_args=1):
        """Return list of n_args-tuples matching predicate name."""
        pat = rf"{pred}\(([^)]+)\)\."
        results = []
        for m in re.finditer(pat, facts):
            parts = [p.strip() for p in m.group(1).split(",")]
            results.append(tuple(parts[:n_args]))
        return results

    def _fact1(pred):
        rows = _get(pred, 1)
        return rows[0][0] if rows else None

    def _fact_int(pred):
        v = _fact1(pred)
        return int(v) if v is not None else None

    def _fact_dict(pred, key_idx=0, val_idx=1):
        return {r[key_idx]: r[val_idx] for r in _get(pred, 2)}

    risk_profile    = _fact1("risk_profile") or "moderate"
    scenario        = _fact1("scenario")
    vix_level       = _fact1("vix_level") or "moderate"
    yield_curve     = _fact1("yield_curve") or "normal"
    market_trend    = _fact1("market_trend") or "neutral"
    rate_env        = _fact1("rate_environment") or "stable"
    inflation       = _fact1("inflation_level") or "moderate"
    goal_type       = _fact1("goal_type") or "growth"
    return_gap      = _fact1("return_gap") or "achievable"
    portfolio_beta  = _fact_int("portfolio_beta") or 100
    cash_pct        = _fact_int("cash_pct") or 0
    scenario_loss   = _fact_int("scenario_loss_pct")

    holdings_raw = _get("holding", 3)   # (atom, type, pct)
    holdings     = [{"atom": r[0], "type": r[1], "pct": int(r[2])} for r in holdings_raw]
    type_totals  = _fact_dict("type_total")
    type_totals  = {k: int(v) for k, v in type_totals.items()}

    unrealized   = {r[0]: int(r[1]) for r in _get("unrealized_pct", 2)}
    drifts       = {r[0]: int(r[1]) for r in _get("drift", 2)}

    withdrawal_months_val = _fact_int("withdrawal_months") or 0

    # ── Derived ───────────────────────────────────────────────────────────
    equity_types    = {"stock", "etf", "fund"}
    equity_exposure = sum(v for k, v in type_totals.items() if k in equity_types)
    holding_count   = len(holdings)
    bond_pct        = type_totals.get("bond", 0)
    buffer          = bond_pct + cash_pct
    recession_signal = (yield_curve == "inverted")
    rate_hike_signal = (rate_env == "rising")
    imminent_withdrawal = 0 < withdrawal_months_val < 3
    near_withdrawal     = 3 <= withdrawal_months_val < 12

    violations:      list[dict] = []
    flags:           list[dict] = []
    recommendations: list[dict] = []

    # ── Section 1: Position sizing ────────────────────────────────────────
    for h in holdings:
        if h["pct"] > 35:
            violations.append({"type": "concentration", "detail": h["atom"]})
    for t, s in type_totals.items():
        if s > 60:
            violations.append({"type": "type_concentration", "detail": t})
    if holding_count < 3:
        violations.append({"type": "under_diversified", "detail": "portfolio"})

    # ── Section 2: Market regime ──────────────────────────────────────────
    if scenario in ("market_crash",) and vix_level == "high":
        recommendations.append({"action": "increase", "target": "cash", "scope": "type"})
    if inflation == "high" and type_totals.get("bond", 0) > 25:
        recommendations.append({"action": "reduce", "target": "bond", "scope": "type"})

    # ── Section 3: Yield curve ────────────────────────────────────────────
    if yield_curve == "inverted" and risk_profile == "conservative":
        recommendations.append({"action": "reduce", "target": "stock", "scope": "type"})
    if (yield_curve == "inverted" and not rate_hike_signal
            and risk_profile != "aggressive" and inflation != "high"):
        recommendations.append({"action": "increase", "target": "bond", "scope": "type"})
    if yield_curve == "flat":
        flags.append({"type": "caution", "detail": "flat_curve"})
    if yield_curve == "normal" and market_trend == "bullish" and risk_profile == "aggressive":
        recommendations.append({"action": "increase", "target": "stock", "scope": "type"})

    # ── Section 4 & 5: Conflict detection ────────────────────────────────
    rec_targets = {(r["action"], r["target"]) for r in recommendations}

    if scenario == "market_crash" and goal_type == "growth":
        flags.append({"type": "conflict", "detail": "crash_vs_growth"})
    if recession_signal and equity_exposure > 50:
        flags.append({"type": "conflict", "detail": "recession_vs_equity"})
    if inflation == "high" and ("increase", "bond") in rec_targets:
        flags.append({"type": "conflict", "detail": "inflation_vs_bonds"})
    if return_gap == "impossible":
        flags.append({"type": "conflict", "detail": "goal_impossible"})
    if return_gap == "high" and risk_profile == "conservative":
        flags.append({"type": "caution", "detail": "goal_risky"})
    if goal_type == "income" and scenario == "market_crash":
        flags.append({"type": "conflict", "detail": "income_in_crash"})
    if goal_type == "preservation" and scenario == "bull_market":
        flags.append({"type": "caution", "detail": "preservation_in_bull"})
    if (("increase", "cash") in rec_targets and imminent_withdrawal
            and bond_pct < 20 and portfolio_beta < 60):
        flags.append({"type": "conflict", "detail": "no_sell_path"})

    # Mutually exclusive recs — remove the weaker one
    if ("increase", "bond") in rec_targets and ("reduce", "bond") in rec_targets:
        recommendations = [r for r in recommendations
                           if not (r["action"] == "increase" and r["target"] == "bond")]
        rec_targets = {(r["action"], r["target"]) for r in recommendations}
    if ("increase", "stock") in rec_targets and ("reduce", "stock") in rec_targets:
        recommendations = [r for r in recommendations
                           if not (r["action"] == "increase" and r["target"] == "stock")]
        rec_targets = {(r["action"], r["target"]) for r in recommendations}

    # ── Section 5: Drawdown ───────────────────────────────────────────────
    for h in holdings:
        u = unrealized.get(h["atom"], 0)
        if u < -20:
            flags.append({"type": "review_holding", "detail": h["atom"]})
        if u < -30:
            flags.append({"type": "stop_loss_review", "detail": h["atom"]})

    if (("reduce", "bond") in rec_targets and scenario == "market_crash"
            and portfolio_beta < 60):
        flags.append({"type": "conflict", "detail": "reduce_bond_in_crash"})
    if ("increase", "stock") in rec_targets and scenario_loss and risk_profile == "conservative" and scenario_loss > 15:
        flags.append({"type": "conflict", "detail": "scenario_loss_equity_push"})
    if ("increase", "stock") in rec_targets and scenario_loss and risk_profile == "moderate" and scenario_loss > 25:
        flags.append({"type": "conflict", "detail": "scenario_loss_equity_push"})

    # ── Section 7: Withdrawal ─────────────────────────────────────────────
    if ("reduce", "bond") in rec_targets and imminent_withdrawal:
        flags.append({"type": "conflict", "detail": "reduce_bonds_before_withdrawal"})
    if near_withdrawal and ("increase", "stock") in rec_targets and type_totals.get("stock", 0) > 45:
        flags.append({"type": "conflict", "detail": "near_withdrawal_equity_push"})

    # ── Section 8: Overtrading ────────────────────────────────────────────
    limits = {"conservative": 4, "moderate": 5, "aggressive": 6}
    if len(recommendations) > limits.get(risk_profile, 5):
        flags.append({"type": "overtrading", "detail": "portfolio"})

    # ── Section 9: Sector rotation ────────────────────────────────────────
    if scenario == "recession" and type_totals.get("stock", 0) > 30:
        flags.append({"type": "opportunity", "detail": "defensive_rotation"})
    if rate_hike_signal:
        flags.append({"type": "opportunity", "detail": "financials_rotation"})
    if inflation == "high" and market_trend == "bearish":
        flags.append({"type": "opportunity", "detail": "real_assets"})
    if scenario == "bull_market" and market_trend == "bullish" and yield_curve == "normal":
        flags.append({"type": "opportunity", "detail": "growth_stocks"})

    # ── Section 11: Beginner guardrails ─────────────────────────────────────
    # These are advisory caution flags, not hard-blocking violations.
    ceilings = {"conservative": 40, "moderate": 60, "aggressive": 80}
    if equity_exposure > ceilings.get(risk_profile, 60):
        violations.append({"type": "equity_ceiling", "detail": risk_profile})
        flags.append({"type": "caution", "detail": "equity_ceiling_breach"})

    beta_ceilings = {"conservative": 60, "moderate": 110, "aggressive": 150}
    if portfolio_beta > beta_ceilings.get(risk_profile, 110):
        violations.append({"type": "beta_ceiling", "detail": risk_profile})
        flags.append({"type": "caution", "detail": "beta_ceiling_breach"})

    buf_floors = {"conservative": 30, "moderate": 15, "aggressive": 5}
    if buffer < buf_floors.get(risk_profile, 15):
        violations.append({"type": "buffer_too_low", "detail": risk_profile})
        flags.append({"type": "caution", "detail": "buffer_too_low_breach"})

    # ── Section 10: Verdict ───────────────────────────────────────────────
    conflict_count = sum(1 for f in flags if f["type"] == "conflict")
    # Hard blocking: concentration + structural issues + impossible math
    # equity/beta/buffer violations are advisory (caution flags only)
    hard_violations = [v for v in violations
                       if v["type"] in ("concentration", "type_concentration", "under_diversified")]
    do_not = (
        conflict_count >= 2
        or bool(hard_violations)
        or return_gap == "impossible"
        or any(f["detail"] == "no_sell_path" for f in flags)
        or any(f["detail"] == "critically_low_balance" for f in flags)
    )
    caution = (
        not do_not and (
            conflict_count == 1
            or recession_signal
            or any(f["type"] in ("overtrading", "caution", "stop_loss_review") for f in flags)
            or vix_level == "high"
        )
    )

    verdict = (["do_not_proceed"] if do_not
                else ["proceed_with_caution"] if caution
                else ["proceed"])

    # ── prefer_sell (tax efficiency) ──────────────────────────────────────
    at_loss = {h["atom"] for h in holdings if unrealized.get(h["atom"], 0) < 0}
    at_gain = {h["atom"] for h in holdings if unrealized.get(h["atom"], 0) > 0}
    prefer_sell = [
        {"sell_first": l, "sell_after": g}
        for l in at_loss for g in at_gain if l != g
    ]

    return {
        "verdict":         verdict,
        "flags":           flags,
        "violations":      violations,
        "recommendations": recommendations,
        "prefer_sell":     prefer_sell,
    }


# ─── Public API ───────────────────────────────────────────────────────────────
def run_planner(
    portfolio: dict,
    prices:    dict,
    betas:     dict,
    market:    dict,
    goal:      dict,
    capm:      dict,
) -> dict:
    """
    Run the ASP rebalancing model and return a structured verdict.

    Returns dict with keys:
      verdict         — list with one of: proceed, proceed_with_caution, do_not_proceed
      flags           — list of {type, detail}
      violations      — list of {type, detail}
      recommendations — list of {action, target, scope}
      prefer_sell     — list of {sell_first, sell_after}
      facts_str       — the generated fact string (for debugging)
    """
    facts = build_facts(portfolio, prices, betas, market, goal, capm)
    result = _run_clingo(facts)
    result["facts_str"] = facts
    return result
