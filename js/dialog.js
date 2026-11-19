/* ES TRAINERS ConTroller — confirmation dialog for the tournament and team screens.
   Same markup and classes as the Admin Management dialog (css/admin.css); copied here so that module stays untouched.
   Options: title, bodyHtml, confirmLabel, danger, requireText + requireLabel (type to confirm), reason: { label, min } (a required reason).
   Resolves false when cancelled; true when confirmed; { reason } when a reason was asked for. */
import { esc, qs } from "./ui.js";

export function dialog(S, o) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "dlg";
    const gated = !!(o.requireText || o.reason);
    wrap.innerHTML = '<div class="dlg__box" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<h2 id="dlg-title">' + esc(o.title) + '</h2><div class="dlg__body">' + o.bodyHtml + "</div>" +
      (o.reason ? '<div class="field" style="margin-top:var(--space-3)"><label class="label" for="dlg-reason">' + esc(o.reason.label) + '</label><textarea class="input" id="dlg-reason" rows="3" maxlength="300" style="resize:vertical"></textarea><p class="hint" id="dlg-reason-hint">At least ' + o.reason.min + " characters. It is saved in the activity log.</p></div>" : "") +
      (o.requireText ? '<div class="field" style="margin-top:var(--space-3)"><label class="label" for="dlg-type">' + esc(o.requireLabel) + '</label><input class="input" id="dlg-type" autocomplete="off" spellcheck="false"></div>' : "") +
      '<div class="dlg__actions"><button class="btn btn--outline" type="button" data-x="no">' + esc(o.cancelLabel || "Cancel") + "</button>" +
      (o.infoOnly ? "" : '<button class="btn ' + (o.danger ? "btn--danger" : "btn--primary") + '" type="button" data-x="yes"' + (gated ? " disabled" : "") + ">" + esc(o.confirmLabel) + "</button>") + "</div></div>";
    document.body.appendChild(wrap);
    const yes = qs('[data-x="yes"]', wrap), typed = qs("#dlg-type", wrap), reason = qs("#dlg-reason", wrap);
    function ready() {
      if (!yes) return;
      const okType = !typed || typed.value.trim() === String(o.requireText);
      const okReason = !reason || reason.value.replace(/\s+/g, " ").trim().length >= o.reason.min;
      yes.disabled = !(okType && okReason);
    }
    function close(v) { document.removeEventListener("keydown", onKey, true); wrap.remove(); S.closeDialog = null; if (prev && prev.focus) prev.focus(); resolve(v); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(false); } }
    document.addEventListener("keydown", onKey, true);
    S.closeDialog = () => close(false);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(false); });
    qs('[data-x="no"]', wrap).addEventListener("click", () => close(false));
    if (yes) yes.addEventListener("click", () => close(reason ? { reason: reason.value.replace(/\s+/g, " ").trim() } : true));
    if (typed) typed.addEventListener("input", ready);
    if (reason) reason.addEventListener("input", ready);
    (reason || typed || yes || qs('[data-x="no"]', wrap)).focus();
  });
}
