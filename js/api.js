/* ES TRAINERS ConTroller — client for the existing Apps Script backend (admin.* actions).
   Every call sends the signed-in person's Firebase ID token. The server verifies it and decides what is allowed;
   nothing the browser sends is trusted for identity or permission. No secrets live here: the address below is public.
   The body is sent as text/plain so the browser makes a simple request (Apps Script web apps do not answer CORS preflights). */
import { auth } from "./firebase-config.js";

export const ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbxjfJHM8U2uIFXSPPto92UcIVV3yZIZvldZhP5O2kwgtxjr7WZ8XJEUqTSciLt4piDE/exec";
const TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor(code, message, fields) { super(message); this.name = "ApiError"; this.code = code; this.fields = fields || null; }
}

export async function callAdmin(action, payload) {
  const user = auth.currentUser;
  if (!user) throw new ApiError("AUTH_REQUIRED", "Please sign in again.");
  let token;
  try { token = await user.getIdToken(); } catch (e) { throw new ApiError("AUTH_REQUIRED", "Please sign in again."); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ADMIN_API_URL, {
      method: "POST", credentials: "omit", redirect: "follow", signal: ctrl.signal,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, idToken: token, payload: payload || {} })
    });
  } catch (e) {
    throw new ApiError("NETWORK", "Could not reach the server. Check your connection and try again.");
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch (e) { throw new ApiError("BAD_RESPONSE", "The server sent an unexpected response. Try again."); }
  if (!data || data.ok !== true) {
    const code = (data && data.code) || "ERROR";
    const msg = code === "UNKNOWN_ACTION" ? "The server has not been updated for this feature yet." : (data && data.error) || "The request failed.";
    throw new ApiError(code, msg, data && data.fields);
  }
  return data;
}
