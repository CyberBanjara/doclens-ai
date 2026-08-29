import { defineEventHandler, readBody, createError } from "h3";
import { getRazorpayClient, getRazorpayKeyId } from "../lib/razorpay-server";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      amount?: number;
      currency?: string;
      receipt?: string;
      notes?: Record<string, any>;
    }>(event);

    if (!body) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing request body",
        data: { error: "Missing request body" },
      });
    }

    let amount = Number(body.amount);
    if (!amount || isNaN(amount)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid amount provided",
        data: { error: "Invalid amount provided" },
      });
    }

    // Standardize amount: if provided in rupees (e.g. 100), convert to paise (10000).
    // If already >= 100 and represents paise, accept it. Minimum is 100 paise (1 INR).
    let amountInPaise = Math.round(amount);
    if (amountInPaise < 100) {
      amountInPaise = Math.round(amount * 100);
    }

    if (amountInPaise < 100) {
      throw createError({
        statusCode: 400,
        statusMessage: "Amount must be at least 100 paise (₹1)",
        data: { error: "Amount must be at least 100 paise (₹1)" },
      });
    }

    const currency = (body.currency || "INR").toUpperCase();
    const receipt =
      body.receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const notes = body.notes || { purpose: "Anuwad Community Support" };

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt,
      notes,
    });

    return {
      success: true,
      order_id: order.id,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key_id: getRazorpayKeyId(),
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error("Razorpay order creation failed:", err);
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || "Failed to create Razorpay order",
      data: { error: err?.message || "Failed to create Razorpay order" },
    });
  }
});
