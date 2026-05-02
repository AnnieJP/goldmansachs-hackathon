import { useState, useEffect } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, SURFACE_2, BG, TEXT, TEXT_SEC, TEXT_DIM,
         GREEN, GREEN_BG, GREEN_BORDER, RED, RED_BG, RED_BORDER,
         FONT_SERIF, fmt$, fmtPct } from "../theme.js";
import { apiFetch } from "../api.js";
import InfoTip from "../components/InfoTip.jsx";
import { ArrowUpDown, TrendingUp, TrendingDown, CheckCircle2, AlertCircle } from "lucide-react";

/* ─── Drift bar ─────────────────────────────────────────────────── */
function DriftBar({ current, target, symbol }) {
  const max  = Math.max(current, target, 1);
  const over = current > target;
  const drift = Math.abs(current - target).toFixed(1);
  const barColor = over ? "#f97316" : "#6366F1";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{symbol}</span>
        <span style={{ fontSize: 11.5, color: over ? "#fb923c" : TEXT_DIM }}>
          {over ? `+${drift}% over` : `-${drift}% under`} target
        </span>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 4,
                    background: "rgba(255,255,255,0.07)", overflow: "visible" }}>
        <div style={{ position: "absolute", left: `${(target / max) * 100}%`, top: -3,
                      width: 2, height: 14, background: TEXT_DIM, borderRadius: 1, zIndex: 2 }} />
        <div style={{ position: "absolute", left: 0, height: "100%", borderRadius: 4,
                      width: `${(current / max) * 100}%`, background: barColor,
                      transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11 }}>
        <span style={{ color: TEXT_DIM }}>Current <b style={{ color: TEXT }}>{current.toFixed(1)}%</b></span>
        <span style={{ color: TEXT_DIM }}>Target <b style={{ color: TEXT }}>{target.toFixed(1)}%</b></span>
      </div>
    </div>
  );
}

/* ─── Suggestion card ────────────────────────────────────────────── */
function SuggestionCard({ s }) {
  const isSell = s.action === "sell";
  const acColor = isSell ? "#f97316" : GREEN;
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: "18px 20px", marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start",
      transition: "border-color 0.15s",
    }}
    onMouseEnter={(e) => e.currentTarget.style.borderColor = acColor + "40"}
    onMouseLeave={(e) => e.currentTarget.style.borderColor = BORDER}>
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: acColor + "18", border: `1px solid ${acColor}30` }}>
        {isSell
          ? <TrendingDown size={16} color={acColor} />
          : <TrendingUp   size={16} color={acColor} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>{s.symbol}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: acColor, textTransform: "uppercase",
                         padding: "2px 8px", borderRadius: 5, background: acColor + "14",
                         border: `1px solid ${acColor}25` }}>{s.action}</span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>≈ {fmt$(s.trade_value)}</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, marginBottom: 5 }}>{s.plain_action}</div>
        <div style={{ fontSize: 12.5, color: TEXT_DIM, lineHeight: 1.55 }}>{s.reason}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          {[["Current", `${s.current_pct}%`], ["Target", `${s.target_pct}%`], ["Price", fmt$(s.current_price)]].map(([k, v]) => (
            <span key={k} style={{ fontSize: 11.5, color: TEXT_DIM }}>{k}: <b style={{ color: TEXT }}>{v}</b></span>
          ))}
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
  if (error)   return <Center>Could not load rebalancing data</Center>;
  if (!data)   return null;

  const allGood = !data.needs_rebalancing;

  return (
    <div style={{ padding: "32px 36px", color: TEXT, maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>
        Rebalance
        <InfoTip title="What is Rebalancing?">
          Over time, winning positions grow and losers shrink, pushing your
          portfolio away from your chosen allocation. Rebalancing trims the
          winners and tops up the losers to bring you back to target. We
          suggest trades when any holding drifts more than ~3% off.
        </InfoTip>
      </h1>
      <p style={{ margin: "0 0 26px", fontSize: 13, color: TEXT_DIM }}>
        Keep your portfolio aligned with your target allocation.
      </p>

      {/* Status banner */}
      <div style={{ padding: "16px 20px", borderRadius: 14, marginBottom: 24,
                    background: allGood ? GREEN_BG : "rgba(249,115,22,0.08)",
                    border: `1px solid ${allGood ? GREEN_BORDER : "rgba(249,115,22,0.25)"}`,
                    display: "flex", alignItems: "center", gap: 14 }}>
        {allGood
          ? <CheckCircle2 size={20} color={GREEN} />
          : <AlertCircle  size={20} color="#fb923c" />}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: allGood ? GREEN : "#fdba74" }}>
            {allGood
              ? "Your portfolio is well balanced"
              : `${data.suggestion_count} holding${data.suggestion_count !== 1 ? "s" : ""} need attention`}
          </div>
          <div style={{ fontSize: 12.5, color: TEXT_DIM, marginTop: 2 }}>
            {allGood
              ? "All holdings are within 3% of their targets — nothing to do."
              : `Total drift: ${data.total_drift}% from your target allocation.`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Allocation snapshot */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "22px 22px",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, marginBottom: 18,
                        textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Current vs Target
            <InfoTip title="Drift bars">
              Each bar shows a holding's current allocation vs its target. The
              vertical tick marks the target. Blue = on or below target,
              orange = overweight. Bigger drift means more urgent rebalancing.
            </InfoTip>
          </div>
          {data.allocation_snapshot.map((s) => (
            <div key={s.symbol} style={{ marginBottom: 20 }}>
              <DriftBar current={s.current_pct} target={s.target_pct} symbol={s.symbol} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 20, marginTop: 4, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 20, height: 5, borderRadius: 3, background: "#6366F1" }} />
              <span style={{ color: TEXT_DIM }}>Current</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 2, height: 12, background: TEXT_DIM }} />
              <span style={{ color: TEXT_DIM }}>Target</span>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div>
          {allGood ? (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16,
                          padding: "28px 24px", textAlign: "center",
                          boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`,
                            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <CheckCircle2 size={26} color={GREEN} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 8 }}>All on track</div>
              <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.65 }}>
                Every holding is close to your target. Check back after the next market move or new purchase.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_DIM, marginBottom: 14,
                            textTransform: "uppercase", letterSpacing: "0.05em" }}>Recommended Actions</div>
              {data.suggestions.map((s) => <SuggestionCard key={s.symbol} s={s} />)}
              <div style={{ marginTop: 4, padding: "13px 16px", borderRadius: 11, fontSize: 12.5,
                            background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`, color: TEXT_DIM, lineHeight: 1.6 }}>
                These are suggestions only — consult a financial adviser before trading.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explainer */}
      <div style={{ marginTop: 24, padding: "18px 22px", borderRadius: 14,
                    background: SURFACE, border: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_DIM, marginBottom: 8,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>What is rebalancing?</div>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM, lineHeight: 1.75 }}>
          Over time, faster-growing assets become a larger share of your portfolio than intended.
          Rebalancing means trimming what grew and adding to what lagged — keeping your risk profile where you want it.
        </p>
      </div>
    </div>
  );
}

function Center({ children }) {
  return <div style={{ padding: 60, textAlign: "center", color: TEXT_DIM, fontSize: 14 }}>{children}</div>;
}
