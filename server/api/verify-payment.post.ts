import { defineEventHandler, readBody, createError } from "h3";
import { verifyRazorpaySignature } from "../lib/razorpay-server";
import {
  createSupporterInFirestore,
  recordPaymentFailureInFirestore,
  type FirestoreSupporter,
} from "../lib/firestore-server";
import { getSessionUserFromEvent } from "../lib/auth-server";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      amount?: number;
      currency?: string;
      isAnonymous?: boolean;
      supporterName?: string;
      supporterEmail?: string;
      userUid?: string;
      userPhotoURL?: string;
      message?: string;
      tier?: string;
    }>(event);

    if (!body) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing request body",
        data: { error: "Missing request body" },
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Missing required payment verification parameters (order_id, payment_id, signature)",
        data: {
          error:
            "Missing required payment verification parameters (order_id, payment_id, signature)",
        },
      });
    }

    // 1. Verify Razorpay HMAC-SHA256 Signature
    const isValid = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    const sessionUser = await getSessionUserFromEvent(event);
    const isAnonymous = Boolean(body.isAnonymous);
    const rawAmount = Number(body.amount) || 0;
    const amountInRupees = rawAmount > 0 ? rawAmount : 100;

    if (!isValid) {
      console.warn(
        `Payment signature mismatch for Order: ${razorpay_order_id}, Payment: ${razorpay_payment_id}`,
      );

      // Record failed transaction in Firestore for auditing
      await recordPaymentFailureInFirestore({
        amount: amountInRupees,
        currency: body.currency || "INR",
        failureReason: "signature_verification_mismatch",
        errorCode: "BAD_SIGNATURE",
        errorDescription: "Razorpay HMAC-SHA256 signature verification failed",
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        isAnonymous,
        supporterName: body.supporterName || sessionUser?.name || "Community Supporter",
        supporterEmail: body.supporterEmail || sessionUser?.email || "",
        userUid: sessionUser?.uid || body.userUid || "",
        tier: body.tier || "Supporter",
        message: (body.message || "").trim().slice(0, 500),
      });

      throw createError({
        statusCode: 400,
        statusMessage: "Payment signature verification failed",
        data: { error: "Payment signature verification failed. Do not honor transaction." },
      });
    }

    // 2. Verified successfully — save supporter record to Firebase
    const supporterData: FirestoreSupporter = {
      amount: amountInRupees,
      currency: body.currency || "INR",
      isAnonymous,
      supporterName: isAnonymous
        ? "Anonymous Supporter"
        : body.supporterName || sessionUser?.name || "Community Supporter",
      supporterEmail: body.supporterEmail || sessionUser?.email || "",
      userUid: sessionUser?.uid || body.userUid || "",
      userPhotoURL: isAnonymous ? "" : body.userPhotoURL || sessionUser?.photoURL || "",
      message: (body.message || "").trim().slice(0, 500),
      tier: body.tier || "Supporter",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      createdAt: new Date().toISOString(),
    };

    const saved = await createSupporterInFirestore(supporterData);
    if (!saved) {
      console.error(
        "Warning: Supporter record could not be persisted to Firestore REST. Check Firebase Console Security Rules for /supporters.",
      );
    }

    return {
      success: true,
      verified: true,
      savedToFirestore: Boolean(saved),
      message: "Payment signature verified and contribution processed successfully.",
      supporter: saved || supporterData,
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error("Error in /api/verify-payment:", err);
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || "Internal error verifying payment signature",
      data: { error: err?.message || "Internal error verifying payment signature" },
    });
  }
});
