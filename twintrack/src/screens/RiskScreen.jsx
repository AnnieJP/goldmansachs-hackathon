import { useState, useEffect, useRef, useMemo } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, SURFACE_2, BG, TEXT, TEXT_SEC, TEXT_DIM,
         GREEN, RED, FONT_SERIF } from "../theme.js";
import { apiFetch } from "../api.js";
import { ShieldCheck, AlertTriangle, Activity, BarChart3, Layers, Shield, Clock } from "lucide-react";
import InfoTip from "../components/InfoTip.jsx";
import TypeBadge from "../components/TypeBadge.jsx";

/* ─── Refined SVG arc gauge ─────────────────────────────────────── */
function RiskGauge({ score }) {
  const W = 320, H = 200;
  const cx = W / 2, cy = 165;
  const R = 120;
  const stroke = 18;

  // Build segments along the arc with smooth color stops
  const stops = [
    { t: 0.00, c: "#10B981" },
    { t: 0.25, c: "#84cc16" },
    { t: 0.50, c: "#F59E0B" },
    { t: 0.75, c: "#f97316" },
    { t: 1.00, c: "#EF4444" },
  ];

  // Polar → cartesian helper (angle in radians, 0 = right, π = left)
  const pt = (a, r = R) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

  // Build a thin arc path between two normalized t values [0..1]
  const arc = (t0, t1) => {
    const a0 = Math.PI + t0 * Math.PI;
    const a1 = Math.PI + t1 * Math.PI;
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };

  // Slice arc into many small segments and assign interpolated colors
  const segs = 60;
  const interp = (t) => {
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / (b.t - a.t);
        return mix(a.c, b.c, k);
      }
    }
    return stops[stops.length - 1].c;
  };

  const norm = Math.max(0, Math.min(10, score)) / 10;
  const needleAngle = Math.PI + norm * Math.PI;
  const [nx, ny] = pt(needleAngle, R - 10);

  // Tick marks at 0, 2.5, 5, 7.5, 10
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const a = Math.PI + t * Math.PI;
    const [ix, iy] = pt(a, R + 14);
    const [ox, oy] = pt(a, R + 22);
    const [lx, ly] = pt(a, R + 34);
    return { ix, iy, ox, oy, lx, ly, label: (t * 10).toFixed(0) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <filter id="needleShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" />
          <feOffset dy="1" />
          <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Track */}
      <path d={arc(0, 1)} fill="none" stroke="rgba(176,193,214,0.12)" strokeWidth={stroke} strokeLinecap="round" />

      {/* Multi-segment colored arc */}
      {Array.from({ length: segs }).map((_, i) => {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        return (
          <path key={i} d={arc(t0, t1)} fill="none"
                stroke={interp((t0 + t1) / 2)} strokeWidth={stroke} strokeLinecap="butt"
                opacity={0.95} />
        );
      })}

      {/* Tick marks + labels */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={t.ix} y1={t.iy} x2={t.ox} y2={t.oy}
                stroke="rgba(176,193,214,0.45)" strokeWidth={1.2} strokeLinecap="round" />
          <text x={t.lx} y={t.ly} textAnchor="middle" dominantBaseline="middle"
                fontSize="10" fill={TEXT_DIM} style={{ fontVariantNumeric: "tabular-nums" }}>
            {t.label}
          </text>
        </g>
      ))}

      {/* Needle */}
      <g filter="url(#needleShadow)" style={{ transition: "transform 0.8s cubic-bezier(.4,1.4,.6,1)" }}>
        <line x1={cx} y1={cy} x2={nx} y2={ny}
              stroke={TEXT} strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={9} fill={TEXT} />
        <circle cx={cx} cy={cy} r={4} fill={SURFACE} />
      </g>
    </svg>
  );
}

// tiny hex color mix
function mix(a, b, k) {
  const ah = a.replace("#", ""), bh = b.replace("#", "");
  const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden", maxWidth: 90 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

/* ─── Mini market-sensitivity scale (for Risk Metrics card) ─────── */
function BetaScale({ beta }) {
  const pct = Math.min(100, Math.max(0, (beta / 2) * 100));
  const color = beta < 0.7 ? GREEN : beta < 1.1 ? "#84cc16" : beta < 1.4 ? "#F59E0B" : RED;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: "relative", height: 6, background: "rgba(176,193,214,0.12)" }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, #10B981 0%, #84cc16 35%, #F59E0B 55%, #f97316 75%, #EF4444 100%)",
          opacity: 0.35,
        }} />
        <div style={{
          position: "absolute", left: `calc(${pct}% - 6px)`, top: -3,
          width: 12, height: 12, background: color,
          boxShadow: `0 0 0 2px ${SURFACE}, 0 1px 4px rgba(0,0,0,0.4)`,
          transition: "left 0.6s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4,
                    fontSize: 9.5, color: TEXT_DIM, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        <span>Low</span><span>Market</span><span>High</span>
      </div>
    </div>
  );
}

/* ─── Diversification dot strip ─────────────────────────────────── */
function DivStrip({ score, color }) {
  const filled = Math.max(0, Math.min(10, Math.round(score)));
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 6,
          background: i < filled ? color : "rgba(176,193,214,0.15)",
          transition: "background 0.3s ease",
        }} />
      ))}
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
  const beta = data.portfolio_beta;
  const betaLabel = beta < 0.7 ? "Low" : beta < 1.1 ? "Moderate" : beta < 1.4 ? "Elevated" : "High";
  const betaColor = beta < 0.7 ? GREEN : beta < 1.1 ? "#84cc16" : beta < 1.4 ? "#F59E0B" : RED;
  const divColor  = data.diversification_score >= 7 ? GREEN : data.diversification_score >= 4 ? "#F59E0B" : RED;

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 0.85fr", gap: 20, marginBottom: 32 }}>

        {/* Box 1 — Risk Analysis */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 18px",
                      display: "flex", flexDirection: "column" }}>
          {/* Header row: title left, score top-right */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
                Risk Analysis
              </h3>
              <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.4 }}>
                Portfolio risk assessment
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: riskColor, fontFamily: FONT_SERIF, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {data.risk_score}
                <span style={{ fontSize: 13, color: TEXT_DIM, fontWeight: 500 }}> / 10</span>
              </div>
              <div style={{ fontSize: 9.5, color: TEXT_DIM, marginTop: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Risk Score
                <InfoTip title="Risk Score (0–10)" placement="top">
                  A blended score derived from your portfolio's beta. 0–3 is
                  conservative, 4–6 is balanced, and 7–10 is aggressive.
                  Higher scores mean larger swings—both up and down.
                </InfoTip>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 150, marginTop: 10 }}>
            <RiskGauge score={data.risk_score} />
          </div>
        </div>

        {/* Box 2 — Risk Metrics */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 18px",
                      display: "flex", flexDirection: "column" }}>
          <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
            Risk Metrics
          </h3>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12, lineHeight: 1.4 }}>
            Key portfolio indicators
          </div>

          {/* Beta block */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF, letterSpacing: "-0.01em" }}>
                  {betaLabel}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_DIM, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>
                  {beta.toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Beta
                <InfoTip title="What is Beta?">
                  Beta measures how your portfolio moves vs. the overall market.
                  Beta of <b>1.0</b> tracks the market; <b>1.5</b> means 50% more
                  volatile; <b>0.5</b> means half as volatile.
                </InfoTip>
              </div>
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>Market sensitivity</div>
            <BetaScale beta={beta} />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: BORDER, margin: "0 -4px 12px" }} />

          {/* Diversification block */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF, letterSpacing: "-0.01em" }}>
                  {data.diversification_score}
                </span>
                <span style={{ fontSize: 13, color: TEXT_DIM, marginLeft: 4 }}>/ 10</span>
              </div>
              <div style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Diversification
                <InfoTip title="Diversification Score">
                  Rewards spreading money across more holdings and more asset
                  types. Low scores mean a single bad bet can hurt a lot.
                </InfoTip>
              </div>
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>Spread across holdings & types</div>
            <DivStrip score={data.diversification_score} color={divColor} />
          </div>

          {/* What This Means callout */}
          <div style={{
            marginTop: 10,
            padding: "10px 12px",
            background: `${riskColor}10`,
            borderLeft: `3px solid ${riskColor}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: riskColor, letterSpacing: "0.08em",
                          textTransform: "uppercase", marginBottom: 3 }}>
              What This Means
            </div>
            <div style={{ fontSize: 11.5, color: TEXT_SEC, lineHeight: 1.5 }}>
              {data.plain_english}
            </div>
          </div>
        </div>

        {/* Box 3 — Portfolio Insights */}
        <PortfolioFacts data={data} />

      </div>

      {/* Holdings breakdown */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, overflow: "hidden",
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
              {[
                { label: "Holding" },
                { label: "Type" },
                { label: "Weight", tip: "Your share of the total portfolio. A 30% weight means $3 of every $10 invested is in this holding." },
                { label: "Volatility" },
                { label: "Portfolio Impact", tip: "How much this holding's price swings affect your overall portfolio. High weight combined with high volatility = large impact." },
              ].map(({ label, tip }) => (
                <th key={label} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11,
                                          fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase",
                                          letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER}` }}>
                  {label}{tip && <InfoTip title={label}>{tip}</InfoTip>}
                </th>
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
                <td style={{ padding: "12px 18px" }}><TypeBadge type={h.type} /></td>
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

    </div>
  );
}

/* ─── Dynamic portfolio insights ticker ─────────────────────────── */
const FACT_ICONS = [Activity, ShieldCheck, BarChart3, AlertTriangle, Layers, Shield, Clock];

function PortfolioFacts({ data }) {
  const facts = useMemo(() => {
    const list = [];
    const holdings = data.holdings_risk || [];
    const beta  = data.portfolio_beta;
    const score = data.risk_score;

    if (beta != null) {
      const label = beta < 0.7 ? "low" : beta < 1.1 ? "moderate" : beta < 1.4 ? "elevated" : "high";
      list.push({ text: `Your portfolio beta is ${beta.toFixed(2)} — ${label} sensitivity to market swings.`, icon: Activity });
    }
    if (score != null) {
      const tier = score <= 3 ? "conservative" : score <= 6 ? "balanced" : "aggressive";
      list.push({ text: `Risk score ${score}/10 — your portfolio sits in the ${tier} range.`, icon: ShieldCheck });
    }
    if (holdings.length > 0) {
      const heaviest = [...holdings].sort((a, b) => b.weight_pct - a.weight_pct)[0];
      list.push({ text: `${heaviest.symbol} is your largest position at ${heaviest.weight_pct}% of your portfolio.`, icon: BarChart3 });

      const mostVolatile = [...holdings].sort((a, b) => b.beta - a.beta)[0];
      list.push({ text: `${mostVolatile.symbol} is your most volatile holding — beta ${mostVolatile.beta.toFixed(2)}.`, icon: AlertTriangle });

      const mostStable = [...holdings].filter(h => h.beta > 0).sort((a, b) => a.beta - b.beta)[0];
      if (mostStable && mostStable.symbol !== mostVolatile.symbol) {
        list.push({ text: `${mostStable.symbol} is your most stable holding — beta ${mostStable.beta.toFixed(2)}.`, icon: Shield });
      }

      const types = [...new Set(holdings.map(h => h.type))];
      list.push({ text: `You hold ${holdings.length} position${holdings.length !== 1 ? "s" : ""} across ${types.length} asset type${types.length !== 1 ? "s" : ""}: ${types.join(", ")}.`, icon: Layers });

      const highBeta = holdings.filter(h => h.beta > 1.3);
      if (highBeta.length > 0)
        list.push({ text: `${highBeta.length} of your holding${highBeta.length !== 1 ? "s move" : " moves"} more than 30% harder than the market on big days.`, icon: AlertTriangle });

      const lowBeta = holdings.filter(h => h.beta < 0.6);
      if (lowBeta.length > 0)
        list.push({ text: `${lowBeta.map(h => h.symbol).join(", ")} act${lowBeta.length === 1 ? "s" : ""} as a stability anchor in your portfolio.`, icon: Shield });
    }
    if (data.expected_return != null)
      list.push({ text: `Estimated annual return based on your current allocation: ${(data.expected_return * 100).toFixed(1)}%.`, icon: Clock });

    list.push({ text: "Bonds and low-beta assets buffer volatility — they tend to rise when equities fall.", icon: Shield });
    list.push({ text: "Any single holding above 25% of your portfolio raises concentration risk.", icon: Layers });
    list.push({ text: "Rebalancing quarterly keeps your risk level aligned with your goals.", icon: Clock });

    return list;
  }, [data]);

  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);
  const total = facts.length;
  const ROTATE_MS = 4500;

  useEffect(() => {
    if (total <= 1) return;
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % total); setVisible(true); }, 380);
    }, ROTATE_MS);
    return () => clearInterval(iv);
  }, [total]);

  if (!facts.length) return null;
  const { text, icon: Icon } = facts[idx];
  const riskColor = data.risk_score <= 3 ? GREEN : data.risk_score <= 6 ? "#F59E0B" : RED;

  const hasWarning = data.concentration_warnings?.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Sub-card 1: rotating insight */}
      <div style={{ flex: 2, background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 18px",
                    display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
          Portfolio Insights
        </h3>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12, lineHeight: 1.4 }}>
          What stands out about your portfolio
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12,
                      opacity: visible ? 1 : 0,
                      transform: visible ? "translateY(0)" : "translateY(6px)",
                      transition: "opacity 0.38s ease, transform 0.38s ease" }}>
          <div style={{
            width: 40, height: 40, flexShrink: 0,
            background: `${riskColor}15`,
            border: `1px solid ${riskColor}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={18} color={riskColor} strokeWidth={1.75} />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: TEXT_SEC, lineHeight: 1.55, fontFamily: FONT_SERIF, fontWeight: 400 }}>
            {text}
          </p>
        </div>
      </div>

      {/* Sub-card 2: concentration warning */}
      {hasWarning && (
        <div style={{
          flex: 1,
          background: "rgba(249,115,22,0.08)",
          border: "1px solid rgba(249,115,22,0.3)",
          padding: "16px 18px",
          display: "flex", gap: 10,
          alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle size={15} color="#9a3412" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#9a3412", lineHeight: 1.55, textAlign: "center", fontWeight: 500 }}>
            {data.concentration_warnings[0]}
          </p>
        </div>
      )}
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: TEXT_DIM, fontSize: 14 }}>{children}</div>
  );
}
