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
  Fingerprint,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Megaphone,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
  Plus,
  Calendar,
  AlertCircle,
  DollarSign,
  Zap,
  Tag,
  Clock4,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  type AdminUserProfile,
  type UserRole,
  apiAdminListUsers,
  apiAdminUpdateUserRole,
  promptGoogleIdToken,
} from "@/lib/auth-client";
import {
  type AdRecord,
  adminListAllAds,
  adminApproveAd,
  adminRejectAd,
  adminDeleteAd,
} from "@/lib/ads";
import { SidebarLayout } from "@/components/SidebarLayout";
import { UserAvatar } from "@/components/UserAvatar";
import { AdSubmissionModal } from "@/components/AdSubmissionModal";

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

function formatDate(dateStr?: string | null) {
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

function formatExpiryCountdown(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const now = Date.now();
  const expTime = new Date(expiresAt).getTime();
  const diffMs = expTime - now;

  if (diffMs <= 0) {
    const daysAgo = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    return daysAgo === 0 ? "Expired today" : `Expired ${daysAgo}d ago`;
  }

  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));
  if (daysLeft > 1) {
    return `${daysLeft} days left`;
  }
  return `${hoursLeft}h left`;
}

type SortField = "user" | "role" | "lastLogin" | "created";
type SortDirection = "asc" | "desc";

const ROLE_WEIGHT: Record<UserRole, number> = {
  admin: 5,
  editor: 4,
  moderator: 3,
  viewer: 2,
  user: 1,
};

function AdminPage() {
  const { user, loading: authLoading, isAdmin, signInWithGoogle } = useAuth();

  // Tab State: Users vs Direct Ads
  const [activeTab, setActiveTab] = useState<"users" | "ads">("users");

  // Users Management State
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField | null>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserProfile | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Advertising Management State
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsStats, setAdsStats] = useState({
    total: 0,
    pending: 0,
    active: 0,
    expired: 0,
    rejected: 0,
    totalRevenue: 0,
  });
  const [adFilter, setAdFilter] = useState<"all" | "pending" | "active" | "expired" | "rejected">(
    "all",
  );
  const [adSearchQuery, setAdSearchQuery] = useState("");
  const [approvingAdId, setApprovingAdId] = useState<string | null>(null);
  const [rejectingAdId, setRejectingAdId] = useState<string | null>(null);
  const [deletingAdId, setDeletingAdId] = useState<string | null>(null);
  const [createAdModalOpen, setCreateAdModalOpen] = useState(false);

  // Load user list
  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      setUsersLoading(true);
      const data = await apiAdminListUsers();
      setUsers(data);
    } catch (err: any) {
      console.error("Failed to load users:", err);
      toast.error("Failed to fetch users", {
        description: err?.message || "Could not retrieve user directory.",
      });
    } finally {
      setUsersLoading(false);
    }
  };

  // Load advertising list & statistics
  const fetchAds = async () => {
    if (!isAdmin) return;
    try {
      setAdsLoading(true);
      const res = await adminListAllAds();
      if (res?.success) {
        setAds(res.ads);
        if (res.stats) setAdsStats(res.stats);
      }
    } catch (err: any) {
      console.error("Failed to load ads:", err);
      toast.error("Failed to fetch ads", {
        description: err?.message || "Could not retrieve advertising catalog.",
      });
    } finally {
      setAdsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchAds();
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
      fetchUsers();
    } finally {
      setUpdatingUid(null);
    }
  };

  // Approve Ad Handler (Sets approved_at = now() and expires_at = now() + duration)
  const handleApproveAd = async (ad: AdRecord) => {
    try {
      setApprovingAdId(ad.id);
      const toastId = toast.loading(`Approving ad "${ad.title}" for ${ad.duration_days} days...`);

      const res = await adminApproveAd({
        data: {
          id: ad.id,
          customDurationDays: ad.duration_days,
          paymentStatus: "paid",
        },
      });

      if (res?.success && res.ad) {
        setAds((prev) => prev.map((a) => (a.id === ad.id ? res.ad : a)));
        const expiryDate = formatDate(res.ad.expires_at);
        toast.success(`Ad approved and live!`, {
          id: toastId,
          description: `Active until ${expiryDate}`,
        });
        fetchAds();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("anuwad:ads-changed"));
        }
      }
    } catch (err: any) {
      console.error("Approve ad failed:", err);
      toast.error("Failed to approve ad", {
        description: err?.message || "Server error while approving ad.",
      });
    } finally {
      setApprovingAdId(null);
    }
  };

  // Reject Ad Handler
  const handleRejectAd = async (ad: AdRecord) => {
    try {
      setRejectingAdId(ad.id);
      const toastId = toast.loading(`Rejecting ad "${ad.title}"...`);

      const res = await adminRejectAd({
        data: { id: ad.id },
      });

      if (res?.success) {
        setAds((prev) =>
          prev.map((a) => (a.id === ad.id ? { ...a, approval_status: "rejected" } : a)),
        );
        toast.success(`Ad rejected`, { id: toastId });
        fetchAds();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("anuwad:ads-changed"));
        }
      }
    } catch (err: any) {
      console.error("Reject ad failed:", err);
      toast.error("Failed to reject ad", {
        description: err?.message || "Server error while rejecting ad.",
      });
    } finally {
      setRejectingAdId(null);
    }
  };

  // Delete Ad Handler
  const handleDeleteAd = async (ad: AdRecord) => {
    if (!window.confirm(`Are you sure you want to permanently delete ad "${ad.title}"?`)) {
      return;
    }

    try {
      setDeletingAdId(ad.id);
      const toastId = toast.loading(`Deleting ad...`);

      const res = await adminDeleteAd({
        data: { id: ad.id },
      });

      if (res?.success) {
        setAds((prev) => prev.filter((a) => a.id !== ad.id));
        toast.success("Ad permanently deleted", { id: toastId });
        fetchAds();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("anuwad:ads-changed"));
        }
      }
    } catch (err: any) {
      console.error("Delete ad failed:", err);
      toast.error("Failed to delete ad", {
        description: err?.message || "Server error while deleting ad.",
      });
    } finally {
      setDeletingAdId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "lastLogin" || field === "created" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="h-3 w-3 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
      );
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary animate-in fade-in-50 duration-150" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary animate-in fade-in-50 duration-150" />
    );
  };

  // Filtered and sorted users
  const filteredUsers = useMemo(() => {
    const filtered = users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.uid.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });

    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let comp = 0;
      if (sortField === "user") {
        const nameA = (a.name || a.email || "").toLowerCase();
        const nameB = (b.name || b.email || "").toLowerCase();
        comp = nameA.localeCompare(nameB);
      } else if (sortField === "role") {
        const weightA = ROLE_WEIGHT[a.role] ?? 0;
        const weightB = ROLE_WEIGHT[b.role] ?? 0;
        comp = weightA - weightB;
        if (comp === 0) {
          comp = (a.name || a.email || "").localeCompare(b.name || b.email || "");
        }
      } else if (sortField === "lastLogin") {
        const timeA = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
        const timeB = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
        comp = timeA - timeB;
      } else if (sortField === "created") {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        comp = timeA - timeB;
      }

      return sortDirection === "asc" ? comp : -comp;
    });
  }, [users, searchQuery, roleFilter, sortField, sortDirection]);

  // Filtered Ads
  const filteredAds = useMemo(() => {
    const now = Date.now();
    return ads.filter((ad) => {
      const matchesSearch =
        ad.title.toLowerCase().includes(adSearchQuery.toLowerCase()) ||
        ad.advertiser_name.toLowerCase().includes(adSearchQuery.toLowerCase()) ||
        ad.advertiser_email.toLowerCase().includes(adSearchQuery.toLowerCase()) ||
        (ad.advertiser_company &&
          ad.advertiser_company.toLowerCase().includes(adSearchQuery.toLowerCase())) ||
        ad.target_url.toLowerCase().includes(adSearchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (adFilter === "all") return true;
      if (adFilter === "pending") return ad.approval_status === "pending";
      if (adFilter === "rejected") return ad.approval_status === "rejected";
      if (adFilter === "active") {
        return (
          ad.approval_status === "approved" &&
          ad.expires_at &&
          new Date(ad.expires_at).getTime() > now
        );
      }
      if (adFilter === "expired") {
        return (
          ad.approval_status === "approved" &&
          ad.expires_at &&
          new Date(ad.expires_at).getTime() <= now
        );
      }
      return true;
    });
  }, [ads, adSearchQuery, adFilter]);

  // Statistics
  const userStats = useMemo(() => {
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
      setUsersLoading(true);
      toast.info("Opening Google verification popup...");
      await promptGoogleIdToken();
      toast.success("Admin credentials verified!");
      fetchUsers();
      fetchAds();
    } catch (err: any) {
      console.error("Reauthorization failed:", err);
      toast.error("Failed to verify admin credentials", {
        description: err?.message || "Popup was cancelled or authentication failed.",
      });
    } finally {
      setUsersLoading(false);
    }
  };

  const handleRefresh = () => {
    if (activeTab === "users") {
      fetchUsers();
    } else {
      fetchAds();
    }
  };

  return (
    <SidebarLayout
      pageTitle="Administration"
      topBarRight={
        <div className="flex items-center gap-2">
          <button
            onClick={handleReauthorize}
            disabled={usersLoading || adsLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20 hover:border-primary/50 disabled:opacity-50"
            title="Re-verify Google authentication for admin operations"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Verify Token</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={usersLoading || adsLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-surface-2 disabled:opacity-50"
            title="Refresh current directory"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${usersLoading || adsLoading ? "animate-spin text-primary" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 space-y-6">
        {/* Navigation Tab Pills */}
        <div className="flex items-center gap-2 border-b border-border/80 pb-3">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
              activeTab === "users"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "bg-surface-2/60 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>User Directory & Roles</span>
          </button>

          <button
            onClick={() => setActiveTab("ads")}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
              activeTab === "ads"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "bg-surface-2/60 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Megaphone className="h-4 w-4" />
            <span>Direct Advertising & Sponsors</span>
            {adsStats.pending > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-black shadow-sm animate-pulse">
                {adsStats.pending} Pending
              </span>
            )}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: USERS & ROLE MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === "users" && (
          <div className="space-y-6">
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
                    {userStats.total}
                  </p>
                </div>

                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs text-red-400">
                    <span>Admins</span>
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-red-400">
                    {userStats.admins}
                  </p>
                </div>

                <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs text-purple-400">
                    <span>Editors & Mods</span>
                    <Sparkles className="h-4 w-4 text-purple-400" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-purple-400">
                    {userStats.editors + userStats.moderators}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs text-emerald-400">
                    <span>Standard Users</span>
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">
                    {userStats.standardUsers}
                  </p>
                </div>
              </div>
            </div>

            {/* Controls: Search and Filter */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface/60 shadow-xl backdrop-blur-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border/80 bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleSort("user")}
                          className="group flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded cursor-pointer select-none"
                          title="Sort by User name / email"
                        >
                          <span className={sortField === "user" ? "text-foreground" : ""}>
                            User
                          </span>
                          {renderSortIcon("user")}
                        </button>
                      </th>
                      <th className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleSort("role")}
                          className="group flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded cursor-pointer select-none"
                          title="Sort by Role priority"
                        >
                          <span className={sortField === "role" ? "text-foreground" : ""}>
                            Role
                          </span>
                          {renderSortIcon("role")}
                        </button>
                      </th>
                      <th className="px-6 py-3.5 hidden md:table-cell">
                        <button
                          type="button"
                          onClick={() => handleSort("lastLogin")}
                          className="group flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded cursor-pointer select-none"
                          title="Sort by Last Login time"
                        >
                          <span className={sortField === "lastLogin" ? "text-foreground" : ""}>
                            Last Login
                          </span>
                          {renderSortIcon("lastLogin")}
                        </button>
                      </th>
                      <th className="px-6 py-3.5 hidden lg:table-cell">
                        <button
                          type="button"
                          onClick={() => handleSort("created")}
                          className="group flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded cursor-pointer select-none"
                          title="Sort by Account Creation time"
                        >
                          <span className={sortField === "created" ? "text-foreground" : ""}>
                            Created
                          </span>
                          {renderSortIcon("created")}
                        </button>
                      </th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                          {usersLoading ? (
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                              <span>Loading user directory…</span>
                            </div>
                          ) : (
                            <span>No users match the search and filter criteria.</span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const roleCfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.user;
                        const isSelf = user?.uid === u.uid;

                        return (
                          <tr key={u.uid} className="group transition-colors hover:bg-surface-2/40">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <UserAvatar name={u.name} email={u.email} photoURL={u.photoURL} />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground">
                                      {u.name || "Anonymous User"}
                                    </span>
                                    {isSelf && (
                                      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{u.email}</div>
                                  <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/60">
                                    <span>{u.uid.substring(0, 16)}…</span>
                                    <button
                                      onClick={() => copyToClipboard(u.uid, u.uid)}
                                      className="hover:text-foreground"
                                      title="Copy UID"
                                    >
                                      {copiedId === u.uid ? (
                                        <Check className="h-3 w-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${roleCfg.bg} ${roleCfg.text} ${roleCfg.border}`}
                              >
                                {roleCfg.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-muted-foreground hidden md:table-cell">
                              {formatDate(u.lastLoginAt)}
                            </td>
                            <td className="px-6 py-4 text-xs text-muted-foreground hidden lg:table-cell">
                              {formatDate(u.createdAt)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <select
                                  value={u.role}
                                  onChange={(e) =>
                                    handleRoleChange(u.uid, e.target.value as UserRole)
                                  }
                                  disabled={updatingUid === u.uid}
                                  className="rounded-lg border border-border/80 bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:bg-surface-2 focus:border-primary focus:outline-none disabled:opacity-50"
                                >
                                  {ALL_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      Set as {ROLE_CONFIG[r].label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DIRECT ADVERTISING & SPONSORSHIPS SYSTEM */}
        {/* ========================================================================= */}
        {activeTab === "ads" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            {/* Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-surface to-background p-6 shadow-xl backdrop-blur-xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                      <Megaphone className="h-4 w-4" />
                    </span>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                      Direct Advertising & Sponsors
                    </h1>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Review advertiser submissions, approve live campaigns, and manage sponsored
                    placements in the global reader dock.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCreateAdModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create / Submit Ad</span>
                  </button>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Total Submissions</span>
                    <Megaphone className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                    {adsStats.total}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs text-amber-400">
                    <span>Pending Review</span>
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-amber-400">
                    {adsStats.pending}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs text-emerald-400">
                    <span>Active Live</span>
                    <Zap className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">
                    {adsStats.active}
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Expired / Rejected</span>
                    <Clock4 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-muted-foreground">
                    {adsStats.expired + adsStats.rejected}
                  </p>
                </div>
              </div>
            </div>

            {/* Controls: Search and Filter */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search ads by title, company, advertiser, URL…"
                  value={adSearchQuery}
                  onChange={(e) => setAdSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border/80 bg-surface/80 pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm backdrop-blur-sm transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  Filter:
                </span>
                {[
                  { id: "all", label: "All", count: adsStats.total },
                  { id: "pending", label: "Pending Review", count: adsStats.pending },
                  { id: "active", label: "Active Live", count: adsStats.active },
                  { id: "expired", label: "Expired", count: adsStats.expired },
                  { id: "rejected", label: "Rejected", count: adsStats.rejected },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setAdFilter(f.id as any)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                      adFilter === f.id
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                        : "border border-border/60 bg-surface/50 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span>{f.label}</span>
                    <span className="opacity-70">({f.count})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ads List / Table */}
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface/60 shadow-xl backdrop-blur-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border/80 bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5">Ad Creative & Target</th>
                      <th className="px-6 py-3.5">Advertiser</th>
                      <th className="px-6 py-3.5">Package / Duration</th>
                      <th className="px-6 py-3.5">Status & Expiry</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredAds.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                          {adsLoading ? (
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                              <span>Loading ads catalog…</span>
                            </div>
                          ) : (
                            <span>No advertisements match the selected filter.</span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredAds.map((ad) => {
                        const now = Date.now();
                        const isPending = ad.approval_status === "pending";
                        const isRejected = ad.approval_status === "rejected";
                        const isApproved = ad.approval_status === "approved";
                        const isLive =
                          isApproved && ad.expires_at && new Date(ad.expires_at).getTime() > now;
                        const isExpired =
                          isApproved && ad.expires_at && new Date(ad.expires_at).getTime() <= now;

                        const countdownStr = formatExpiryCountdown(ad.expires_at);

                        return (
                          <tr
                            key={ad.id}
                            className={`group transition-colors ${
                              isPending
                                ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]"
                                : "hover:bg-surface-2/40"
                            }`}
                          >
                            {/* Creative Preview */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3.5">
                                <div className="relative h-14 w-14 flex-shrink-0 rounded-2xl overflow-hidden border border-border shadow-md bg-zinc-900 flex items-center justify-center">
                                  <span className="absolute top-1 left-1 rounded-md bg-amber-400 px-1 py-0.2 text-[8px] font-black text-black z-10 leading-tight shadow-sm">
                                    AD
                                  </span>
                                  <img
                                    src={ad.image_url}
                                    alt={ad.title}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = "none";
                                    }}
                                  />
                                </div>

                                <div className="space-y-1 min-w-0 max-w-xs">
                                  <div className="flex items-center gap-1.5 font-bold text-foreground truncate">
                                    <span>{ad.title}</span>
                                    {ad.advertiser_company && (
                                      <span className="text-xs font-normal text-muted-foreground">
                                        ({ad.advertiser_company})
                                      </span>
                                    )}
                                  </div>

                                  {ad.description && (
                                    <div className="text-xs text-muted-foreground line-clamp-1">
                                      {ad.description}
                                    </div>
                                  )}

                                  <a
                                    href={ad.target_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline truncate max-w-full"
                                  >
                                    <span className="truncate">{ad.target_url}</span>
                                    <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                                  </a>
                                </div>
                              </div>
                            </td>

                            {/* Advertiser Info */}
                            <td className="px-6 py-4">
                              <div className="space-y-0.5">
                                <div className="font-semibold text-foreground text-xs">
                                  {ad.advertiser_name}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <span>{ad.advertiser_email}</span>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(ad.advertiser_email, `email-${ad.id}`)
                                    }
                                    className="hover:text-foreground"
                                    title="Copy Email"
                                  >
                                    {copiedId === `email-${ad.id}` ? (
                                      <Check className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                                <div className="text-[10px] text-muted-foreground/70">
                                  Submitted: {formatDate(ad.created_at)}
                                </div>
                              </div>
                            </td>

                            {/* Package / Duration */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="font-semibold text-foreground text-xs">
                                  {ad.package_name || `${ad.duration_days} Days`}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-foreground">
                                    ₹{Number(ad.amount_paid).toLocaleString()}
                                  </span>
                                  <span
                                    className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                                      ad.payment_status === "paid"
                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                        : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                    }`}
                                  >
                                    {ad.payment_status}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Status & Expiry */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                {isPending && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-400">
                                    <AlertCircle className="h-3 w-3 animate-pulse" />
                                    <span>Pending Approval</span>
                                  </span>
                                )}

                                {isLive && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                                    <Zap className="h-3 w-3" />
                                    <span>Active Live</span>
                                  </span>
                                )}

                                {isExpired && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>Expired</span>
                                  </span>
                                )}

                                {isRejected && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-400">
                                    <XCircle className="h-3 w-3" />
                                    <span>Rejected</span>
                                  </span>
                                )}

                                {countdownStr && (
                                  <div className="text-[11px] font-medium text-muted-foreground">
                                    {countdownStr} ({formatDate(ad.expires_at)})
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isPending && (
                                  <>
                                    <button
                                      onClick={() => handleApproveAd(ad)}
                                      disabled={approvingAdId === ad.id}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50 cursor-pointer"
                                      title="Approve ad and set live for selected duration"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>Approve</span>
                                    </button>

                                    <button
                                      onClick={() => handleRejectAd(ad)}
                                      disabled={rejectingAdId === ad.id}
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                                      title="Reject ad submission"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                      <span>Reject</span>
                                    </button>
                                  </>
                                )}

                                {!isPending && (
                                  <button
                                    onClick={() => handleApproveAd(ad)}
                                    disabled={approvingAdId === ad.id}
                                    className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 active:scale-95"
                                    title="Renew / Re-approve ad"
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                    <span>Renew</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleDeleteAd(ad)}
                                  disabled={deletingAdId === ad.id}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                  title="Delete ad record"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal for Creating / Submitting Ads via Admin */}
        <AdSubmissionModal
          open={createAdModalOpen}
          onOpenChange={setCreateAdModalOpen}
          activeAds={ads}
          onSuccess={fetchAds}
        />
      </div>
    </SidebarLayout>
  );
}
