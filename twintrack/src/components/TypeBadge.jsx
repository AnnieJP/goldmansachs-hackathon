import { TEXT_DIM } from "../theme.js";

/* Asset-type color palette — single source of truth.
   Used for badges, list dots, section markers, etc. */
export const TYPE_COLOR = {
  stock: "#1E40AF",
  etf:   "#047857",
  bond:  "#7C3AED",
  fund:  "#EA580C",
};

export default function TypeBadge({ type }) {
  const color = TYPE_COLOR[type] || TEXT_DIM;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", fontSize: 10.5,
      fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
      background: color + "18", color,
    }}>
      {type}
    </span>
  );
}
