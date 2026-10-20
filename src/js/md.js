// Renderer Markdown sicuro e senza dipendenze.
// Tutto il testo viene sottoposto a escape: l'HTML grezzo delle note NON passa mai.
// L'unico HTML prodotto è quello che genera questo file, con link filtrati (solo http, https, mailto e percorsi interni).

import { escapeHtml as esc, githubSlug } from "./util.js";

const RE_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)/;
const RE_FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)?.*$/;
const RE_HEAD = /^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const RE_HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const RE_QUOTE = /^\s{0,3}>\s?/;
const RE_TSEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const RE_ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

// Ultima difesa, qualunque cosa faccia il contesto: niente schemi diversi da http(s), mailto o percorsi relativi.
const SCHEMA = /^\s*([a-z][a-z0-9+.-]*):/i;
export function hrefSicuro(h) {
  const s = String(h ?? "").replace(/[\u0000-\u001f\u007f\s]/g, "");
  const m = SCHEMA.exec(s);
  return !m || ["http", "https", "mailto"].includes(m[1].toLowerCase());
}

const indentazione = t => (/^\s*/.exec(t)[0].replace(/\t/g, "    ")).length;
const vuota = t => /^\s*$/.test(t);

/**
 * @param {string} src  testo Markdown (senza frontmatter)
 * @param {object} ctx  { link(href)->{href,esterno}|null, wiki(target,alias)->{href,esiste}, img(src)->{src,path}|null, offset }
 * @returns {{html:string, titoli:Array<{livello:number,testo:string,id:string}>}}
 */
export function renderMarkdown(src, ctx = {}) {
  const c = {
    link: ctx.link || (h => ({ href: h, esterno: /^https?:/i.test(h) })),
    wiki: ctx.wiki || (t => ({ href: "#", esiste: false, t })),
    img: ctx.img || (s => (/^https?:/i.test(s) ? { src: s } : null)),
    offset: ctx.offset || 0,
    titoli: [], ids: new Map(),
  };
  // I commenti HTML spariscono, ma le righe restano (servono i numeri di riga per le attività).
  const testo = String(src ?? "").replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ""));
  const righe = testo.split("\n").map((t, n) => ({ t: t.replace(/\t/g, "    "), n }));
  const html = blocchi(righe, c).map(b => b.html).join("\n");
  return { html, titoli: c.titoli };
}

function inizioBlocco(t) {
  return RE_FENCE.test(t) || RE_HEAD.test(t) || RE_HR.test(t) || RE_QUOTE.test(t) || RE_ITEM.test(t);
}

function blocchi(L, c) {
  const out = [];
  let i = 0;
  while (i < L.length) {
    const t = L[i].t;
    if (vuota(t)) { i++; continue; }

    let m = RE_FENCE.exec(t);
    if (m && /^(\s{0,3})(`{3,}|~{3,})/.test(t)) {
      const recinto = m[2], lingua = (m[3] || "").toLowerCase(), codice = [];
      i++;
      while (i < L.length && !new RegExp(`^\\s{0,3}${recinto[0] === "`" ? "`" : "~"}{${recinto.length},}\\s*$`).test(L[i].t)) codice.push(L[i++].t);
      i++;
      const cls = lingua === "mermaid" ? ' class="diagramma"' : (lingua ? ` class="lingua-${esc(lingua)}"` : "");
      const nota = lingua === "mermaid" ? '<p class="nota-diagramma">Diagramma Mermaid: il disegno si vede su GitHub o nel grafo.</p>' : "";
      out.push({ k: "x", html: `<pre${cls}><code>${esc(codice.join("\n"))}</code></pre>${nota}` });
      continue;
    }

    m = RE_HEAD.exec(t);
    if (m) {
      const livello = m[1].length, grezzo = m[2] || "";
      const piano = grezzo.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a).replace(/[*_`~]/g, "");
      let id = githubSlug(piano);
      const n = c.ids.get(id) || 0; c.ids.set(id, n + 1); if (n) id += "-" + n;
      c.titoli.push({ livello, testo: piano, id });
      out.push({ k: "x", html: `<h${livello} id="h-${esc(id)}">${inline(grezzo, c)}</h${livello}>` });
      i++; continue;
    }

    if (RE_HR.test(t)) { out.push({ k: "x", html: "<hr>" }); i++; continue; }

    if (RE_QUOTE.test(t)) {
      const dentro = [];
      while (i < L.length && RE_QUOTE.test(L[i].t)) { dentro.push({ t: L[i].t.replace(RE_QUOTE, ""), n: L[i].n }); i++; }
      let cls = "", titolo = "";
      const a = dentro.length && RE_ALERT.exec(dentro[0].t.trim());
      if (a) {
        const tipo = a[1].toLowerCase();
        cls = ` class="avviso avviso-${tipo}"`;
        titolo = `<p class="avviso-titolo">${{ note: "Nota", tip: "Suggerimento", important: "Importante", warning: "Attenzione", caution: "Cautela" }[tipo]}</p>`;
        dentro.shift();
      }
      out.push({ k: "x", html: `<blockquote${cls}>${titolo}${blocchi(dentro, c).map(b => b.html).join("\n")}</blockquote>` });
      continue;
    }

    if (t.includes("|") && i + 1 < L.length && RE_TSEP.test(L[i + 1].t) && L[i + 1].t.includes("-")) {
      const [html, j] = tabella(L, i, c); out.push({ k: "x", html }); i = j; continue;
    }

    if (RE_ITEM.test(t)) { const [html, j] = lista(L, i, c); out.push({ k: "x", html }); i = j; continue; }

    // Paragrafo
    const par = [t];
    i++;
    while (i < L.length && !vuota(L[i].t) && !inizioBlocco(L[i].t) &&
           !(L[i].t.includes("|") && i + 1 < L.length && RE_TSEP.test(L[i + 1].t))) par.push(L[i++].t);
    const corpo = par.map(r => r.replace(/^\s+/, "")).join("\n");
    out.push({ k: "p", html: `<p>${inline(corpo, c).replace(/(?: {2,}|\\)\n/g, "<br>\n")}</p>`, testo: corpo });
  }
  return out;
}

function celle(riga) {
  let r = riga.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|") && !r.endsWith("\\|")) r = r.slice(0, -1);
  return r.split(/(?<!\\)\|/).map(x => x.trim());
}

function tabella(L, i, c) {
  const testa = celle(L[i].t);
  const allin = celle(L[i + 1].t).map(s => (s.startsWith(":") && s.endsWith(":") ? "center" : s.endsWith(":") ? "right" : s.startsWith(":") ? "left" : ""));
  const al = k => (allin[k] ? ` class="al-${allin[k]}"` : "");
  let h = "<div class=\"tabella\"><table><thead><tr>" + testa.map((x, k) => `<th${al(k)}>${inline(x, c)}</th>`).join("") + "</tr></thead><tbody>";
  let j = i + 2;
  while (j < L.length && !vuota(L[j].t) && L[j].t.includes("|")) {
    const r = celle(L[j].t);
    h += "<tr>" + testa.map((_, k) => `<td${al(k)}>${inline(r[k] ?? "", c)}</td>`).join("") + "</tr>";
    j++;
  }
  return [h + "</tbody></table></div>", j];
}

function lista(L, i, c) {
  const m0 = RE_ITEM.exec(L[i].t);
  const base = indentazione(m0[1]), ordinata = /\d/.test(m0[2]);
  const inizio = ordinata ? parseInt(m0[2], 10) : 1;
  const voci = [];
  let sciolta = false;
  while (i < L.length) {
    const m = RE_ITEM.exec(L[i].t);
    if (!m || indentazione(m[1]) < base || indentazione(m[1]) > base + 3 || /\d/.test(m[2]) !== ordinata) break;
    const rientro = m[0].length;
    const righe = [{ t: L[i].t.slice(m[0].length), n: L[i].n }];
    i++;
    while (i < L.length) {
      const t = L[i].t;
      if (vuota(t)) {
        let k = i + 1; while (k < L.length && vuota(L[k].t)) k++;
        if (k < L.length && indentazione(L[k].t) >= rientro) { righe.push({ t: "", n: L[i].n }); i++; sciolta = true; continue; }
        break;
      }
      const ind = indentazione(t), mi = RE_ITEM.exec(t);
      if (mi && ind <= base) break;
      if (ind >= rientro || (mi && ind > base)) { righe.push({ t: t.slice(Math.min(ind, rientro)), n: L[i].n }); i++; continue; }
      if (!inizioBlocco(t) && righe.length && !vuota(righe[righe.length - 1].t)) { righe.push({ t: t.trim(), n: L[i].n }); i++; continue; }
      break;
    }
    voci.push(righe);
    let k = i; while (k < L.length && vuota(L[k].t)) k++;
    if (k > i && k < L.length) {
      const mk = RE_ITEM.exec(L[k].t);
      if (mk && indentazione(mk[1]) === base && /\d/.test(mk[2]) === ordinata) { sciolta = true; i = k; }
    }
  }
  const tag = ordinata ? "ol" : "ul";
  const attr = ordinata && inizio !== 1 ? ` start="${inizio}"` : "";
  let compito = false;
  const lis = voci.map(righe => {
    let pre = "", cls = "";
    const tm = /^\[([ xX])\](\s+|$)/.exec(righe[0].t);
    if (tm) {
      compito = true;
      const fatto = tm[1] !== " ";
      righe[0] = { t: righe[0].t.slice(tm[0].length), n: righe[0].n };
      pre = `<input type="checkbox" class="attivita"${fatto ? " checked" : ""} data-riga="${righe[0].n + c.offset}" aria-label="${fatto ? "Fatto" : "Da fare"}"> `;
      cls = ` class="compito${fatto ? " fatto" : ""}"`;
    }
    const bl = blocchi(righe, c);
    const html = bl.map((b, k) => (!sciolta && b.k === "p" ? inline(b.testo, c).replace(/(?: {2,}|\\)\n/g, "<br>\n") : b.html) + (k < bl.length - 1 ? "\n" : "")).join("");
    return `<li${cls}>${pre}${html}</li>`;
  });
  return [`<${tag}${attr}${compito ? ' class="lista-compiti"' : ""}>${lis.join("")}</${tag}>`, i];
}

// --- Elementi in linea ------------------------------------------------------
function inline(s, c) {
  const pezzi = [];
  const metti = h => `\u0000${pezzi.push(h) - 1}\u0000`;

  const passa = testo => {
    // 1. codice in linea
    testo = testo.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, k) => metti(`<code>${esc(k.length > 2 && k.startsWith(" ") && k.endsWith(" ") ? k.slice(1, -1) : k)}</code>`));
    // 2. caratteri con escape
    testo = testo.replace(/\\([\\`*_{}[\]()#+\-.!|~<>"])/g, (_, ch) => metti(esc(ch)));
    // 3. immagini
    testo = testo.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (_, alt, src, tit) => {
      const r = hrefSicuro(src) ? c.img(src) : null;
      if (!r || (r.src && !hrefSicuro(r.src))) return metti(esc(alt));
      const t = tit ? ` title="${esc(tit)}"` : "";
      return metti(r.path
        ? `<img alt="${esc(alt)}" data-path="${esc(r.path)}"${t} loading="lazy">`
        : `<img alt="${esc(alt)}" src="${esc(r.src)}"${t} loading="lazy" referrerpolicy="no-referrer">`);
    });
    // 4. wikilink [[nota]], [[nota|testo]], [[nota#titolo]]
    testo = testo.replace(/!?\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, ancora, alias) => {
      let r = c.wiki(target.trim(), alias, ancora ? ancora.slice(1) : "");
      if (r && !hrefSicuro(r.href)) r = null;
      const etichetta = esc((alias || target).trim());
      return metti(r && r.esiste
        ? `<a href="${esc(r.href)}" class="wikilink">${etichetta}</a>`
        : `<a href="${esc(r ? r.href : "#")}" class="wikilink mancante" title="Nota non ancora creata">${etichetta}</a>`);
    });
    // 5. link [testo](href "titolo")
    testo = testo.replace(/\[((?:[^\][]|\[[^\]]*\])+)\]\(\s*<?([^)\s>]*)>?(?:\s+"([^"]*)")?\s*\)/g, (_, txt, href, tit) => {
      const r = hrefSicuro(href) ? c.link(href) : null;
      const dentro = passa(txt);
      if (!r || !hrefSicuro(r.href)) return metti(`<span class="link-vietato">${dentro}</span>`);
      const t = tit ? ` title="${esc(tit)}"` : "";
      return metti(r.esterno
        ? `<a href="${esc(r.href)}"${t} target="_blank" rel="noopener noreferrer" class="esterno">${dentro}</a>`
        : `<a href="${esc(r.href)}"${t}>${dentro}</a>`);
    });
    // 6. link automatici
    testo = testo.replace(/<(https?:\/\/[^\s<>]+)>/g, (_, u) => metti(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="esterno">${esc(u)}</a>`));
    testo = testo.replace(/(^|[\s(])(https?:\/\/[^\s<>()]*[^\s<>().,:;"'!?\]])/g, (_, pre, u) => pre + metti(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="esterno">${esc(u)}</a>`));
    // 7. a capo HTML
    testo = testo.replace(/<br\s*\/?>/gi, () => metti("<br>"));
    // 8. escape di tutto il resto, poi enfasi
    testo = esc(testo);
    testo = testo
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1<strong>$2</strong>")
      .replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
    return testo;
  };

  let h = passa(String(s));
  for (let giri = 0; giri < 10 && h.includes("\u0000"); giri++) h = h.replace(/\u0000(\d+)\u0000/g, (_, k) => pezzi[+k]);
  return h;
}
