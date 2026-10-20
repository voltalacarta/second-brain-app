// Second brain · app web. Legge e scrive la repo con l'API di GitHub; nessun server, nessun dato fuori da GitHub.

import { GitHub, Conflitto } from "./github.js";
import { renderMarkdown } from "./md.js";
import { creaGrafo } from "./grafo.js";
import { creaEditor } from "./editor.js";
import * as u from "./util.js";

const esc = u.escapeHtml;
const $ = s => document.querySelector(s);

// ---------------------------------------------------------------------------
// Memoria del browser (può mancare: finestra privata, anteprime…)
// ---------------------------------------------------------------------------
const mem = {
  area(locale) { try { return locale ? window.localStorage : window.sessionStorage; } catch { return null; } },
  get(k) { for (const a of [this.area(false), this.area(true)]) { try { const v = a && a.getItem(k); if (v !== null && v !== undefined) return v; } catch { /* */ } } return null; },
  set(k, v, locale) { try { const a = this.area(locale); if (a) a.setItem(k, v); } catch { /* */ } },
  del(k) { for (const a of [this.area(false), this.area(true)]) { try { if (a) a.removeItem(k); } catch { /* */ } } },
  pulisci() {
    for (const a of [this.area(false), this.area(true)]) {
      try { if (!a) continue; for (const k of Object.keys(a)) if (k.startsWith("sb:")) a.removeItem(k); } catch { /* */ }
    }
  },
};
const ricorda = () => mem.get("sb:ricorda") === "1";

// ---------------------------------------------------------------------------
// Stato
// ---------------------------------------------------------------------------
const S = {
  gh: null, esterni: new Map(), nomi: new Map(), grafo: null, indice: [], aperte: new Set(["00-inbox", "10-progetti"]),
  servizio: false, sporco: false, uscita: null, ignoraHash: false, editor: null, urls: [], grafoVista: null, grafoLocale: null,
  nuove: new Map(), percorso: null, ultimoGrafoSha: null, osservo: null, giro: 0,
};
/** Errore "silenzioso": la vista è stata superata da una navigazione più recente. */
class Superata extends Error {}
const ancoraValida = g => { if (g !== S.giro) throw new Superata(); };
const hubNome = () => S.gh.repo;

// ---------------------------------------------------------------------------
// Avvio e accesso
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", avvio);

async function avvio() {
  // Mai dentro una cornice di un altro sito (protegge da click ingannevoli sul token salvato).
  if (window.top !== window.self) { document.body.textContent = "Per sicurezza questa app non si apre dentro un'altra pagina."; return; }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  $("#form-accesso").addEventListener("submit", accedi);
  const repo = mem.get("sb:repo"); if (repo) $("#in-repo").value = repo;
  $("#in-ricorda").checked = ricorda();
  aggiornaLinkToken();
  $("#in-repo").addEventListener("input", aggiornaLinkToken);
  const token = mem.get("sb:token");
  if (token) {
    try { await entra(token, mem.get("sb:repo") || $("#in-repo").value); return; }
    catch (e) { mostraAccesso(e.message); return; }
  }
  mostraAccesso();
}

function aggiornaLinkToken() {
  const [owner = "voltalacarta", repo = "second-brain"] = $("#in-repo").value.split("/");
  const q = new URLSearchParams({ name: `Second brain app (${location.host || "locale"})`, description: "Lettura e scrittura delle note dall'app web", target_name: owner, expires_in: "90", contents: "write", actions: "read" });
  $("#link-token").href = "https://github.com/settings/personal-access-tokens/new?" + q.toString();
  $("#link-token").dataset.repo = repo;
}

function mostraAccesso(errore) {
  $("#app").hidden = true; $("#accesso").hidden = false;
  const p = $("#err-accesso"); p.hidden = !errore; p.textContent = errore || "";
  $("#in-token").focus();
}

async function accedi(e) {
  e.preventDefault();
  const btn = e.submitter || $("#form-accesso button"); btn.disabled = true; btn.textContent = "Controllo…";
  const token = $("#in-token").value.trim(), repo = $("#in-repo").value.trim(), locale = $("#in-ricorda").checked;
  try {
    await entra(token, repo);
    mem.del("sb:token"); mem.set("sb:token", token, locale); mem.set("sb:repo", repo, true); mem.set("sb:ricorda", locale ? "1" : "0", true);
    $("#in-token").value = "";
  } catch (err) { mostraAccesso(err.message); }
  finally { btn.disabled = false; btn.textContent = "Entra"; }
}

async function entra(token, repoPieno) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoPieno)) throw new Error("La repo va scritta come proprietario/nome, per esempio voltalacarta/second-brain.");
  const [owner, repo] = repoPieno.split("/");
  const gh = new GitHub(token, owner, repo);
  await gh.info();
  await gh.carica();
  S.gh = gh;
  $("#accesso").hidden = true; $("#app").hidden = false;
  $("#m-github").href = `https://github.com/${owner}/${repo}`;
  if (!gh.puoScrivere) avviso("Il token può solo leggere: per modificare serve il permesso Contents «Read and write».", 8000);
  if (gh.troncato) avviso("La repo è molto grande: alcuni file non compaiono nell'elenco.", 8000);
  collegaInterfaccia();
  S.nomi = u.buildNameIndex(gh.albero.keys());
  disegnaAlbero();
  caricaGrafo();
  window.addEventListener("hashchange", instrada);
  instrada();
}

// ---------------------------------------------------------------------------
// Grafo e indice (generati dall'Action "Aggiorna il grafo")
// ---------------------------------------------------------------------------
async function caricaGrafo() {
  const gh = S.gh;
  try {
    const e = gh.albero.get("_grafo/grafo.json");
    if (!e) { statoRepo(); return; }
    if (e.sha === S.ultimoGrafoSha) return;
    const [g, ind] = await Promise.all([gh.testo("_grafo/grafo.json"), gh.albero.has("_grafo/indice.jsonl") ? gh.testo("_grafo/indice.jsonl") : { testo: "" }]);
    const dati = JSON.parse(g.testo);
    dati.perId = new Map(dati.nodi.map((n, i) => [n.id, i]));
    dati.adiacenti = dati.nodi.map(() => []);
    for (const a of dati.archi) { dati.adiacenti[a[0]].push(a); dati.adiacenti[a[1]].push(a); }
    S.grafo = dati; S.ultimoGrafoSha = e.sha;
    S.indice = ind.testo.split("\n").filter(Boolean).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean)
      .map(x => ({ ...x, q: { t: u.normalizza(x.t), p: u.normalizza(x.p || x.id || ""), c: u.normalizza((x.c || []).join(" ")), s: u.normalizza(x.s) } }));
    statoRepo();
    document.dispatchEvent(new CustomEvent("grafo-pronto"));
  } catch (err) { console.warn("grafo", err); statoRepo(); }
}

function statoRepo(testo) {
  const gh = S.gh;
  const nodi = S.grafo ? `${S.grafo.nodi.length} nodi · ${S.grafo.archi.length} collegamenti` : "grafo non ancora generato";
  $("#stato-repo").innerHTML = `<b>${esc(gh.owner)}/${esc(gh.repo)}</b>${gh.privata ? " · privata" : ""}<br>${esc(testo || nodi)}`;
}

/** Dopo un salvataggio: aspetta il commit del bot del grafo e ricarica i dati. */
function osservaGrafo() {
  clearInterval(S.osservo);
  let giri = 0;
  statoRepo("Il grafo si sta aggiornando…");
  S.osservo = setInterval(async () => {
    giri++;
    try {
      if (await S.gh.aggiornaSeCambiato()) {
        S.nomi = u.buildNameIndex(S.gh.albero.keys());
        const prima = S.ultimoGrafoSha;
        await caricaGrafo();
        if (S.ultimoGrafoSha !== prima) {
          clearInterval(S.osservo); avviso("Grafo aggiornato.");
          disegnaAlbero();
          if (S.percorso && S.percorso.vista === "nota") pannelloCollegamenti(S.percorso.repo, S.percorso.path);
          return;
        }
      }
    } catch { /* riprova */ }
    if (giri > 16) { clearInterval(S.osservo); statoRepo(); }
  }, 20000);
}

// ---------------------------------------------------------------------------
// Interfaccia generale
// ---------------------------------------------------------------------------
let interfacciaPronta = false;
function collegaInterfaccia() {
  if (interfacciaPronta) return; interfacciaPronta = true;
  $("#btn-menu").addEventListener("click", () => apriLato(!document.body.classList.contains("lato-aperto")));
  $("#btn-nuova").addEventListener("click", () => dialogoNuova());
  $("#btn-oggi").addEventListener("click", notaDelGiorno);
  const menu = $("#menu-altro"), altro = $("#btn-altro");
  altro.addEventListener("click", e => { e.stopPropagation(); menu.hidden = !menu.hidden; altro.setAttribute("aria-expanded", String(!menu.hidden)); });
  document.addEventListener("click", () => { menu.hidden = true; altro.setAttribute("aria-expanded", "false"); });
  $("#m-aggiorna").addEventListener("click", async () => { await S.gh.carica(); S.nomi = u.buildNameIndex(S.gh.albero.keys()); S.ultimoGrafoSha = null; await caricaGrafo(); disegnaAlbero(); instrada(); avviso("Ricaricato dalla repo."); });
  $("#m-servizio").addEventListener("click", e => { S.servizio = !S.servizio; e.target.textContent = S.servizio ? "Nascondi i file di servizio" : "Mostra i file di servizio"; disegnaAlbero(); });
  $("#m-esci").addEventListener("click", esci);
  $("#filtro").addEventListener("input", disegnaAlbero);
  $("#contenuto").addEventListener("pointerdown", () => { if (document.body.classList.contains("lato-aperto")) apriLato(false); });
  $("#albero").addEventListener("click", e => {
    const c = e.target.closest("[data-cartella]");
    if (c) { const p = c.dataset.cartella; S.aperte.has(p) ? S.aperte.delete(p) : S.aperte.add(p); disegnaAlbero(); return; }
    if (e.target.closest("a")) apriLato(false);
  });
  impostaRicerca();
  document.addEventListener("keydown", scorciatoie);
  window.addEventListener("beforeunload", e => { if (S.sporco) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("pagehide", () => { for (const x of S.urls) URL.revokeObjectURL(x); });
}

function apriLato(si) {
  document.body.classList.toggle("lato-aperto", si);
  $("#btn-menu").setAttribute("aria-expanded", String(si));
}

function scorciatoie(e) {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || t.closest("input, textarea, select, [contenteditable], dialog")) return;
  if (e.key === "/") { e.preventDefault(); $("#cerca").focus(); }
  else if (e.key === "n") { e.preventDefault(); dialogoNuova(); }
  else if (e.key === "o") { e.preventDefault(); notaDelGiorno(); }
  else if (e.key === "g") { e.preventDefault(); location.hash = "#/g"; }
  else if (e.key === "e" && S.percorso && S.percorso.vista === "nota" && S.percorso.repo === hubNome()) { e.preventDefault(); location.hash = rotta("e", S.percorso.path); }
}

async function esci() {
  if (S.sporco && !(await chiedi("Hai modifiche non salvate", "<p>Se esci ora le perdi.</p>", [["esci", "Esci comunque", "pericolo"], ["", "Resta"]]))) return;
  mem.pulisci();
  try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { /* */ }
  S.sporco = false;
  location.hash = ""; location.reload();
}

let timerAvviso = null;
function avviso(testo, ms = 4000, tipo = "") {
  const a = $("#avviso");
  a.textContent = testo; a.className = "avviso-toast " + tipo; a.hidden = false;
  clearTimeout(timerAvviso); timerAvviso = setTimeout(() => { a.hidden = true; }, ms);
}

/** Dialogo modale. bottoni: [[valore, etichetta, classe]]. Ritorna il valore scelto ("" = annulla). */
function chiedi(titolo, html, bottoni, prepara) {
  const d = $("#dialogo");
  d.innerHTML = `<form method="dialog" class="dialogo-form"><h2>${esc(titolo)}</h2><div class="dialogo-corpo">${html}</div><div class="dialogo-bottoni">${bottoni.map(([v, l, c]) => `<button value="${esc(v)}" class="btn ${c || ""}">${esc(l)}</button>`).join("")}</div></form>`;
  return new Promise(ok => {
    const form = d.querySelector("form");
    if (prepara) prepara(form);
    d.addEventListener("close", function chiuso() { d.removeEventListener("close", chiuso); ok(d.returnValue); }, { once: true });
    d.returnValue = "";
    d.showModal();
    const primo = form.querySelector("input, select, textarea") || form.querySelector(".primario") || form.querySelector("button");
    if (primo) primo.focus();
  });
}

// ---------------------------------------------------------------------------
// Rotte
// ---------------------------------------------------------------------------
const cod = p => p.split("/").map(encodeURIComponent).join("/");
function rotta(tipo, path, extra = "") {
  return `#/${tipo}/${cod(path)}${extra}`;
}
function rottaFile(repo, path, ancora) {
  const h = ancora ? `?h=${encodeURIComponent(ancora)}` : "";
  return repo === hubNome() ? rotta("n", path, h) : `#/r/${encodeURIComponent(repo)}/${cod(path)}${h}`;
}
function rottaNodo(n) {
  if (n.t === "concetto") return "#/c/" + encodeURIComponent(n.id.replace(/^c:/, ""));
  if (n.t === "repo") return n.r === hubNome() ? "#/" : `#/r/${encodeURIComponent(n.r)}/README.md`;
  const m = /^doc:([^/]+)\/(.+)$/.exec(n.id);
  return m ? rottaFile(m[1], m[2]) : "#/";
}

async function instrada() {
  if (S.ignoraHash) { S.ignoraHash = false; return; }
  const h = location.hash || "#/";
  // modifiche non salvate?
  if (S.sporco && S.uscita && h !== S.uscita) {
    const verso = h;
    S.ignoraHash = true; location.hash = S.uscita;
    const scelta = await chiedi("Modifiche non salvate", "<p>Vuoi salvarle prima di uscire?</p>", [["salva", "Salva", "primario"], ["scarta", "Scarta", "pericolo"], ["", "Resta qui"]]);
    if (scelta === "salva") { const ok = await S.salva(); if (!ok) return; }
    else if (scelta !== "scarta") return;
    S.sporco = false; S.uscita = null;
    location.hash = verso; return;
  }
  S.giro++;
  pulisciVista();
  $("#cerca-esiti").hidden = true;
  apriLato(false);
  const [percorso, query = ""] = h.slice(1).split("?");
  const qs = new URLSearchParams(query);
  const parti = percorso.split("/").filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch { return x; } });
  const [tipo, ...resto] = parti;
  try {
    if (!tipo) return await vistaFile(hubNome(), casa());
    if (tipo === "n") return await vistaFile(hubNome(), resto.join("/"), qs.get("h"));
    if (tipo === "r") return await vistaFile(resto[0], resto.slice(1).join("/"), qs.get("h"));
    if (tipo === "e") return await vistaModifica(resto.join("/"));
    if (tipo === "c") return vistaConcetto(resto.join("/"));
    if (tipo === "g") return vistaGrafo(qs.get("q") || "");
    if (tipo === "s") return vistaRicerca(resto.join("/"));
    if (tipo === "nuova") { location.replace("#/"); return dialogoNuova(qs.get("titolo") || "", qs.get("cartella") || ""); }
    vistaErrore("Pagina non trovata.");
  } catch (e) { if (e instanceof Superata) return; console.error(e); vistaErrore(e.message || String(e)); }
}

function casa() {
  for (const p of ["inizia-qui.md", "README.md"]) if (S.gh.albero.has(p)) return p;
  return [...S.gh.albero.keys()].find(p => p.endsWith(".md")) || "";
}

function pulisciVista() {
  for (const x of S.urls) URL.revokeObjectURL(x);
  S.urls = [];
  if (S.grafoVista) { S.grafoVista.distruggi(); S.grafoVista = null; }
  if (S.grafoLocale) { S.grafoLocale.distruggi(); S.grafoLocale = null; }
  S.editor = null; S.uscita = null; S.sporco = false; S.salva = null;
  document.body.classList.remove("in-modifica", "in-grafo");
}

function pagina(html, cls = "") {
  const m = $("#contenuto");
  m.className = "contenuto " + cls;
  m.innerHTML = html;
  m.scrollTop = 0; window.scrollTo(0, 0);
  return m;
}
function vistaErrore(msg) {
  pagina(`<div class="vuoto"><h1>Qualcosa non va</h1><p>${esc(msg)}</p><p><a class="btn" href="#/">Torna all'inizio</a></p></div>`);
}

// ---------------------------------------------------------------------------
// Elenco dei file
// ---------------------------------------------------------------------------
function disegnaAlbero() {
  const gh = S.gh;
  const q = u.normalizza($("#filtro").value.trim());
  const tutti = [...gh.albero.keys()].filter(p => S.servizio || !u.isServizio(p)).sort((a, b) => a.localeCompare(b, "it"));
  const corrente = S.percorso && S.percorso.repo === hubNome() ? S.percorso.path : "";
  if (q) {
    const trovati = tutti.filter(p => u.normalizza(p).includes(q)).slice(0, 200);
    $("#albero").innerHTML = trovati.length ? `<ul>${trovati.map(p => voceFile(p, corrente, p)).join("")}</ul>` : `<p class="vuoto-piccolo">Nessun file.</p>`;
    return;
  }
  const radice = { cartelle: new Map(), file: [] };
  for (const p of tutti) {
    const parti = p.split("/"); let n = radice;
    for (let i = 0; i < parti.length - 1; i++) {
      if (!n.cartelle.has(parti[i])) n.cartelle.set(parti[i], { cartelle: new Map(), file: [], path: parti.slice(0, i + 1).join("/") });
      n = n.cartelle.get(parti[i]);
    }
    n.file.push(p);
  }
  if (corrente) { const parti = corrente.split("/"); for (let i = 1; i < parti.length; i++) S.aperte.add(parti.slice(0, i).join("/")); }
  const disegna = n => {
    let h = "<ul>";
    for (const [nome, c] of n.cartelle) {
      const aperta = S.aperte.has(c.path);
      h += `<li class="cartella${aperta ? " aperta" : ""}"><button type="button" data-cartella="${esc(c.path)}" aria-expanded="${aperta}"><span class="freccia" aria-hidden="true">▸</span>${esc(nome)}</button>${aperta ? disegna(c) : ""}</li>`;
    }
    for (const p of n.file) h += voceFile(p, corrente, u.basename(p));
    return h + "</ul>";
  };
  $("#albero").innerHTML = disegna(radice);
}
function voceFile(p, corrente, etichetta) {
  const md = /\.md$/i.test(p);
  return `<li class="file${md ? "" : " non-md"}${p === corrente ? " corrente" : ""}"><a href="${rotta("n", p)}"${p === corrente ? ' aria-current="page"' : ""}>${esc(md ? etichetta.replace(/\.md$/i, "") : etichetta)}</a></li>`;
}

// ---------------------------------------------------------------------------
// Lettura di un file
// ---------------------------------------------------------------------------
async function repoGH(repo) {
  if (repo === hubNome()) return S.gh;
  if (!/^[\w.-]+$/.test(repo)) throw new Error("Repo non valida.");
  if (!S.esterni.has(repo)) {
    const g = new GitHub(S.gh.token, S.gh.owner, repo);
    S.esterni.set(repo, (async () => { await g.info(); await g.carica(); g.nomi = u.buildNameIndex(g.albero.keys()); return g; })());
  }
  try { return await S.esterni.get(repo); }
  catch (e) { S.esterni.delete(repo); throw e; }
}

function contestoMd(gh, path, nomi) {
  const repo = gh.repo;
  return {
    link: href => {
      const r = u.resolveLink(path, href);
      if (r.tipo === "esterno") return { href: r.href, esterno: true };
      if (r.tipo === "ancora") return { href: rottaFile(repo, path, r.hash), esterno: false };
      if (r.tipo !== "interno") return null;
      let dest = r.path;
      if (!gh.albero.has(dest)) {
        if (gh.albero.has(dest + "/README.md")) dest += "/README.md";
        else if (gh.albero.has(dest.replace(/\/$/, "") + ".md")) dest = dest.replace(/\/$/, "") + ".md";
      }
      return { href: rottaFile(repo, dest, r.hash), esterno: false };
    },
    wiki: (target, alias, ancora) => {
      const p = u.resolveWikilink(nomi, target);
      return p ? { href: rottaFile(repo, p, ancora), esiste: true }
        : { href: `#/nuova?titolo=${encodeURIComponent(target)}`, esiste: false };
    },
    img: src => {
      const r = u.resolveLink(path, src);
      if (r.tipo === "esterno") return { src: r.href };
      if (r.tipo === "interno" && gh.albero.has(r.path)) return { path: r.path };
      return null;
    },
  };
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", csv: "text/csv", html: "text/plain", xlsx: "application/octet-stream" };
const est = p => (/\.([a-z0-9]+)$/i.exec(p) || [, ""])[1].toLowerCase();

async function caricaImmagini(radice, gh) {
  for (const img of radice.querySelectorAll("img[data-path]")) {
    try {
      const b = await gh.byte(img.dataset.path);
      const url = URL.createObjectURL(new Blob([b], { type: MIME[est(img.dataset.path)] || "application/octet-stream" }));
      S.urls.push(url); img.src = url;
    } catch { img.alt = "(immagine non disponibile) " + img.alt; }
  }
}

async function vistaFile(repo, path, ancora) {
  path = path.replace(/^\/+/, "");
  const giro = S.giro;
  const gh = await repoGH(repo);
  ancoraValida(giro);
  const esterna = repo !== hubNome();
  S.percorso = { vista: "nota", repo, path };
  disegnaAlbero();
  if (!gh.albero.has(path)) {
    if (!esterna && path && /\.md$/i.test(path))
      return pagina(`<div class="vuoto"><h1>${esc(u.stem(path))}</h1><p>Questa nota non esiste ancora.</p><p><button class="btn primario" id="crea-qui">Creala</button> <a class="btn" href="#/">Torna all'inizio</a></p></div>`)
        .querySelector("#crea-qui").addEventListener("click", () => nuovaNota(path, null, u.stem(path).replace(/-/g, " ")));
    const sotto = [...gh.albero.keys()].filter(p => p.startsWith(path + "/"));
    if (sotto.length) return vistaCartella(gh, path, sotto);
    return vistaErrore(`«${path}» non esiste in ${repo}.`);
  }
  const tipo = est(path);
  const solaLettura = esterna || u.isReadOnly(path) || !gh.puoScrivere;
  const briciole = path.split("/").slice(0, -1).map((p, i, a) => `<a href="${esterna ? `#/r/${encodeURIComponent(repo)}/${cod(a.slice(0, i + 1).join("/"))}` : rotta("n", a.slice(0, i + 1).join("/"))}">${esc(p)}</a>`).join(" / ");
  const testaAzioni = `
    ${!solaLettura && tipo === "md" ? `<a class="btn primario" href="${rotta("e", path)}" title="Modifica (e)">Modifica</a>` : ""}
    <a class="btn" href="${esc(gh.urlWeb(path))}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
    ${!solaLettura ? `<button class="icona" id="btn-file" aria-label="Altre azioni" aria-haspopup="menu">⋯</button>
      <div class="menu" id="menu-file" role="menu" hidden>
        <button role="menuitem" data-f="sposta">Sposta o rinomina</button>
        ${u.archivePath(path) ? `<button role="menuitem" data-f="archivia">Archivia</button>` : ""}
        ${tipo === "md" ? `<button role="menuitem" data-f="wiki">Copia il [[collegamento]]</button>` : ""}
      </div>` : ""}`;

  if (tipo !== "md") return vistaAllegato(gh, path, tipo, briciole, testaAzioni, esterna);

  const { testo, sha } = await gh.testo(path);
  ancoraValida(giro);
  const fm = u.splitFrontmatter(testo);
  const nomi = esterna ? gh.nomi : S.nomi;
  const { html, titoli } = renderMarkdown(fm.body, { ...contestoMd(gh, path, nomi), offset: fm.righe });
  const meta = [];
  if (esterna) meta.push(`<span class="chip chip-repo">${esc(repo)} · sola lettura</span>`);
  if (fm.data.tipo) meta.push(`<span class="chip">${esc(fm.data.tipo)}</span>`);
  if (fm.data.stato) meta.push(`<span class="chip chip-stato">${esc(fm.data.stato)}</span>`);
  const tags = [].concat(fm.data.tags || fm.data.tag || []).filter(Boolean);
  for (const t of tags) meta.push(`<a class="chip chip-tag" href="#/c/${encodeURIComponent(u.slug(t))}">#${esc(t)}</a>`);
  if (fm.data.creato) meta.push(`<span class="chip chip-data" title="Creato">${esc(fm.data.creato)}</span>`);
  if (u.isReadOnly(path) && !esterna) meta.push(`<span class="chip">generato dal grafo · sola lettura</span>`);
  const indiceTitoli = titoli.filter(t => t.livello > 1 && t.livello < 4);

  const m = pagina(`
    <div class="nota-griglia">
      <article class="nota">
        <header class="nota-testa">
          <div class="briciole">${briciole || "&nbsp;"}</div>
          <div class="nota-azioni">${testaAzioni}</div>
        </header>
        ${meta.length ? `<div class="meta">${meta.join("")}</div>` : ""}
        <div class="testo-nota">${html || '<p class="vuoto-piccolo">Nota vuota.</p>'}</div>
        <footer class="nota-piede" id="nota-piede"></footer>
      </article>
      <aside class="pannello" id="pannello" aria-label="Collegamenti">
        ${indiceTitoli.length > 2 ? `<section class="blocco"><h2>In questa nota</h2><ul class="toc">${indiceTitoli.map(t => `<li class="l${t.livello}"><a href="${rottaFile(repo, path, t.id)}">${esc(t.testo)}</a></li>`).join("")}</ul></section>` : ""}
        <div id="collegamenti"></div>
      </aside>
    </div>`, "vista-nota");

  caricaImmagini(m, gh);
  if (ancora) { const el = document.getElementById("h-" + ancora); if (el) el.scrollIntoView(); }
  pannelloCollegamenti(repo, path);
  gh.ultimoCommit(path).then(c => {
    if (c && $("#nota-piede")) $("#nota-piede").innerHTML = `Ultima modifica: ${esc(new Date(c.data).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" }))} · ${esc(c.autore)} · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.messaggio)}</a>`;
  }).catch(() => {});

  // attività spuntabili
  if (!solaLettura) {
    m.querySelectorAll("input.attivita").forEach(cb => { cb.disabled = false; });
    // sull'articolo, che rinasce a ogni pagina (il contenitore principale invece resta: lì i gestori si accumulerebbero)
    m.querySelector("article.nota").addEventListener("change", async e => {
      const cb = e.target.closest("input.attivita"); if (!cb) return;
      const nuovo = u.toggleTask(testo, +cb.dataset.riga);
      if (nuovo === null) return;
      cb.disabled = true;
      try {
        await gh.commit([{ path, testo: nuovo, atteso: sha }], `note: ${cb.checked ? "fatto" : "riaperto"} un'attività in ${u.stem(path)}`);
        avviso(cb.checked ? "Attività fatta." : "Attività riaperta.");
        instrada();
      } catch (err) { cb.checked = !cb.checked; cb.disabled = false; gestisciErrore(err); }
    });
  } else m.querySelectorAll("input.attivita").forEach(cb => { cb.disabled = true; });

  menuFile(gh, path, sha);
}

function menuFile(gh, path, sha) {
  const b = $("#btn-file"), menu = $("#menu-file");
  if (!b) return;
  b.addEventListener("click", e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  const chiudi = () => { if (!menu.isConnected) document.removeEventListener("click", chiudi); else menu.hidden = true; };
  document.addEventListener("click", chiudi);
  menu.addEventListener("click", async e => {
    const a = e.target.closest("[data-f]"); if (!a) return;
    if (a.dataset.f === "wiki") {
      const t = `[[${u.stem(path)}]]`;
      try { await navigator.clipboard.writeText(t); avviso(`Copiato ${t}`); } catch { avviso(t, 6000); }
    }
    if (a.dataset.f === "archivia") sposta(gh, path, sha, u.archivePath(path), true);
    if (a.dataset.f === "sposta") sposta(gh, path, sha, path, false);
  });
}

async function sposta(gh, path, sha, proposta, archivia) {
  let dest = proposta;
  const scelta = await chiedi(archivia ? "Archivia" : "Sposta o rinomina",
    `<p>${archivia ? "Nel second brain non si cancella: la nota va in <code>40-archivio/</code>." : "Scegli il nuovo percorso."}</p>
     <label>Nuovo percorso <input name="dest" value="${esc(proposta)}" spellcheck="false" required></label>
     <p class="nota-piccola">I [[wikilink]] continuano a funzionare finché il nome del file resta uguale. I link con il percorso, invece, vanno aggiornati.</p>`,
    [["ok", archivia ? "Archivia" : "Sposta", "primario"], ["", "Annulla"]],
    form => form.dest.addEventListener("input", () => { dest = form.dest.value.trim(); }));
  if (scelta !== "ok") return;
  dest = u.normalizePath(dest || "");
  if (!dest || dest === path) return;
  if (gh.albero.has(dest)) return avviso("Esiste già un file con quel percorso.", 5000, "errore");
  try {
    await gh.commit([{ path: dest, blobSha: sha, atteso: null }, { path, elimina: true, atteso: sha }], `note: ${archivia ? "archivia" : "sposta"} ${path} → ${dest}`);
    S.nomi = u.buildNameIndex(gh.albero.keys());
    avviso(archivia ? "Archiviata." : "Spostata.");
    osservaGrafo();
    location.hash = rotta("n", dest);
  } catch (e) { gestisciErrore(e); }
}

async function vistaAllegato(gh, path, tipo, briciole, azioni, esterna) {
  const m = pagina(`<article class="nota"><header class="nota-testa"><div class="briciole">${briciole || "&nbsp;"}</div><div class="nota-azioni">${azioni}</div></header>
    <h1 class="titolo-file">${esc(u.basename(path))}</h1><div id="anteprima-file"><p class="vuoto-piccolo">Carico…</p></div></article>`, "vista-nota");
  const box = m.querySelector("#anteprima-file");
  const b = await gh.byte(path);
  if (!box.isConnected) return;
  const blob = new Blob([b], { type: MIME[tipo] || "application/octet-stream" });
  const url = URL.createObjectURL(blob); S.urls.push(url);
  const scarica = `<p><a class="btn" href="${url}" download="${esc(u.basename(path))}">Scarica (${(b.length / 1024).toFixed(1)} kB)</a></p>`;
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(tipo)) box.innerHTML = `<img class="immagine-file" src="${url}" alt="${esc(u.basename(path))}">${scarica}`;
  else if (tipo === "csv") box.innerHTML = tabellaCsv(new TextDecoder().decode(b)) + scarica;
  else if (["txt", "json", "yml", "yaml", "py", "js", "css", "html", "toml", "sh"].includes(tipo)) box.innerHTML = `<pre class="codice-file"><code>${esc(new TextDecoder().decode(b))}</code></pre>${scarica}`;
  else box.innerHTML = `<p>Anteprima non disponibile per i file .${esc(tipo)}.</p>${scarica}`;
  menuFile(gh, path, gh.albero.get(path).sha);
  if (!esterna) pannelloCollegamenti(gh.repo, path);
}

function tabellaCsv(t) {
  t = t.replace(/^\ufeff/, "");
  const sep = (t.split("\n")[0].match(/;/g) || []).length >= (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const righe = []; let r = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { r.push(c); c = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; r.push(c); righe.push(r); r = []; c = ""; }
    else c += ch;
  }
  if (c || r.length) { r.push(c); righe.push(r); }
  if (!righe.length) return "<p>File vuoto.</p>";
  const [testa, ...corpo] = righe;
  return `<div class="tabella"><table><thead><tr>${testa.map(x => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${corpo.slice(0, 2000).map(rr => `<tr>${testa.map((_, k) => `<td>${esc(rr[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function vistaCartella(gh, path, sotto) {
  const esterna = gh.repo !== hubNome();
  const diretti = new Set();
  for (const p of sotto) { const resto = p.slice(path.length + 1); diretti.add(resto.includes("/") ? resto.split("/")[0] + "/" : resto); }
  const voci = [...diretti].sort((a, b) => (b.endsWith("/") - a.endsWith("/")) || a.localeCompare(b, "it"));
  pagina(`<article class="nota"><h1>${esc(u.basename(path))}/</h1><ul class="elenco-cartella">${voci.map(v => `<li><a href="${rottaFile(gh.repo, path + "/" + v.replace(/\/$/, ""))}">${v.endsWith("/") ? "📁 " : ""}${esc(v)}</a></li>`).join("")}</ul>
    ${!esterna && gh.puoScrivere ? `<p><button class="btn" id="nuova-qui">Nuova nota in questa cartella</button></p>` : ""}</article>`, "vista-nota");
  const b = $("#nuova-qui"); if (b) b.addEventListener("click", () => dialogoNuova("", path));
}

// ---------------------------------------------------------------------------
// Collegamenti (dal grafo)
// ---------------------------------------------------------------------------
function pannelloCollegamenti(repo, path) {
  const box = $("#collegamenti"); if (!box) return;
  const g = S.grafo;
  if (!g) { box.innerHTML = `<section class="blocco"><h2>Collegamenti</h2><p class="vuoto-piccolo">Il grafo non è ancora disponibile.</p></section>`; document.addEventListener("grafo-pronto", () => pannelloCollegamenti(repo, path), { once: true }); return; }
  const i = g.perId.get(`doc:${repo}/${path}`);
  if (i === undefined) { box.innerHTML = `<section class="blocco"><h2>Collegamenti</h2><p class="vuoto-piccolo">Questa nota entrerà nel grafo al prossimo aggiornamento automatico (circa un minuto dopo il salvataggio).</p></section>`; return; }
  const entrano = [], escono = [], concetti = [];
  for (const [a, b, tipo] of g.adiacenti[i]) {
    const altro = a === i ? b : a, n = g.nodi[altro];
    if (tipo === "contiene" || tipo === "repo") continue;
    if (n.t === "concetto") { if (!concetti.includes(altro)) concetti.push(altro); continue; }
    if (b === i && !entrano.includes(altro)) entrano.push(altro);
    if (a === i && !escono.includes(altro)) escono.push(altro);
  }
  const voce = k => { const n = g.nodi[k]; return `<li><a href="${rottaNodo(n)}" title="${esc(n.s || "")}">${esc(n.l)}</a>${n.r && n.r !== repo && n.t !== "concetto" ? ` <span class="repo-mini">${esc(n.r)}</span>` : ""}</li>`; };
  const ordina = arr => arr.sort((x, y) => g.nodi[x].l.localeCompare(g.nodi[y].l, "it"));
  box.innerHTML = `
    <section class="blocco"><h2>Grafo locale</h2><canvas class="grafo-locale" id="grafo-locale" aria-label="Grafo dei collegamenti di questa nota"></canvas></section>
    ${entrano.length ? `<section class="blocco"><h2>Ci rimandano (${entrano.length})</h2><ul>${ordina(entrano).map(voce).join("")}</ul></section>` : ""}
    ${escono.length ? `<section class="blocco"><h2>Rimanda a (${escono.length})</h2><ul>${ordina(escono).map(voce).join("")}</ul></section>` : ""}
    ${concetti.length ? `<section class="blocco"><h2>Concetti</h2><div class="nuvola">${ordina(concetti).map(k => `<a class="chip chip-concetto cat-${esc(g.nodi[k].c || "")}" href="${rottaNodo(g.nodi[k])}">${esc(g.nodi[k].l)}</a>`).join("")}</div></section>` : ""}
    ${!entrano.length && !escono.length && !concetti.length ? `<section class="blocco"><p class="vuoto-piccolo">Nessun collegamento: aggiungi un [[wikilink]] o un tag.</p></section>` : ""}`;
  const sel = new Set([i, ...entrano, ...escono, ...concetti]);
  disegnaGrafoLocale($("#grafo-locale"), sel, g.nodi[i].id);
}

function disegnaGrafoLocale(tela, insieme, evidenzia) {
  const g = S.grafo, idx = [...insieme], mappa = new Map(idx.map((k, j) => [k, j]));
  const archi = g.archi.filter(a => mappa.has(a[0]) && mappa.has(a[1]) && a[2] !== "contiene").map(a => [mappa.get(a[0]), mappa.get(a[1]), a[2], a[3]]);
  if (S.grafoLocale) S.grafoLocale.distruggi();
  S.grafoLocale = creaGrafo(tela, { nodi: idx.map(k => g.nodi[k]), archi }, { compatto: true, evidenzia, onApri: n => { location.hash = rottaNodo(n); }, onSeleziona: n => { if (n && n.id !== evidenzia) location.hash = rottaNodo(n); } });
}

function vistaConcetto(id) {
  const g = S.grafo;
  if (!g) { pagina(`<p class="vuoto-piccolo">Carico il grafo…</p>`); document.addEventListener("grafo-pronto", () => vistaConcetto(id), { once: true }); return; }
  const i = g.perId.get("c:" + id);
  if (i === undefined) return vistaErrore(`Il concetto «${id}» non è (ancora) nel grafo.`);
  const n = g.nodi[i];
  S.percorso = { vista: "concetto", id };
  const perRepo = new Map(), affini = [];
  for (const [a, b] of g.adiacenti[i]) {
    const k = a === i ? b : a, o = g.nodi[k];
    if (o.t === "concetto") { if (!affini.includes(k)) affini.push(k); continue; }
    if (o.t === "repo") continue;
    if (!perRepo.has(o.r)) perRepo.set(o.r, new Set());
    perRepo.get(o.r).add(k);
  }
  const cat = { idea: "Idea", normativa: "Normativa", sicurezza: "Sicurezza", strumento: "Strumento", metodo: "Metodo", organizzazione: "Organizzazione", tag: "Tag" }[n.c] || n.c || "Concetto";
  const totale = [...perRepo.values()].reduce((s, x) => s + x.size, 0);
  pagina(`<div class="nota-griglia"><article class="nota">
      <div class="meta"><span class="chip chip-concetto cat-${esc(n.c || "")}">${esc(cat)}</span><span class="chip">${totale} file</span></div>
      <h1>${esc(n.l)}</h1>
      ${n.s ? `<p class="lead">${esc(n.s)}</p>` : ""}
      ${[...perRepo].map(([r, set]) => `<h2>${esc(r)} <span class="conteggio">${set.size}</span></h2><ul class="elenco-file">${[...set].sort((x, y) => g.nodi[x].l.localeCompare(g.nodi[y].l, "it")).map(k => `<li><a href="${rottaNodo(g.nodi[k])}">${esc(g.nodi[k].l)}</a>${g.nodi[k].s ? `<p>${esc(g.nodi[k].s)}</p>` : ""}</li>`).join("")}</ul>`).join("")}
    </article>
    <aside class="pannello"><section class="blocco"><h2>Grafo locale</h2><canvas class="grafo-locale" id="grafo-locale"></canvas></section>
      ${affini.length ? `<section class="blocco"><h2>Concetti vicini</h2><div class="nuvola">${affini.map(k => `<a class="chip chip-concetto cat-${esc(g.nodi[k].c || "")}" href="${rottaNodo(g.nodi[k])}">${esc(g.nodi[k].l)}</a>`).join("")}</div></section>` : ""}
    </aside></div>`, "vista-nota");
  const insieme = new Set([i]); for (const s of perRepo.values()) for (const k of s) insieme.add(k);
  for (const k of affini) insieme.add(k);
  disegnaGrafoLocale($("#grafo-locale"), insieme, n.id);
}

// ---------------------------------------------------------------------------
// Grafo completo
// ---------------------------------------------------------------------------
function vistaGrafo(q) {
  S.percorso = { vista: "grafo" };
  document.body.classList.add("in-grafo");
  const g = S.grafo;
  if (!g) { pagina(`<p class="vuoto-piccolo">Carico il grafo…</p>`); document.addEventListener("grafo-pronto", () => { if (location.hash.startsWith("#/g")) vistaGrafo(q); }, { once: true }); return; }
  const repos = [...new Set(g.nodi.filter(n => n.t === "repo").map(n => n.r))];
  const m = pagina(`
    <div class="grafo-pieno">
      <div class="grafo-barra">
        <input id="g-cerca" type="search" placeholder="Evidenzia…" value="${esc(q)}" aria-label="Evidenzia nel grafo">
        <label><input type="checkbox" data-tipo="nota" checked> <span class="pallino p-nota"></span>Note</label>
        <label><input type="checkbox" data-tipo="documento" checked> <span class="pallino p-doc"></span>Documenti</label>
        <label><input type="checkbox" data-tipo="concetto" checked> <span class="pallino rombo p-concetto"></span>Concetti</label>
        <label><input type="checkbox" id="g-menzioni" checked> Menzioni</label>
        <select id="g-repo" aria-label="Repo"><option value="">Tutte le repo</option>${repos.map(r => `<option>${esc(r)}</option>`).join("")}</select>
        <button class="btn" id="g-centra">Centra</button>
      </div>
      <canvas id="g-tela" class="grafo-tela" aria-label="Grafo delle note, dei documenti e dei concetti"></canvas>
      <div class="grafo-scheda" id="g-scheda" hidden></div>
      <p class="grafo-aiuto">Trascina per muoverti · rotella o pizzico per lo zoom · un tocco seleziona, il secondo apre</p>
    </div>`, "vista-grafo");
  const scheda = m.querySelector("#g-scheda");
  const gv = creaGrafo(m.querySelector("#g-tela"), g, {
    onSeleziona: n => {
      if (!n) { scheda.hidden = true; return; }
      scheda.hidden = false;
      scheda.innerHTML = `<p class="chip">${esc(n.t)}${n.r ? " · " + esc(n.r) : ""}</p><h2>${esc(n.l)}</h2>${n.s ? `<p>${esc(n.s)}</p>` : ""}<p><a class="btn primario" href="${rottaNodo(n)}">Apri</a></p>`;
    },
    onApri: n => { location.hash = rottaNodo(n); },
  });
  S.grafoVista = gv;
  const tipi = new Set(["nota", "documento", "concetto", "repo"]);
  m.querySelectorAll("[data-tipo]").forEach(c => c.addEventListener("change", () => { c.checked ? tipi.add(c.dataset.tipo) : tipi.delete(c.dataset.tipo); gv.filtra({ tipi }); }));
  m.querySelector("#g-menzioni").addEventListener("change", e => gv.filtra({ menzioni: e.target.checked }));
  m.querySelector("#g-repo").addEventListener("change", e => { gv.filtra({ repo: e.target.value }); gv.adatta(); });
  m.querySelector("#g-centra").addEventListener("click", () => gv.adatta());
  const gc = m.querySelector("#g-cerca");
  gc.addEventListener("input", () => gv.filtra({ query: gc.value.trim() }));
  gc.addEventListener("keydown", e => { if (e.key === "Enter") { const n = gv.primoTrovato(); if (n) gv.seleziona(n.id); } });
  if (q) gv.filtra({ query: q });
}

// ---------------------------------------------------------------------------
// Ricerca
// ---------------------------------------------------------------------------
function cercaIndice(q, max = 40) {
  const parole = u.normalizza(q).split(/\s+/).filter(Boolean);
  if (!parole.length) return [];
  const voci = S.indice.length ? S.indice : [...S.gh.albero.keys()].filter(p => p.endsWith(".md")).map(p => ({ k: "file", r: hubNome(), p, t: u.stem(p), s: "", q: { t: u.normalizza(u.stem(p)), p: u.normalizza(p), c: "", s: "" } }));
  return voci.map(v => ({ v, p: u.punteggio(v.q, parole) + (v.k === "file" && v.r === hubNome() ? .5 : 0) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p).slice(0, max).map(x => x.v);
}
const rottaVoce = v => v.k === "concetto" ? "#/c/" + encodeURIComponent(v.id) : rottaFile(v.r, v.p);

function impostaRicerca() {
  const ing = $("#cerca"), box = $("#cerca-esiti");
  let voci = [], att = -1;
  const mostra = () => {
    const q = ing.value.trim();
    voci = q ? cercaIndice(q, 8) : [];
    att = -1;
    box.innerHTML = voci.map((v, i) => `<a role="option" href="${rottaVoce(v)}" data-i="${i}"><span class="tipo-mini">${v.k === "concetto" ? "concetto" : esc(v.r)}</span><b>${esc(v.t)}</b>${v.s ? `<small>${esc(v.s.slice(0, 110))}</small>` : ""}</a>`).join("")
      + (q ? `<a role="option" href="#/s/${encodeURIComponent(q)}" class="tutti">Tutti i risultati per «${esc(q)}» ↵</a>` : "");
    box.hidden = !q;
  };
  ing.addEventListener("input", mostra);
  ing.addEventListener("focus", () => { if (ing.value.trim()) mostra(); });
  ing.addEventListener("blur", () => setTimeout(() => { box.hidden = true; box.innerHTML = ""; }, 200));
  ing.addEventListener("keydown", e => {
    const el = [...box.querySelectorAll("a")];
    if (e.key === "ArrowDown") { e.preventDefault(); att = Math.min(el.length - 1, att + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); att = Math.max(-1, att - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const a = el[att] || el[el.length - 1]; if (a) { location.hash = a.getAttribute("href"); box.hidden = true; ing.blur(); } return; }
    else if (e.key === "Escape") { box.hidden = true; ing.blur(); return; }
    else return;
    el.forEach((a, i) => a.setAttribute("aria-selected", String(i === att)));
  });
  box.addEventListener("click", () => { box.hidden = true; ing.blur(); apriLato(false); });
}

function vistaRicerca(q) {
  S.percorso = { vista: "ricerca" };
  const ris = cercaIndice(q, 80);
  const m = pagina(`<article class="nota"><h1>Risultati per «${esc(q)}»</h1>
    ${ris.length ? `<ul class="elenco-file">${ris.map(v => `<li><a href="${rottaVoce(v)}">${esc(v.t)}</a> <span class="repo-mini">${v.k === "concetto" ? "concetto" : esc(v.r)}</span>${v.s ? `<p>${esc(v.s)}</p>` : ""}</li>`).join("")}</ul>` : `<p>Nessun titolo, sintesi o concetto contiene queste parole.</p>`}
    <section class="blocco-ricerca"><h2>Nel testo delle note</h2><p><button class="btn" id="cerca-testo">Cerca «${esc(q)}» dentro i file</button></p><div id="esiti-testo"></div></section>
    <p><a class="btn" href="#/g?q=${encodeURIComponent(q)}">Mostra nel grafo</a></p></article>`, "vista-nota");
  m.querySelector("#cerca-testo").addEventListener("click", async e => {
    e.target.disabled = true; e.target.textContent = "Cerco…";
    const box = m.querySelector("#esiti-testo");
    try {
      const r = await S.gh.cercaTesto(q);
      box.innerHTML = r.length ? `<ul class="elenco-file">${r.map(x => `<li><a href="${rotta("n", x.path)}">${esc(x.path)}</a>${x.frammenti.slice(0, 2).map(f => `<p class="frammento">…${esc(f)}…</p>`).join("")}</li>`).join("")}</ul>` : "<p>Nessun file contiene questo testo (la ricerca di GitHub indicizza le modifiche con qualche minuto di ritardo).</p>";
    } catch (err) { box.innerHTML = `<p class="errore">${esc(err.message)}</p>`; }
    e.target.remove();
  });
}

// ---------------------------------------------------------------------------
// Modifica
// ---------------------------------------------------------------------------
const chiaveBozza = path => `sb:bozza:${S.gh.owner}/${S.gh.repo}:${path}`;

async function vistaModifica(path) {
  const gh = S.gh;
  if (!gh.puoScrivere) return vistaErrore("Il token può solo leggere: crea un token con Contents «Read and write».");
  if (u.isReadOnly(path)) return vistaErrore("Questo file è generato automaticamente e non si modifica a mano.");
  let originale = "", sha = null;
  const nuova = !gh.albero.has(path);
  if (nuova) {
    if (!S.nuove.has(path)) {
      const b = mem.get(chiaveBozza(path));
      if (!b) { location.replace(rotta("n", path)); return; }
      S.nuove.set(path, "");
    }
    originale = S.nuove.get(path);
  } else {
    const giro = S.giro;
    ({ testo: originale, sha } = await gh.testo(path));
    ancoraValida(giro);
  }
  S.percorso = { vista: "modifica", repo: hubNome(), path };
  disegnaAlbero();
  document.body.classList.add("in-modifica");
  const titolo = u.splitFrontmatter(originale).data.titolo || u.stem(path);
  const m = pagina(`
    <div class="modifica">
      <header class="modifica-testa">
        <div><div class="briciole">${esc(path)}${nuova ? ' · <b>nuova</b>' : ""}</div><h1>${esc(titolo)}</h1></div>
        <div class="modifica-azioni">
          <input id="msg-commit" class="msg-commit" value="${esc(`note: ${nuova ? "crea" : "aggiorna"} ${u.stem(path)}`)}" aria-label="Descrizione della modifica (messaggio di commit)" spellcheck="false">
          <a class="btn" id="btn-annulla" href="${nuova ? "#/" : rotta("n", path)}">Annulla</a>
          <button class="btn primario" id="btn-salva" title="Salva (Ctrl+S)">Salva</button>
        </div>
      </header>
      <div id="bozza-avviso"></div>
      <div class="editor" id="editor"></div>
    </div>`, "vista-modifica");

  let base = { testo: originale, sha };
  const ed = creaEditor(m.querySelector("#editor"), {
    testo: originale,
    nomi: () => [...S.nomi.entries()].map(([nome, p]) => ({ nome: u.stem(p), titolo: p })),
    anteprima: t => { const f = u.splitFrontmatter(t); return renderMarkdown(f.body, { ...contestoMd(gh, path, S.nomi), offset: f.righe }).html; },
    onCambio: t => {
      S.sporco = t !== base.testo;
      clearTimeout(timerBozza);
      timerBozza = setTimeout(() => {
        if (S.sporco) mem.set(chiaveBozza(path), JSON.stringify({ testo: t, base: base.sha, quando: Date.now() }), ricorda());
        else mem.del(chiaveBozza(path));
      }, 600);
    },
    onSalva: () => salva(),
    onAllega: f => allega(f, path),
  });
  let timerBozza = null;
  S.editor = ed; S.uscita = location.hash;
  if (nuova) S.sporco = true;

  // bozza salvata in precedenza?
  try {
    const b = JSON.parse(mem.get(chiaveBozza(path)) || "null");
    if (b && b.testo !== originale) {
      const quando = new Date(b.quando).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
      const box = m.querySelector("#bozza-avviso");
      box.innerHTML = `<div class="banner">C'è una bozza non salvata del ${esc(quando)}${b.base !== sha ? " (nel frattempo il file è cambiato su GitHub)" : ""}. <button class="btn" data-b="ripristina">Ripristina</button> <button class="btn" data-b="scarta">Scarta</button></div>`;
      box.addEventListener("click", e => {
        const a = e.target.closest("[data-b]"); if (!a) return;
        if (a.dataset.b === "ripristina") ed.testo = b.testo; else mem.del(chiaveBozza(path));
        box.innerHTML = "";
      });
    }
  } catch { /* bozza illeggibile: ignorata */ }

  let salvando = false;
  async function salva() {
    const btn = $("#btn-salva"); if (!btn || salvando) return false;
    salvando = true; btn.disabled = true; btn.textContent = "Salvo…";
    try { return await esegui(base.sha); }
    finally { salvando = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = "Salva"; } }
  }
  async function esegui(atteso) {
    const msg = ($("#msg-commit").value.trim() || `note: aggiorna ${u.stem(path)}`).slice(0, 200);
    try {
      await gh.commit([{ path, testo: ed.testo, atteso }], msg);
      mem.del(chiaveBozza(path)); S.nuove.delete(path);
      base = { testo: ed.testo, sha: gh.albero.get(path).sha };
      S.sporco = false;
      if (nuova) { S.nomi = u.buildNameIndex(gh.albero.keys()); disegnaAlbero(); }
      avviso("Salvato. Il grafo si aggiorna da solo tra circa un minuto.");
      osservaGrafo();
      location.hash = rotta("n", path);
      return true;
    } catch (e) {
      if (e instanceof Conflitto) return conflitto(e);
      gestisciErrore(e); return false;
    }
  }
  async function conflitto(e) {
    const scelta = await chiedi("Il file è cambiato su GitHub",
      `<p>Qualcuno (o un altro dispositivo) ha salvato «${esc(path)}» dopo che l'hai aperto.</p>
       ${e.remoto ? `<details><summary>Vedi la versione su GitHub</summary><pre class="codice-file"><code>${esc(e.remoto.testo)}</code></pre></details>` : "<p>Il file è stato spostato o eliminato.</p>"}
       <p>Puoi tenere la tua versione (sovrascrive quella su GitHub) oppure ricaricare quella di GitHub: la tua resta nella bozza e puoi ripristinarla.</p>`,
      [["mia", "Tieni la mia", "pericolo"], ["loro", "Carica quella di GitHub"], ["", "Annulla"]]);
    if (scelta === "mia") return esegui(e.remoto ? e.remoto.sha : null);
    if (scelta === "loro") { mem.set(chiaveBozza(path), JSON.stringify({ testo: ed.testo, base: e.remoto && e.remoto.sha, quando: Date.now() }), ricorda()); S.sporco = false; await S.gh.carica(); instrada(); }
    return false;
  }
  S.salva = salva;
  $("#btn-salva").addEventListener("click", () => salva());
  ed.focus();
}

async function allega(file, daNota) {
  if (file.size > 20 * 1024 * 1024) { avviso("File troppo grande (massimo 20 MB).", 5000, "errore"); return null; }
  const e = est(file.name) || "bin";
  const nome = `${u.isoDate()}-${u.slug(file.name.replace(/\.[^.]+$/, ""))}.${e}`;
  const path = `_allegati/${nome}`;
  try {
    avviso("Carico l'allegato…", 20000);
    await S.gh.commit([{ path, byte: new Uint8Array(await file.arrayBuffer()), atteso: null }], `note: allega ${nome}`);
    avviso("Allegato caricato.");
    const rel = u.relativePath(daNota, path).split("/").map(encodeURIComponent).join("/");
    return /^(png|jpe?g|gif|webp|svg)$/.test(e) ? `![${file.name}](${rel})` : `[${file.name}](${rel})`;
  } catch (err) { gestisciErrore(err); return null; }
}

function gestisciErrore(e) {
  console.error(e);
  if (e && e.stato === 401) { avviso(e.message, 8000, "errore"); setTimeout(() => { mem.del("sb:token"); mostraAccesso(e.message); }, 1500); return; }
  avviso((e && e.message) || String(e), 8000, "errore");
}

// ---------------------------------------------------------------------------
// Nuove note
// ---------------------------------------------------------------------------
async function modelli() {
  const tutti = [...S.gh.albero.keys()].filter(p => /^_modelli\/[^/]+\.md$/.test(p));
  return tutti.map(p => ({ path: p, nome: u.stem(p) }));
}

async function dialogoNuova(titolo = "", cartella = "") {
  if (!S.gh.puoScrivere) return avviso("Il token può solo leggere.", 5000, "errore");
  const mods = await modelli();
  const cartelle = [...new Set([...S.gh.albero.keys()].filter(p => !u.isServizio(p) && !p.startsWith("_")).map(u.dirname).filter(Boolean))].sort();
  const dati = {};
  const scelta = await chiedi("Nuova nota", `
    <label>Titolo <input name="titolo" value="${esc(titolo)}" required placeholder="Di cosa parla?"></label>
    <label>Cartella <input name="cartella" list="lista-cartelle" value="${esc(cartella || "00-inbox")}" spellcheck="false"></label>
    <datalist id="lista-cartelle">${cartelle.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <label>Modello <select name="modello">${mods.map(x => `<option value="${esc(x.path)}"${x.nome === "nota" ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}<option value="">vuota</option></select></label>
    <p class="nota-piccola" id="anteprima-percorso"></p>`,
    [["ok", "Crea", "primario"], ["", "Annulla"]],
    form => {
      const agg = () => {
        dati.titolo = form.titolo.value.trim(); dati.cartella = u.normalizePath(form.cartella.value.trim()) || "00-inbox"; dati.modello = form.modello.value;
        form.querySelector("#anteprima-percorso").textContent = `Sarà salvata in ${dati.cartella}/${u.slug(dati.titolo || "nota")}.md`;
      };
      form.addEventListener("input", agg); agg();
    });
  if (scelta !== "ok" || !dati.titolo) return;
  const path = `${dati.cartella}/${u.slug(dati.titolo)}.md`;
  if (S.gh.albero.has(path)) { avviso("Esiste già: la apro.", 3000); location.hash = rotta("n", path); return; }
  await nuovaNota(path, dati.modello, dati.titolo);
}

async function nuovaNota(path, modello, titolo) {
  // modello: percorso di un modello, "" = nota vuota, null = il modello «nota» se esiste
  let tpl = "---\ncreato: {{date:YYYY-MM-DD}}\ntipo: nota\ntags: []\n---\n\n# {{title}}\n\n";
  if (modello === null) modello = S.gh.albero.has("_modelli/nota.md") ? "_modelli/nota.md" : "";
  if (modello) { try { tpl = (await S.gh.testo(modello)).testo; } catch { /* modello di riserva */ } }
  S.nuove.set(path, u.fillTemplate(tpl, { title: titolo, date: u.isoDate() }));
  location.hash = rotta("e", path);
}

async function notaDelGiorno() {
  const oggi = u.isoDate(), path = `01-giornaliere/${oggi}.md`;
  if (S.gh.albero.has(path)) { location.hash = rotta("n", path); return; }
  if (!S.gh.puoScrivere) return avviso("Il token può solo leggere.", 5000, "errore");
  await nuovaNota(path, S.gh.albero.has("_modelli/giornaliera.md") ? "_modelli/giornaliera.md" : "", oggi);
}
