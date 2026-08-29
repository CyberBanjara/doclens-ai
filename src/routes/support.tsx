import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Heart,
  Sparkles,
  ShieldCheck,
  BookOpen,
  Globe2,
  Lock,
  Cpu,
  Volume2,
  Layers,
  Check,
  ArrowLeft,
  ExternalLink,
  MessageSquare,
  HelpCircle,
  Users,
  Award,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";
import {
  SUPPORT_TIERS,
  type SupporterRecord,
  type SupportTier,
  fetchSupportersStats,
  recordSupportContribution,
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
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);

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

  // Load cached stats / fetch dynamic data
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setIsLoadingStats(true);
      try {
        const stats = await fetchSupportersStats();
        if (mounted) {
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

    void loadData();
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
        setPaymentSuccess(true);
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
    const list = [...supporters];
    if (wallFilter === "top") {
      return list.sort((a, b) => b.amount - a.amount);
    }
    if (wallFilter === "recent") {
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [supporters, wallFilter]);

  // Goal calculation (Target: ₹50,000 for 2026 Model Inference & Voice Infrastructure)
  const targetGoal = 50000;
  const progressPercent = Math.min(100, Math.round((totalRaised / targetGoal) * 100));

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-rose-500/20 selection:text-rose-400">
      {/* ─── Navigation Top Bar ─── */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/light_13746323.png"
              alt="Anuwad Logo"
              className="h-9 w-9 object-contain rounded-lg shadow-sm transition-transform group-hover:scale-105"
            />
            <div>
              <span className="text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                Anuwad
              </span>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-400 border border-rose-500/20">
                <Heart className="h-3 w-3 fill-rose-500/20" />
                <span>Support</span>
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
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
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3.5 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-primary/20 active:scale-95 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-16 space-y-16">
        {/* ─── Hero / Manifesto Section ─── */}
        <section className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-xs font-semibold text-rose-400 shadow-sm animate-in fade-in zoom-in duration-300">
            <Sparkles className="h-4 w-4 animate-pulse text-rose-400" />
            <span>Independent • Privacy-First • Mission-Driven</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            Knowledge Belongs to Everyone. <br />
            <span className="bg-gradient-to-r from-rose-400 via-purple-400 to-primary bg-clip-text text-transparent">
              Not Just Those Who Speak One Language.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground/80 leading-relaxed max-w-2xl mx-auto font-normal">
            Anuwad was born from a simple conviction:{" "}
            <strong className="text-foreground font-semibold">
              language should never be a barrier to human wisdom, literature, or research
            </strong>
            . We are building a sovereign, zero-knowledge platform that lets anyone read any
            document in their own tongue — without surveillance, corporate paywalls, or data
            exploitation.
          </p>

          <div className="flex flex-wrap justify-center items-center gap-4 pt-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-1.5 rounded-full bg-surface-2/60 border border-border px-3 py-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>100% Client-Side Privacy</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-surface-2/60 border border-border px-3 py-1.5">
              <Globe2 className="h-4 w-4 text-primary" />
              <span>90+ Supported Languages</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-surface-2/60 border border-border px-3 py-1.5">
              <Heart className="h-4 w-4 text-rose-400 fill-rose-400/20" />
              <span>Powered by the Community</span>
            </div>
          </div>
        </section>

        {/* ─── Live Total & Community Impact Goal ─── */}
        <section className="rounded-3xl border border-border/80 bg-gradient-to-b from-card/80 to-surface/90 p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Stat 1: Live Total */}
            <div className="space-y-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                <span>Live Community Pool</span>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-mono">
                {isLoadingStats ? (
                  <span className="opacity-50 animate-pulse">₹...</span>
                ) : (
                  `₹${totalRaised.toLocaleString("en-IN")}`
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Raised directly from community supporters
              </p>
            </div>

            {/* Stat 2: Total Believers */}
            <div className="space-y-1 text-center md:text-left border-y md:border-y-0 md:border-x border-border/60 py-4 md:py-0 md:px-6">
              <div className="flex items-center justify-center md:justify-start gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Users className="h-3.5 w-3.5" />
                <span>Community Believers</span>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-mono">
                {isLoadingStats ? (
                  <span className="opacity-50 animate-pulse">...</span>
                ) : (
                  `${totalSupportersCount} Supporters`
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Backing open knowledge across the globe
              </p>
            </div>

            {/* Stat 3: Milestone Goal Bar */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-foreground">2026 Core Compute Goal</span>
                <span className="font-mono font-bold text-rose-400">
                  {progressPercent}% (₹{totalRaised.toLocaleString("en-IN")} / ₹
                  {targetGoal.toLocaleString("en-IN")})
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-surface-2 border border-border/80 overflow-hidden relative p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 via-purple-500 to-primary transition-all duration-700 shadow-sm"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Funds OCR token quotas, neural voice caches, and serverless infrastructure.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Story & Problem / Vision ─── */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Why We Are Building Anuwad
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              People helping build something they believe should exist in the world.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border/80 bg-surface/50 p-6 space-y-4 backdrop-blur-md hover:border-primary/40 transition-colors">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
                <BookOpen className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">The Knowledge Monopoly</h3>
              <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
                Over 80% of published academic research, classical literature, and technical manuals
                exist only in English or a handful of languages. Millions of eager students,
                thinkers, and readers are locked out by language barriers.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-surface/50 p-6 space-y-4 backdrop-blur-md hover:border-primary/40 transition-colors">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">The Surveillance Economy</h3>
              <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
                Existing AI document readers upload your confidential books, contracts, and research
                to central servers, tracking your reading habits and training closed corporate
                models on your personal data.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-surface/50 p-6 space-y-4 backdrop-blur-md hover:border-primary/40 transition-colors">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Sovereign & Local First</h3>
              <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
                Anuwad renders and parses documents entirely inside your browser sandbox.
                Translation happens directly with user choice and open models. Nothing is monetized,
                sold, or withheld behind arbitrary subscriptions.
              </p>
            </div>
          </div>
        </section>

        {/* ─── How Support Helps ─── */}
        <section className="rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-10 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-primary/20 pb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                How Your Support Directly Helps
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Transparent stewardship of every rupee contributed.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-background/80 border border-primary/30 px-3.5 py-1.5 text-xs font-semibold text-primary shrink-0">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>100% Independent & Self-Sustaining</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Cpu className="h-4 w-4 text-primary" />
                <span>AI Compute Tokens</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Subsidizes high-throughput model inference for free translation across 90+ languages
                for students and open readers.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Volume2 className="h-4 w-4 text-purple-400" />
                <span>Neural Voice Packs</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hosting and fine-tuning on-device natural voice packages so users can listen to
                translated books seamlessly.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>OCR & Layout Engines</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Developing faster client-side OCR and complex multi-column PDF layout reconstruction
                algorithms.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Globe2 className="h-4 w-4 text-amber-400" />
                <span>Global Public Archives</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Preserving and distributing public-domain manuscripts, philosophy, and educational
                books freely to all.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Contribution Form & Razorpay Module ─── */}
        <section id="contribute" className="space-y-8 pt-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Choose Your Support Level
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Every contribution directly fuels open knowledge development. Powered securely by
              Razorpay.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 sm:p-10 shadow-2xl space-y-8">
            {/* Step 1: Preset Tiers Grid */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                1. Select a Supporter Tier
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {SUPPORT_TIERS.map((tier) => {
                  const isSelected = selectedTier?.id === tier.id && !customAmount;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => handleSelectTier(tier)}
                      className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all active:scale-95 ${
                        isSelected
                          ? "border-rose-500 bg-rose-500/10 shadow-md ring-2 ring-rose-500/20"
                          : "border-border bg-surface/50 hover:border-border-strong hover:bg-surface-2/60 text-muted-foreground"
                      }`}
                    >
                      {tier.id === "patron" && (
                        <span className="absolute -top-2.5 right-3 rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-sm">
                          Popular
                        </span>
                      )}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xl">{tier.icon}</span>
                          <span
                            className={`text-lg font-bold font-mono ${isSelected ? "text-rose-400 font-extrabold" : "text-foreground"}`}
                          >
                            ₹{tier.amount}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-foreground">{tier.name}</h4>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {tier.description}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/50 text-[10px] space-y-1">
                        {tier.perks.slice(0, 2).map((perk, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-foreground/80">
                            <Check className="h-3 w-3 text-rose-400 shrink-0" />
                            <span className="truncate">{perk}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom Amount Field */}
              <div className="pt-2">
                <div className="relative max-w-xs">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Or enter custom amount..."
                    value={customAmount}
                    onChange={(e) => handleCustomAmountChange(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface/50 py-2.5 pl-8 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Supporter Details & Privacy Toggle */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  2. Supporter Info
                </label>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Your Name / Display Alias
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Maya Lin"
                      value={supporterName}
                      disabled={isAnonymous}
                      onChange={(e) => setSupporterName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface/50 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary disabled:opacity-40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Email Address (Optional / Private receipt)
                    </label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={supporterEmail}
                      onChange={(e) => setSupporterEmail(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface/50 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary"
                    />
                  </div>
                </div>

                {/* Anonymous Choice */}
                <div className="rounded-xl border border-border/80 bg-surface-2/40 p-3.5 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-rose-500 focus:ring-rose-500"
                    />
                    <span className="text-xs font-semibold text-foreground">
                      Make my contribution Anonymous on the Wall
                    </span>
                  </label>
                  <p className="text-[11px] text-muted-foreground pl-7">
                    Your name and avatar will be hidden and displayed as "Anonymous Supporter".
                  </p>
                </div>
              </div>

              {/* Message to Creator / Community */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  3. Words of Encouragement (Optional)
                </label>
                <div>
                  <textarea
                    rows={4}
                    maxLength={300}
                    placeholder="Share why you believe in Anuwad or what books you're translating..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface/50 p-3.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-rose-500"
                  />
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1 px-1">
                    <span>Displayed with your contribution card</span>
                    <span>{message.length}/300</span>
                  </div>
                </div>

                {/* Summary & Trigger */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSupportCheckout}
                    disabled={isProcessing || effectiveAmount <= 0}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-500/25 transition-all hover:opacity-95 active:scale-95 disabled:opacity-40"
                  >
                    <Heart className="h-4 w-4 fill-white" />
                    <span>
                      {isProcessing
                        ? "Opening Checkout..."
                        : `Support Anuwad with ₹${effectiveAmount.toLocaleString("en-IN")}`}
                    </span>
                  </button>

                  <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Secured with Razorpay (UPI, Cards, NetBanking)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Community Supporters Wall ─── */}
        <section className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/80 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                <Award className="h-3.5 w-3.5" />
                <span>Hall of Community Believers</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
                Supporters Wall
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                The people actively making multilingual open knowledge possible.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-surface-2/60 p-1 border border-border self-start sm:self-auto">
              <button
                onClick={() => setWallFilter("all")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  wallFilter === "all"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Believers
              </button>
              <button
                onClick={() => setWallFilter("recent")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  wallFilter === "recent"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Recent
              </button>
              <button
                onClick={() => setWallFilter("top")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  wallFilter === "top"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Top Patrons
              </button>
            </div>
          </div>

          {/* Supporters Grid */}
          {filteredSupporters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-surface/30 p-12 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
                <Heart className="h-6 w-6 fill-rose-500/20" />
              </div>
              <h3 className="text-base font-bold text-foreground">
                Be the First Believer on the Wall
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No contributions yet in this active session. Choose a tier above to become the
                foundational patron of Anuwad!
              </p>
              <a
                href="#contribute"
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all mt-2"
              >
                Support Now
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSupporters.map((supporter, idx) => {
                const displayName = supporter.isAnonymous
                  ? "Anonymous Believer"
                  : supporter.supporterName || "Community Supporter";

                return (
                  <div
                    key={supporter.id || idx}
                    className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card/60 p-4 backdrop-blur-md hover:border-rose-500/30 transition-all shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {supporter.isAnonymous ? (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted-foreground ring-1 ring-border text-xs font-bold">
                              ✨
                            </div>
                          ) : (
                            <UserAvatar
                              photoURL={supporter.userPhotoURL}
                              name={displayName}
                              className="h-9 w-9 rounded-full object-cover ring-1 ring-border"
                              fallbackClassName="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary"
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
                        <div className="rounded-xl bg-surface-2/50 border border-border/60 p-2.5 text-xs text-foreground/90 italic leading-relaxed flex items-start gap-2">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 not-italic" />
                          <p className="line-clamp-3 font-normal">"{supporter.message}"</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="capitalize font-semibold text-foreground/70">
                        {supporter.tier || "Supporter"}
                      </span>
                      <span className="font-mono text-[9px] opacity-70">Verified via Razorpay</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── Frequently Asked Questions & Transparency ─── */}
        <section className="space-y-6 pt-4 border-t border-border">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center justify-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              <span>Questions & Transparency</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Everything you need to know about supporting Anuwad.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="rounded-2xl border border-border bg-surface/40 p-5 space-y-2">
              <h4 className="font-bold text-foreground text-sm">Is Anuwad open source?</h4>
              <p className="text-muted-foreground leading-relaxed">
                Yes, our frontend codebase and client engines are open on GitHub. We believe
                critical knowledge access infrastructure should remain inspectable and accessible by
                everyone.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/40 p-5 space-y-2">
              <h4 className="font-bold text-foreground text-sm">
                Can I support if I am outside India?
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                Yes! Razorpay accepts international credit and debit cards (Visa, Mastercard, Amex).
                The amount will automatically convert to your local currency.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/40 p-5 space-y-2">
              <h4 className="font-bold text-foreground text-sm">How is my privacy protected?</h4>
              <p className="text-muted-foreground leading-relaxed">
                If you select "Remain Anonymous", your name, email, and Google profile are
                completely excluded from public endpoints. We never sell or share donor information.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/40 p-5 space-y-2">
              <h4 className="font-bold text-foreground text-sm">How else can I help?</h4>
              <p className="text-muted-foreground leading-relaxed">
                You can help by sharing Anuwad with fellow students and readers, contributing code
                on GitHub, translating rare public-domain books for the Global Library, or giving us
                feedback!
              </p>
            </div>
          </div>
        </section>

        {/* ─── Bottom Call to Action ─── */}
        <section className="rounded-3xl border border-border bg-gradient-to-r from-rose-500/10 via-purple-500/10 to-primary/10 p-8 text-center space-y-4">
          <h3 className="text-xl sm:text-2xl font-bold text-foreground">
            Ready to Help Shape the Future of Reading?
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Every single contribution keeps our servers running, models accessible, and libraries
            open for everyone.
          </p>
          <div className="pt-2">
            <a
              href="#contribute"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:opacity-95 active:scale-95 transition-all"
            >
              <Heart className="h-4 w-4 fill-primary-foreground" />
              <span>Back This Mission</span>
            </a>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-border pt-8 text-center text-xs text-muted-foreground space-y-3">
          <div className="flex justify-center items-center gap-6 font-medium">
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
          <p>
            © {new Date().getFullYear()} Anuwad.com — Independent, Mission-Driven AI Document
            Reading.
          </p>
        </footer>
      </main>
    </div>
  );
}
