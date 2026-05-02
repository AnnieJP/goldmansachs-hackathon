import { useState } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, BG, TEXT, TEXT_DIM,
         GREEN, RED, RED_BG, RED_BORDER,
         FONT_SERIF, fmt$, fmtPct } from "../theme.js";
import { apiFetch } from "../api.js";
import InfoTip from "../components/InfoTip.jsx";
import { TrendingUp, TrendingDown, Sparkles, ChevronRight } from "lucide-react";

const SCENARIOS = [
  { id: "market_crash",   label: "Market Crash",   icon: "💥", desc: "Markets fall 20%",      color: "#EF4444" },
  { id: "high_inflation", label: "High Inflation",  icon: "📈", desc: "Inflation hits 6%+",    color: "#F97316" },
  { id: "need_cash",      label: "Need Cash",       icon: "💸", desc: "Liquidate in 3 months", color: "#F59E0B" },
  { id: "bull_run",       label: "Bull Run",        icon: "🚀", desc: "Markets surge 30%",     color: "#10B981" },
  { id: "rate_hike",      label: "Rate Hike",       icon: "🏦", desc: "Fed raises rates 2%",   color: "#6366F1" },
  { id: "recession",      label: "Recession",       icon: "📉", desc: "GDP contracts 2 qtrs",  color: "#EC4899" },
];

export default function ScenarioScreen({ portfolio, prices }) {
  const [selected, setSelected] = useState(null);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const runScenario = async (id) => {
    setSelected(id); setLoading(true); setError(null); setData(null);
    try {
      const res = await apiFetch("/api/scenario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: id, portfolio, prices }),
      }).then((r) => r.json());
      setData(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const sc = SCENARIOS.find((s) => s.id === selected);

  return (
    <div style={{ padding: "32px 36px", color: TEXT, maxWidth: 920 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>
        What-If Simulator
        <InfoTip title="What-If Simulator">
          Apply a historical-style market shock to your portfolio and see where
          it would land. Each scenario uses realistic shock sizes (e.g. a 2008-style
          crash = stocks -22%, bonds +4%) applied to the current value of every
          holding based on its asset type.
        </InfoTip>
      </h1>
      <p style={{ margin: "0 0 26px", fontSize: 13, color: TEXT_DIM }}>
        Pick a scenario and see exactly how your portfolio would react.
      </p>

      {/* Scenario card deck */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {SCENARIOS.map((s) => {
          const active = selected === s.id;
          return (
            <button key={s.id} onClick={() => runScenario(s.id)} type="button" style={{
              padding: "20px 18px", borderRadius: 14, textAlign: "left", cursor: "pointer",
              background: active ? s.color + "12" : SURFACE,
              border: `1px solid ${active ? s.color + "50" : BORDER}`,
              boxShadow: active ? `0 0 0 1px ${s.color}30` : "none",
              transition: "all 0.2s",
              display: "flex", flexDirection: "column", gap: 10,
            }}
            onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = s.color + "30"; e.currentTarget.style.background = s.color + "08"; } }}
            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = SURFACE; } }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 28 }}>{s.icon}</span>
                {active && loading && <span style={{ fontSize: 11, color: s.color }}>Running…</span>}
                {active && !loading && data && <ChevronRight size={14} color={s.color} />}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: active ? s.color : TEXT, marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: TEXT_DIM }}>{s.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: "13px 16px", borderRadius: 11, background: RED_BG, border: `1px solid ${RED_BORDER}`,
                      color: "#FC8181", fontSize: 13, marginBottom: 20 }}>{error}</div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: TEXT_DIM, fontSize: 14 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>{sc?.icon}</div>
          Simulating {sc?.label}…
        </div>
      )}

      {data && !loading && sc && (
        <>
          {/* Summary row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Portfolio now",   value: fmt$(data.current_value),   sub: null,
                tip: "Your portfolio's current market value before applying the scenario shock." },
              { label: "Projected value", value: fmt$(data.projected_value),
                sub: `${fmt$(data.projected_value - data.current_value)} (${fmtPct(data.impact_pct)})`,
                pos: data.projected_value >= data.current_value,
                tip: "What your portfolio would be worth if this scenario played out. Calculated by applying the scenario's shock to each holding based on its asset type." },
              { label: "Max drawdown",    value: data.max_drawdown,          sub: null,
                tip: "Worst-case peak-to-trough loss during the scenario. Useful for gauging how painful the worst moment could feel before any recovery." },
            ].map(({ label, value, sub, pos, tip }) => (
              <div key={label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14,
                                         padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
                <div style={{ fontSize: 11.5, color: TEXT_DIM, marginBottom: 8, letterSpacing: "0.03em" }}>
                  {label}
                  {tip && <InfoTip title={label} text={tip} />}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: TEXT }}>{value}</div>
                {sub && (
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 5,
                                color: pos ? GREEN : RED, display: "flex", alignItems: "center", gap: 4 }}>
                    {pos ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {sub}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* AI explanation */}
          {data.explanation && (
            <div style={{ marginBottom: 20, padding: "20px 22px", borderRadius: 16,
                          background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04))",
                          border: `1px solid ${GOLD_BORDER}`,
                          boxShadow: "0 2px 16px rgba(245,158,11,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Sparkles size={14} color={GOLD} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  What this means for you
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.75 }}>{data.explanation}</p>
            </div>
          )}

          {/* Per-holding impact table */}
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>
                Impact per holding
                <InfoTip title="Impact per holding">
                  How much each individual position would gain or lose under this
                  scenario. Shocks are applied by asset type (stocks, ETFs, bonds,
                  funds) so a bond fund behaves differently from a tech stock.
                </InfoTip>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Holding", "Current Value", "Projected Value", "Impact ($)", "Impact (%)"].map((h) => (
                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11,
                                          fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase",
                                          letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.holdings_impact.map((h) => {
                  const delta = h.projected_value - h.current_value;
                  const pos   = delta >= 0;
                  return (
                    <tr key={h.symbol} style={{ borderTop: `1px solid ${BORDER}`, transition: "background 0.12s" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "12px 18px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.symbol}</div>
                        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>{h.name}</div>
                      </td>
                      <td style={{ padding: "12px 18px", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.current_value)}</td>
                      <td style={{ padding: "12px 18px", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.projected_value)}</td>
                      <td style={{ padding: "12px 18px", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                                   color: pos ? GREEN : RED }}>
                        {pos ? "+" : ""}{fmt$(delta)}
                      </td>
                      <td style={{ padding: "12px 18px", fontSize: 13, fontVariantNumeric: "tabular-nums",
                                   color: pos ? GREEN : RED }}>
                        {fmtPct(h.impact_pct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!selected && (
        <div style={{ padding: "56px 0", textAlign: "center", color: TEXT_DIM, fontSize: 13 }}>
          Select a scenario above to see how your portfolio would react.
        </div>
      )}
    </div>
  );
}
