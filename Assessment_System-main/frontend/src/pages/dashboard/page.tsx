"use client";

import React, { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Layers,
  Mail,
  ShieldCheck,
  User,
  AlertCircle,
  FileText,
  TrendingUp,
  Activity,
  Target,
  Sparkles,
  ClipboardList,
  Bell,
  Check,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useAuth } from "@/lib/auth-context";
import { useApiQuery } from "@/hooks/use-api";
import { api, type CompetencyResult, type Student, type CourseRoundAssignment } from "@/lib/api-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";

export default function StudentDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const { user } = useAuth();

  const studentAccountId = user?.accountId || 0;

  // 1. Fetch student's profile from database
  const { data: studentProfile, isLoading: loadingProfile } = useApiQuery<Student | null>(
    () => (studentAccountId ? api.students.getById(studentAccountId) : Promise.resolve(null)),
    [studentAccountId]
  );

  // 2. Fetch student's official graded competency results
  const { data: competencyResults, isLoading: loadingResults } = useApiQuery<CompetencyResult[]>(
    () => (studentAccountId ? api.competencyResults.getAll({ studentId: studentAccountId }) : Promise.resolve([])),
    [studentAccountId]
  );

  // 3. Fetch courses/competencies catalog
  const { data: courses } = useApiQuery(() => api.courses.getAll(), []);

  // 4. Fetch assignments
  const { data: assignments } = useApiQuery<CourseRoundAssignment[]>(() => api.courseRoundAssignments.getAll(), []);

  // Compute stats
  const results = competencyResults || [];
  const passedCount = results.filter(
    (r) =>
      r.resultStatusName?.toLowerCase() === "passed" ||
      r.resultStatusName?.toLowerCase() === "pass" ||
      r.resultStatusId === 70 ||
      r.resultStatusId === 7
  ).length;

  const totalEvaluated = results.length;
  const averagePercentage =
    totalEvaluated > 0
      ? Math.round(
          results.reduce((acc, curr) => {
            const p =
              curr.scorePercentage ??
              (curr.maxScore && curr.totalScore ? (curr.totalScore / curr.maxScore) * 100 : 0);
            return acc + p;
          }, 0) / totalEvaluated
        )
      : 0;

  // Chart data
  const chartData = useMemo(() => {
    return results.map((r) => {
      const score =
        r.scorePercentage ??
        (currMaxScore(r) ? Math.round(((r.totalScore || 0) / currMaxScore(r)) * 100) : 0);
      return {
        name: r.courseName || `Course #${r.courseId}`,
        score: Math.min(100, Math.max(0, score)),
        passing: 80,
      };
    });
  }, [results]);

  function currMaxScore(r: CompetencyResult) {
    return r.maxScore && r.maxScore > 0 ? r.maxScore : 100;
  }

  const studentName =
    studentProfile?.fullNameEn || user?.fullName || "Candidate Student";
  const studentEmail = studentProfile?.email || user?.email || "";
  const className = studentProfile?.className || "Class 1-A (Software Systems)";

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* Top Banner / Student Greeting */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-[#1e1b4b] text-white p-6 sm:p-8 shadow-xl border border-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Assessment Portal · Official Student Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, <span className="text-[#ff4d6a]">{studentName}</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm font-medium">
              Enrolled in <span className="text-white font-semibold">{className}</span> · Academic Year 2026/2027
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#e21836] flex items-center justify-center font-bold text-white text-base shadow-sm">
                {averagePercentage}%
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  Mastery Rate
                </p>
                <p className="text-xs font-bold text-white">
                  {passedCount} Competencies Passed
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Tab Shortcuts Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: "overview", label: "Dashboard", icon: LayoutDashboard },
            { id: "competencies", label: "My Competencies", icon: BookOpen },
            { id: "assessments", label: "My Assessments", icon: ClipboardList },
            { id: "results", label: "My Results", icon: Award },
            { id: "progress", label: "My Progress", icon: TrendingUp },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "profile", label: "My Profile", icon: User },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                  active
                    ? "bg-white text-slate-900 shadow-md font-bold"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-[#12141e] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Enrolled Competencies
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {studentProfile?.competencies?.length || (courses ? courses.length : 4)}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Active curriculum modules</p>
              </div>
            </Card>

            <Card className="p-5 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-[#12141e] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Passed Competencies
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {passedCount}
                </span>
                <p className="text-[11px] text-emerald-600 font-medium mt-1">Verified competency achievements</p>
              </div>
            </Card>

            <Card className="p-5 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-[#12141e] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pending Assessments
                </span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {Math.max(0, (studentProfile?.competencies?.length || 4) - passedCount)}
                </span>
                <p className="text-[11px] text-amber-600 font-medium mt-1">Awaiting evaluation / verification</p>
              </div>
            </Card>

            <Card className="p-5 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-[#12141e] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Average Score
                </span>
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {averagePercentage}%
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Passing threshold: 80%</p>
              </div>
            </Card>
          </div>

          {/* Performance Chart & Recent Results */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-6 border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Competency Performance
                  </h3>
                  <p className="text-xs text-slate-500">Evaluation score compared against 80% passing threshold</p>
                </div>
                <Badge variant="outline" className="text-xs font-semibold text-slate-600 border-slate-200">
                  Target: 80%
                </Badge>
              </div>

              {chartData.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(val: any) => [`${val}%`, "Score"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid rgba(0,0,0,0.1)" }}
                      />
                      <Bar dataKey="score" fill="#e21836" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <Award className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm font-semibold">No competency evaluations recorded yet</p>
                  <p className="text-xs">Your graded assessments will appear here automatically.</p>
                </div>
              )}
            </Card>

            {/* Quick Status / Recent Graded Cards */}
            <Card className="p-6 border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm flex flex-col">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4">
                Latest Results
              </h3>
              {results.length > 0 ? (
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {results.slice(0, 4).map((r) => {
                    const pct =
                      r.scorePercentage ??
                      (r.maxScore && r.totalScore ? Math.round((r.totalScore / r.maxScore) * 100) : 0);
                    const isPass = pct >= 80;
                    return (
                      <div
                        key={r.id}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 mr-3">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {r.courseName || `Course #${r.courseId}`}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {r.gradedAt ? new Date(r.gradedAt).toLocaleDateString() : "Graded"}
                          </p>
                        </div>
                        <Badge
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                            isPass
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200"
                              : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200"
                          }`}
                        >
                          {pct}% · {isPass ? "Passed" : "Not Passed"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-400">
                  <Clock className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs font-semibold">Evaluations in progress</p>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full mt-4 rounded-xl text-xs font-bold"
                onClick={() => setTab("results")}
              >
                View All Results
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: MY COMPETENCIES */}
      {activeTab === "competencies" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                My Competencies
              </h2>
              <p className="text-xs text-slate-500">
                Official curriculum competencies assigned for technical evaluation
              </p>
            </div>
            <Badge className="bg-[#e21836] text-white text-xs font-bold px-3 py-1">
              {results.length} Evaluated
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses && courses.length > 0 ? (
              courses.map((course) => {
                const evalResult = results.find((r) => r.courseId === course.id);
                const score = evalResult
                  ? evalResult.scorePercentage ??
                    (evalResult.maxScore && evalResult.totalScore
                      ? Math.round((evalResult.totalScore / evalResult.maxScore) * 100)
                      : 0)
                  : null;
                const isPassed = score !== null && score >= 80;

                return (
                  <Card
                    key={course.id}
                    className="p-5 border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Competency #{course.id}
                        </span>
                        {score !== null ? (
                          <Badge
                            className={`text-[11px] font-bold rounded-lg px-2 py-0.5 ${
                              isPassed
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200"
                            }`}
                          >
                            {isPassed ? "Passed" : "Retake Needed"}
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-neutral-300 text-[11px] font-semibold border-0">
                            Pending Evaluation
                          </Badge>
                        )}
                      </div>

                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white line-clamp-1">
                        {course.title}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                        {course.description || "Core technical assessment competency."}
                      </p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5">
                      {score !== null ? (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-slate-500">Achieved Score</span>
                            <span className={isPassed ? "text-emerald-600" : "text-amber-600"}>
                              {score}%
                            </span>
                          </div>
                          <Progress value={score} className="h-2 rounded-full" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Assessment scheduled</span>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            ) : (
              <div className="col-span-full p-8 text-center text-slate-400">
                <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-sm">No competencies available</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MY ASSESSMENTS */}
      {activeTab === "assessments" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              My Assessments
            </h2>
            <p className="text-xs text-slate-500">
              Assigned technical tasks, rubrics, and submission status
            </p>
          </div>

          <Card className="border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-4 px-6">Task Title</th>
                    <th className="py-4 px-6">Competency</th>
                    <th className="py-4 px-6">Max Grade</th>
                    <th className="py-4 px-6">Deadline</th>
                    <th className="py-4 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                  {assignments && assignments.length > 0 ? (
                    assignments.map((asgn) => (
                      <tr key={asgn.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                        <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">
                          {asgn.title}
                        </td>
                        <td className="py-4 px-6 text-slate-600 dark:text-neutral-300">
                          {asgn.courseName || `Course #${asgn.courseId}`}
                        </td>
                        <td className="py-4 px-6 font-mono font-bold text-slate-700 dark:text-neutral-200">
                          {asgn.totalGrade || 100} pts
                        </td>
                        <td className="py-4 px-6 text-slate-500 font-mono">
                          {asgn.deadline ? new Date(asgn.deadline).toLocaleDateString() : "Rolling"}
                        </td>
                        <td className="py-4 px-6">
                          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 text-[10px] font-bold">
                            Active Assessment
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No assignments recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: MY RESULTS */}
      {activeTab === "results" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Official Assessment Results
            </h2>
            <p className="text-xs text-slate-500">
              Verified competency results and evaluation feedback
            </p>
          </div>

          <Card className="border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-4 px-6">Competency</th>
                    <th className="py-4 px-6">Total Score</th>
                    <th className="py-4 px-6">Percentage</th>
                    <th className="py-4 px-6">Decision</th>
                    <th className="py-4 px-6">Assessor</th>
                    <th className="py-4 px-6">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                  {results.length > 0 ? (
                    results.map((r) => {
                      const pct =
                        r.scorePercentage ??
                        (r.maxScore && r.totalScore ? Math.round((r.totalScore / r.maxScore) * 100) : 0);
                      const isPass = pct >= 80;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                          <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">
                            {r.courseName || `Course #${r.courseId}`}
                          </td>
                          <td className="py-4 px-6 font-mono font-bold text-slate-700 dark:text-neutral-200">
                            {r.totalScore || 0} / {r.maxScore || 100}
                          </td>
                          <td className="py-4 px-6 font-bold">
                            <span className={isPass ? "text-emerald-600 font-extrabold" : "text-red-600 font-extrabold"}>
                              {pct}%
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <Badge
                              className={`text-[11px] font-bold rounded-lg px-2.5 py-0.5 ${
                                isPass
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200"
                                  : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200"
                              }`}
                            >
                              {isPass ? "Passed" : "Not Passed"}
                            </Badge>
                          </td>
                          <td className="py-4 px-6 text-slate-600 dark:text-neutral-400">
                            {r.assessorName || "Lead Assessor"}
                          </td>
                          <td className="py-4 px-6 text-slate-500 font-mono">
                            {r.gradedAt ? new Date(r.gradedAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No graded results available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: MY PROGRESS */}
      {activeTab === "progress" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Competency Mastery Progress
            </h2>
            <p className="text-xs text-slate-500">
              Overview of technical competency milestones achieved toward certification
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm flex flex-col items-center text-center justify-center">
              <div className="w-24 h-24 rounded-full border-8 border-[#e21836] flex items-center justify-center font-extrabold text-2xl text-slate-900 dark:text-white mb-4">
                {averagePercentage}%
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Cumulative Mastery
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-[220px]">
                Calculated across all evaluated competencies against the 80% passing bar.
              </p>
            </Card>

            <Card className="md:col-span-2 p-6 border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm space-y-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-2">
                Milestones & Pillars
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-slate-600 dark:text-neutral-300">Competencies Passed</span>
                    <span className="text-slate-900 dark:text-white font-mono">{passedCount} Completed</span>
                  </div>
                  <Progress value={Math.min(100, (passedCount / Math.max(1, courses?.length || 4)) * 100)} className="h-2.5 rounded-full" />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-slate-600 dark:text-neutral-300">Assessment Readiness</span>
                    <span className="text-emerald-600 font-mono">Verified</span>
                  </div>
                  <Progress value={100} className="h-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 6: NOTIFICATIONS */}
      {activeTab === "notifications" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Academic Notifications
            </h2>
            <p className="text-xs text-slate-500">
              Important updates regarding competency assessments and schedules
            </p>
          </div>

          <div className="space-y-3">
            <Card className="p-4 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-[#12141e] shadow-sm flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Assessment Cycle Active
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your class has been registered for the current assessment cycle. All graded results will sync in real time.
                </p>
                <span className="text-[10px] text-slate-400 mt-1 block font-mono">Academic Year 2026/2027</span>
              </div>
            </Card>

            <Card className="p-4 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-[#12141e] shadow-sm flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Standardized Passing Criterion
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Minimum passing score for each competency is 80%. Passed competencies are protected against overwriting.
                </p>
                <span className="text-[10px] text-slate-400 mt-1 block font-mono">Evaluation Rule</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 7: PROFILE */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              My Profile
            </h2>
            <p className="text-xs text-slate-500">
              Verified candidate academic identification
            </p>
          </div>

          <Card className="p-6 sm:p-8 border-slate-100 dark:border-white/5 rounded-3xl bg-white dark:bg-[#12141e] shadow-sm max-w-2xl">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-white/5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#c8102e] to-[#e21836] text-white font-extrabold text-2xl flex items-center justify-center shadow-md">
                {studentName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {studentName}
                </h3>
                {studentProfile?.fullNameAr && (
                  <p className="text-xs text-slate-500 font-medium">{studentProfile.fullNameAr}</p>
                )}
                <Badge className="mt-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 text-[10px] font-bold">
                  Active Student
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                <span className="text-slate-400 block font-semibold mb-1">Email / Student Account</span>
                <span className="font-mono font-bold text-slate-800 dark:text-neutral-200">
                  {studentEmail}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                <span className="text-slate-400 block font-semibold mb-1">Class / Cohort</span>
                <span className="font-bold text-slate-800 dark:text-neutral-200">
                  {className}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                <span className="text-slate-400 block font-semibold mb-1">Enrolled Program</span>
                <span className="font-bold text-slate-800 dark:text-neutral-200">
                  Elsewedy Applied Technology Program
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                <span className="text-slate-400 block font-semibold mb-1">Competencies Passed</span>
                <span className="font-mono font-bold text-emerald-600">
                  {passedCount} Completed
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
