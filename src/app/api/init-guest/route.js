import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth"; // Import getServerSession
import { authOptions } from "../auth/[...nextauth]/route"; // Import your config
import { createGuestAccountInIDP, getImpersonationToken } from "@/lib/idp";
import { getDb, saveDb } from "@/lib/db";

export async function POST() {
    // 1. Check if the user is already fully authenticated
    const session = await getServerSession(authOptions);
    if (session) {
        return NextResponse.json({ message: "User is authenticated, skipping guest init" });
    }

    const cookieStore = await cookies();
    const existingGuest = cookieStore.get("guest_session");

    if (existingGuest) {
        return NextResponse.json({ message: "Already initialized" });
    }

    const guestUser = await createGuestAccountInIDP();
    const dbData = await getDb();
    dbData.users[guestUser.id] = { cart: [] };
    await saveDb(dbData);

    const token = await getImpersonationToken(guestUser.id);
    const sessionData = JSON.stringify({ userId: guestUser.id, idToken: token });
    
    cookieStore.set("guest_session", sessionData, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
    });

    return NextResponse.json({ message: "Guest initialized", userId: guestUser.id });
}