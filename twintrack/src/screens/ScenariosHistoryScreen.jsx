import { useState, useEffect } from "react";
import {
  SURFACE, BG, TEXT, TEXT_DIM,
  BORDER,
  GREEN, GREEN_BG, GREEN_BORDER,
  RED, RED_BG, RED_BORDER,
  FONT_SERIF, glass,
} from "../theme.js";
import { apiFetch } from "../api.js";
import { CheckCircle2, AlertTriangle, ShieldAlert, MessageSquare, ChevronRight, Trash2 } from "lucide-react";

const VERDICT_CONFIG = {
  proceed:              { color: GREEN,    bg: GREEN_BG,  border: GREEN_BORDER, Icon: CheckCircle2,  label: "Safe to Rebalance"   },
  proceed_with_caution: { color: "#B45309", bg: "#FEF3C7", border: "#FDE68A",  Icon: AlertTriangle, label: "Rebalance with Care" },
  do_not_proceed:       { color: RED,      bg: RED_BG,    border: RED_BORDER,  Icon: ShieldAlert,   label: "Don't Rebalance Yet" },
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

export default function ScenariosHistoryScreen({ onNavigate }) {
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [deleting,  setDeleting]  = useState(null);

  useEffect(() => {
    apiFetch("/api/user-scenarios")
      .then((r) => r.json())
      .then((d) => setScenarios(d.scenarios || []))
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false));
  }, []);

  const deleteScenario = async (e, id) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await apiFetch(`/api/user-scenarios/${id}`, { method: "DELETE" });
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    } catch (_) {}
    setDeleting(null);
  };

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "32px 36px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                          textTransform: "uppercase", color: TEXT_DIM, marginBottom: 6 }}>
              Ask Meridian
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
              Ask Meridian something
            </button>
          </div>
        )}

        {!loading && scenarios.length > 0 && (
          <div style={{ ...glass, borderRadius: 14, overflow: "hidden" }}>
            {scenarios.map((s, i) => {
              const date = new Date(s.timestamp + "Z");
              const dateStr = date.toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              });
              const sells = (s.rebalance?.trades || []).filter(t => t.action === "sell").length;
              const buys  = (s.rebalance?.trades || []).filter(t => t.action === "buy").length;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onNavigate("askfolio", s)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%",
                    padding: "16px 20px", background: "none", border: "none",
                    borderBottom: i < scenarios.length - 1 ? `1px solid ${BORDER}` : "none",
                    cursor: "pointer", textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = SURFACE}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT,
                                  marginBottom: 6, lineHeight: 1.4,
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      "{s.scenario_text}"
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <VerdictChip verdict={s.verdict} />
                      <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
                        {sells} sell{sells !== 1 ? "s" : ""} · {buys} buy{buys !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: 11.5, color: TEXT_DIM }}>{dateStr}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => deleteScenario(e, s.id)}
                      disabled={deleting === s.id}
                      style={{
                        padding: "5px 7px", borderRadius: 6, border: `1px solid ${BORDER}`,
                        background: "none", cursor: "pointer", color: TEXT_DIM,
                        opacity: deleting === s.id ? 0.4 : 1,
                        transition: "color 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = RED; e.currentTarget.style.borderColor = RED_BORDER; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_DIM; e.currentTarget.style.borderColor = BORDER; }}
                    >
                      <Trash2 size={13} />
                    </button>
                    <ChevronRight size={15} color={TEXT_DIM} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
