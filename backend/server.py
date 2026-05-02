#!/usr/bin/env python3
"""
Folio — Portfolio Management API  (stdlib + yfinance)

Run:  python backend/server.py

Endpoints
─────────
GET  /api/portfolio              load portfolio
POST /api/portfolio              full-replace save
POST /api/portfolio/add          add one holding
POST /api/portfolio/update       update one holding (by id)
POST /api/portfolio/remove       remove one holding {id}
GET  /api/scenarios              list scenario metadata
POST /api/prices                 {symbols:[...]}  → {prices:{sym:price}}
POST /api/risk                   {portfolio, prices}  → risk analysis
POST /api/rebalance              {portfolio, prices}  → rebalancing plan
POST /api/scenario               {portfolio, prices, scenario_id}  → sim
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import sys
import secrets
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

from dotenv import load_dotenv
load_dotenv()

# ── Planner + rebalancer imports (optional) ───────────────────────────────────
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent / "reasoning"))
    from planner import run_planner as _run_planner
    PLANNER_AVAILABLE = True
except Exception:
    PLANNER_AVAILABLE = False
    def _run_planner(*a, **kw):
        return {"verdict": ["proceed"], "flags": [], "violations": [],
                "recommendations": [], "prefer_sell": []}

try:
    from rebalancer import generate_rebalance_plan as _generate_rebalance_plan
    REBALANCER_AVAILABLE = True
except Exception:
    REBALANCER_AVAILABLE = False
    def _generate_rebalance_plan(*a, **kw):
        return {"target_allocation": {}, "gap_analysis": {}, "trades": [],
                "before": {}, "after": {}}, "Rebalancer unavailable."

BACKEND        = Path(__file__).resolve().parent
DATA_DIR       = BACKEND / "data"
PORTFOLIO_DIR  = DATA_DIR / "portfolios"
SCENARIOS_DIR  = BACKEND / "scenarios"
USERS_FILE     = DATA_DIR / "users.json"
LEGACY_PORTFOLIO_FILE = DATA_DIR / "portfolio.json"

SESSION_TTL_SECONDS = 60 * 60 * 24 * 7   # 7 days
PBKDF2_ITERATIONS   = 200_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# ── Default demo portfolio ────────────────────────────────────────────────────
DEFAULT_PORTFOLIO = {
    "name": "My Portfolio",
    "risk_profile": "moderate",
    "holdings": [
        {"id": "h1", "symbol": "AAPL",  "name": "Apple Inc.",                        "type": "stock", "shares": 10, "avg_cost": 178.50, "target_pct": 15},
        {"id": "h2", "symbol": "MSFT",  "name": "Microsoft Corp.",                   "type": "stock", "shares": 5,  "avg_cost": 380.00, "target_pct": 12},
        {"id": "h3", "symbol": "VOO",   "name": "Vanguard S&P 500 ETF",              "type": "etf",   "shares": 8,  "avg_cost": 420.00, "target_pct": 25},
        {"id": "h4", "symbol": "BND",   "name": "Vanguard Total Bond Market ETF",    "type": "bond",  "shares": 30, "avg_cost": 72.50,  "target_pct": 20},
        {"id": "h5", "symbol": "GOOGL", "name": "Alphabet Inc.",                     "type": "stock", "shares": 3,  "avg_cost": 170.00, "target_pct": 10},
        {"id": "h6", "symbol": "VTI",   "name": "Vanguard Total Stock Market ETF",   "type": "etf",   "shares": 6,  "avg_cost": 235.00, "target_pct": 13},
    ],
    "cash": 3500,
    "target_cash_pct": 5,
}

# ── Market scenarios ──────────────────────────────────────────────────────────
SCENARIOS = {
    "market_crash": {
        "name": "Market Crash",  "icon": "📉",
        "description": "A sudden sharp drop across all markets — like 2008 or early 2020.",
        "shocks": {"stock": -0.22, "etf": -0.18, "bond": 0.04, "fund": -0.18, "cash": 0},
    },
    "recession": {
        "name": "Prolonged Recession",  "icon": "🌧️",
        "description": "A slow economic contraction lasting 12–18 months.",
        "shocks": {"stock": -0.38, "etf": -0.32, "bond": 0.08, "fund": -0.30, "cash": 0},
    },
    "tech_selloff": {
        "name": "Tech Selloff",  "icon": "💻",
        "description": "Technology stocks fall sharply while other sectors hold steady.",
        "shocks": {"stock": -0.12, "etf": -0.08, "bond": 0.02, "fund": -0.09, "cash": 0},
        "tech_shock": -0.32,
        "tech_symbols": ["AAPL", "MSFT", "GOOGL", "META", "AMZN", "NVDA", "TSLA", "QQQ"],
    },
    "rate_hike": {
        "name": "Interest Rate Hike",  "icon": "🏦",
        "description": "Central bank raises rates sharply — hurts bonds and growth stocks.",
        "shocks": {"stock": -0.08, "etf": -0.06, "bond": -0.12, "fund": -0.07, "cash": 0.01},
    },
    "bull_market": {
        "name": "Bull Market Boom",  "icon": "🚀",
        "description": "Strong growth and optimism push markets to new highs.",
        "shocks": {"stock": 0.28, "etf": 0.24, "bond": -0.03, "fund": 0.22, "cash": 0},
    },
}

# ── Risk helpers ──────────────────────────────────────────────────────────────
TYPE_BETA = {"stock": 1.1, "etf": 0.9, "bond": 0.2, "fund": 0.85, "cash": 0}

def beta_to_risk(beta: float):
    if beta < 0.5:  return (2,   "Low",           "Safe & Steady",     "🛡️")
    if beta < 0.8:  return (3.5, "Low-Moderate",  "Cautious",          "🌿")
    if beta < 1.1:  return (5,   "Moderate",      "Balanced",          "⚖️")
    if beta < 1.4:  return (7,   "Moderate-High", "Growth-Oriented",   "📈")
    return               (9,   "High",          "Aggressive",        "⚡")

PLAIN_ENGLISH = {
    "Low":          "Your portfolio prioritises safety over growth. You're unlikely to see big gains, but you also won't lose sleep over market swings.",
    "Low-Moderate": "Your portfolio leans cautious. Expect modest growth in good times and smaller losses when markets dip.",
    "Moderate":     "Your portfolio strikes a healthy balance between growth and protection. It should hold up reasonably well in most market conditions.",
    "Moderate-High":"Your portfolio leans toward growth. Expect bigger gains in bull markets — but bumpier rides when markets fall.",
    "High":         "Your portfolio is built for maximum growth. Be prepared for large swings — both up and down.",
}

# ── User & auth storage ──────────────────────────────────────────────────────
_users_lock    = threading.Lock()
_sessions_lock = threading.Lock()
_sessions: dict[str, dict] = {}   # token -> {"email", "expires_at"}

def _email_key(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:16]

def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"

def _verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt   = bytes.fromhex(salt_hex)
        target = bytes.fromhex(digest_hex)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iters))
        return secrets.compare_digest(candidate, target)
    except Exception:
        return False

def load_users() -> dict:
    if USERS_FILE.exists():
        try:
            return json.loads(USERS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def save_users(users: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")

def create_session(email: str) -> str:
    token = secrets.token_urlsafe(32)
    with _sessions_lock:
        _sessions[token] = {"email": email, "expires_at": time.time() + SESSION_TTL_SECONDS}
    return token

def session_email(token: str | None) -> str | None:
    if not token:
        return None
    with _sessions_lock:
        sess = _sessions.get(token)
        if not sess:
            return None
        if sess["expires_at"] < time.time():
            _sessions.pop(token, None)
            return None
        return sess["email"]

def destroy_session(token: str | None) -> None:
    if not token:
        return
    with _sessions_lock:
        _sessions.pop(token, None)

def public_user(users: dict, email: str) -> dict:
    u = users.get(email, {})
    return {"email": email, "displayName": u.get("display_name") or email.split("@")[0]}

# ── Portfolio I/O (per-user) ──────────────────────────────────────────────────
def _portfolio_path(email: str) -> Path:
    return PORTFOLIO_DIR / f"{_email_key(email)}.json"

def load_portfolio(email: str) -> dict:
    path = _portfolio_path(email)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    PORTFOLIO_DIR.mkdir(parents=True, exist_ok=True)
    seed = json.loads(json.dumps(DEFAULT_PORTFOLIO))   # deep copy
    path.write_text(json.dumps(seed, indent=2), encoding="utf-8")
    return seed

def save_portfolio(email: str, data: dict) -> None:
    PORTFOLIO_DIR.mkdir(parents=True, exist_ok=True)
    _portfolio_path(email).write_text(json.dumps(data, indent=2), encoding="utf-8")

# ── Scenario persistence (per-user) ──────────────────────────────────────────
def _scenarios_path(email: str) -> Path:
    return SCENARIOS_DIR / f"{_email_key(email)}.json"

def load_user_scenarios(email: str) -> list:
    path = _scenarios_path(email)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def save_user_scenarios(email: str, records: list) -> None:
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    _scenarios_path(email).write_text(json.dumps(records, indent=2), encoding="utf-8")

def save_user_scenario(email: str, record: dict) -> None:
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    path      = _scenarios_path(email)
    scenarios = load_user_scenarios(email)
    scenarios.insert(0, record)
    path.write_text(json.dumps(scenarios[:50], indent=2), encoding="utf-8")

# ── Live price fetching ───────────────────────────────────────────────────────
_MOCK_PRICES = {
    "AAPL": 192.3,  "MSFT": 415.0,  "GOOGL": 175.5, "META":  580.0,
    "AMZN": 210.0,  "NVDA": 875.0,  "TSLA":  250.0,  "VOO":   505.0,
    "VTI":  268.0,  "BND":   73.5,  "QQQ":   460.0,  "SPY":   560.0,
    "GLD":  235.0,  "IVV":   570.0, "SCHD":  28.0,   "AGG":   96.5,
}

def _get_one_price(sym: str) -> tuple[str, float]:
    try:
        import yfinance as yf
        info = yf.Ticker(sym).info
        price = (info.get("currentPrice") or info.get("regularMarketPrice")
                 or info.get("navPrice") or info.get("previousClose") or 0)
        return sym, round(float(price), 2)
    except Exception:
        return sym, _MOCK_PRICES.get(sym, 100.0)

def fetch_prices(symbols: list[str]) -> dict[str, float]:
    if not symbols:
        return {}
    prices: dict[str, float] = {}
    with ThreadPoolExecutor(max_workers=min(len(symbols), 10)) as ex:
        for sym, price in ex.map(_get_one_price, symbols):
            prices[sym] = price
    return prices

# ── Risk calculation ──────────────────────────────────────────────────────────
def calc_risk(portfolio: dict, prices: dict) -> dict:
    holdings = portfolio.get("holdings", [])
    cash     = float(portfolio.get("cash", 0))

    valued = []
    total  = cash
    for h in holdings:
        price = prices.get(h["symbol"]) or h.get("avg_cost", 0)
        val   = h["shares"] * price
        total += val
        valued.append({**h, "current_price": price, "current_value": val})
    if total == 0:
        total = 1

    # Fetch betas (parallel, fall back to type defaults)
    betas: dict[str, float] = {}
    def _get_beta(sym_type: tuple[str, str]) -> tuple[str, float]:
        sym, typ = sym_type
        try:
            import yfinance as yf
            b = yf.Ticker(sym).info.get("beta")
            return sym, float(b) if b else TYPE_BETA.get(typ, 1.0)
        except Exception:
            return sym, TYPE_BETA.get(typ, 1.0)

    with ThreadPoolExecutor(max_workers=min(len(valued), 10)) as ex:
        for sym, beta in ex.map(_get_beta, [(h["symbol"], h["type"]) for h in valued]):
            betas[sym] = beta

    port_beta   = 0.0
    holdings_risk = []
    for h in valued:
        w    = h["current_value"] / total
        beta = betas.get(h["symbol"], 1.0)
        port_beta += w * beta
        contrib = ("Adds stability" if beta < 0.4 else
                   "Low risk"       if beta < 0.8 else
                   "Average risk"   if beta < 1.2 else
                   "Adds some risk" if beta < 1.5 else "High risk contributor")
        holdings_risk.append({
            "symbol":     h["symbol"],
            "name":       h.get("name", h["symbol"]),
            "beta":       round(beta, 2),
            "weight_pct": round(w * 100, 1),
            "contribution": contrib,
            "type":       h["type"],
        })

    score, level, label, icon = beta_to_risk(port_beta)

    warnings = []
    for h in valued:
        pct = h["current_value"] / total * 100
        if pct > 30:
            warnings.append(f"{h['symbol']} is {pct:.0f}% of your portfolio — very concentrated. Consider spreading the risk.")
        elif pct > 22:
            warnings.append(f"{h['symbol']} is {pct:.0f}% of your portfolio — a bit heavy. A little diversification could help.")

    types = {h["type"] for h in holdings}
    div_score = min(10, len(types) * 2 + min(len(holdings), 5))

    return {
        "portfolio_beta":        round(port_beta, 2),
        "risk_score":            score,
        "risk_level":            level,
        "risk_label":            label,
        "risk_icon":             icon,
        "plain_english":         PLAIN_ENGLISH.get(level, ""),
        "concentration_warnings": warnings,
        "diversification_score": div_score,
        "holdings_risk":         sorted(holdings_risk, key=lambda x: -x["weight_pct"]),
        "total_value":           round(total, 2),
    }

# ── PDF import ───────────────────────────────────────────────────────────────
_FALSE_POS = {
    'USD','APR','AUG','JAN','FEB','MAR','MAY','JUN','JUL','SEP','OCT',
    'NOV','DEC','LLC','ETF','INC','ACH','MMF','APY','SIPC','FINRA',
    'THE','AND','FOR','NET','MKT','AVG','PCT','DIV','CLS','ORD',
}

_HEADER_SKIP = {
    "Security", "Company", "Fund Name", "Ticker", "Shares", "Avg Cost",
    "Avg Cost/Sh", "Current Price", "Mkt Value", "Cost Basis", "Gain/Loss",
    "Unrlzd G/L", "Return %", "% Port", "% of Portfolio", "Date", "Type",
    "Price", "Amount", "Description", "Account", "Balance", "Interest Rate (APY)",
}


def _parse_holdings_text(text: str) -> list:
    """
    Handle PDF extraction where every cell lands on its own line.
    Strategy: find standalone ticker tokens, then look backward for the
    name and forward for shares + avg_cost.
    """
    holdings, seen = [], set()
    current_type = "stock"
    type_hints = [
        (["ETF", "INDEX FUND", "INDEX FUNDS"], "etf"),
        (["BOND", "BONDS", "FIXED INCOME"],    "bond"),
        (["MUTUAL FUND", "MUTUAL FUNDS"],       "fund"),
        (["EQUIT", "INDIVIDUAL STOCK"],          "stock"),
    ]

    lines = [l.strip() for l in text.splitlines()]

    for i, line in enumerate(lines):
        if not line:
            continue
        up = line.upper()
        # Update asset-class context from section headers
        if len(line) < 80:
            for kws, t in type_hints:
                if any(k in up for k in kws):
                    current_type = t
                    break

        # Identify a standalone ticker: 2-5 uppercase letters, nothing else on the line
        if not re.match(r'^[A-Z]{2,5}$', line):
            continue
        if line in _FALSE_POS:
            continue

        ticker = line

        # ── find the company name by scanning backward ──────────────────
        name = ticker
        for j in range(i - 1, max(i - 5, -1), -1):
            cand = lines[j]
            if not cand:
                continue
            # Skip pure-number or pure-dollar lines and known header labels
            if re.match(r'^[\$\+\-\d\.\,%\*]+$', cand):
                continue
            if cand in _HEADER_SKIP:
                continue
            name = cand
            break

        # ── find shares (plain number) and avg_cost ($amount) forward ───
        shares: float | None   = None
        avg_cost: float | None = None
        for j in range(i + 1, min(i + 8, len(lines))):
            cand = lines[j]
            if not cand:
                continue
            if shares is None and re.match(r'^\d{1,6}(\.\d{1,3})?$', cand):
                try:
                    v = float(cand)
                    if 0 < v < 100_000:
                        shares = v
                except ValueError:
                    pass
            elif avg_cost is None and re.match(r'^\$([\d,]+\.?\d{0,2})$', cand):
                try:
                    v = float(cand[1:].replace(',', ''))
                    if 0 < v < 1_000_000:
                        avg_cost = v
                except ValueError:
                    pass
            if shares is not None and avg_cost is not None:
                break

        if shares is None or avg_cost is None:
            continue
        if ticker in seen:
            continue
        seen.add(ticker)

        holdings.append({
            "id":         str(uuid.uuid4()),
            "symbol":     ticker,
            "name":       name,
            "shares":     shares,
            "avg_cost":   round(avg_cost, 2),
            "target_pct": 0,
            "type":       current_type,
        })
    return holdings

def import_pdf(pdf_b64: str) -> dict:
    try:
        import pypdf
    except ImportError:
        return {"error": "pypdf not installed — run: pip install pypdf"}
    try:
        data      = base64.b64decode(pdf_b64)
        reader    = pypdf.PdfReader(io.BytesIO(data))
        text      = "\n".join(p.extract_text() or "" for p in reader.pages)
        rows = _parse_holdings_text(text)
        return {"holdings": rows, "count": len(rows)}
    except Exception as exc:
        return {"error": str(exc)}


def _merge_portfolio(portfolio: dict, new_holdings: list, brokerage: str, confirmed_removals: list) -> dict:
    """
    Merge PDF-parsed holdings from a named brokerage into the existing portfolio.

    - new_holdings: holdings parsed from the PDF (symbol, shares, avg_cost, type …)
    - brokerage: canonical brokerage name chosen/confirmed by the user
    - confirmed_removals: symbols the user confirmed should be removed from this brokerage

    Existing fields (symbol, shares, avg_cost, type, target_pct, id) are preserved.
    A 'sources' array is maintained per holding for weighted-average tracking.
    """
    existing      = portfolio.get("holdings", [])
    new_map       = {h["symbol"]: h for h in new_holdings}
    rm_set        = set(confirmed_removals or [])
    brokerage_key = brokerage.strip().lower()
    result        = []

    def _same_brokerage(stored: str) -> bool:
        return stored.strip().lower() == brokerage_key

    for h in existing:
        sym     = h["symbol"]
        sources = list(h.get("sources") or [])

        if sym in new_map:
            nh = new_map.pop(sym)
            # Seed sources from existing data if this holding pre-dates the feature
            if not sources:
                sources = [{"brokerage": "Manual", "shares": h["shares"], "avg_cost": h["avg_cost"]}]
            # Replace or insert this brokerage's source entry (case-insensitive match)
            sources = [s for s in sources if not _same_brokerage(s["brokerage"])]
            sources.append({"brokerage": brokerage, "shares": nh["shares"], "avg_cost": nh["avg_cost"]})
            total = sum(s["shares"] for s in sources)
            wavg  = round(sum(s["shares"] * s["avg_cost"] for s in sources) / total, 2) if total else h["avg_cost"]
            result.append({**h, "shares": round(total, 4), "avg_cost": wavg, "sources": sources})

        elif sym in rm_set:
            remaining = [s for s in sources if not _same_brokerage(s["brokerage"])]
            if not remaining:
                continue  # only source was this brokerage → remove holding entirely
            total = sum(s["shares"] for s in remaining)
            wavg  = round(sum(s["shares"] * s["avg_cost"] for s in remaining) / total, 2)
            result.append({**h, "shares": round(total, 4), "avg_cost": wavg, "sources": remaining})

        else:
            result.append(h)  # unaffected by this import

    # Brand-new tickers not yet in the portfolio
    for sym, nh in new_map.items():
        result.append({
            "id":         nh.get("id") or str(uuid.uuid4()),
            "symbol":     sym,
            "name":       nh.get("name", sym),
            "type":       nh.get("type", "stock"),
            "shares":     nh["shares"],
            "avg_cost":   nh["avg_cost"],
            "target_pct": 0,
            "sources":    [{"brokerage": brokerage, "shares": nh["shares"], "avg_cost": nh["avg_cost"]}],
        })

    return {**portfolio, "holdings": result}

# ── Rebalancing ───────────────────────────────────────────────────────────────
def calc_rebalance(portfolio: dict, prices: dict) -> dict:
    holdings = portfolio.get("holdings", [])
    cash     = float(portfolio.get("cash", 0))

    total  = cash
    valued = []
    for h in holdings:
        price = prices.get(h["symbol"]) or h.get("avg_cost", 0)
        val   = h["shares"] * price
        total += val
        valued.append({**h, "current_price": price, "current_value": val})
    if total == 0:
        total = 1

    THRESHOLD = 3.0
    suggestions = []
    snapshot    = []

    for h in valued:
        cur_pct  = h["current_value"] / total * 100
        tgt_pct  = float(h.get("target_pct") or 0)
        drift    = cur_pct - tgt_pct

        snapshot.append({
            "symbol":        h["symbol"],
            "name":          h.get("name", h["symbol"]),
            "type":          h["type"],
            "current_pct":   round(cur_pct, 1),
            "target_pct":    tgt_pct,
            "drift":         round(drift, 1),
            "current_value": round(h["current_value"], 2),
        })

        if abs(drift) < THRESHOLD:
            continue

        excess_val = abs(drift / 100) * total
        shares_n   = max(1, int(excess_val / max(h["current_price"], 0.01)))
        action     = "sell" if drift > 0 else "buy"

        suggestions.append({
            "symbol":        h["symbol"],
            "name":          h.get("name", h["symbol"]),
            "action":        action,
            "shares":        shares_n,
            "current_pct":   round(cur_pct, 1),
            "target_pct":    tgt_pct,
            "drift":         round(drift, 1),
            "trade_value":   round(excess_val, 2),
            "current_price": round(h["current_price"], 2),
            "reason":        (f"{h['symbol']} has grown to {cur_pct:.1f}% — above your {tgt_pct}% goal"
                              if drift > 0 else
                              f"{h['symbol']} has shrunk to {cur_pct:.1f}% — below your {tgt_pct}% goal"),
            "plain_action":  (f"Sell {shares_n} share{'s' if shares_n != 1 else ''} to trim it back"
                              if drift > 0 else
                              f"Buy {shares_n} share{'s' if shares_n != 1 else ''} to top it up"),
        })

    suggestions.sort(key=lambda x: -abs(x["drift"]))
    return {
        "needs_rebalancing": len(suggestions) > 0,
        "suggestion_count":  len(suggestions),
        "total_drift":       round(sum(abs(s["drift"]) for s in suggestions), 1),
        "suggestions":       suggestions,
        "allocation_snapshot": snapshot,
        "total_value":       round(total, 2),
    }

# ── Scenario simulation ───────────────────────────────────────────────────────
# ── Profile-aware bucket rebalance ────────────────────────────────────────────
_BUCKET_FRIENDLY = {
    "us_equity_broad":  "US Stocks",
    "us_equity_growth": "Growth Stocks",
    "us_equity_value":  "Value Stocks",
    "dividend":         "Dividend Stocks",
    "international":    "International",
    "bonds_medium":     "Bonds",
    "bonds_short":      "Short-Term Bonds",
    "bonds_long":       "Long-Term Bonds",
    "bonds_tips":       "Inflation-Protected",
    "bonds_corporate":  "Corporate Bonds",
    "defensive":        "Defensive Stocks",
    "real_estate":      "Real Estate",
    "commodities":      "Commodities & Gold",
    "financials":       "Financials",
    "cash":             "Cash",
}

_BUCKET_BETAS = {
    "us_equity_broad": 1.0,  "us_equity_growth": 1.4, "us_equity_value": 0.85,
    "dividend": 0.7,          "international": 0.9,    "bonds_medium": 0.1,
    "bonds_short": 0.05,      "bonds_long": 0.15,      "bonds_tips": 0.1,
    "bonds_corporate": 0.2,   "defensive": 0.5,        "real_estate": 0.85,
    "commodities": 0.6,       "financials": 1.2,       "cash": 0.0,
}

def estimate_post_rebalance_beta(portfolio: dict, trades: list, betas: dict, prices: dict):
    from reasoning.rebalancer import _holding_bucket
    holdings = portfolio.get("holdings", [])
    cash = float(portfolio.get("cash", 0))
    pos: dict = {}
    total = cash
    for h in holdings:
        price = float(prices.get(h["symbol"]) or h.get("avg_cost") or 0)
        val = h["shares"] * price
        total += val
        bucket = _holding_bucket(h["symbol"], h.get("type", "stock"))
        b = betas.get(h["symbol"], _BUCKET_BETAS.get(bucket, 1.0))
        pos[h["symbol"]] = {"value": val, "beta": b}
    if total == 0:
        return None
    for t in trades:
        sym    = t.get("ticker", "")
        val    = float(t.get("value", 0))
        bucket = t.get("bucket", "us_equity_broad")
        b      = betas.get(sym, _BUCKET_BETAS.get(bucket, 1.0))
        if t.get("action") == "sell":
            if sym in pos:
                pos[sym]["value"] = max(0.0, pos[sym]["value"] - val)
        else:
            if sym in pos:
                ov = pos[sym]["value"]
                nv = ov + val
                pos[sym]["beta"]  = (pos[sym]["beta"] * ov + b * val) / nv if nv else b
                pos[sym]["value"] = nv
            else:
                pos[sym] = {"value": val, "beta": b}
    total_new = cash + sum(p["value"] for p in pos.values())
    if total_new == 0:
        return None
    return round(sum(p["value"] * p["beta"] for p in pos.values()) / total_new, 2)

def calc_rebalance_profile(portfolio: dict, prices: dict, investor_profile: dict) -> dict:
    from reasoning.rebalancer import _BASE_ALLOC, _GOAL_NUDGE, _holding_bucket

    _type_map  = {"conservative": "conservative", "balanced": "moderate",
                  "growth": "moderate", "aggressive_growth": "aggressive"}
    _level_map = {"low": "conservative", "medium": "moderate",
                  "medium_high": "moderate", "high": "aggressive"}
    raw = (investor_profile.get("risk_profile")
           or _type_map.get(investor_profile.get("investor_type", ""))
           or _level_map.get(investor_profile.get("risk_level", ""))
           or "moderate")
    risk_profile = raw if raw in ("conservative", "moderate", "aggressive") else "moderate"
    goal         = investor_profile.get("goal", "")

    base  = dict(_BASE_ALLOC.get(risk_profile, _BASE_ALLOC["moderate"]))
    nudge = _GOAL_NUDGE.get(goal, {})
    for k, v in nudge.items():
        base[k] = base.get(k, 0) + v

    total_pct = sum(max(0, v) for v in base.values()) or 100
    target_alloc = {k: round(max(0, v) / total_pct * 100, 1) for k, v in base.items()}

    holdings  = portfolio.get("holdings", [])
    cash      = float(portfolio.get("cash", 0))
    total_val = cash
    valued    = []
    for h in holdings:
        price = prices.get(h["symbol"]) or h.get("avg_cost", 0)
        val   = h["shares"] * price
        total_val += val
        valued.append({**h, "current_value": val})
    if total_val == 0:
        total_val = 1

    bucket_vals: dict = {}
    for h in valued:
        b = _holding_bucket(h["symbol"], h.get("type", "stock"))
        bucket_vals[b] = bucket_vals.get(b, 0) + h["current_value"]
    if cash > 0:
        bucket_vals["cash"] = bucket_vals.get("cash", 0) + cash

    current_pct = {k: round(v / total_val * 100, 1) for k, v in bucket_vals.items()}

    all_buckets = set(list(target_alloc.keys()) + list(current_pct.keys()))
    snapshot = []
    for b in all_buckets:
        cur = current_pct.get(b, 0)
        tgt = target_alloc.get(b, 0)
        if cur == 0 and tgt == 0:
            continue
        if cur < 0.5 and tgt < 1:
            continue
        snapshot.append({
            "bucket":      b,
            "label":       _BUCKET_FRIENDLY.get(b, b.replace("_", " ").title()),
            "current_pct": cur,
            "target_pct":  tgt,
            "drift":       round(cur - tgt, 1),
        })
    snapshot.sort(key=lambda x: -abs(x["drift"]))

    THRESHOLD = 5.0
    suggestions = []
    for s in snapshot:
        if abs(s["drift"]) < THRESHOLD or len(suggestions) >= 3:
            continue
        action    = "sell" if s["drift"] > 0 else "buy"
        trade_val = round(abs(s["drift"] / 100) * total_val, 2)
        pct_word  = f"{abs(s['drift']):.0f}%"
        if action == "sell":
            plain  = f"Trim {s['label']} by ≈ ${trade_val:,.0f}"
            reason = (f"{s['label']} is {s['current_pct']}% of your portfolio — "
                      f"{pct_word} above your {s['target_pct']}% target for a {risk_profile} investor.")
        else:
            plain  = f"Add more {s['label']} — ≈ ${trade_val:,.0f} needed"
            reason = (f"{s['label']} is only {s['current_pct']}% of your portfolio — "
                      f"{pct_word} below your {s['target_pct']}% target for a {risk_profile} investor.")
        suggestions.append({
            "bucket":       s["bucket"],
            "label":        s["label"],
            "action":       action,
            "current_pct":  s["current_pct"],
            "target_pct":   s["target_pct"],
            "drift":        s["drift"],
            "trade_value":  trade_val,
            "plain_action": plain,
            "reason":       reason,
        })

    return {
        "needs_rebalancing": len(suggestions) > 0,
        "suggestion_count":  len(suggestions),
        "total_drift":       round(sum(abs(s["drift"]) for s in snapshot if abs(s["drift"]) >= THRESHOLD), 1),
        "bucket_snapshot":   snapshot,
        "suggestions":       suggestions,
        "total_value":       round(total_val, 2),
        "profile_used":      risk_profile,
        "goal_used":         goal,
        "profile_aware":     True,
    }


def calc_scenario(portfolio: dict, prices: dict, scenario_id: str) -> dict:
    sc = SCENARIOS.get(scenario_id)
    if sc is None:
        return {"error": f"Unknown scenario: {scenario_id}"}

    holdings     = portfolio.get("holdings", [])
    cash         = float(portfolio.get("cash", 0))
    cash_shock   = sc["shocks"].get("cash", 0)
    total_orig   = cash
    total_sim    = cash * (1 + cash_shock)
    tech_symbols = sc.get("tech_symbols", [])
    tech_shock   = sc.get("tech_shock")
    impacts      = []

    for h in holdings:
        price      = prices.get(h["symbol"]) or h.get("avg_cost", 0)
        orig_val   = h["shares"] * price
        shock      = (tech_shock if tech_shock is not None and h["symbol"] in tech_symbols
                      else sc["shocks"].get(h["type"], sc["shocks"].get("stock", 0)))
        sim_val    = orig_val * (1 + shock)
        total_orig += orig_val
        total_sim  += sim_val
        impacts.append({
            "symbol":          h["symbol"],
            "name":            h.get("name", h["symbol"]),
            "type":            h["type"],
            "original_value":  round(orig_val, 2),
            "simulated_value": round(sim_val, 2),
            "change":          round(sim_val - orig_val, 2),
            "change_pct":      round(shock * 100, 1),
        })

    delta     = total_sim - total_orig
    delta_pct = delta / total_orig * 100 if total_orig else 0

    bond_pct = sum(
        impacts[i]["original_value"] / total_orig * 100
        for i in range(len(holdings))
        if holdings[i].get("type") == "bond"
    ) if total_orig else 0

    """
    bond_pct = sum(
        h["current_value"] / total_orig * 100
        for h in [{"current_value": impacts[i]["original_value"], **holdings[i]}
                  for i in range(len(holdings))]
        if h.get("type") == "bond"
    ) if total_orig else 0
    """

    advice_map = {
        "market_crash": (
            "Your bond holdings are cushioning the blow — that's exactly what they're for."
            if bond_pct >= 25 else
            "Adding more bonds (target ~25%) would make your portfolio more resilient to sudden crashes."
        ),
        "recession": "Recessions are slow and prolonged. Bonds, dividend-paying stocks, and broad market ETFs tend to hold up best.",
        "tech_selloff": "Your exposure to tech stocks drives this loss. Diversifying into healthcare, consumer goods, or bonds would reduce this risk.",
        "rate_hike": (
            "Rate hikes hurt long-term bonds most. Consider shifting some bond holdings to shorter-duration funds."
            if bond_pct >= 20 else
            "Rate hikes have mixed effects. Financials often benefit; growth stocks and long bonds can suffer."
        ),
        "bull_market": f"Great news — your portfolio grows {abs(delta_pct):.1f}% in this scenario. Stick to your target allocation to lock in gains as markets rise.",
    }

    return {
        "scenario_id":          scenario_id,
        "scenario_name":        sc["name"],
        "scenario_description": sc["description"],
        "original_value":       round(total_orig, 2),
        "simulated_value":      round(total_sim, 2),
        "change":               round(delta, 2),
        "change_pct":           round(delta_pct, 1),
        "holdings_impact":      sorted(impacts, key=lambda x: x["change"]),
        "advice":               advice_map.get(scenario_id, ""),
    }

# ── FRED: risk-free rate ──────────────────────────────────────────────────────
_FRED_CACHE: dict = {"ts": 0, "value": 0.045}
_FRED_TTL   = 86400   # refresh once a day

def fetch_risk_free_rate() -> float:
    """10-year Treasury yield from FRED GS10. Falls back to ~4.5% if unavailable."""
    now = time.time()
    if now - _FRED_CACHE["ts"] < _FRED_TTL:
        return _FRED_CACHE["value"]
    api_key = os.getenv("FRED_API_KEY", "")
    if not api_key:
        return _FRED_CACHE["value"]
    try:
        url = (
            "https://api.stlouisfed.org/fred/series/observations"
            f"?series_id=GS10&file_type=json&api_key={api_key}&limit=1&sort_order=desc"
        )
        with urlopen(url, timeout=5) as r:
            data = json.loads(r.read().decode())
        val = float(data["observations"][0]["value"]) / 100
        _FRED_CACHE["ts"]    = now
        _FRED_CACHE["value"] = val
        return val
    except Exception:
        return _FRED_CACHE["value"]

# ── CAPM math ─────────────────────────────────────────────────────────────────
SPY_LONG_RUN_RETURN = 0.10   # S&P 500 nominal annualised avg (Damodaran, 1928–2023)

def calc_capm(portfolio: dict, prices: dict, betas: dict) -> dict:
    """
    Portfolio expected return via CAPM.
    E(r) = Rf + β × (Rm − Rf)
    Rf  = FRED GS10 (10-year Treasury)
    Rm  = 10% nominal (S&P 500 long-run average)
    β   = per-holding from yfinance, weighted by value
    """
    rf = fetch_risk_free_rate()
    rm = SPY_LONG_RUN_RETURN

    holdings = portfolio.get("holdings", [])
    cash     = float(portfolio.get("cash", 0))
    total    = cash
    valued   = []
    for h in holdings:
        price = float(prices.get(h["symbol"]) or h.get("avg_cost") or 0)
        val   = h["shares"] * price
        total += val
        valued.append({**h, "current_price": price, "current_value": val})
    if total == 0:
        total = 1

    port_beta = 0.0
    for h in valued:
        w = h["current_value"] / total
        b = betas.get(h["symbol"], TYPE_BETA.get(h.get("type", "stock"), 1.0))
        port_beta += w * b

    cash_w = cash / total
    equity_er = rf + port_beta * (rm - rf)
    cash_er   = rf
    blended_er = equity_er * (1 - cash_w) + cash_er * cash_w

    return {
        "risk_free_rate":           round(rf, 4),
        "market_return":            rm,
        "portfolio_beta":           round(port_beta, 3),
        "portfolio_expected_annual": round(blended_er, 4),
        "total_value":              round(total, 2),
        "source":                   "CAPM: Rf=FRED GS10, Rm=SPY long-run 10%",
    }

def calc_return_gap(current_val: float, target_val: float,
                    timeline_months: float, expected_annual: float) -> str:
    """
    Classify whether the target is achievable with the expected portfolio return.
    Returns: 'achievable', 'high', or 'impossible'
    """
    if not target_val or not timeline_months or current_val <= 0:
        return "achievable"
    years    = timeline_months / 12
    required = (target_val / current_val) ** (1 / max(years, 0.08)) - 1
    if required <= 0:
        return "achievable"
    ratio = required / max(expected_annual, 0.001)
    if ratio <= 1.25:
        return "achievable"
    if ratio <= 2.25:
        return "high"
    return "impossible"

# ── Intent parser ─────────────────────────────────────────────────────────────
_INTENT_SYSTEM = """\
You are a financial intent extractor for a portfolio management app.
Given a user message, return ONLY a JSON object with these fields (omit any field whose value is null):

  scenario         : "market_crash" | "recession" | "tech_selloff" | "rate_hike" | "bull_market"
  crash_sector     : "tech" | "healthcare" | "energy" | "financials" | "real_estate" | "utilities" | "consumer" | "industrials" | "materials" | "international" | "bonds" | "broad"
  target_value     : number   (dollar amount the user wants to reach)
  timeline_months  : number   (how many months until they want to reach the target or make a withdrawal)
  goal_type        : "growth" | "income" | "preservation"
  withdrawal_months: number   (months until they need to withdraw money / retire)
  market_trend     : "bullish" | "bearish" | "neutral"
  vix_level        : "high" | "moderate" | "low"
  rate_environment : "rising" | "falling" | "stable"
  yield_curve      : "inverted" | "flat" | "normal"
  inflation_level  : "high" | "moderate" | "low"

Rules:
- If the user asks about a market crash, meltdown, 2008-style event → scenario: market_crash
- If they mention recession, prolonged downturn → scenario: recession
- If they mention tech stocks falling, NASDAQ drop → scenario: tech_selloff
- If they mention rate hikes, Fed tightening, interest rates rising → scenario: rate_hike
- If they mention bull market, rally, boom, markets rising → scenario: bull_market
- crash_sector: extract the SPECIFIC sector mentioned as crashing or falling. Examples:
    "tech market crash" → crash_sector: tech
    "healthcare crash" → crash_sector: healthcare
    "energy selloff" → crash_sector: energy
    "bank collapse" → crash_sector: financials
    "broad market crash" or no specific sector → crash_sector: broad
- Extract dollar amounts like "$25k" as 25000, "50k", "50,000", "$1.5 million" as the number (no $ needed)
- Convert year timelines to months (e.g. "2 years" → 24)
- "retiring in 6 months" or "need money in 3 months" → withdrawal_months
- Return ONLY the JSON — no explanation, no markdown fences."""

_INTENT_KEY_FIELDS = {"scenario", "target_value", "timeline_months", "withdrawal_months", "crash_sector"}


def _intent_is_weak(intent: dict) -> bool:
    """Return True if regex extracted nothing actionable — Claude should try to fill the gaps."""
    return not any(k in intent for k in _INTENT_KEY_FIELDS)


def _claude_intent(message: str) -> dict:
    """Call Claude Haiku to extract intent. Returns {} on any failure."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {}
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=_INTENT_SYSTEM,
            messages=[{"role": "user", "content": message}],
        )
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = re.sub(r"```(?:json)?\s*|\s*```", "", text).strip()
        parsed = json.loads(text)
        result: dict = {}
        for k, v in parsed.items():
            if v is None:
                continue
            if k in ("target_value", "timeline_months", "withdrawal_months"):
                result[k] = float(v) if k == "target_value" else int(v)
            else:
                result[k] = v
        return result
    except Exception:
        return {}


def parse_intent(message: str) -> dict:
    """
    Regex + ASP is primary. Claude fills in only when regex extracts nothing useful.
    Regex results always win on any field both parsers find.
    """
    regex_result = _parse_intent_regex(message)

    if _intent_is_weak(regex_result):
        claude_result = _claude_intent(message)
        # Merge: regex values take priority; Claude fills missing fields only
        merged = {**claude_result, **regex_result}
        return merged

    return regex_result


def _parse_intent_regex(message: str) -> dict:
    """Regex-based fallback intent parser."""
    msg    = message.lower()
    intent: dict = {}

    _SCENARIO_RE = {
        "market_crash": re.compile(r"crash|collapse|black\s*swan|tank(?:ing)?|plummet|2008", re.I),
        "recession":    re.compile(r"recession|slowdown|contraction|economic.*down|downturn", re.I),
        "tech_selloff": re.compile(r"tech.*sell|tech.*drop|tech.*crash|tech.*fall|nasdaq.*fall|tech.*tank", re.I),
        "rate_hike":    re.compile(r"rate.*hike|interest.*ris|fed.*rais|hike.*rate|tighten", re.I),
        "bull_market":  re.compile(r"bull(?:\s*market)?|boom|rally|surge|market.*rising|go.*up|optimis", re.I),
    }
    for sc_id, pat in _SCENARIO_RE.items():
        if pat.search(msg):
            intent["scenario"] = sc_id
            break

    _SECTOR_RE = {
        "tech":          re.compile(r"tech|technology|nasdaq|software|semiconductor|ai\b|semiconductor", re.I),
        "healthcare":    re.compile(r"health(?:care)?|pharma|biotech|medical|hospital|drug", re.I),
        "energy":        re.compile(r"energy|oil|gas|petroleum|fossil|renewabl", re.I),
        "financials":    re.compile(r"financ|bank(?:ing)?|insurance|wall\s*street|lender", re.I),
        "real_estate":   re.compile(r"real\s*estate|property|reit|housing|mortgage", re.I),
        "utilities":     re.compile(r"utilit|electric|water\s*utility|power\s*grid", re.I),
        "consumer":      re.compile(r"consumer|retail|spending|discretionary|staples", re.I),
        "industrials":   re.compile(r"industrial|manufactur|aerospace|defense|transport", re.I),
        "materials":     re.compile(r"materials?|mining|steel|copper|commodity|commodities", re.I),
        "international": re.compile(r"international|global|china|europe|emerging\s*market", re.I),
    }
    for sector, pat in _SECTOR_RE.items():
        if pat.search(msg):
            intent["crash_sector"] = sector
            break
    if "scenario" in intent and "crash_sector" not in intent:
        intent["crash_sector"] = "broad"

    amt = re.search(r"\$\s*([0-9,]+(?:\.[0-9]+)?)\s*(k|thousand|million|m\b)?", msg, re.I)
    if not amt:
        amt = re.search(r"([0-9,]+(?:\.[0-9]+)?)\s*(k|thousand|million)?\s*dollars?", msg, re.I)
    if amt:
        val = float(amt.group(1).replace(",", ""))
        suffix = (amt.group(2) or "").lower()
        if suffix in ("k", "thousand"):     val *= 1_000
        elif suffix in ("m", "million"):    val *= 1_000_000
        intent["target_value"] = val

    tl = re.search(r"in\s+(\d+)\s*(years?|yrs?|months?|mos?)\b", msg, re.I) or \
         re.search(r"(\d+)\s*(years?|yrs?|months?|mos?)\b", msg, re.I)
    if tl:
        n, unit = int(tl.group(1)), tl.group(2).lower()
        intent["timeline_months"] = n if unit.startswith("mo") else n * 12

    if re.search(r"grow|maximiz|wealth|build|accumulate|rich", msg, re.I):
        intent.setdefault("goal_type", "growth")
    if re.search(r"income|dividend|retir|living|passive", msg, re.I):
        intent["goal_type"] = "income"
    if re.search(r"\bsafe\b|protect|preserv|conserv|cautious", msg, re.I):
        intent["goal_type"] = "preservation"

    if re.search(r"bearish|bear market|market.*down|declin", msg, re.I):
        intent["market_trend"] = "bearish"
    elif re.search(r"bullish|bull market|market.*up", msg, re.I):
        intent["market_trend"] = "bullish"

    if re.search(r"volatile|uncertainty|panic|vix|fear", msg, re.I):
        intent["vix_level"] = "high"
    if re.search(r"inflation|price.*ris|cpi", msg, re.I):
        intent["inflation_level"] = "high"
    if re.search(r"rate.*ris|rising.*rate|fed.*hike", msg, re.I):
        intent["rate_environment"] = "rising"
    elif re.search(r"rate.*fall|rate.*cut|lower.*rate|fed.*cut", msg, re.I):
        intent["rate_environment"] = "falling"
    if re.search(r"inverted|yield.*curve|2s10s", msg, re.I):
        intent["yield_curve"] = "inverted"

    if re.search(r"retir|withdraw|need.*money|cash.*out|liquidat", msg, re.I):
        wm = re.search(r"(\d+)\s*months?\b", msg, re.I)
        if wm:
            intent["withdrawal_months"] = int(wm.group(1))

    return intent

# ── Scenario → ASP market context ────────────────────────────────────────────
_SCENARIO_CONTEXT = {
    "market_crash": {
        "vix_level": "high", "market_trend": "bearish",
        "yield_curve": "inverted", "rate_environment": "stable",
        "inflation_level": "moderate", "scenario_loss_pct": 22,
    },
    "recession": {
        "vix_level": "moderate", "market_trend": "bearish",
        "yield_curve": "inverted", "rate_environment": "stable",
        "inflation_level": "moderate", "scenario_loss_pct": 35,
    },
    "tech_selloff": {
        "vix_level": "high", "market_trend": "bearish",
        "yield_curve": "normal", "rate_environment": "stable",
        "inflation_level": "moderate", "scenario_loss_pct": 32,
    },
    "rate_hike": {
        "vix_level": "moderate", "market_trend": "neutral",
        "yield_curve": "flat", "rate_environment": "rising",
        "inflation_level": "high", "scenario_loss_pct": 12,
    },
    "bull_market": {
        "vix_level": "low", "market_trend": "bullish",
        "yield_curve": "normal", "rate_environment": "stable",
        "inflation_level": "low", "scenario_loss_pct": 0,
    },
}

# ── Flag / violation human messages ──────────────────────────────────────────
_FLAG_MSGS: dict[str, dict | str] = {
    "conflict": {
        "crash_vs_growth": "Your growth goal conflicts with a market crash — growth assets take the biggest hit in downturns.",
        "recession_vs_equity": "High equity exposure during a recession is risky — stocks historically drop 30–50% in prolonged downturns.",
        "inflation_vs_bonds": "Adding bonds while inflation is high erodes real returns — consider TIPS or short-duration bonds instead.",
        "no_sell_path": "You need liquidity soon but don't have enough low-risk assets to sell without crystallising big losses.",
        "goal_impossible": "The annual return needed to hit your target far exceeds what any realistic portfolio can deliver.",
        "income_in_crash": "Income-focused portfolios face dividend cuts during market crashes — companies prioritise survival over payouts.",
        "cash_vs_equity_posture": "You can't move to safety and growth at the same time — pick a direction.",
        "reduce_bond_in_crash": "Selling bonds during a crash removes your shock absorber — bonds typically rally when equities fall.",
        "scenario_loss_equity_push": "Pushing into equities when the scenario projects double-digit losses amplifies your downside significantly.",
        "near_withdrawal_equity_push": "Increasing equity exposure with a withdrawal less than 12 months away is risky — a dip could hurt your plans.",
        "reduce_bonds_before_withdrawal": "Selling bonds just before a withdrawal removes your safest liquid asset.",
        "unsat_model": "The market conditions you described create contradictory constraints — try simplifying the scenario.",
    },
    "caution": {
        "flat_curve": "A flat yield curve signals market uncertainty about future growth — avoid aggressive bets in either direction.",
        "goal_risky": "Hitting your target is possible but requires more risk than your conservative profile suggests.",
        "trivial_drift": "Some suggested trades are tiny — weigh whether the transaction cost justifies the rebalance.",
        "preservation_in_bull": "A preservation-focused portfolio will underperform in a bull market — that's the deliberate tradeoff.",
        "equity_ceiling_breach": "Your equity allocation exceeds the typical ceiling for your risk profile — consider rebalancing toward bonds or cash.",
        "beta_ceiling_breach": "Your portfolio beta is higher than recommended for your risk tolerance — a more volatile ride ahead.",
        "buffer_too_low_breach": "Your bond + cash buffer is thin for your risk profile — you'd have limited dry powder in a downturn.",
    },
    "opportunity": {
        "defensive_rotation": "Consider rotating toward defensive sectors (consumer staples, healthcare, utilities) that hold up in recessions.",
        "financials_rotation": "Rising rates typically boost bank earnings — financial ETFs like XLF often outperform in rate-hike cycles.",
        "real_assets": "High inflation + falling markets often favours real assets — commodity ETFs or TIPS can provide a hedge.",
        "growth_stocks": "Normal yield curve + bull market is the ideal environment for growth-oriented equities.",
        "recovery_signal": "Normal yield curve + bullish trend suggests economic expansion — a good time to add growth exposure.",
    },
    "review_holding":        "This position is down more than 20% — review whether the original investment thesis still holds.",
    "stop_loss_review":      "This position is down over 30% — a stop-loss review is strongly recommended.",
    "tax_loss_harvest":      "This losing position could be sold to offset gains elsewhere (tax-loss harvesting).",
    "short_term_gain_warning": "Selling now triggers short-term capital gains tax — consider waiting past the 1-year mark.",
    "overtrading":           "Too many trades at once — focus on the highest-impact moves first to keep costs down.",
    "full_liquidation_risk": "This trade would sell your entire position — make sure that's intentional.",
    "critically_low_balance": "After this withdrawal your portfolio balance will be dangerously low.",
}

_REC_MSGS: dict[tuple, str] = {
    ("increase", "cash"):  "Move more of your portfolio into cash or money-market funds as a defensive buffer.",
    ("reduce",   "bond"):  "Trim your bond allocation — current conditions favour less fixed-income exposure.",
    ("increase", "bond"):  "Add more bonds to your portfolio for stability and recession protection.",
    ("reduce",   "stock"): "Reduce your equity exposure to lower portfolio risk in this environment.",
    ("increase", "stock"): "Increase your equity allocation to capture potential upside in this environment.",
    ("reduce",   "etf"):   "Trim broad-market ETF positions that are overweight vs your target.",
    ("increase", "etf"):   "Add broad-market ETF exposure for diversified upside.",
}

_VIOLATION_MSGS: dict[str, str] = {
    "concentration":      "A single holding makes up too much of your portfolio (>35%) — this is excessive concentration risk.",
    "type_concentration": "A single asset class exceeds 60% of your portfolio — diversification is limited.",
    "under_diversified":  "Your portfolio has fewer than 3 holdings — more diversification is strongly recommended.",
    "equity_ceiling":     "Your equity exposure exceeds the recommended ceiling for your risk profile.",
    "beta_ceiling":       "Your portfolio beta is too high for your stated risk tolerance.",
    "buffer_too_low":     "Your bond + cash buffer is below the minimum for your risk profile — you lack a safety net.",
}

def _flag_message(f: dict) -> str:
    ft, fd = f.get("type", ""), f.get("detail", "")
    node   = _FLAG_MSGS.get(ft)
    if isinstance(node, dict):
        return node.get(fd) or f"{ft}: {fd}"
    if isinstance(node, str):
        return f"{node} ({fd})"
    return f"{ft}: {fd}"

def _rec_message(r: dict) -> str:
    key = (r.get("action", ""), r.get("target", ""))
    return _REC_MSGS.get(key) or f"{r.get('action','').capitalize()} {r.get('target','').upper()} exposure."

def _build_narrative(
    verdict:         list[str],
    flags:           list[dict],
    violations:      list[dict],
    recommendations: list[dict],
    capm_data:       dict,
    scenario_id:     str | None,
    intent:          dict,
) -> str:
    v = verdict[0] if verdict else "proceed"
    parts = []

    # ── Opening verdict sentence ──────────────────────────────────────────
    if v == "do_not_proceed":
        parts.append("I'd recommend holding off on any major rebalancing right now.")
    elif v == "proceed_with_caution":
        parts.append("You can rebalance, but there are important things to watch out for first.")
    else:
        parts.append("Conditions look favourable — this is a reasonable time to rebalance.")

    # ── CAPM math sentence ────────────────────────────────────────────────
    er = capm_data.get("portfolio_expected_annual", 0) * 100 if capm_data else 0
    rf = capm_data.get("risk_free_rate", 0) * 100 if capm_data else 4.5
    pb = capm_data.get("portfolio_beta", 0) if capm_data else 0
    if er > 0:
        parts.append(
            f"Your portfolio beta is {pb:.2f}, and with today's {rf:.1f}% risk-free rate "
            f"(FRED 10-yr Treasury), CAPM puts your expected annual return at about {er:.1f}%."
        )

    # ── Goal / return-gap sentence ────────────────────────────────────────
    tv = intent.get("target_value")
    tl = intent.get("timeline_months")
    rg = capm_data.get("return_gap", "achievable") if capm_data else "achievable"
    if tv and tl:
        years      = tl / 12
        total_val  = capm_data.get("total_value", 0) if capm_data else 0
        yr_label   = f"{years:.0f} year{'s' if years != 1 else ''}"
        needed_pct = ((tv / total_val) ** (1 / max(years, 0.08)) - 1) * 100 if total_val > 0 else 0
        if rg == "achievable":
            parts.append(
                f"Your goal of ${tv:,.0f} in {yr_label} is on track — "
                f"your expected {er:.1f}% return is in the right ballpark."
            )
        elif rg == "high":
            parts.append(
                f"Reaching ${tv:,.0f} in {yr_label} would need ~{needed_pct:.0f}% annually — "
                f"ambitious, but not impossible with a more growth-oriented allocation."
            )
        else:
            parts.append(
                f"Reaching ${tv:,.0f} in {yr_label} would require ~{needed_pct:.0f}% per year — "
                f"far beyond what CAPM predicts for this portfolio. "
                f"Consider a longer timeline, a lower target, or a significantly higher-risk allocation."
            )
    elif intent.get("withdrawal_months"):
        wm = intent["withdrawal_months"]
        parts.append(
            f"With a withdrawal in {wm} month{'s' if wm != 1 else ''}, "
            f"{'move defensive assets to the front of your sell queue.' if wm < 6 else 'protect your near-term liquidity above all else.'}"
        )

    # ── Classify flags ────────────────────────────────────────────────────
    hard_violations = [v2 for v2 in violations
                       if v2["type"] in ("concentration", "type_concentration", "under_diversified")]
    conflicts = [f for f in flags if f.get("type") == "conflict"]
    opps      = [f for f in flags if f.get("type") == "opportunity"]

    # Top conflict or hard violation — most important signal
    if hard_violations:
        parts.append(_VIOLATION_MSGS.get(hard_violations[0]["type"], "A structural portfolio problem was detected."))
    elif conflicts:
        parts.append(_flag_message(conflicts[0]))

    # Top opportunity
    if opps:
        parts.append(_flag_message(opps[0]))

    # Recommendation summary if any
    if recommendations:
        moves = [f"{'↑' if r['action']=='increase' else '↓'} {r['target'].upper()}"
                 for r in recommendations[:3]]
        parts.append(f"Suggested moves: {', '.join(moves)}.")

    return " ".join(parts)

# ── URL helper ────────────────────────────────────────────────────────────────
def request_path(handler: BaseHTTPRequestHandler) -> str:
    raw = (getattr(handler, "path", None) or "/").strip()
    if "?" in raw:
        raw = raw.split("?", 1)[0]
    if raw.startswith("http://") or raw.startswith("https://"):
        raw = urlparse(raw).path or "/"
    return raw.rstrip("/") or "/"

# ── HTTP handler ──────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _json(self, data, status=200, set_cookie=None, clear_cookie=False):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        if set_cookie:
            self.send_header("Set-Cookie", f"folio_session={set_cookie}; Path=/; SameSite=Strict; HttpOnly")
        elif clear_cookie:
            self.send_header("Set-Cookie", "folio_session=; Path=/; SameSite=Strict; HttpOnly; Max-Age=0")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def _bearer_token(self) -> str | None:
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip() or None
        # Fallback: session cookie for requests that can't inject custom headers (e.g. raw fetch())
        for crumb in self.headers.get("Cookie", "").split(";"):
            name, _, value = crumb.strip().partition("=")
            if name == "folio_session":
                return value.strip() or None
        return None

    def _require_auth(self) -> str | None:
        """Returns the authenticated email, or None after sending 401."""
        email = session_email(self._bearer_token())
        if not email:
            self._json({"error": "Unauthorized"}, 401)
            return None
        return email

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        p = request_path(self)
        if p == "/api/health":
            return self._json({"ok": True, "service": "folio"})
        if p == "/api/scenarios":
            return self._json({k: {"name": v["name"], "icon": v["icon"], "description": v["description"]}
                                for k, v in SCENARIOS.items()})
        if p == "/api/auth/me":
            email = session_email(self._bearer_token())
            if not email:
                return self._json({"error": "Unauthorized"}, 401)
            with _users_lock:
                return self._json({"user": public_user(load_users(), email)})
        if p == "/api/portfolio":
            email = self._require_auth()
            if not email: return
            return self._json(load_portfolio(email))
        if p == "/api/user/profile":
            email = self._require_auth()
            if not email: return
            with _users_lock:
                profile = load_users().get(email, {}).get("investor_profile")
            return self._json({"profile": profile})
        if p == "/api/user-scenarios":
            email = self._require_auth()
            if not email: return
            scenarios = load_user_scenarios(email)
            summaries = [
                {
                    "id":            s.get("id"),
                    "timestamp":     s.get("timestamp"),
                    "scenario_text": s.get("scenario_text"),
                    "verdict":       s.get("verdict"),
                    "verdict_label": s.get("verdict_label"),
                    "trade_count":   s.get("trade_count", 0),
                    "reasoning":     s.get("reasoning"),
                    "narrative":     s.get("narrative"),
                    "rebalance":     s.get("rebalance"),
                    "flags":         s.get("flags", []),
                }
                for s in scenarios
            ]
            return self._json({"scenarios": summaries})
        if p.startswith("/api/user-scenarios/"):
            email = self._require_auth()
            if not email: return
            sid = p.split("/api/user-scenarios/")[1]
            scenarios = load_user_scenarios(email)
            match = next((s for s in scenarios if s.get("id") == sid), None)
            if not match:
                return self._json({"error": "Not found"}, 404)
            return self._json(match)
        self._json({"error": "Not found"}, 404)

    def do_DELETE(self):
        p = request_path(self)
        if p.startswith("/api/user-scenarios/"):
            email = self._require_auth()
            if not email: return
            sid = p.split("/api/user-scenarios/")[1]
            scenarios = load_user_scenarios(email)
            new_list = [s for s in scenarios if s.get("id") != sid]
            if len(new_list) == len(scenarios):
                return self._json({"error": "Not found"}, 404)
            save_user_scenarios(email, new_list)
            return self._json({"ok": True})
        self._json({"error": "Not found"}, 404)

    def do_POST(self):
        p = request_path(self)
        try:
            body = self._read_json()
        except Exception as e:
            return self._json({"error": f"Invalid JSON: {e}"}, 400)

        # ── Auth endpoints (no token required) ────────────────────────────
        if p == "/api/auth/signup":
            email    = (body.get("email") or "").strip().lower()
            password = body.get("password") or ""
            display  = (body.get("displayName") or "").strip() or None
            if not EMAIL_RE.match(email):
                return self._json({"error": "Please enter a valid email address."}, 400)
            if len(password) < 6:
                return self._json({"error": "Password must be at least 6 characters."}, 400)
            with _users_lock:
                users = load_users()
                if email in users:
                    return self._json({"error": "An account with that email already exists."}, 409)
                users[email] = {
                    "email":         email,
                    "password_hash": _hash_password(password),
                    "display_name":  display or email.split("@")[0],
                    "created_at":    int(time.time()),
                }
                save_users(users)
                user_payload = public_user(users, email)
            blank = {"name": "My Portfolio", "risk_profile": "moderate",
                     "holdings": [], "cash": 0, "target_cash_pct": 5}
            save_portfolio(email, blank)
            token = create_session(email)
            return self._json({"token": token, "user": user_payload}, set_cookie=token)

        if p == "/api/auth/login":
            email    = (body.get("email") or "").strip().lower()
            password = body.get("password") or ""
            with _users_lock:
                users = load_users()
                u = users.get(email)
                if not u or not _verify_password(password, u.get("password_hash", "")):
                    return self._json({"error": "Invalid email or password."}, 401)
                user_payload = public_user(users, email)
            token = create_session(email)
            return self._json({"token": token, "user": user_payload}, set_cookie=token)

        if p == "/api/auth/logout":
            destroy_session(self._bearer_token())
            return self._json({"ok": True}, clear_cookie=True)

        # ── Authed endpoints ──────────────────────────────────────────────
        email = self._require_auth()
        if not email:
            return

        if p == "/api/portfolio":
            save_portfolio(email, body)
            return self._json({"ok": True})

        if p == "/api/portfolio/add":
            port = load_portfolio(email)
            h = dict(body)
            h["id"] = h.get("id") or f"h{uuid.uuid4().hex[:8]}"
            # Merge using "Manual" as source so all entry points stay consistent
            port = _merge_portfolio(port, [h], "Manual", [])
            save_portfolio(email, port)
            return self._json({"ok": True, "portfolio": port})

        if p == "/api/portfolio/update":
            port = load_portfolio(email)
            hid  = body.get("id")
            port["holdings"] = [body if h["id"] == hid else h for h in port["holdings"]]
            save_portfolio(email, port)
            return self._json({"ok": True, "portfolio": port})

        if p == "/api/portfolio/remove":
            port = load_portfolio(email)
            hid  = body.get("id")
            port["holdings"] = [h for h in port["holdings"] if h["id"] != hid]
            save_portfolio(email, port)
            return self._json({"ok": True, "portfolio": port})

        if p == "/api/prices":
            syms   = body.get("symbols", [])
            prices = fetch_prices(syms)
            return self._json({"prices": prices})

        if p == "/api/risk":
            return self._json(calc_risk(body.get("portfolio", {}), body.get("prices", {})))

        if p == "/api/rebalance":
            with _users_lock:
                profile = load_users().get(email, {}).get("investor_profile")
            portfolio = body.get("portfolio", {})
            prices_b  = body.get("prices", {})
            if profile:
                return self._json(calc_rebalance_profile(portfolio, prices_b, profile))
            return self._json(calc_rebalance(portfolio, prices_b))

        if p == "/api/scenario":
            return self._json(calc_scenario(
                body.get("portfolio", {}),
                body.get("prices", {}),
                body.get("scenario_id", "market_crash"),
            ))

        if p == "/api/portfolio/import-pdf":
            return self._json(import_pdf(body.get("pdf_b64", "")))

        if p == "/api/portfolio/import-merge":
            new_holdings       = body.get("holdings", [])
            brokerage          = (body.get("brokerage") or "Unknown Brokerage").strip()
            confirmed_removals = body.get("confirmed_removals", [])
            port = load_portfolio(email)
            port = _merge_portfolio(port, new_holdings, brokerage, confirmed_removals)
            save_portfolio(email, port)
            return self._json({"ok": True, "portfolio": port})

        if p == "/api/user/profile":
            with _users_lock:
                users = load_users()
                if email in users:
                    users[email]["investor_profile"] = body
                    save_users(users)
            return self._json({"ok": True})

        if p == "/api/chat":
            try:
                return self._handle_chat(email, body)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return self._json({"error": f"Chat error: {e}"}, 500)

        if p == "/api/analyze":
            try:
                return self._handle_analyze(email, body)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return self._json({"error": f"Analyze error: {e}"}, 500)

        self._json({"error": "Not found"}, 404)

    # ── Chat / rebalancing advisor ────────────────────────────────────────
    def _handle_chat(self, email: str, body: dict):
        message   = str(body.get("message", "")).strip()
        portfolio = body.get("portfolio") or load_portfolio(email)
        prices    = body.get("prices", {})

        if not message:
            return self._json({"error": "message is required"}, 400)

        # 1. Parse intent from natural language
        intent = parse_intent(message)

        # 2. Fetch live betas (parallel, same as calc_risk)
        holdings = portfolio.get("holdings", [])
        betas: dict[str, float] = {}
        def _get_beta(st: tuple[str, str]) -> tuple[str, float]:
            sym, typ = st
            try:
                import yfinance as yf
                b = yf.Ticker(sym).info.get("beta")
                return sym, float(b) if b else TYPE_BETA.get(typ, 1.0)
            except Exception:
                return sym, TYPE_BETA.get(typ, 1.0)
        if holdings:
            with ThreadPoolExecutor(max_workers=min(len(holdings), 10)) as ex:
                for sym, beta in ex.map(_get_beta, [(h["symbol"], h["type"]) for h in holdings]):
                    betas[sym] = beta

        # 3. Build market context
        scenario_id = intent.get("scenario")
        market_ctx  = dict(_SCENARIO_CONTEXT.get(scenario_id, {
            "vix_level": "moderate", "market_trend": "neutral",
            "yield_curve": "normal",  "rate_environment": "stable",
            "inflation_level": "moderate",
        }))
        market_ctx["scenario"] = scenario_id
        # Intent overrides
        for key in ("vix_level", "market_trend", "yield_curve", "rate_environment", "inflation_level"):
            if key in intent:
                market_ctx[key] = intent[key]

        # 4. CAPM expected return
        capm_data = calc_capm(portfolio, prices, betas)
        target_val = intent.get("target_value")
        tl_months  = intent.get("timeline_months")
        rg = calc_return_gap(
            capm_data["total_value"], target_val, tl_months,
            capm_data["portfolio_expected_annual"],
        ) if target_val else "achievable"
        capm_data["return_gap"] = rg

        # 5. Build goal context
        goal_ctx = {
            "type":              intent.get("goal_type", "growth"),
            "target_value":      target_val,
            "timeline_months":   tl_months,
            "withdrawal_months": intent.get("withdrawal_months"),
        }

        # 6. Run ASP planner
        asp = _run_planner(portfolio, prices, betas, market_ctx, goal_ctx, capm_data)

        # 7. Run scenario simulation if scenario detected
        scenario_result = None
        if scenario_id and scenario_id in SCENARIOS:
            scenario_result = calc_scenario(portfolio, prices, scenario_id)

        # 8. Build human-readable narrative
        narrative = _build_narrative(
            asp["verdict"], asp["flags"], asp["violations"],
            asp["recommendations"], capm_data, scenario_id, intent,
        )

        # 9. Enrich flags/recs with messages
        enriched_flags = [
            {**f, "message": _flag_message(f)} for f in asp["flags"]
        ]
        enriched_recs = [
            {**r, "message": _rec_message(r)} for r in asp["recommendations"]
        ]
        enriched_violations = [
            {**v, "message": _VIOLATION_MSGS.get(v["type"], v["type"])}
            for v in asp["violations"]
        ]

        # 10. Prefer-sell liquidation order (top 5)
        prefer_sell_out = asp.get("prefer_sell", [])[:5]

        verdict_val = asp["verdict"][0] if asp["verdict"] else "proceed"
        verdict_map = {
            "proceed":              {"label": "Proceed",              "color": "green"},
            "proceed_with_caution": {"label": "Proceed with Caution", "color": "yellow"},
            "do_not_proceed":       {"label": "Do Not Proceed",       "color": "red"},
        }

        return self._json({
            "verdict":         verdict_val,
            "verdict_label":   verdict_map[verdict_val]["label"],
            "verdict_color":   verdict_map[verdict_val]["color"],
            "narrative":       narrative,
            "flags":           enriched_flags,
            "violations":      enriched_violations,
            "recommendations": enriched_recs,
            "prefer_sell":     prefer_sell_out,
            "math": {
                "portfolio_beta":           capm_data["portfolio_beta"],
                "risk_free_rate":           capm_data["risk_free_rate"],
                "portfolio_expected_annual": capm_data["portfolio_expected_annual"],
                "return_gap":               rg,
                "target_value":             target_val,
                "timeline_months":          tl_months,
                "capm_source":              capm_data["source"],
            },
            "scenario_result": scenario_result,
            "parsed_intent":   intent,
            "planner_engine":  "clingo" if PLANNER_AVAILABLE else "python-fallback",
        })

    # ── Scenario analyzer + rebalance planner ────────────────────────────
    def _handle_analyze(self, email: str, body: dict):
        message   = str(body.get("message", "")).strip()
        portfolio = body.get("portfolio") or load_portfolio(email)
        prices    = body.get("prices", {})

        if not message:
            return self._json({"error": "message is required"}, 400)

        # Load investor profile from user record (set by OnboardingScreen)
        with _users_lock:
            profile = load_users().get(email, {}).get("investor_profile") or {}

        # 1. Parse intent
        intent = parse_intent(message)

        # 2. Fetch live betas (parallel)
        holdings = portfolio.get("holdings", [])
        betas: dict[str, float] = {}
        def _get_beta(st: tuple[str, str]) -> tuple[str, float]:
            sym, typ = st
            try:
                import yfinance as yf
                b = yf.Ticker(sym).info.get("beta")
                return sym, float(b) if b else TYPE_BETA.get(typ, 1.0)
            except Exception:
                return sym, TYPE_BETA.get(typ, 1.0)
        if holdings:
            with ThreadPoolExecutor(max_workers=min(len(holdings), 10)) as ex:
                for sym, beta in ex.map(_get_beta, [(h["symbol"], h["type"]) for h in holdings]):
                    betas[sym] = beta

        # 3. Market context from scenario + intent
        scenario_id = intent.get("scenario")
        market_ctx  = dict(_SCENARIO_CONTEXT.get(scenario_id, {
            "vix_level": "moderate", "market_trend": "neutral",
            "yield_curve": "normal",  "rate_environment": "stable",
            "inflation_level": "moderate",
        }))
        market_ctx["scenario"] = scenario_id
        for key in ("vix_level", "market_trend", "yield_curve", "rate_environment", "inflation_level"):
            if key in intent:
                market_ctx[key] = intent[key]

        # 4. CAPM + return gap
        capm_data  = calc_capm(portfolio, prices, betas)
        target_val = intent.get("target_value")
        tl_months  = intent.get("timeline_months")
        rg = calc_return_gap(
            capm_data["total_value"], target_val, tl_months,
            capm_data["portfolio_expected_annual"],
        ) if target_val else "achievable"
        capm_data["return_gap"] = rg

        # 5. Goal context for ASP
        goal_ctx = {
            "type":              intent.get("goal_type", profile.get("goal", "growth").lower()),
            "target_value":      target_val,
            "timeline_months":   tl_months,
            "withdrawal_months": intent.get("withdrawal_months"),
        }

        # 6. ASP planner verdict
        asp = _run_planner(portfolio, prices, betas, market_ctx, goal_ctx, capm_data)

        # 7. Concrete rebalance plan
        crash_sector = intent.get("crash_sector")
        rebalance_plan, reasoning = _generate_rebalance_plan(
            portfolio, prices, betas, profile, scenario_id, asp, crash_sector,
        )

        # 7b. Post-rebalance beta estimate
        post_beta = estimate_post_rebalance_beta(
            portfolio, rebalance_plan.get("trades", []), betas, prices
        )

        # 8. Scenario simulation (price shock)
        scenario_result = None
        if scenario_id and scenario_id in SCENARIOS:
            scenario_result = calc_scenario(portfolio, prices, scenario_id)

        # 9. Narrative + enriched flags
        narrative = _build_narrative(
            asp["verdict"], asp["flags"], asp["violations"],
            asp["recommendations"], capm_data, scenario_id, intent,
        )
        enriched_flags      = [{**f, "message": _flag_message(f)} for f in asp["flags"]]
        enriched_violations = [{**v, "message": _VIOLATION_MSGS.get(v["type"], v["type"])}
                               for v in asp["violations"]]
        enriched_recs       = [{**r, "message": _rec_message(r)} for r in asp["recommendations"]]

        verdict_val = (asp["verdict"] or ["proceed"])[0]
        verdict_map = {
            "proceed":              {"label": "Proceed",              "color": "green"},
            "proceed_with_caution": {"label": "Proceed with Caution", "color": "yellow"},
            "do_not_proceed":       {"label": "Do Not Proceed",       "color": "red"},
        }
        v_info = verdict_map.get(verdict_val, verdict_map["proceed"])

        # 10. Persist scenario record
        record = {
            "id":            str(uuid.uuid4()),
            "timestamp":     time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            "scenario_text": message,
            "parsed_intent": intent,
            "verdict":       verdict_val,
            "verdict_label": v_info["label"],
            "verdict_color": v_info["color"],
            "trade_count":   len(rebalance_plan.get("trades", [])),
            "narrative":     narrative,
            "reasoning":     reasoning,
            "rebalance":     rebalance_plan,
            "flags":         enriched_flags,
            "violations":    enriched_violations,
            "recommendations": enriched_recs,
            "math": {
                "portfolio_beta":            capm_data["portfolio_beta"],
                "post_rebalance_beta":       post_beta,
                "risk_free_rate":            capm_data["risk_free_rate"],
                "portfolio_expected_annual": capm_data["portfolio_expected_annual"],
                "return_gap":                rg,
                "target_value":              target_val,
                "timeline_months":           tl_months,
                "capm_source":               capm_data["source"],
            },
            "scenario_result": scenario_result,
            "planner_engine":  "clingo" if PLANNER_AVAILABLE else "python-fallback",
            "profile_used":    profile,
        }
        save_user_scenario(email, record)
        return self._json(record)


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Folio API  →  http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


