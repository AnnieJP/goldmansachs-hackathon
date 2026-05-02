import { useState, useEffect } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, ACCENT, ACCENT_DIM,
         SURFACE, BG, TEXT, TEXT_DIM, fmt$, fmtPct } from "../theme.js";
import { apiFetch } from "../api.js";

const SCENARIOS = [
  { id: "market_crash",  icon: "📉", label: "Market Crash",         desc: "Sudden sharp drop — like 2008 or early 2020" },
  { id: "recession",     icon: "🌧️", label: "Prolonged Recession",  desc: "Slow downturn lasting 12–18 months" },
  { id: "tech_selloff",  icon: "💻", label: "Tech Selloff",         desc: "Tech stocks crash while other sectors hold" },
  { id: "rate_hike",     icon: "🏦", label: "Rate Hike",            desc: "Central bank raises interest rates sharply" },
  { id: "bull_market",   icon: "🚀", label: "Bull Market Boom",     desc: "Strong growth — markets hit new highs" },
];

/* ─── Impact row ────────────────────────────────────────────────── */
function ImpactRow({ h }) {
  const isPos = h.change >= 0;
  return (
    <tr style={{ borderTop: `1px solid ${ACCENT_DIM}` }}>
      <td style={{ padding: "11px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.symbol}</div>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>{h.name}</div>
      </td>
      <td style={{ padding: "11px 16px", fontSize: 13 }}>{fmt$(h.original_value)}</td>
      <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600 }}>{fmt$(h.simulated_value)}</td>
      <td style={{ padding: "11px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isPos ? "#34d399" : "#f87171" }}>
          {isPos ? "+" : ""}{fmt$(h.change)}
        </div>
        <div style={{ fontSize: 11, color: isPos ? "#34d399" : "#f87171" }}>
          {fmtPct(h.change_pct)}
        </div>
      </td>
      <td style={{ padding: "11px 16px" }}>
        <div style={{ height: 6, borderRadius: 3, background: ACCENT_DIM, width: 80, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 3,
            width: `${Math.min(100, Math.abs(h.change_pct))}%`,
            background: isPos ? "#34d399" : "#f87171",
          }} />
        </div>
      </td>
    </tr>
  );
}

/* ─── Main screen ───────────────────────────────────────────────── */
export default function ScenarioScreen({ portfolio, prices }) {
  const [selected, setSelected] = useState("market_crash");
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!portfolio || !prices) return;
    setLoading(true);
    setError(null);
    apiFetch("/api/scenario", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio, prices, scenario_id: selected }),
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [selected, portfolio, prices]);

  const isPos = (data?.change || 0) >= 0;

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: TEXT, maxWidth: 860 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>What-If Simulator</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: TEXT_DIM }}>
        Pick a market event below to see how it would affect your portfolio today.
      </p>

      {/* Scenario selector */}
      <div style={{ display: "flex", gap: 10, marginBottom: 32, flexWrap: "wrap" }}>
        {SCENARIOS.map((s) => (
          <button key={s.id} onClick={() => setSelected(s.id)} type="button" style={{
            flex: "1 1 140px", padding: "14px 14px", borderRadius: 11, textAlign: "left", cursor: "pointer",
            border: `1px solid ${selected === s.id ? GOLD : ACCENT_DIM}`,
            background: selected === s.id ? GOLD_BG : SURFACE,
            transition: "border-color 0.15s, background 0.15s",
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: selected === s.id ? GOLD : TEXT,
                          marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.4 }}>{s.desc}</div>
          </button>
        ))}
      </div>

      {loading && <Center>Running the simulation…</Center>}
      {error   && <Center>Could not run simulation</Center>}

      {data && !loading && (
        <>
          {/* Impact summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
            <SummaryCard
              label="Your portfolio today"
              value={fmt$(data.original_value)}
              sub="Before this event"
            />
            <SummaryCard
              label="Your portfolio after"
              value={fmt$(data.simulated_value)}
              sub={`If "${data.scenario_name}" happened`}
              highlight
              isPos={isPos}
            />
            <SummaryCard
              label="Estimated impact"
              value={`${isPos ? "+" : ""}${fmt$(data.change)}`}
              sub={`${fmtPct(data.change_pct)} change`}
              isPos={isPos}
              colored
            />
          </div>

          {/* Advice */}
          {data.advice && (
            <div style={{ padding: "16px 20px", borderRadius: 12, marginBottom: 24,
                          background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`,
                          display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.6 }}>{data.advice}</div>
            </div>
          )}

          {/* Per-holding impact table */}
          <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`,
                        borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${ACCENT_DIM}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Impact per holding</div>
              <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 2 }}>
                How each position would be affected under this scenario
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Holding", "Current value", "Simulated value", "Change", "Magnitude"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11,
                                          fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase",
                                          letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.holdings_impact].sort((a, b) => a.change - b.change).map((h) => (
                  <ImpactRow key={h.symbol} h={h} />
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 18, fontSize: 11.5, color: TEXT_DIM, lineHeight: 1.6 }}>
            ⚠️ These numbers are estimates based on historical patterns for each asset type.
            Real markets are unpredictable. This tool is for education only — not financial advice.
          </div>
        </>
      )}
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: TEXT_DIM, fontSize: 14 }}>{children}</div>
  );
}

function SummaryCard({ label, value, sub, highlight, isPos, colored }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${highlight ? GOLD : ACCENT_DIM}`,
                  borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8, textTransform: "uppercase",
                    letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em",
                    color: colored ? (isPos ? "#34d399" : "#f87171") : TEXT }}>{value}</div>
      <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6 }}>{sub}</div>
    </div>
  );
}
