// Editor Markdown: barra degli strumenti, scorciatoie, liste che continuano, suggerimenti per i [[wikilink]].

import { escapeHtml as esc } from "./util.js";

/**
 * @param {HTMLElement} box
 * @param {{testo:string, nomi:()=>Array<{nome:string,titolo:string}>, anteprima:(t:string)=>string,
 *          onCambio:(t:string)=>void, onSalva:()=>void, onAllega:(file:File)=>Promise<string|null>}} o
 */
export function creaEditor(box, o) {
  box.innerHTML = `
    <div class="ed-barra" role="toolbar" aria-label="Formattazione">
      <button type="button" data-a="titolo" title="Titolo">H</button>
      <button type="button" data-a="forte" title="Grassetto (Ctrl+B)"><b>B</b></button>
      <button type="button" data-a="corsivo" title="Corsivo (Ctrl+I)"><i>I</i></button>
      <button type="button" data-a="link" title="Link (Ctrl+K)">🔗</button>
      <button type="button" data-a="wiki" title="Collega una nota ([[)">[[ ]]</button>
      <button type="button" data-a="lista" title="Elenco">•</button>
      <button type="button" data-a="compito" title="Attività">☐</button>
      <button type="button" data-a="citazione" title="Citazione">❝</button>
      <button type="button" data-a="codice" title="Codice">{ }</button>
      <button type="button" data-a="allega" title="Allega un'immagine o un file">📎</button>
      <input type="file" class="ed-file" hidden>
      <span class="ed-spazio"></span>
      <div class="ed-modi" role="tablist" aria-label="Vista">
        <button type="button" role="tab" data-m="scrivi">Scrivi</button>
        <button type="button" role="tab" data-m="affiancati" class="solo-largo">Affiancati</button>
        <button type="button" role="tab" data-m="anteprima">Anteprima</button>
      </div>
    </div>
    <div class="ed-aree">
      <textarea class="ed-testo" spellcheck="true" aria-label="Testo della nota"></textarea>
      <div class="ed-anteprima testo-nota" aria-live="off"></div>
    </div>
    <div class="ed-suggerimenti" role="listbox" hidden></div>`;
  const ta = box.querySelector(".ed-testo"), pv = box.querySelector(".ed-anteprima"), sug = box.querySelector(".ed-suggerimenti");
  const file = box.querySelector(".ed-file");
  ta.value = o.testo;

  let modo = window.matchMedia("(min-width: 1100px)").matches ? "affiancati" : "scrivi";
  const impostaModo = m => {
    modo = m; box.dataset.modo = m;
    box.querySelectorAll("[data-m]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.m === m)));
    if (m !== "scrivi") rendi();
    if (m !== "anteprima") ta.focus();
  };
  let timer = null;
  const rendi = () => { pv.innerHTML = o.anteprima(ta.value); };
  const cambiato = () => {
    o.onCambio(ta.value);
    clearTimeout(timer);
    if (modo !== "scrivi") timer = setTimeout(rendi, 180);
    suggerisci();
  };

  // --- modifiche al testo, compatibili con annulla (Ctrl+Z) quando possibile ---
  function sostituisci(da, a, testo, selDa, selA) {
    ta.focus();
    ta.setSelectionRange(da, a);
    let ok = false;
    try { ok = document.execCommand("insertText", false, testo); } catch { ok = false; }
    if (!ok) ta.setRangeText(testo, da, a, "end");
    if (selDa !== undefined) ta.setSelectionRange(selDa, selA ?? selDa);
    cambiato();
  }
  function avvolgi(pre, post = pre, segnaposto = "testo") {
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e) || segnaposto;
    sostituisci(s, e, pre + sel + post, s + pre.length, s + pre.length + sel.length);
  }
  function prefissoRighe(fn) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const da = v.lastIndexOf("\n", s - 1) + 1, a = v.indexOf("\n", e) < 0 ? v.length : v.indexOf("\n", e);
    const nuovo = v.slice(da, a).split("\n").map(fn).join("\n");
    sostituisci(da, a, nuovo, da, da + nuovo.length);
  }
  const azioni = {
    titolo: () => prefissoRighe(r => { const m = /^(#{1,5})\s/.exec(r); return m ? "#" + r : (/^######\s/.test(r) ? r.replace(/^#+\s/, "") : "## " + r); }),
    forte: () => avvolgi("**"), corsivo: () => avvolgi("*"),
    link: () => { const { selectionStart: s, selectionEnd: e, value: v } = ta; const t = v.slice(s, e) || "testo"; sostituisci(s, e, `[${t}](https://)`, s + t.length + 3, s + t.length + 11); },
    wiki: () => { const { selectionStart: s, selectionEnd: e, value: v } = ta; const t = v.slice(s, e); sostituisci(s, e, `[[${t}`, s + 2 + t.length); suggerisci(); },
    lista: () => prefissoRighe(r => /^\s*[-*+]\s/.test(r) ? r.replace(/^(\s*)[-*+]\s/, "$1") : "- " + r),
    compito: () => prefissoRighe(r => /^\s*- \[[ x]\]\s/.test(r) ? r.replace(/^(\s*)- \[[ x]\]\s/, "$1") : "- [ ] " + r.replace(/^\s*[-*+]\s/, "")),
    citazione: () => prefissoRighe(r => r.startsWith("> ") ? r.slice(2) : "> " + r),
    codice: () => { const { selectionStart: s, selectionEnd: e, value: v } = ta; const t = v.slice(s, e); t.includes("\n") ? avvolgi("```\n", "\n```", "") : avvolgi("`", "`", "codice"); },
    allega: () => file.click(),
  };
  box.querySelector(".ed-barra").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a) azioni[b.dataset.a]();
    if (b.dataset.m) impostaModo(b.dataset.m);
  });
  file.addEventListener("change", async () => {
    const f = file.files[0]; file.value = ""; if (!f) return;
    const md = await o.onAllega(f);
    if (md) { const s = ta.selectionStart; sostituisci(s, ta.selectionEnd, md, s + md.length); }
  });

  // --- tastiera ---
  ta.addEventListener("keydown", e => {
    if (!sug.hidden && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) { gestisciSuggerimenti(e); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); o.onSalva(); return; }
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); azioni.forte(); return; }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); azioni.corsivo(); return; }
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); azioni.link(); return; }
    if (e.key === "Tab" && !mod) {
      const v = ta.value, s = ta.selectionStart, inizio = v.lastIndexOf("\n", s - 1) + 1, riga = v.slice(inizio, v.indexOf("\n", s) < 0 ? v.length : v.indexOf("\n", s));
      if (/^\s*([-*+]|\d+[.)])\s/.test(riga)) {
        e.preventDefault();
        if (e.shiftKey) { if (riga.startsWith("  ")) sostituisci(inizio, inizio + 2, "", Math.max(inizio, s - 2)); }
        else sostituisci(inizio, inizio, "  ", s + 2);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !mod && !e.isComposing) {
      const v = ta.value, s = ta.selectionStart;
      if (s !== ta.selectionEnd) return;
      const inizio = v.lastIndexOf("\n", s - 1) + 1, riga = v.slice(inizio, s);
      const m = /^(\s*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/.exec(riga);
      if (!m) return;
      e.preventDefault();
      if (riga.trim() === m[0].trim() && riga.length === m[0].length) { sostituisci(inizio, s, "", inizio); return; } // voce vuota: chiude l'elenco
      const marca = m[3] ? (+m[3] + 1) + m[4] : m[2];
      const ins = "\n" + m[1] + marca + m[5] + (m[6] ? "[ ] " : "");
      sostituisci(s, s, ins, s + ins.length);
    }
  });
  ta.addEventListener("input", cambiato);
  ta.addEventListener("blur", () => setTimeout(() => { sug.hidden = true; }, 150));

  // --- suggerimenti [[ ---
  let voci = [], attivo = 0, inizioQ = -1;
  function suggerisci() {
    const v = ta.value, s = ta.selectionStart;
    const a = v.lastIndexOf("[[", s), chiusa = v.lastIndexOf("]]", s - 1);
    if (a < 0 || chiusa > a || v.slice(a, s).includes("\n") || s - a > 60) { sug.hidden = true; return; }
    const q = v.slice(a + 2, s).toLowerCase();
    inizioQ = a + 2;
    voci = o.nomi().filter(n => !q || n.nome.toLowerCase().includes(q) || n.titolo.toLowerCase().includes(q))
      .sort((x, y) => (y.nome.toLowerCase().startsWith(q)) - (x.nome.toLowerCase().startsWith(q)) || x.nome.length - y.nome.length).slice(0, 8);
    if (!voci.length) { sug.hidden = true; return; }
    attivo = 0; mostra();
  }
  function mostra() {
    sug.innerHTML = voci.map((n, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === attivo}"><b>${esc(n.nome)}</b><span>${esc(n.titolo)}</span></button>`).join("");
    sug.hidden = false;
  }
  function scegli(i) {
    const n = voci[i]; if (!n) return;
    const v = ta.value, fine = v.startsWith("]]", ta.selectionStart) ? ta.selectionStart + 2 : ta.selectionStart;
    const ins = n.nome + "]]";
    sostituisci(inizioQ, fine, ins, inizioQ + ins.length);
    sug.hidden = true;
  }
  function gestisciSuggerimenti(e) {
    e.preventDefault();
    if (e.key === "Escape") { sug.hidden = true; return; }
    if (e.key === "ArrowDown") { attivo = (attivo + 1) % voci.length; mostra(); return; }
    if (e.key === "ArrowUp") { attivo = (attivo - 1 + voci.length) % voci.length; mostra(); return; }
    scegli(attivo);
  }
  sug.addEventListener("mousedown", e => { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); scegli(+b.dataset.i); } });

  impostaModo(modo);
  return {
    get testo() { return ta.value; },
    set testo(t) { ta.value = t; cambiato(); },
    focus() { ta.focus(); },
    area: ta,
  };
}
