"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import type { AccountRole, CurrentRoleContext } from "./types";
import {
  authApi,
  api,
  type LoginResponse,
  type UserMeResponse,
} from "./api-client";

export type AuthState =
  | "Initializing"
  | "Unauthenticated"
  | "RedirectingToCAS"
  | "ProcessingCallback"
  | "Authenticated"
  | "AuthenticationError";

export interface User {
  id: string;
  accountId?: number;
  username: string;
  fullName: string;
  accountRole: AccountRole;
  token?: string;
  email?: string;
  nationalId?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  authState: AuthState;
  authError: string | null;
  roleContext: CurrentRoleContext | null;
  isRoleLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  redirectToCas: (returnPath?: string) => Promise<void>;
  processSsoCallback: (token: string) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Map backend role names to frontend AccountRole
export function mapRoleToAccountRole(roleName: string): AccountRole {
  const normalized = (roleName || "").toLowerCase();
  if (
    normalized.includes("admin") ||
    normalized.includes("superadmin") ||
    normalized.includes("control")
  ) {
    return "controller";
  }
  if (
    normalized.includes("assessor") ||
    normalized.includes("engineer") ||
    normalized.includes("teacher") ||
    normalized.includes("instructor")
  ) {
    return "assessor";
  }
  if (
    normalized.includes("verifier") ||
    normalized.includes("board") ||
    normalized.includes("reviewer")
  ) {
    return "verifier";
  }
  if (normalized.includes("student")) {
    return "student";
  }
  return "student"; // default fallback
}

export function getDashboardPathForRole(role: AccountRole): string {
  switch (role) {
    case "controller":
      return "/controller/dashboard";
    case "assessor":
      return "/assessor/students";
    case "verifier":
      return "/verifier/results";
    case "student":
    default:
      return "/dashboard";
  }
}

async function resolveRoleContext(
  userId: string,
  accountRole: AccountRole,
): Promise<CurrentRoleContext | null> {
  // Controller and Student have no cycle instructor assignment
  if (accountRole === "controller" || accountRole === "student") {
    return { accountRole };
  }

  try {
    const allAssignments = await api.courseRoundInstructors.getByInstructor(
      Number(userId),
    );

    if (!allAssignments || allAssignments.length === 0) {
      if (accountRole === "verifier") {
        return {
          accountRole: "verifier",
          assignedRole: "verifier",
          cycleId: "1",
          cycleName: "Round 1",
        };
      }
      if (accountRole === "assessor") {
        return {
          accountRole: "assessor",
          assignedRole: "assessor",
          cycleId: "1",
          cycleName: "Round 1",
        };
      }
      return null;
    }

    const assignment = allAssignments[0];

    let courseRound: any = { roundNumber: 1, statusId: 1 };
    try {
      courseRound = await api.courseRounds.getById(assignment.courseRoundId);
    } catch {
      // fallback
    }

    const assignedRole = (
      assignment.roleName?.toLowerCase() === "verifier" || accountRole === "verifier"
        ? "verifier"
        : "assessor"
    ) as "assessor" | "verifier";

    return {
      accountRole,
      assignedRole,
      cycleId: assignment.courseRoundId?.toString() || "1",
      cycleName: `Round ${courseRound.roundNumber || 1}`,
    };
  } catch (error) {
    console.error("Error resolving role context:", error);
    if (accountRole === "verifier") {
      return {
        accountRole: "verifier",
        assignedRole: "verifier",
        cycleId: "1",
        cycleName: "Round 1",
      };
    }
    return null;
  }
}

export function AuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>("Initializing");
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleContext, setRoleContext] = useState<CurrentRoleContext | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const isRedirectingRef = useRef(false);

  // Helper: Build and redirect to CAS
  const redirectToCas = useCallback(async (returnPath?: string) => {
    if (isRedirectingRef.current) return;
    isRedirectingRef.current = true;
    setAuthState("RedirectingToCAS");

    if (returnPath) {
      sessionStorage.setItem("cas_return_url", returnPath);
    }

    try {
      // 1. Try to get official CAS configuration from backend
      const config = await authApi.getCasConfig();
      if (config?.loginUrl) {
        window.location.href = config.loginUrl;
        return;
      }
    } catch (e) {
      console.warn("Could not fetch CAS config from backend, using standard CAS contract:", e);
    }

    // 2. Standard CAS URL contract for Assessment System (Entity ID 700)
    const casBase = "https://centerlizedlogin.sewedy.com.eg";
    const callback = `${window.location.origin}/sso-callback`;
    const targetUrl = `${casBase}?businessEntityId=700&redirect=${encodeURIComponent(callback)}`;
    window.location.href = targetUrl;
  }, []);

  // Process CAS callback
  const processSsoCallback = useCallback(async (token: string): Promise<User> => {
    setAuthState("ProcessingCallback");
    setAuthError(null);

    try {
      const response: UserMeResponse = await authApi.ssoCallback({
        token,
        redirectUrl: `${window.location.origin}/sso-callback`,
      });

      const accountRole = (response.role as AccountRole) || mapRoleToAccountRole(response.roleName);

      const userData: User = {
        id: response.userId.toString(),
        accountId: response.accountId,
        username: response.username || response.email.split("@")[0],
        fullName: response.fullName || response.fullNameEn,
        accountRole,
        token: response.token,
        email: response.email,
        nationalId: response.nationalId,
      };

      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));
      setAuthState("Authenticated");

      setIsRoleLoading(true);
      resolveRoleContext(userData.id, userData.accountRole).then((context) => {
        setRoleContext(context);
        setIsRoleLoading(false);
      });

      return userData;
    } catch (err: any) {
      const msg = err?.message || "Failed to authenticate with CAS.";
      setAuthError(msg);
      setAuthState("AuthenticationError");
      throw err;
    }
  }, []);

  // Startup verification: check existing session via GET /api/auth/me
  useEffect(() => {
    let isMounted = true;

    // Do not auto-check / auto-redirect if we are currently on the callback route
    if (window.location.pathname.startsWith("/sso-callback")) {
      setAuthState("ProcessingCallback");
      return;
    }

    async function initAuth() {
      try {
        // First check backend /api/auth/me (validates session cookie or bearer token)
        const me = await authApi.getMe();
        if (!isMounted) return;

        const accountRole = (me.role as AccountRole) || mapRoleToAccountRole(me.roleName);
        const userData: User = {
          id: me.userId.toString(),
          accountId: me.accountId,
          username: me.username || me.email.split("@")[0],
          fullName: me.fullName || me.fullNameEn,
          accountRole,
          token: me.token,
          email: me.email,
          nationalId: me.nationalId,
        };

        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));
        setAuthState("Authenticated");

        setIsRoleLoading(true);
        const context = await resolveRoleContext(userData.id, userData.accountRole);
        if (isMounted) {
          setRoleContext(context);
          setIsRoleLoading(false);
        }
      } catch {
        if (!isMounted) return;
        // Check if there is stored user in localStorage to try as fallback
        const stored = localStorage.getItem("user");
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as User;
            setUser(parsed);
            setAuthState("Authenticated");
            setIsRoleLoading(true);
            resolveRoleContext(parsed.id, parsed.accountRole).then((context) => {
              if (isMounted) {
                setRoleContext(context);
                setIsRoleLoading(false);
              }
            });
            return;
          } catch {
            localStorage.removeItem("user");
          }
        }

        // Unauthenticated session
        setUser(null);
        setAuthState("Unauthenticated");

        // Check if user specifically requested manual login with query param ?manual=true
        const search = new URLSearchParams(window.location.search);
        const isManual = search.get("manual") === "true";

        if (!isManual) {
          // Automatic login flow: redirect to CAS immediately
          redirectToCas(window.location.pathname + window.location.search);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [redirectToCas]);

  const login = async (email: string, password: string) => {
    setAuthState("Initializing");
    try {
      const response: LoginResponse = await authApi.login({ email, password });
      const accountRole = mapRoleToAccountRole(response.roleName);

      const userData: User = {
        id: response.accountId.toString(),
        accountId: response.accountId,
        username: response.email.split("@")[0],
        fullName: response.fullNameEn,
        accountRole,
        token: response.token,
        email: response.email,
      };

      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));
      setAuthState("Authenticated");

      setIsRoleLoading(true);
      const context = await resolveRoleContext(userData.id, userData.accountRole);
      setRoleContext(context);
      setIsRoleLoading(false);
    } catch (err: any) {
      setAuthState("Unauthenticated");
      throw err;
    }
  };

  const logout = async () => {
    try {
      const result = await authApi.logout();
      setUser(null);
      setRoleContext(null);
      localStorage.removeItem("user");
      setAuthState("Unauthenticated");

      if (result?.casLogoutUrl) {
        window.location.href = result.casLogoutUrl;
      } else {
        window.location.href = "/login";
      }
    } catch {
      setUser(null);
      setRoleContext(null);
      localStorage.removeItem("user");
      setAuthState("Unauthenticated");
      window.location.href = "/login";
    }
  };

  const isLoading = authState === "Initializing" || authState === "RedirectingToCAS";

  const contextValue = useMemo(
    () => ({
      user,
      isLoading,
      authState,
      authError,
      roleContext,
      isRoleLoading,
      login,
      logout,
      redirectToCas,
      processSsoCallback,
    }),
    [
      user,
      isLoading,
      authState,
      authError,
      roleContext,
      isRoleLoading,
      login,
      logout,
      redirectToCas,
      processSsoCallback,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined)
    throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function useCurrentRole(): CurrentRoleContext | null {
  const { roleContext } = useAuth();
  return roleContext;
}
