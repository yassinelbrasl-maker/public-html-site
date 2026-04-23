import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";

/**
 * Auth context — wraps the existing /api/auth.php JWT flow.
 *
 * The legacy server returns a JWT on successful login. We stash it in
 * localStorage and send it as Authorization: Bearer <token> on subsequent
 * requests that need auth.
 */

export interface AuthUser {
  id: string | number;
  email: string;
  name?: string;
  role?: string;
  isMember?: boolean;
  modules?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

const Ctx = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "cortoba-auth-token";

export function authToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

/** Fetch helper that attaches Authorization if we have a token. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const t = authToken();
  const headers = new Headers(init?.headers);
  if (t && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${t}`);
  }
  return fetch(path, { ...init, headers });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(authToken);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!authToken());

  // On mount or when token changes, fetch /me
  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/cortoba-plateforme/api/auth.php?action=me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && (data.user || data.email)) {
          const u = data.user || data;
          setUser({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            isMember: u.isMember,
            modules: u.modules,
          });
        } else {
          // invalid token — clear it
          window.localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await fetch(
          "/cortoba-plateforme/api/auth.php?action=login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          }
        );
        const raw = await res.json().catch(() => ({}));
        if (!res.ok || raw.success === false) {
          return {
            ok: false as const,
            error: raw.error || `HTTP ${res.status}`,
          };
        }
        // PHP jsonOk() wraps payload in { success: true, data: {...} }.
        // Fallback to top-level for compat with other shapes.
        const payload = raw.data || raw;
        const newToken =
          payload.token || payload.access_token || raw.token || raw.access_token;
        if (!newToken) {
          return { ok: false as const, error: "Réponse inattendue du serveur." };
        }
        window.localStorage.setItem(STORAGE_KEY, newToken);
        setToken(newToken);
        return { ok: true as const };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
    []
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
