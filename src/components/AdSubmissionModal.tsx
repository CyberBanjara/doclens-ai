import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  UploadCloud,
  CheckCircle2,
  ExternalLink,
  Info,
  Clock,
  Zap,
  Globe,
  Tag,
  ShieldCheck,
  Calendar,
  AlertCircle,
  X,
  CreditCard,
  Image as ImageIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AD_PACKAGES,
  type AdPackage,
  type AdRecord,
  type SlotAvailability,
  computeSlotAvailabilities,
  uploadAdCreative,
  submitPendingAd,
  createAdPaymentOrder,
  verifyAdPayment,
} from "@/lib/ads";
import { loadRazorpayScript } from "@/lib/support";
import { fileToBase64 } from "@/lib/file-utils";

interface AdSubmissionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "standard" | "waitlist";
  initialPackageId?: string;
  activeAds?: AdRecord[];
  onSuccess?: () => void;
}

function formatSlotDate(dateStr?: string | null) {
  if (!dateStr) return "Immediately";
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

export function AdSubmissionModal({
  open,
  onOpenChange,
  initialMode = "standard",
  initialPackageId,
  activeAds = [],
  onSuccess,
}: AdSubmissionModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<AdPackage>(AD_PACKAGES[0]); // Default 24 Hours Spotlight
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetUrl, setTargetUrl] = useState("");

  // Mode: standard vs waitlist
  const [isWaitlistMode, setIsWaitlistMode] = useState(initialMode === "waitlist");

  // Local image file selection (Held locally in memory until verified payment)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form & Payment processing states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [submittingStep, setSubmittingStep] = useState<string>("");
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
  const [completedPaymentId, setCompletedPaymentId] = useState<string>("");

  useEffect(() => {
    setIsWaitlistMode(initialMode === "waitlist");
    if (initialPackageId) {
      const found = AD_PACKAGES.find((p) => p.id === initialPackageId);
      if (found) setSelectedPackage(found);
    }
  }, [initialMode, initialPackageId, open]);

  // Compute availability for the 3 slots based on active ads
  const availabilities = useMemo(() => {
    return computeSlotAvailabilities(activeAds);
  }, [activeAds]);

  // Find availability of the currently selected package
  const selectedSlotAvailability = useMemo(() => {
    return (
      availabilities.find((a) => a.packageId === selectedPackage.id) || {
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        durationDays: selectedPackage.durationDays,
        priceINR: selectedPackage.priceINR,
        isOccupied: false,
        expiresAt: null,
        nextAvailableAt: new Date().toISOString(),
        relativeTimeStr: "Available immediately",
      }
    );
  }, [availabilities, selectedPackage]);

  const resetForm = useCallback(() => {
    setName("");
    setEmail("");
    setCompany("");
    setTitle("");
    setDescription("");
    setTargetUrl("");
    setImageFile(null);
    setImagePreview("");
    setIsSubmitting(false);
    setIsPaymentModalOpen(false);
    setSubmittingStep("");
    setIsSubmittedSuccess(false);
    setCompletedPaymentId("");
    setSelectedPackage(AD_PACKAGES[1]);
  }, []);

  const handleClose = (newOpen: boolean) => {
    // If Razorpay is currently active, do NOT close or reset the modal
    if (!newOpen && (isPaymentModalOpen || isSubmitting)) {
      return;
    }
    if (!newOpen) {
      setTimeout(resetForm, 300);
    }
    onOpenChange(newOpen);
  };

  // Select local image file (No R2 upload occurs here)
  const handleImageSelect = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file (PNG, JPG, WebP, SVG).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file size must be under 5MB.");
      return;
    }

    setImageFile(file);
    const localPreviewUrl = URL.createObjectURL(file);
    setImagePreview(localPreviewUrl);
  };

  const handleClearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Submit flow: Opens Razorpay -> Verifies payment signature -> Uploads to R2 -> Submits pending ad to Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please enter a valid work email address.");
      return;
    }
    if (!title.trim()) {
      toast.error("Please enter your brand/startup name.");
      return;
    }
    if (!targetUrl.trim()) {
      toast.error("Please provide your destination URL.");
      return;
    }
    if (!imageFile) {
      toast.error("Please select a brand logo or creative banner image.");
      return;
    }

    setIsSubmitting(true);
    setSubmittingStep("Opening payment gateway...");
    const toastId = toast.loading("Initializing Razorpay checkout...");

    try {
      // 1. Ensure Razorpay Checkout SDK script is loaded
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        throw new Error("Unable to load Razorpay payment gateway. Please check your connection.");
      }

      // 2. Create Razorpay Order on server
      const orderRes = await createAdPaymentOrder({
        data: {
          amountInINR: selectedPackage.priceINR,
          packageId: selectedPackage.id,
          packageName: selectedPackage.name,
          advertiserName: name.trim(),
          advertiserEmail: email.trim(),
        },
      });

      if (!orderRes?.orderId || !orderRes?.keyId) {
        throw new Error("Failed to initialize payment order.");
      }

      toast.dismiss(toastId);
      setIsPaymentModalOpen(true);
      setSubmittingStep("Awaiting payment in Razorpay...");

      // 3. Open Razorpay Checkout Modal
      const rzpOptions = {
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency || "INR",
        name: "Anuwad AI Reader",
        description: `${selectedPackage.name} Ad Slot Sponsorship`,
        image: "/light_13746323.png",
        order_id: orderRes.orderId,
        prefill: {
          name: name.trim(),
          email: email.trim(),
        },
        theme: {
          color: "#7c3aed",
        },
        modal: {
          backdropclose: false,
          escape: false,
          handleback: true,
          confirm_close: true,
          ondismiss: () => {
            setIsSubmitting(false);
            setIsPaymentModalOpen(false);
            setSubmittingStep("");
            toast.info("Payment cancelled. Your campaign details are saved and ready to retry.");
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setIsPaymentModalOpen(false);
          const progressToastId = toast.loading("Verifying payment signature with Razorpay...");

          try {
            setSubmittingStep("Verifying payment signature...");

            // Step A: Verify Razorpay HMAC-SHA256 signature on backend
            const verifyRes = await verifyAdPayment({
              data: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amountInINR: selectedPackage.priceINR,
              },
            });

            if (!verifyRes?.success || !verifyRes?.verified) {
              throw new Error("Payment signature verification failed. Campaign was not submitted.");
            }

            // Step B: Only after verified payment -> Upload Banner/Icon image to Cloudflare R2
            setSubmittingStep("Uploading creative asset to Cloudflare R2...");
            toast.loading("Payment verified! Uploading creative banner to R2...", {
              id: progressToastId,
            });

            const base64Data = await fileToBase64(imageFile);
            const r2Res = await uploadAdCreative({
              data: {
                fileName: imageFile.name,
                contentType: imageFile.type,
                base64Data,
              },
            });

            if (!r2Res?.url) {
              throw new Error("Failed to store creative banner asset in Cloudflare R2.");
            }

            // Step C: Submit campaign to Supabase for admin approval
            setSubmittingStep("Submitting campaign for admin approval...");
            toast.loading("Submitting ad for admin review...", { id: progressToastId });

            await submitPendingAd({
              data: {
                advertiserName: name.trim(),
                advertiserEmail: email.trim(),
                advertiserCompany: company.trim() || undefined,
                title: title.trim(),
                description: description.trim() || undefined,
                imageUrl: r2Res.url,
                targetUrl: targetUrl.trim(),
                packageName: selectedPackage.name,
                durationDays: selectedPackage.durationDays,
                amountPaid: selectedPackage.priceINR,
                paymentStatus: "paid",
              },
            });

            setCompletedPaymentId(response.razorpay_payment_id);
            setIsSubmittedSuccess(true);
            toast.success(
              isWaitlistMode
                ? "Payment confirmed! Waiting list reservation submitted."
                : "Payment confirmed! Ad campaign submitted for review.",
              { id: progressToastId },
            );

            if (onSuccess) onSuccess();
          } catch (err: any) {
            console.error("Post-payment processing failed:", err);
            toast.error("Payment processing error", {
              id: progressToastId,
              description:
                err?.message ||
                `Please contact support with payment ID: ${response.razorpay_payment_id}`,
            });
          } finally {
            setIsSubmitting(false);
            setSubmittingStep("");
          }
        },
      };

      const rzp = new (window as any).Razorpay(rzpOptions);
      rzp.on("payment.failed", (response: any) => {
        setIsSubmitting(false);
        setIsPaymentModalOpen(false);
        setSubmittingStep("");
        toast.error("Payment failed", {
          description:
            response.error?.description || "Transaction was declined by payment gateway.",
        });
      });

      rzp.open();
    } catch (err: any) {
      console.error("Payment initialization error:", err);
      toast.error("Could not initiate checkout", {
        id: toastId,
        description: err?.message || "Please check your network and try again.",
      });
      setIsSubmitting(false);
      setIsPaymentModalOpen(false);
      setSubmittingStep("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        onPointerDownOutside={(e) => {
          // If Razorpay or payment is active, prevent outside click dismissal
          if (isSubmitting || isPaymentModalOpen || document.querySelector(".razorpay-container")) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (isSubmitting || isPaymentModalOpen || document.querySelector(".razorpay-container")) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isSubmitting || isPaymentModalOpen || document.querySelector(".razorpay-container")) {
            e.preventDefault();
          }
        }}
        className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border/80 bg-background/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl"
      >
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm ${
                isWaitlistMode
                  ? "border-orange-500/40 bg-orange-500/15 text-orange-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-400"
              }`}
            >
              {isWaitlistMode ? <Zap className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </span>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {isWaitlistMode ? "Join the Advertising Waiting List" : "Promote Your Startup"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
                {isWaitlistMode
                  ? "Reserve upcoming placement slots before they open to the public."
                  : "Direct sponsorship slots rendered directly in our global reader dock."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isSubmittedSuccess ? (
          <div className="my-6 flex flex-col items-center justify-center space-y-4 text-center py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.15)] animate-in zoom-in-95">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-foreground">
              {isWaitlistMode
                ? "Payment Verified & Waiting List Reservation Confirmed!"
                : "Payment Verified & Campaign Submitted for Review!"}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
              Thank you, <span className="font-semibold text-foreground">{name}</span>! Your payment
              has been processed and your ad for{" "}
              <span className="font-semibold text-foreground">{title}</span> ({selectedPackage.name}
              ) has been uploaded.
              {selectedSlotAvailability.isOccupied ? (
                <>
                  {" "}
                  Your campaign is scheduled to be uploaded and live after{" "}
                  <span className="font-semibold text-foreground">
                    {formatSlotDate(selectedSlotAvailability.expiresAt)}
                  </span>
                  .
                </>
              ) : (
                " Our team will review and approve your submission shortly."
              )}
            </p>

            <div className="w-full max-w-md rounded-2xl border border-border/70 bg-surface-2/60 p-4 text-left text-xs space-y-2 mt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Status</span>
                <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Paid (₹{selectedPackage.priceINR.toLocaleString()})</span>
                </span>
              </div>
              {completedPaymentId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment ID</span>
                  <span className="font-mono text-foreground">{completedPaymentId}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Campaign Status</span>
                <span className="font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  {isWaitlistMode ? "Queued on Waiting List" : "Pending Admin Review"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slot Duration</span>
                <span className="font-medium text-foreground">{selectedPackage.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Target URL</span>
                <span className="font-medium text-foreground truncate max-w-[200px]">
                  {targetUrl}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact Email</span>
                <span className="font-medium text-foreground">{email}</span>
              </div>
            </div>

            <button
              onClick={() => handleClose(false)}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            {/* 1. Exactly 3 Ad Duration Slots */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-between justify-between">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-primary" />
                  <span>1. Select Ad Duration Slot</span>
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  3 Fixed Duration Tiers
                </span>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {AD_PACKAGES.map((pkg) => {
                  const isSelected = selectedPackage.id === pkg.id;
                  const slotStatus = availabilities.find((a) => a.packageId === pkg.id);
                  const isOccupied = slotStatus?.isOccupied;

                  return (
                    <button
                      type="button"
                      key={pkg.id}
                      onClick={() => setSelectedPackage(pkg)}
                      className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-lg shadow-primary/10 ring-1 ring-primary/40"
                          : "border-border/70 bg-surface/50 hover:border-border hover:bg-surface-2/60"
                      }`}
                    >
                      {pkg.badge && (
                        <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                          {pkg.badge}
                        </span>
                      )}

                      <div>
                        <div className="text-sm font-bold text-foreground">{pkg.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {pkg.description}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-border/50 space-y-1.5">
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-foreground">
                            ₹{pkg.priceINR.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            / {pkg.durationDays === 1 ? "24h" : `${pkg.durationDays}d`}
                          </span>
                        </div>

                        {/* Slot Availability Status Indicator */}
                        <div className="text-[10px] flex items-center gap-1 font-medium">
                          {isOccupied ? (
                            <span className="text-orange-400 flex items-center gap-1">
                              <Clock className="h-3 w-3 flex-shrink-0" />
                              <span>Avail. {slotStatus?.relativeTimeStr}</span>
                            </span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <Zap className="h-3 w-3 flex-shrink-0" />
                              <span>Open Immediately</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Waiting List / Slot Availability Callout Banner */}
            <div
              className={`rounded-2xl border p-4 transition-all ${
                selectedSlotAvailability.isOccupied
                  ? "border-orange-500/40 bg-orange-500/10 text-foreground"
                  : "border-emerald-500/30 bg-emerald-500/10 text-foreground"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 mt-0.5">
                  {selectedSlotAvailability.isOccupied ? (
                    <Clock className="h-5 w-5 text-orange-400 animate-pulse" />
                  ) : (
                    <Zap className="h-5 w-5 text-emerald-400" />
                  )}
                </span>
                <div className="space-y-1 text-xs leading-relaxed">
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span>
                      {selectedSlotAvailability.isOccupied
                        ? "Slot Currently Occupied (Waiting List Active)"
                        : "Slot Currently Open & Available"}
                    </span>
                  </div>

                  {selectedSlotAvailability.isOccupied ? (
                    <p className="text-muted-foreground">
                      This {selectedPackage.name} slot is running an active campaign until{" "}
                      <strong className="text-foreground">
                        {formatSlotDate(selectedSlotAvailability.expiresAt)}
                      </strong>{" "}
                      ({selectedSlotAvailability.relativeTimeStr}). When you complete payment, your
                      ad will be verified, stored in R2, and scheduled to go live right after.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      This slot has no queue. Complete payment to upload your creative and submit
                      for immediate review for the full {selectedPackage.name} duration.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Advertiser Information */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>2. Advertiser Contact</span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Your Name *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-surface/70 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Work Email *</span>
                  <input
                    type="email"
                    required
                    placeholder="alex@startup.io"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-surface/70 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Company / Startup</span>
                  <input
                    type="text"
                    placeholder="e.g. ReTicket"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-surface/70 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {/* 3. Creative & Destination */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span>3. Ad Creative & Destination Link</span>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Headline / Brand Name *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ReTicket"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-surface/70 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">
                    Destination / Target URL *
                  </span>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/product"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-surface/70 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Local Image / Logo Selection */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] text-muted-foreground">
                  Banner / Icon Image (Square aspect ratio, max 5MB) *
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageSelect(f);
                  }}
                />

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="group flex-1 w-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-surface/40 p-4 text-center cursor-pointer transition-all hover:border-primary/50 hover:bg-surface-2/60"
                  >
                    <UploadCloud className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors mb-1" />
                    <span className="text-xs font-semibold text-foreground">
                      {imageFile
                        ? imageFile.name
                        : "Click to select logo/banner image (PNG, JPG, WebP)"}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {imageFile
                        ? "Asset ready for secure upload upon payment"
                        : "Will be uploaded to R2 only after payment is confirmed"}
                    </span>
                  </div>

                  {/* Local Image Preview */}
                  {imagePreview && (
                    <div className="relative flex-shrink-0 flex items-center justify-center h-16 w-16 rounded-2xl border border-border/80 bg-surface-2 p-1 shadow-md overflow-hidden group">
                      <span className="absolute top-1 left-1 rounded-md bg-amber-400 px-1 py-0.2 text-[8px] font-black text-black z-10 leading-tight">
                        AD
                      </span>
                      <img
                        src={imagePreview}
                        alt="Creative preview"
                        className="h-full w-full object-cover rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-red-400 transition-opacity font-semibold"
                        title="Remove image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Guarantee Notice */}
            <div className="rounded-2xl border border-border/70 bg-surface-2/50 p-3.5 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary flex-shrink-0" />
                <span>Secured by Razorpay. Creative assets are uploaded only upon payment.</span>
              </div>
              <span className="font-semibold text-foreground">
                ₹{selectedPackage.priceINR.toLocaleString()}
              </span>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleClose(false)}
                disabled={isSubmitting || isPaymentModalOpen}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-surface-2 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !imageFile}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    <span>{submittingStep || "Processing..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {isWaitlistMode
                        ? `Join Waiting List (₹${selectedPackage.priceINR.toLocaleString()})`
                        : `Submit Campaign (₹${selectedPackage.priceINR.toLocaleString()})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
