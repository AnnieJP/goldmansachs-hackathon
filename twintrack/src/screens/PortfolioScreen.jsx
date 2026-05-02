import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Upload, Pencil, Trash2, TrendingUp, TrendingDown, DollarSign, Layers, Wallet } from "lucide-react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, SURFACE_2, SURFACE_3, BG, TEXT, TEXT_SEC, TEXT_DIM,
         GREEN, GREEN_BG, GREEN_BORDER, RED, RED_BG, RED_BORDER,
         FONT_SERIF, HOLDING_COLORS, fmt$, fmtPct } from "../theme.js";
import { apiFetch } from "../api.js";

/* ─── Industry mapping (from master) ───────────────────────────── */
const INDUSTRY_MAPPING = {
  "AAPL":"Technology","MSFT":"Technology","GOOGL":"Technology","META":"Technology",
  "NVDA":"Technology","TSLA":"Technology","AMD":"Technology","INTC":"Technology",
  "CSCO":"Technology","ORCL":"Technology","CRM":"Technology","ADBE":"Technology",
  "JNJ":"Healthcare","UNH":"Healthcare","PFE":"Healthcare","ABBV":"Healthcare",
  "DHR":"Healthcare","ABT":"Healthcare","MRK":"Healthcare",
  "JPM":"Finance","BAC":"Finance","WFC":"Finance","GS":"Finance",
  "MS":"Finance","C":"Finance","AXP":"Finance","BLK":"Finance",
  "AMZN":"Consumer","HD":"Consumer","MCD":"Consumer","NKE":"Consumer",
  "LOW":"Consumer","TGT":"Consumer","SBUX":"Consumer",
  "XOM":"Energy","CVX":"Energy","COP":"Energy","EOG":"Energy",
  "SLB":"Energy","PSX":"Energy","VLO":"Energy","MPC":"Energy",
  "BA":"Industrial","CAT":"Industrial","GE":"Industrial","MMM":"Industrial",
  "HON":"Industrial","UPS":"Industrial","RTX":"Industrial","LMT":"Industrial",
  "NEE":"Utilities","DUK":"Utilities","SO":"Utilities","AEP":"Utilities",
  "EXC":"Utilities","SRE":"Utilities","PEG":"Utilities","WEC":"Utilities",
  "AMT":"Real Estate","PLD":"Real Estate","CCI":"Real Estate","EQIX":"Real Estate",
  "PSA":"Real Estate","SPG":"Real Estate","O":"Real Estate","DLR":"Real Estate",
  "LIN":"Materials","APD":"Materials","ECL":"Materials","DOW":"Materials",
  "NEM":"Materials","FCX":"Materials","BHP":"Materials",
  "NFLX":"Communication","DIS":"Communication","CMCSA":"Communication",
  "T":"Communication","VZ":"Communication",
  "PG":"Consumer Staples","KO":"Consumer Staples","PEP":"Consumer Staples",
  "WMT":"Consumer Staples","COST":"Consumer Staples","CL":"Consumer Staples",
  "SPY":"Broad Market","VOO":"Broad Market","VTI":"Broad Market","IVV":"Broad Market",
  "QQQ":"Technology","VGT":"Technology","XLK":"Technology",
  "BND":"Bonds","AGG":"Bonds","TLT":"Bonds","VBMFX":"Bonds",
  "GLD":"Commodities","SLV":"Commodities","USO":"Commodities",
};
export function getIndustry(symbol) {
  return INDUSTRY_MAPPING[symbol?.toUpperCase()] || "Other";
}

/* ─── Recharts donut chart ──────────────────────────────────────── */
function AllocationChart({ holdings, cash, totalValue }) {
  const data = [
    ...holdings.map((h, i) => ({
      name: h.symbol, value: h.currentValue,
      pct: h.currentPct, color: HOLDING_COLORS[i % HOLDING_COLORS.length],
    })),
    ...(cash > 0 ? [{ name: "Cash", value: cash, pct: totalValue > 0 ? cash / totalValue * 100 : 0, color: "#64748B" }] : []),
  ];

  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: TEXT_DIM, marginBottom: 16,
                    textTransform: "uppercase", letterSpacing: "0.06em" }}>Allocation</div>
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
               paddingAngle={2} dataKey="value" strokeWidth={0}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            formatter={(v, name) => [fmt$(v), name]}
            contentStyle={{ background: SURFACE_2, border: `1px solid ${BORDER_MED}`,
                            borderRadius: 10, fontSize: 12, color: TEXT }}
            itemStyle={{ color: TEXT }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 4 }}>
        {data.map((d) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8,
                                     marginBottom: 7, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: d.color }} />
            <span style={{ flex: 1, color: TEXT_DIM, overflow: "hidden",
                           textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
            <span style={{ fontWeight: 600, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
              {d.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Shared modal input style ──────────────────────────────────── */
const inputStyle = {
  width: "100%", padding: "10px 13px", borderRadius: 9, border: `1px solid ${BORDER}`,
  background: BG, color: TEXT, fontSize: 13.5, boxSizing: "border-box", outline: "none",
};
const goldBtn  = { flex: 1, padding: "11px 0", borderRadius: 9, border: "none",
                   background: "linear-gradient(135deg, #F59E0B, #D97706)", color: BG,
                   fontWeight: 700, fontSize: 13.5, cursor: "pointer" };
const ghostBtn = { flex: 1, padding: "11px 0", borderRadius: 9, border: `1px solid ${BORDER}`,
                   background: "transparent", color: TEXT_DIM, fontSize: 13.5, cursor: "pointer" };

/* ─── Type badge ────────────────────────────────────────────────── */
const TYPE_COLOR = { stock: "#F59E0B", etf: "#10B981", bond: "#6366F1", fund: "#EC4899" };
function TypeBadge({ type }) {
  const c = TYPE_COLOR[type] || "#64748B";
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 6, fontSize: 10.5,
                   fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                   background: c + "18", color: c, border: `1px solid ${c}28` }}>
      {type}
    </span>
  );
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
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: TEXT_DIM,
                      marginBottom: 6, letterSpacing: "0.03em" }}>{label}</label>
      {key === "type" ? (
        <select value={form[key]} onChange={(e) => set(key, e.target.value)}
                style={{ ...inputStyle, appearance: "none" }}>
          {TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)}
               placeholder={hint} style={inputStyle} required={key !== "target_pct"} />
      )}
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        background: SURFACE, border: `1px solid ${BORDER_MED}`, borderRadius: 18,
        padding: "28px 28px", width: 400, maxWidth: "90vw",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
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
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
            <button type="submit" style={goldBtn}>Save holding</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── PDF import modal ─────────────────────────────────────────── */

function ImportModal({ onImport, onClose }) {
  const [stage,    setStage]    = useState("idle");
  const [parsed,   setParsed]   = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error,    setError]    = useState(null);
  const [filename, setFilename] = useState("");

  const handleFile = (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) { setError("Please select a PDF file."); return; }
    setFilename(file.name); setError(null); setStage("parsing");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const b64 = e.target.result.split(",")[1];
        const res = await fetch("/api/portfolio/import-pdf", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_b64: b64 }),
        });
        if (!res.ok) { setError(`Server error ${res.status}`); setStage("idle"); return; }
        const data = await res.json();
        if (data.error) { setError(data.error); setStage("idle"); return; }
        if (!data.holdings?.length) { setError("No holdings found in this PDF."); setStage("idle"); return; }
        setParsed(data.holdings);
        setSelected(new Set(data.holdings.map((h) => h.id)));
        setStage("preview");
      } catch (err) { setError(err.message); setStage("idle"); }
    };
    reader.readAsDataURL(file);
  };

  const toggleAll = () => setSelected(selected.size === parsed.length ? new Set() : new Set(parsed.map((h) => h.id)));
  const toggle    = (id) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };
  const confirmImport = async () => {
    setStage("importing");
    for (const h of parsed.filter((h) => selected.has(h.id))) {
      await fetch("/api/portfolio/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(h) });
    }
    setStage("done"); onImport();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER_MED}`, borderRadius: 18,
                    width: "100%", maxWidth: 660, maxHeight: "85vh", display: "flex",
                    flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "22px 24px 16px", borderBottom: `1px solid ${BORDER}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Import from Brokerage PDF</div>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>Upload an account statement or holdings export</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: TEXT_DIM, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {(stage === "idle" || stage === "parsing") && (
            <label style={{ display: "block", border: `2px dashed ${BORDER_MED}`, borderRadius: 14,
                            padding: "36px 20px", textAlign: "center", cursor: "pointer" }}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
              <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
              <Upload size={28} color={TEXT_DIM} style={{ margin: "0 auto 12px", display: "block" }} />
              {stage === "parsing"
                ? <div style={{ color: GOLD, fontWeight: 600, fontSize: 14 }}>Parsing {filename}…</div>
                : <>
                    <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>Drop your PDF here, or click to browse</div>
                    <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6 }}>Supports account statements from most brokerages</div>
                  </>}
            </label>
          )}
          {error && <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9,
                                  background: RED_BG, border: `1px solid ${RED_BORDER}`,
                                  fontSize: 13, color: "#FC8181" }}>{error}</div>}
          {stage === "preview" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: TEXT }}>Found <b style={{ color: GOLD }}>{parsed.length}</b> holdings in <b>{filename}</b></div>
                <button onClick={toggleAll} style={{ fontSize: 11.5, color: TEXT_DIM, background: "none", border: "none", cursor: "pointer" }}>
                  {selected.size === parsed.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ background: BG }}>
                    <th style={{ padding: "8px 12px", width: 28 }}><input type="checkbox" checked={selected.size === parsed.length} onChange={toggleAll} /></th>
                    {["Ticker","Name","Type","Shares","Avg Cost"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: TEXT_DIM, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {parsed.map((h) => (
                      <tr key={h.id} style={{ borderTop: `1px solid ${BORDER}`, opacity: selected.has(h.id) ? 1 : 0.4 }}>
                        <td style={{ padding: "8px 12px" }}><input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} /></td>
                        <td style={{ padding: "8px 12px", fontWeight: 700 }}>{h.symbol}</td>
                        <td style={{ padding: "8px 12px", color: TEXT_DIM, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
                        <td style={{ padding: "8px 12px" }}><TypeBadge type={h.type} /></td>
                        <td style={{ padding: "8px 12px" }}>{h.shares}</td>
                        <td style={{ padding: "8px 12px" }}>{fmt$(h.avg_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {stage === "done" && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Import complete</div>
              <div style={{ fontSize: 13, color: TEXT_DIM, marginTop: 6 }}>{selected.size} holdings added.</div>
            </div>
          )}
        </div>
        {stage === "preview" && (
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...ghostBtn, flex: "unset", padding: "10px 20px" }}>Cancel</button>
            <button onClick={confirmImport} disabled={selected.size === 0}
                    style={{ ...goldBtn, flex: "unset", padding: "10px 24px", opacity: selected.size === 0 ? 0.4 : 1 }}>
              Import {selected.size} holding{selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        )}
        {stage === "done" && (
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...goldBtn, flex: "unset", padding: "10px 24px" }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main screen ───────────────────────────────────────────────── */
const TABS = ["all", "stock", "etf", "bond", "fund"];

export default function PortfolioScreen({ portfolio, prices, enriched, onPortfolioChange }) {
  const [tab,       setTab]       = useState("all");
  const [modal,     setModal]     = useState(null);
  const [importing, setImporting] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const holdings   = enriched?.holdings   || [];
  const filtered   = tab === "all" ? holdings : holdings.filter((h) => h.type === tab);
  const totalValue = enriched?.totalValue || 0;
  const gainLoss   = enriched?.gainLoss   || 0;
  const isPos      = gainLoss >= 0;

  const saveHolding = async (data) => {
    setSaving(true);
    await apiFetch(data.id ? "/api/portfolio/update" : "/api/portfolio/add", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    await onPortfolioChange();
    setSaving(false); setModal(null);
  };

  const removeHolding = async (id) => {
    if (!confirm("Remove this holding?")) return;
    await apiFetch("/api/portfolio/remove", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    await onPortfolioChange();
  };

  const statCards = [
    { label: "Total Value",    value: fmt$(totalValue),                     Icon: DollarSign,  color: "#F59E0B" },
    { label: "All-time Gain",  value: `${isPos ? "+" : ""}${fmt$(Math.abs(gainLoss))}`,
      sub: fmtPct(enriched?.gainLossPct || 0),
      Icon: isPos ? TrendingUp : TrendingDown, color: isPos ? GREEN : RED },
    { label: "Positions",      value: holdings.length,                      Icon: Layers,      color: "#6366F1" },
    { label: "Cash",           value: fmt$(enriched?.cash || 0),            Icon: Wallet,      color: "#14B8A6" },
  ];

  return (
    <div style={{ padding: "32px 36px", color: TEXT }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>My Holdings</h1>
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>Track everything you own with live prices.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setImporting(true)} type="button" style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 16px", borderRadius: 9, border: `1px solid ${BORDER}`,
            background: "transparent", color: TEXT_DIM, fontWeight: 500, fontSize: 13,
            cursor: "pointer", transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = BORDER_MED; e.currentTarget.style.color = TEXT; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_DIM; }}>
            <Upload size={14} /> Import PDF
          </button>
          <button onClick={() => setModal("add")} type="button" style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            color: BG, fontWeight: 700, fontSize: 13, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(245,158,11,0.3)",
          }}>
            <Plus size={14} /> Add holding
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {statCards.map(({ label, value, sub, Icon, color }) => (
          <div key={label} style={{
            background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: TEXT_DIM, fontWeight: 500 }}>{label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: color + "18",
                            display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={14} color={color} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: TEXT }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: isPos ? GREEN : RED, marginTop: 4, fontWeight: 500 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 20, alignItems: "start" }}>
        <div>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16,
                        padding: 4, background: SURFACE, borderRadius: 10,
                        border: `1px solid ${BORDER}`, width: "fit-content" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} type="button" style={{
                padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 12.5, fontWeight: tab === t ? 600 : 400,
                background: tab === t ? GOLD_BG : "transparent",
                color: tab === t ? GOLD : TEXT_DIM,
                transition: "all 0.15s",
              }}>{t === "all" ? "All" : t.toUpperCase()}</button>
            ))}
          </div>

          {/* Holdings table */}
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Asset", "Type", "Shares", "Avg Cost", "Price", "Value", "Gain / Loss", "Slice", ""].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11,
                                         fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase",
                                         letterSpacing: "0.06em", whiteSpace: "nowrap",
                                         borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 36, textAlign: "center", color: TEXT_DIM, fontSize: 13 }}>
                    No holdings in this category yet.
                  </td></tr>
                )}
                {filtered.map((h, i) => {
                  const gl    = h.gainLoss    || 0;
                  const glPct = h.gainLossPct || 0;
                  const glPos = gl >= 0;
                  return (
                    <tr key={h.id} style={{
                      borderTop: `1px solid ${BORDER}`,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.025)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.symbol}</div>
                        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2, maxWidth: 150,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.name}
                        </div>
                      </td>
                      <td style={{ padding: "13px 16px" }}><TypeBadge type={h.type} /></td>
                      <td style={{ padding: "13px 16px", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{h.shares}</td>
                      <td style={{ padding: "13px 16px", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.avg_cost)}</td>
                      <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.currentPrice)}</td>
                      <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.currentValue)}</td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: glPos ? GREEN : RED,
                                      fontVariantNumeric: "tabular-nums" }}>
                          {glPos ? "+" : ""}{fmt$(gl)}
                        </div>
                        <div style={{ fontSize: 11, color: glPos ? GREEN : RED, opacity: 0.8, marginTop: 1 }}>
                          {fmtPct(glPct)}
                        </div>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>{h.currentPct?.toFixed(1)}%</div>
                        <div style={{ height: 4, borderRadius: 2, background: BORDER_MED, width: 56, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2,
                                        background: HOLDING_COLORS[holdings.indexOf(h) % HOLDING_COLORS.length],
                                        width: `${Math.min(100, h.currentPct || 0)}%` }} />
                        </div>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setModal(h)} type="button" style={{
                            padding: "5px 10px", borderRadius: 7, border: `1px solid ${BORDER}`,
                            background: "transparent", color: TEXT_DIM, cursor: "pointer", fontSize: 11.5,
                            display: "flex", alignItems: "center", gap: 4, transition: "border-color 0.15s",
                          }}>
                            <Pencil size={11} /> Edit
                          </button>
                          <button onClick={() => removeHolding(h.id)} type="button" style={{
                            padding: "5px 8px", borderRadius: 7,
                            border: `1px solid ${RED_BORDER}`,
                            background: "transparent", color: RED, cursor: "pointer", fontSize: 11.5,
                            display: "flex", alignItems: "center",
                          }}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Allocation chart */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 20px" }}>
          <AllocationChart holdings={holdings} cash={enriched?.cash || 0} totalValue={totalValue} />
        </div>
      </div>

      {importing && <ImportModal onImport={async () => { await onPortfolioChange(); }} onClose={() => setImporting(false)} />}
      {modal && <HoldingModal initial={modal === "add" ? null : modal} onSave={saveHolding} onClose={() => setModal(null)} />}
    </div>
  );
}
