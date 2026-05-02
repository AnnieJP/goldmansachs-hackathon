import { useState, useEffect, useCallback } from "react";
import TwinTrack from "./TwinTrack.jsx";
import LoginScreen from "./screens/LoginScreen.jsx";
import { fetchCurrentUser, logout, setUnauthorizedHandler } from "./api.js";
import { BG, TEXT_DIM, TEXT } from "./theme.js";

export default function App() {
  const [user, setUser]       = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((u) => { if (!cancelled) setUser(u); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  // If the API ever 401s mid-session (token expired / server restarted), drop to login.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  if (checking) {
    return (
      <div style={{
        minHeight: "100vh", background: BG, display: "flex",
        alignItems: "center", justifyContent: "center",
        color: TEXT_DIM, fontSize: 14,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        Loading…
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={setUser} />;
  return <TwinTrack currentUser={user} onLogout={handleLogout} />;
}
