import { useState, useEffect, useRef, useMemo } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED,
         SURFACE, SURFACE_2, BG, TEXT, TEXT_DIM,
         GREEN, RED, FONT_SERIF, HOLDING_COLORS, fmt$, fmtPct } from "../theme.js";
import { apiFetch } from "../api.js";

/* ─── Industry Mapping ──────────────────────────────────────────── */
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

/* ─── Canvas donut chart ────────────────────────────────────────── */
function DonutChart({ slices, total }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !slices.length) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const cx = W / 2, cy = H / 2;
    const outer = Math.min(W, H) * 0.42;
    const inner = outer * 0.65;
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
    ctx.font = `500 12px 'Playfair Display', Georgia, serif`;
    ctx.fillText("Total Value", cx, cy - 10);
    ctx.font = `700 15px 'Playfair Display', Georgia, serif`;
    ctx.fillText(fmt$(total), cx, cy + 10);
  }, [slices, total]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

/* ─── Add / Edit holding modal ──────────────────────────────────── */
const TYPES = ["stock", "etf", "bond", "fund"];

const inputStyle = {
  width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`,
  background: BG, color: TEXT, fontSize: 13.5, fontFamily: "inherit",
  boxSizing: "border-box",
};
const goldBtn  = { flex: 1, padding: "10px 0", border: "none",
                   background: GOLD, color: SURFACE, fontWeight: 700,
                   fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" };
const ghostBtn = { flex: 1, padding: "10px 0", border: `1px solid ${BORDER}`,
                   background: "transparent", color: TEXT_DIM, fontSize: 13.5,
                   cursor: "pointer", fontFamily: "inherit" };

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
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.35)", zIndex: 100,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`,
                    boxShadow: "0 8px 40px rgba(10,22,40,0.12)",
                    padding: "28px 28px", width: 380, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 22px", fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
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

/* ─── Type badge ────────────────────────────────────────────────── */
const TYPE_COLOR = { stock: "#1E40AF", etf: "#047857", bond: "#7C3AED", fund: "#EA580C" };
function TypeBadge({ type }) {
  const color = TYPE_COLOR[type] || TEXT_DIM;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", fontSize: 10.5,
                   fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                   background: color + "18", color }}>
      {type}
    </span>
  );
}

/* ─── PDF import modal ──────────────────────────────────────────── */
export function ImportModal({ onImport, onClose }) {
  const [stage,    setStage]    = useState("idle");
  const [parsed,   setParsed]   = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error,    setError]    = useState(null);
  const [filename, setFilename] = useState("");

  const handleFile = (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file."); return;
    }
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
      } catch (err) {
        setError(`Could not reach backend (${err.message})`);
        setStage("idle");
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleAll = () =>
    setSelected(selected.size === parsed.length ? new Set() : new Set(parsed.map((h) => h.id)));
  const toggle = (id) => {
    const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s);
  };
  const confirmImport = async () => {
    setStage("importing");
    for (const h of parsed.filter((h) => selected.has(h.id))) {
      await fetch("/api/portfolio/add", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(h),
      });
    }
    setStage("done"); onImport();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.35)", zIndex: 100,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`,
                    boxShadow: "0 8px 40px rgba(10,22,40,0.12)",
                    width: "100%", maxWidth: 680, maxHeight: "85vh",
                    display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 24px 16px", borderBottom: `1px solid ${BORDER}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, fontFamily: FONT_SERIF }}>Import from Brokerage PDF</div>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 3 }}>Upload an account statement or holdings export PDF</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: TEXT_DIM,
                                             fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {(stage === "idle" || stage === "parsing") && (
            <label style={{ display: "block", border: `2px dashed ${BORDER_MED}`,
                            padding: "36px 20px", textAlign: "center", cursor: "pointer" }}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
              <input type="file" accept=".pdf" style={{ display: "none" }}
                     onChange={(e) => handleFile(e.target.files[0])} />
              <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
              {stage === "parsing"
                ? <div style={{ color: GOLD, fontWeight: 600, fontSize: 14 }}>Parsing {filename}…</div>
                : <>
                    <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>Drop your PDF here, or click to browse</div>
                    <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6 }}>Supports account statements from most brokerages</div>
                  </>}
            </label>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: `${RED}10`,
                          border: `1px solid ${RED}40`, fontSize: 13, color: RED }}>{error}</div>
          )}

          {stage === "preview" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: TEXT }}>
                  Found <b style={{ color: GOLD }}>{parsed.length}</b> holding{parsed.length !== 1 ? "s" : ""} in <b>{filename}</b>
                </div>
                <button onClick={toggleAll} style={{ fontSize: 11.5, color: TEXT_DIM, background: "none",
                                                     border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  {selected.size === parsed.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div style={{ border: `1px solid ${BORDER}`, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: SURFACE_2 }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", width: 28 }}>
                        <input type="checkbox" checked={selected.size === parsed.length} onChange={toggleAll} />
                      </th>
                      {["Ticker","Name","Type","Shares","Avg Cost"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600,
                                             color: TEXT_DIM, textTransform: "uppercase", fontSize: 10.5,
                                             letterSpacing: "0.06em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((h) => (
                      <tr key={h.id} style={{ borderTop: `1px solid ${BORDER}`, opacity: selected.has(h.id) ? 1 : 0.4 }}>
                        <td style={{ padding: "8px 12px" }}><input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} /></td>
                        <td style={{ padding: "8px 12px", fontWeight: 700 }}>{h.symbol}</td>
                        <td style={{ padding: "8px 12px", color: TEXT_DIM, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
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
              <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: TEXT }}>Import complete</div>
              <div style={{ fontSize: 13, color: TEXT_DIM, marginTop: 6 }}>
                {selected.size} holding{selected.size !== 1 ? "s" : ""} added to your portfolio.
              </div>
            </div>
          )}
        </div>

        {stage === "preview" && (
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`,
                        display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
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

  const holdings   = enriched?.holdings  || [];
  const filtered   = tab === "all" ? holdings : holdings.filter((h) => h.type === tab);
  const totalValue = enriched?.totalValue || 0;
  const gainLoss   = enriched?.gainLoss   || 0;
  const isPos      = gainLoss >= 0;

  const donutSlices = useMemo(() =>
    holdings.map((h, i) => ({
      label: h.symbol, pct: h.currentPct || 0,
      color: HOLDING_COLORS[i % HOLDING_COLORS.length],
    })), [holdings]);

  const industryBreakdown = useMemo(() => {
    const map = {};
    holdings.forEach((h) => {
      const ind = getIndustry(h.symbol);
      if (!map[ind]) map[ind] = { name: ind, value: 0, pct: 0, holdings: [],
                                   color: HOLDING_COLORS[Object.keys(map).length % HOLDING_COLORS.length] };
      map[ind].value += h.currentValue || 0;
      map[ind].holdings.push(h);
    });
    const total = Object.values(map).reduce((s, x) => s + x.value, 0);
    Object.values(map).forEach((x) => { x.pct = total > 0 ? (x.value / total) * 100 : 0; });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [holdings]);

  const saveHolding = async (data) => {
    setSaving(true);
    const endpoint = data.id ? "/api/portfolio/update" : "/api/portfolio/add";
    await apiFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
                               body: JSON.stringify(data) });
    await onPortfolioChange();
    setSaving(false); setModal(null);
  };

  const removeHolding = async (id) => {
    if (!confirm("Remove this holding?")) return;
    await apiFetch("/api/portfolio/remove", { method: "POST", headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ id }) });
    await onPortfolioChange();
  };

  return (
    <div style={{ padding: "32px 36px", color: TEXT }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>
            My Holdings
          </h1>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", fontFamily: FONT_SERIF }}>
              {fmt$(totalValue)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: isPos ? GREEN : RED }}>
              {isPos ? "▲" : "▼"} {fmt$(Math.abs(gainLoss))} ({fmtPct(enriched?.gainLossPct || 0)}) total
            </span>
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
            {fmt$(enriched?.cash || 0)} cash · {holdings.length} position{holdings.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setImporting(true)} type="button" style={{
            padding: "10px 18px", border: `1px solid ${BORDER}`, background: "transparent",
            color: TEXT_DIM, fontWeight: 600, fontSize: 13.5, cursor: "pointer",
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}>
            📄 Import PDF
          </button>
          <button onClick={() => setModal("add")} type="button" style={{
            padding: "10px 20px", border: "none", background: GOLD,
            color: SURFACE, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}>
            + Add holding
          </button>
        </div>
      </div>

      {/* ── 3-Box Visual Section ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>

        {/* Box 1 — Portfolio Overview */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 24 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, textAlign: "center", fontFamily: FONT_SERIF }}>
            Portfolio Overview
          </h3>
          <div style={{ fontSize: 11, color: TEXT_DIM, textAlign: "center", marginBottom: 16, lineHeight: 1.4 }}>
            Allocation by holding
          </div>
          <div style={{ height: 180, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 180, height: 180 }}>
              <DonutChart slices={donutSlices} total={totalValue} />
            </div>
          </div>
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>{fmt$(totalValue)}</div>
            <div style={{ fontSize: 12, color: TEXT_DIM }}>Total Portfolio Value</div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
              {holdings.length} holdings · {enriched?.cashPct?.toFixed(1) || 0}% cash
            </div>
          </div>
        </div>

        {/* Box 2 — Top Holdings */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 24 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
            Top Holdings
          </h3>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 16, lineHeight: 1.4 }}>
            Largest positions by allocation
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {holdings.slice(0, 8).map((h, i) => {
                const gl    = h.gainLoss    || 0;
                const glPct = h.gainLossPct || 0;
                return (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8,
                                           padding: "8px 6px",
                                           background: i % 2 === 0 ? "transparent" : SURFACE_2 }}>
                    <div style={{ width: 10, height: 10, flexShrink: 0,
                                  background: HOLDING_COLORS[i % HOLDING_COLORS.length] }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{h.symbol}</div>
                      <div style={{ fontSize: 11, color: TEXT_DIM, overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                      <div style={{ fontSize: 10, color: gl >= 0 ? GREEN : RED, marginTop: 1 }}>
                        {gl >= 0 ? "+" : ""}{fmtPct(glPct)} gain/loss
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{h.currentPct?.toFixed(1)}%</div>
                      <div style={{ fontSize: 10, color: TEXT_DIM }}>{fmt$(h.currentValue)}</div>
                    </div>
                  </div>
                );
              })}
              {holdings.length > 8 && (
                <div style={{ fontSize: 11, color: TEXT_DIM, textAlign: "center",
                              paddingTop: 8, borderTop: `1px solid ${BORDER}`, marginTop: 4 }}>
                  +{holdings.length - 8} more holdings
                </div>
              )}
              {holdings.length === 0 && (
                <div style={{ fontSize: 12, color: TEXT_DIM, textAlign: "center", padding: "20px 0" }}>
                  No holdings yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Box 3 — Industry Mix */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 24 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF }}>
            Industry Mix
          </h3>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 16, lineHeight: 1.4 }}>
            Diversification across sectors
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {industryBreakdown.map((ind, i) => {
                const concentration      = ind.pct > 25 ? "High" : ind.pct > 15 ? "Medium" : "Low";
                const concentrationColor = concentration === "High" ? RED : concentration === "Medium" ? GOLD : GREEN;
                return (
                  <div key={ind.name} style={{ display: "flex", alignItems: "center", gap: 8,
                                               padding: "8px 6px",
                                               background: i % 2 === 0 ? "transparent" : SURFACE_2 }}>
                    <div style={{ width: 10, height: 10, flexShrink: 0, background: ind.color }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{ind.name}</div>
                      <div style={{ fontSize: 11, color: TEXT_DIM }}>
                        {ind.holdings.length} position{ind.holdings.length !== 1 ? "s" : ""}
                      </div>
                      <div style={{ fontSize: 10, color: concentrationColor, marginTop: 1 }}>
                        {concentration} concentration
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{ind.pct.toFixed(1)}%</div>
                      <div style={{ fontSize: 10, color: TEXT_DIM }}>{fmt$(ind.value)}</div>
                    </div>
                  </div>
                );
              })}
              {industryBreakdown.length === 0 && (
                <div style={{ fontSize: 12, color: TEXT_DIM, textAlign: "center", padding: "20px 0" }}>
                  Add holdings to see industry breakdown
                </div>
              )}
            </div>
          </div>
          {industryBreakdown.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`,
                          fontSize: 10.5, color: TEXT_DIM, lineHeight: 1.5 }}>
              <strong>Tip:</strong> Limit any single industry to 25% or less for balanced risk.
            </div>
          )}
        </div>
      </div>

      {/* ── Holdings List ── */}
      <div>
        <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} type="button" style={{
              padding: "8px 16px", border: `1px solid ${tab === t ? GOLD_BORDER : BORDER}`,
              cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              background: tab === t ? GOLD_BG : "transparent",
              color: tab === t ? GOLD : TEXT_DIM,
            }}>{t === "all" ? "All Holdings" : t.toUpperCase()}</button>
          ))}
        </div>

        <div style={{ border: `1px solid ${BORDER}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: SURFACE_2 }}>
                {["Name","Type","Shares","Avg Cost","Current Price","Value","Gain / Loss","Allocation",""].map((h) => (
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
                  <tr key={h.id}
                      style={{ borderTop: `1px solid ${BORDER}`, background: i % 2 === 0 ? "transparent" : SURFACE_2,
                               transition: "background 0.12s" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = `${GOLD_BG}`}
                      onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : SURFACE_2}>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.symbol}</div>
                      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2, maxWidth: 170,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                    </td>
                    <td style={{ padding: "13px 16px" }}><TypeBadge type={h.type} /></td>
                    <td style={{ padding: "13px 16px", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{h.shares}</td>
                    <td style={{ padding: "13px 16px", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.avg_cost)}</td>
                    <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.currentPrice)}</td>
                    <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt$(h.currentValue)}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: glPos ? GREEN : RED, fontVariantNumeric: "tabular-nums" }}>
                        {glPos ? "+" : ""}{fmt$(gl)}
                      </div>
                      <div style={{ fontSize: 11, color: glPos ? GREEN : RED, opacity: 0.8 }}>{fmtPct(glPct)}</div>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>{h.currentPct?.toFixed(1)}%</div>
                      <div style={{ height: 3, background: BORDER_MED, width: 56, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: HOLDING_COLORS[holdings.indexOf(h) % HOLDING_COLORS.length],
                                      width: `${Math.min(100, h.currentPct || 0)}%` }} />
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setModal(h)} type="button" style={{
                          padding: "5px 10px", border: `1px solid ${BORDER}`,
                          background: "transparent", color: TEXT_DIM, cursor: "pointer", fontSize: 11.5,
                          fontFamily: "inherit",
                        }}>Edit</button>
                        <button onClick={() => removeHolding(h.id)} type="button" style={{
                          padding: "5px 8px", border: `1px solid ${RED}40`,
                          background: "transparent", color: RED, cursor: "pointer", fontSize: 11.5,
                          fontFamily: "inherit",
                        }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {importing && <ImportModal onImport={async () => { await onPortfolioChange(); setImporting(false); }} onClose={() => setImporting(false)} />}
      {modal && <HoldingModal initial={modal === "add" ? null : modal} onSave={saveHolding} onClose={() => setModal(null)} />}
    </div>
  );
}
