import { useState, useEffect } from "react";
import { fmt$, fmtPct } from "../theme.js";

/* ─── Print-only styles injected into <head> ────────────────────── */
const PRINT_CSS = `
@media print {
  body { background: #fff !important; }
  .no-print { display: none !important; }
  .page-break { page-break-before: always; }
  .statement-page { box-shadow: none !important; margin: 0 !important; padding: 32px !important; }
}
@page { size: letter; margin: 0.6in; }
`;

const S = {
  page:      { background: "#fff", color: "#111", fontFamily: "'Arial','Helvetica',sans-serif",
               fontSize: 11, lineHeight: 1.4, maxWidth: 900, margin: "0 auto 40px",
               padding: "36px 40px", boxShadow: "0 2px 20px rgba(0,0,0,0.15)", boxSizing: "border-box" },
  header:    { borderBottom: "3px solid #1a1a2e", paddingBottom: 14, marginBottom: 20,
               display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  brand:     { fontSize: 22, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.03em" },
  sub:       { fontSize: 10, color: "#666", marginTop: 3 },
  period:    { textAlign: "right", fontSize: 11, color: "#444" },
  metaGrid:  { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
               border: "1px solid #ccc", marginBottom: 22 },
  metaCell:  { padding: "8px 12px", borderRight: "1px solid #ccc" },
  metaLabel: { fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 },
  metaValue: { fontSize: 12, fontWeight: 700, color: "#1a1a2e" },
  summGrid:  { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
               border: "1px solid #ccc", marginBottom: 24, background: "#f8f8f8" },
  section:   { marginBottom: 22 },
  sectionH:  { fontSize: 10, fontWeight: 700, color: "#fff", background: "#1a1a2e",
               padding: "5px 10px", textTransform: "uppercase", letterSpacing: "0.06em",
               marginBottom: 0 },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 10.5 },
  th:        { padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #aaa",
               borderTop: "1px solid #aaa", fontWeight: 700, color: "#333",
               background: "#f0f0f0", whiteSpace: "nowrap" },
  thR:       { padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #aaa",
               borderTop: "1px solid #aaa", fontWeight: 700, color: "#333",
               background: "#f0f0f0", whiteSpace: "nowrap" },
  td:        { padding: "5px 8px", borderBottom: "1px solid #e8e8e8" },
  tdR:       { padding: "5px 8px", borderBottom: "1px solid #e8e8e8", textAlign: "right" },
  tdBold:    { padding: "5px 8px", borderBottom: "1px solid #e8e8e8", fontWeight: 700 },
  pos:       { color: "#166534" },
  neg:       { color: "#991b1b" },
  footer:    { borderTop: "2px solid #1a1a2e", paddingTop: 10, marginTop: 24,
               fontSize: 9, color: "#888", display: "flex", justifyContent: "space-between",
               alignItems: "flex-end" },
  footerNote:{ fontSize: 8.5, color: "#999", marginTop: 8, lineHeight: 1.5 },
  totRow:    { background: "#f0f0f0", fontWeight: 700 },
};

function glColor(n) { return n >= 0 ? S.pos : S.neg; }

function MetaCell({ label, value, last }) {
  return (
    <div style={{ ...S.metaCell, borderRight: last ? "none" : "1px solid #ccc" }}>
      <div style={S.metaLabel}>{label}</div>
      <div style={S.metaValue}>{value}</div>
    </div>
  );
}

function SummCell({ label, value, sub, last, colored }) {
  const color = colored ? (parseFloat(value) >= 0 ? "#166534" : "#991b1b") : "#1a1a2e";
  return (
    <div style={{ ...S.metaCell, borderRight: last ? "none" : "1px solid #ccc" }}>
      <div style={S.metaLabel}>{label}</div>
      <div style={{ ...S.metaValue, color }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#777", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ─── Page 1: Account Statement ─────────────────────────────────── */
function AccountStatementPage({ enriched, portfolio, today }) {
  const { holdings = [], totalValue = 0, totalCost = 0, gainLoss = 0,
          gainLossPct = 0, cash = 0, cashPct = 0 } = enriched || {};

  const byType = (t) => holdings.filter((h) => h.type === t || (t === "stock" && !["etf","bond","fund"].includes(h.type)));
  const stocks = holdings.filter((h) => h.type === "stock");
  const etfs   = holdings.filter((h) => h.type === "etf");
  const bonds  = holdings.filter((h) => h.type === "bond");
  const funds  = holdings.filter((h) => h.type === "fund");
  const other  = holdings.filter((h) => !["stock","etf","bond","fund"].includes(h.type));

  const HoldingsTable = ({ rows }) => (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Security</th>
          <th style={S.th}>Ticker</th>
          <th style={S.thR}>Shares</th>
          <th style={S.thR}>Avg Cost</th>
          <th style={S.thR}>Current Price</th>
          <th style={S.thR}>Mkt Value</th>
          <th style={S.thR}>Gain / Loss</th>
          <th style={S.thR}>% of Portfolio</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.symbol}>
            <td style={S.tdBold}>{h.name || h.symbol}</td>
            <td style={S.td}>{h.symbol}</td>
            <td style={S.tdR}>{Number(h.shares).toFixed(3)}</td>
            <td style={S.tdR}>{fmt$(h.avg_cost)}</td>
            <td style={S.tdR}>{fmt$(h.currentPrice)}</td>
            <td style={{ ...S.tdR, fontWeight: 700 }}>{fmt$(h.currentValue)}</td>
            <td style={{ ...S.tdR, ...glColor(h.gainLoss) }}>
              {h.gainLoss >= 0 ? "+" : ""}{fmt$(h.gainLoss)}
            </td>
            <td style={S.tdR}>{h.currentPct?.toFixed(2)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const sections = [
    { label: "Equities — Individual Stocks", rows: stocks },
    { label: "ETFs", rows: etfs },
    { label: "Bonds", rows: bonds },
    { label: "Mutual Funds / Index Funds", rows: funds },
    { label: "Other", rows: other },
  ].filter((s) => s.rows.length > 0);

  return (
    <div style={S.page} className="statement-page">
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.brand}>Folio Wealth</div>
          <div style={S.sub}>Account Statement  ·  {today}</div>
        </div>
        <div style={S.period}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Portfolio Statement</div>
          <div>As of {today}</div>
        </div>
      </div>

      {/* Account meta */}
      <div style={S.metaGrid}>
        <MetaCell label="Account Holder" value={portfolio?.owner || "Account Holder"} />
        <MetaCell label="Account Number" value="****-****-0001" />
        <MetaCell label="Account Type" value="Individual Brokerage" />
        <MetaCell label="Statement Date" value={today} last />
      </div>

      {/* Portfolio summary */}
      <div style={{ ...S.section }}>
        <div style={{ ...S.sectionH, marginBottom: 0 }}>Portfolio Summary</div>
        <div style={{ ...S.summGrid, marginBottom: 0 }}>
          <SummCell label="Portfolio Value" value={fmt$(totalValue)} />
          <SummCell label="Total Cost Basis" value={fmt$(totalCost)} />
          <SummCell label="Unrealized Gain / Loss"
                    value={`${gainLoss >= 0 ? "+" : ""}${fmt$(gainLoss)}`}
                    sub={fmtPct(gainLossPct)}
                    colored />
          <SummCell label="Cash & Money Market" value={fmt$(cash)} sub={`${cashPct.toFixed(2)}% of portfolio`} last />
        </div>
      </div>

      {/* Holdings by category */}
      <div style={{ marginBottom: 22 }}>
        <div style={S.sectionH}>Holdings Detail</div>
        {sections.map((sec) => (
          <div key={sec.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#444", background: "#e8e8e8",
                          padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {sec.label}
            </div>
            <HoldingsTable rows={sec.rows} />
          </div>
        ))}

        {/* Cash row */}
        <table style={S.table}>
          <tbody>
            <tr style={{ background: "#f8f8f8" }}>
              <td style={S.tdBold}>Cash &amp; Money Market</td>
              <td style={S.td}>—</td>
              <td style={S.tdR}>—</td>
              <td style={S.tdR}>—</td>
              <td style={S.tdR}>—</td>
              <td style={{ ...S.tdR, fontWeight: 700 }}>{fmt$(cash)}</td>
              <td style={S.tdR}>—</td>
              <td style={S.tdR}>{cashPct.toFixed(2)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <div>Folio Wealth LLC | Member SIPC &amp; FINRA</div>
        <div style={{ textAlign: "right" }}>folio.app | support@folio.app | 1-800-555-0100</div>
      </div>
      <div style={S.footerNote}>
        This statement is for informational purposes only. Past performance is not indicative of future results.
        All figures are as of market close on the last trading day of the statement period.
        Prices sourced from Yahoo Finance via yfinance.
      </div>
    </div>
  );
}

/* ─── Page 2: Holdings Export (per-asset-class detail) ──────────── */
function HoldingsExportPage({ enriched, portfolio, today }) {
  const { holdings = [], totalValue = 0, totalCost = 0, gainLoss = 0,
          gainLossPct = 0, cash = 0, cashPct = 0 } = enriched || {};

  const stocks = holdings.filter((h) => h.type === "stock");
  const etfs   = holdings.filter((h) => h.type === "etf");
  const bonds  = holdings.filter((h) => h.type === "bond");
  const funds  = holdings.filter((h) => h.type === "fund");

  const DetailTable = ({ rows }) => (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Name</th>
          <th style={S.th}>Ticker</th>
          <th style={S.thR}>Shares</th>
          <th style={S.thR}>Avg Cost/Sh</th>
          <th style={S.thR}>Current Price</th>
          <th style={S.thR}>Mkt Value</th>
          <th style={S.thR}>Cost Basis</th>
          <th style={S.thR}>Unrlzd G/L</th>
          <th style={S.thR}>Return %</th>
          <th style={S.thR}>% Port</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.symbol}>
            <td style={S.tdBold}>{h.name || h.symbol}</td>
            <td style={S.td}>{h.symbol}</td>
            <td style={S.tdR}>{Number(h.shares).toFixed(3)}</td>
            <td style={S.tdR}>{fmt$(h.avg_cost)}</td>
            <td style={S.tdR}>{fmt$(h.currentPrice)}</td>
            <td style={{ ...S.tdR, fontWeight: 700 }}>{fmt$(h.currentValue)}</td>
            <td style={S.tdR}>{fmt$(h.costBasis)}</td>
            <td style={{ ...S.tdR, ...glColor(h.gainLoss) }}>
              {h.gainLoss >= 0 ? "+" : ""}{fmt$(h.gainLoss)}
            </td>
            <td style={{ ...S.tdR, ...glColor(h.gainLossPct) }}>
              {fmtPct(h.gainLossPct)}
            </td>
            <td style={S.tdR}>{h.currentPct?.toFixed(2)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  /* Asset allocation summary */
  const alloc = [
    { label: "Individual Equities",    rows: stocks },
    { label: "ETFs",                   rows: etfs   },
    { label: "Bonds",                  rows: bonds  },
    { label: "Mutual Funds",           rows: funds  },
  ].map((a) => ({
    label: a.label,
    value: a.rows.reduce((s, h) => s + (h.currentValue || 0), 0),
    pct:   totalValue > 0
             ? a.rows.reduce((s, h) => s + (h.currentValue || 0), 0) / totalValue * 100
             : 0,
  })).filter((a) => a.value > 0);
  alloc.push({ label: "Cash & Money Market", value: cash, pct: cashPct });

  return (
    <div style={{ ...S.page, marginTop: 0 }} className="statement-page page-break">
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.brand}>Folio Wealth</div>
          <div style={S.sub}>Portfolio Holdings Export  ·  Generated: {today}  ·  As of market close</div>
        </div>
        <div style={S.period}>
          <div style={{ fontWeight: 700 }}>Holdings Export</div>
          <div>Account: ****-****-0001</div>
          <div>Brokerage: Folio Wealth</div>
        </div>
      </div>

      {/* Totals bar */}
      <div style={{ ...S.summGrid, marginBottom: 22 }}>
        <SummCell label="Total Portfolio Value"      value={fmt$(totalValue)} />
        <SummCell label="Total Cost Basis"           value={fmt$(totalCost)} />
        <SummCell label="Total Unrealized Gain/Loss"
                  value={`${gainLoss >= 0 ? "+" : ""}${fmt$(gainLoss)}`}
                  sub={fmtPct(gainLossPct)} colored />
        <SummCell label="Overall Return"             value={fmtPct(gainLossPct)} colored last />
      </div>

      {/* Sections */}
      {stocks.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionH}>Equities — Individual Stocks</div>
          <DetailTable rows={stocks} />
        </div>
      )}
      {etfs.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionH}>ETFs</div>
          <DetailTable rows={etfs} />
        </div>
      )}
      {bonds.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionH}>Bonds</div>
          <DetailTable rows={bonds} />
        </div>
      )}
      {funds.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionH}>Mutual Funds / Index Funds</div>
          <DetailTable rows={funds} />
        </div>
      )}

      {/* Cash */}
      <div style={S.section}>
        <div style={S.sectionH}>Cash &amp; Money Market</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Description</th>
              <th style={S.thR}>Account Balance</th>
              <th style={S.thR}>% of Portfolio</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.tdBold}>Core Cash / Money Market</td>
              <td style={{ ...S.tdR, fontWeight: 700 }}>{fmt$(cash)}</td>
              <td style={S.tdR}>{cashPct.toFixed(2)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Asset allocation breakdown */}
      <div style={S.section}>
        <div style={S.sectionH}>Asset Allocation Breakdown</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Asset Class</th>
              <th style={S.thR}>Market Value</th>
              <th style={S.thR}>% of Portfolio</th>
            </tr>
          </thead>
          <tbody>
            {alloc.map((a) => (
              <tr key={a.label}>
                <td style={S.td}>{a.label}</td>
                <td style={S.tdR}>{fmt$(a.value)}</td>
                <td style={S.tdR}>{a.pct.toFixed(2)}%</td>
              </tr>
            ))}
            <tr style={S.totRow}>
              <td style={S.tdBold}>TOTAL</td>
              <td style={{ ...S.tdR, fontWeight: 700 }}>{fmt$(totalValue)}</td>
              <td style={{ ...S.tdR, fontWeight: 700 }}>100.00%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={S.footer}>
        <div>Folio Wealth LLC | Member SIPC &amp; FINRA</div>
        <div style={{ textAlign: "right" }}>THIS IS A GENERATED DOCUMENT FOR ILLUSTRATIVE PURPOSES ONLY</div>
      </div>
      <div style={S.footerNote}>
        Portfolio data sourced from Yahoo Finance. All figures reflect market close prices on the export date.
        This document is auto-generated by Folio Wealth portfolio management software.
      </div>
    </div>
  );
}

/* ─── Main screen ───────────────────────────────────────────────── */
export default function PrintStatement({ portfolio, prices, enriched }) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  /* inject print CSS once */
  useState(() => {
    const el = document.createElement("style");
    el.textContent = PRINT_CSS;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  });

  if (!enriched) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "#6E96C0", fontFamily: "sans-serif" }}>
        Loading portfolio data…
      </div>
    );
  }

  return (
    <div style={{ background: "#D1D5DB", padding: "32px 24px", minHeight: "100vh" }}>
      {/* Print button toolbar */}
      <div className="no-print" style={{ maxWidth: 900, margin: "0 auto 20px",
                                          display: "flex", justifyContent: "space-between",
                                          alignItems: "center" }}>
        <div style={{ color: "#1a1a2e", fontFamily: "sans-serif", fontWeight: 700, fontSize: 15 }}>
          📄 Print Preview — {today}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => window.print()} style={{
            padding: "9px 22px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#1a1a2e", color: "#fff", fontWeight: 700, fontSize: 13.5,
            fontFamily: "sans-serif",
          }}>
            🖨️  Print / Save PDF
          </button>
        </div>
      </div>

      <AccountStatementPage enriched={enriched} portfolio={portfolio} today={today} />
      <HoldingsExportPage   enriched={enriched} portfolio={portfolio} today={today} />
    </div>
  );
}
