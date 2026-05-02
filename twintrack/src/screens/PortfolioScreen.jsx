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

/* ─── PDF import modal ─────────────────────────────────────────── */
const TYPE_LABELS = { stock: "Stock", etf: "ETF", bond: "Bond", fund: "Fund" };

export function ImportModal({ onImport, onClose }) {
  const [stage,    setStage]    = useState("idle"); // idle | parsing | preview | importing | done
  const [parsed,   setParsed]   = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error,    setError]    = useState(null);
  const [filename, setFilename] = useState("");

  const handleFile = (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file."); return;
    }
    setFilename(file.name);
    setError(null);
    setStage("parsing");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const b64 = e.target.result.split(",")[1];
        const res = await fetch("/api/portfolio/import-pdf", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_b64: b64 }),
        });
        if (!res.ok) { setError(`Server error ${res.status} — is the backend running?`); setStage("idle"); return; }
        const data = await res.json();
        if (data.error) { setError(data.error); setStage("idle"); return; }
        if (!data.holdings?.length) { setError("No holdings found in this PDF. Make sure it contains a holdings table."); setStage("idle"); return; }
        setParsed(data.holdings);
        setSelected(new Set(data.holdings.map((h) => h.id)));
        setStage("preview");
      } catch (err) {
        setError(`Could not reach backend — make sure the server is running on port 8765. (${err.message})`);
        setStage("idle");
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleAll = () =>
    setSelected(selected.size === parsed.length ? new Set() : new Set(parsed.map((h) => h.id)));

  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const confirmImport = async () => {
    setStage("importing");
    const toAdd = parsed.filter((h) => selected.has(h.id));
    for (const h of toAdd) {
      await fetch("/api/portfolio/add", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(h),
      });
    }
    setStage("done");
    onImport();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: SURFACE, border: `1px solid ${ACCENT_DIM}`, borderRadius: 16,
                    width: "100%", maxWidth: 680, maxHeight: "85vh", display: "flex",
                    flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "22px 24px 16px", borderBottom: `1px solid ${ACCENT_DIM}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>Import from Brokerage PDF</div>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 3 }}>
              Upload an account statement or holdings export PDF
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: TEXT_DIM,
                                             fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>

          {/* Drop zone */}
          {(stage === "idle" || stage === "parsing") && (
            <label style={{ display: "block", border: `2px dashed ${ACCENT_DIM}`, borderRadius: 12,
                            padding: "36px 20px", textAlign: "center", cursor: "pointer",
                            transition: "border-color 0.15s" }}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
              <input type="file" accept=".pdf" style={{ display: "none" }}
                     onChange={(e) => handleFile(e.target.files[0])} />
              <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
              {stage === "parsing" ? (
                <div style={{ color: GOLD, fontWeight: 600, fontSize: 14 }}>Parsing {filename}…</div>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>Drop your PDF here, or click to browse</div>
                  <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6 }}>
                    Supports account statements &amp; holdings exports from most brokerages
                  </div>
                </>
              )}
            </label>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8,
                          background: "#f8717118", border: "1px solid #f8717140",
                          fontSize: 13, color: "#f87171" }}>{error}</div>
          )}

          {/* Preview table */}
          {stage === "preview" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                            marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: TEXT }}>
                  Found <b style={{ color: GOLD }}>{parsed.length}</b> holding{parsed.length !== 1 ? "s" : ""} in <b>{filename}</b>
                </div>
                <button onClick={toggleAll} style={{ fontSize: 11.5, color: TEXT_DIM, background: "none",
                                                     border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  {selected.size === parsed.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div style={{ border: `1px solid ${ACCENT_DIM}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: BG }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", width: 28 }}>
                        <input type="checkbox" checked={selected.size === parsed.length}
                               onChange={toggleAll} /></th>
                      {["Ticker","Name","Type","Shares","Avg Cost"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left",
                                             fontWeight: 600, color: TEXT_DIM,
                                             textTransform: "uppercase", fontSize: 10.5,
                                             letterSpacing: "0.06em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((h) => (
                      <tr key={h.id} style={{ borderTop: `1px solid ${ACCENT_DIM}`,
                                              opacity: selected.has(h.id) ? 1 : 0.4 }}>
                        <td style={{ padding: "8px 12px" }}>
                          <input type="checkbox" checked={selected.has(h.id)}
                                 onChange={() => toggle(h.id)} /></td>
                        <td style={{ padding: "8px 12px", fontWeight: 700 }}>{h.symbol}</td>
                        <td style={{ padding: "8px 12px", color: TEXT_DIM, maxWidth: 180,
                                     overflow: "hidden", textOverflow: "ellipsis",
                                     whiteSpace: "nowrap" }}>{h.name}</td>
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
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: TEXT }}>Import complete</div>
              <div style={{ fontSize: 13, color: TEXT_DIM, marginTop: 6 }}>
                {selected.size} holding{selected.size !== 1 ? "s" : ""} added to your portfolio.
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {stage === "preview" && (
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${ACCENT_DIM}`,
                        display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={confirmImport} disabled={selected.size === 0}
                    style={{ ...goldBtn, flex: "unset", padding: "10px 24px",
                              opacity: selected.size === 0 ? 0.4 : 1 }}>
              Import {selected.size} holding{selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        )}
        {stage === "done" && (
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${ACCENT_DIM}`,
                        display: "flex", justifyContent: "flex-end" }}>
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
  const [modal,     setModal]     = useState(null); // null | "add" | holding-object
  const [importing, setImporting] = useState(false);
  const [saving,    setSaving]    = useState(false);

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
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setImporting(true)} type="button"
                  style={{ padding: "10px 18px", borderRadius: 9, border: `1px solid ${ACCENT_DIM}`,
                           background: "transparent", color: TEXT_DIM, fontWeight: 600, fontSize: 13.5,
                           cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            📂 Import PDF
          </button>
          <button onClick={() => setModal("add")} type="button"
                  style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: GOLD,
                           color: BG, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
                           whiteSpace: "nowrap" }}>
            + Add holding
          </button>
        </div>
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

      {importing && (
        <ImportModal
          onImport={async () => { await onPortfolioChange(); }}
          onClose={() => setImporting(false)}
        />
      )}
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
