import { defineEventHandler } from "h3";
import { listSupportersFromFirestore } from "../../lib/firestore-server";

export default defineEventHandler(async () => {
  try {
    const data = await listSupportersFromFirestore();
    return {
      success: true,
      supporters: data.supporters,
      totalRaised: data.totalRaised,
      totalSupporters: data.totalSupporters,
    };
  } catch (err: any) {
    console.error("Error fetching supporters API:", err);
    return {
      success: false,
      supporters: [],
      totalRaised: 0,
      totalSupporters: 0,
      error: err?.message || "Failed to retrieve supporters",
    };
  }
});
