import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  User,
  LogOut,
  ShieldAlert,
  BookOpen,
  Languages,
  GraduationCap,
  Sparkles,
  RefreshCw,
  Heart,
  Settings,
  CheckCircle2,
  Lock,
  ArrowLeft,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SidebarLayout } from "@/components/SidebarLayout";
import { UserAvatar } from "@/components/UserAvatar";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { TRANSLATION_STYLES } from "@/lib/openrouter";
import {
  EDUCATION_LEVELS,
  type EducationLevel,
  getEducationLevelMeta,
  getSavedEducationLevel,
  saveEducationLevel,
} from "@/lib/classification";
import { EducationLevelModal } from "@/components/EducationLevelModal";
import { toast } from "sonner";

export const Route = createFileRoute("/user")({
  component: UserProfileRoute,
  head: () => ({
    meta: [
      { title: "User Profile & Translation History — Anuwad" },
      {
        name: "description",
        content: "View your personal profile, learning preferences, and real-time translation activity heatmap on Anuwad.",
      },
    ],
  }),
});

const ROLE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  admin: {
    bg: "bg-red-500/15 text-red-400 border-red-500/30",
    text: "text-red-400",
    border: "border-red-500/30",
  },
  editor: {
    bg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    text: "text-purple-400",
    border: "border-purple-500/30",
  },
  moderator: {
    bg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  viewer: {
    bg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
  user: {
    bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
};

const LANGUAGE_OPTIONS = [
  "Hindi (हिंदी)",
  "English",
  "Telugu (తెలుగు)",
  "Tamil (தமிழ்)",
  "Bengali (বাংলা)",
  "Marathi (मराठी)",
  "Gujarati (ગુજરાતી)",
  "Kannada (ಕನ್ನಡ)",
  "Malayalam (മലയാളം)",
  "Spanish (Español)",
  "French (Français)",
  "German (Deutsch)",
  "Mandarin (中文)",
];

function UserProfileRoute() {
  const { user, loading, isAdmin, signInWithGoogle, signOut, refreshTranslationCount, updateProfile } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [hasCopiedUid, setHasCopiedUid] = useState(false);

  // Preference edit states
  const [nativeLanguage, setNativeLanguage] = useState("");
  const [educationLevel, setEducationLevel] = useState<EducationLevel>(
    () => (user?.educationLevel as EducationLevel) || getSavedEducationLevel() || "class-10",
  );
  const [selectedStyle, setSelectedStyle] = useState("");
  const [educationModalOpen, setEducationModalOpen] = useState(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [hasInitializedPrefs, setHasInitializedPrefs] = useState(false);

  // Initialize preference form once user loads
  useEffect(() => {
    if (user && !hasInitializedPrefs) {
      setNativeLanguage(user.nativeLanguage || "Hindi (हिंदी)");
      const validLevel = EDUCATION_LEVELS.some((l) => l.id === user.educationLevel)
        ? (user.educationLevel as EducationLevel)
        : getSavedEducationLevel() || "class-10";
      setEducationLevel(validLevel);
      setSelectedStyle(user.style || "Native");
      setHasInitializedPrefs(true);
    }
  }, [user, hasInitializedPrefs]);

  // Keep education level in sync with global event changes (e.g. if updated from top bar or library)
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail && EDUCATION_LEVELS.some((l) => l.id === e.detail)) {
        setEducationLevel(e.detail as EducationLevel);
      }
    };
    window.addEventListener("doclens:education-level-changed", handler);
    return () => window.removeEventListener("doclens:education-level-changed", handler);
  }, []);

  const currentLevelMeta = useMemo(
    () => getEducationLevelMeta(educationLevel),
    [educationLevel],
  );

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    try {
      await refreshTranslationCount();
      toast.success("Translation activity and counters synchronized with Supabase.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyUid = () => {
    if (!user?.uid) return;
    void navigator.clipboard.writeText(user.uid);
    setHasCopiedUid(true);
    toast.success("User ID copied to clipboard");
    setTimeout(() => setHasCopiedUid(false), 2000);
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSavingPrefs) return;
    setIsSavingPrefs(true);
    try {
      saveEducationLevel(educationLevel);
      await updateProfile({
        nativeLanguage,
        educationLevel,
        style: selectedStyle,
      });
      toast.success("Learning preferences updated successfully!");
    } catch (err) {
      console.error("Failed to update user profile:", err);
      toast.error("Failed to save preferences. Please try again.");
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const currentRoleStyle = user ? ROLE_STYLES[user.role] || ROLE_STYLES.user : ROLE_STYLES.user;

  return (
    <SidebarLayout pageTitle="User Profile">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/library" className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Library</span>
            </Link>
            <span>/</span>
            <span className="text-foreground font-semibold">User Profile</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Total Translated:{" "}
              <strong id="user-profile-translated-pages-count" className="text-emerald-400 font-extrabold tabular-nums">
                {user ? user.totalTranslatedPages ?? 0 : 0}
              </strong>{" "}
              pages
            </span>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-6">
            <div className="h-36 w-full animate-pulse rounded-2xl bg-surface/50 border border-border/60" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-surface/40 border border-border/40" />
              ))}
            </div>
            <div className="h-64 w-full animate-pulse rounded-2xl bg-surface/30 border border-border/40" />
          </div>
        )}

        {/* Anonymous State */}
        {!loading && !user && (
          <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-card via-surface/80 to-card p-8 sm:p-12 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-md">
              <Lock className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-foreground tracking-tight sm:text-2xl">
              Sign In to View Your Profile
            </h2>
            <p className="mx-auto mt-2 max-w-md text-xs sm:text-sm text-muted-foreground">
              Sign in with your Google account to track your translated pages, view your personal activity heatmap, and save your learning preferences.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6 py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 active:scale-95"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
              <Link
                to="/library"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-secondary/60 px-5 py-2.5 text-xs font-semibold text-foreground transition-all hover:bg-secondary"
              >
                Back to Library
              </Link>
            </div>
          </div>
        )}

        {/* Authenticated User Profile */}
        {!loading && user && (
          <div className="space-y-6">
            {/* User Identity Banner Card */}
            <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-surface/90 to-background p-6 shadow-xl backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex items-center gap-4">
                  <UserAvatar
                    photoURL={user.photoURL}
                    name={user.name}
                    email={user.email}
                    className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover ring-2 ring-primary/40 shadow-lg"
                    fallbackClassName="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-primary/20 text-2xl font-bold text-primary ring-2 ring-primary/40"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
                        {user.name}
                      </h2>
                      <span
                        className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${currentRoleStyle.bg}`}
                      >
                        {user.role}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/80 font-mono bg-surface-2/60 px-2 py-0.5 rounded-md border border-border/40">
                        UID: {user.uid}
                      </span>
                      <button
                        onClick={handleCopyUid}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        title="Copy UID"
                      >
                        {hasCopiedUid ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                  <Link
                    to="/library"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-secondary/70 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                  >
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span>Library</span>
                  </Link>

                  <button
                    onClick={() => void signOut()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 hover:border-destructive/50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Preferences Summary Chips */}
              <div className="mt-5 flex flex-wrap gap-2 pt-4 border-t border-border/50 text-[11px]">
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1 text-muted-foreground">
                  <Languages className="h-3.5 w-3.5 text-primary" />
                  <span>Mother Tongue:</span>
                  <strong className="text-foreground">{user.nativeLanguage || "Hindi (हिंदी)"}</strong>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1 text-muted-foreground">
                  <span className="text-sm">{currentLevelMeta.icon}</span>
                  <span>Academic Level:</span>
                  <strong className="text-foreground">
                    {currentLevelMeta.label}
                  </strong>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Translation Style:</span>
                  <strong className="text-foreground">{user.style || "Native"}</strong>
                </div>
              </div>
            </div>

            {/* Translation Activity Heatmap Component */}
            <ActivityHeatmap userId={user.uid} refreshTrigger={refreshTrigger} />

            {/* Learning Preferences Edit Form */}
            <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-card via-surface/80 to-card p-6 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between pb-4 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-foreground">
                      Learning & Translation Preferences
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Personalize your target language, standard, and explanation style.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSavePreferences} className="mt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Mother Tongue Select */}
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1.5">
                      Mother Tongue
                    </label>
                    <select
                      value={nativeLanguage}
                      onChange={(e) => setNativeLanguage(e.target.value)}
                      className="w-full rounded-xl border border-border/80 bg-surface px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Standard / Education Level Trigger & Modal Trigger */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-foreground block">
                        Academic Standard
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEducationModalOpen(true)}
                      className="w-full flex items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-surface px-3 py-2 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-surface-2 transition-all cursor-pointer text-left group shadow-xs"
                      title="Click to change Class or Academic Goal"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg shrink-0">{currentLevelMeta.icon}</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-foreground block truncate">
                            {currentLevelMeta.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {currentLevelMeta.description}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  {/* Preferred Translation Style */}
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1.5">
                      Preferred Translation Style
                    </label>
                    <select
                      value={selectedStyle}
                      onChange={(e) => setSelectedStyle(e.target.value)}
                      className="w-full rounded-xl border border-border/80 bg-surface px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {TRANSLATION_STYLES.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={isSavingPrefs}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                  >
                    {isSavingPrefs ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span>{isSavingPrefs ? "Saving..." : "Save Preferences"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Quick Links & Account Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isAdmin && (
                <Link
                  to="/admin"
                  className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm hover:bg-primary/10 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground block">Admin Dashboard</span>
                      <span className="text-[11px] text-muted-foreground block">
                        Manage users, verification, and ads
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
                </Link>
              )}

              <Link
                to="/support"
                className="flex items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 shadow-sm hover:bg-rose-500/10 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                    <Heart className="h-5 w-5 fill-rose-500/20" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground block">Support Anuwad</span>
                    <span className="text-[11px] text-muted-foreground block">
                      Contribute to free open education
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-rose-400 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Shared Education Level Modal (OOP Component Triggered from Global Library & Profile) */}
      <EducationLevelModal
        open={educationModalOpen}
        onOpenChange={setEducationModalOpen}
        currentLevel={educationLevel}
        onSelectLevel={(level) => {
          setEducationLevel(level);
          saveEducationLevel(level);
          if (user) {
            void updateProfile({ educationLevel: level }).catch((err) =>
              console.warn("Failed to sync education level in profile:", err),
            );
          }
          toast.success(`Academic Standard set to ${getEducationLevelMeta(level).label}`);
        }}
        confirmButtonText="Save Academic Standard"
        footerNote="Your library curriculum and learning materials adapt to this standard."
      />
    </SidebarLayout>
  );
}
