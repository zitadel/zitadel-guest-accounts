<p align="center">
    <img src="./assets/logo.svg" alt="Zitadel Logo" max-height="200px" width="auto" />
</p>

# Zitadel: The "Shadow Account" Architecture

This application demonstrates how to implement a **"Shadow Account" (Guest) architecture** using the Next.js App Router, NextAuth.js, and Zitadel as the Identity Provider (IDP).

## The Problem
In certain scenarios, forcing a user to register *before* they can explore and test the app can affect conversion rates. However, modern applications often require cryptographically signed JWTs from an Identity Provider to securely interact with backend microservices. 

**How do you give an anonymous guest a valid IDP token without making them register?**

## Shadow Accounts

This sample e-commerce app implements a delayed-registration shadow account flow. It creates a temporary "ghost" user in the IDP the exact moment a user shows purchase intent, tracks them securely using Token Impersonation, and seamlessly upgrades them to a permanent user (or merges their data) when they register.


### How It Works?

This application handles four distinct phases of the user lifecycle:

#### Phase 1: The Anonymous Intent (Guest Creation)
1. A user lands on the site. They are completely anonymous. No database records exist.
2. The user clicks **"Add to Cart"**. 
3. The application catches this intent and intercepts the action. Before adding the item, it calls the backend (`/api/init-guest`).
4. The backend uses a **Zitadel Service Account** to silently create a fake "Shadow User" via the Zitadel v2 API.
5. **Garbage Collection Tagging:** The shadow user is tagged with a metadata key representing the exact creation date (e.g., `GUEST_26_02_20` with a Base64 value). This allows for automated cron jobs to sweep and delete abandoned guest accounts later without touching registered users.
6. The backend uses **OAuth 2.0 Token Exchange (RFC 8693)** to trade its Service Account token for an **Impersonation Token** acting as the new guest.
7. The Token and the new Guest ID are locked inside an `httpOnly` secure cookie (`guest_session`), and the cart item is saved to the local database (`db.json`).

#### Phase 2: The Upgrade Path (Frictionless Registration)
1. The user clicks "Register / Checkout".
2. They are presented with a local registration form hosted by the Next.js app (not the IDP).
3. Upon submission, the backend (`/api/register-guest`) catches the payload.
4. Using the ID locked in the `guest_session` cookie, the backend calls Zitadel's Management APIs to **upgrade the shadow account**. It sets their real Name, Email, and Password.
5. **Crucially:** It deletes the `GUEST_YY_MM_DD` metadata tag so the user is safe from the garbage collection sweep.
6. The `guest_session` cookie is destroyed, and NextAuth programmatically triggers `signIn("zitadel")`, dropping the user directly into the IDP login screen with their newly minted credentials.

#### Phase 3: The "Oops, I Have An Account" Path (Cart Merging)
What happens if a guest adds 5 items to their cart, clicks "Sign In," and logs into a completely different, pre-existing account?
1. The user authenticates with Zitadel and is redirected back to the Next.js app.
2. NextAuth's `jwt` callback fires.
3. The callback detects that a `guest_session` cookie still exists, but the newly authenticated `user.id` from Zitadel **does not match** the guest ID.
4. **The Merge:** The app reads the guest's cart from `db.json`, appends it to the real user's cart, and saves it.
5. **The Cleanup:** The app makes a background call to Zitadel's v2 `DeleteUser` API to instantly remove the orphaned shadow account, keeping the IDP completely clean. The cookie is destroyed.

#### Phase 4: Garbage Collection (The Cron Job Prep)
Because every un-upgraded shadow user is tagged with `metadata` mapping to their creation date, the system is primed for a simple serverless function or cron job. A script can easily call Zitadel's metadata search API to find all users tagged with `GUEST_YY_MM_DD` from 30 days ago and batch-delete them, preventing IDP bloat.

---

## Tech Stack
* **Framework:** [Next.js](https://nextjs.org/) (App Router, Server Actions, Route Handlers)
* **Auth:** [NextAuth.js](https://next-auth.js.org/)
* **IDP:** [Zitadel](https://zitadel.com/) (Using v2 APIs and Service Accounts)
* **Database:** Local `db.json` (For demonstration purposes, easily swappable for Postgres/Redis)
* **Styling:** Tailwind CSS

---

## Getting Started

### 1. Clone and Install
```bash
git clone https://github.com/zitadel/zitadel-guest-accounts.git
npm install
```

### 2. Zitadel Configuration

To make the "Shadow Account" architecture work, Zitadel needs to explicitly allow your backend to create and impersonate users on the fly. Here is the exact configuration required in your Zitadel Console:

#### A. Create the Application

Navigate to your Project and create a new **Application**.
1. Select a name and application type, in this case **Web**
2. **Auth Method:** Change the authentication method to **PKCE**.
3. **Redirect URIs:** Enable development for http Redirect URIs. Add `http://localhost:3000/api/auth/callback/zitadel`. 
4. **Post Logout URIs:** Add `http://localhost:3000/`.
5. **Verify overview and Create:** Make sure all your settings are correct.
6. Copy the **Client ID** (you will need these for your `.env.local`).
7. **Grant Types:** Explicitly enable the **Token Exchange** flow. This is strictly required for the backend to swap its service token for the guest's impersonated ID token.
8. **Token Settings:** Change the Auth token type to `JWT`, and toggle on the option to include user profile in the ID token.

#### B. Create the Service Account (For the Backend APIs)

1. Go to your Organization -> Users and create a **Service Account**.
2. Generate a **Personal Access Token (PAT)** for this user and copy it safely. This will be the master key your Next.js API routes use to communicate with Zitadel.
3. Go back to the **Default Settings** section of your Instance.
4. Assign the **IAM End User Impersonator** and **IAM User Manager** role to the service account you created. 

#### C. Enable Impersonation

1. Go to your **Instance Settings** -> **Security Settings**.
2. Find the Impersonation policies and explicitly **Enable Impersonation**.

This specific combination gives your Next.js backend the authority to silently create users and immediately act on their behalf without them ever seeing a login screen!

### 3. Environment Variables

Create a `.env.local` file in the root of your project:

```env
# NextAuth Settings
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_a_random_secret_string_here

# Zitadel App Settings
ZITADEL_ISSUER=https://your-instance-domain.zitadel.cloud
ZITADEL_CLIENT_ID=your_app_client_id

# Zitadel Service Account Settings (For the Backend APIs)
ZITADEL_MACHINE_USER_PAT=your_machine_user_personal_access_token
ZITADEL_ORG_ID=your_organization_id
```

### 4. Run the Development Server

```bash
npm run dev
```

Open http://localhost:3000 with your browser to see the result. Try adding items to the cart, exploring the decoded JWT debug window, and testing both the registration and account-merging flows

