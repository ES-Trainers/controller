/* Small shared UI helpers: escaping, toasts, formatting, busy buttons. */
import { icon } from "./icons.js";

/** Escape text for safe use inside innerHTML. EVERY dynamic string must pass through this. */
export function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- Toasts ---------- */
export function toast(message, kind = "info") {
  let box = document.getElementById("toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts"; box.className = "toasts";
    box.setAttribute("aria-live", "polite"); box.setAttribute("role", "status");
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast" + (kind === "error" ? " toast--error" : kind === "ok" ? " toast--ok" : "");
  el.innerHTML = icon(kind === "error" ? "alert" : kind === "ok" ? "check" : "info", "icon--sm") + "<span>" + esc(message) + "</span>";
  box.appendChild(el);
  setTimeout(() => el.remove(), kind === "error" ? 7000 : 4000);
}

export async function copyText(text, okMessage = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage, "ok");
  } catch (e) {
    toast("Copy is not available here. Select the text and copy it manually.", "error");
  }
}

/** Disable a button and show a spinner while an async action runs. */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.setAttribute("aria-busy", "true");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Please wait</span>';
  try { return await fn(); }
  finally { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.innerHTML = html; }
}

/* ---------- Formatting ---------- */
export function money(v) {
  if (v === null || v === undefined || v === "") return "Not set";
  if (typeof v === "number" && Number.isFinite(v)) return "\u20B9" + v.toLocaleString("en-IN");
  return String(v);
}
export function initials(name, email) {
  const s = String(name || email || "?").trim();
  const parts = s.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
}

/* ---------- Skeleton / state blocks ---------- */
export function skeletonCards(n = 6) {
  return '<div class="stats">' + '<div class="skeleton sk-card"></div>'.repeat(n) + "</div>";
}
export function skeletonRows(n = 4) {
  return '<div>' + '<div class="skeleton sk-row"></div>'.repeat(n) + "</div>";
}
export function emptyState(title, text, iconName = "info") {
  return '<div class="state">' + icon(iconName) + "<h3>" + esc(title) + "</h3><p>" + esc(text) + "</p></div>";
}
export function errorState(title, text, retryId = "") {
  return '<div class="state state--error">' + icon("alert") + "<h3>" + esc(title) + "</h3><p>" + esc(text) + "</p>" +
    (retryId ? '<button class="btn btn--outline btn--sm" id="' + esc(retryId) + '" type="button">' + icon("refresh", "icon--sm") + "Try again</button>" : "") + "</div>";
}
