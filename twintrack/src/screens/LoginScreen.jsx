import { useState } from "react";
import { GOLD, GOLD_BG, GOLD_BORDER, BORDER, BORDER_MED, SURFACE, SURFACE_2, BG, TEXT, TEXT_SEC, TEXT_DIM, RED } from "../theme.js";
import { login, signup } from "../api.js";

export default function LoginScreen({ onLogin }) {
  const [mode, setMode]         = useState("signin");   // "signin" | "signup"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setName]  = useState("");
  const [error, setError]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === "signup";
  const canSubmit =
    email.includes("@") && password.length >= 6 &&
    (!isSignup || displayName.trim().length > 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const user = isSignup
        ? await signup({ email: email.trim(), password, displayName: displayName.trim() })
        : await login({ email: email.trim(), password });
      onLogin(user, isSignup);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setError("");
  };

  return (
    <div style={{
      minHeight: "100vh", background: BG, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
      position: "relative", overflow: "hidden",
    }}>
      {/* Ambient background blobs */}
      <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "55%", height: "55%",
                    background: "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)",
                    pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-10%", right: "-5%", width: "45%", height: "45%",
                    background: "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)",
                    pointerEvents: "none" }} />

      <div style={{
        width: "100%", maxWidth: 420, position: "relative", zIndex: 1,
        background: "rgba(15,31,61,0.75)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${BORDER_MED}`,
        borderRadius: 20,
        padding: "40px 36px 32px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, background: GOLD_BG,
            border: `1px solid ${GOLD_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>◈</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, letterSpacing: "-0.02em" }}>Folio</div>
            <div style={{ fontSize: 11, color: TEXT_DIM }}>Portfolio Dashboard</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{ fontSize: 13, color: TEXT_DIM, marginTop: 0, marginBottom: 24, lineHeight: 1.5 }}>
          {isSignup ? "Start tracking your wealth in one place." : "Sign in to access your portfolio."}
        </p>

        {/* Mode toggle */}
        <div style={{ display: "flex", padding: 3, borderRadius: 11, background: BG,
                      border: `1px solid ${BORDER}`, marginBottom: 24 }}>
          <ModeTab active={!isSignup} onClick={() => switchMode("signin")}>Sign in</ModeTab>
          <ModeTab active={isSignup}  onClick={() => switchMode("signup")}>Sign up</ModeTab>
        </div>

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <Field label="Full Name" value={displayName} onChange={setName}
                   autoComplete="name" autoFocus placeholder="Jane Smith" />
          )}
          <Field label="Email address" type="email" value={email} onChange={setEmail}
                 autoComplete="email" autoFocus={!isSignup} placeholder="you@example.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword}
                 autoComplete={isSignup ? "new-password" : "current-password"}
                 placeholder={isSignup ? "At least 6 characters" : "Your password"} />

          {error && (
            <div style={{
              fontSize: 12.5, color: "#FC8181",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 9, padding: "10px 12px", marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={!canSubmit || submitting} style={{
            width: "100%", padding: "12px 0", borderRadius: 10,
            background: canSubmit && !submitting
              ? "linear-gradient(135deg, #F59E0B, #D97706)"
              : "rgba(245,158,11,0.3)",
            color: BG, border: "none",
            fontWeight: 700, fontSize: 14, letterSpacing: "0.01em",
            cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
            boxShadow: canSubmit && !submitting ? "0 4px 16px rgba(245,158,11,0.3)" : "none",
            transition: "all 0.2s",
          }}>
            {submitting
              ? (isSignup ? "Creating account…" : "Signing in…")
              : (isSignup ? "Create account" : "Sign in")}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${BORDER}`,
                      fontSize: 12.5, color: TEXT_DIM, textAlign: "center" }}>
          {isSignup ? (
            <>Already have an account?{" "}
              <LinkBtn onClick={() => switchMode("signin")}>Sign in</LinkBtn></>
          ) : (
            <>New here?{" "}
              <LinkBtn onClick={() => switchMode("signup")}>Create an account</LinkBtn></>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
      background: active ? GOLD_BG : "transparent",
      color: active ? GOLD : TEXT_DIM,
      fontWeight: active ? 700 : 500, fontSize: 13,
      cursor: "pointer", letterSpacing: "0.01em",
      transition: "background 0.15s, color 0.15s",
      boxShadow: active ? `inset 0 0 0 1px ${GOLD_BORDER}` : "none",
    }}>{children}</button>
  );
}

function LinkBtn({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: "none", border: "none", padding: 0, margin: 0,
      color: GOLD, fontWeight: 600, fontSize: "inherit",
      fontFamily: "inherit", cursor: "pointer",
    }}>{children}</button>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, autoFocus, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em",
        color: TEXT_DIM, marginBottom: 7,
      }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "11px 14px", borderRadius: 10,
          background: "rgba(10,22,40,0.7)", color: TEXT,
          border: `1px solid ${focused ? GOLD_BORDER : BORDER}`,
          fontSize: 14, outline: "none",
          transition: "border-color 0.15s", boxSizing: "border-box",
          boxShadow: focused ? `0 0 0 3px rgba(245,158,11,0.1)` : "none",
        }}
      />
    </div>
  );
}
