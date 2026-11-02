import { defineEventHandler, readBody, createError } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import { verifyRazorpaySignature } from "../../lib/razorpay-server";
import { purchasePlan, getUserBillingProfile } from "../../lib/supabase-server";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session || !session.uid) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { error: "Authentication required to subscribe or top up", code: "UNAUTHORIZED" },
      });
    }

    const body = await readBody<{
      planId?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    }>(event);

    const planId = (body?.planId || "").trim();
    if (!planId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: { error: "Missing required planId", code: "BAD_REQUEST" },
      });
    }

    // For paid plans/topups, verify Razorpay signature
    if (planId !== "free") {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw createError({
          statusCode: 400,
          statusMessage: "Bad Request",
          data: {
            error: "Payment verification details (order_id, payment_id, signature) required for paid plans",
            code: "PAYMENT_DETAILS_MISSING",
          },
        });
      }

      const isValid = verifyRazorpaySignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      );

      if (!isValid) {
        throw createError({
          statusCode: 400,
          statusMessage: "Bad Request",
          data: { error: "Invalid payment signature verification", code: "INVALID_SIGNATURE" },
        });
      }
    }

    const result = await purchasePlan(session.uid, planId, {
      razorpayOrderId: body?.razorpay_order_id,
      razorpayPaymentId: body?.razorpay_payment_id,
    });

    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: { error: result.error || "Failed to process plan subscription", code: "PURCHASE_FAILED" },
      });
    }

    const updatedProfile = await getUserBillingProfile(session.uid);

    return {
      success: true,
      message: `Successfully activated plan: ${planId}`,
      ...updatedProfile,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Error in /api/translations/subscribe:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: { error: "Failed to update subscription", code: "INTERNAL_ERROR" },
    });
  }
});
