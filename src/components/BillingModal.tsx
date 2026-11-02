import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Zap,
  Check,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Clock,
  Layers,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { apiGetBillingProfile, apiSubscribePlan, type BillingProfileResponse } from "@/lib/auth-client";
import { createRazorpayOrder } from "@/lib/support";
import { toast } from "sonner";

declare const window: any;

export function BillingModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [billingData, setBillingData] = useState<BillingProfileResponse | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);

  const loadBilling = async () => {
    setLoading(true);
    try {
      const data = await apiGetBillingProfile();
      if (data) setBillingData(data);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleOpen = (e: any) => {
      if (e?.detail?.error) {
        setQuotaNotice(e.detail.error);
      }
      setOpen(true);
      void loadBilling();
    };

    window.addEventListener("doclens:open-billing-modal", handleOpen);
    return () => window.removeEventListener("doclens:open-billing-modal", handleOpen);
  }, []);

  const handleSelectPlan = async (plan: any) => {
    if (plan.id === "free") {
      toast.info("Free plan is automatically active on every account.");
      return;
    }

    setProcessingPlanId(plan.id);
    try {
      // 1. Create Razorpay order
      const order = await createRazorpayOrder(plan.price_inr);
      if (!order || !order.order_id) {
        throw new Error("Could not initialize payment order.");
      }

      // 2. Open Razorpay checkout
      const options = {
        key: order.key_id || (window as any).__RAZORPAY_KEY_ID__ || "rzp_live_TVWs5Qr4BXQH9u",
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Anuwad AI",
        description: `${plan.name} (${plan.pages_allotment} Pages / ${plan.validity_days} Days)`,
        order_id: order.order_id,
        handler: async (response: any) => {
          try {
            toast.loading("Verifying payment and crediting quota...");
            const subResult = await apiSubscribePlan({
              planId: plan.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (subResult) {
              setBillingData(subResult);
              toast.dismiss();
              toast.success(`🎉 ${plan.name} activated! ${plan.pages_allotment} pages added.`);
              setOpen(false);
            }
          } catch (verifyErr: any) {
            toast.dismiss();
            toast.error(verifyErr?.message || "Failed to finalize subscription.");
          }
        },
        theme: {
          color: "#4f46e5",
        },
      };

      if (typeof window.Razorpay !== "undefined") {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Dynamically load Razorpay script if not already on window
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => {
          const rzp = new window.Razorpay(options);
          rzp.open();
        };
        document.body.appendChild(script);
      }
    } catch (err: any) {
      toast.error(err?.message || "Unable to start checkout. Please try again.");
    } finally {
      setProcessingPlanId(null);
    }
  };

  const subscription = billingData?.subscription;
  const plans = billingData?.available_plans || [
    { id: "free", name: "Free Tier", price_inr: 0, pages_allotment: 30, validity_days: 30, plan_type: "free" },
    { id: "pass", name: "Reader Pass", price_inr: 99, pages_allotment: 300, validity_days: 30, plan_type: "pass" },
    { id: "monthly", name: "Monthly Pro", price_inr: 149, pages_allotment: 600, validity_days: 30, plan_type: "subscription" },
    { id: "topup_100", name: "100 Pages Top-up", price_inr: 49, pages_allotment: 100, validity_days: 30, plan_type: "topup" },
    { id: "topup_300", name: "300 Pages Top-up", price_inr: 99, pages_allotment: 300, validity_days: 30, plan_type: "topup" },
  ];

  const mainPlans = plans.filter((p) => p.plan_type !== "topup");
  const topups = plans.filter((p) => p.plan_type === "topup");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl bg-card border-border/80 p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Translation Billing & Quota</span>
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Choose Your Reading Plan
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Low-latency, privacy-first translation powered by high-throughput neural inference.
          </DialogDescription>
        </DialogHeader>

        {quotaNotice && (
          <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2.5">
            <Zap className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium">Quota Notice</p>
              <p className="opacity-90">{quotaNotice}</p>
            </div>
          </div>
        )}

        {/* Current Active Plan Status Banner */}
        {subscription && (
          <div className="mt-4 p-4 rounded-xl border border-border/70 bg-surface/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Active Plan:</span>
                <span className="font-bold text-foreground uppercase tracking-wider px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded">
                  {subscription.plan_id}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ({subscription.days_remaining} days left)
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                <strong className="text-foreground">{subscription.available_pages}</strong> pages remaining of{" "}
                {subscription.plan_pages_limit + subscription.topup_pages_balance} total allotment
              </p>
            </div>
            <button
              onClick={() => void loadBilling()}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto text-muted-foreground hover:text-foreground text-xs p-1"
              title="Refresh Quota"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        )}

        {/* Plan Cards Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {mainPlans.map((plan) => {
            const isCurrent = subscription?.plan_id === plan.id;
            const isPopular = plan.id === "pass";

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border p-4.5 flex flex-col justify-between transition-all ${
                  isPopular
                    ? "border-primary/60 bg-primary/5 shadow-xs"
                    : "border-border/60 bg-surface/30 hover:border-border"
                } ${isCurrent ? "ring-2 ring-primary/40" : ""}`}
              >
                {isPopular && (
                  <span className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                    Most Popular
                  </span>
                )}

                <div>
                  <h4 className="font-bold text-foreground text-sm flex items-center justify-between">
                    <span>{plan.name}</span>
                  </h4>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-foreground">
                      {plan.price_inr === 0 ? "Free" : `₹${plan.price_inr}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground">/ 30 days</span>
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>
                        <strong className="text-foreground">{plan.pages_allotment}</strong> pages
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>{plan.validity_days} days validity</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>Full 90+ languages</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5 pt-3 border-t border-border/40">
                  {isCurrent ? (
                    <span className="w-full inline-flex items-center justify-center rounded-lg bg-surface-2 text-muted-foreground py-2 text-xs font-semibold">
                      Current Plan
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={processingPlanId !== null}
                      onClick={() => handleSelectPlan(plan)}
                      className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold cursor-pointer transition-all ${
                        isPopular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                          : "border border-border/80 bg-surface hover:bg-surface-2 text-foreground"
                      }`}
                    >
                      {processingPlanId === plan.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <span>{plan.price_inr === 0 ? "Select Free" : `Get for ₹${plan.price_inr}`}</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Top-ups Section */}
        {topups.length > 0 && (
          <div className="mt-6 pt-5 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
                Instant Page Top-ups
              </h4>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Running low mid-month? Add pages immediately to your active balance without changing your plan.
            </p>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {topups.map((topup) => (
                <div
                  key={topup.id}
                  className="rounded-lg border border-border/60 bg-surface/30 p-3.5 flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-xs text-foreground block">{topup.name}</span>
                    <span className="text-[11px] text-muted-foreground block">
                      +{topup.pages_allotment} Pages
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={processingPlanId !== null}
                    onClick={() => handleSelectPlan(topup)}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors"
                  >
                    {processingPlanId === topup.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <span>₹{topup.price_inr}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Quota Usage History */}
        {billingData?.recent_usage && billingData.recent_usage.length > 0 && (
          <div className="mt-6 pt-5 border-t border-border/50">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Recent Translation Usage History</span>
            </h4>
            <div className="mt-2.5 max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40 text-xs">
              {billingData.recent_usage.slice(0, 10).map((r) => (
                <div key={r.id} className="p-2.5 flex items-center justify-between bg-surface/20">
                  <div className="truncate mr-2">
                    <span className="font-medium text-foreground block truncate">{r.book_title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      Page {r.page_number} • {r.language} • {r.quota_source} quota
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        r.status === "finalized"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : r.status === "reserved"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function openBillingModal(notice?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("doclens:open-billing-modal", { detail: { error: notice } }));
  }
}
