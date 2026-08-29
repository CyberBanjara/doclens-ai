import { getFirebaseApp } from "./firebase";
import { getStoredAuthToken } from "./auth-client";

declare const __RAZORPAY_KEY_ID__: string | undefined;

export interface SupporterRecord {
  id?: string;
  amount: number;
  currency: string;
  isAnonymous: boolean;
  supporterName: string;
  userUid?: string;
  userPhotoURL?: string;
  message?: string;
  tier?: string;
  razorpayPaymentId: string;
  createdAt: string;
}

export interface SupportStats {
  supporters: SupporterRecord[];
  totalRaised: number;
  totalSupporters: number;
  cachedAt?: number;
}

export interface SupportTier {
  id: string;
  name: string;
  amount: number;
  badge: string;
  icon: string;
  description: string;
  perks: string[];
}

export const SUPPORT_TIERS: SupportTier[] = [
  {
    id: "reader",
    name: "Reader",
    amount: 100,
    badge: "🌱 Reader",
    icon: "📖",
    description: "Fueling open knowledge access for curious minds everywhere.",
    perks: ["Supporter badge on wall", "Listed in community hall of fame", "Eternal gratitude"],
  },
  {
    id: "believer",
    name: "Believer",
    amount: 300,
    badge: "✨ Believer",
    icon: "🌟",
    description: "Supporting private, zero-knowledge browser document reading.",
    perks: ["Believer badge on wall", "Personal message displayed", "Early access updates"],
  },
  {
    id: "patron",
    name: "Patron",
    amount: 500,
    badge: "💎 Patron",
    icon: "💖",
    description: "Sponsoring AI translation compute tokens & high-precision OCR.",
    perks: [
      "Patron badge & highlight",
      "Featured on supporters wall",
      "Supporter Discord/Community role",
    ],
  },
  {
    id: "champion",
    name: "Champion",
    amount: 1000,
    badge: "🏆 Champion",
    icon: "🚀",
    description: "Empowering neural voice synthesis & multilingual global archives.",
    perks: [
      "Champion golden badge",
      "Highlighted contribution card",
      "Direct channel with maintainer",
    ],
  },
  {
    id: "visionary",
    name: "Visionary",
    amount: 2500,
    badge: "👑 Visionary",
    icon: "👑",
    description:
      "Accelerating independent, mission-driven development without corporate influence.",
    perks: [
      "Visionary VIP distinction",
      "Pin message to top wall",
      "Immortalized in Anuwad credits",
    ],
  },
];

// Session caching constants
const SESSION_CACHE_KEY = "anuwad_supporters_cache_v2";
let inMemoryStats: SupportStats | null = null;
let inFlightFetch: Promise<SupportStats> | null = null;

/**
 * Load cached supporter statistics from memory or sessionStorage.
 */
export function getStoredSupportersCache(): SupportStats | null {
  if (inMemoryStats) return inMemoryStats;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SupportStats;
        inMemoryStats = parsed;
        return parsed;
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
  }
  return null;
}

/**
 * Save supporter statistics to memory and sessionStorage for the active session.
 */
export function setStoredSupportersCache(stats: SupportStats): void {
  inMemoryStats = { ...stats, cachedAt: Date.now() };
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(inMemoryStats));
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Fetch supporters list and live total raised.
 * Uses client-side session caching to prevent redundant requests during navigation.
 */
export async function fetchSupportersStats(options?: {
  forceRefresh?: boolean;
}): Promise<SupportStats> {
  const forceRefresh = options?.forceRefresh ?? false;
  const cached = getStoredSupportersCache();

  if (!forceRefresh && cached && cached.supporters) {
    return cached;
  }

  if (!forceRefresh && inFlightFetch) {
    return inFlightFetch;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch("/api/support/supporters", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          const stats: SupportStats = {
            supporters: data.supporters || [],
            totalRaised: Number(data.totalRaised) || 0,
            totalSupporters: Number(data.totalSupporters) || 0,
          };
          setStoredSupportersCache(stats);
          return stats;
        }
      }
    } catch (err) {
      console.warn(
        "Could not fetch supporters from /api/support/supporters, attempting fallback:",
        err,
      );
    }

    // Fallback: Return cached or default baseline
    const fallback: SupportStats = cached || {
      supporters: [],
      totalRaised: 0,
      totalSupporters: 0,
    };
    return fallback;
  })().finally(() => {
    inFlightFetch = null;
  });

  inFlightFetch = fetchPromise;
  return fetchPromise;
}

/**
 * Record a successful Razorpay contribution in Firebase and update session cache.
 */
export async function recordSupportContribution(
  data: Omit<SupporterRecord, "createdAt"> & { supporterEmail?: string },
): Promise<SupporterRecord> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-firebase-token"] = token;
  }

  const res = await fetch("/api/support/record", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Failed to record contribution" }));
    throw new Error(errorData.error || `Server returned error ${res.status}`);
  }

  const result = await res.json();
  const newSupporter: SupporterRecord = result.supporter || {
    ...data,
    createdAt: new Date().toISOString(),
  };

  // Update session cache instantly so UI reflects new total without waiting for refetch
  const current = getStoredSupportersCache() || {
    supporters: [],
    totalRaised: 0,
    totalSupporters: 0,
  };
  const updatedSupporters = [
    newSupporter,
    ...current.supporters.filter((s) => s.id !== newSupporter.id),
  ];
  const updatedStats: SupportStats = {
    supporters: updatedSupporters,
    totalRaised: current.totalRaised + Number(newSupporter.amount || 0),
    totalSupporters: current.totalSupporters + 1,
  };
  setStoredSupportersCache(updatedStats);

  return newSupporter;
}

/**
 * Create a Razorpay Order on the backend.
 */
export async function createRazorpayOrder(amountInRupees: number): Promise<{
  order_id: string;
  amount: number;
  currency: string;
  key_id?: string;
}> {
  const amountInPaise = Math.round(amountInRupees * 100);
  const res = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountInPaise, currency: "INR" }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Failed to create payment order" }));
    throw new Error(errorData.error || `Failed to create order (status ${res.status})`);
  }

  return await res.json();
}

/**
 * Verify Razorpay payment signature on the backend and persist contribution.
 */
export async function verifyRazorpayPayment(data: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  amount: number;
  isAnonymous?: boolean;
  supporterName?: string;
  supporterEmail?: string;
  userUid?: string;
  userPhotoURL?: string;
  message?: string;
  tier?: string;
}): Promise<SupporterRecord> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-firebase-token"] = token;
  }

  const res = await fetch("/api/verify-payment", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Payment verification failed" }));
    throw new Error(errorData.error || `Payment verification failed (status ${res.status})`);
  }

  const result = await res.json();
  const newSupporter: SupporterRecord = result.supporter || {
    amount: data.amount,
    currency: "INR",
    isAnonymous: Boolean(data.isAnonymous),
    supporterName: data.isAnonymous
      ? "Anonymous Supporter"
      : data.supporterName || "Community Supporter",
    userPhotoURL: data.isAnonymous ? "" : data.userPhotoURL,
    message: data.message,
    tier: data.tier,
    razorpayPaymentId: data.razorpay_payment_id,
    createdAt: new Date().toISOString(),
  };

  // Update session cache immediately so funding statistics update seamlessly
  const current = getStoredSupportersCache() || {
    supporters: [],
    totalRaised: 0,
    totalSupporters: 0,
  };
  const updatedSupporters = [
    newSupporter,
    ...current.supporters.filter((s) => s.id !== newSupporter.id),
  ];
  const updatedStats: SupportStats = {
    supporters: updatedSupporters,
    totalRaised: current.totalRaised + Number(newSupporter.amount || 0),
    totalSupporters: current.totalSupporters + 1,
  };
  setStoredSupportersCache(updatedStats);

  return newSupporter;
}

/**
 * Dynamically load Razorpay Checkout SDK.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as any).Razorpay) return resolve(true);

    const existingScript = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true));
      existingScript.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export interface TriggerRazorpayOptions {
  amount: number; // in INR
  tierName?: string;
  donorName?: string;
  donorEmail?: string;
  isAnonymous?: boolean;
  message?: string;
  userUid?: string;
  userPhotoURL?: string;
  onSuccess: (paymentId: string, supporter?: SupporterRecord) => void;
  onError: (error: string) => void;
  onDismiss?: () => void;
}

/**
 * Open Razorpay Checkout modal with order creation and signature verification.
 */
export async function triggerRazorpaySupportCheckout(
  options: TriggerRazorpayOptions,
): Promise<void> {
  const {
    amount,
    tierName = "Support Contribution",
    donorName,
    donorEmail,
    isAnonymous = false,
    message,
    userUid,
    userPhotoURL,
    onSuccess,
    onError,
    onDismiss,
  } = options;

  if (!amount || amount <= 0) {
    onError("Please select or enter a valid amount.");
    return;
  }

  // 1. Ensure Razorpay Checkout script is loaded
  const scriptLoaded = await loadRazorpayScript();
  if (!scriptLoaded) {
    onError("Unable to load Razorpay payment gateway. Please check your internet connection.");
    return;
  }

  // Get key from Vite define, import.meta.env or test fallback
  const razorpayKey =
    (typeof __RAZORPAY_KEY_ID__ !== "undefined" && __RAZORPAY_KEY_ID__) ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_RAZORPAY_KEY_ID) ||
    "rzp_live_TVWs5Qr4BXQH9u";

  try {
    // 2. Create Order on Backend (Step 1 of Standard Checkout)
    const orderData = await createRazorpayOrder(amount);
    const orderId = orderData.order_id || (orderData as any).id;

    // 3. Open Razorpay Modal with order_id (Step 2 of Standard Checkout)
    const rzpOptions = {
      key: orderData.key_id || razorpayKey,
      amount: orderData.amount, // paise
      currency: orderData.currency || "INR",
      order_id: orderId,
      name: "Anuwad",
      description: `Community Support — ${tierName}`,
      image: (typeof window !== "undefined" ? window.location.origin : "") + "/light_13746323.png",
      prefill: {
        name: isAnonymous ? "Anonymous Supporter" : donorName || "",
        email: donorEmail || "",
      },
      notes: {
        tier: tierName,
        purpose: "Anuwad Open Knowledge Support",
        isAnonymous: String(isAnonymous),
      },
      theme: {
        color: "#0066cc", // Brand Action Blue
        backdrop_color: "rgba(11, 19, 38, 0.8)",
      },
      modal: {
        ondismiss: function () {
          if (onDismiss) onDismiss();
        },
      },
      handler: async function (response: any) {
        if (
          response &&
          response.razorpay_payment_id &&
          response.razorpay_order_id &&
          response.razorpay_signature
        ) {
          try {
            // 4. Verify Signature on Backend (Step 3 of Standard Checkout)
            const verifiedRecord = await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount,
              isAnonymous,
              supporterName: isAnonymous ? "Anonymous Supporter" : donorName,
              supporterEmail: donorEmail,
              userUid,
              userPhotoURL: isAnonymous ? "" : userPhotoURL,
              message,
              tier: tierName,
            });

            onSuccess(response.razorpay_payment_id, verifiedRecord);
          } catch (err: any) {
            console.error("Signature verification / record error:", err);
            onError(err?.message || "Payment signature verification failed.");
          }
        } else {
          onError("Payment completed but required signature verification parameters were missing.");
        }
      },
    };

    const rzp = new (window as any).Razorpay(rzpOptions);
    rzp.on("payment.failed", function (response: any) {
      const desc = response?.error?.description || "Payment was declined or cancelled.";
      onError(desc);
    });
    rzp.open();
  } catch (err: any) {
    console.error("Razorpay order initiation error:", err);
    onError(err?.message || "Could not initiate Razorpay order.");
  }
}
