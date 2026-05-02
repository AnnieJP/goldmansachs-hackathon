import { useState, useRef, useEffect } from "react";
import { SURFACE, TEXT, TEXT_DIM, BORDER, GOLD, GOLD_BG, GOLD_BORDER, FONT_SERIF } from "../theme.js";

/**
 * InfoTip — a small "?" badge that, when clicked, shows a popover
 * with explanatory text. Dismisses on outside click or Escape.
 *
 * Usage:
 *   <InfoTip title="Portfolio Beta">
 *     Beta measures how much your portfolio moves relative to the market.
 *     A beta of 1.0 tracks the market; 1.5 means 50% more volatile.
 *   </InfoTip>
 *
 * Or:  <InfoTip text="Short description" />
 */
export default function InfoTip({ title, text, children, size = 12, placement = "auto" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Simple placement: default below-right; if user specifies, honour it.
  const popStyle = {
    position: "absolute",
    zIndex: 50,
    top: placement === "top" ? "auto" : `calc(100% + 6px)`,
    bottom: placement === "top" ? `calc(100% + 6px)` : "auto",
    left: placement === "left" ? "auto" : 0,
    right: placement === "left" ? 0 : "auto",
    minWidth: 240,
    maxWidth: 320,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    boxShadow: "0 8px 24px rgba(10,22,40,0.12)",
    padding: "12px 14px",
    fontFamily: FONT_SERIF,
    textAlign: "left",
    whiteSpace: "normal",
  };

  const YELLOW = "#E8B84A";
  const YELLOW_HOVER = "#D4A43A";
  const btnStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size + 2,
    height: size + 2,
    padding: 0,
    marginLeft: 6,
    border: "none",
    background: open ? YELLOW_HOVER : YELLOW,
    color: "#FFFFFF",
    fontSize: size - 1,
    fontWeight: 900,
    fontFamily: FONT_SERIF,
    cursor: "pointer",
    lineHeight: 1,
    verticalAlign: "middle",
    transition: "background 0.15s",
  };

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={title ? `More info: ${title}` : "More info"}
        aria-expanded={open}
        className="info-tip-btn"
        style={btnStyle}
      >
        ?
      </button>

      {open && (
        <div role="tooltip" style={popStyle}>
          {title && (
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: TEXT,
              marginBottom: 6,
              letterSpacing: "0.02em",
              fontFamily: FONT_SERIF,
            }}>
              {title}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: TEXT_DIM, lineHeight: 1.5 }}>
            {children || text}
          </div>
        </div>
      )}
    </span>
  );
}
