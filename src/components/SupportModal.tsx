import { useState } from "react";
import { toast } from "sonner";
import { Github, ExternalLink, Heart, Sparkles, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
      // Dynamic load Razorpay checkout.js script
      const loadScript = (src: string) => {
        return new Promise<boolean>((resolve) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve(true);
            return;
          }
          const script = document.createElement("script");
          script.src = src;
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const loaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      if (!loaded) {
        toast.error("Failed to load Razorpay SDK. Please check your internet connection.");
        setPaying(false);
        return;
      }

      // Razorpay payment options
      // Note: In real environment, replace 'rzp_test_...' with your actual Razorpay Key ID
      const options = {
        key: "rzp_test_YOUR_KEY_HERE",
        amount: amount * 100, // paise
        currency: "INR",
        name: "Anuwad",
        description: "Support Anuwad Development",
        image: window.location.origin + "/light_13746323.png",
        handler: function (response: any) {
          toast.success(
            `Thank you for your contribution! Payment ID: ${response.razorpay_payment_id}`,
          );
          onOpenChange(false);
        },
        prefill: {
          name: "Anuwad Sponsor",
          email: "sponsor@anuwad.com",
        },
        theme: {
          color: "#0066cc", // Action Blue
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        toast.error(`Payment failed: ${response.error.description}`);
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      toast.error("Failed to initialize Razorpay checkout.");
    } finally {
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
                Become a Premium Supporter
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Every language barrier broken is a mind set free. Join us in making knowledge
                accessible to all.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Section 1: Feedback Survey */}
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
              📋 1. Take Our Survey
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Your feedback shapes the future of Anuwad. Take our quick 2-minute Google Forms
              survey.
            </p>
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSde85yO0QiwAYb_fxbtD1inrGLn5Vry6pCjtEd_O_nUbx7pQQ/viewform?usp=publish-editor"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-background border border-border hover:bg-border px-4 py-2.5 text-xs font-semibold text-foreground transition-all active:scale-95 shadow-sm"
            >
              Start Survey
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Section 2: Contribute & Sponsor */}
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
              💻 2. Contribute to this Project
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Anuwad is open source. You can view the code, raise issues, or submit PRs on GitHub.
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
                Fund the Mission
              </h5>
              <p className="mt-1 text-xs text-muted-foreground">
                Millions of students struggle with textbooks they can't read in their own language.
                Your contribution keeps Anuwad free, fast, and private — so that no learner is left
                behind.
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
                {paying ? "Opening checkout..." : `Support this Mission — ₹${amount}`}
              </button>

              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                <span>Runs in Razorpay Test Mode by default.</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
