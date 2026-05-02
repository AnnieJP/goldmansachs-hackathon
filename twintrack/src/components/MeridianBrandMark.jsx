import React, { useEffect, useState } from "react";

/**
 * MeridianBrandMark
 * Animated brand block for the Meridian sidebar header.
 * - Pure SVG (no border-radius needed).
 * - Self-contained inline styles + a single injected <style> block for keyframes.
 * - Respects prefers-reduced-motion.
 *
 * Default container: 220 x 56 px.
 */

const PALETTE = {
  BG: "#F5F0EA",
  SURFACE: "#FFFFFF",
  TEXT: "#0A1628",
  TEXT_DIM: "#7B8FA6",
  ACCENT: "#0A1628",
  GOLD: "#E8B84A",
  GREEN: "#047857",
};

const STYLE_ID = "meridian-brandmark-keyframes";

/*
 * Animation timeline (total 6.4s, then repeats):
 *   0.00s - 1.60s : needle sweeps clockwise from -20deg -> ~370deg with
 *                   ease-out + tiny overshoot, settles at 360deg (true north).
 *   1.60s - 2.40s : star fades in + twinkles (scale/opacity).
 *   2.40s - 6.40s : 4s of stillness (needle north, star at full).
 *   6.40s         : loop restarts.
 *
 * Wordmark + tagline: 200ms staggered fade-up, mount-only.
 */
const KEYFRAMES = `
@keyframes meridian-needle-sweep {
  0%    { transform: rotate(-20deg); }
  18%   { transform: rotate(180deg); }
  22%   { transform: rotate(372deg); }   /* tiny overshoot past north */
  25%   { transform: rotate(360deg); }   /* settle at true north */
  100%  { transform: rotate(360deg); }   /* hold */
}
@keyframes meridian-star-twinkle {
  0%   { opacity: 0;   transform: scale(0.8); }
  25%  { opacity: 0;   transform: scale(0.8); }   /* hidden during sweep */
  35%  { opacity: 1;   transform: scale(1.1); }
  42%  { opacity: 0.6; transform: scale(0.95); }
  50%  { opacity: 1;   transform: scale(1.1); }
  100% { opacity: 1;   transform: scale(1); }     /* hold bright */
}
@keyframes meridian-fade-up {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

function useInjectedKeyframes() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
  }, []);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export default function MeridianBrandMark() {
  useInjectedKeyframes();
  const reduced = usePrefersReducedMotion();

  // Total loop = 6.4s. Mount-only fade-up handled with animation-fill-mode.
  const loopDuration = "9s";

  const containerStyle = {
    width: 220,
    height: 56,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 8px",
    boxSizing: "border-box",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: PALETTE.TEXT,
    userSelect: "none",
  };

  const iconWrapStyle = {
    width: 44,
    height: 44,
    flex: "0 0 44px",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // SVG canvas is 44x44. Diamond is ~40x40 centered.
  // Star sits just above the diamond's top corner.
  const needleAnim = reduced
    ? undefined
    : `meridian-needle-sweep 3.6s ease-out forwards`;

  const starAnim = reduced
    ? undefined
    : `meridian-star-twinkle 3.6s ease-in-out forwards`;

  // Static state (reduced motion): needle north, star bright.
  const needleStaticTransform = "rotate(360deg)";
  const starStaticOpacity = 1;
  const starStaticScale = 1;

  const wordmarkStyle = {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 18,
    fontWeight: 700,
    color: PALETTE.TEXT,
    lineHeight: 1.1,
    letterSpacing: "0.2px",
    opacity: 0,
    animation: "meridian-fade-up 420ms ease-out 120ms forwards",
  };

  const taglineStyle = {
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 11.5,
    fontWeight: 400,
    color: PALETTE.TEXT_DIM,
    lineHeight: 1.2,
    marginTop: 2,
    opacity: 0,
    animation: "meridian-fade-up 420ms ease-out 320ms forwards",
  };

  const textColStyle = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    overflow: "hidden",
  };

  return (
    <div style={containerStyle} aria-label="Meridian — Your financial north star">
      <div style={iconWrapStyle}>
        <svg
          width={44}
          height={44}
          viewBox="0 0 44 44"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-hidden="true"
          style={{ overflow: "visible" }}
        >
          {/* --- Diamond outline (40x40, centered at 22,22) --- */}
          <polygon
            points="22,4 40,22 22,40 4,22"
            fill="none"
            stroke={PALETTE.ACCENT}
            strokeWidth={1.6}
            strokeLinejoin="miter"
          />

          {/* --- Compass needle: two triangles sharing a center pivot --- */}
          {/* Group rotates around (22,22). Needle points "up" at 360deg. */}
          <g
            style={{
              transformOrigin: "22px 22px",
              transformBox: "fill-box",
              transform: reduced ? needleStaticTransform : "rotate(-20deg)",
              animation: needleAnim,
            }}
          >
            {/* Navy half (points up at rest) */}
            <polygon
              points="22,10 24.2,22 19.8,22"
              fill={PALETTE.ACCENT}
            />
            {/* Gold half (points down at rest) */}
            <polygon
              points="22,34 19.8,22 24.2,22"
              fill={PALETTE.GOLD}
            />
            {/* Center pivot dot */}
            <circle cx={22} cy={22} r={1.4} fill={PALETTE.TEXT} />
          </g>

          {/* --- 4-point gold star above the diamond's top corner --- */}
          {/* Star is centered at (22, 2); rendered with a small group so it
              can scale/fade as one unit. */}
          <g
            style={{
              transformOrigin: "22px 2px",
              transformBox: "fill-box",
              opacity: reduced ? starStaticOpacity : 0,
              transform: reduced ? `scale(${starStaticScale})` : "scale(0.8)",
              animation: starAnim,
            }}
          >
            {/* 4-point star as two crossed thin diamonds */}
            <polygon
              points="22,-2 23,2 22,6 21,2"
              fill={PALETTE.GOLD}
            />
            <polygon
              points="18,2 22,1 26,2 22,3"
              fill={PALETTE.GOLD}
            />
          </g>
        </svg>
      </div>

      <div style={textColStyle}>
        <div
          style={
            reduced
              ? { ...wordmarkStyle, opacity: 1, animation: "none" }
              : wordmarkStyle
          }
        >
          Meridian
        </div>
        <div
          style={
            reduced
              ? { ...taglineStyle, opacity: 1, animation: "none" }
              : taglineStyle
          }
        >
          Your financial north star
        </div>
      </div>
    </div>
  );
}
