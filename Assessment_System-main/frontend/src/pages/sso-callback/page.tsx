"use client";

import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { useAuth, getDashboardPathForRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export default function SsoCallbackPage() {
  const navigate = useNavigate();
  const { processSsoCallback, redirectToCas } = useAuth();
  const [statusMessage, setStatusMessage] = useState(
    "Verifying authentication with Elsewedy CAS...",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  // Guard against React 19 double-invocations in Strict Mode
  const executionStartedRef = useRef(false);

  useEffect(() => {
    if (executionStartedRef.current) return;
    executionStartedRef.current = true;

    async function handleCallback() {
      try {
        // 1. Extract params from URL search or hash
        const searchParams = new URLSearchParams(window.location.search);
        let token = searchParams.get("token") || searchParams.get("jwtToken");

        // Check hash fragment fallback
        if (!token && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          token = hashParams.get("token") || hashParams.get("jwtToken");
        }

        const error = searchParams.get("error") || searchParams.get("message");
        const errorDesc = searchParams.get("error_description");

        // 2. Security requirement: Immediately remove sensitive authentication params from browser URL
        window.history.replaceState(null, "", window.location.pathname);

        // Check if CAS passed an error
        if (error) {
          setIsProcessing(false);
          setErrorCode("CAS_AUTH_ERROR");
          setErrorMessage(errorDesc || error || "Authentication was cancelled or failed at CAS.");
          return;
        }

        if (!token) {
          setIsProcessing(false);
          setErrorCode("MISSING_TOKEN");
          setErrorMessage(
            "No authentication token was received from CAS. Please ensure you are initiating login through Elsewedy CAS with Business Entity ID 700.",
          );
          return;
        }

        setStatusMessage("Validating CAS System token and mapping Assessment System role...");

        // 3. Process callback with backend
        const user = await processSsoCallback(token);

        setStatusMessage(`Authenticated as ${user.fullName} (${user.accountRole}). Redirecting to dashboard...`);

        // 4. Determine destination dashboard
        const returnUrl = sessionStorage.getItem("cas_return_url");
        sessionStorage.removeItem("cas_return_url");

        const targetDashboard = returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("/login") && !returnUrl.startsWith("/sso-callback")
          ? returnUrl
          : getDashboardPathForRole(user.accountRole);

        // Brief delay for visual confirmation of successful SSO
        setTimeout(() => {
          navigate(targetDashboard, { replace: true });
        }, 500);
      } catch (err: any) {
        setIsProcessing(false);
        const message = err?.message || "An error occurred while completing centralized authentication.";
        setErrorMessage(message);
        if (message.includes("not exist in the Assessment System database")) {
          setErrorCode("ACCOUNT_NOT_ENROLLED");
        } else {
          setErrorCode("VALIDATION_FAILED");
        }
      }
    }

    handleCallback();
  }, [processSsoCallback, navigate]);

  return (
    <div className="min-h-screen bg-[#07070a] text-[#f2f2f7] flex flex-col items-center justify-center p-4 select-none relative overflow-hidden">
      {/* Background ambient glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-20 bg-[#e21836]"
        style={{ top: "20%", left: "50%", transform: "translate(-50%, -50%)" }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md bg-[#111116] border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 text-center"
      >
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <img
            src="/elsewedy-emblem.png"
            alt="Elsewedy Electrometer"
            className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(226,24,54,0.4)]"
          />
          <div className="flex flex-col text-left leading-none tracking-tight">
            <span className="text-[15px] font-black uppercase tracking-tight">
              <span className="text-[#a0a5ad]">EL</span>
              <span className="text-[#e21836]">SEWEDY</span>
            </span>
            <span className="text-[9.5px] font-black uppercase tracking-wider mt-0.5">
              <span className="text-[#e21836]">ELECTRO</span>
              <span className="text-[#a0a5ad]">METER</span>
            </span>
          </div>
        </div>

        {isProcessing ? (
          <div className="space-y-6">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                className="w-14 h-14 border-3 border-white/10 border-t-[#e21836] rounded-full"
              />
              <ShieldCheck className="w-6 h-6 text-[#e21836] absolute" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white mb-2">
                Centralized Authentication
              </h2>
              <p className="text-xs text-neutral-400 font-medium">
                {statusMessage}
              </p>
            </div>

            <div className="pt-2 text-[11px] text-neutral-500 font-mono">
              Business Entity: Assessment System (700)
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white mb-2">
                Authentication Failed
              </h2>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 text-xs text-red-300 text-left leading-relaxed">
                {errorMessage}
              </div>
            </div>

            {errorCode === "ACCOUNT_NOT_ENROLLED" && (
              <p className="text-xs text-neutral-400">
                Your CAS identity was confirmed, but this account is not registered in the Assessment System. Please contact the administrator to assign your role.
              </p>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => redirectToCas()}
                className="w-full bg-[#e21836] hover:bg-[#b80f2d] text-white font-semibold h-10 rounded-xl flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry CAS Login
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/login?manual=true")}
                className="w-full border-white/10 text-neutral-300 hover:text-white hover:bg-white/5 h-10 rounded-xl"
              >
                Manual Test Login
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
