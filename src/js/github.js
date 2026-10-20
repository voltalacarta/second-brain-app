// Client minimo per l'API REST di GitHub. Il token va SOLO a api.github.com (indirizzo fisso, non configurabile).

import { b64ToText, b64ToBytes, textToB64, bytesToB64 } from "./util.js";

export const API = "https://api.github.com";

export class ErroreGitHub extends Error {
  constructor(stato, messaggio, dati) { super(messaggio); this.stato = stato; this.dati = dati; }
}
export class Conflitto extends Error {
  constructor(path, remoto) { super(`«${path}» è stato modificato altrove dopo che l'hai aperto.`); this.path = path; this.remoto = remoto; }
}

const cacheBlob = new Map(); // sha → base64 (i blob sono immutabili)

export class GitHub {
  constructor(token, owner, repo) {
    this.token = token; this.owner = owner; this.repo = repo;
    this.ramo = null; this.headSha = null; this.albero = new Map(); this.troncato = false;
  }
  get base() { return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`; }

  async req(metodo, path, corpo, accept = "application/vnd.github+json") {
    const h = { Accept: accept, "X-GitHub-Api-Version": "2022-11-28" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (corpo !== undefined) h["Content-Type"] = "application/json";
    let r;
    try {
      r = await fetch(API + path, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: "no-store", referrerPolicy: "no-referrer" });
    } catch (e) {
      throw new ErroreGitHub(0, "GitHub non risponde: controlla la connessione.");
    }
    if (r.status === 204) return null;
    const tipo = r.headers.get("content-type") || "";
    const dati = tipo.includes("json") ? await r.json().catch(() => null) : await r.text();
    if (!r.ok) {
      const msg = (dati && dati.message) || r.statusText || "errore";
      throw new ErroreGitHub(r.status, spiega(r.status, msg), dati);
    }
    return dati;
  }

  async utente() { return this.req("GET", "/user"); }

  async info() {
    const d = await this.req("GET", this.base);
    this.ramo = d.default_branch;
    this.privata = d.private;
    this.puoScrivere = !!(d.permissions && d.permissions.push);
    return d;
  }

  /** Carica l'elenco completo dei file (un'unica chiamata). */
  async carica() {
    if (!this.ramo) await this.info();
    const ref = await this.req("GET", `${this.base}/git/ref/heads/${encodeURIComponent(this.ramo)}`);
    return this._caricaCommit(ref.object.sha);
  }
  async _caricaCommit(sha) {
    const commit = await this.req("GET", `${this.base}/git/commits/${sha}`);
    const albero = await this.req("GET", `${this.base}/git/trees/${commit.tree.sha}?recursive=1`);
    this.headSha = sha; this.treeSha = commit.tree.sha; this.troncato = !!albero.truncated;
    this.albero = new Map(albero.tree.filter(e => e.type === "blob").map(e => [e.path, { sha: e.sha, size: e.size, mode: e.mode }]));
    return this.albero;
  }
  /** Ricontrolla se il ramo è avanzato (per es. dopo il commit del bot del grafo). */
  async aggiornaSeCambiato() {
    const ref = await this.req("GET", `${this.base}/git/ref/heads/${encodeURIComponent(this.ramo)}`);
    if (ref.object.sha === this.headSha) return false;
    await this._caricaCommit(ref.object.sha);
    return true;
  }

  async blob64(sha) {
    if (cacheBlob.has(sha)) return cacheBlob.get(sha);
    const b = await this.req("GET", `${this.base}/git/blobs/${sha}`);
    const c = (b.content || "").replace(/\s/g, "");
    cacheBlob.set(sha, c);
    return c;
  }
  async testo(path) {
    const e = this.albero.get(path);
    if (!e) throw new ErroreGitHub(404, `«${path}» non esiste in ${this.repo}.`);
    return { testo: b64ToText(await this.blob64(e.sha)), sha: e.sha };
  }
  async byte(path) {
    const e = this.albero.get(path);
    if (!e) throw new ErroreGitHub(404, `«${path}» non esiste.`);
    return b64ToBytes(await this.blob64(e.sha));
  }

  /** sha del file sull'ultimo commit del ramo (null se non c'è). */
  async _shaRemoto(path, commitSha) {
    try {
      const d = await this.req("GET", `${this.base}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${commitSha}`);
      return Array.isArray(d) ? "cartella" : d.sha;
    } catch (e) { if (e.stato === 404) return null; throw e; }
  }

  /**
   * Un commit atomico con più file.
   * @param {Array<{path:string, testo?:string, byte?:Uint8Array, elimina?:boolean, atteso?:string|null}>} modifiche
   *   `atteso`: sha che avevi aperto (null = il file non deve esistere; undefined = non controllare)
   */
  async commit(modifiche, messaggio) {
    for (let tentativo = 0; tentativo < 4; tentativo++) {
      const ref = await this.req("GET", `${this.base}/git/ref/heads/${encodeURIComponent(this.ramo)}`);
      const head = ref.object.sha;
      const commitHead = await this.req("GET", `${this.base}/git/commits/${head}`);
      for (const m of modifiche) {
        if (m.atteso === undefined) continue;
        const ora = head === this.headSha && this.albero.has(m.path) ? this.albero.get(m.path).sha
          : (head === this.headSha ? null : await this._shaRemoto(m.path, head));
        if ((ora || null) !== (m.atteso || null)) {
          let remoto = null;
          if (ora && ora !== "cartella") remoto = b64ToText(await this.blob64(ora));
          throw new Conflitto(m.path, remoto === null ? null : { testo: remoto, sha: ora });
        }
      }
      const voci = [];
      const nuoviSha = {};
      for (const m of modifiche) {
        if (m.elimina) { voci.push({ path: m.path, mode: "100644", type: "blob", sha: null }); continue; }
        if (m.blobSha) { nuoviSha[m.path] = m.blobSha; voci.push({ path: m.path, mode: "100644", type: "blob", sha: m.blobSha }); continue; }
        const contenuto = m.byte ? bytesToB64(m.byte) : textToB64(m.testo);
        const b = await this.req("POST", `${this.base}/git/blobs`, { content: contenuto, encoding: "base64" });
        cacheBlob.set(b.sha, contenuto);
        nuoviSha[m.path] = b.sha;
        voci.push({ path: m.path, mode: "100644", type: "blob", sha: b.sha });
      }
      const albero = await this.req("POST", `${this.base}/git/trees`, { base_tree: commitHead.tree.sha, tree: voci });
      const nuovo = await this.req("POST", `${this.base}/git/commits`, { message: messaggio, tree: albero.sha, parents: [head] });
      try {
        await this.req("PATCH", `${this.base}/git/refs/heads/${encodeURIComponent(this.ramo)}`, { sha: nuovo.sha, force: false });
      } catch (e) {
        if (e.stato === 422 || e.stato === 409) continue; // il ramo è avanzato nel frattempo: si riprova sul nuovo stato
        throw e;
      }
      // aggiorna l'elenco locale senza ricaricare tutto
      if (head !== this.headSha) await this._caricaCommit(nuovo.sha);
      else {
        this.headSha = nuovo.sha; this.treeSha = albero.sha;
        for (const m of modifiche) {
          if (m.elimina) this.albero.delete(m.path);
          else this.albero.set(m.path, { sha: nuoviSha[m.path], size: 0, mode: "100644" });
        }
      }
      return { commit: nuovo.sha, sha: nuoviSha };
    }
    throw new ErroreGitHub(409, "Il ramo continua a cambiare mentre salvi: riprova tra qualche secondo.");
  }

  async ultimoCommit(path) {
    const d = await this.req("GET", `${this.base}/commits?path=${encodeURIComponent(path)}&per_page=1&sha=${encodeURIComponent(this.ramo)}`);
    return d && d[0] ? { data: d[0].commit.author.date, autore: d[0].commit.author.name, messaggio: d[0].commit.message.split("\n")[0], url: d[0].html_url } : null;
  }

  async cercaTesto(q) {
    const d = await this.req("GET", `/search/code?q=${encodeURIComponent(`${q} repo:${this.owner}/${this.repo}`)}&per_page=30`, undefined, "application/vnd.github.text-match+json");
    return (d.items || []).map(it => ({ path: it.path, frammenti: (it.text_matches || []).map(t => t.fragment) }));
  }

  /** Esecuzioni recenti delle Actions (serve il permesso Actions: lettura; altrimenti null). */
  async esecuzioni() {
    try {
      const d = await this.req("GET", `${this.base}/actions/runs?per_page=5&branch=${encodeURIComponent(this.ramo)}`);
      return d.workflow_runs.map(r => ({ nome: r.name, stato: r.status, esito: r.conclusion, sha: r.head_sha, url: r.html_url, data: r.created_at }));
    } catch { return null; }
  }

  urlWeb(path) { return `https://github.com/${this.owner}/${this.repo}/blob/${this.ramo || "main"}/${path.split("/").map(encodeURIComponent).join("/")}`; }
}

function spiega(stato, msg) {
  if (stato === 401) return "Token non valido o scaduto: rientra con un token nuovo.";
  if (stato === 403 && /rate limit/i.test(msg)) return "Troppe richieste a GitHub: aspetta qualche minuto.";
  if (stato === 403) return "Il token non ha il permesso per questa operazione (" + msg + ").";
  if (stato === 404) return "Non trovato: la repo non esiste o il token non può vederla.";
  if (stato === 409) return "Conflitto con lo stato della repo: riprova.";
  if (stato === 422) return "GitHub ha rifiutato la richiesta: " + msg;
  return `GitHub ha risposto ${stato}: ${msg}`;
}
