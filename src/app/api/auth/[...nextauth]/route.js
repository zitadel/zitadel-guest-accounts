import NextAuth from "next-auth";
import ZitadelProvider from "next-auth/providers/zitadel";
import { cookies } from "next/headers";
import { getDb, saveDb } from "@/lib/db";
import { deleteAccountInIDP } from "@/lib/idp";

export const authOptions = {
  providers: [
    ZitadelProvider({
      clientId: process.env.ZITADEL_CLIENT_ID,
      clientSecret: process.env.ZITADEL_CLIENT_SECRET,
      issuer: process.env.ZITADEL_ISSUER,
      authorization: { params: { scope: "openid email profile offline_access" } },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // 'account' and 'user' are only defined on the very first login request
      if (account && user) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.userId = user.id; 

        // --- GUEST CART MERGE LOGIC ---
        try {
          const cookieStore = await cookies();
          const guestSessionCookie = cookieStore.get("guest_session");

          if (guestSessionCookie) {
            const { userId: guestId } = JSON.parse(guestSessionCookie.value);

            // Ensure we are merging into a DIFFERENT account
            if (guestId && guestId !== user.id) {
              const dbData = await getDb();

              // 1. Get the guest's cart
              const guestCart = dbData.users[guestId]?.cart || [];
              
              // 2. Ensure the real user exists in our local DB
              if (!dbData.users[user.id]) {
                dbData.users[user.id] = { cart: [] };
              }

              // 3. Merge the carts (combining arrays)
              dbData.users[user.id].cart = [...dbData.users[user.id].cart, ...guestCart];

              // 4. Delete the guest from the local DB
              delete dbData.users[guestId];
              await saveDb(dbData);

              // 5. Delete the guest from Zitadel
              // We don't await this so it doesn't slow down the user's login experience
              deleteAccountInIDP(guestId).catch(console.error);
            }

            // 6. Always destroy the guest cookie after a successful login
            cookieStore.delete("guest_session");
          }
        } catch (error) {
          console.error("Failed to merge guest session during login:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.idToken = token.idToken;
      session.user.id = token.userId;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };