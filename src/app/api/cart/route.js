import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { getDb, saveDb } from "@/lib/db";

// Helper to determine who is making the request
async function getIdentity() {
  // 1. Check for real user session first
  const session = await getServerSession(authOptions);
  if (session) {
    return { userId: session.user.id, idToken: session.idToken, type: "authenticated" };
  }

  // 2. Fallback to guest session
  const cookieStore = await cookies();
  const guestSession = cookieStore.get("guest_session");
  if (guestSession) {
    const { userId, idToken } = JSON.parse(guestSession.value);
    return { userId, idToken, type: "guest" };
  }

  return null;
}

export async function GET() {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ cart: [], idToken: null });

  const dbData = await getDb();
  const cart = dbData.users[identity.userId]?.cart || [];
  
  return NextResponse.json({ cart, idToken: identity.idToken });
}

export async function POST(req) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await req.json();
  const dbData = await getDb();

  if (!dbData.users[identity.userId]) {
    dbData.users[identity.userId] = { cart: [] };
  }

  dbData.users[identity.userId].cart.push(item);
  await saveDb(dbData);

  return NextResponse.json({ cart: dbData.users[identity.userId].cart, idToken: identity.idToken });
}