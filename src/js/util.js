// Funzioni pure, senza DOM: testate con `node --test`.

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Nome file sicuro: minuscole, trattini, niente accenti. */
export function slug(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "nota";
}

/** Ancora dei titoli come la calcola GitHub. */
export function githubSlug(s) {
  return String(s ?? "").trim().toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

// --- Base64 UTF-8 -----------------------------------------------------------
export function b64ToBytes(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64ToText(b64) { return new TextDecoder("utf-8").decode(b64ToBytes(b64)); }
export function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function textToB64(text) { return bytesToB64(new TextEncoder().encode(text)); }

// --- Percorsi ---------------------------------------------------------------
export function dirname(p) { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }
export function basename(p) { return p.slice(p.lastIndexOf("/") + 1); }
export function stem(p) { return basename(p).replace(/\.md$/i, ""); }

export function normalizePath(p) {
  const out = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (out.length) out.pop(); else return null; } else out.push(part);
  }
  return out.join("/");
}

/**
 * Risolve un link relativo trovato in `fromFile`.
 * Ritorna {tipo:"esterno"|"interno"|"ancora"|"vietato", path?, hash?, href?}
 */
export function resolveLink(fromFile, href) {
  href = String(href ?? "").trim();
  if (!href) return { tipo: "vietato" };
  if (href.startsWith("#")) return { tipo: "ancora", hash: href.slice(1) };
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  if (schema) {
    const s = schema[1].toLowerCase();
    return ["http", "https", "mailto"].includes(s) ? { tipo: "esterno", href } : { tipo: "vietato" };
  }
  if (href.startsWith("//")) return { tipo: "esterno", href: "https:" + href };
  let [percorso, hash = ""] = href.split("#");
  percorso = percorso.split("?")[0];
  try { percorso = decodeURIComponent(percorso); } catch { /* lascia com'è */ }
  const base = percorso.startsWith("/") ? "" : dirname(fromFile);
  const path = normalizePath((base ? base + "/" : "") + percorso);
  if (path === null) return { tipo: "vietato" };
  return { tipo: "interno", path, hash };
}

/** Percorso relativo da un file a un altro (per i link che inseriamo noi). */
export function relativePath(fromFile, toPath) {
  const da = dirname(fromFile).split("/").filter(Boolean), a = toPath.split("/");
  let i = 0;
  while (i < da.length && i < a.length - 1 && da[i] === a[i]) i++;
  return "../".repeat(da.length - i) + a.slice(i).join("/");
}

// --- Frontmatter (sottoinsieme di YAML sufficiente per mostrarlo) -----------
export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text, righe: 0 };
  const data = {};
  for (const riga of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*?)\s*(?:#.*)?$/.exec(riga);
    if (!kv) continue;
    data[kv[1]] = yamlValue(kv[2]);
  }
  return { data, body: text.slice(m[0].length), righe: m[0].split("\n").length - 1 };
}
function yamlValue(v) {
  if (v === "") return "";
  if (v.startsWith("[") && v.endsWith("]"))
    return v.slice(1, -1).split(",").map(x => unquote(x.trim())).filter(Boolean);
  return unquote(v);
}
function unquote(v) { return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v; }

// --- Modelli e date ---------------------------------------------------------
export function isoDate(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fillTemplate(tpl, { title = "", date = isoDate() } = {}) {
  return tpl.replace(/\{\{\s*date(?::[^}]*)?\s*\}\}/g, date).replace(/\{\{\s*title\s*\}\}/g, title);
}

// --- Regole del second brain -------------------------------------------------
const SOLO_LETTURA = [/^_grafo\//, /^grafo\.md$/, /^\.github\//, /^\.git\//];
export function isReadOnly(path) { return SOLO_LETTURA.some(r => r.test(path)); }
export function isServizio(path) { return /^(_grafo|\.github|\.devcontainer|\.vscode|\.obsidian|\.foam)(\/|$)/.test(path) || path === "grafo.md"; }

/** Dove finisce un file archiviato: 40-archivio/ + percorso senza la cartella PARA di primo livello. */
export function archivePath(path) {
  if (path.startsWith("40-archivio/")) return null;
  const parti = path.split("/");
  if (/^\d\d-/.test(parti[0]) && parti.length > 1) parti.shift();
  return "40-archivio/" + parti.join("/");
}

/** Indice nome → percorso per i [[wikilink]]: vince il percorso più corto, i file di servizio perdono. */
export function buildNameIndex(paths) {
  const idx = new Map();
  for (const p of paths) {
    if (!/\.md$/i.test(p) || isServizio(p) || p.startsWith("_modelli/")) continue;
    const k = stem(p).toLowerCase();
    const prima = idx.get(k);
    const peso = q => (isServizio(q) ? 1000 : 0) + q.length;
    if (!prima || peso(p) < peso(prima)) idx.set(k, p);
  }
  return idx;
}
export function resolveWikilink(idx, target) {
  const nome = String(target).split("#")[0].split("|")[0].trim();
  if (!nome) return null;
  if (nome.includes("/")) {
    const p = normalizePath(nome.endsWith(".md") ? nome : nome + ".md");
    return [...idx.values()].includes(p) ? p : null;
  }
  return idx.get(nome.replace(/\.md$/i, "").toLowerCase()) ?? null;
}

/** Spunta o toglie la spunta all'attività sulla riga `riga` (0 = prima riga del file). */
export function toggleTask(text, riga) {
  const righe = text.split("\n");
  const r = righe[riga];
  if (r === undefined) return null;
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\].*)$/.exec(r);
  if (!m) return null;
  righe[riga] = m[1] + (m[2] === " " ? "x" : " ") + m[3];
  return righe.join("\n");
}

/** Ricerca semplice: tutte le parole devono comparire (senza accenti, senza maiuscole). */
export function normalizza(s) { return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
export function punteggio(voce, parole) {
  let tot = 0;
  for (const w of parole) {
    let p = 0;
    if (voce.t.includes(w)) p += voce.t.startsWith(w) ? 6 : 4;
    if (voce.p.includes(w)) p += 2;
    if (voce.c.includes(w)) p += 2;
    if (voce.s.includes(w)) p += 1;
    if (!p) return 0;
    tot += p;
  }
  return tot;
}
