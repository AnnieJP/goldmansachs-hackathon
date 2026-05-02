import { useState, useEffect } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, ACCENT, ACCENT_DIM,
         SURFACE, BG, TEXT, TEXT_DIM, fmt$ } from "../theme.js";
import { apiFetch } from "../api.js";

/* ─── Drift bar ─────────────────────────────────────────────────── */
function DriftBar({ current, target, symbol }) {
  const max   = Math.max(current, target, 1);
  const over  = current > target;
  const drift = Math.abs(current - target).toFixed(1);
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TEXT_DIM, marginBottom: 5 }}>
        <span style={{ fontWeight: 700, color: TEXT }}>{symbol}</span>
        <span>{over ? `+${drift}% over target` : `-${drift}% under target`}</span>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 5, background: ACCENT_DIM, overflow: "visible" }}>
        {/* Target marker */}
        <div style={{ position: "absolute", left: `${(target / max) * 100}%`, top: -4, width: 2,
                      height: 18, background: TEXT_DIM, borderRadius: 1, zIndex: 2 }} />
        {/* Current bar */}
        <div style={{ position: "absolute", left: 0, height: "100%", borderRadius: 5,
                      width: `${(current / max) * 100}%`,
                      background: over ? "#f97316" : "#2A6496", transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginTop: 4 }}>
        <span style={{ color: TEXT_DIM }}>Current: <b style={{ color: TEXT }}>{current.toFixed(1)}%</b></span>
        <span style={{ color: TEXT_DIM }}>Target: <b style={{ color: TEXT }}>{target.toFixed(1)}%</b></span>
      </div>
    </div>
  );
}

/* ─── Trade suggestion card ─────────────────────────────────────── */
function SuggestionCard({ s, index }) {
  const isSell = s.action === "sell";
  return (
    <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 12,
                  padding: "18px 20px", marginBottom: 12, display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
                    background: isSell ? "#f9731618" : "#22c55e18",
                    border: `1px solid ${isSell ? "#f9731640" : "#22c55e40"}`,
                    color: isSell ? "#fb923c" : "#34d399" }}>
        {isSell ? "↓" : "↑"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>{s.symbol}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isSell ? "#fb923c" : "#34d399",
                         textTransform: "uppercase" }}>{s.action}</span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>~{fmt$(s.trade_value)}</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{s.plain_action}</div>
        <div style={{ fontSize: 12.5, color: TEXT_DIM, lineHeight: 1.5 }}>{s.reason}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 12 }}>
          <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
            Current: <b style={{ color: TEXT }}>{s.current_pct}%</b>
          </span>
          <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
            Target: <b style={{ color: TEXT }}>{s.target_pct}%</b>
          </span>
          <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
            Price: <b style={{ color: TEXT }}>{fmt$(s.current_price)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main screen ───────────────────────────────────────────────── */
export default function RebalanceScreen({ portfolio, prices }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!portfolio || !prices) return;
    setLoading(true);
    apiFetch("/api/rebalance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio, prices }),
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [portfolio, prices]);

  if (loading) return <Center>Checking your allocation…</Center>;
  if (error)   return <Center>Failed to load rebalancing data</Center>;
  if (!data)   return null;

  const allGood = !data.needs_rebalancing;

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: TEXT, maxWidth: 860 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>Rebalance</h1>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: TEXT_DIM }}>
        Keep your portfolio aligned with what you actually want to own.
      </p>

      {/* Status banner */}
      <div style={{ padding: "16px 20px", borderRadius: 12, marginBottom: 28,
                    background: allGood ? "#22c55e14" : "#f9731614",
                    border: `1px solid ${allGood ? "#22c55e30" : "#f9731630"}`,
                    display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 26 }}>{allGood ? "✅" : "⚠️"}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: allGood ? "#4ade80" : "#fdba74" }}>
            {allGood ? "Your portfolio is well balanced" : `${data.suggestion_count} holding${data.suggestion_count !== 1 ? "s" : ""} need${data.suggestion_count === 1 ? "s" : ""} attention`}
          </div>
          <div style={{ fontSize: 12.5, color: TEXT_DIM, marginTop: 3 }}>
            {allGood
              ? "All holdings are within 3% of their targets — nothing to do right now."
              : `Total drift from your target allocation: ${data.total_drift}%. Here's what to adjust.`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}>
        {/* Allocation snapshot */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>
            Current vs target allocation
          </div>
          <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 12, padding: "20px 20px" }}>
            {data.allocation_snapshot.map((s) => (
              <div key={s.symbol} style={{ marginBottom: 20 }}>
                <DriftBar current={s.current_pct} target={s.target_pct} symbol={s.symbol} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 20, marginTop: 8, fontSize: 11.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 24, height: 6, borderRadius: 3, background: ACCENT }} />
                <span style={{ color: TEXT_DIM }}>Current</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 2, height: 14, background: TEXT_DIM }} />
                <span style={{ color: TEXT_DIM }}>Your target</span>
              </div>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div>
          {allGood ? (
            <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 12, padding: "24px 22px",
                          textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 8 }}>All on track</div>
              <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.6 }}>
                Every holding is close to your target. Check back after the next big market move,
                or whenever you make a new purchase.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>
                What to do
              </div>
              {data.suggestions.map((s, i) => (
                <SuggestionCard key={s.symbol} s={s} index={i} />
              ))}
              <div style={{ marginTop: 8, padding: "14px 16px", borderRadius: 10, fontSize: 12.5,
                            background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`, color: TEXT_DIM,
                            lineHeight: 1.6 }}>
                💡 These are suggestions, not advice. Share with your financial adviser before trading.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explainer */}
      <div style={{ marginTop: 28, padding: "18px 20px", borderRadius: 12,
                    background: SURFACE, border: `1px solid ${ACCENT_DIM}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_DIM, marginBottom: 8,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>What is rebalancing?</div>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM, lineHeight: 1.7 }}>
          Over time, some investments grow faster than others, so your portfolio drifts away from your original plan.
          Rebalancing means selling a little of what grew and buying more of what shrank —
          so you're always invested the way you intended.
        </p>
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: TEXT_DIM, fontSize: 14,
                  fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>{children}</div>
  );
}
