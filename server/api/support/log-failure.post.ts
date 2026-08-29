import { defineEventHandler, readBody, createError } from "h3";
import { recordPaymentFailureInFirestore } from "../../lib/firestore-server";
import { getSessionUserFromEvent } from "../../lib/auth-server";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      amount?: number;
      currency?: string;
      tierName?: string;
      donorName?: string;
      donorEmail?: string;
      isAnonymous?: boolean;
      userUid?: string;
      userPhotoURL?: string;
      message?: string;
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      errorCode?: string;
      errorDescription?: string;
      errorSource?: string;
      errorStep?: string;
      errorReason?: string;
    }>(event);

    if (!body) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing request body",
        data: { error: "Missing request body" },
      });
    }

    const sessionUser = await getSessionUserFromEvent(event);
    const isAnonymous = Boolean(body.isAnonymous);
    const rawAmount = Number(body.amount) || 0;
    const amountInRupees = rawAmount > 0 ? rawAmount : 0;

    const failureReason =
      body.errorReason ||
      body.errorDescription ||
      body.errorCode ||
      "Razorpay checkout payment declined or failed";

    const saved = await recordPaymentFailureInFirestore({
      amount: amountInRupees,
      currency: body.currency || "INR",
      failureReason,
      errorCode: body.errorCode || "PAYMENT_FAILED",
      errorDescription: body.errorDescription || "",
      isAnonymous,
      supporterName: isAnonymous
        ? "Anonymous Supporter"
        : body.donorName || sessionUser?.name || "Community Supporter",
      supporterEmail: body.donorEmail || sessionUser?.email || "",
      userUid: sessionUser?.uid || body.userUid || "",
      userPhotoURL: isAnonymous ? "" : body.userPhotoURL || sessionUser?.photoURL || "",
      message: (body.message || "").trim().slice(0, 500),
      tier: body.tierName || "Supporter",
      razorpayOrderId: body.razorpayOrderId || "",
      razorpayPaymentId: body.razorpayPaymentId || "",
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      logged: Boolean(saved),
      id: saved?.id,
    };
  } catch (err: any) {
    console.error("Error in /api/support/log-failure:", err);
    return {
      success: false,
      error: err?.message || "Failed to log payment failure",
    };
  }
});
