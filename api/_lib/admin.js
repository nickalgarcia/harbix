// api/_lib/admin.js
// Shared Firebase Admin SDK initializer and agent-auth helper.
// Used by draft-reply, notify-agent, and notify-submitter.
// The underscore prefix on _lib keeps Vercel from deploying this as an endpoint.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth }                       from "firebase-admin/auth";
import { getFirestore }                  from "firebase-admin/firestore";

function initAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

export function getAdminDb() {
  initAdmin();
  return getFirestore();
}

// Verifies the Firebase ID token in the Authorization header and confirms
// the caller's email is @godchasers.church.
// Returns the decoded token on success.
// Throws an Error with a `.status` property (401 or 403) on failure.
export async function verifyChurchAgent(req) {
  initAdmin();
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) {
    const err = new Error("Missing auth token");
    err.status = 401;
    throw err;
  }
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch (_) {
    const err = new Error("Invalid auth token");
    err.status = 401;
    throw err;
  }
  if (!decoded.email?.endsWith("@godchasers.church")) {
    const err = new Error("Not authorized");
    err.status = 403;
    throw err;
  }
  return decoded;
}
