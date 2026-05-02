import { useState, useEffect, useRef } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, ACCENT, ACCENT_DIM, ACCENT_SOFT,
         SURFACE, BG, TEXT, TEXT_DIM } from "../theme.js";
import { apiFetch } from "../api.js";

/* ─── Semicircle risk gauge (canvas) ───────────────────────────── */
function RiskGauge({ score, level, label, icon }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const cx = W / 2, cy = H * 0.78;
    const R = Math.min(W * 0.42, H * 0.85);
    ctx.clearRect(0, 0, W, H);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0);
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#152B52";
    ctx.stroke();

    // Gradient arc: green → gold → orange → red
    const stops = [
      [0,   "#22c55e"],
      [0.25,"#84cc16"],
      [0.5, "#C9A227"],
      [0.75,"#f97316"],
      [1,   "#ef4444"],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
      const a0 = Math.PI + t0 * Math.PI;
      const a1 = Math.PI + t1 * Math.PI;
      const grd = ctx.createLinearGradient(
        cx + Math.cos(a0) * R, cy + Math.sin(a0) * R,
        cx + Math.cos(a1) * R, cy + Math.sin(a1) * R
      );
      grd.addColorStop(0, c0); grd.addColorStop(1, c1);
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.lineWidth = 18;
      ctx.strokeStyle = grd;
      ctx.stroke();
    }

    // Needle
    const norm = Math.max(0, Math.min(10, score)) / 10;
    const angle = Math.PI + norm * Math.PI;
    const nx = cx + Math.cos(angle) * (R - 4);
    const ny = cy + Math.sin(angle) * (R - 4);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Labels
    const tickLabels = [["Safe", Math.PI], ["OK", Math.PI * 1.25],
                        ["Balanced", Math.PI * 1.5], ["Risky", Math.PI * 1.75], ["Max", 0]];
    ctx.textAlign = "center";
    ctx.font = `600 9.5px 'DM Sans','Segoe UI',sans-serif`;
    ctx.fillStyle = TEXT_DIM;
    tickLabels.forEach(([lbl, a]) => {
      const tx = cx + Math.cos(a) * (R + 18);
      const ty = cy + Math.sin(a) * (R + 18);
      ctx.fillText(lbl, tx, ty);
    });
  }, [score]);

  return (
    <div style={{ textAlign: "center" }}>
      <canvas ref={ref} style={{ width: "100%", maxWidth: 340, height: 200, display: "block", margin: "0 auto" }} />
      <div style={{ fontSize: 36, marginTop: -12 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", color: TEXT, marginTop: 4 }}>
        {label}
      </div>
      <div style={{ display: "inline-block", padding: "3px 14px", borderRadius: 99, marginTop: 8,
                    background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`,
                    fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: "0.06em" }}>
        {level} risk
      </div>
    </div>
  );
}

/* ─── Contribution bar ──────────────────────────────────────────── */
function ContribBar({ beta, maxBeta = 2 }) {
  const pct = Math.min(100, (beta / maxBeta) * 100);
  const color = beta < 0.6 ? "#22c55e" : beta < 1.0 ? "#C9A227" : beta < 1.4 ? "#f97316" : "#ef4444";
  return (
    <div style={{ height: 6, background: ACCENT_DIM, borderRadius: 3, overflow: "hidden", width: 80 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
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
  if (error)   return <Center>Failed to load risk data</Center>;
  if (!data)   return null;

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: TEXT, maxWidth: 860 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>Risk Check</h1>
      <p style={{ margin: "0 0 32px", fontSize: 13, color: TEXT_DIM }}>
        How bumpy could the ride get for your portfolio?
      </p>

      {/* Gauge + plain English */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 32, marginBottom: 32 }}>
        <RiskGauge score={data.risk_score} level={data.risk_level}
                   label={data.risk_label} icon={data.risk_icon} />
        <div>
          <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 14,
                        padding: "22px 24px", height: "100%", boxSizing: "border-box" }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase",
                          letterSpacing: "0.06em", color: TEXT_DIM, marginBottom: 14 }}>
              What this means for you
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.7, color: TEXT }}>
              {data.plain_english}
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Stat label="Risk score" value={`${data.risk_score} / 10`} />
              <Stat label="Portfolio beta" value={data.portfolio_beta} hint="How much it moves vs the market" />
              <Stat label="Diversification" value={`${data.diversification_score} / 10`} />
            </div>
          </div>
        </div>
      </div>

      {/* Concentration warnings */}
      {data.concentration_warnings?.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {data.concentration_warnings.map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px",
                                   borderRadius: 10, background: "#f9731610", border: "1px solid #f9731630",
                                   marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ fontSize: 13, color: "#fdba74", lineHeight: 1.5 }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Holdings risk breakdown */}
      <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${ACCENT_DIM}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>How each holding contributes to your risk</div>
          <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 3 }}>
            "Beta" shows how much a holding tends to move compared to the overall market.
            A beta of 1.0 moves in lock-step with the market; above 1.0 means more volatile.
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Holding", "Type", "Your slice", "Beta (volatility)", "Risk contribution"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11,
                                      fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase",
                                      letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.holdings_risk.map((h, i) => (
              <tr key={h.symbol} style={{ borderTop: `1px solid ${ACCENT_DIM}` }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.symbol}</div>
                  <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>{h.name}</div>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: TEXT_DIM, textTransform: "uppercase" }}>
                  {h.type}
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13 }}>{h.weight_pct}%</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{h.beta.toFixed(2)}</span>
                    <ContribBar beta={h.beta} />
                  </div>
                  <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 3 }}>
                    {h.beta < 1 ? `Moves ${((1 - h.beta) * 100).toFixed(0)}% less than the market`
                                : `Moves ${((h.beta - 1) * 100).toFixed(0)}% more than the market`}
                  </div>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: TEXT_DIM }}>{h.contribution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tips */}
      <div style={{ marginTop: 24, padding: "18px 20px", borderRadius: 12,
                    background: GOLD_BG, border: `1px solid ${GOLD_BORDER}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 10,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>💡 Quick tips</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: TEXT_DIM, fontSize: 13, lineHeight: 1.8 }}>
          <li>A diversified portfolio has a mix of stocks, bonds, and ETFs across different industries.</li>
          <li>Bonds (low beta) reduce overall risk — they often rise when stocks fall.</li>
          <li>If any one holding is more than 20–25% of your portfolio, consider trimming it.</li>
        </ul>
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

function Stat({ label, value, hint }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
