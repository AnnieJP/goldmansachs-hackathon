import { useState, useEffect, useRef } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, SURFACE_2, BG, TEXT, TEXT_SEC, TEXT_DIM,
         GREEN, RED, FONT_SERIF } from "../theme.js";
import { apiFetch } from "../api.js";
import { ShieldCheck, AlertTriangle, Activity, BarChart3 } from "lucide-react";

/* ─── SVG circular health score ────────────────────────────────── */
function HealthRing({ score }) {
  const r = 52, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(10, score)) / 10;
  const dash = pct * circ;
  const color = pct >= 0.7 ? GREEN : pct >= 0.45 ? "#F59E0B" : RED;
  return (
    <div style={{ position: "relative", width: 128, height: 128, margin: "0 auto" }}>
      <svg width={128} height={128}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: "-0.03em" }}>{score}</div>
        <div style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: "0.04em" }}>/ 10</div>
      </div>
    </div>
  );
}

/* ─── Semicircle risk gauge ─────────────────────────────────────── */
function RiskGauge({ score }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const cx = W / 2, cy = H * 0.8;
    const R  = Math.min(W * 0.42, H * 0.9);
    ctx.clearRect(0, 0, W, H);

    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0);
    ctx.lineWidth = 14; ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.stroke();

    const stops = [[0,"#10B981"],[0.25,"#84cc16"],[0.5,"#F59E0B"],[0.75,"#f97316"],[1,"#EF4444"]];
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
      const a0 = Math.PI + t0 * Math.PI, a1 = Math.PI + t1 * Math.PI;
      const grd = ctx.createLinearGradient(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R,
                                            cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
      grd.addColorStop(0, c0); grd.addColorStop(1, c1);
      ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1);
      ctx.lineWidth = 14; ctx.strokeStyle = grd; ctx.stroke();
    }

    const norm  = Math.max(0, Math.min(10, score)) / 10;
    const angle = Math.PI + norm * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (R - 6), cy + Math.sin(angle) * (R - 6));
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
  }, [score]);
  return <canvas ref={ref} style={{ width: "100%", maxWidth: 300, height: 160, display: "block", margin: "0 auto" }} />;
}

/* ─── Beta bar ──────────────────────────────────────────────────── */
function BetaBar({ beta }) {
  const pct   = Math.min(100, (Math.max(0, beta) / 2) * 100);
  const color = beta < 0.6 ? GREEN : beta < 1.0 ? "#84cc16" : beta < 1.4 ? "#F59E0B" : RED;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 32, fontVariantNumeric: "tabular-nums" }}>
        {beta.toFixed(2)}
      </span>
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden", maxWidth: 90 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3,
                      transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

/* ─── Main screen ───────────────────────────────────────────────── */
export default function RiskScreen({ portfolio, prices }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!portfolio || !prices) return;
    setLoading(true);
    apiFetch("/api/risk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio, prices }),
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [portfolio, prices]);

  if (loading) return <Center>Analysing your portfolio…</Center>;
  if (error)   return <Center>Could not load risk data</Center>;
  if (!data)   return null;

  const riskColor = data.risk_score <= 3 ? GREEN : data.risk_score <= 6 ? "#F59E0B" : RED;

  return (
    <div style={{ padding: "32px 36px", color: TEXT, maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>Risk Check</h1>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: TEXT_DIM }}>
        How much volatility is hiding in your portfolio?
      </p>

      {/* Top cards */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20, marginBottom: 24 }}>

        {/* Health score */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16,
                      padding: "24px 20px", textAlign: "center",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_DIM, marginBottom: 16,
                        textTransform: "uppercase", letterSpacing: "0.06em" }}>Health Score</div>
          <HealthRing score={data.risk_score} />
          <div style={{ marginTop: 14, display: "inline-block", padding: "4px 14px", borderRadius: 99,
                        background: riskColor + "18", border: `1px solid ${riskColor}30`,
                        fontSize: 12, fontWeight: 700, color: riskColor, letterSpacing: "0.04em" }}>
            {data.risk_level} risk
          </div>
        </div>

        {/* Risk gauge + explanation */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16,
                      padding: "24px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <RiskGauge score={data.risk_score} />
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.75, color: TEXT }}>
              {data.plain_english}
            </p>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <StatPill label="Risk Score"       value={`${data.risk_score} / 10`}   />
              <StatPill label="Portfolio Beta"   value={data.portfolio_beta}
                         hint="vs. S&P 500"      />
              <StatPill label="Diversification"  value={`${data.diversification_score} / 10`} />
            </div>
          </div>
        </div>
      </div>

      {/* Concentration warnings */}
      {data.concentration_warnings?.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          {data.concentration_warnings.map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start",
                                   padding: "12px 16px", borderRadius: 11, marginBottom: 8,
                                   background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)" }}>
              <AlertTriangle size={15} color="#fb923c" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: "#fdba74", lineHeight: 1.55 }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Holdings breakdown */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>Per-holding risk breakdown</div>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 3 }}>
            Beta &gt; 1.0 means that holding amplifies market moves.
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Holding", "Type", "Weight", "Beta", "Contribution"].map((h) => (
                <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11,
                                      fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase",
                                      letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.holdings_risk.map((h) => (
              <tr key={h.symbol} style={{ borderTop: `1px solid ${BORDER}`, transition: "background 0.12s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px 18px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.symbol}</div>
                  <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>{h.name}</div>
                </td>
                <td style={{ padding: "12px 18px", fontSize: 12, color: TEXT_DIM, textTransform: "uppercase" }}>{h.type}</td>
                <td style={{ padding: "12px 18px", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{h.weight_pct}%</td>
                <td style={{ padding: "12px 18px" }}>
                  <BetaBar beta={h.beta} />
                  <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 3 }}>
                    {h.beta < 1
                      ? `${((1 - h.beta) * 100).toFixed(0)}% less volatile than market`
                      : `${((h.beta - 1) * 100).toFixed(0)}% more volatile than market`}
                  </div>
                </td>
                <td style={{ padding: "12px 18px", fontSize: 13, color: TEXT_DIM }}>{h.contribution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tips */}
      <div style={{ marginTop: 20, padding: "18px 20px", borderRadius: 14,
                    background: GOLD_BG, border: `1px solid ${GOLD_BORDER}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: GOLD, marginBottom: 10,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>Quick tips</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: TEXT_DIM, fontSize: 13, lineHeight: 1.85 }}>
          <li>A diversified portfolio spans stocks, bonds, and ETFs across different sectors.</li>
          <li>Bonds (low beta) buffer volatility — they tend to rise when equities fall.</li>
          <li>Any single holding over 20–25% of your portfolio raises concentration risk.</li>
        </ul>
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: TEXT_DIM, fontSize: 14 }}>{children}</div>
  );
}

function StatPill({ label, value, hint }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4, letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: GOLD, letterSpacing: "-0.02em" }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
