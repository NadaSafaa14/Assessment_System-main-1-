"use client";

import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, getDashboardPathForRole } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { PendingAssignmentScreen } from "./pending-assignment-screen";

interface RoleRouterProps {
  children: React.ReactNode;
}

export function RoleRouter({ children }: RoleRouterProps) {
  const { user, isLoading, roleContext, isRoleLoading, redirectToCas } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    if (isLoading || isRoleLoading) return;

    if (!user) {
      const search = new URLSearchParams(window.location.search);
      const isManual = search.get("manual") === "true";
      if (isManual) {
        navigate("/login?manual=true", { replace: true });
      } else {
        redirectToCas(pathname);
      }
      return;
    }

    const accountRole = user.accountRole;

    // Student access protection
    if (accountRole === "student") {
      if (!pathname.startsWith("/dashboard")) {
        navigate("/dashboard", { replace: true });
      }
      return;
    }

    // Controller access protection
    if (accountRole === "controller") {
      if (!pathname.startsWith("/controller")) {
        navigate("/controller/dashboard", { replace: true });
      }
      return;
    }

    // Assessors & Verifiers access protection based on assigned/effective role
    const assignedRole = roleContext?.assignedRole || accountRole;
    if (assignedRole === "assessor") {
      if (!pathname.startsWith("/assessor")) {
        if (pathname === "/controller/reports") {
          navigate("/assessor/reports", { replace: true });
          return;
        }
        if (pathname === "/controller/questions-grading") {
          navigate("/assessor/automated-grading", { replace: true });
          return;
        }
        navigate("/assessor/students", { replace: true });
      }
    } else if (assignedRole === "verifier") {
      if (!pathname.startsWith("/verifier")) {
        if (pathname === "/controller/reports") {
          navigate("/verifier/reports", { replace: true });
          return;
        }
        navigate("/verifier/results", { replace: true });
      }
    }
  }, [user, isLoading, isRoleLoading, roleContext, pathname, navigate, redirectToCas]);

  if (isLoading || isRoleLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07070a] text-white gap-4">
        <div className="w-10 h-10 border-3 border-white/10 border-t-[#e21836] rounded-full animate-spin" />
        <p className="text-xs text-neutral-400 font-medium">Resolving Assessment System role...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07070a] text-white gap-4">
        <div className="w-10 h-10 border-3 border-white/10 border-t-[#e21836] rounded-full animate-spin" />
        <p className="text-xs text-neutral-400 font-medium">Redirecting to Elsewedy CAS...</p>
      </div>
    );
  }

  // Only block if user has no role at all and no assignment
  if (user.accountRole !== "controller" && user.accountRole !== "verifier" && user.accountRole !== "student" && !roleContext) {
    return <PendingAssignmentScreen />;
  }

  return <>{children}</>;
}
