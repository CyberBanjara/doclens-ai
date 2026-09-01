import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Megaphone } from "lucide-react";
import { type AdRecord, fetchActiveAds, AD_PACKAGES } from "@/lib/ads";
import { AdSubmissionModal } from "@/components/AdSubmissionModal";
import { useLocation } from "@tanstack/react-router";

// 3 Fixed Ad Slot Definitions
const AD_SLOTS = [
  {
    id: "slot-24h",
    name: "24 Hours Spotlight",
    durationDays: 1,
    priceINR: 11,
    label: "24h",
  },
  {
    id: "slot-7d",
    name: "7 Days Showcase",
    durationDays: 7,
    priceINR: 5000,
    label: "7d",
  },
  {
    id: "slot-30d",
    name: "30 Days Sponsorship",
    durationDays: 30,
    priceINR: 16000,
    label: "30d",
  },
];

export function AdBannerWidget() {
  const [liveAds, setLiveAds] = useState<AdRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submissionMode, setSubmissionMode] = useState<"standard" | "waitlist">("standard");
  const [selectedPackageId, setSelectedPackageId] = useState<string>("slot-24h");
  const [isDismissed, setIsDismissed] = useState(false);

  const location = useLocation();

  // Load active ads directly from Supabase (approval_status = 'approved' AND expires_at > now())
  const loadAds = useCallback(async () => {
    try {
      const res = await fetchActiveAds({ data: { t: Date.now() } });
      if (res?.success && Array.isArray(res.ads)) {
        const now = Date.now();
        // Strictly filter only approved ads whose expiration is in the future
        const activeOnly = res.ads.filter(
          (ad) =>
            ad.approval_status === "approved" &&
            ad.expires_at &&
            new Date(ad.expires_at).getTime() > now,
        );
        setLiveAds(activeOnly);
      } else {
        setLiveAds([]);
      }
    } catch (err) {
      console.warn("Could not load active ads:", err);
      setLiveAds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAds();

    // Poll every 15 seconds for real-time freshness and automatic expiration
    const interval = setInterval(loadAds, 15 * 1000);

    // Refresh when tab gains focus or visibility returns
    const handleFocus = () => void loadAds();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("anuwad:ads-changed" as any, handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("anuwad:ads-changed" as any, handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadAds]);

  // Don't render inside reader view, Global Library, or if dismissed
  const isReaderView = location.pathname.startsWith("/doc/");
  const isGlobalLibrary = location.pathname.startsWith("/global-library");
  if (isReaderView || isGlobalLibrary || isDismissed) {
    if (isDismissed && !isReaderView && !isGlobalLibrary) {
      return (
        <button
          onClick={() => setIsDismissed(false)}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 md:left-auto md:bottom-4 md:right-4 z-40 flex items-center gap-1.5 rounded-full border border-border/80 bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-xl backdrop-blur-md transition-all hover:bg-surface-2 hover:border-primary/40 hover:scale-105 active:scale-95 cursor-pointer"
          title="Show sponsor showcase"
        >
          <Megaphone className="h-3.5 w-3.5 text-amber-400" />
          <span>Sponsors</span>
        </button>
      );
    }
    return null;
  }

  const handleOpenPromote = (packageId: string) => {
    setSelectedPackageId(packageId);
    setSubmissionMode("standard");
    setSubmissionOpen(true);
  };

  const handleOpenWaitlist = (packageId: string) => {
    setSelectedPackageId(packageId);
    setSubmissionMode("waitlist");
    setSubmissionOpen(true);
  };

  return (
    <>
      {/* Floating Bottom Dock Container — Shifted above the mobile tab bar on mobile screens */}
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-auto max-w-[96vw] animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-background/95 p-1.5 sm:p-2.5 shadow-2xl backdrop-blur-2xl transition-all hover:border-primary/30">
          {/* Main Horizontal Strip rendering the 3 slots */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto scrollbar-none">
            {AD_SLOTS.map((slot) => {
              const now = Date.now();
              // Find active approved ad for this slot duration
              const activeAd = liveAds.find(
                (a) =>
                  a.approval_status === "approved" &&
                  a.expires_at &&
                  new Date(a.expires_at).getTime() > now &&
                  (a.duration_days === slot.durationDays ||
                    a.package_name.includes(String(slot.durationDays))),
              );

              return (
                <div key={slot.id} className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  {activeAd ? (
                    <>
                      {/* Active Ad Banner Image Slot (Only banner image + AD badge) */}
                      <a
                        href={activeAd.target_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative flex-shrink-0 flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 rounded-2xl overflow-hidden border border-border/80 bg-surface shadow-sm transition-all duration-200 hover:border-primary hover:scale-[1.03] hover:shadow-lg hover:shadow-primary/10 active:scale-95 cursor-pointer"
                        title={`${activeAd.title} — ${slot.name}`}
                      >
                        {/* Yellow AD Badge */}
                        <span className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5 rounded-md bg-amber-400/95 px-1 py-0.2 text-[7px] sm:text-[9px] font-black text-black z-20 leading-tight shadow-sm tracking-tight select-none">
                          AD
                        </span>

                        {/* Banner Image */}
                        <img
                          src={activeAd.image_url}
                          alt={activeAd.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />

                        {/* Fallback in case of image load error */}
                        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center p-1 text-center -z-10">
                          <span className="text-[9px] sm:text-[10px] font-bold text-zinc-300 line-clamp-2">
                            {activeAd.advertiser_company || activeAd.title}
                          </span>
                        </div>
                      </a>

                      {/* Waiting List Option (Rendered ONLY when this ad is active, at half horizontal width) */}
                      <button
                        type="button"
                        onClick={() => handleOpenWaitlist(slot.id)}
                        className="group flex-shrink-0 flex items-center justify-center w-6 sm:w-8 h-12 sm:h-16 rounded-2xl border-2 border-dashed border-orange-500/50 bg-orange-500/10 text-orange-400 hover:border-orange-400 hover:bg-orange-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer select-none"
                        title={`Join waiting list for the ${slot.name} slot`}
                      >
                        <div className="flex flex-col items-center justify-center text-[8px] sm:text-[10px] font-black uppercase tracking-wider -rotate-90 whitespace-nowrap">
                          <span className="flex items-center gap-0.5 text-orange-400 group-hover:text-orange-300 transition-colors">
                            <span>waitlist</span>
                          </span>
                        </div>
                      </button>
                    </>
                  ) : (
                    /* Open Slot Call-To-Action Card (Rendered when no active ad occupies this slot) */
                    <button
                      type="button"
                      onClick={() => handleOpenPromote(slot.id)}
                      className="group flex-shrink-0 flex flex-col items-center justify-center h-12 w-20 sm:h-16 sm:w-28 rounded-2xl border-2 border-dashed border-border/80 bg-surface/40 px-1.5 sm:px-2 text-center transition-all hover:border-primary/60 hover:bg-primary/5 hover:scale-[1.02] active:scale-95 cursor-pointer select-none"
                      title={`Promote your startup in the ${slot.name} slot (Available Immediately)`}
                    >
                      <span className="text-[9px] sm:text-[11px] font-bold text-muted-foreground group-hover:text-primary transition-colors leading-tight">
                        Promote
                      </span>
                      <span className="text-[8px] sm:text-[10px] font-semibold text-muted-foreground/70 mt-0.5">
                        ₹{slot.priceINR.toLocaleString()} / {slot.label}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}

            {/* Close / Dismiss Button */}
            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="flex-shrink-0 flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-surface-2 transition-colors ml-0.5 cursor-pointer"
              aria-label="Dismiss sponsor dock"
              title="Dismiss sponsor dock"
            >
              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Advertiser Submission Modal */}
      <AdSubmissionModal
        open={submissionOpen}
        onOpenChange={setSubmissionOpen}
        initialMode={submissionMode}
        initialPackageId={selectedPackageId}
        activeAds={liveAds}
        onSuccess={loadAds}
      />
    </>
  );
}
