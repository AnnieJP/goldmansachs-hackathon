import { useState, useRef, useEffect } from "react";
import {
  SURFACE, SURFACE_2, BG, TEXT, TEXT_DIM, TEXT_SEC,
  GOLD, GOLD_BG, GOLD_BORDER,
  BORDER, BORDER_MED,
  GREEN, GREEN_BG, GREEN_BORDER,
  RED, RED_BG, RED_BORDER,
  FONT_SERIF, glass,
  fmt$, fmtPct,
} from "../theme.js";
import { apiFetch } from "../api.js";
import InfoTip from "../components/InfoTip.jsx";
import { Send, Loader2, TrendingUp, TrendingDown, ArrowRight,
         ShieldAlert, CheckCircle2, AlertTriangle, History, RefreshCw } from "lucide-react";

const STARTERS = [
  "What if the market crashes next month?",
  "I want $30,000 in 18 months for a house — am I on track?",
  "Interest rates are rising. How should I rebalance?",
  "I'm retiring in 2 years — how safe is my portfolio?",
  "Tech stocks are falling. What should I do?",
  "Optimize my portfolio for a bull market.",
];

const VERDICT_CONFIG = {
  proceed:              { color: GREEN,    bg: GREEN_BG,  border: GREEN_BORDER, Icon: CheckCircle2,  label: "Safe to Rebalance",      sub: "This trade plan looks good to execute."             },
  proceed_with_caution: { color: "#B45309", bg: "#FEF3C7", border: "#FDE68A",   Icon: AlertTriangle, label: "Rebalance with Care",    sub: ""                                                   },
  do_not_proceed:       { color: RED,      bg: RED_BG,    border: RED_BORDER,   Icon: ShieldAlert,   label: "Don't Rebalance Yet",   sub: "" },
};

/* ── Verdict badge ─────────────────────────────────────────────── */
function VerdictBadge({ verdict }) {
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.proceed;
  const { Icon } = cfg;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "6px 14px", borderRadius: 99,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        color: cfg.color, fontSize: 13, fontWeight: 700,
      }}>
        <Icon size={14} strokeWidth={2.2} />
        {cfg.label}
      </div>
      <span style={{ fontSize: 11, color: cfg.color, opacity: 0.8, paddingLeft: 2 }}>{cfg.sub}</span>
    </div>
  );
}

/* ── Trade card ────────────────────────────────────────────────── */
function TradeCard({ trade }) {
  const isBuy   = trade.action === "buy";
  const color   = isBuy ? GREEN : RED;
  const bg      = isBuy ? GREEN_BG : RED_BG;
  const border  = isBuy ? GREEN_BORDER : RED_BORDER;
  return (
    <div style={{
      ...glass,
      padding: "14px 16px", marginBottom: 0,
      borderLeft: `3px solid ${color}`,
      display: "flex", gap: 14, alignItems: "flex-start",
    }}>
      <div style={{
        flexShrink: 0, padding: "4px 10px", borderRadius: 99,
        background: bg, border: `1px solid ${border}`,
        color, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
      }}>
        {isBuy ? "BUY" : "SELL"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: TEXT, fontFamily: FONT_SERIF }}>
            {trade.ticker}
          </span>
          {trade.is_new && (
            <span style={{ fontSize: 10, color: "#0891B2", fontWeight: 700,
                           background: "#E0F2FE", padding: "1px 6px", borderRadius: 4 }}>
              NEW
            </span>
          )}
          <span style={{ fontSize: 12, color: TEXT_DIM }}>{trade.name}</span>
        </div>
        <div style={{ fontSize: 13, color: TEXT_SEC, marginBottom: 5 }}>
          <b>{trade.shares} share{trade.shares !== 1 ? "s" : ""}</b>
          {" at "}
          <b>{fmt$(trade.price)}</b>
          {" · Total: "}
          <b style={{ color }}>{fmt$(trade.value)}</b>
        </div>
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
          {trade.reason}
        </div>
      </div>
    </div>
  );
}

/* ── Allocation bar ────────────────────────────────────────────── */
function AllocationRow({ label, current, target, gap }) {
  const isUnder = gap > 0;
  const isOver  = gap < 0;
  const gapAbs  = Math.abs(gap);
  const maxBar  = Math.max(current, target, 5);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_SEC }}>{label}</span>
        <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
          {current.toFixed(0)}%
          <span style={{ margin: "0 4px", color: BORDER_MED }}>→</span>
          <b style={{ color: TEXT }}>{target.toFixed(0)}%</b>
          {gapAbs >= 1 && (
            <span style={{
              marginLeft: 6, fontSize: 10.5, fontWeight: 700,
              color: isUnder ? GREEN : isOver ? RED : TEXT_DIM,
            }}>
              {isUnder ? "+" : ""}{gap.toFixed(0)}%
            </span>
          )}
        </span>
      </div>
      <div style={{ position: "relative", height: 6, background: "#EDE8E1", borderRadius: 99 }}>
        {/* current */}
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 99,
          width: `${Math.min(100, (current / maxBar) * 100)}%`,
          background: isOver ? RED : TEXT_DIM, opacity: 0.4,
        }} />
        {/* target */}
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 99,
          width: `${Math.min(100, (target / maxBar) * 100)}%`,
          background: isUnder ? GREEN : GOLD, opacity: 0.7,
        }} />
      </div>
    </div>
  );
}

/* ── Result panel ──────────────────────────────────────────────── */
function ResultPanel({ result, onReset }) {
  const [showGaps, setShowGaps] = useState(false);

  const rebalance     = result.rebalance || {};
  const trades        = rebalance.trades || [];
  const gapAnalysis   = rebalance.gap_analysis || {};
  const before        = rebalance.before || {};
  const after         = rebalance.after  || {};
  const verdict       = result.verdict || "proceed";
  const math          = result.math || {};
  const flags         = result.flags || [];
  const violations    = result.violations || [];

  const sells = trades.filter((t) => t.action === "sell");
  const buys  = trades.filter((t) => t.action === "buy");

  const gapRows = Object.entries(gapAnalysis)
    .filter(([, g]) => Math.abs(g.gap_pct) >= 1)
    .sort(([, a], [, b]) => Math.abs(b.gap_pct) - Math.abs(a.gap_pct));

  return (
    <div style={{ width: "100%" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                        textTransform: "uppercase", color: TEXT_DIM, marginBottom: 4 }}>
            Scenario Analysis
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, maxWidth: 480 }}>
            "{result.scenario_text}"
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <VerdictBadge verdict={verdict} />
          <button onClick={onReset} type="button" style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8,
            border: `1px solid ${BORDER}`, background: SURFACE,
            color: TEXT_DIM, fontSize: 12.5, cursor: "pointer",
          }}>
            <RefreshCw size={13} />
            New scenario
          </button>
        </div>
      </div>

      {/* Reasoning */}
      <div style={{ ...glass, padding: "16px 18px", marginBottom: 16, borderRadius: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: TEXT_DIM, marginBottom: 6 }}>
          Summary
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: TEXT_SEC, lineHeight: 1.7 }}>
          {result.reasoning || result.narrative}
        </p>
        {math.portfolio_beta > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            {/* Before / After beta comparison */}
            {math.post_rebalance_beta != null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
                              textTransform: "uppercase", color: TEXT_DIM, marginBottom: 8 }}>
                  How rebalancing changes your risk level
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Current beta bar */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>
                      <span>Current</span>
                      <b style={{ color: TEXT }}>
                        {math.portfolio_beta < 0.7 ? "Low" : math.portfolio_beta < 1.1 ? "Moderate" : math.portfolio_beta < 1.4 ? "Elevated" : "High"}
                        <span style={{ fontWeight: 400, color: TEXT_DIM, fontSize: 10, marginLeft: 4 }}>({math.portfolio_beta})</span>
                      </b>
                    </div>
                    <div style={{ height: 6, background: BORDER, borderRadius: 99 }}>
                      <div style={{ height: "100%", borderRadius: 99,
                        width: `${Math.min(100, math.portfolio_beta / 2 * 100)}%`,
                        background: math.portfolio_beta > 1.2 ? RED : math.portfolio_beta > 0.8 ? GOLD : GREEN,
                      }} />
                    </div>
                  </div>
                  <ArrowRight size={14} color={TEXT_DIM} style={{ flexShrink: 0 }} />
                  {/* Post-rebalance beta bar */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>
                      <span>After rebalance</span>
                      <b style={{ color: math.post_rebalance_beta < math.portfolio_beta ? GREEN
                                       : math.post_rebalance_beta > math.portfolio_beta ? RED : TEXT }}>
                        {math.post_rebalance_beta < 0.7 ? "Low" : math.post_rebalance_beta < 1.1 ? "Moderate" : math.post_rebalance_beta < 1.4 ? "Elevated" : "High"}
                        <span style={{ fontWeight: 400, color: TEXT_DIM, fontSize: 10, marginLeft: 4 }}>({math.post_rebalance_beta})</span>
                        {" "}
                        <span style={{ fontWeight: 400, fontSize: 10 }}>
                          {math.post_rebalance_beta < math.portfolio_beta ? "↓ less volatile"
                         : math.post_rebalance_beta > math.portfolio_beta ? "↑ more volatile" : "unchanged"}
                        </span>
                      </b>
                    </div>
                    <div style={{ height: 6, background: BORDER, borderRadius: 99 }}>
                      <div style={{ height: "100%", borderRadius: 99,
                        width: `${Math.min(100, math.post_rebalance_beta / 2 * 100)}%`,
                        background: math.post_rebalance_beta > 1.2 ? RED : math.post_rebalance_beta > 0.8 ? GOLD : GREEN,
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Stats row */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: TEXT_DIM }}>
                T-bill base rate <b style={{ color: TEXT }}>{(math.risk_free_rate * 100).toFixed(2)}%</b>
              </span>
              <span style={{ fontSize: 12, color: TEXT_DIM }}>
                Est. annual return <b style={{ color: TEXT }}>
                  {(math.portfolio_expected_annual * 100).toFixed(1)}%
                </b>
              </span>
              {math.return_gap && (
                <span style={{ fontSize: 12, color: TEXT_DIM }}>
                  Goal <b style={{
                    color: math.return_gap === "achievable" ? GREEN
                         : math.return_gap === "high" ? "#B45309" : RED,
                  }}>
                    {math.return_gap === "achievable" ? "On track"
                   : math.return_gap === "high" ? "Ambitious" : "Unrealistic"}
                  </b>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Before / After value */}
      {before.total_value > 0 && (
        <div style={{ ...glass, padding: "14px 18px", marginBottom: 16, borderRadius: 12,
                      display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10.5, color: TEXT_DIM, marginBottom: 2, textTransform: "uppercase",
                          letterSpacing: "0.06em" }}>Before</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
              {fmt$(before.total_value)}
            </div>
          </div>
          <ArrowRight size={18} color={TEXT_DIM} />
          <div>
            <div style={{ fontSize: 10.5, color: TEXT_DIM, marginBottom: 2, textTransform: "uppercase",
                          letterSpacing: "0.06em" }}>After rebalance</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONT_SERIF,
                          color: after.total_value >= before.total_value ? GREEN : RED }}>
              {fmt$(after.total_value)}
            </div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11.5, color: TEXT_DIM }}>
            {trades.length} trade{trades.length !== 1 ? "s" : ""} suggested
          </div>
        </div>
      )}

      {/* Trade plan — only shown when it's safe to act */}
      {verdict === "do_not_proceed" ? (
        <div style={{ marginBottom: 16 }}>
          {/* Opportunities still surfaced */}
          {flags.filter(f => f.type === "opportunity").length > 0 && (
            <div style={{ ...glass, padding: "14px 18px", borderRadius: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: GREEN, marginBottom: 8 }}>
                Things to watch
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {flags.filter(f => f.type === "opportunity").map((f, i) => (
                  <div key={i} style={{ padding: "8px 12px", borderRadius: 8,
                    background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`,
                    fontSize: 12.5, color: GREEN, lineHeight: 1.5 }}>
                    {f.message}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Simulated trade plan */}
          {trades.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: TEXT_DIM, marginBottom: 10 }}>
                Simulated Plan — {sells.length} sell{sells.length !== 1 ? "s" : ""}, {buys.length} buy{buys.length !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
                            alignItems: "start", opacity: 0.65 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, letterSpacing: "0.07em",
                                textTransform: "uppercase", marginBottom: 8 }}>Sells</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8,
                                maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
                    {sells.length > 0
                      ? sells.map((t, i) => <TradeCard key={i} trade={t} />)
                      : <div style={{ fontSize: 12.5, color: TEXT_DIM, padding: "10px 0" }}>No sells</div>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, letterSpacing: "0.07em",
                                textTransform: "uppercase", marginBottom: 8 }}>Buys</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8,
                                maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
                    {buys.length > 0
                      ? buys.map((t, i) => <TradeCard key={i} trade={t} />)
                      : <div style={{ fontSize: 12.5, color: TEXT_DIM, padding: "10px 0" }}>No buys</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {verdict === "proceed_with_caution" && (flags.length > 0 || violations.length > 0) && (
            <div style={{ ...glass, padding: "12px 16px", marginBottom: 12, borderRadius: 10,
                          background: "#FFFBEB", border: "1px solid #FDE68A",
                          fontSize: 12.5, color: "#92400E", lineHeight: 1.55 }}>
              <b>Review before trading:</b>{" "}
              {[...violations, ...flags.filter(f => f.type === "conflict" || f.type === "caution")]
                .map(x => x.message).join(" · ")}
            </div>
          )}
          {trades.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: TEXT_DIM, marginBottom: 10 }}>
                Trade Plan — {sells.length} sell{sells.length !== 1 ? "s" : ""}, {buys.length} buy{buys.length !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, letterSpacing: "0.07em",
                                textTransform: "uppercase", marginBottom: 8 }}>Sells</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8,
                                maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
                    {sells.length > 0
                      ? sells.map((t, i) => <TradeCard key={i} trade={t} />)
                      : <div style={{ fontSize: 12.5, color: TEXT_DIM, padding: "10px 0" }}>No sells</div>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, letterSpacing: "0.07em",
                                textTransform: "uppercase", marginBottom: 8 }}>Buys</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8,
                                maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
                    {buys.length > 0
                      ? buys.map((t, i) => <TradeCard key={i} trade={t} />)
                      : <div style={{ fontSize: 12.5, color: TEXT_DIM, padding: "10px 0" }}>No buys</div>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...glass, padding: "16px 18px", marginBottom: 16, borderRadius: 12,
                          color: TEXT_DIM, fontSize: 13, textAlign: "center" }}>
              No specific trades suggested — your portfolio is already close to target allocation.
            </div>
          )}
        </>
      )}

      {/* Allocation gaps (collapsible) */}
      {gapRows.length > 0 && (
        <div style={{ ...glass, padding: "14px 18px", marginBottom: 12, borderRadius: 12 }}>
          <button onClick={() => setShowGaps(!showGaps)} type="button" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                           textTransform: "uppercase", color: TEXT_DIM }}>
              Allocation Shift ({gapRows.length} buckets)
            </span>
            <span style={{ fontSize: 11, color: TEXT_DIM }}>{showGaps ? "Hide" : "Show"}</span>
          </button>
          {showGaps && (
            <div style={{ marginTop: 14 }}>
              {gapRows.map(([b, g]) => (
                <AllocationRow key={b}
                  label={g.label} current={g.current_pct}
                  target={g.target_pct} gap={g.gap_pct} />
              ))}
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: TEXT_DIM }}>
                <span><span style={{ display: "inline-block", width: 10, height: 6,
                                     background: TEXT_DIM, opacity: 0.4, borderRadius: 2, marginRight: 4 }} />Current</span>
                <span><span style={{ display: "inline-block", width: 10, height: 6,
                                     background: GREEN, opacity: 0.7, borderRadius: 2, marginRight: 4 }} />Target</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main screen ───────────────────────────────────────────────── */
export default function AskFolioScreen({ portfolio, prices, onNavigate, initialResult = null }) {
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(initialResult);
  const [error,   setError]   = useState(null);
  const textRef = useRef(null);

  useEffect(() => {
    if (!result) setTimeout(() => textRef.current?.focus(), 100);
  }, [result]);

  const submit = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, portfolio, prices }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResult(data);
    } catch (e) {
      setError(e.message || "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  // ── Result view ──────────────────────────────────────────────────
  if (result) {
    return (
      <div style={{ background: BG, minHeight: "100vh", padding: "32px 48px" }}>
        <ResultPanel result={result} onReset={() => setResult(null)} />
        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button onClick={() => onNavigate("history")} type="button" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12.5, color: TEXT_DIM, background: "none", border: "none",
            cursor: "pointer",
          }}>
            <History size={13} />
            View all my scenarios
          </button>
        </div>
      </div>
    );
  }

  // ── Input view ───────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "48px 56px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                        textTransform: "uppercase", color: TEXT_DIM, marginBottom: 8 }}>
            Ask Meridian
          </div>
          <h1 style={{ margin: "0 0 10px", fontSize: 30, fontWeight: 700,
                       letterSpacing: "-0.02em", color: TEXT, fontFamily: FONT_SERIF }}>
            What-If Scenario Planner
            <InfoTip title="Ask Meridian">
              Describe any market situation in plain English. Meridian simulates
              the impact on your portfolio, produces a full rebalance plan, and
              gives a verdict: proceed, proceed with caution, or do not proceed.
            </InfoTip>
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_DIM, lineHeight: 1.6 }}>
            Describe any scenario in plain English. Meridian will run the math and show you
            exactly what to buy and sell to rebalance your portfolio.
          </p>
        </div>

        {/* Text box */}
        <div style={{
          ...glass, borderRadius: 14,
          padding: "16px 16px 12px",
          marginBottom: 16,
          border: `1.5px solid ${BORDER}`,
          transition: "border-color 0.2s",
        }}
          onFocusCapture={(e) => e.currentTarget.style.borderColor = BORDER_MED}
          onBlurCapture={(e) => e.currentTarget.style.borderColor = BORDER}
        >
          <textarea
            ref={textRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder="e.g. What if the market crashes? I want $25k in 18 months. I'm retiring in 3 years..."
            rows={4}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "transparent", border: "none", outline: "none",
              color: TEXT, fontSize: 14.5, fontFamily: "inherit",
              resize: "none", lineHeight: 1.6,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
              Enter to run · Shift+Enter for new line
            </span>
            <button
              onClick={() => submit()}
              disabled={!input.trim() || loading}
              type="button"
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 20px", borderRadius: 9,
                background: input.trim() && !loading ? TEXT : SURFACE_2,
                border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
                color: input.trim() && !loading ? BG : TEXT_DIM,
                fontSize: 13.5, fontWeight: 600, transition: "background 0.15s",
              }}
            >
              {loading
                ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Analysing…</>
                : <><Send size={14} /> Run Analysis</>}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 16,
            background: RED_BG, border: `1px solid ${RED_BORDER}`,
            color: RED, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Starter prompts */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                        textTransform: "uppercase", color: TEXT_DIM, marginBottom: 10 }}>
            Try asking
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {STARTERS.map((s, i) => (
              <button key={i} type="button" onClick={() => submit(s)} style={{
                padding: "8px 14px", borderRadius: 99,
                border: `1px solid ${BORDER}`,
                background: SURFACE, color: TEXT_SEC,
                fontSize: 12.5, cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = BORDER_MED;
                e.currentTarget.style.background = SURFACE_2;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = BORDER;
                e.currentTarget.style.background = SURFACE;
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* History link */}
        <button onClick={() => onNavigate("history")} type="button" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12.5, color: TEXT_DIM, background: "none", border: "none",
          cursor: "pointer",
        }}>
          <History size={13} />
          View my past scenarios
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
