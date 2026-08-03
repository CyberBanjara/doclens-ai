import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { useAuth, PRIVILEGED_ROLES } from "@/context/AuthContext";
import { auth, type UserRole } from "@/lib/firebase";
import { toast } from "sonner";
import { Shield, ShieldAlert, CheckCircle2, Key, RefreshCw, Database, Lock } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Anuwad — Admin Role Dashboard" },
      { name: "description", content: "Role-based Access Control (RBAC) validation dashboard." },
    ],
  }),
});

interface ServerOpResult {
  endpoint: string;
  status: number;
  statusText: string;
  data: any;
  timestamp: string;
}

function AdminPage() {
  const navigate = useNavigate();
  const { user, role, isPrivileged, loading, serverVerifying, verifyRoleWithServer, changeUserRoleForTesting, signInWithGoogle } = useAuth();

  const [activeTab, setActiveTab] = useState<"dashboard" | "role-tester" | "api-tester">("dashboard");
  const [opLoading, setOpLoading] = useState<string | null>(null);
  const [lastOpResult, setLastOpResult] = useState<ServerOpResult | null>(null);

  // 1. Unauthenticated or User Role -> 403 Forbidden Screen
  if (!loading && (!user || !isPrivileged || role === "user")) {
    return (
      <SidebarLayout pageTitle="403 Forbidden">
        <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
          <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center shadow-xl backdrop-blur-md">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-8 ring-destructive/5">
              <ShieldAlert className="h-10 w-10" />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive mb-3">
              HTTP 403 FORBIDDEN
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Access Denied
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You do not have permission to view the Admin (Role Dashboard) page. Direct route access is restricted to privileged roles (<span className="font-semibold text-foreground">Admin, Moderator, Editor</span>).
            </p>

            <div className="mt-6 rounded-xl border border-border bg-card/50 p-4 text-left font-mono text-xs">
              <div className="flex justify-between text-muted-foreground pb-2 border-b border-border mb-2">
                <span>AUTHENTICATION STATUS</span>
                <span className="font-semibold text-foreground">{user ? "SIGNED IN" : "NOT SIGNED IN"}</span>
              </div>
              <div className="flex justify-between text-muted-foreground pb-2 border-b border-border mb-2">
                <span>USER UID</span>
                <span className="truncate max-w-[200px] font-semibold text-foreground">{user?.uid || "N/A"}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>CURRENT ROLE</span>
                <span className="font-bold text-destructive uppercase">{role || "user"}</span>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {!user ? (
                <button
                  onClick={signInWithGoogle}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90"
                >
                  <Key className="h-4 w-4" /> Sign In with Google
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate({ to: "/" })}
                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
                  >
                    Return to Library
                  </button>
                  <button
                    onClick={async () => {
                      toast.info("Promoting account to Admin for validation...");
                      await changeUserRoleForTesting("admin");
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-accent transition-all"
                  >
                    <Shield className="h-3.5 w-3.5 text-primary" /> Switch to Admin Role
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  // Determine exact message based on role
  let roleTitle = "Role Dashboard";
  let roleMessage = `This is the ${role ? role.charAt(0).toUpperCase() + role.slice(1) : "Admin"} page. You are a ${role ? role.charAt(0).toUpperCase() + role.slice(1) : "Admin"}.`;
  
  if (role === "admin") {
    roleTitle = "Admin Page";
    roleMessage = "This is the Admin page. You are an Admin.";
  } else if (role === "moderator") {
    roleTitle = "Moderator Page";
    roleMessage = "This is the Moderator page. You are a Moderator.";
  } else if (role === "editor") {
    roleTitle = "Editor Page";
    roleMessage = "This is the Editor page. You are an Editor.";
  }

  const executeServerOp = async (endpoint: string, method: string = "POST", bodyPayload: any = {}) => {
    if (!auth.currentUser) {
      toast.error("Not authenticated");
      return;
    }
    setOpLoading(endpoint);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: method !== "GET" ? JSON.stringify(bodyPayload) : undefined,
      });

      const resData = await res.json().catch(() => ({}));
      const result: ServerOpResult = {
        endpoint,
        status: res.status,
        statusText: res.statusText,
        data: resData,
        timestamp: new Date().toLocaleTimeString(),
      };
      setLastOpResult(result);

      if (res.ok) {
        toast.success(`[${res.status} OK] ${endpoint} succeeded!`);
      } else {
        toast.error(`[${res.status} ${res.statusText}] ${resData.error || "Operation rejected by server"}`);
      }
    } catch (err: any) {
      toast.error(`Request failed: ${err.message}`);
    } finally {
      setOpLoading(null);
    }
  };

  return (
    <SidebarLayout pageTitle="Admin (Role Dashboard)">
      {/* ──── Clean White Validation Screen Container ──── */}
      <div className="min-h-full bg-white text-slate-900 p-6 md:p-10 font-sans">
        <div className="mx-auto max-w-5xl space-y-8">
          
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Authenticated & Authorized
                </span>
                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 uppercase">
                  Role: {role}
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {roleTitle}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  toast.info("Re-verifying ID token with Vercel Serverless Function...");
                  await verifyRoleWithServer();
                }}
                disabled={serverVerifying}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${serverVerifying ? "animate-spin" : ""}`} />
                Verify Server Token
              </button>
            </div>
          </div>

          {/* Primary Prompt Message Display Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 shadow-sm text-center md:text-left flex flex-col md:flex-row items-center gap-6">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
              <Shield className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
                RBAC System Status Check
              </span>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {roleMessage}
              </h2>
              <p className="text-sm text-slate-600">
                This validation page confirms that Firebase Authentication token verification, Firestore document role lookup, TanStack routing, and desktop sidebar UI visibility are functioning correctly.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 space-x-8">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`pb-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "dashboard"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              Overview & User Credentials
            </button>
            <button
              onClick={() => setActiveTab("role-tester")}
              className={`pb-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "role-tester"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              Role Simulation & Sidebar Toggle
            </button>
            <button
              onClick={() => setActiveTab("api-tester")}
              className={`pb-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "api-tester"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              Serverless Functions Auth Tester
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === "dashboard" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Database className="h-5 w-5 text-indigo-600" /> Authenticated User Profile
                </h3>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Display Name</dt>
                    <dd className="font-semibold text-slate-900">{user?.displayName || "N/A"}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Email Address</dt>
                    <dd className="font-semibold text-slate-900">{user?.email || "N/A"}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Firebase UID</dt>
                    <dd className="font-mono text-xs text-slate-700 truncate max-w-[220px]">{user?.uid}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Firestore Document</dt>
                    <dd className="font-mono text-xs text-slate-700">{`users/${user?.uid}`}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Assigned Role</dt>
                    <dd className="font-bold text-indigo-600 uppercase">{role}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Lock className="h-5 w-5 text-emerald-600" /> Server-Side Security Model
                </h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-slate-900">Zero Trust Client:</strong> Authorization is strictly enforced server-side inside Vercel Serverless Functions.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-slate-900">ID Token Verification:</strong> Cryptographically verified on every serverless function invocation.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-slate-900">Firestore Re-Lookup:</strong> Roles are fetched fresh from <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">users/{'{uid}'}</code> on every privileged action.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: ROLE TESTER */}
          {activeTab === "role-tester" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Switch Role for Validation Testing</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Change your role in Firestore (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">users/{user?.uid}</code>) to test sidebar visibility and route access control live.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {(["admin", "moderator", "editor", "user"] as UserRole[]).map((r) => {
                  const isCurrent = role === r;
                  const isPriv = PRIVILEGED_ROLES.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => changeUserRoleForTesting(r)}
                      className={`flex flex-col items-center justify-center p-5 rounded-xl border transition-all text-center ${
                        isCurrent
                          ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2 ${
                        isPriv ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                      }`}>
                        {isPriv ? "Privileged" : "Default"}
                      </span>
                      <span className="text-lg font-extrabold text-slate-900 uppercase">{r}</span>
                      <span className="text-xs text-slate-500 mt-1">
                        {isPriv ? "Sidebar Item Visible" : "403 Forbidden Access"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: SERVERLESS FUNCTION API TESTER */}
          {activeTab === "api-tester" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Server-Side Authorization Enforcement Tester</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Execute dedicated Vercel Serverless Functions to verify that server-side ID token verification, UID extraction, and Firestore role checks are independently enforced before executing actions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                  <button
                    onClick={() => executeServerOp("/api/admin/create-resource", "POST", { title: "New Document", content: "Test content" })}
                    disabled={opLoading !== null}
                    className="flex flex-col text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all hover:border-indigo-300"
                  >
                    <span className="text-xs font-semibold text-slate-500">POST</span>
                    <span className="text-sm font-bold text-slate-900 mt-1">Create Resource</span>
                    <span className="text-[11px] text-slate-500 mt-1">Allowed: Admin, Editor</span>
                  </button>

                  <button
                    onClick={() => executeServerOp("/api/admin/update-resource", "POST", { resourceId: "res_999", updates: { title: "Updated Title" } })}
                    disabled={opLoading !== null}
                    className="flex flex-col text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all hover:border-indigo-300"
                  >
                    <span className="text-xs font-semibold text-slate-500">POST</span>
                    <span className="text-sm font-bold text-slate-900 mt-1">Update Resource</span>
                    <span className="text-[11px] text-slate-500 mt-1">Allowed: Admin, Editor, Moderator</span>
                  </button>

                  <button
                    onClick={() => executeServerOp("/api/admin/delete-resource", "POST", { resourceId: "res_999" })}
                    disabled={opLoading !== null}
                    className="flex flex-col text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all hover:border-rose-300"
                  >
                    <span className="text-xs font-semibold text-rose-600">DELETE</span>
                    <span className="text-sm font-bold text-slate-900 mt-1">Delete Resource</span>
                    <span className="text-[11px] text-slate-500 mt-1">Allowed: Admin Only</span>
                  </button>

                  <button
                    onClick={() => executeServerOp("/api/admin/sensitive-config", "POST")}
                    disabled={opLoading !== null}
                    className="flex flex-col text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all hover:border-indigo-300"
                  >
                    <span className="text-xs font-semibold text-slate-500">POST / GET</span>
                    <span className="text-sm font-bold text-slate-900 mt-1">Read Sensitive Config</span>
                    <span className="text-[11px] text-slate-500 mt-1">Allowed: Admin Only</span>
                  </button>
                </div>
              </div>

              {/* Server Response Inspector */}
              {lastOpResult && (
                <div className="rounded-xl border border-slate-200 bg-slate-900 text-slate-100 p-6 space-y-3 font-mono text-xs shadow-md">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-white font-bold ${
                        lastOpResult.status >= 200 && lastOpResult.status < 300 ? "bg-emerald-600" : "bg-rose-600"
                      }`}>
                        HTTP {lastOpResult.status} {lastOpResult.statusText}
                      </span>
                      <span className="text-slate-400">{lastOpResult.endpoint}</span>
                    </div>
                    <span className="text-slate-500">{lastOpResult.timestamp}</span>
                  </div>
                  <pre className="overflow-x-auto p-3 bg-slate-950 rounded-lg text-emerald-400">
                    {JSON.stringify(lastOpResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </SidebarLayout>
  );
}
