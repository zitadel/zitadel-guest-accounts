import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateAccountInIDP } from "@/lib/idp";

export async function POST(req) {
  // Extract the raw fields sent by the frontend form
  const formData = await req.json();
  const cookieStore = await cookies();
  const guestSession = cookieStore.get("guest_session");

  if (!guestSession) {
    return NextResponse.json({ error: "No guest session found" }, { status: 400 });
  }

  const { userId } = JSON.parse(guestSession.value);

  try {
    // Pass the raw data straight to our refactored IDP helper
    await updateAccountInIDP(userId, formData);

    // Clear guest cookie as they will log in for real via NextAuth next
    cookieStore.delete("guest_session");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("IDP Update Error:", error);
    return NextResponse.json({ error: "Failed to upgrade account" }, { status: 500 });
  }
}