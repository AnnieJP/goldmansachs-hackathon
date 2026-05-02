import { useState, useEffect } from "react";
import {
  SURFACE, SURFACE_2, BG, TEXT, TEXT_DIM, TEXT_SEC,
  BORDER, BORDER_MED,
  GREEN, GREEN_BG, GREEN_BORDER,
  RED, RED_BG, RED_BORDER,
  FONT_SERIF, glass,
  fmt$,
} from "../theme.js";
import { apiFetch } from "../api.js";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
         ShieldAlert, ArrowRight, MessageSquare } from "lucide-react";

const VERDICT_CONFIG = {
  proceed:              { color: GREEN,    bg: GREEN_BG,  border: GREEN_BORDER, Icon: CheckCircle2,  label: "Proceed"              },
  proceed_with_caution: { color: "#B45309", bg: "#FEF3C7", border: "#FDE68A",  Icon: AlertTriangle, label: "Proceed with Caution" },
  do_not_proceed:       { color: RED,      bg: RED_BG,    border: RED_BORDER,  Icon: ShieldAlert,   label: "Do Not Proceed"       },
};

function VerdictChip({ verdict }) {
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.proceed;
  const { Icon } = cfg;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.color, fontSize: 11.5, fontWeight: 700,
    }}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}

function TradeRow({ trade }) {
  const isBuy = trade.action === "buy";
  const color = isBuy ? GREEN : RED;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 0", borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{
        flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "2px 8px",
        borderRadius: 99, color,
        background: isBuy ? GREEN_BG : RED_BG,
        border: `1px solid ${isBuy ? GREEN_BORDER : RED_BORDER}`,
      }}>
        {isBuy ? "BUY" : "SELL"}
      </span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF,
                       marginRight: 6 }}>{trade.ticker}</span>
        <span style={{ fontSize: 12, color: TEXT_DIM }}>
          {trade.shares} share{trade.shares !== 1 ? "s" : ""} · {fmt$(trade.value)}
        </span>
        <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 2, lineHeight: 1.4 }}>
          {trade.reason}
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, isExpanded, onToggle }) {
  const rebalance = scenario.rebalance || {};
  const trades    = rebalance.trades   || [];
  const flags     = scenario.flags     || [];
  const sells     = trades.filter((t) => t.action === "sell");
  const buys      = trades.filter((t) => t.action === "buy");
  const date      = new Date(scenario.timestamp + "Z");
  const dateStr   = date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div style={{ ...glass, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 14, width: "100%",
          padding: "16px 18px", background: "none", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT,
                        marginBottom: 5, lineHeight: 1.4 }}>
            "{scenario.scenario_text}"
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <VerdictChip verdict={scenario.verdict} />
            <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
              {sells.length} sell{sells.length !== 1 ? "s" : ""} · {buys.length} buy{buys.length !== 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: 11.5, color: TEXT_DIM }}>{dateStr}</span>
          </div>
        </div>
        {isExpanded
          ? <ChevronUp size={16} color={TEXT_DIM} />
          : <ChevronDown size={16} color={TEXT_DIM} />}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${BORDER}` }}>
          {/* Reasoning */}
          {(scenario.reasoning || scenario.narrative) && (
            <p style={{ margin: "14px 0 12px", fontSize: 13, color: TEXT_SEC, lineHeight: 1.6 }}>
              {scenario.reasoning || scenario.narrative}
            </p>
          )}

          {/* Before / After */}
          {rebalance.before?.total_value > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              padding: "10px 14px", borderRadius: 8, background: SURFACE_2,
              marginBottom: 14,
            }}>
              <div>
                <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: "uppercase",
                              letterSpacing: "0.06em", marginBottom: 2 }}>Before</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
                  {fmt$(rebalance.before.total_value)}
                </div>
              </div>
              <ArrowRight size={14} color={TEXT_DIM} />
              <div>
                <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: "uppercase",
                              letterSpacing: "0.06em", marginBottom: 2 }}>After rebalance</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: FONT_SERIF,
                              color: rebalance.after?.total_value >= rebalance.before.total_value
                                ? GREEN : RED }}>
                  {fmt$(rebalance.after?.total_value || 0)}
                </div>
              </div>
            </div>
          )}

          {/* Trades */}
          {trades.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: TEXT_DIM, marginBottom: 6 }}>
                Trade Plan
              </div>
              {trades.map((t, i) => <TradeRow key={i} trade={t} />)}
            </div>
          )}

          {/* Flags */}
          {flags.filter((f) => ["conflict", "caution"].includes(f.type)).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: TEXT_DIM, marginBottom: 6 }}>
                Risk Signals
              </div>
              {flags.filter((f) => ["conflict", "caution"].includes(f.type)).slice(0, 3).map((f, i) => (
                <div key={i} style={{
                  padding: "7px 11px", borderRadius: 7, marginBottom: 5, fontSize: 12,
                  background: f.type === "conflict" ? RED_BG : "#FFFBEB",
                  border: `1px solid ${f.type === "conflict" ? RED_BORDER : "#FDE68A"}`,
                  color: f.type === "conflict" ? RED : "#92400E",
                }}>
                  {f.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScenariosHistoryScreen({ onNavigate }) {
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);

  useEffect(() => {
    apiFetch("/api/user-scenarios")
      .then((r) => r.json())
      .then((d) => setScenarios(d.scenarios || []))
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "32px 36px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                          textTransform: "uppercase", color: TEXT_DIM, marginBottom: 6 }}>
              Ask Folio
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700,
                         letterSpacing: "-0.02em", color: TEXT, fontFamily: FONT_SERIF }}>
              My Scenarios
            </h1>
          </div>
          <button
            onClick={() => onNavigate("askfolio")}
            type="button"
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 9,
              background: TEXT, border: "none", cursor: "pointer",
              color: BG, fontSize: 13, fontWeight: 600,
            }}
          >
            <MessageSquare size={14} />
            New scenario
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: TEXT_DIM, fontSize: 14 }}>
            Loading…
          </div>
        )}

        {!loading && scenarios.length === 0 && (
          <div style={{ ...glass, padding: "48px 36px", borderRadius: 14, textAlign: "center" }}>
            <MessageSquare size={32} color={TEXT_DIM} style={{ marginBottom: 14 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
              No scenarios yet
            </div>
            <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 20 }}>
              Run your first scenario to see how your portfolio holds up.
            </div>
            <button
              onClick={() => onNavigate("askfolio")}
              type="button"
              style={{
                padding: "10px 22px", borderRadius: 9,
                background: TEXT, border: "none", cursor: "pointer",
                color: BG, fontSize: 13, fontWeight: 600,
              }}
            >
              Ask Folio something
            </button>
          </div>
        )}

        {!loading && scenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            isExpanded={expanded === s.id}
            onToggle={() => toggle(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
