const ZITADEL_API_URL = process.env.ZITADEL_ISSUER;
const SERVICE_ACCOUNT_TOKEN = process.env.ZITADEL_MACHINE_USER_PAT;
const ORG_ID = process.env.ZITADEL_ORG_ID;

// Common headers used across v2 API calls
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ACCOUNT_TOKEN}`,
});

/**
 * 1. Create a fake "Guest" user in Zitadel using v2 CreateUser
 */
export async function createGuestAccountInIDP() {
  const randomSuffix = Math.random().toString(36).substring(7);
  const guestEmail = `guest_${Date.now()}_${randomSuffix}@temp.local`;

  // Generate the dynamic key: GUEST_YY_MM_DD
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const metadataKey = `GUEST_${yy}_${mm}_${dd}`;

  const payload = {
    // Omitting userId lets Zitadel auto-generate the ID for us securely
    organizationId: ORG_ID,
    human: {
      metadata: [
        {
          key: metadataKey,
          value: "Y3JlYXRlZA=="
        }
      ],
      profile: {
        givenName: "Guest",
        familyName: "User"
      },
      email: {
        email: guestEmail,
        isVerified: false
      },
      username: guestEmail
    }
  };

  const response = await fetch(`${ZITADEL_API_URL}/zitadel.user.v2.UserService/CreateUser`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create guest in Zitadel: ${error}`);
  }

  const data = await response.json();
  // Zitadel v2 CreateUser response usually returns the created userId
  return { id: data.id };
}

/**
 * 2. Get an Impersonation Token for the Guest
 */
export async function getImpersonationToken(userId) {
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: userId,
    subject_token_type: 'urn:zitadel:params:oauth:token-type:user_id',
    actor_token: SERVICE_ACCOUNT_TOKEN,
    actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    scope: 'openid profile email',
    client_id: process.env.ZITADEL_CLIENT_ID,
  });

  const response = await fetch(`${ZITADEL_API_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${SERVICE_ACCOUNT_TOKEN}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get impersonation token: ${error}`);
  }

  const data = await response.json();
  return data.id_token;
}

/**
 * 3. Update the fake profile with real user data (Registration)
 */
export async function updateAccountInIDP(userId, { givenName, familyName, email, password }) {

  // A. Update Profile & Email in one shot (v2 endpoint)
  const updatePayload = {
    username: email,
    profile: {
      givenName: givenName,
      familyName: familyName,
      displayName: `${givenName} ${familyName}`
    },
    email: {
      email: email,
      isVerified: true // Set to true so they can login immediately
    }
  };

  const updateRes = await fetch(`${ZITADEL_API_URL}/v2/users/human/${userId}`, {
    method: 'PUT', // PUT is standard for replacing the resource object
    headers: getHeaders(),
    body: JSON.stringify(updatePayload),
  });

  if (!updateRes.ok) {
    const error = await updateRes.text();
    throw new Error(`Failed to update user profile: ${error}`);
  }

  // B. Set their actual password
  const passwordPayload = {
    userId: userId,
    newPassword: {
      password: password,
      changeRequired: false
    }
  };

  const passwordRes = await fetch(`${ZITADEL_API_URL}/zitadel.user.v2.UserService/SetPassword`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(passwordPayload),
  });

  if (!passwordRes.ok) {
    const error = await passwordRes.text();
    throw new Error(`Failed to set user password: ${error}`);
  }

  removeGuestMetadata(userId).catch(console.error);

  return true;
}

/**
 * 4. Delete a user account from Zitadel
 */
export async function deleteAccountInIDP(userId) {
  const response = await fetch(`${process.env.ZITADEL_ISSUER}/zitadel.user.v2.UserService/DeleteUser`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', // <-- This is the missing piece!
      'Authorization': `Bearer ${process.env.ZITADEL_MACHINE_USER_PAT}`,
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to delete guest user ${userId} in Zitadel:`, error);
    return false;
  }

  console.log(`Successfully deleted guest user ${userId} from Zitadel.`);
  return true;
}

/**
 * Helper: Find and delete the GUEST_ metadata key
 */
async function removeGuestMetadata(userId) {
  try {
    // 1. Search for existing metadata
    const searchRes = await fetch(`${ZITADEL_API_URL}/v2/users/${userId}/metadata/search`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({}) // Empty body fetches all metadata for the user
    });

    if (!searchRes.ok) {
      console.error(`Failed to fetch metadata for user ${userId}`);
      return;
    }

    const searchData = await searchRes.json();
    const metadataList = searchData.metadata || [];

    // Find the specific key that starts with "GUEST_"
    const guestMeta = metadataList.find(m => m.key.startsWith('GUEST_'));

    if (guestMeta) {
      // 2. Delete the found metadata key
      // Make sure to URL-encode the key just in case it contains special characters
      const encodedKey = encodeURIComponent(guestMeta.key);
      const deleteRes = await fetch(`${ZITADEL_API_URL}/v2/users/${userId}/metadata?keys=${encodedKey}`, {
        method: 'DELETE',
        headers: getHeaders()
      });

      if (!deleteRes.ok) {
        console.error(`Failed to delete metadata key ${guestMeta.key} for user ${userId}`);
      } else {
        console.log(`Successfully removed guest metadata key: ${guestMeta.key}`);
      }
    }
  } catch (error) {
    console.error("Error during metadata cleanup:", error);
  }
}