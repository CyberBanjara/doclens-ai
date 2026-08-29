import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Lock,
  ArrowLeft,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
  Info,
  Clock,
  Mail,
  Fingerprint,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  type AdminUserProfile,
  type UserRole,
  apiAdminListUsers,
  apiAdminUpdateUserRole,
  promptGoogleIdToken,
} from "@/lib/auth-client";
import { SidebarLayout } from "@/components/SidebarLayout";
import { UserAvatar } from "@/components/UserAvatar";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const ALL_ROLES: UserRole[] = ["admin", "editor", "moderator", "viewer", "user"];

const ROLE_CONFIG: Record<
  UserRole,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  admin: {
    label: "Admin",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    desc: "Full system control, manage roles & resources",
  },
  editor: {
    label: "Editor",
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/30",
    desc: "Can publish, edit, and curate global content",
  },
  moderator: {
    label: "Moderator",
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
    desc: "Can manage and review public library submissions",
  },
  viewer: {
    label: "Viewer",
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/30",
    desc: "Read-only access with preview permissions",
  },
  user: {
    label: "User",
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    desc: "Standard application access & personal library",
  },
};

function formatDate(dateStr?: string) {
  if (!dateStr) return "Never";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? "Unknown"
      : d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  } catch {
    return dateStr;
  }
}

function AdminPage() {
  const { user, loading: authLoading, isAdmin, signInWithGoogle } = useAuth();
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserProfile | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load user list when admin is confirmed
  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const data = await apiAdminListUsers();
      setUsers(data);
    } catch (err: any) {
      console.error("Failed to load users:", err);
      toast.error("Failed to fetch users", {
        description: err?.message || "Could not retrieve user directory.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleRoleChange = async (targetUid: string, newRole: UserRole) => {
    try {
      setUpdatingUid(targetUid);
      await apiAdminUpdateUserRole(targetUid, newRole);

      // Optimistic update local state
      setUsers((prev) => prev.map((u) => (u.uid === targetUid ? { ...u, role: newRole } : u)));

      if (selectedUser && selectedUser.uid === targetUid) {
        setSelectedUser((prev) => (prev ? { ...prev, role: newRole } : null));
      }

      toast.success("Role updated successfully", {
        description: `User role changed to ${newRole.toUpperCase()}`,
      });
    } catch (err: any) {
      console.error("Failed to update role:", err);
      toast.error("Failed to update role", {
        description: err?.message || "Server rejected role modification.",
      });
      // Re-fetch to synchronize state
      fetchUsers();
    } finally {
      setUpdatingUid(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.uid.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const editors = users.filter((u) => u.role === "editor").length;
    const moderators = users.filter((u) => u.role === "moderator").length;
    const standardUsers = users.filter((u) => u.role === "user" || u.role === "viewer").length;
    return { total, admins, editors, moderators, standardUsers };
  }, [users]);

  // If auth is loading, show clean loader
  if (authLoading) {
    return (
      <SidebarLayout pageTitle="Administration">
        <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 animate-pulse">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Verifying administrator session…
          </p>
        </div>
      </SidebarLayout>
    );
  }

  // If user is not an admin, show unauthorized state
  if (!isAdmin) {
    return (
      <SidebarLayout pageTitle="Access Restricted">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-20 text-center">
          <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-red-500/30 bg-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
            <Lock className="h-10 w-10 text-red-400" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Administrator Privileges Required
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This section is restricted to authorized administrators. All access requests and role
            verifications are enforced server-side via Secure HttpOnly sessions.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {!user ? (
              <button
                onClick={() => signInWithGoogle()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Sign in with Google</span>
              </button>
            ) : (
              <div className="rounded-xl border border-border/80 bg-surface-2/60 px-4 py-2.5 text-xs text-muted-foreground">
                Signed in as <span className="font-semibold text-foreground">{user.email}</span>{" "}
                (Role: <span className="font-semibold text-amber-400 uppercase">{user.role}</span>)
              </div>
            )}
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-surface-2 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Library</span>
            </Link>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  const handleReauthorize = async () => {
    try {
      setLoading(true);
      toast.info("Opening Google verification popup...");
      await promptGoogleIdToken();
      toast.success("Admin credentials verified! Loading users...");
      const data = await apiAdminListUsers();
      setUsers(data);
    } catch (err: any) {
      console.error("Reauthorization failed:", err);
      toast.error("Failed to verify admin credentials", {
        description: err?.message || "Popup was cancelled or authentication failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SidebarLayout
      pageTitle="Administration"
      topBarRight={
        <div className="flex items-center gap-2">
          <button
            onClick={handleReauthorize}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20 hover:border-primary/50 disabled:opacity-50"
            title="Re-verify Google authentication for admin operations"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Verify Token</span>
          </button>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-surface-2 disabled:opacity-50"
            title="Refresh user directory"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {/* Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-background p-6 shadow-xl backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                User & Role Management
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Manage user accounts, permissions, and administrative access.
              </p>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3.5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Users</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                {stats.total}
              </p>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3.5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs text-red-400">
                <span>Admins</span>
                <ShieldAlert className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-red-400">{stats.admins}</p>
            </div>

            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3.5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs text-purple-400">
                <span>Editors & Mods</span>
                <Sparkles className="h-4 w-4 text-purple-400" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-purple-400">
                {stats.editors + stats.moderators}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs text-emerald-400">
                <span>Standard Users</span>
                <UserCheck className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">
                {stats.standardUsers}
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Search and Filter */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, or UID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border/80 bg-surface/80 pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm backdrop-blur-sm transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Filter:
            </span>
            {["all", ...ALL_ROLES].map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                  roleFilter === role
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "border border-border/60 bg-surface/50 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-surface/60 shadow-xl backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/80 bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5 hidden md:table-cell">Last Login</th>
                  <th className="px-6 py-3.5 hidden lg:table-cell">Created</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-3">
                        <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                        <span>Loading user directory from Firestore…</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <UserX className="h-8 w-8 text-muted-foreground/50" />
                        <p className="font-medium text-foreground">No users found</p>
                        <p className="text-xs">
                          {searchQuery || roleFilter !== "all"
                            ? "Try adjusting your search criteria or role filters."
                            : "No user profiles currently registered."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const roleCfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.user;
                    const isSelf = user?.uid === u.uid;
                    const isUpdating = updatingUid === u.uid;

                    return (
                      <tr
                        key={u.uid}
                        className="transition-colors hover:bg-surface-2/40 cursor-pointer"
                        onClick={() => setSelectedUser(u)}
                      >
                        {/* User info */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              photoURL={u.photoURL}
                              name={u.name}
                              email={u.email}
                              className="h-10 w-10 rounded-full object-cover ring-2 ring-border/80"
                              fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary ring-2 ring-border/80"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-foreground truncate">{u.name}</p>
                                {isSelf && (
                                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                                    You
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role selector / badge */}
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="relative inline-block">
                            <select
                              value={u.role}
                              disabled={isUpdating}
                              onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                              className={`appearance-none rounded-lg border px-3 py-1.5 pr-8 text-xs font-semibold uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:opacity-50 ${roleCfg.bg} ${roleCfg.text} ${roleCfg.border}`}
                            >
                              {ALL_ROLES.map((r) => (
                                <option key={r} value={r} className="bg-popover text-foreground">
                                  {r.toUpperCase()}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                                isUpdating ? "animate-spin" : roleCfg.text
                              }`}
                            />
                          </div>
                        </td>

                        {/* Last login */}
                        <td className="px-6 py-4 text-xs text-muted-foreground hidden md:table-cell">
                          {formatDate(u.lastLoginAt)}
                        </td>

                        {/* Created */}
                        <td className="px-6 py-4 text-xs text-muted-foreground hidden lg:table-cell">
                          {formatDate(u.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedUser(u)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface-2/60 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-2"
                          >
                            <Info className="h-3 w-3" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Details Modal */}
        {selectedUser && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setSelectedUser(null)}
          >
            <div
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-popover p-6 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <UserAvatar
                    photoURL={selectedUser.photoURL}
                    name={selectedUser.name}
                    email={selectedUser.email}
                    className="h-14 w-14 rounded-2xl object-cover ring-2 ring-primary/30"
                    fallbackClassName="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-lg font-bold text-primary ring-2 ring-primary/30"
                  />
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{selectedUser.name}</h3>
                    <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedUser(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              {/* Details List */}
              <div className="mt-6 space-y-3.5 rounded-xl border border-border/60 bg-surface/50 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Fingerprint className="h-3.5 w-3.5" />
                    <span>User UID:</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-foreground max-w-[200px] truncate">
                      {selectedUser.uid}
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedUser.uid, "uid")}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      title="Copy UID"
                    >
                      {copiedId === "uid" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <span>Email:</span>
                  </span>
                  <span className="font-medium text-foreground">{selectedUser.email}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last Login:</span>
                  </span>
                  <span className="font-medium text-foreground">
                    {formatDate(selectedUser.lastLoginAt)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Account Created:</span>
                  </span>
                  <span className="font-medium text-foreground">
                    {formatDate(selectedUser.createdAt)}
                  </span>
                </div>
              </div>

              {/* Role Selection inside modal */}
              <div className="mt-6">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Change Privilege / Role
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ALL_ROLES.map((r) => {
                    const cfg = ROLE_CONFIG[r];
                    const isCurrent = selectedUser.role === r;

                    return (
                      <button
                        key={r}
                        onClick={() => handleRoleChange(selectedUser.uid, r)}
                        disabled={updatingUid === selectedUser.uid}
                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                          isCurrent
                            ? `${cfg.bg} ${cfg.border} ring-1 ring-primary/40`
                            : "border-border/60 bg-surface/40 hover:bg-surface-2/60"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span
                            className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}
                          >
                            {cfg.label}
                          </span>
                          {isCurrent && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                          {cfg.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-2"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
