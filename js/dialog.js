/* ES TRAINERS ConTroller — confirmation dialog for the tournament screens.
   Same markup and classes as the Admin Management dialog (css/admin.css); copied here so that module stays untouched. */
import { esc, qs } from "./ui.js";

/** S is the caller's state object; S.closeDialog lets the page close it when it unmounts. Resolves true / false (or false on Escape). */
export function dialog(S, o) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "dlg";
    wrap.innerHTML = '<div class="dlg__box" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<h2 id="dlg-title">' + esc(o.title) + '</h2><div class="dlg__body">' + o.bodyHtml + "</div>" +
      (o.requireText ? '<div class="field" style="margin-top:var(--space-3)"><label class="label" for="dlg-type">' + esc(o.requireLabel) + '</label><input class="input" id="dlg-type" autocomplete="off" spellcheck="false"></div>' : "") +
      '<div class="dlg__actions"><button class="btn btn--outline" type="button" data-x="no">Cancel</button><button class="btn ' + (o.danger ? "btn--danger" : "btn--primary") + '" type="button" data-x="yes"' + (o.requireText ? " disabled" : "") + ">" + esc(o.confirmLabel) + "</button></div></div>";
    document.body.appendChild(wrap);
    const yes = qs('[data-x="yes"]', wrap), typed = qs("#dlg-type", wrap);
    function close(v) { document.removeEventListener("keydown", onKey, true); wrap.remove(); S.closeDialog = null; if (prev && prev.focus) prev.focus(); resolve(v); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(false); } }
    document.addEventListener("keydown", onKey, true);
    S.closeDialog = () => close(false);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(false); });
    qs('[data-x="no"]', wrap).addEventListener("click", () => close(false));
    yes.addEventListener("click", () => close(true));
    if (typed) { typed.addEventListener("input", () => { yes.disabled = typed.value.trim() !== String(o.requireText); }); typed.focus(); }
    else yes.focus();
  });
}
