const TOKEN_KEY = "folio.session.token";

export const getToken   = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken   = (t) => sessionStorage.setItem(TOKEN_KEY, t);
export const clearToken = ()  => sessionStorage.removeItem(TOKEN_KEY);

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
  }
  return res;
}

export async function apiJson(url, opts = {}) {
  const res = await apiFetch(url, opts);
  return res.json();
}

export async function signup({ email, password, displayName }) {
  const res = await apiFetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sign-up failed.");
  setToken(data.token);
  return data.user;
}

export async function login({ email, password }) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sign-in failed.");
  setToken(data.token);
  return data.user;
}

export async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } finally {
    clearToken();
  }
}

export async function fetchCurrentUser() {
  if (!getToken()) return null;
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) {
    clearToken();
    return null;
  }
  const data = await res.json();
  return data.user;
}
