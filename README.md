# Meridian — Your Financial North Star

A modern, full-stack portfolio management platform that combines real-time market data, risk analysis, scenario simulation, AI-powered Q&A (**Ask Meridian**), and rules-based rebalancing. Built for the Goldman Sachs Hackathon.

> **Naming note:** The product was originally prototyped as *Folio* / *TwinTrack*. The user-facing name is now **Meridian**, but several internal identifiers still reflect the old names — e.g. the frontend folder is `twintrack/`, the root component is `TwinTrack.jsx`, the AI screen file is `AskFolioScreen.jsx`, the session-token key is `folio.session.token`, and the backend `server.py` docstring still says "Folio". These are intentional legacy paths and do not affect functionality.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Setup](#setup)
- [Running the App](#running-the-app)
- [API Reference](#api-reference)
- [Reasoning & Rebalancing Engine](#reasoning--rebalancing-engine)
- [Data & Storage](#data--storage)
- [Security](#security)
- [Project Structure](#project-structure)
- [Development Notes](#development-notes)

---

## Features

### Core Portfolio Management
- **Portfolio Overview** — interactive pie chart, total value, gain/loss tracking
- **Holdings CRUD** — add, edit, remove individual positions with target allocations
- **Industry Diversification** — automatic sector categorization with concentration warnings
- **Real-time Pricing** — live quotes via Yahoo Finance (`yfinance`) with mock fallback
- **Multi-Brokerage Tracking** — weighted-average cost basis across brokerage sources

### Onboarding & Investor Profile
- **Onboarding flow** captures investor type, risk level, goals, and time horizon
- Profile drives **personalized rebalancing targets** (conservative / moderate / aggressive)
- Goal-based allocation nudges (retirement, growth, income, etc.)

### Risk Assessment
- **Portfolio beta** computed from live betas (yfinance) with type-based fallback
- **Risk score** (1–10) with plain-English explanation and label (Safe & Steady → Aggressive)
- **Concentration warnings** for overweight positions (>22%, >30%)
- **Diversification score** based on asset-class spread

### Scenario Simulation
Test your portfolio under five built-in market scenarios:
- **Market Crash** (-22% equities)
- **Prolonged Recession** (-38% equities, +8% bonds)
- **Tech Selloff** (sector-targeted -32% on tech tickers)
- **Interest Rate Hike** (-12% bonds, -8% equities)
- **Bull Market** (+28% equities)

Persists scenario history per user (last 50 runs) for replay and comparison.

### Rebalancing Engine
- **Rules-based ASP planner** (Clingo) with pure-Python fallback
- **Profile-aware allocation** across 15 buckets (US equity broad/growth/value, dividend, international, bonds, defensive, real estate, commodities, financials, cash)
- **Drift detection** with prioritized buy/sell suggestions and dollar trade values
- **Post-rebalance beta estimate** to preview risk impact

### Ask Meridian (AI Assistant)
- Natural-language Q&A over your portfolio powered by **Anthropic Claude**
- `/api/chat` and `/api/analyze` endpoints with portfolio context injection
- Sidebar entry labeled **"Ask Meridian"** (file: `AskFolioScreen.jsx`)

### Import & Export
- **PDF import** of brokerage statements / holdings exports (`pypdf`)
- **Brokerage merge** with weighted-average cost reconciliation
- **Print Statement** view for a clean printable summary

### Authentication
- Email/password signup & login
- **PBKDF2-SHA256** password hashing (200,000 iterations)
- **Token-based sessions** (7-day TTL) via `Authorization: Bearer` header or cookie
- Per-user data isolation (portfolio, scenarios, profile)

---

## Architecture

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   React + Vite (5173)   │ ──HTTP─▶│  Python stdlib (8765)   │
│   twintrack/            │         │  backend/server.py      │
└─────────────────────────┘         └────────┬────────────────┘
                                             │
                              ┌──────────────┼──────────────┐
                              ▼              ▼              ▼
                        yfinance API    Anthropic API   reasoning/
                        (live prices)   (Ask Folio)     planner.py
                                                        rebalancer.py
                                                        rules.lp (Clingo)
```

---

## Technology Stack

### Frontend (`twintrack/`)
- **React 19** + functional components / hooks
- **Vite 5** dev server & bundler
- **Recharts** for charts
- **lucide-react** icons
- Custom design system in `src/theme.js`

### Backend (`backend/`)
- **Python 3.10+** standard library `ThreadingHTTPServer` (no Flask/FastAPI)
- **yfinance** for prices and betas
- **pypdf** for statement import
- **clingo** for ASP rebalancing rules (optional)
- **scipy** for numeric helpers
- **anthropic** SDK for Ask Folio
- **python-dotenv** for env loading

---

## Setup

### Prerequisites
- Python **3.10+**
- Node.js **18+**
- Git

### 1. Clone & Install

```bash
git clone https://github.com/AnnieJP/goldmansachs-hackathon.git
cd goldmansachs-hackathon

# Backend deps
pip install -r requirements.txt

# Frontend deps
cd twintrack
npm install
cd ..
```

### 2. Environment

Copy the example env file and fill in any keys you want to use:

```bash
cp .env.example .env
```

Supported env vars:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required for **Ask Meridian** chat & analyze endpoints |
| `FRED_API_KEY` | Optional macro data |
| `BLS_API_KEY` | Optional labor stats |
| `BEA_API_KEY` | Optional GDP data |
| `CENSUS_API_KEY` | Optional demographics |
| `NEWSDATA_API_KEY` | Optional news headlines |

The app runs without any keys (yfinance + mock prices fallback), but Ask Meridian requires `ANTHROPIC_API_KEY`.

---

## Running the App

**Terminal 1 — Backend (port 8765):**
```bash
python backend/server.py
```

**Terminal 2 — Frontend (port 5173):**
```bash
cd twintrack
npm run dev
```

Open **http://localhost:5173**, sign up, and you'll be seeded with a demo portfolio (AAPL, MSFT, VOO, BND, GOOGL, VTI + cash).

---

## API Reference

Base URL: `http://127.0.0.1:8765`

All non-auth endpoints require `Authorization: Bearer <token>` (or session cookie).

### Auth
| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Create account `{email, password, displayName?}` |
| `POST` | `/api/auth/login` | Login `{email, password}` → `{token, user}` |
| `POST` | `/api/auth/logout` | Destroy session |
| `GET`  | `/api/auth/me` | Current user info |

### Portfolio
| Method | Path | Description |
| --- | --- | --- |
| `GET`  | `/api/portfolio` | Load current user portfolio |
| `POST` | `/api/portfolio` | Full replace |
| `POST` | `/api/portfolio/add` | Add a holding |
| `POST` | `/api/portfolio/update` | Update by `id` |
| `POST` | `/api/portfolio/remove` | Remove by `id` |
| `POST` | `/api/portfolio/import-pdf` | Parse base64 PDF → holdings |
| `POST` | `/api/portfolio/import-merge` | Merge parsed holdings under a brokerage |

### Profile
| Method | Path | Description |
| --- | --- | --- |
| `GET`  | `/api/user/profile` | Load investor profile |
| `POST` | `/api/user/profile` | Save investor profile (onboarding) |

### Market Data & Analysis
| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/prices` | `{symbols: [...]}` → live prices |
| `POST` | `/api/risk` | `{portfolio, prices}` → beta, score, warnings |
| `POST` | `/api/rebalance` | `{portfolio, prices}` → buy/sell suggestions (profile-aware) |
| `POST` | `/api/scenario` | `{portfolio, prices, scenario_id}` → simulated outcome |
| `GET`  | `/api/scenarios` | List built-in scenario metadata |

### Scenario History
| Method | Path | Description |
| --- | --- | --- |
| `GET`    | `/api/user-scenarios` | List saved scenarios (summaries) |
| `GET`    | `/api/user-scenarios/{id}` | Fetch full record |
| `DELETE` | `/api/user-scenarios/{id}` | Remove from history |

### Ask Meridian (AI)
| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/chat` | Conversational Q&A about the portfolio |
| `POST` | `/api/analyze` | Structured analysis prompt |

### Health
| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | `{ok: true, service: "folio"}` |

---

## Reasoning & Rebalancing Engine

Located under `backend/reasoning/`:

- **`planner.py`** — converts portfolio state + market context into Clingo ground facts and runs `rules.lp`. Falls back to a pure-Python implementation if `clingo` isn't installed.
- **`rules.lp`** — Answer Set Programming rules encoding rebalance policy (drift thresholds, risk profile constraints, prefer-sell logic).
- **`rebalancer.py`** — generates concrete trade plans across allocation buckets, supports goal-based nudges and weighted-average cost tracking.

### Allocation Buckets

`us_equity_broad`, `us_equity_growth`, `us_equity_value`, `dividend`, `international`, `bonds_medium`, `bonds_short`, `bonds_long`, `bonds_tips`, `bonds_corporate`, `defensive`, `real_estate`, `commodities`, `financials`, `cash`

### Risk Profile Mapping
- `conservative` → bonds-heavy, low beta target
- `moderate` → balanced 60/40-ish
- `aggressive` → growth-tilted, higher beta tolerance

---

## Data & Storage

All data is JSON files on disk, isolated per user via SHA-256 email keys:

```
backend/data/
├── users.json                    # email → {password_hash, display_name, investor_profile}
├── portfolios/
│   └── <email_key>.json          # one file per user
└── input/                        # sample PDF statements for testing

backend/scenarios/
└── <email_key>.json              # last 50 scenario runs per user
```

A demo portfolio is auto-seeded on first login.

---

## Security

- **PBKDF2-SHA256** password hashing — 200,000 iterations, per-user salt
- **Constant-time** password comparison via `secrets.compare_digest`
- **Random session tokens** (`secrets.token_urlsafe(32)`), 7-day TTL
- **Per-user data isolation** — every endpoint resolves data via the authenticated email
- **Input validation** on auth endpoints (email regex, length checks)
- **No client-side secret storage** — tokens stored in HTTP-only cookies / memory

⚠️ **Note:** `.env.example` in this repo contains placeholder demo keys checked in for hackathon convenience. Rotate them before any production use.

---

## Project Structure

```
goldmansachs-hackathon/
├── backend/
│   ├── server.py                 # HTTP API (1800+ lines, stdlib only)
│   ├── data/
│   │   ├── input/                # sample PDF statements
│   │   ├── etf_cache.json
│   │   ├── etf_universe.py
│   │   └── portfolio.json        # legacy single-portfolio file
│   ├── reasoning/
│   │   ├── planner.py            # ASP / fallback rebalance planner
│   │   ├── rebalancer.py         # bucket-level trade generation
│   │   └── rules.lp              # Clingo rules
│   └── scenarios/                # per-user scenario history
├── twintrack/                    # React + Vite frontend (legacy folder name)
│   ├── src/
│   │   ├── App.jsx               # auth gate + onboarding routing
│   │   ├── TwinTrack.jsx         # main shell / sidebar / screen router (renders as Meridian)
│   │   ├── Dashboard.jsx         # landing dashboard
│   │   ├── api.js                # API client + auth handling
│   │   ├── theme.js              # design tokens + portfolio enrichment helpers
│   │   ├── components/
│   │   │   ├── InfoTip.jsx
│   │   │   └── MeridianBrandMark.jsx
│   │   └── screens/
│   │       ├── LoginScreen.jsx
│   │       ├── OnboardingScreen.jsx
│   │       ├── PortfolioScreen.jsx       # "My Holdings"
│   │       ├── RiskScreen.jsx            # "Risk Check"
│   │       ├── RebalanceScreen.jsx       # "Rebalance"
│   │       ├── AskFolioScreen.jsx        # "Ask Meridian" (legacy filename)
│   │       ├── ScenariosHistoryScreen.jsx
│   │       ├── ScenarioScreen.jsx
│   │       └── PrintStatement.jsx
│   ├── index.html                # <title>Meridian — Your Financial North Star</title>
│   ├── package.json              # name still "wineflow-app" (legacy)
│   └── vite.config.js
├── .env.example
├── requirements.txt
└── README.md
```

---

## Development Notes

### Frontend
- Functional components with hooks; no Redux — local state + API client (`src/api.js`)
- All styling via inline JS objects + `theme.js` design tokens
- Charts rendered with **Recharts** + custom canvas pie

### Backend
- Pure stdlib HTTP server — no Flask, no FastAPI, no SQL
- Threaded request handling via `ThreadingHTTPServer`
- Parallel price/beta fetches via `ThreadPoolExecutor`
- Optional `clingo` dependency — server gracefully falls back if missing

### Testing
Sample PDFs in `backend/data/input/` for testing the import flow:
- `brokerage_account_statement.pdf`
- `portfolio_holdings_export.pdf`
- `test_statement.pdf`
- `generate_test_statement.py` — script to regenerate test fixtures

### Contributing
1. Fork the repo
2. Create a feature branch
3. Run both servers locally and test end-to-end
4. Open a pull request

---

## License

For educational and demonstration purposes (Goldman Sachs Hackathon).
