import { useState, useEffect } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER,
         SURFACE, BG, TEXT, TEXT_DIM,
         GREEN, GREEN_BG, GREEN_BORDER,
         FONT_SERIF, fmt$ } from "../theme.js";
import { apiFetch, saveInvestorProfile } from "../api.js";
import { QUESTIONS, deriveProfile } from "./OnboardingScreen.jsx";
import InfoTip from "../components/InfoTip.jsx";
import { TrendingUp, TrendingDown, CheckCircle2, AlertCircle, User, X, ChevronRight, ChevronLeft } from "lucide-react";

/* ─── Profile edit modal ────────────────────────────────────────── */
function ProfileEditModal({ onSave, onClose }) {
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving,  setSaving]  = useState(false);
  const q = QUESTIONS[step];
  const answered = answers[step] !== undefined;
  const isLast   = step === QUESTIONS.length - 1;

  const pick = (i) => setAnswers((a) => ({ ...a, [step]: i }));
  const next = async () => {
    if (isLast) {
      setSaving(true);
      const profile = deriveProfile(Object.values(answers).map(Number));
      try { await saveInvestorProfile(profile); } catch {}
      setSaving(false);
      onSave();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.45)", zIndex: 200,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`,
                    boxShadow: "0 12px 48px rgba(10,22,40,0.14)",
                    width: 460, maxWidth: "92vw", padding: "28px 28px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Update your investor profile</div>
            <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 3 }}>Question {step + 1} of {QUESTIONS.length}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer",
                                             color: TEXT_DIM, display: "flex", alignItems: "center" }}>
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: BORDER, marginBottom: 22 }}>
          <div style={{ height: "100%", width: `${((step + 1) / QUESTIONS.length) * 100}%`,
                        background: GOLD, transition: "width 0.3s" }} />
        </div>

        {/* Question */}
        <div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT, marginBottom: 14, lineHeight: 1.45 }}>
          {q.question}
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
          {q.options.map((opt, i) => {
            const sel = answers[step] === i;
            return (
              <button key={i} type="button" onClick={() => pick(i)} style={{
                padding: "10px 14px", textAlign: "left", border: `1px solid ${sel ? GOLD_BORDER : BORDER}`,
                background: sel ? GOLD_BG : "transparent", color: sel ? TEXT : TEXT_DIM,
                fontWeight: sel ? 600 : 400, fontSize: 13.5, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.12s",
              }}>{opt}</button>
            );
          })}
        </div>

        {/* Nav */}
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} style={{
              padding: "9px 16px", border: `1px solid ${BORDER}`, background: "transparent",
              color: TEXT_DIM, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              display: "flex", alignItems: "center", gap: 6,
            }}><ChevronLeft size={14} /> Back</button>
          )}
          <button type="button" onClick={next} disabled={!answered || saving} style={{
            flex: 1, padding: "10px 0", border: "none", background: answered ? GOLD : BORDER,
            color: answered ? SURFACE : TEXT_DIM, fontWeight: 700, fontSize: 13.5,
            cursor: answered ? "pointer" : "default", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "background 0.15s",
          }}>
            {saving ? "Saving…" : isLast ? "Save profile" : <>{"Next"} <ChevronRight size={14} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

const GOAL_LABELS = {
  wealth_growth: "Wealth Growth", retirement: "Retirement", home_purchase: "Home Purchase",
  family_future: "Family Future", emergency: "Emergency Fund", learning: "Learning to Invest",
};

/* ─── Drift bar ─────────────────────────────────────────────────── */
function DriftBar({ current, target, label }) {
  const max      = Math.max(current, target, 1);
  const over     = current > target;
  const drift    = Math.abs(current - target).toFixed(1);
  const barColor = over ? "#f97316" : "#6366F1";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{label}</span>
        <span style={{ fontSize: 11.5, color: over ? "#fb923c" : TEXT_DIM }}>
          {over ? `+${drift}% over` : `-${drift}% under`} target
        </span>
      </div>
      <div style={{ position: "relative", height: 8, background: "rgba(0,0,0,0.07)", overflow: "visible" }}>
        <div style={{ position: "absolute", left: `${(target / max) * 100}%`, top: -3,
                      width: 2, height: 14, background: TEXT_DIM, zIndex: 2 }} />
        <div style={{ position: "absolute", left: 0, height: "100%",
                      width: `${(current / max) * 100}%`, background: barColor,
                      transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11 }}>
        <span style={{ color: TEXT_DIM }}>You have <b style={{ color: TEXT }}>{current.toFixed(1)}%</b></span>
        <span style={{ color: TEXT_DIM }}>Target <b style={{ color: TEXT }}>{target.toFixed(1)}%</b></span>
      </div>
    </div>
  );
}

/* ─── Suggestion card ────────────────────────────────────────────── */
function SuggestionCard({ s, profileAware }) {
  const isSell  = s.action === "sell";
  const acColor = isSell ? "#f97316" : GREEN;
  const key     = profileAware ? s.bucket : s.symbol;
  const title   = profileAware ? s.label  : s.symbol;
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`,
      padding: "18px 20px", marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start",
      transition: "border-color 0.15s",
    }}
    onMouseEnter={(e) => e.currentTarget.style.borderColor = acColor + "40"}
    onMouseLeave={(e) => e.currentTarget.style.borderColor = BORDER}>
      <div style={{ width: 36, height: 36, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: acColor + "18", border: `1px solid ${acColor}30` }}>
        {isSell ? <TrendingDown size={16} color={acColor} /> : <TrendingUp size={16} color={acColor} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>{title}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: acColor, textTransform: "uppercase",
                         padding: "2px 8px", background: acColor + "14",
                         border: `1px solid ${acColor}25` }}>{s.action}</span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>≈ {fmt$(s.trade_value)}</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, marginBottom: 5 }}>{s.plain_action}</div>
        <div style={{ fontSize: 12.5, color: TEXT_DIM, lineHeight: 1.55 }}>{s.reason}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          {[["You have", `${s.current_pct}%`], ["Target", `${s.target_pct}%`],
            ...(!profileAware && s.current_price ? [["Price", fmt$(s.current_price)]] : [])
          ].map(([k, v]) => (
            <span key={k} style={{ fontSize: 11.5, color: TEXT_DIM }}>{k}: <b style={{ color: TEXT }}>{v}</b></span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main screen ───────────────────────────────────────────────── */
export default function RebalanceScreen({ portfolio, prices }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [editProfile, setEditProfile] = useState(false);

  const load = () => {
    if (!portfolio || !prices) return;
    setLoading(true);
    apiFetch("/api/rebalance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio, prices }),
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, [portfolio, prices]);

  if (loading) return <Center>Checking your allocation…</Center>;
  if (error)   return <Center>Could not load rebalancing data</Center>;
  if (!data)   return null;

  const allGood      = !data.needs_rebalancing;
  const profileAware = !!data.profile_aware;
  const snapshot     = profileAware ? data.bucket_snapshot : data.allocation_snapshot;
  const profile      = data.profile_used;
  const goal         = data.goal_used;

  return (
    <div style={{ padding: "28px 32px", color: TEXT, width: "100%", boxSizing: "border-box" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>
        Rebalance
        <InfoTip title="What is Rebalancing?">
          Over time, winning positions grow and losers shrink, pushing your
          portfolio away from your chosen allocation. Rebalancing trims the
          winners and tops up the losers to bring you back to target. We
          suggest trades when any holding drifts more than ~3% off.
        </InfoTip>
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: TEXT_DIM }}>
        Keep your portfolio aligned with your target allocation.
      </p>

      {/* Profile banner */}
      <div style={{ padding: "13px 18px", marginBottom: 20,
                    background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`,
                    display: "flex", alignItems: "center", gap: 12 }}>
        <User size={15} color={GOLD} />
        <span style={{ fontSize: 13, color: TEXT_DIM, flex: 1 }}>
          {profileAware ? (
            <>Targets based on your{" "}
              <b style={{ color: TEXT, textTransform: "capitalize" }}>{profile}</b> risk profile
              {goal && GOAL_LABELS[goal] ? (
                <> and <b style={{ color: TEXT }}>{GOAL_LABELS[goal]}</b> goal</>
              ) : null}
            </>
          ) : "No investor profile set — update to get personalised targets."}
        </span>
        <button type="button" onClick={() => setEditProfile(true)} style={{
          background: "none", border: `1px solid ${GOLD_BORDER}`, padding: "4px 10px",
          color: TEXT_DIM, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap", flexShrink: 0,
        }}>Update profile</button>
      </div>

      {/* Status banner */}
      <div style={{ padding: "16px 20px", marginBottom: 24,
                    background: allGood ? GREEN_BG : "rgba(249,115,22,0.08)",
                    border: `1px solid ${allGood ? GREEN_BORDER : "rgba(249,115,22,0.25)"}`,
                    display: "flex", alignItems: "center", gap: 14 }}>
        {allGood ? <CheckCircle2 size={20} color={GREEN} /> : <AlertCircle size={20} color="#fb923c" />}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: allGood ? GREEN : "#fdba74" }}>
            {allGood
              ? "Your portfolio is well balanced"
              : `${data.suggestion_count} area${data.suggestion_count !== 1 ? "s" : ""} need attention`}
          </div>
          <div style={{ fontSize: 12.5, color: TEXT_DIM, marginTop: 2 }}>
            {allGood
              ? `All ${profileAware ? "asset classes are" : "holdings are"} within target — nothing to do.`
              : `Total drift: ${data.total_drift}% from your target allocation.`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        {/* Snapshot */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "22px 22px",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, marginBottom: 18,
                        textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {profileAware ? "Asset Mix vs Target" : "Current vs Target"}
            <InfoTip title="Drift bars">
              Each bar shows a holding's current allocation vs its target. The
              vertical tick marks the target. Blue = on or below target,
              orange = overweight. Bigger drift means more urgent rebalancing.
            </InfoTip>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 420, paddingRight: 4 }}>
            {snapshot && snapshot.map((s) => (
              <div key={profileAware ? s.bucket : s.symbol} style={{ marginBottom: 18 }}>
                <DriftBar
                  current={s.current_pct}
                  target={s.target_pct}
                  label={profileAware ? s.label : s.symbol}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 4, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 20, height: 5, background: "#6366F1" }} />
              <span style={{ color: TEXT_DIM }}>Current</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 2, height: 12, background: TEXT_DIM }} />
              <span style={{ color: TEXT_DIM }}>Target</span>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div>
          {allGood ? (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`,
                          padding: "28px 24px", textAlign: "center",
                          boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ width: 56, height: 56, background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`,
                            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <CheckCircle2 size={26} color={GREEN} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 8 }}>All on track</div>
              <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.65 }}>
                Your mix matches your profile. Check back after the next market move or new purchase.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_DIM, marginBottom: 14,
                            textTransform: "uppercase", letterSpacing: "0.05em" }}>Recommended Actions</div>
              {data.suggestions.map((s) => (
                <SuggestionCard key={profileAware ? s.bucket : s.symbol} s={s} profileAware={profileAware} />
              ))}
              <div style={{ marginTop: 4, padding: "13px 16px", fontSize: 12.5,
                            background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`, color: TEXT_DIM, lineHeight: 1.6 }}>
                These are suggestions only — consult a financial adviser before trading.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explainer */}
      <div style={{ marginTop: 24, padding: "18px 22px",
                    background: SURFACE, border: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT_DIM, marginBottom: 8,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>What is rebalancing?</div>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM, lineHeight: 1.75 }}>
          Over time, faster-growing assets become a larger share of your portfolio than you intended.
          Rebalancing means trimming what grew too much and adding to what lagged — keeping your risk
          level matched to your goals and profile.
        </p>
      </div>

      {editProfile && (
        <ProfileEditModal
          onClose={() => setEditProfile(false)}
          onSave={() => { setEditProfile(false); load(); }}
        />
      )}
    </div>
  );
}

function Center({ children }) {
  return <div style={{ padding: 60, textAlign: "center", color: TEXT_DIM, fontSize: 14 }}>{children}</div>;
}
