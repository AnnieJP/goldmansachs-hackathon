import { useState, useEffect, useRef, useMemo } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, SURFACE_2, BG, TEXT, TEXT_DIM,
         GREEN, RED, FONT_SERIF, fmt$, fmtPct, enrichPortfolio } from "./theme.js";
import PortfolioScreen  from "./screens/PortfolioScreen.jsx";
import RiskScreen       from "./screens/RiskScreen.jsx";
import RebalanceScreen  from "./screens/RebalanceScreen.jsx";
import { apiFetch }     from "./api.js";
import { BarChart3, ShieldCheck, ArrowUpDown,
         RefreshCw, LogOut, TrendingUp, TrendingDown, MessageSquare, History } from "lucide-react";
import AskFolioScreen         from "./screens/AskFolioScreen.jsx";
import ScenariosHistoryScreen from "./screens/ScenariosHistoryScreen.jsx";

/* ─── Ambient background canvas ────────────────────────────────── */
function AmbientCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    let t = 0;
    const orbs = [
      { x: 0.15, y: 0.3, r: 0.35, color: "245,158,11", speed: 0.0004 },
      { x: 0.85, y: 0.7, r: 0.30, color: "16,185,129", speed: 0.0003 },
      { x: 0.5,  y: 0.1, r: 0.25, color: "99,102,241", speed: 0.0005 },
    ];
    const draw = () => {
      t += 0.016;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      orbs.forEach((o) => {
        const ox = o.x + Math.sin(t * o.speed * 1000) * 0.06;
        const oy = o.y + Math.cos(t * o.speed * 800) * 0.04;
        const g = ctx.createRadialGradient(ox * w, oy * h, 0, ox * w, oy * h, o.r * Math.min(w, h));
        g.addColorStop(0, `rgba(${o.color},0.08)`);
        g.addColorStop(1, `rgba(${o.color},0)`);
        ctx.beginPath();
        ctx.arc(ox * w, oy * h, o.r * Math.min(w, h), 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

/* ─── Sidebar nav config ────────────────────────────────────────── */
const NAV = [
  { id: "portfolio", Icon: BarChart3,     label: "My Holdings"  },
  { id: "risk",      Icon: ShieldCheck,   label: "Risk Check"   },
  { id: "rebalance", Icon: ArrowUpDown,   label: "Rebalance"    },
  { id: "askfolio",  Icon: MessageSquare, label: "Ask Folio"    },
  { id: "history",   Icon: History,       label: "My Scenarios" },
];

/* ─── Sidebar ───────────────────────────────────────────────────── */
function Sidebar({ screen, onNavigate, enriched, pricesLoading, onRefresh, currentUser, onLogout }) {
  const gain     = enriched?.gainLoss    ?? 0;
  const total    = enriched?.totalValue  ?? 0;
  const gainPct  = enriched?.gainLossPct ?? 0;
  const isPos    = gain >= 0;

  return (
    <aside style={{
      width: 248, flexShrink: 0,
      background: SURFACE,
      borderRight: `1px solid ${BORDER}`,
      display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0,
      boxShadow: "4px 0 24px rgba(0,0,0,0.2)",
    }}>
      {/* Logo */}
      <div style={{ padding: "28px 24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, background: GOLD_BG,
            border: `1px solid ${GOLD_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 16 }}>◈</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: TEXT, fontFamily: FONT_SERIF }}>Folio</div>
            <div style={{ fontSize: 10.5, color: TEXT_DIM, letterSpacing: "0.02em" }}>Portfolio Dashboard</div>
          </div>
        </div>
      </div>

      {/* Portfolio value card */}
      {enriched && (
        <div style={{
          margin: "0 16px 8px",
          padding: "16px",
          borderRadius: 12,
          background: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.06) 100%)",
          border: `1px solid ${GOLD_BORDER}`,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 500, color: TEXT_DIM, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Net Worth
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: TEXT, marginBottom: 6, fontFamily: FONT_SERIF }}>
            {fmt$(total)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {isPos
              ? <TrendingUp size={13} color={GREEN} />
              : <TrendingDown size={13} color={RED} />}
            <span style={{ fontSize: 12, fontWeight: 600, color: isPos ? GREEN : RED }}>
              {fmt$(Math.abs(gain))} ({fmtPct(gainPct)})
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ padding: "8px 12px", flex: 1 }}>
        {NAV.map(({ id, Icon, label }) => {
          const active = screen === id;
          return (
            <button key={id} onClick={() => onNavigate(id)} type="button" style={{
              display: "flex", alignItems: "center", gap: 11, width: "100%",
              padding: "10px 12px", borderRadius: 10, border: "none",
              cursor: "pointer", marginBottom: 2, textAlign: "left",
              background: active ? GOLD_BG : "transparent",
              color: active ? GOLD : TEXT_DIM,
              fontWeight: active ? 600 : 400, fontSize: 13.5,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              {active && <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: GOLD }} />}
            </button>
          );
        })}
      </nav>

      {/* Refresh */}
      <button onClick={onRefresh} disabled={pricesLoading} type="button" style={{
        margin: "0 16px 8px", padding: "9px 0", borderRadius: 9,
        border: `1px solid ${BORDER}`, background: "transparent", cursor: "pointer",
        color: TEXT_DIM, fontSize: 12, display: "flex", alignItems: "center",
        justifyContent: "center", gap: 7, transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = BORDER_MED; e.currentTarget.style.color = TEXT; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_DIM; }}>
        <RefreshCw size={13} style={{ animation: pricesLoading ? "spin 1s linear infinite" : "none" }} />
        {pricesLoading ? "Refreshing…" : "Refresh prices"}
      </button>

      {/* User */}
      {currentUser && (
        <div style={{
          margin: "0 16px 20px", padding: "12px 14px", borderRadius: 10,
          border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 13, color: BG, flexShrink: 0,
          }}>
            {(currentUser.displayName || currentUser.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, lineHeight: 1.3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser.displayName || currentUser.email}
            </div>
            <button onClick={onLogout} type="button" style={{
              background: "none", border: "none", padding: 0, marginTop: 2,
              color: TEXT_DIM, fontSize: 11, cursor: "pointer", display: "flex",
              alignItems: "center", gap: 4, transition: "color 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = RED}
            onMouseLeave={(e) => e.currentTarget.style.color = TEXT_DIM}>
              <LogOut size={11} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ─── Hub screen ────────────────────────────────────────────────── */
function HubScreen({ enriched, setScreen, currentUser, onLogout }) {
  const total   = enriched?.totalValue  ?? 0;
  const gain    = enriched?.gainLoss    ?? 0;
  const gainPct = enriched?.gainLossPct ?? 0;
  const isPos   = gain >= 0;

  const features = [
    { id: "portfolio", Icon: BarChart3,     title: "My Holdings",  desc: "Live prices, cost basis, gain & loss per position.", color: "#F59E0B" },
    { id: "risk",      Icon: ShieldCheck,   title: "Risk Check",   desc: "Beta analysis and plain-English risk rating.",        color: "#10B981" },
    { id: "rebalance", Icon: ArrowUpDown,   title: "Rebalance",    desc: "Drift from targets — exactly what to buy or sell.",  color: "#6366F1" },
    { id: "askfolio",  Icon: MessageSquare, title: "Ask Folio",    desc: "Describe a scenario and get a full rebalance plan.", color: "#0891B2" },
  ];

  return (
    <div style={{ position: "relative", flex: 1, minHeight: "100vh", display: "flex",
                  alignItems: "center", justifyContent: "center", overflow: "hidden", background: BG }}>
      <AmbientCanvas />

      {/* Top-right user pill */}
      {currentUser && (
        <div style={{
          position: "absolute", top: 24, right: 28, zIndex: 3,
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 14px 6px 8px", borderRadius: 99,
          background: "rgba(15,31,61,0.8)", backdropFilter: "blur(12px)",
          border: `1px solid ${BORDER}`,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 11, color: BG,
          }}>
            {(currentUser.displayName || currentUser.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <span style={{ fontSize: 12.5, color: TEXT, fontWeight: 500 }}>
            {currentUser.displayName || currentUser.email}
          </span>
          <span style={{ width: 1, height: 14, background: BORDER_MED }} />
          <button onClick={onLogout} type="button" style={{
            background: "none", border: "none", padding: 0, display: "flex",
            alignItems: "center", gap: 4, color: TEXT_DIM, fontSize: 11.5,
            cursor: "pointer",
          }}>
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      )}

      {/* Center content */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 32px", maxWidth: 680, width: "100%" }}>

        {/* Brand badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 18px",
          borderRadius: 99, background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`, marginBottom: 32,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD }}>
            Folio · Portfolio Dashboard
          </span>
        </div>

        {/* Value display */}
        {enriched ? (
          <>
            <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 8, letterSpacing: "0.04em" }}>
              Total Portfolio Value
            </div>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.03em", color: TEXT,
                          lineHeight: 1, marginBottom: 14, fontFamily: FONT_SERIF }}>
              {fmt$(total)}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "6px 14px", borderRadius: 99, marginBottom: 48,
                          background: isPos ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                          border: `1px solid ${isPos ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
              {isPos ? <TrendingUp size={15} color={GREEN} /> : <TrendingDown size={15} color={RED} />}
              <span style={{ fontSize: 13.5, fontWeight: 600, color: isPos ? GREEN : RED }}>
                {fmt$(Math.abs(gain))} ({fmtPct(gainPct)}) all-time
              </span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 16, color: TEXT_DIM, marginBottom: 48 }}>Loading your portfolio…</div>
        )}

        {/* Feature cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 560, margin: "0 auto" }}>
          {features.map(({ id, Icon, title, desc, color }) => (
            <button key={id} type="button" onClick={() => setScreen(id)} style={{
              padding: "20px 18px", borderRadius: 14, textAlign: "left", cursor: "pointer",
              background: "rgba(15,31,61,0.7)", backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
              transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
              e.currentTarget.style.borderColor = `${color}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, marginBottom: 12,
                background: `${color}18`, border: `1px solid ${color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={17} color={color} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 5 }}>{title}</div>
              <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.55 }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Page header ───────────────────────────────────────────────── */
function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ padding: "32px 36px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: TEXT }}>{title}</h1>
        {subtitle && <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 10 }}>{actions}</div>}
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────── */
export default function TwinTrack({ currentUser, onLogout }) {
  const [screen,        setScreen]        = useState("portfolio");
  const [screenData,    setScreenData]    = useState(null);
  const [portfolio,     setPortfolio]     = useState(null);
  const [prices,        setPrices]        = useState({});
  const [loading,       setLoading]       = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error,         setError]         = useState(null);

  const enriched = useMemo(() => enrichPortfolio(portfolio, prices), [portfolio, prices]);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const p = await apiFetch("/api/portfolio").then((r) => r.json());
      setPortfolio(p);
      await loadPrices(p);
    } catch (e) {
      setError(e.message || "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  };

  const loadPrices = async (p = portfolio) => {
    if (!p) return;
    setPricesLoading(true);
    try {
      const syms = (p.holdings || []).map((h) => h.symbol);
      const res  = await apiFetch("/api/prices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: syms }),
      }).then((r) => r.json());
      setPrices(res.prices || {});
    } catch {}
    finally { setPricesLoading(false); }
  };

  const refreshPortfolio = async () => {
    const p = await apiFetch("/api/portfolio").then((r) => r.json());
    setPortfolio(p);
    await loadPrices(p);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center",
                  justifyContent: "center", color: TEXT_DIM, fontSize: 14 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 28, height: 28, border: "2px solid",
          borderColor: TEXT_DIM, transform: "rotate(45deg)",
          margin: "0 auto 18px",
          animation: "diamondPulse 1.6s ease-in-out infinite",
        }} />
        Loading your portfolio…
      </div>
      <style>{`
        @keyframes diamondPulse {
          0%, 100% { border-color: rgba(148,163,184,0.15); box-shadow: none; }
          50%       { border-color: rgba(148,163,184,0.85); box-shadow: 0 0 10px rgba(148,163,184,0.25); }
        }
      `}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center",
                  justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ color: RED, fontSize: 14 }}>Could not connect to backend</div>
      <div style={{ color: TEXT_DIM, fontSize: 12 }}>{error}</div>
      <button onClick={init} style={{ marginTop: 8, padding: "9px 22px", borderRadius: 9,
        background: GOLD, color: BG, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
        Retry
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG }}>
      <Sidebar screen={screen} onNavigate={(id) => { setScreenData(null); setScreen(id); }}
               enriched={enriched} pricesLoading={pricesLoading} onRefresh={() => loadPrices()}
               currentUser={currentUser} onLogout={onLogout} />
      <main style={{ flex: 1, overflowY: "auto", minHeight: "100vh" }}>
        {screen === "portfolio" && (
          <PortfolioScreen portfolio={portfolio} prices={prices} enriched={enriched}
                           onPortfolioChange={refreshPortfolio} />
        )}
        {screen === "risk"      && <RiskScreen      portfolio={portfolio} prices={prices} />}
        {screen === "rebalance" && <RebalanceScreen portfolio={portfolio} prices={prices} />}
        {screen === "askfolio"  && <AskFolioScreen  portfolio={portfolio} prices={prices}
                                     initialResult={screenData}
                                     onNavigate={(id, data = null) => { setScreenData(data); setScreen(id); }} />}
        {screen === "history"   && <ScenariosHistoryScreen
                                     onNavigate={(id, data = null) => { setScreenData(data); setScreen(id); }} />}
      </main>
    </div>
  );
}
