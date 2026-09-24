import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Heart,
  Sparkles,
  ShieldCheck,
  Globe2,
  Cpu,
  Volume2,
  Layers,
  Check,
  ArrowLeft,
  MessageSquare,
  HelpCircle,
  Users,
  Award,
  Zap,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";
import {
  SUPPORT_TIERS,
  type SupporterRecord,
  type SupportTier,
  getStoredSupportersCache,
  fetchSupportersStats,
  triggerRazorpaySupportCheckout,
} from "@/lib/support";

export const Route = createFileRoute("/support")({
  component: SupportPage,
  head: () => ({
    meta: [
      { title: "Support Our Project — Anuwad" },
      {
        name: "description",
        content:
          "Support Anuwad's mission to eliminate language barriers in literature, books, and knowledge. Help build a privacy-first, zero-knowledge translation platform.",
      },
      { property: "og:title", content: "Support Our Project — Anuwad" },
      {
        property: "og:description",
        content:
          "Language should not be a barrier to accessing knowledge. Support Anuwad's independent, privacy-first document platform.",
      },
      { property: "og:url", content: "https://www.anuwad.com/support" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.anuwad.com/support" }],
  }),
});

type WallFilter = "all" | "recent" | "top";

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffDays > 30) {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHrs > 0) return `${diffHrs}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return "Just now";
  } catch {
    return "Recently";
  }
}

function SupportPage() {
  const { user } = useAuth();

  // Contribution state
  const [selectedTier, setSelectedTier] = useState<SupportTier | null>(SUPPORT_TIERS[2]); // Default to Patron (₹500)
  const [customAmount, setCustomAmount] = useState<string>("");
  const [supporterName, setSupporterName] = useState<string>("");
  const [supporterEmail, setSupporterEmail] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showOptionalFields, setShowOptionalFields] = useState<boolean>(false);

  // Supporters stats and list
  const [supporters, setSupporters] = useState<SupporterRecord[]>([]);
  const [totalRaised, setTotalRaised] = useState<number>(0);
  const [totalSupportersCount, setTotalSupportersCount] = useState<number>(0);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [wallFilter, setWallFilter] = useState<WallFilter>("all");

  // Populate user defaults on auth change
  useEffect(() => {
    if (user) {
      if (!supporterName) setSupporterName(user.name);
      if (!supporterEmail) setSupporterEmail(user.email);
    }
  }, [user]);

  // Load cached stats immediately (SWR), then fetch live data from Firestore / API
  useEffect(() => {
    let mounted = true;

    const cached = getStoredSupportersCache();
    if (cached && cached.supporters && cached.supporters.length > 0) {
      setSupporters(cached.supporters);
      setTotalRaised(cached.totalRaised || 0);
      setTotalSupportersCount(cached.totalSupporters || 0);
      setIsLoadingStats(false);
    } else {
      setIsLoadingStats(true);
    }

    async function syncLiveData() {
      try {
        const stats = await fetchSupportersStats({ forceRefresh: true });
        if (mounted && stats) {
          setSupporters(stats.supporters || []);
          setTotalRaised(stats.totalRaised || 0);
          setTotalSupportersCount(stats.totalSupporters || 0);
        }
      } catch (err) {
        console.error("Failed to load supporters stats:", err);
      } finally {
        if (mounted) setIsLoadingStats(false);
      }
    }

    void syncLiveData();
    return () => {
      mounted = false;
    };
  }, []);

  // Compute active contribution amount
  const effectiveAmount = useMemo(() => {
    if (customAmount.trim()) {
      const parsed = parseInt(customAmount.trim(), 10);
      return !isNaN(parsed) && parsed > 0 ? parsed : 0;
    }
    return selectedTier ? selectedTier.amount : 0;
  }, [selectedTier, customAmount]);

  const handleSelectTier = (tier: SupportTier) => {
    setSelectedTier(tier);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (val: string) => {
    setCustomAmount(val);
    setSelectedTier(null);
  };

  // Handle Razorpay checkout trigger
  const handleSupportCheckout = async () => {
    if (effectiveAmount <= 0) {
      toast.error("Please choose a tier or enter an amount to support.");
      return;
    }

    const tierName = selectedTier ? selectedTier.name : "Custom Believer";
    const donorDisplayName = isAnonymous
      ? "Anonymous Supporter"
      : supporterName.trim() || user?.name || "Community Supporter";
    const donorEmailValue = supporterEmail.trim() || user?.email || "";

    setIsProcessing(true);

    await triggerRazorpaySupportCheckout({
      amount: effectiveAmount,
      tierName,
      donorName: donorDisplayName,
      donorEmail: donorEmailValue,
      isAnonymous,
      message: message.trim(),
      userUid: user?.uid,
      userPhotoURL: isAnonymous ? "" : user?.photoURL || "",
      onSuccess: (paymentId, verifiedRecord) => {
        if (verifiedRecord) {
          setSupporters((prev) => [
            verifiedRecord,
            ...prev.filter((s) => s.id !== verifiedRecord.id),
          ]);
          setTotalRaised((prev) => prev + effectiveAmount);
          setTotalSupportersCount((prev) => prev + 1);
        }
        toast.success("Thank you deeply! Your support has been verified and recorded.");
        setMessage("");
        setIsProcessing(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        toast.error("Payment not completed", { description: err });
      },
      onDismiss: () => {
        setIsProcessing(false);
      },
    });
  };

  // Filter supporters wall
  const filteredSupporters = useMemo(() => {
    const list = supporters.filter((s) => s.status !== "failed");
    if (wallFilter === "top") {
      return list.sort((a, b) => b.amount - a.amount);
    }
    if (wallFilter === "recent") {
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [supporters, wallFilter]);

  // Goal calculation
  const targetGoal = 50000;
  const progressPercent = Math.min(100, Math.round((totalRaised / targetGoal) * 100));

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-rose-500/20 selection:text-rose-400">
      {/* ─── Top Navigation Bar ─── */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img
              src="/light_13746323.png"
              alt="Anuwad Logo"
              className="h-8 w-8 object-contain rounded-lg shadow-xs transition-transform group-hover:scale-105"
            />
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                Anuwad
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
                <Heart className="h-2.5 w-2.5 fill-rose-500/30 text-rose-400" />
                <span>Support</span>
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/library"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Library
            </Link>
            <Link
              to="/global-library"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Global Archives
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-elevated active:scale-95 transition-all shadow-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12 space-y-12 sm:space-y-16">
        {/* ─── HERO & INSTANT CTA CHECKOUT (Direct Above the Fold!) ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Mission, Live Stats, Trust (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400 shadow-xs">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-rose-400" />
                <span>Independent • Privacy-First</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                Fuel Free, Open &amp; Private Knowledge.
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Anuwad runs without corporate paywalls, tracking, or selling data. Your direct support sponsors AI translation inference and neural voice synthesis for students and readers worldwide.
              </p>
            </div>

            {/* Live Stats Pill Card */}
            <div className="rounded-2xl border border-border/80 bg-surface/60 p-5 backdrop-blur-md shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                    Community Pool
                  </span>
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {isLoadingStats ? "₹..." : `₹${totalRaised.toLocaleString("en-IN")}`}
                  </div>
                </div>

                <div className="text-right space-y-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-end gap-1">
                    <Users className="h-3 w-3 text-primary" />
                    Believers
                  </span>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {isLoadingStats ? "..." : `${totalSupportersCount} Backers`}
                  </div>
                </div>
              </div>

              {/* Progress towards 2026 infra goal */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-medium text-muted-foreground">Compute Infrastructure Goal</span>
                  <span className="font-mono font-bold text-rose-400">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-2 border border-border/80 overflow-hidden relative">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-primary transition-all duration-700"
                    style={{ width: `${Math.max(5, progressPercent)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border/60 bg-surface/40 p-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-foreground/80 block">Zero-Knowledge</span>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface/40 p-2.5">
                <Globe2 className="h-4 w-4 text-primary mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-foreground/80 block">90+ Languages</span>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface/40 p-2.5">
                <Zap className="h-4 w-4 text-amber-400 mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-foreground/80 block">Open Source</span>
              </div>
            </div>
          </div>

          {/* Right Column: High-Converting, Direct Payment Widget (7 cols) */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border-2 border-rose-500/30 bg-card p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

              <div className="space-y-6 relative z-10">
                {/* Header of Checkout */}
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                      <Heart className="h-5 w-5 text-rose-500 fill-rose-500/30" />
                      <span>Choose Support Amount</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Fast, secure payment via Razorpay (UPI, GPay, Cards, NetBanking).
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Instant Receipt</span>
                  </span>
                </div>

                {/* Preset Tier Pills */}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                    {SUPPORT_TIERS.map((tier) => {
                      const isSelected = selectedTier?.id === tier.id && !customAmount;
                      const isPopular = tier.id === "patron";

                      return (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => handleSelectTier(tier)}
                          className={`relative flex flex-col items-center justify-center rounded-2xl border p-3 py-3.5 text-center transition-all cursor-pointer active:scale-95 ${
                            isSelected
                              ? "border-rose-500 bg-rose-500/15 shadow-md ring-2 ring-rose-500/30 text-foreground"
                              : "border-border/70 bg-surface/40 hover:border-border-strong hover:bg-surface-2/60 text-muted-foreground"
                          }`}
                        >
                          {isPopular && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.2 text-[8px] font-bold text-white uppercase tracking-wider shadow-xs whitespace-nowrap">
                              Popular
                            </span>
                          )}
                          <span className="text-lg mb-1">{tier.icon}</span>
                          <span className={`text-base font-bold font-mono ${isSelected ? "text-rose-400" : "text-foreground"}`}>
                            ₹{tier.amount}
                          </span>
                          <span className="text-[10px] font-semibold tracking-tight truncate w-full mt-0.5 opacity-80">
                            {tier.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Amount Input */}
                  <div className="relative pt-1.5">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Or enter any custom amount..."
                      value={customAmount}
                      onChange={(e) => handleCustomAmountChange(e.target.value)}
                      className="w-full rounded-xl border border-border/80 bg-surface/50 py-2.5 pl-8 pr-4 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                {/* Optional Message & Display Name Accordion */}
                <div className="rounded-2xl border border-border/60 bg-surface/40 overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => setShowOptionalFields(!showOptionalFields)}
                    className="w-full flex items-center justify-between p-3.5 text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span>
                        {showOptionalFields
                          ? "Hide Message & Supporter Details"
                          : "Add a personal note or customize your wall name"}
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                        showOptionalFields ? "rotate-180 text-foreground" : ""
                      }`}
                    />
                  </button>

                  {showOptionalFields && (
                    <div className="p-4 pt-1 space-y-3.5 border-t border-border/40">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                            Your Name (for Wall)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Maya Lin"
                            value={supporterName}
                            disabled={isAnonymous}
                            onChange={(e) => setSupporterName(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary disabled:opacity-40"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                            Email (for private receipt)
                          </label>
                          <input
                            type="email"
                            placeholder="you@example.com"
                            value={supporterEmail}
                            onChange={(e) => setSupporterEmail(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                          Message of Encouragement (Optional)
                        </label>
                        <textarea
                          rows={2}
                          maxLength={200}
                          placeholder="Why do you support open multilingual reading?"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background/80 p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-rose-500"
                        />
                      </div>

                      <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={isAnonymous}
                          onChange={(e) => setIsAnonymous(e.target.checked)}
                          className="h-4 w-4 rounded border-border text-rose-500 focus:ring-rose-500"
                        />
                        <span className="text-xs font-medium text-foreground">
                          Make my contribution anonymous on the Supporters Wall
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Prominent Checkout Button (Immediate Far-Reaching CTA) */}
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    onClick={handleSupportCheckout}
                    disabled={isProcessing || effectiveAmount <= 0}
                    className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-rose-500 via-rose-600 to-purple-600 px-6 py-4 text-base font-bold text-white shadow-xl shadow-rose-500/25 transition-all hover:opacity-95 hover:shadow-rose-500/40 active:scale-[0.98] disabled:opacity-40 cursor-pointer"
                  >
                    <Heart className="h-5 w-5 fill-white" />
                    <span>
                      {isProcessing
                        ? "Opening Checkout..."
                        : `Support with ₹${effectiveAmount.toLocaleString("en-IN")}`}
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Razorpay Secure</span>
                    </span>
                    <span>•</span>
                    <span>UPI / GPay / PhonePe / Cards</span>
                    <span>•</span>
                    <span>One-time contribution</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── WHERE YOUR SUPPORT GOES (Punchy 4-Pillar Grid) ─── */}
        <section className="space-y-6 pt-4 border-t border-border/60">
          <div className="text-center space-y-1.5 max-w-xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Where 100% of Your Funds Go
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Direct compute and sovereign infrastructure for the community.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border/80 bg-surface/40 p-5 space-y-2.5 backdrop-blur-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Cpu className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground">AI Compute Tokens</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Subsidizes high-throughput model inference for free translation across 90+ languages for students.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-surface/40 p-5 space-y-2.5 backdrop-blur-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                <Volume2 className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Neural Voice Packs</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hosting and fine-tuning on-device natural voice packages so users can listen offline to translated books.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-surface/40 p-5 space-y-2.5 backdrop-blur-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Layers className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground">OCR &amp; Layout Engine</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Continuous improvement to client-side OCR and complex multi-column PDF reconstruction.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-surface/40 p-5 space-y-2.5 backdrop-blur-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <BookOpen className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Global Public Archives</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Preserving and distributing public-domain philosophy, science, and literature freely to all.
              </p>
            </div>
          </div>
        </section>

        {/* ─── SUPPORTERS WALL (Hall of Fame) ─── */}
        <section className="space-y-6 pt-4 border-t border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                <Award className="h-3.5 w-3.5" />
                <span>Hall of Community Believers</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-1">
                Supporters Wall
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                The community backing open, multilingual knowledge.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-surface-2/70 p-1 border border-border self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setWallFilter("all")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  wallFilter === "all"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setWallFilter("recent")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  wallFilter === "recent"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Recent
              </button>
              <button
                type="button"
                onClick={() => setWallFilter("top")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  wallFilter === "top"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Top Patrons
              </button>
            </div>
          </div>

          {/* Supporters Grid */}
          {filteredSupporters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-surface/30 p-10 text-center space-y-3">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
                <Heart className="h-5 w-5 fill-rose-500/20" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                Be the First Believer on the Wall
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No contributions yet in this active session. Pick an amount above to become the foundational patron of Anuwad!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredSupporters.map((supporter, idx) => {
                const displayName = supporter.isAnonymous
                  ? "Anonymous Believer"
                  : supporter.supporterName || "Community Supporter";

                return (
                  <div
                    key={supporter.id || idx}
                    className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card/60 p-4 backdrop-blur-md hover:border-rose-500/30 transition-all shadow-xs"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {supporter.isAnonymous ? (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted-foreground ring-1 ring-border text-xs font-bold">
                              ✨
                            </div>
                          ) : (
                            <UserAvatar
                              photoURL={supporter.userPhotoURL}
                              name={displayName}
                              className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                              fallbackClassName="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-foreground">
                              {displayName}
                            </p>
                            <span className="inline-block text-[10px] text-muted-foreground">
                              {formatRelativeTime(supporter.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="inline-block rounded-md bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-xs font-bold font-mono text-rose-400">
                            ₹{supporter.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>

                      {supporter.message && (
                        <div className="rounded-xl bg-surface-2/50 border border-border/50 p-2.5 text-xs text-foreground/90 italic leading-relaxed flex items-start gap-2">
                          <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 not-italic" />
                          <p className="line-clamp-3 font-normal text-[11px]">"{supporter.message}"</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="capitalize font-semibold text-foreground/70">
                        {supporter.tier || "Supporter"}
                      </span>
                      <span className="font-mono text-[9px] opacity-70">Verified</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── FAQ & TRANSPARENCY (Compact Grid) ─── */}
        <section className="space-y-5 pt-4 border-t border-border/60">
          <div className="text-center space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center justify-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <span>Questions &amp; Transparency</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-1.5">
              <h4 className="font-bold text-foreground text-xs sm:text-sm">Can I pay internationally or with UPI?</h4>
              <p className="text-muted-foreground leading-relaxed text-xs">
                Yes! Razorpay supports all UPI apps (GPay, PhonePe, Paytm), Indian NetBanking, and international credit/debit cards (Visa, Mastercard, Amex).
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-1.5">
              <h4 className="font-bold text-foreground text-xs sm:text-sm">How is my privacy protected?</h4>
              <p className="text-muted-foreground leading-relaxed text-xs">
                If you choose "Remain Anonymous", your name, email, and Google profile are completely excluded from public wall feeds.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-1.5">
              <h4 className="font-bold text-foreground text-xs sm:text-sm">Is Anuwad open source?</h4>
              <p className="text-muted-foreground leading-relaxed text-xs">
                Yes, our frontend codebase and client engines are open on GitHub. Knowledge access tools should remain inspectable and accessible by everyone.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-1.5">
              <h4 className="font-bold text-foreground text-xs sm:text-sm">How else can I help?</h4>
              <p className="text-muted-foreground leading-relaxed text-xs">
                Share Anuwad with fellow students, contribute on GitHub, translate public-domain books for the Global Library, or give us product feedback!
              </p>
            </div>
          </div>
        </section>

        {/* ─── Minimal Footer ─── */}
        <footer className="border-t border-border pt-6 text-center text-xs text-muted-foreground space-y-3">
          <div className="flex justify-center items-center gap-5 font-medium">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/library" className="hover:text-foreground transition-colors">
              Library
            </Link>
            <Link to="/global-library" className="hover:text-foreground transition-colors">
              Global Archives
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
          <p className="text-[11px]">
            © {new Date().getFullYear()} Anuwad.com — Independent, Mission-Driven AI Document Reading.
          </p>
        </footer>
      </main>
    </div>
  );
}
