import { useState, useEffect, useRef, useMemo } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, ACCENT, ACCENT_SOFT, ACCENT_DIM,
         SURFACE, BG, TEXT, TEXT_DIM, fmt$, fmtPct, enrichPortfolio } from "./theme.js";
import PortfolioScreen  from "./screens/PortfolioScreen.jsx";
import RiskScreen       from "./screens/RiskScreen.jsx";
import RebalanceScreen  from "./screens/RebalanceScreen.jsx";
import ScenarioScreen   from "./screens/ScenarioScreen.jsx";
import { apiFetch }     from "./api.js";

/* ─── Hero canvas (hub background) ─────────────────────────────── */
function HeroCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.width, H = () => canvas.height;
    const N_SAT = 9;
    let t = 0;
    const sats = Array.from({ length: N_SAT }, (_, i) => ({
      angle: (i / N_SAT) * Math.PI * 2,
      r: 0.28 + Math.random() * 0.08,
      speed: (0.0003 + Math.random() * 0.0004) * (Math.random() < 0.5 ? 1 : -1),
      size: 3 + Math.random() * 4,
    }));
    const sparks = Array.from({ length: 55 }, () => ({
      x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003, life: Math.random(), decay: 0.004 + Math.random() * 0.006,
    }));
    const pulses = Array.from({ length: N_SAT }, (_, i) => ({ sat: i, progress: Math.random(), speed: 0.003 + Math.random() * 0.003 }));

    const draw = () => {
      const w = W(), h = H(), cx = w / 2, cy = h / 2;
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const baseR = Math.min(w, h) * 0.32;

      sats.forEach((s) => { s.angle += s.speed; });

      sats.forEach((s) => {
        const sx = cx + Math.cos(s.angle) * baseR * s.r * 3.3;
        const sy = cy + Math.sin(s.angle) * baseR * s.r * 3.3;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx, sy);
        ctx.strokeStyle = "rgba(42,100,150,0.12)"; ctx.lineWidth = 0.7; ctx.stroke();
      });

      pulses.forEach((p) => {
        p.progress += p.speed;
        if (p.progress > 1) p.progress = 0;
        const s = sats[p.sat];
        const sx = cx + Math.cos(s.angle) * baseR * s.r * 3.3;
        const sy = cy + Math.sin(s.angle) * baseR * s.r * 3.3;
        const px = cx + (sx - cx) * p.progress, py = cy + (sy - cy) * p.progress;
        const a = Math.sin(p.progress * Math.PI) * 0.7;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 6);
        g.addColorStop(0, `rgba(201,162,39,${a})`); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      });

      const pulse = 1 + 0.12 * Math.sin(t * 2.5);
      [baseR * 2.1 * pulse, baseR * 1.5 * pulse, baseR * 0.9 * pulse].forEach((r, i) => {
        const alpha = [0.04, 0.07, 0.12][i];
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(201,162,39,${alpha * pulse})`); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      });
      ctx.beginPath(); ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 4 * pulse, 0, Math.PI * 2); ctx.fillStyle = "#fff8"; ctx.fill();

      sats.forEach((s) => {
        const sx = cx + Math.cos(s.angle) * baseR * s.r * 3.3;
        const sy = cy + Math.sin(s.angle) * baseR * s.r * 3.3;
        ctx.beginPath(); ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT; ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, s.size * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT_SOFT; ctx.fill();
      });

      sparks.forEach((s) => {
        s.x += s.vx; s.y += s.vy; s.life -= s.decay;
        if (s.life <= 0) { s.x = Math.random(); s.y = Math.random(); s.life = 0.6 + Math.random() * 0.4; }
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201,162,39,${s.life * 0.5})`; ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

/* ─── Sidebar ───────────────────────────────────────────────────── */
const NAV = [
  { id: "hub",       icon: "◈", label: "Overview"       },
  { id: "portfolio", icon: "◉", label: "My Holdings"    },
  { id: "risk",      icon: "◎", label: "Risk Check"     },
  { id: "rebalance", icon: "⊞", label: "Rebalance"      },
  { id: "scenario",  icon: "◇", label: "What-If"        },
];

function Sidebar({ screen, setScreen, enriched, pricesLoading, onRefresh, currentUser, onLogout }) {
  const gain  = enriched?.gainLoss ?? 0;
  const total = enriched?.totalValue ?? 0;
  return (
    <aside style={{ width: 220, flexShrink: 0, background: SURFACE, borderRight: `1px solid ${ACCENT_DIM}`,
                    display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0 }}>
      <div style={{ padding: "24px 20px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: GOLD,
                      textTransform: "uppercase", marginBottom: 4 }}>Folio</div>
        <div style={{ fontSize: 11, color: TEXT_DIM }}>Your wealth, made clear.</div>
      </div>

      {enriched && (
        <div style={{ margin: "0 14px 4px", padding: "14px 14px", borderRadius: 10,
                      background: GOLD_BG, border: `1px solid ${GOLD_BORDER}` }}>
          <div style={{ fontSize: 10.5, color: TEXT_DIM, marginBottom: 4 }}>Total value</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: TEXT }}>{fmt$(total)}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: gain >= 0 ? "#34d399" : "#f87171", marginTop: 3 }}>
            {gain >= 0 ? "▲" : "▼"} {fmt$(Math.abs(gain))} ({fmtPct(enriched.gainLossPct)})
          </div>
        </div>
      )}

      <nav style={{ padding: "10px 10px", flex: 1 }}>
        {NAV.map((n) => {
          const active = screen === n.id;
          return (
            <button key={n.id} onClick={() => setScreen(n.id)} type="button" style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px",
              borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2, textAlign: "left",
              background: active ? GOLD_BG : "transparent",
              color: active ? GOLD : TEXT_DIM,
              fontWeight: active ? 700 : 400, fontSize: 13.5,
            }}>
              <span style={{ fontSize: 14, opacity: active ? 1 : 0.55 }}>{n.icon}</span>
              {n.label}
              {active && <span style={{ marginLeft: "auto", width: 4, height: 4, borderRadius: "50%", background: GOLD }} />}
            </button>
          );
        })}
      </nav>

      <button onClick={onRefresh} disabled={pricesLoading} type="button" style={{
        margin: "0 14px 10px", padding: "9px 0", borderRadius: 8,
        border: `1px solid ${ACCENT_DIM}`, background: "transparent", cursor: "pointer",
        color: TEXT_DIM, fontSize: 11.5, fontFamily: "inherit",
      }}>
        {pricesLoading ? "Refreshing…" : "⟳  Refresh prices"}
      </button>

      {currentUser && (
        <div style={{
          margin: "0 14px 16px", padding: "10px 12px", borderRadius: 8,
          border: `1px solid ${ACCENT_DIM}`, background: "rgba(13,31,60,0.6)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: GOLD_BG,
            border: `1px solid ${GOLD_BORDER}`, color: GOLD,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 12, flexShrink: 0,
          }}>
            {(currentUser.displayName || currentUser.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, lineHeight: 1.2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser.displayName || currentUser.email}
            </div>
            <button onClick={onLogout} type="button" style={{
              background: "none", border: "none", padding: 0, marginTop: 2,
              color: TEXT_DIM, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit",
            }}>
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
  const total   = enriched?.totalValue ?? 0;
  const gain    = enriched?.gainLoss   ?? 0;
  const gainPct = enriched?.gainLossPct ?? 0;

  const cards = [
    { id: "portfolio", icon: "📊", title: "My Holdings",  desc: "See everything you own at a glance, with live prices." },
    { id: "risk",      icon: "🛡️", title: "Risk Check",   desc: "Find out how risky your portfolio is in plain English." },
    { id: "rebalance", icon: "⚖️", title: "Rebalance",    desc: "Get told exactly what to buy or sell to stay on track." },
    { id: "scenario",  icon: "🔮", title: "What-If",      desc: "See what happens to your money in a market crash, boom, or more." },
  ];

  return (
    <div style={{ position: "relative", flex: 1, minHeight: "100vh", display: "flex",
                  alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <HeroCanvas />

      {currentUser && (
        <div style={{
          position: "absolute", top: 20, right: 24, zIndex: 3,
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 12px 6px 8px", borderRadius: 99,
          background: "rgba(13,31,60,0.75)", backdropFilter: "blur(12px)",
          border: `1px solid ${ACCENT_DIM}`,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%", background: GOLD_BG,
            border: `1px solid ${GOLD_BORDER}`, color: GOLD,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 11,
          }}>
            {(currentUser.displayName || currentUser.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <span style={{ fontSize: 12, color: TEXT, fontWeight: 600 }}>
            {currentUser.displayName || currentUser.email}
          </span>
          <span style={{ width: 1, height: 14, background: ACCENT_DIM }} />
          <button onClick={onLogout} type="button" style={{
            background: "none", border: "none", padding: 0,
            color: TEXT_DIM, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
          }}>
            Sign out
          </button>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 32px",
                    maxWidth: 620, width: "100%" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 16px",
                      borderRadius: 99, background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`,
                      marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em",
                         textTransform: "uppercase", color: GOLD }}>Folio</span>
        </div>

        {enriched ? (
          <>
            <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 6 }}>Your portfolio is worth</div>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.05em", color: TEXT,
                          lineHeight: 1, marginBottom: 10 }}>{fmt$(total)}</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 32,
                          color: gain >= 0 ? "#34d399" : "#f87171" }}>
              {gain >= 0 ? "▲" : "▼"} {fmt$(Math.abs(gain))} total ({fmtPct(gainPct)}) since you bought in
            </div>
          </>
        ) : (
          <div style={{ fontSize: 18, color: TEXT_DIM, marginBottom: 40 }}>Loading your portfolio…</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 520, margin: "0 auto" }}>
          {cards.map((c) => (
            <button key={c.id} type="button" onClick={() => setScreen(c.id)} style={{
              padding: "18px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
              background: "rgba(13,31,60,0.75)", backdropFilter: "blur(12px)",
              border: `1px solid ${ACCENT_DIM}`, transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = GOLD_BORDER}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = ACCENT_DIM}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 11.5, color: TEXT_DIM, lineHeight: 1.5 }}>{c.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────── */
export default function TwinTrack({ currentUser, onLogout }) {
  const [screen,        setScreen]        = useState("hub");
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
                  justifyContent: "center", color: TEXT_DIM, fontSize: 15 }}>
      Loading your portfolio…
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center",
                  justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "#f87171", fontSize: 15 }}>Could not connect to backend</div>
      <div style={{ color: TEXT_DIM, fontSize: 12 }}>{error}</div>
      <button onClick={init} style={{ marginTop: 8, padding: "8px 20px", borderRadius: 8,
        background: GOLD, color: BG, border: "none", cursor: "pointer", fontWeight: 700 }}>Retry</button>
    </div>
  );

  if (screen === "hub") return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG }}>
      <HubScreen enriched={enriched} setScreen={setScreen} currentUser={currentUser} onLogout={onLogout} />
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <Sidebar screen={screen} setScreen={setScreen} enriched={enriched}
               pricesLoading={pricesLoading} onRefresh={() => loadPrices()}
               currentUser={currentUser} onLogout={onLogout} />
      <main style={{ flex: 1, overflowY: "auto", minHeight: "100vh" }}>
        {screen === "portfolio" && (
          <PortfolioScreen portfolio={portfolio} prices={prices} enriched={enriched}
                           onPortfolioChange={refreshPortfolio} />
        )}
        {screen === "risk" && (
          <RiskScreen portfolio={portfolio} prices={prices} />
        )}
        {screen === "rebalance" && (
          <RebalanceScreen portfolio={portfolio} prices={prices} />
        )}
        {screen === "scenario" && (
          <ScenarioScreen portfolio={portfolio} prices={prices} />
        )}
      </main>
    </div>
  );
}

