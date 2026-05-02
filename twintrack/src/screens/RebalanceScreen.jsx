import { useState, useEffect } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER,
         SURFACE, BG, TEXT, TEXT_DIM,
         GREEN, GREEN_BG, GREEN_BORDER,
         FONT_SERIF, fmt$ } from "../theme.js";
import { apiFetch, saveInvestorProfile } from "../api.js";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
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

/* ─── Before / after allocation pie ────────────────────────────── */
const PIE_COLORS = ["#F59E0B","#6366F1","#10B981","#0891B2","#EC4899","#84cc16","#f97316","#8B5CF6","#14B8A6","#F43F5E"];

function AllocPie({ title, slices }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, textTransform: "uppercase",
                    letterSpacing: "0.07em", textAlign: "center", marginBottom: 6, width: "100%" }}>{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={slices} dataKey="value" cx="50%" cy="50%"
               innerRadius={60} outerRadius={92} paddingAngle={2} strokeWidth={0}>
            {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
          </Pie>
          <Tooltip contentStyle={{ background: SURFACE, border: `1px solid ${BORDER}`,
                                    fontSize: 12, color: TEXT }}
                   formatter={(v, n) => [`${v}%`, n]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px",
                    justifyContent: "center", marginTop: 2 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3,
                                fontSize: 10.5, color: TEXT_DIM }}>
            <div style={{ width: 7, height: 7, background: s.color, flexShrink: 0 }} />
            {s.name} <span style={{ color: TEXT, fontWeight: 600 }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RebalancePieChart({ snapshot, profileAware }) {
  if (!snapshot?.length) return null;
  const beforeSlices = snapshot.map((s, i) => ({
    name: profileAware ? s.label : s.symbol,
    value: parseFloat(s.current_pct?.toFixed(1) ?? 0),
    color: PIE_COLORS[i % PIE_COLORS.length],
  })).filter(s => s.value > 0);
  const afterSlices = snapshot.map((s, i) => ({
    name: profileAware ? s.label : s.symbol,
    value: parseFloat(s.target_pct?.toFixed(1) ?? 0),
    color: PIE_COLORS[i % PIE_COLORS.length],
  })).filter(s => s.value > 0);
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, marginTop: 20 }}>
      <div style={{ padding: "11px 18px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM,
                      textTransform: "uppercase", letterSpacing: "0.08em" }}>Allocation — current vs target</div>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AllocPie title="Current" slices={beforeSlices} />
        <div style={{ width: 1, background: BORDER, alignSelf: "stretch", flexShrink: 0 }} />
        <AllocPie title="Target" slices={afterSlices} />
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
        <span style={{ fontWeight: 700, fontSize: 13, color: "#0A1628" }}>{label}</span>
        <span style={{ fontSize: 11.5, color: over ? "#fb923c" : TEXT_DIM }}>
          {over ? `+${drift}% over` : `-${drift}% under`} target
        </span>
      </div>
      <div style={{ position: "relative", height: 11, background: "rgba(0,0,0,0.07)", overflow: "visible" }}>
        <div style={{ position: "absolute", left: `${(target / max) * 100}%`, top: -4,
                      width: 4, height: 19, background: "#0A1628", zIndex: 2, opacity: 0.7 }} />
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
      {/* Heading row with Update Profile */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: FONT_SERIF }}>
          Rebalance
          <InfoTip title="What is Rebalancing?">
            Over time, winning positions grow and losers shrink, pushing your
            portfolio away from your chosen allocation. Rebalancing trims the
            winners and tops up the losers to bring you back to target. We
            suggest trades when any holding drifts more than ~3% off.
          </InfoTip>
        </h1>
        <button type="button" onClick={() => setEditProfile(true)} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: GOLD, border: "none", padding: "7px 14px",
          color: TEXT, fontSize: 12, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          <User size={12} />
          Update profile
        </button>
      </div>

      {/* Profile subtitle */}
      <p style={{ margin: "0 0 20px", fontSize: 13, color: TEXT_DIM }}>
        {profileAware ? (
          <>
            Profile:{" "}
            <b style={{ color: TEXT, textTransform: "capitalize" }}>{profile}</b>
            {goal && GOAL_LABELS[goal] ? (
              <> &middot; Goal: <b style={{ color: TEXT }}>{GOAL_LABELS[goal]}</b></>
            ) : null}
          </>
        ) : (
          <>No investor profile set — <span style={{ color: GOLD, cursor: "pointer", fontWeight: 600 }}
               onClick={() => setEditProfile(true)}>set one</span> for personalised targets.</>
        )}
      </p>

      {/* Status banner */}
      <div style={{ padding: "14px 18px", marginBottom: 24,
                    background: allGood ? GREEN_BG : `rgba(249,115,22,0.14)`,
                    border: `2px solid ${allGood ? GREEN_BORDER : "rgba(249,115,22,0.5)"}`,
                    display: "flex", alignItems: "center", gap: 14 }}>
        {allGood ? <CheckCircle2 size={20} color={GREEN} /> : <AlertCircle size={20} color="#fb923c" />}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: allGood ? GREEN : "#fb923c" }}>
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

      {/* ── Top row: current donut | target donut | actions ── */}
      {(() => {
        const mkSlices = (pctKey) => (snapshot || []).map((s, i) => ({
          name: profileAware ? s.label : s.symbol,
          value: parseFloat((s[pctKey] || 0).toFixed(1)),
          color: PIE_COLORS[i % PIE_COLORS.length],
        })).filter(s => s.value > 0);
        const beforeSlices = mkSlices("current_pct");
        const afterSlices  = mkSlices("target_pct");
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* Current donut */}
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 18px" }}>
              <AllocPie title="Current allocation" slices={beforeSlices} />
            </div>
            {/* Target donut */}
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "16px 18px" }}>
              <AllocPie title="Target allocation" slices={afterSlices} />
            </div>
            {/* Recommended actions */}
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              {allGood ? (
                <div style={{ padding: "28px 24px", textAlign: "center", height: "100%",
                              display: "flex", flexDirection: "column", alignItems: "center",
                              justifyContent: "center" }}>
                  <div style={{ width: 48, height: 48, background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`,
                                display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <CheckCircle2 size={22} color={GREEN} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 6 }}>All on track</div>
                  <div style={{ fontSize: 12.5, color: TEXT_DIM, lineHeight: 1.6 }}>
                    Your mix matches your profile.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ padding: "11px 16px", borderBottom: `1px solid ${BORDER}`,
                                fontSize: 11, fontWeight: 700, color: TEXT_DIM,
                                textTransform: "uppercase", letterSpacing: "0.08em" }}>Recommended Actions</div>
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
                                maxHeight: 340, overflowY: "auto" }}>
                    {data.suggestions.map((s) => (
                      <SuggestionCard key={profileAware ? s.bucket : s.symbol} s={s} profileAware={profileAware} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Drift bars (left) + stats (right) ── */}
      {(() => {
        const totalMove = data.suggestions?.reduce((s, x) => s + (x.trade_value || 0), 0) ?? 0;
        const maxDrift  = [...(snapshot || [])].sort((a, b) =>
                            Math.abs(b.current_pct - b.target_pct) - Math.abs(a.current_pct - a.target_pct))[0];
        const sellCount = (data.suggestions || []).filter(s => s.action === "sell").length;
        const buyCount  = (data.suggestions || []).filter(s => s.action === "buy").length;
        const labelStyle = { fontSize: 10.5, fontWeight: 700, color: TEXT_DIM,
                             textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 };
        const valueStyle = { fontSize: 26, fontWeight: 700, color: TEXT, fontFamily: FONT_SERIF };
        const statCard   = { background: SURFACE, border: `1px solid ${BORDER}`, padding: "20px 24px" };
        return (
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, alignItems: "start" }}>
            {/* Left: ticker drift bars */}
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "20px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, marginBottom: 16,
                            textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {profileAware ? "Asset Mix vs Target" : "Current vs Target"}
                <InfoTip title="Drift bars">
                  Each bar shows a holding's current allocation vs its target.
                  The vertical tick marks the target. Blue = on or below, orange = overweight.
                </InfoTip>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {snapshot && snapshot.map((s) => (
                  <DriftBar key={profileAware ? s.bucket : s.symbol}
                    current={s.current_pct} target={s.target_pct}
                    label={profileAware ? s.label : s.symbol}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 16, fontSize: 11.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 20, height: 5, background: "#6366F1" }} />
                  <span style={{ color: TEXT_DIM }}>Current</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 4, height: 14, background: "#0A1628", opacity: 0.7 }} />
                  <span style={{ color: TEXT_DIM }}>Target</span>
                </div>
              </div>
            </div>

            {/* Right: 4 stat cards stacked */}
            {!allGood && data.suggestions?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={statCard}>
                  <div style={labelStyle}>Total to move</div>
                  <div style={valueStyle}>{fmt$(totalMove)}</div>
                  <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>across {data.suggestions.length} trade{data.suggestions.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={statCard}>
                  <div style={labelStyle}>Trade breakdown</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginTop: 2 }}>
                    <span style={{ ...valueStyle, color: "#EF4444" }}>{sellCount}</span>
                    <span style={{ fontSize: 12, color: TEXT_DIM }}>sell{sellCount !== 1 ? "s" : ""}</span>
                    <span style={{ ...valueStyle, color: GREEN }}>{buyCount}</span>
                    <span style={{ fontSize: 12, color: TEXT_DIM }}>buy{buyCount !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>suggested by Meridian</div>
                </div>
                {maxDrift && (
                  <div style={statCard}>
                    <div style={labelStyle}>Biggest drift</div>
                    <div style={valueStyle}>{profileAware ? maxDrift.label : maxDrift.symbol}</div>
                    <div style={{ fontSize: 11, color: "#fb923c", marginTop: 3 }}>
                      {Math.abs(maxDrift.current_pct - maxDrift.target_pct).toFixed(1)}% off target
                    </div>
                  </div>
                )}
              </div>
            ) : <div />}
          </div>
        );
      })()}

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
