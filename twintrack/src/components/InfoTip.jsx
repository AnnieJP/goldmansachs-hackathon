import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
const POPOVER_WIDTH = 280;
const MARGIN = 8;

export default function InfoTip({ title, text, children, size = 12, placement = "auto" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const popRef = useRef(null);

  // Outside-click + Escape
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      const inWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const inPop  = popRef.current  && popRef.current.contains(e.target);
      if (!inWrap && !inPop) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Compute viewport-relative coordinates for the popover
  const computeCoords = () => {
    const btn = wrapRef.current?.querySelector(".info-tip-btn");
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Decide vertical: prefer below; flip above if not enough room.
    const popHeight = popRef.current?.offsetHeight || 120;
    const placeAbove =
      placement === "top" ||
      (placement === "auto" && r.bottom + popHeight + MARGIN > vh && r.top - popHeight - MARGIN > 0);
    const top = placeAbove ? r.top - popHeight - 6 : r.bottom + 6;

    // Decide horizontal: align to button's left, but keep inside viewport.
    let left = r.left;
    if (placement === "left") left = r.right - POPOVER_WIDTH;
    if (left + POPOVER_WIDTH + MARGIN > vw) left = vw - POPOVER_WIDTH - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) { setCoords(null); return; }
    computeCoords();
    const onScrollResize = () => computeCoords();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const popStyle = {
    position: "fixed",
    top: coords?.top ?? -9999,
    left: coords?.left ?? -9999,
    zIndex: 9999,
    width: POPOVER_WIDTH,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    boxShadow: "0 8px 24px rgba(10,22,40,0.18)",
    padding: "12px 14px",
    fontFamily: FONT_SERIF,
    textAlign: "left",
    whiteSpace: "normal",
    visibility: coords ? "visible" : "hidden",
    pointerEvents: "auto",
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

      {open && createPortal(
        <div ref={popRef} role="tooltip" style={popStyle}>
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
        </div>,
        document.body
      )}
    </span>
  );
}
