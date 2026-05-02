import { useState } from "react";
import {
  GOLD, GOLD_BG, GOLD_BORDER,
  ACCENT_DIM, BORDER, BORDER_MED,
  SURFACE, BG, TEXT, TEXT_DIM,
  FONT_SERIF,
} from "../theme.js";
import { saveInvestorProfile } from "../api.js";
import { Sparkles, FolderOpen } from "lucide-react";
import { ImportModal } from "./PortfolioScreen.jsx";

/* ─── Questions ─────────────────────────────────────────────────── */
export const QUESTIONS = [
  {
    question: "What are you investing for?",
    options: [
      "Growing my wealth",
      "Buying a home",
      "Family or child's future",
      "Retirement",
      "Emergency safety",
      "Just getting started",
    ],
  },
  {
    question: "When do you think you'll need most of this money?",
    options: [
      "Within 1 year",
      "1–3 years",
      "3–5 years",
      "5–10 years",
      "More than 10 years",
    ],
  },
  {
    question: "If your investments dropped by 20% suddenly, what would you most likely do?",
    options: [
      "Sell everything",
      "Sell some to reduce losses",
      "Wait for recovery",
      "Invest more while prices are lower",
    ],
  },
  {
    question: "How important is easy access to your money?",
    options: [
      "Very important",
      "Somewhat important",
      "Not important right now",
    ],
  },
  {
    question: "Which sounds most like you?",
    options: [
      "I want stable and predictable growth",
      "I can handle some ups and downs for better returns",
      "I'm comfortable taking higher risks for higher growth",
    ],
  },
];

/* ─── Profile derivation ─────────────────────────────────────────── */
export function deriveProfile(answers) {
  const GOALS      = ["wealth_growth", "home_purchase", "family_future", "retirement", "emergency", "learning"];
  const HORIZONS   = ["short_term", "near_term", "medium_term", "long_term", "very_long_term"];
  const PANICS     = ["high", "medium_high", "low", "very_low"];
  const LIQUIDITIES = ["high", "medium", "low"];

  const goal          = GOALS[answers[0]]      ?? "wealth_growth";
  const time_horizon  = HORIZONS[answers[1]]   ?? "medium_term";
  const panic_risk    = PANICS[answers[2]]      ?? "low";
  const liquidity_need = LIQUIDITIES[answers[3]] ?? "medium";

  const q5 = answers[4];
  const q3 = answers[2];
  const q2 = answers[1];

  let risk_level, investor_type;
  if (q5 === 0) {
    risk_level = "low";    investor_type = "conservative";
  } else if (q5 === 1) {
    if (q3 === 0) {
      risk_level = "low";        investor_type = "conservative";
    } else if (q2 >= 3) {
      risk_level = "medium_high"; investor_type = "growth";
    } else {
      risk_level = "medium";     investor_type = "balanced";
    }
  } else {
    if (q2 <= 1) {
      risk_level = "medium";  investor_type = "balanced";
    } else {
      risk_level = "high";    investor_type = "aggressive_growth";
    }
  }

  return { investor_type, risk_level, time_horizon, liquidity_need, panic_risk, goal };
}

/* ─── Step constants ─────────────────────────────────────────────── */
// 0 = welcome, 1–5 = questions, 6 = upload, 7 = done
const LAST_QUESTION_STEP = 5;
const UPLOAD_STEP = 6;
const DONE_STEP = 7;

/* ─── Main component ─────────────────────────────────────────────── */
export default function OnboardingScreen({ currentUser, onComplete }) {
  const [step,        setStep]        = useState(0);
  const [answers,     setAnswers]     = useState([-1, -1, -1, -1, -1]);
  const [selected,    setSelected]    = useState(-1);
  const [visible,     setVisible]     = useState(true);
  const [showImport,  setShowImport]  = useState(false);
  const [saving,      setSaving]      = useState(false);

  const name     = currentUser?.displayName || currentUser?.email?.split("@")[0] || "there";
  const isWelcome  = step === 0;
  const isQuestion = step >= 1 && step <= LAST_QUESTION_STEP;
  const isUpload   = step === UPLOAD_STEP;
  const isDone     = step === DONE_STEP;
  const qIndex     = step - 1; // 0-based index into QUESTIONS

  const transition = (fn) => {
    setVisible(false);
    setTimeout(() => {
      fn();
      setVisible(true);
    }, 220);
  };

  const goTo = (n) => transition(() => {
    setStep(n);
    // Restore previously saved answer when landing on a question step
    if (n >= 1 && n <= LAST_QUESTION_STEP) {
      setSelected(answers[n - 1] !== -1 ? answers[n - 1] : -1);
    } else {
      setSelected(-1);
    }
  });

  const handleNext = async () => {
    if (isWelcome) {
      goTo(1);
      return;
    }
    if (isQuestion) {
      if (selected === -1) return;
      const newAnswers = [...answers];
      newAnswers[qIndex] = selected;
      setAnswers(newAnswers);

      if (step === LAST_QUESTION_STEP) {
        setSaving(true);
        try { await saveInvestorProfile(deriveProfile(newAnswers)); } catch {}
        setSaving(false);
        goTo(UPLOAD_STEP);
      } else {
        goTo(step + 1);
      }
    }
  };

  const handleImportDone = () => {
    setShowImport(false);
    goTo(DONE_STEP);
  };

  const handleSkipUpload = () => goTo(DONE_STEP);

  /* shared card style — translucent, blurred */
  const card = {
    width: "100%", maxWidth: 540,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: "44px 40px",
    boxShadow: "0 8px 40px rgba(10,22,40,0.10)",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0px)" : "translateY(14px)",
    transition: "opacity 0.22s ease, transform 0.22s ease",
  };

  const progressPct = step === 0 ? 0 : Math.min((step / (DONE_STEP - 1)) * 100, 100);
  const showProgress = step > 0 && step < DONE_STEP;

  return (
    <div style={{
      minHeight: "100vh", background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 24px",
      fontFamily: FONT_SERIF,
    }}>
      {/* Progress bar */}
      {showProgress && (
        <div style={{ width: "100%", maxWidth: 540, marginBottom: 20 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 11, color: TEXT_DIM, marginBottom: 8,
          }}>
            <span style={{ fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {isUpload ? "One last thing" : `Question ${step} of ${LAST_QUESTION_STEP}`}
            </span>
            <span style={{ color: GOLD, fontWeight: 700 }}>{Math.round(progressPct)}%</span>
          </div>
          <div style={{ height: 3, background: BORDER_MED, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, background: GOLD,
              width: `${progressPct}%`,
              transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
            }} />
          </div>
        </div>
      )}

      <div style={card}>
        {/* Folio pill badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "4px 12px", borderRadius: 99,
          background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`,
          marginBottom: 28,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD }}>
            Folio
          </span>
        </div>

        {isWelcome  && <WelcomeSlide  name={name} />}
        {isQuestion && <QuestionSlide q={QUESTIONS[qIndex]} qNum={step} selected={selected} onSelect={setSelected} />}
        {isUpload   && <UploadSlide   onUpload={() => setShowImport(true)} onSkip={handleSkipUpload} />}
        {isDone     && <DoneSlide     name={name} />}

        {/* Primary CTA — hidden on upload step (it has its own buttons) and done step */}
        {(isWelcome || isQuestion) && (
          <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
            {step >= 2 && (
              <button
                type="button"
                onClick={() => goTo(step - 1)}
                style={{
                  flex: "0 0 auto", padding: "13px 20px",
                  borderRadius: 10, border: `1px solid ${ACCENT_DIM}`,
                  background: "transparent", color: TEXT_DIM,
                  fontWeight: 600, fontSize: 14, cursor: "pointer",
                  fontFamily: "inherit",
                }}>
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={(isQuestion && selected === -1) || saving}
              style={{
                flex: 1, padding: "13px 0",
                borderRadius: 10, border: "none",
                background: isQuestion && selected === -1 ? BORDER_MED : GOLD,
                color: isQuestion && selected === -1 ? TEXT_DIM : BG,
                fontWeight: 700, fontSize: 14, letterSpacing: "0.02em",
                cursor: (isQuestion && selected === -1) || saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.65 : 1,
                fontFamily: "inherit",
                transition: "background 0.18s, color 0.18s",
              }}>
              {saving ? "Saving…" : isWelcome ? "Get started →" : step === LAST_QUESTION_STEP ? "See my profile" : "Next →"}
            </button>
          </div>
        )}

        {isUpload && (
          <button
            type="button"
            onClick={() => goTo(LAST_QUESTION_STEP)}
            style={{
              width: "100%", marginTop: 10, padding: "11px 0",
              borderRadius: 10, border: `1px solid ${BORDER}`,
              background: "transparent", color: TEXT_DIM,
              fontWeight: 600, fontSize: 14, cursor: "pointer",
              fontFamily: "inherit",
            }}>
            ← Back
          </button>
        )}

        {isDone && (
          <button
            type="button"
            onClick={onComplete}
            style={{
              width: "100%", marginTop: 28, padding: "13px 0",
              borderRadius: 10, border: "none",
              background: GOLD, color: SURFACE,
              fontWeight: 700, fontSize: 14, cursor: "pointer",
              fontFamily: "inherit",
            }}>
            Go to my portfolio →
          </button>
        )}
      </div>

      {showImport && (
        <ImportModal onImport={handleImportDone} onClose={handleSkipUpload} />
      )}
    </div>
  );
}

/* ─── Slide components ───────────────────────────────────────────── */
function WelcomeSlide({ name }) {
  return (
    <>
      <h1 style={{
        fontSize: 30, fontWeight: 900, color: TEXT,
        margin: "0 0 14px", letterSpacing: "-0.03em", lineHeight: 1.2,
      }}>
        Welcome, {name}.
      </h1>
      <p style={{ fontSize: 14.5, color: TEXT_DIM, lineHeight: 1.75, margin: 0 }}>
        Before we show you your portfolio, let's take 60 seconds to understand
        your goals and how you feel about risk.
      </p>
      <p style={{ fontSize: 13.5, color: TEXT_DIM, lineHeight: 1.65, marginTop: 12, marginBottom: 0 }}>
        We'll use your answers to personalise insights across your entire experience.
      </p>
    </>
  );
}

function QuestionSlide({ q, qNum, selected, onSelect }) {
  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 700, color: GOLD,
        letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12,
      }}>
        Question {qNum} of {LAST_QUESTION_STEP}
      </div>
      <h2 style={{
        fontSize: 20, fontWeight: 800, color: TEXT,
        margin: "0 0 22px", letterSpacing: "-0.02em", lineHeight: 1.35,
      }}>
        {q.question}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {q.options.map((opt, i) => {
          const active = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              style={{
                padding: "12px 16px", borderRadius: 10, textAlign: "left",
                border: `1.5px solid ${active ? GOLD_BORDER : BORDER}`,
                background: active ? GOLD_BG : "transparent",
                color: active ? GOLD : TEXT,
                fontWeight: active ? 600 : 400, fontSize: 13.5,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 12,
                transition: "border-color 0.15s, background 0.15s, color 0.15s",
              }}>
              <span style={{
                width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? GOLD : BORDER_MED}`,
                background: active ? GOLD : "transparent",
                transition: "border-color 0.15s, background 0.15s",
              }} />
              {opt}
            </button>
          );
        })}
      </div>
    </>
  );
}

function UploadSlide({ onUpload, onSkip }) {
  return (
    <>
      <h2 style={{
        fontSize: 22, fontWeight: 800, color: TEXT,
        margin: "0 0 10px", letterSpacing: "-0.02em",
      }}>
        Import your holdings
      </h2>
      <p style={{ fontSize: 13.5, color: TEXT_DIM, lineHeight: 1.7, margin: "0 0 28px" }}>
        Upload a brokerage account statement and we'll automatically pull in your
        holdings — no manual entry needed.
      </p>
      <button
        type="button"
        onClick={onUpload}
        style={{
          width: "100%", padding: "13px 0", borderRadius: 10,
          border: "none", background: GOLD, color: SURFACE,
          fontWeight: 700, fontSize: 14, cursor: "pointer",
          fontFamily: "inherit", marginBottom: 10,
        }}>
        Upload my statement
      </button>
      <button
        type="button"
        onClick={onSkip}
        style={{
          width: "100%", padding: "11px 0", borderRadius: 10,
          border: `1px solid ${BORDER}`, background: "transparent",
          color: TEXT_DIM, fontWeight: 500, fontSize: 13.5,
          cursor: "pointer", fontFamily: "inherit",
        }}>
        Skip for now
      </button>
    </>
  );
}

function DoneSlide({ name }) {
  return (
    <>
      <Sparkles size={42} color={GOLD} style={{ marginBottom: 16 }} />
      <h2 style={{
        fontSize: 26, fontWeight: 900, color: TEXT,
        margin: "0 0 12px", letterSpacing: "-0.03em",
      }}>
        You're all set, {name}!
      </h2>
      <p style={{ fontSize: 14, color: TEXT_DIM, lineHeight: 1.7, margin: 0 }}>
        Your investor profile has been saved. Head to your overview to start
        exploring your portfolio.
      </p>
    </>
  );
}
