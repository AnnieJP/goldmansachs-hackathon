import { useState, useEffect, useRef, useMemo } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, GOLD_LIGHT, ACCENT, ACCENT_DIM, ACCENT_SOFT,
         SURFACE, BG, TEXT, TEXT_DIM, HOLDING_COLORS, fmt$, fmtPct } from "../theme.js";
import { apiFetch } from "../api.js";

/* ─── Donut chart (canvas) ──────────────────────────────────────── */
function DonutChart({ slices, total }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !slices.length) return;
    const ctx  = canvas.getContext("2d");
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const cx = W / 2, cy = H / 2, outer = Math.min(W, H) * 0.44, inner = outer * 0.6;
    ctx.clearRect(0, 0, W, H);
    let angle = -Math.PI / 2;
    slices.forEach((s, i) => {
      const sweep = (s.pct / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outer, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = HOLDING_COLORS[i % HOLDING_COLORS.length];
      ctx.fill();
      angle += sweep;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = BG;
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = TEXT;
    ctx.font = `700 13px 'DM Sans','Segoe UI',sans-serif`;
    ctx.fillText("Total", cx, cy - 9);
    ctx.font = `800 15px 'DM Sans','Segoe UI',sans-serif`;
    ctx.fillText(fmt$(total), cx, cy + 10);
  }, [slices, total]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

/* ─── Add / Edit holding modal ──────────────────────────────────── */
const TYPES = ["stock", "etf", "bond", "fund"];
function HoldingModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    symbol: "", name: "", type: "stock", shares: "", avg_cost: "", target_pct: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    onSave({ ...form, shares: parseFloat(form.shares), avg_cost: parseFloat(form.avg_cost),
              target_pct: parseFloat(form.target_pct) || 0 });
  };
  const field = (label, key, type = "text", hint = "") => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, color: TEXT_DIM, marginBottom: 5,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {key === "type" ? (
        <select value={form[key]} onChange={(e) => set(key, e.target.value)} style={inputStyle}>
          {TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)}
               placeholder={hint} style={inputStyle} required={key !== "target_pct"} />
      )}
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 16,
                    padding: "28px 28px", width: 380, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 22px", fontSize: 17, fontWeight: 800, color: TEXT }}>
          {initial ? "Edit holding" : "Add a holding"}
        </h3>
        <form onSubmit={submit}>
          {field("Ticker symbol", "symbol", "text", "e.g. AAPL")}
          {field("Company / fund name", "name", "text", "e.g. Apple Inc.")}
          {field("Type", "type")}
          {field("Number of shares", "shares", "number", "e.g. 10")}
          {field("Price you paid per share ($)", "avg_cost", "number", "e.g. 150.00")}
          {field("Target % of portfolio (optional)", "target_pct", "number", "e.g. 15")}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
            <button type="submit" style={goldBtn}>Save holding</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${ACCENT_DIM}`,
  background: BG, color: TEXT, fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box",
};
const goldBtn   = { flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
                    background: GOLD, color: BG, fontWeight: 700, fontSize: 13.5,
                    cursor: "pointer", fontFamily: "inherit" };
const ghostBtn  = { flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${ACCENT_DIM}`,
                    background: "transparent", color: TEXT_DIM, fontSize: 13.5,
                    cursor: "pointer", fontFamily: "inherit" };

/* ─── Type badge ────────────────────────────────────────────────── */
const TYPE_COLOR = { stock: "#2A6496", etf: "#059669", bond: "#7C3AED", fund: "#EA580C" };
function TypeBadge({ type }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 10.5,
                   fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                   background: (TYPE_COLOR[type] || "#444") + "28",
                   color: TYPE_COLOR[type] || TEXT_DIM }}>
      {type}
    </span>
  );
}

/* ─── Main screen ───────────────────────────────────────────────── */
const TABS = ["all", "stock", "etf", "bond", "fund"];

export default function PortfolioScreen({ portfolio, prices, enriched, onPortfolioChange }) {
  const [tab,     setTab]     = useState("all");
  const [modal,   setModal]   = useState(null); // null | "add" | holding-object
  const [saving,  setSaving]  = useState(false);

  const holdings = enriched?.holdings || [];
  const filtered = tab === "all" ? holdings : holdings.filter((h) => h.type === tab);
  const totalValue = enriched?.totalValue || 0;
  const gainLoss   = enriched?.gainLoss   || 0;

  const donutSlices = useMemo(() =>
    holdings.map((h, i) => ({
      label: h.symbol,
      pct:   h.currentPct || 0,
      color: HOLDING_COLORS[i % HOLDING_COLORS.length],
    })), [holdings]);

  const saveHolding = async (data) => {
    setSaving(true);
    const endpoint = data.id ? "/api/portfolio/update" : "/api/portfolio/add";
    await apiFetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await onPortfolioChange();
    setSaving(false);
    setModal(null);
  };

  const removeHolding = async (id) => {
    if (!confirm("Remove this holding?")) return;
    await apiFetch("/api/portfolio/remove", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await onPortfolioChange();
  };

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: TEXT }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>My Holdings</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em" }}>{fmt$(totalValue)}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: gainLoss >= 0 ? "#34d399" : "#f87171" }}>
              {gainLoss >= 0 ? "▲" : "▼"} {fmt$(Math.abs(gainLoss))} ({fmtPct(enriched?.gainLossPct || 0)}) total gain
            </span>
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
            Includes {fmt$(enriched?.cash || 0)} cash · {holdings.length} position{holdings.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button onClick={() => setModal("add")} type="button"
                style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: GOLD,
                         color: BG, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
                         whiteSpace: "nowrap" }}>
          + Add holding
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 24, alignItems: "start" }}>
        <div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} type="button" style={{
                padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12.5, fontWeight: tab === t ? 700 : 400,
                background: tab === t ? GOLD_BG : "transparent",
                color: tab === t ? GOLD : TEXT_DIM,
                textTransform: "capitalize",
              }}>{t === "all" ? "All" : t.toUpperCase()}</button>
            ))}
          </div>

          {/* Holdings table */}
          <div style={{ border: `1px solid ${ACCENT_DIM}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: SURFACE }}>
                  {["Name", "Type", "Shares", "Avg cost", "Current price", "Value", "Gain / Loss", "Your slice", ""].map((h) => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11,
                                         fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase",
                                         letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: TEXT_DIM, fontSize: 13 }}>
                    No holdings in this category yet.
                  </td></tr>
                )}
                {filtered.map((h, i) => {
                  const gl = h.gainLoss || 0;
                  const glPct = h.gainLossPct || 0;
                  return (
                    <tr key={h.id} style={{ borderTop: `1px solid ${ACCENT_DIM}`,
                                            background: i % 2 === 0 ? "transparent" : "rgba(42,100,150,0.04)" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.symbol}</div>
                        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2, maxWidth: 160,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.name}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}><TypeBadge type={h.type} /></td>
                      <td style={{ padding: "12px 14px", fontSize: 13 }}>{h.shares}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13 }}>{fmt$(h.avg_cost)}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>{fmt$(h.currentPrice)}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700 }}>{fmt$(h.currentValue)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: gl >= 0 ? "#34d399" : "#f87171" }}>
                          {gl >= 0 ? "+" : ""}{fmt$(gl)}
                        </div>
                        <div style={{ fontSize: 11, color: gl >= 0 ? "#34d399" : "#f87171" }}>
                          {fmtPct(glPct)}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 12.5, color: TEXT_DIM }}>{h.currentPct?.toFixed(1)}%</div>
                        <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: ACCENT_DIM, width: 60, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2, background: HOLDING_COLORS[holdings.indexOf(h) % HOLDING_COLORS.length],
                                        width: `${Math.min(100, h.currentPct || 0)}%` }} />
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setModal(h)} type="button"
                                  style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${ACCENT_DIM}`,
                                           background: "transparent", color: TEXT_DIM, cursor: "pointer",
                                           fontSize: 11.5, fontFamily: "inherit" }}>Edit</button>
                          <button onClick={() => removeHolding(h.id)} type="button"
                                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #f8717130",
                                           background: "transparent", color: "#f87171", cursor: "pointer",
                                           fontSize: 11.5, fontFamily: "inherit" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Donut chart + legend */}
        <div>
          <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_DIM, marginBottom: 14,
                          textTransform: "uppercase", letterSpacing: "0.06em" }}>Allocation</div>
            <div style={{ height: 180 }}>
              <DonutChart slices={donutSlices} total={totalValue} />
            </div>
            <div style={{ marginTop: 16 }}>
              {holdings.map((h, i) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8,
                                         marginBottom: 7, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                                 background: HOLDING_COLORS[i % HOLDING_COLORS.length] }} />
                  <span style={{ flex: 1, color: TEXT_DIM, overflow: "hidden",
                                 textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.symbol}</span>
                  <span style={{ fontWeight: 600, color: TEXT }}>{h.currentPct?.toFixed(1)}%</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: "#888" }} />
                <span style={{ flex: 1, color: TEXT_DIM }}>Cash</span>
                <span style={{ fontWeight: 600, color: TEXT }}>{enriched?.cashPct?.toFixed(1) || 0}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <HoldingModal
          initial={modal === "add" ? null : modal}
          onSave={saveHolding}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
