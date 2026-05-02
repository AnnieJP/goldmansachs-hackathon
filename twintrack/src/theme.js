/* ─── Typography ────────────────────────────────────────────────── */
export const FONT_SERIF = "'Playfair Display', Georgia, serif";
export const FONT_SANS  = "'Playfair Display', Georgia, serif";

/* ─── Background layers ─────────────────────────────────────────── */
export const BG        = "#F5F0EA";  /* warm cream page bg          */
export const SURFACE   = "#FFFFFF";  /* white card surface          */
export const SURFACE_2 = "#EDE8E1";  /* warm off-white, nested      */
export const SURFACE_3 = "#E5DED5";  /* warm medium, hover states   */

/* ─── Borders ───────────────────────────────────────────────────── */
export const BORDER     = "rgba(10,22,40,0.10)";
export const BORDER_MED = "rgba(10,22,40,0.20)";

/* ─── Text ──────────────────────────────────────────────────────── */
export const TEXT     = "#0A1628";  /* midnight navy               */
export const TEXT_SEC = "#2A4165";  /* medium navy                 */
export const TEXT_DIM = "#7B8FA6";  /* muted blue-gray             */

/* ─── Gold accent ───────────────────────────────────────────────── */
export const GOLD        = "#B45309";  /* amber-700, contrast on white */
export const GOLD_LIGHT  = "#D97706";
export const GOLD_BG     = "rgba(180,83,9,0.08)";
export const GOLD_BORDER = "rgba(180,83,9,0.22)";

/* ─── Semantic colors ───────────────────────────────────────────── */
export const GREEN        = "#047857";  /* emerald-700 */
export const GREEN_BG     = "rgba(4,120,87,0.08)";
export const GREEN_BORDER = "rgba(4,120,87,0.25)";
export const RED          = "#B91C1C";  /* red-700     */
export const RED_BG       = "rgba(185,28,28,0.08)";
export const RED_BORDER   = "rgba(185,28,28,0.25)";

/* ─── Backward-compat aliases ───────────────────────────────────── */
export const ACCENT      = "#1E40AF";
export const ACCENT_SOFT = "#DBEAFE";
export const ACCENT_DIM  = "rgba(10,22,40,0.06)";

/* ─── Holding palette ───────────────────────────────────────────── */
export const HOLDING_COLORS = [
  "#F59E0B", "#10B981", "#6366F1", "#EC4899",
  "#14B8A6", "#F97316", "#8B5CF6", "#06B6D4",
  "#EF4444", "#84CC16",
];

/* ─── Glass card style object ───────────────────────────────────── */
export const glass = {
  background: "rgba(255,255,255,0.80)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(10,22,40,0.10)",
  borderRadius: 16,
  boxShadow: "0 8px 32px rgba(10,22,40,0.10), inset 0 1px 0 rgba(255,255,255,0.8)",
};

/* ─── Formatters ────────────────────────────────────────────────── */
export const fmt$ = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const fmtPct = (n, digits = 1) =>
  `${n >= 0 ? "+" : ""}${Number(n).toFixed(digits)}%`;

/* ─── Portfolio enrichment ──────────────────────────────────────── */
export function enrichPortfolio(portfolio, prices) {
  if (!portfolio) return null;
  const cash = parseFloat(portfolio.cash || 0);
  let totalValue = cash, totalCost = cash;
  const holdings = (portfolio.holdings || []).map((h) => {
    const cp  = parseFloat(prices[h.symbol] || h.avg_cost || 0);
    const val = h.shares * cp;
    const cb  = h.shares * parseFloat(h.avg_cost || 0);
    totalValue += val;
    totalCost  += cb;
    return { ...h, currentPrice: cp, currentValue: val, costBasis: cb,
             gainLoss: val - cb, gainLossPct: cb > 0 ? (val - cb) / cb * 100 : 0 };
  });
  const withPct = holdings.map((h) => ({
    ...h,
    currentPct: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
    drift:      totalValue > 0 ? (h.currentValue / totalValue) * 100 - (h.target_pct || 0) : 0,
  }));
  return {
    holdings: withPct, totalValue, totalCost,
    gainLoss:    totalValue - totalCost,
    gainLossPct: totalCost > 0 ? (totalValue - totalCost) / totalCost * 100 : 0,
    cash, cashPct: totalValue > 0 ? cash / totalValue * 100 : 0,
  };
}
