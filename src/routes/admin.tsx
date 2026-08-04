import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { UserAvatar } from "@/components/UserAvatar";
import { NotFoundComponent } from "@/components/NotFound";
import { useAuth, PRIVILEGED_ROLES } from "@/context/AuthContext";
import { auth, type UserRole } from "@/lib/firebase";
import { toast } from "sonner";
import {
  Shield,
  ShieldAlert,
  CheckCircle2,
  Key,
  RefreshCw,
  Database,
  Lock,
  Users,
  UserCheck,
  Search,
  Filter,
  UserCog,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Anuwad — Admin User & Role Management" },
      { name: "description", content: "Role-Based Access Control (RBAC) User Management Panel." },
    ],
  }),
});

interface UserItem {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

interface ServerOpResult {
  endpoint: string;
  status: number;
  statusText: string;
  data: any;
  timestamp: string;
}

const ALL_ROLES: UserRole[] = ["admin", "moderator", "editor", "user", "viewer"];

function AdminPage() {
  const navigate = useNavigate();
  const {
    user,
    role,
    isPrivileged,
    isAdmin,
    loading,
    serverVerifying,
    verifyRoleWithServer,
    changeUserRoleForTesting,
    signInWithGoogle,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<"users" | "dashboard" | "role-tester" | "api-tester">("users");

  // User Management State
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // API Tester State
  const [opLoading, setOpLoading] = useState<string | null>(null);
  const [lastOpResult, setLastOpResult] = useState<ServerOpResult | null>(null);

  // User Management Error State
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch Users from Protected Serverless Function (/api/admin/list-users)
  const fetchUsers = useCallback(async () => {
    if (!auth.currentUser) return;
    setFetchingUsers(true);
    setFetchError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/admin/list-users", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.error || `HTTP ${res.status} ${res.statusText}`);
      }

      setUsersList(resData.users || []);
    } catch (err: any) {
      console.error("Failed to fetch users list:", err);
      setFetchError(err.message);
      toast.error(`Error loading user directory: ${err.message}`);
    } finally {
      setFetchingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, fetchUsers]);

  // Handle Role Change via Vercel Serverless Function (/api/admin/update-user-role)
  const handleUpdateRole = async (targetUid: string, newRole: UserRole) => {
    if (!auth.currentUser) {
      toast.error("Authentication required.");
      return;
    }
    setUpdatingUid(targetUid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/admin/update-user-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ targetUid, newRole }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.error || `HTTP ${res.status} ${res.statusText}`);
      }

      toast.success(`Updated user role to '${newRole}' successfully!`);

      // Immediately refresh user directory state without full page reload
      setUsersList((prev) =>
        prev.map((u) => (u.uid === targetUid ? { ...u, role: newRole } : u))
      );

      // If the admin modified their own role, trigger context refresh
      if (targetUid === user?.uid) {
        await verifyRoleWithServer();
      }
    } catch (err: any) {
      console.error("Failed to update user role:", err);
      toast.error(`Failed to update role: ${err.message}`);
    } finally {
      setUpdatingUid(null);
    }
  };

  // 1. Unauthenticated or Non-Privileged User (e.g. 'user') -> Render 404 Page Not Found (Obscurity / Attack Surface Minimization)
  if (!loading && (!user || !isPrivileged || role === "user")) {
    return <NotFoundComponent />;
  }

  // Role display title and message
  let roleTitle = "Role Dashboard";
  let roleMessage = `This is the ${role ? role.charAt(0).toUpperCase() + role.slice(1) : "Admin"} page. You are a ${role ? role.charAt(0).toUpperCase() + role.slice(1) : "Admin"}.`;
  
  if (role === "admin") {
    roleTitle = "Admin Page & User Directory";
    roleMessage = "This is the Admin page. You are an Admin.";
  } else if (role === "moderator") {
    roleTitle = "Moderator Page";
    roleMessage = "This is the Moderator page. You are a Moderator.";
  } else if (role === "editor") {
    roleTitle = "Editor Page";
    roleMessage = "This is the Editor page. You are an Editor.";
  }

  // Filter users list by search query and role filter
  const filteredUsers = usersList.filter((u) => {
    const matchesSearch =
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

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

  const getRoleBadgeStyle = (r: UserRole) => {
    switch (r) {
      case "admin":
        return "bg-rose-50 text-rose-700 ring-rose-600/20";
      case "moderator":
        return "bg-purple-50 text-purple-700 ring-purple-600/20";
      case "editor":
        return "bg-indigo-50 text-indigo-700 ring-indigo-600/20";
      case "viewer":
        return "bg-amber-50 text-amber-700 ring-amber-600/20";
      default:
        return "bg-slate-100 text-slate-700 ring-slate-600/10";
    }
  };

  return (
    <SidebarLayout pageTitle="Admin (Role Dashboard)">
      {/* ──── Clean White Dashboard Screen Container ──── */}
      <div className="min-h-full bg-white text-slate-900 p-6 md:p-10 font-sans">
        <div className="mx-auto max-w-6xl space-y-8">
          
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
                  if (isAdmin) fetchUsers();
                }}
                disabled={serverVerifying || fetchingUsers}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${serverVerifying || fetchingUsers ? "animate-spin" : ""}`} />
                Refresh Data
              </button>
            </div>
          </div>

          {/* Primary Role Welcome Message Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm text-center md:text-left flex flex-col md:flex-row items-center gap-6">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
              <Shield className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
                RBAC Verification Active
              </span>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {roleMessage}
              </h2>
              <p className="text-xs text-slate-600">
                {isAdmin
                  ? "As an Admin, you have full access to view all registered users and manage user roles via serverless functions."
                  : "You are currently viewing the Role Dashboard. Note that full User Management actions require the 'admin' role."}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 space-x-8 overflow-x-auto">
            {isAdmin && (
              <button
                onClick={() => setActiveTab("users")}
                className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "users"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <Users className="h-4 w-4" /> User Directory & Role Management
              </button>
            )}

            <button
              onClick={() => setActiveTab("dashboard")}
              className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "dashboard"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <Database className="h-4 w-4" /> System Credentials & Security
            </button>

            <button
              onClick={() => setActiveTab("role-tester")}
              className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "role-tester"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <UserCog className="h-4 w-4" /> Role Simulator
            </button>

            <button
              onClick={() => setActiveTab("api-tester")}
              className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "api-tester"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <Lock className="h-4 w-4" /> Serverless API Tester
            </button>
          </div>

          {/* ──── TAB 1: USER DIRECTORY & ROLE MANAGEMENT ──── */}
          {activeTab === "users" && isAdmin && (
            <div className="space-y-6">
              {/* Directory Filter & Search Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or UID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">All Roles ({usersList.length})</option>
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="editor">Editor</option>
                    <option value="user">User</option>
                    <option value="viewer">Viewer</option>
                  </select>

                  <button
                    onClick={fetchUsers}
                    disabled={fetchingUsers}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${fetchingUsers ? "animate-spin" : ""}`} />
                    Reload Users
                  </button>
                </div>
              </div>

              {/* Users Directory Table */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {fetchError ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-rose-50/50">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-3">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <h4 className="text-base font-bold text-slate-900">
                      Server Authorization Error (HTTP 403)
                    </h4>
                    <p className="text-xs text-rose-700 max-w-md mt-1 font-mono bg-rose-100/60 p-2.5 rounded-lg border border-rose-200">
                      {fetchError}
                    </p>
                    <p className="text-xs text-slate-600 max-w-md mt-3">
                      Your Firestore user document (<code className="bg-slate-100 px-1 py-0.5 rounded">users/{user?.uid}</code>) currently has role <strong className="uppercase font-bold text-rose-600">{role || "user"}</strong> instead of <strong className="uppercase font-bold text-emerald-600">admin</strong>.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={fetchUsers}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh & Retry Authorization
                      </button>
                    </div>
                  </div>
                ) : fetchingUsers && usersList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-3" />
                    <p className="text-sm font-medium">Fetching registered users from Firestore...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                    <Users className="h-10 w-10 text-slate-300 mb-2" />
                    <p className="text-base font-semibold text-slate-700">No users found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {searchQuery || roleFilter !== "all"
                        ? "Try clearing your search filters."
                        : "No user documents registered in Firestore yet."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4 font-semibold">User</th>
                          <th className="px-6 py-4 font-semibold">Email</th>
                          <th className="px-6 py-4 font-semibold">Firebase UID</th>
                          <th className="px-6 py-4 font-semibold">Current Role</th>
                          <th className="px-6 py-4 font-semibold text-right">Manage Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredUsers.map((u) => {
                          const isUpdating = updatingUid === u.uid;
                          const isSelf = u.uid === user?.uid;

                          return (
                            <tr key={u.uid} className="hover:bg-slate-50/70 transition-colors">
                              {/* Avatar & Name */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <UserAvatar
                                    photoURL={u.photoURL}
                                    name={u.displayName}
                                    email={u.email}
                                    className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-200"
                                    fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-sm shadow-sm ring-2 ring-slate-100"
                                  />
                                  <div>
                                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                      {u.displayName}
                                      {isSelf && (
                                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                          YOU
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-xs text-slate-400">
                                      Registered user
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Email */}
                              <td className="px-6 py-4 whitespace-nowrap text-slate-700 font-medium">
                                {u.email}
                              </td>

                              {/* UID */}
                              <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-500">
                                {u.uid}
                              </td>

                              {/* Current Role Badge */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold uppercase ring-1 ring-inset ${getRoleBadgeStyle(
                                    u.role
                                  )}`}
                                >
                                  {u.role}
                                </span>
                              </td>

                              {/* Role Management Dropdown */}
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {isUpdating ? (
                                    <div className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
                                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                                    </div>
                                  ) : (
                                    <select
                                      value={u.role}
                                      onChange={(e) =>
                                        handleUpdateRole(u.uid, e.target.value as UserRole)
                                      }
                                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 hover:border-slate-400"
                                    >
                                      {ALL_ROLES.map((r) => (
                                        <option key={r} value={r}>
                                          Role: {r.toUpperCase()}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Restricted Notice for Non-Admin Privileged Roles */}
          {activeTab === "users" && !isAdmin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 space-y-3">
              <div className="flex items-center gap-2 font-bold text-base text-amber-800">
                <AlertTriangle className="h-5 w-5 text-amber-600" /> Restricted Feature Notice
              </div>
              <p className="text-sm text-amber-800">
                User Role Management is restricted to full <strong className="font-semibold">Admins</strong>. As a <strong className="uppercase">{role}</strong>, you have access to the Role Dashboard view, but only full Admins can update another user's role in Firestore.
              </p>
            </div>
          )}

          {/* ──── TAB 2: OVERVIEW & CREDENTIALS ──── */}
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
                  <Lock className="h-5 w-5 text-emerald-600" /> Server-Side Security Architecture
                </h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-slate-900">Zero Trust Client:</strong> All role modifications are strictly executed via protected Vercel Serverless Functions.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-slate-900">ID Token Validation:</strong> Every request validates the caller's Firebase ID token against Google servers.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-slate-900">Firestore Authorization:</strong> Serverless functions query Firestore <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">users/{'{callerUid}'}</code> to independently verify admin role.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* ──── TAB 3: ROLE SIMULATOR ──── */}
          {activeTab === "role-tester" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Switch Your Role for Verification Testing</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Change your current role in Firestore (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">users/{user?.uid}</code>) to test route protection, sidebar navigation visibility, and user directory access live.
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
                        {r === "admin" ? "Full Admin & Directory Access" : isPriv ? "Dashboard Access Only" : "403 Forbidden Access"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──── TAB 4: SERVERLESS FUNCTION API TESTER ──── */}
          {activeTab === "api-tester" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Protected Vercel Serverless Function Tester</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Execute dedicated Vercel Serverless Functions to verify that token verification, UID extraction, and Firestore role checks are independently enforced before executing actions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                  <button
                    onClick={() => executeServerOp("/api/admin/list-users", "GET")}
                    disabled={opLoading !== null}
                    className="flex flex-col text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all hover:border-indigo-300"
                  >
                    <span className="text-xs font-semibold text-slate-500">GET</span>
                    <span className="text-sm font-bold text-slate-900 mt-1">List All Users</span>
                    <span className="text-[11px] text-slate-500 mt-1">Allowed: Admin Only</span>
                  </button>

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
