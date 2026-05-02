import { useState } from "react";
import {
  GOLD, GOLD_BG, GOLD_BORDER, ACCENT_DIM,
  SURFACE, BG, TEXT, TEXT_DIM,
} from "../theme.js";
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
      minHeight: "100vh", background: BG, display: "flex", alignItems: "center",
      justifyContent: "center", padding: "32px",
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: SURFACE,
        border: `1px solid ${ACCENT_DIM}`, borderRadius: 14,
        padding: "36px 32px 28px", boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 14px", borderRadius: 99,
          background: GOLD_BG, border: `1px solid ${GOLD_BORDER}`,
          marginBottom: 22,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD }} />
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: GOLD,
          }}>Folio</span>
        </div>

        <h1 style={{
          fontSize: 24, fontWeight: 800, color: TEXT, margin: 0,
          letterSpacing: "-0.02em",
        }}>
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{ fontSize: 12.5, color: TEXT_DIM, marginTop: 6, marginBottom: 20 }}>
          {isSignup
            ? "Sign up with your email to start tracking your portfolio."
            : "Sign in to access your portfolio."}
        </p>

        <div style={{
          display: "flex", padding: 3, borderRadius: 10,
          background: BG, border: `1px solid ${ACCENT_DIM}`, marginBottom: 22,
        }}>
          <ModeTab active={!isSignup} onClick={() => switchMode("signin")}>Sign in</ModeTab>
          <ModeTab active={isSignup}  onClick={() => switchMode("signup")}>Sign up</ModeTab>
        </div>

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <Field label="Name" value={displayName} onChange={setName}
                   autoComplete="name" autoFocus />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail}
                 autoComplete="email" autoFocus={!isSignup} />
          <Field label="Password" type="password" value={password} onChange={setPassword}
                 autoComplete={isSignup ? "new-password" : "current-password"}
                 hint={isSignup ? "At least 6 characters" : null} />

          {error && (
            <div style={{
              fontSize: 12, color: "#f87171",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: 8, padding: "8px 10px", marginTop: 4, marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 8,
              background: GOLD, color: BG, border: "none",
              fontWeight: 700, fontSize: 13.5, letterSpacing: "0.02em",
              cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
              opacity: canSubmit && !submitting ? 1 : 0.55,
              fontFamily: "inherit", marginTop: 4,
            }}>
            {submitting
              ? (isSignup ? "Creating account…" : "Signing in…")
              : (isSignup ? "Create account" : "Sign in")}
          </button>
        </form>

        <div style={{
          marginTop: 18, paddingTop: 14, borderTop: `1px solid ${ACCENT_DIM}`,
          fontSize: 11.5, color: TEXT_DIM, textAlign: "center",
        }}>
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
      flex: 1, padding: "8px 0", borderRadius: 7, border: "none",
      background: active ? GOLD_BG : "transparent",
      color: active ? GOLD : TEXT_DIM,
      fontWeight: active ? 700 : 500, fontSize: 12.5,
      fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.02em",
      transition: "background 0.15s, color 0.15s",
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

function Field({ label, value, onChange, type = "text", autoComplete, autoFocus, hint }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: TEXT_DIM, marginBottom: 6,
      }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 8,
          background: BG, color: TEXT,
          border: `1px solid ${focused ? GOLD_BORDER : ACCENT_DIM}`,
          fontSize: 13.5, fontFamily: "inherit", outline: "none",
          transition: "border-color 0.15s", boxSizing: "border-box",
        }}
      />
      {hint && (
        <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}
