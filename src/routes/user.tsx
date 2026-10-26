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
  Heart,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  editor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  moderator: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  viewer: "bg-muted text-muted-foreground border-border/60",
  user: "bg-muted/60 text-muted-foreground border-border/60",
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [hasCopiedUid, setHasCopiedUid] = useState(false);

  // Preference edit states & modal visibility
  const [nativeLanguage, setNativeLanguage] = useState("");
  const [educationLevel, setEducationLevel] = useState<EducationLevel>(
    () => (user?.educationLevel as EducationLevel) || getSavedEducationLevel() || "class-10",
  );
  const [selectedStyle, setSelectedStyle] = useState("");
  const [hasInitializedPrefs, setHasInitializedPrefs] = useState(false);

  // Modal open states
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [educationModalOpen, setEducationModalOpen] = useState(false);
  const [styleModalOpen, setStyleModalOpen] = useState(false);

  // Initialize preference states once user loads
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

  const handleCopyUid = () => {
    if (!user?.uid) return;
    void navigator.clipboard.writeText(user.uid);
    setHasCopiedUid(true);
    toast.success("User ID copied to clipboard");
    setTimeout(() => setHasCopiedUid(false), 2000);
  };

  // Instant save handlers - no save button required
  const handleSelectLanguage = async (lang: string) => {
    setNativeLanguage(lang);
    setLangModalOpen(false);
    if (user) {
      try {
        await updateProfile({ nativeLanguage: lang });
        toast.success(`Mother tongue updated to ${lang}`);
      } catch (err) {
        console.error("Failed to update mother tongue:", err);
        toast.error("Failed to save language preference.");
      }
    }
  };

  const handleSelectStyle = async (styleId: string) => {
    setSelectedStyle(styleId);
    setStyleModalOpen(false);
    if (user) {
      try {
        await updateProfile({ style: styleId });
        toast.success(`Translation style updated to ${styleId}`);
      } catch (err) {
        console.error("Failed to update translation style:", err);
        toast.error("Failed to save translation style.");
      }
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
          <div className="rounded-xl border border-border/60 bg-card p-8 sm:p-10 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-foreground mb-4">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Sign In to View Your Profile
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Sign in to track translated pages, view your translation activity, and save learning preferences.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
                className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary/50 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
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
            <div className="rounded-xl border border-border/60 bg-card p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                <div className="flex items-center gap-4">
                  <UserAvatar
                    photoURL={user.photoURL}
                    name={user.name}
                    email={user.email}
                    className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl object-cover border border-border/80 shadow-xs"
                    fallbackClassName="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-xl bg-surface-2 text-xl font-bold text-foreground border border-border/80"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                        {user.name}
                      </h2>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${currentRoleStyle}`}
                      >
                        {user.role}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground font-mono bg-surface-2/60 px-1.5 py-0.5 rounded border border-border/40">
                        UID: {user.uid}
                      </span>
                      <button
                        onClick={handleCopyUid}
                        className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                        title="Copy UID"
                        aria-label="Copy User ID"
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

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Link
                    to="/library"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Library</span>
                  </Link>

                  <button
                    onClick={() => void signOut()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Preferences Summary Interactive Chips (Click to open auto-saving modal) */}
              <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-border/40 text-xs">
                <button
                  type="button"
                  onClick={() => setLangModalOpen(true)}
                  className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface/50 hover:bg-surface-2 hover:border-primary/50 px-2.5 py-1 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
                  title="Click to change Mother Tongue"
                >
                  <Languages className="h-3.5 w-3.5 text-primary/80 group-hover:text-primary transition-colors" />
                  <span>Mother Tongue:</span>
                  <span className="text-foreground font-medium">
                    {user.nativeLanguage || nativeLanguage || "Hindi (हिंदी)"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEducationModalOpen(true)}
                  className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface/50 hover:bg-surface-2 hover:border-primary/50 px-2.5 py-1 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
                  title="Click to change Academic Standard"
                >
                  <span className="text-sm shrink-0">{currentLevelMeta.icon}</span>
                  <span>Standard:</span>
                  <span className="text-foreground font-medium">{currentLevelMeta.label}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStyleModalOpen(true)}
                  className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface/50 hover:bg-surface-2 hover:border-primary/50 px-2.5 py-1 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
                  title="Click to change Translation Style"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span>Style:</span>
                  <span className="text-foreground font-medium">
                    {user.style || selectedStyle || "Native"}
                  </span>
                </button>
              </div>
            </div>

            {/* Translation Activity Heatmap Component */}
            <ActivityHeatmap userId={user.uid} refreshTrigger={refreshTrigger} />

            {/* Quick Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isAdmin && (
                <Link
                  to="/admin"
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-surface/30 p-3.5 hover:bg-surface/60 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                      <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-foreground block">Admin Dashboard</span>
                      <span className="text-[11px] text-muted-foreground block">
                        Manage users and platform
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}

              <Link
                to="/support"
                className="flex items-center justify-between rounded-xl border border-border/60 bg-surface/30 p-3.5 hover:bg-surface/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                    <Heart className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-foreground block">Support Anuwad</span>
                    <span className="text-[11px] text-muted-foreground block">
                      Contribute to open education
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Mother Tongue Selection Dialog (Auto-saves on click) */}
      <Dialog open={langModalOpen} onOpenChange={setLangModalOpen}>
        <DialogContent className="max-w-md p-6 bg-card border-border/80 sm:rounded-2xl">
          <DialogHeader className="text-left space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Languages className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Select Mother Tongue
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Click any language to immediately set your preferred tongue.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LANGUAGE_OPTIONS.map((lang) => {
                const isSelected = (user?.nativeLanguage || nativeLanguage) === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => void handleSelectLanguage(lang)}
                    className={`flex items-center justify-between gap-2 rounded-xl p-3 text-left text-xs font-medium transition-all cursor-pointer border ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40 shadow-xs"
                        : "border-border/60 bg-surface/40 text-foreground hover:border-primary/40 hover:bg-surface-2"
                    }`}
                  >
                    <span className="truncate">{lang}</span>
                    {isSelected && (
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shared Education Level Modal (Auto-saves on click, no confirm button) */}
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
        showConfirmButton={false}
        footerNote="Click any class card to switch instantly."
      />

      {/* Translation Style Selection Dialog (Auto-saves on click) */}
      <Dialog open={styleModalOpen} onOpenChange={setStyleModalOpen}>
        <DialogContent className="max-w-md p-6 bg-card border-border/80 sm:rounded-2xl">
          <DialogHeader className="text-left space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Select Translation Style
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Click any style to immediately change how translated text is formatted.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-3 space-y-2.5">
            {TRANSLATION_STYLES.map((style) => {
              const isSelected = (user?.style || selectedStyle) === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => void handleSelectStyle(style.id)}
                  className={`w-full flex flex-col items-start gap-1.5 rounded-xl p-3.5 text-left text-xs transition-all cursor-pointer border ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs text-foreground"
                      : "border-border/60 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-sm font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {style.label}
                    </span>
                    {isSelected && (
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {style.instruction}
                  </p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </SidebarLayout>
  );
}
