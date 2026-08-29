import { useState } from "react";
import { toast } from "sonner";
import { Github, ExternalLink, Heart, Sparkles, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { triggerRazorpaySupportCheckout } from "@/lib/support";

interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({ open, onOpenChange }: SupportModalProps) {
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [paying, setPaying] = useState(false);

  const presets = [100, 300, 500, 1000];

  const handlePresetSelect = (val: number) => {
    setAmount(val);
    setCustomAmount("");
  };

  const handleCustomChange = (val: string) => {
    setCustomAmount(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    } else {
      setAmount(0);
    }
  };

  const handlePay = async () => {
    if (amount <= 0) {
      toast.error("Please enter a valid donation amount.");
      return;
    }
    setPaying(true);

    try {
      await triggerRazorpaySupportCheckout({
        amount,
        tierName: "Community Support",
        onSuccess: (paymentId) => {
          toast.success(`Thank you for your contribution! Payment ID: ${paymentId}`);
          setPaying(false);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error("Payment failed", { description: err });
          setPaying(false);
        },
        onDismiss: () => {
          setPaying(false);
        },
      });
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to initialize Razorpay checkout.");
      setPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-[18px] border border-border bg-card p-6 shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                Support & Feedback
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Help us improve Anuwad by sharing feedback or supporting development.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Section 1: Feedback Survey */}
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
              📋 Feedback Survey
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Share your thoughts and suggestions in our quick 2-minute survey.
            </p>
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSde85yO0QiwAYb_fxbtD1inrGLn5Vry6pCjtEd_O_nUbx7pQQ/viewform?usp=publish-editor"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-background border border-border hover:bg-border px-4 py-2.5 text-xs font-semibold text-foreground transition-all active:scale-95 shadow-sm"
            >
              Take Survey
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Section 2: Contribute & Sponsor */}
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
              💻 Contribute to Project
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Anuwad is open source. You can view the code, report issues, or contribute on GitHub.
            </p>
            <a
              href="https://github.com/CyberBanjara/doclens-ai"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground text-background px-4 py-2.5 text-xs font-semibold hover:opacity-90 transition-all active:scale-95 shadow-sm"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>

            {/* Donation Area */}
            <div className="mt-5 border-t border-border pt-4">
              <h5 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Heart className="h-3.5 w-3.5 text-destructive fill-destructive" />
                Support Development
              </h5>
              <p className="mt-1 text-xs text-muted-foreground">
                Your contribution helps keep Anuwad free, fast, and maintained.
              </p>

              {/* Amount Preset Grid */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                {presets.map((val) => (
                  <button
                    key={val}
                    onClick={() => handlePresetSelect(val)}
                    className={`rounded-lg border py-1.5 text-xs font-bold transition-all active:scale-95 ${
                      amount === val && !customAmount
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-border text-muted-foreground"
                    }`}
                  >
                    ₹{val}
                  </button>
                ))}
              </div>

              {/* Custom Input */}
              <div className="mt-3 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                  ₹
                </span>
                <input
                  type="number"
                  placeholder="Custom amount..."
                  value={customAmount}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-background py-2 pl-6 pr-4 text-xs outline-none transition-colors focus:border-primary"
                />
              </div>

              <button
                onClick={handlePay}
                disabled={paying || amount <= 0}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-xs font-semibold text-primary-foreground transition-all hover:opacity-95 active:scale-95 disabled:opacity-40 shadow-sm"
              >
                {paying ? "Opening checkout..." : `Support Project — ₹${amount}`}
              </button>

              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Secured with Razorpay (UPI, Cards, NetBanking).</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
