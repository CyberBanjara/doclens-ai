import { defineEventHandler, readBody, createError } from "h3";
import { createSupporterInFirestore, type FirestoreSupporter } from "../../lib/firestore-server";
import { getSessionUserFromEvent } from "../../lib/auth-server";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Partial<FirestoreSupporter>>(event);

    if (!body) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing request body",
        data: { error: "Missing request body" },
      });
    }

    const amount = Number(body.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid contribution amount",
        data: { error: "Invalid contribution amount" },
      });
    }

    if (!body.razorpayPaymentId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing Razorpay payment ID",
        data: { error: "Missing Razorpay payment ID" },
      });
    }

    // Attach authenticated session user if available
    const sessionUser = await getSessionUserFromEvent(event);

    const isAnonymous = Boolean(body.isAnonymous);
    const supporterName = isAnonymous
      ? "Anonymous Supporter"
      : body.supporterName || sessionUser?.name || "Community Supporter";

    const supporterData: FirestoreSupporter = {
      amount,
      currency: body.currency || "INR",
      isAnonymous,
      supporterName,
      supporterEmail: body.supporterEmail || sessionUser?.email || "",
      userUid: sessionUser?.uid || body.userUid || "",
      userPhotoURL: isAnonymous ? "" : body.userPhotoURL || sessionUser?.photoURL || "",
      message: (body.message || "").trim().slice(0, 500),
      tier: body.tier || "Supporter",
      razorpayPaymentId: body.razorpayPaymentId,
      razorpayOrderId: body.razorpayOrderId || "",
      createdAt: new Date().toISOString(),
    };

    const saved = await createSupporterInFirestore(supporterData);

    if (!saved) {
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to persist supporter record to database",
        data: { error: "Failed to persist supporter record to database" },
      });
    }

    return {
      success: true,
      supporter: {
        id: saved.id,
        amount: saved.amount,
        currency: saved.currency,
        isAnonymous: saved.isAnonymous,
        supporterName: saved.supporterName,
        userPhotoURL: saved.userPhotoURL,
        message: saved.message,
        tier: saved.tier,
        createdAt: saved.createdAt,
      },
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error("Error in /api/support/record:", err);
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || "Internal server error saving contribution",
      data: { error: err?.message || "Internal server error saving contribution" },
    });
  }
});
