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
import secrets
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
load_dotenv()

BACKEND        = Path(__file__).resolve().parent
DATA_DIR       = BACKEND / "data"
PORTFOLIO_DIR  = DATA_DIR / "portfolios"
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
        data   = base64.b64decode(pdf_b64)
        reader = pypdf.PdfReader(io.BytesIO(data))
        text   = "\n".join(p.extract_text() or "" for p in reader.pages)
        rows   = _parse_holdings_text(text)
        return {"holdings": rows, "count": len(rows)}
    except Exception as exc:
        return {"error": str(exc)}

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
        if holdings[i].get("type") == "bond"
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

    def _json(self, data, status=200):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def _bearer_token(self) -> str | None:
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip() or None
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
            load_portfolio(email)   # seed default portfolio file
            token = create_session(email)
            return self._json({"token": token, "user": user_payload})

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
            return self._json({"token": token, "user": user_payload})

        if p == "/api/auth/logout":
            destroy_session(self._bearer_token())
            return self._json({"ok": True})

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
            port["holdings"].append(h)
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
            return self._json(calc_rebalance(body.get("portfolio", {}), body.get("prices", {})))

        if p == "/api/scenario":
            return self._json(calc_scenario(
                body.get("portfolio", {}),
                body.get("prices", {}),
                body.get("scenario_id", "market_crash"),
            ))

        if p == "/api/portfolio/import-pdf":
            return self._json(import_pdf(body.get("pdf_b64", "")))

        if p == "/api/user/profile":
            with _users_lock:
                users = load_users()
                if email in users:
                    users[email]["investor_profile"] = body
                    save_users(users)
            return self._json({"ok": True})

        self._json({"error": "Not found"}, 404)


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Folio API  →  http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


