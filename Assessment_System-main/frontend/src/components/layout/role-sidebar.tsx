"use client";

import { useNavigate, useLocation } from "react-router-dom";
import {
  LogOut,
  LayoutDashboard,
  Users,
  ClipboardList,
  History,
  RefreshCw,
  FileText,
  BookOpen,
  Send,
  X,
  Shield,
  Award,
  TrendingUp,
  Bell,
  User,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { AccountRole } from "@/lib/types";
import { useEffect } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navByRole: Record<AccountRole, NavItem[]> = {
  controller: [
    {
      label: "Dashboard",
      href: "/controller/dashboard",
      icon: LayoutDashboard,
    },
    { label: "Students", href: "/controller/students", icon: Users },
    { label: "Cycles & Rounds", href: "/controller/cycles", icon: RefreshCw },
    {
      label: "Enroll Students",
      href: "/controller/enroll",
      icon: ClipboardList,
    },
    { label: "Assign Roles", href: "/controller/assign", icon: Users },
    {
      label: "Statistics",
      href: "/controller/statistics",
      icon: TrendingUp,
    },
    {
      label: "Auto-Grading",
      href: "/controller/questions-grading",
      icon: FileText,
    },
    {
      label: "Reports & Integrity",
      href: "/controller/reports",
      icon: History,
    },
  ],
  assessor: [
    { label: "Dashboard", href: "/assessor/students", icon: LayoutDashboard },
    { label: "Competencies", href: "/assessor/competencies", icon: BookOpen },
    { label: "Submissions", href: "/assessor/submissions", icon: FileText },
    {
      label: "Auto-Grading",
      href: "/assessor/automated-grading",
      icon: CheckCircle2,
    },
    {
      label: "Reports",
      href: "/assessor/reports",
      icon: History,
    },
  ],
  verifier: [
    { label: "Dashboard", href: "/verifier/results", icon: LayoutDashboard },
    { label: "Competencies", href: "/verifier/competencies", icon: BookOpen },
    { label: "Activity Log", href: "/verifier/log", icon: History },
    { label: "Send Report", href: "/verifier/report", icon: Send },
    {
      label: "Reports",
      href: "/verifier/reports",
      icon: FileText,
    },
  ],
  student: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "My Competencies", href: "/dashboard?tab=competencies", icon: BookOpen },
    { label: "My Assessments", href: "/dashboard?tab=assessments", icon: ClipboardList },
    { label: "My Results", href: "/dashboard?tab=results", icon: Award },
    { label: "My Progress", href: "/dashboard?tab=progress", icon: TrendingUp },
    { label: "Notifications", href: "/dashboard?tab=notifications", icon: Bell },
    { label: "My Profile", href: "/dashboard?tab=profile", icon: User },
  ],
};

interface RoleSidebarProps {
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
}

export function RoleSidebar({ isOpen = true, onClose }: RoleSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const currentSearch = location.search;
  const { user, roleContext, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleNavClick = (href: string) => {
    navigate(href);
    onClose?.();
  };

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const accountRole = user?.accountRole ?? "assessor";
  const effectiveRole = roleContext?.assignedRole || accountRole;
  const navItems = navByRole[effectiveRole] ?? [];

  const roleLabel: Record<AccountRole, string> = {
    controller: "Control",
    assessor: "Assessor",
    verifier: "Verifier",
    student: "Student",
  };

  const isItemActive = (href: string) => {
    if (href.includes("?")) {
      const [path, search] = href.split("?");
      return pathname === path && currentSearch === `?${search}`;
    }
    if (href === "/dashboard") {
      return pathname === "/dashboard" && (!currentSearch || currentSearch === "" || currentSearch === "?tab=overview");
    }
    return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Modern Sidebar Inspired by Elsewedy Dashboard */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#0d0f17] text-slate-800 dark:text-neutral-200 flex flex-col h-screen border-r border-slate-100 dark:border-white/10 transition-transform duration-300 ease-in-out shadow-lg lg:shadow-none select-none",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand Header */}
        <div className="pt-7 pb-6 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/elsewedy-emblem.png"
              alt="Elsewedy Logo"
              className="w-10 h-10 object-contain drop-shadow-sm shrink-0"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[#e21836] font-extrabold text-[19px] tracking-tight">
                Elsewedy
              </span>
              <span className="text-[#e21836] font-extrabold text-[19px] tracking-tight">
                Dashboard
              </span>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card Pill */}
        <div className="px-5 mb-3">
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#c8102e] to-[#e21836] text-white font-bold text-xs flex items-center justify-center shrink-0">
              {(user?.fullName || "E").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                {user?.fullName || "Assessment Staff"}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-[#e21836]/10 text-[#e21836] dark:text-[#ff4d6a]">
                  <Shield className="w-2.5 h-2.5" />
                  {roleLabel[effectiveRole]}
                </span>
                {roleContext?.classGroup && (
                  <span className="text-[9px] text-slate-500 font-medium">
                    {roleContext.classGroup}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item.href);

            return (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 font-semibold text-[13px] text-left cursor-pointer",
                  active
                    ? "bg-[#e21836] text-white shadow-md shadow-[#e21836]/25 font-bold"
                    : "text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/5",
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 shrink-0 transition-transform",
                    active
                      ? "text-white"
                      : "text-slate-500 dark:text-neutral-400 group-hover:text-slate-800",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="p-4 border-t border-slate-100 dark:border-white/10 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[#e21836] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors font-semibold text-[14px] cursor-pointer"
          >
            <LogOut className="w-5 h-5 shrink-0 text-[#e21836]" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
