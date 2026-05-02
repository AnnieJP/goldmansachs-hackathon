import { useState, useEffect, useRef } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, SURFACE_2, BG, TEXT, TEXT_SEC, TEXT_DIM,
         GREEN, RED, FONT_SERIF } from "../theme.js";
import { apiFetch } from "../api.js";
import { ShieldCheck, AlertTriangle, Activity, BarChart3, Layers, Shield, Clock } from "lucide-react";
import InfoTip from "../components/InfoTip.jsx";

/* ─── Modern circular risk meter ────────────────────────────────── */
function HealthRing({ score }) {
  const r = 48, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(10, score)) / 10;
  const dash = pct * circ;
  const color = pct >= 0.7 ? GREEN : pct >= 0.45 ? "#F59E0B" : RED;
  
  // Create gradient based on score
  const gradientId = `risk-gradient-${score}`;
  
  return (
    <div style={{ position: "relative", width: 128, height: 128, margin: "0 auto" }}>
      <svg width={128} height={128}>
        {/* Define gradient */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.8} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(176,193,214,0.15)" strokeWidth={12} />
        
        {/* Progress ring with gradient */}
        <circle cx={cx} cy={cy} r={r} fill="none" 
          stroke={`url(#${gradientId})`} strokeWidth={12}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s" }} />
        
        {/* Inner decorative ring */}
        <circle cx={cx} cy={cy} r={r-16} fill="none" stroke="rgba(176,193,214,0.1)" strokeWidth={2} />
      </svg>
      
      {/* Center content */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center" }}>
        {/* Score with shadow effect */}
        <div style={{ 
          fontSize: 28, 
          fontWeight: 900, 
          color, 
          letterSpacing: "-0.03em",
          textShadow: `0 2px 4px ${color}20`,
          lineHeight: 1
        }}>{score}</div>
        <div style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: "0.04em", marginTop: 2 }}>/ 10</div>
      </div>
      
      {/* Decorative dots around the ring */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
          const isActive = (angle / 360) <= pct;
          const x = 64 + 60 * Math.cos((angle - 90) * Math.PI / 180);
          const y = 64 + 60 * Math.sin((angle - 90) * Math.PI / 180);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: isActive ? color : "rgba(176,193,214,0.3)",
                transform: "translate(-50%, -50%)",
                transition: "background 0.3s ease"
              }}
            />
          );
        })}
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
    ctx.lineWidth = 14; ctx.strokeStyle = "rgba(176,193,214,0.15)"; ctx.stroke();

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
    ctx.strokeStyle = TEXT; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = TEXT; ctx.fill();
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
<div style={{ padding: "32px 36px", color: TEXT }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>
        Risk Check
        <InfoTip title="What is Risk Check?">
          This page estimates how volatile your portfolio is using each holding's
          <b> beta</b> (market sensitivity) weighted by position size. It flags
          concentration risks and tells you, in plain English, what to expect
          in normal market moves.
        </InfoTip>
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: TEXT_DIM }}>
        How much volatility is hiding in your portfolio?
      </p>

      {/* ── 3-Box Visual Section ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>

        {/* Box 1 — Risk Analysis */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 20px" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, textAlign: "center", fontFamily: FONT_SERIF }}>
            Risk Analysis
          </h3>
          <div style={{ fontSize: 11, color: TEXT_DIM, textAlign: "center", marginBottom: 12, lineHeight: 1.4 }}>
            Portfolio risk assessment
          </div>
          <div style={{ height: 140, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 140, height: 140 }}>
              <RiskGauge score={data.risk_score} />
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>{data.risk_score}/10</div>
            <div style={{ fontSize: 12, color: TEXT_DIM }}>
              Risk Score
              <InfoTip title="Risk Score (0–10)" placement="top">
                A blended score derived from your portfolio's beta. 0–3 is
                conservative, 4–6 is balanced, and 7–10 is aggressive.
                Higher scores mean larger swings—both up and down.
              </InfoTip>
            </div>
          </div>
        </div>

        {/* Box 2 — Risk Metrics */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 20px" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
            Risk Metrics
          </h3>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12, lineHeight: 1.4 }}>
            Key portfolio indicators
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                               padding: "6px",
                               background: "transparent" }}>
                <div style={{ width: 10, height: 10, flexShrink: 0,
                              background: GOLD }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                    {data.portfolio_beta < 0.7 ? "Low" : data.portfolio_beta < 1.1 ? "Moderate" : data.portfolio_beta < 1.4 ? "Elevated" : "High"}
                    <span style={{ fontWeight: 400, fontSize: 11, color: TEXT_DIM, marginLeft: 6 }}>({data.portfolio_beta.toFixed(2)})</span>
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_DIM }}>
                    Market Sensitivity (Beta)
                    <InfoTip title="What is Beta?">
                      Beta measures how your portfolio moves vs. the overall market.
                      Beta of <b>1.0</b> tracks the market; <b>1.5</b> means 50% more
                      volatile; <b>0.5</b> means half as volatile. Calculated as a
                      weighted average of each holding's beta.
                    </InfoTip>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                               padding: "6px",
                               background: "transparent" }}>
                <div style={{ width: 10, height: 10, flexShrink: 0,
                              background: GREEN }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{data.diversification_score}/10</div>
                  <div style={{ fontSize: 11, color: TEXT_DIM }}>
                    Diversification Score
                    <InfoTip title="Diversification Score">
                      Rewards spreading money across more holdings and more asset
                      types (stocks, ETFs, bonds, funds). Low scores mean your
                      portfolio is concentrated and a single bad bet can hurt a lot.
                    </InfoTip>
                  </div>
                </div>
              </div>
              <div style={{ padding: "6px", borderRadius: 6, background: `${riskColor}15` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 3 }}>
                  What This Means
                </div>
                <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.4 }}>
                  {data.plain_english}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Box 3 — Risk Tips */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 20px" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
            Risk Tips
          </h3>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12, lineHeight: 1.4 }}>
            Ways to manage your investment risk
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                               padding: "6px",
                               background: `${GREEN}15` }}>
                <Layers size={14} color={GREEN} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: TEXT_DIM }}>
                  Diversify across different companies and industries
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                               padding: "6px",
                               background: `${GOLD}15` }}>
                <Shield size={14} color={GOLD} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: TEXT_DIM }}>
                  Include bonds and stable investments
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                               padding: "6px",
                               background: `${RED}15` }}>
                <Clock size={14} color={RED} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: TEXT_DIM }}>
                  Focus on long-term investment goals
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                               padding: "6px",
                               background: `${GOLD}15` }}>
                <BarChart3 size={14} color={GOLD} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: TEXT_DIM }}>
                  Check portfolio balance quarterly
                </div>
              </div>
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
          <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>
            Per-holding risk breakdown
            <InfoTip title="Per-holding contribution">
              Each row shows how much an individual holding contributes to the
              total portfolio risk. A high-beta holding with a large weight is
              the biggest driver of volatility.
            </InfoTip>
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 3 }}>
            A score above 1.0 means this holding swings more than the overall market.
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Holding", "Type", "Weight", "Volatility", "Portfolio Impact"].map((h) => (
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
