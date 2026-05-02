"""
ETF Universe Builder — Massive.com (formerly Polygon.io) reference data.

Fetches all active US ETFs, classifies them into asset-class buckets by name/description,
enriches the top candidates with live yfinance data (price, AUM, beta), and caches to disk.

Cache: backend/data/etf_cache.json — refreshed once per day.
API base: api.polygon.io (Massive kept the same URLs post-rebrand).
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.request import urlopen
from concurrent.futures import ThreadPoolExecutor

CACHE_FILE = Path(__file__).resolve().parent / "etf_cache.json"
CACHE_TTL  = 86400   # 24 hours

API_BASE = "https://api.polygon.io"

# ── Bucket keyword classifier ──────────────────────────────────────────────────
BUCKET_KEYWORDS: dict[str, list[str]] = {
    "us_equity_broad":  ["total stock", "s&p 500", "total market", "500 index",
                         "large blend", "large-cap blend", "core s&p", "wilshire",
                         "russell 1000"],
    "us_equity_growth": ["growth", "nasdaq-100", "nasdaq 100", "momentum",
                         "technology select", "information tech"],
    "us_equity_value":  ["value", "quality factor", "fundamental index"],
    "dividend":         ["dividend", "high dividend", "dividend yield",
                         "dividend appreciation", "equity income", "income equity"],
    "international":    ["international", "world ex", "global ex", "eafe", "europe",
                         "emerging market", "developed market", "ex-u.s", "ex us",
                         "pacific", "asia"],
    "bonds_short":      ["short term", "short-term bond", "1-3 year", "ultra short",
                         "short duration", "0-3 month", "floating rate"],
    "bonds_medium":     ["aggregate bond", "core bond", "intermediate bond",
                         "total bond", "bond market", "core-plus", "broad bond"],
    "bonds_long":       ["long term bond", "long-term bond", "20+ year",
                         "long duration", "long government"],
    "bonds_tips":       ["tips", "inflation protected", "treasury inflation",
                         "inflation-linked", "real return bond"],
    "bonds_corporate":  ["corporate bond", "corporate debt", "investment grade corp",
                         "high yield bond", "high-yield bond"],
    "defensive":        ["utilities", "consumer staples", "healthcare",
                         "low volatility", "minimum volatility", "min vol", "defensive"],
    "real_estate":      ["real estate", "reit", "property fund"],
    "commodities":      ["gold", "silver", "commodity", "commodities", "energy etf",
                         "oil etf", "natural gas", "materials etf", "precious metal",
                         "broad commodity"],
    "financials":       ["financial select", "bank etf", "insurance etf", "kbe", "xlf"],
}

BUCKET_LABELS: dict[str, str] = {
    "us_equity_broad":  "US Broad Market",
    "us_equity_growth": "US Growth Equity",
    "us_equity_value":  "US Value Equity",
    "dividend":         "Dividend / Income",
    "international":    "International Equity",
    "bonds_short":      "Short-Term Bonds",
    "bonds_medium":     "Core Bonds",
    "bonds_long":       "Long-Term Bonds",
    "bonds_tips":       "Inflation-Protected Bonds",
    "bonds_corporate":  "Corporate Bonds",
    "defensive":        "Defensive / Low-Vol",
    "real_estate":      "Real Estate (REITs)",
    "commodities":      "Commodities & Gold",
    "financials":       "Financials",
}


def _classify(name: str, description: str = "") -> str | None:
    text = (name + " " + description).lower()
    for bucket, keywords in BUCKET_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return bucket
    return None


def _fetch_etf_tickers(api_key: str, max_pages: int = 5) -> list[dict]:
    """Paginate Massive/Polygon ETF reference endpoint. Rate-limited to 4 req/min."""
    tickers: list[dict] = []
    url = (
        f"{API_BASE}/v3/reference/tickers"
        f"?type=ETF&active=true&market=stocks&limit=250&apiKey={api_key}"
    )
    for page in range(max_pages):
        try:
            with urlopen(url, timeout=15) as r:
                data = json.loads(r.read().decode())
            tickers.extend(data.get("results", []))
            next_url = data.get("next_url")
            if not next_url:
                break
            url = next_url + f"&apiKey={api_key}"
            if page < max_pages - 1:
                time.sleep(15)   # stay under 5 calls/min free tier
        except Exception as e:
            print(f"[etf_universe] fetch error page {page}: {e}")
            break
    return tickers


def _enrich_with_yfinance(symbols: list[str]) -> dict[str, dict]:
    import yfinance as yf

    def _get_one(sym: str) -> tuple[str, dict]:
        try:
            info   = yf.Ticker(sym).info
            price  = (info.get("currentPrice") or info.get("regularMarketPrice")
                      or info.get("navPrice") or info.get("previousClose") or 0)
            volume = info.get("averageVolume") or info.get("averageVolume10days") or 0
            beta   = info.get("beta") or 0
            aum    = info.get("totalAssets") or 0
            return sym, {"price": round(float(price), 2), "volume": int(volume),
                         "beta": round(float(beta), 3), "aum": int(aum)}
        except Exception:
            return sym, {"price": 0, "volume": 0, "beta": 0, "aum": 0}

    result: dict[str, dict] = {}
    if not symbols:
        return result
    with ThreadPoolExecutor(max_workers=10) as ex:
        for sym, data in ex.map(_get_one, symbols):
            result[sym] = data
    return result


def _build_universe(api_key: str) -> dict[str, list[dict]]:
    print("[etf_universe] Fetching ETF reference data from Massive…")
    raw = _fetch_etf_tickers(api_key)
    print(f"[etf_universe] Got {len(raw)} ETF tickers — classifying…")

    classified: dict[str, list[str]] = {b: [] for b in BUCKET_KEYWORDS}
    for t in raw:
        sym    = t.get("ticker", "")
        name   = t.get("name", "")
        desc   = t.get("description", "")
        bucket = _classify(name, desc)
        if bucket and sym:
            classified[bucket].append(sym)

    # Cap per bucket before enrichment to limit yfinance calls
    to_enrich: list[str] = []
    for bucket in classified:
        classified[bucket] = classified[bucket][:20]
        to_enrich.extend(classified[bucket])
    to_enrich = list(set(to_enrich))

    print(f"[etf_universe] Enriching {len(to_enrich)} tickers via yfinance…")
    enriched = _enrich_with_yfinance(to_enrich)

    universe: dict[str, list[dict]] = {}
    for bucket, syms in classified.items():
        entries = []
        for sym in syms:
            info = enriched.get(sym, {})
            if info.get("price", 0) <= 0:
                continue
            entries.append({
                "ticker": sym,
                "bucket": bucket,
                "label":  BUCKET_LABELS[bucket],
                "price":  info["price"],
                "volume": info["volume"],
                "beta":   info["beta"],
                "aum":    info["aum"],
            })
        entries.sort(key=lambda x: -x["aum"])
        universe[bucket] = entries[:10]

    return universe


# ── In-memory + file cache ─────────────────────────────────────────────────────
_CACHE: dict = {"ts": 0, "universe": {}}
_BUILDING = False

# Fallback universe used when Massive API is unavailable
_FALLBACK: dict[str, list[dict]] = {
    "us_equity_broad":  [{"ticker": "VTI",  "label": "US Broad Market",          "price": 0, "beta": 1.0, "aum": 0}],
    "us_equity_growth": [{"ticker": "QQQ",  "label": "US Growth Equity",         "price": 0, "beta": 1.1, "aum": 0}],
    "us_equity_value":  [{"ticker": "VTV",  "label": "US Value Equity",           "price": 0, "beta": 0.9, "aum": 0}],
    "dividend":         [{"ticker": "SCHD", "label": "Dividend / Income",         "price": 0, "beta": 0.7, "aum": 0}],
    "international":    [{"ticker": "VXUS", "label": "International Equity",      "price": 0, "beta": 0.9, "aum": 0}],
    "bonds_short":      [{"ticker": "SHY",  "label": "Short-Term Bonds",          "price": 0, "beta": 0.1, "aum": 0}],
    "bonds_medium":     [{"ticker": "BND",  "label": "Core Bonds",                "price": 0, "beta": 0.2, "aum": 0}],
    "bonds_long":       [{"ticker": "TLT",  "label": "Long-Term Bonds",           "price": 0, "beta": 0.3, "aum": 0}],
    "bonds_tips":       [{"ticker": "TIP",  "label": "Inflation-Protected Bonds", "price": 0, "beta": 0.2, "aum": 0}],
    "bonds_corporate":  [{"ticker": "LQD",  "label": "Corporate Bonds",           "price": 0, "beta": 0.3, "aum": 0}],
    "defensive":        [{"ticker": "XLV",  "label": "Defensive / Low-Vol",       "price": 0, "beta": 0.6, "aum": 0}],
    "real_estate":      [{"ticker": "VNQ",  "label": "Real Estate (REITs)",        "price": 0, "beta": 0.8, "aum": 0}],
    "commodities":      [{"ticker": "GLD",  "label": "Commodities & Gold",         "price": 0, "beta": 0.1, "aum": 0}],
    "financials":       [{"ticker": "XLF",  "label": "Financials",                 "price": 0, "beta": 1.1, "aum": 0}],
}


def _background_build(api_key: str) -> None:
    global _BUILDING
    try:
        universe = _build_universe(api_key)
        now = time.time()
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(
            json.dumps({"ts": now, "universe": universe}, indent=2),
            encoding="utf-8",
        )
        _CACHE["ts"]       = now
        _CACHE["universe"] = universe
        print("[etf_universe] Background build complete — live universe now active")
    except Exception as e:
        print(f"[etf_universe] Background build failed: {e}")
    finally:
        _BUILDING = False


def get_universe() -> dict[str, list[dict]]:
    global _BUILDING
    now = time.time()

    if _CACHE["universe"] and (now - _CACHE["ts"]) < CACHE_TTL:
        return _CACHE["universe"]

    if CACHE_FILE.exists():
        try:
            saved = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            if now - saved.get("ts", 0) < CACHE_TTL:
                _CACHE["ts"]       = saved["ts"]
                _CACHE["universe"] = saved["universe"]
                return _CACHE["universe"]
        except Exception:
            pass

    api_key = os.getenv("MASSIVE_API_KEY", "")
    if not api_key:
        print("[etf_universe] No MASSIVE_API_KEY — using fallback universe")
        return _FALLBACK

    if not _BUILDING:
        _BUILDING = True
        import threading
        threading.Thread(target=_background_build, args=(api_key,), daemon=True).start()
        print("[etf_universe] Building universe in background — using fallback for now")

    return _FALLBACK


def top_pick(bucket: str) -> dict | None:
    picks = get_universe().get(bucket, [])
    return picks[0] if picks else _FALLBACK.get(bucket, [None])[0]
