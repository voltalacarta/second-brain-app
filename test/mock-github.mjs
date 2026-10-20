// Finta API di GitHub, in memoria, costruita da cartelle locali. Basta per provare l'app senza rete e senza token veri.
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const sha1 = b => createHash("sha1").update(b).digest("hex");
const blobSha = buf => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

function leggiCartella(dir) {
  const file = new Map();
  const giro = d => {
    for (const f of readdirSync(d)) {
      if (f === ".git") continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) giro(p); else file.set(relative(dir, p).split("\\").join("/"), readFileSync(p));
    }
  };
  giro(dir);
  return file;
}

export class Repo {
  constructor(nome, dir, { privata = true, scrittura = true } = {}) {
    this.nome = nome; this.privata = privata; this.scrittura = scrittura;
    this.blob = new Map(); this.alberi = new Map(); this.commit = new Map(); this.log = [];
    const albero = new Map();
    for (const [p, buf] of leggiCartella(dir)) albero.set(p, this.metti(buf));
    const t = this.nuovoAlbero(albero);
    this.head = this.nuovoCommit(t, [], "iniziale");
  }
  metti(buf) { const s = blobSha(buf); this.blob.set(s, buf); return s; }
  nuovoAlbero(mappa) { const id = randomBytes(20).toString("hex"); this.alberi.set(id, mappa); return id; }
  nuovoCommit(tree, parents, message) { const id = randomBytes(20).toString("hex"); this.commit.set(id, { tree, parents, message, data: new Date().toISOString() }); return id; }
  file() { return this.alberi.get(this.commit.get(this.head).tree); }
  testo(p) { const s = this.file().get(p); return s ? this.blob.get(s).toString("utf8") : null; }
  /** Modifica "da un altro dispositivo" (per provare i conflitti). */
  scriviDaFuori(p, testo, msg = "esterno") {
    const m = new Map(this.file()); m.set(p, this.metti(Buffer.from(testo)));
    this.head = this.nuovoCommit(this.nuovoAlbero(m), [this.head], msg);
  }
}

export function gestore(repos, owner = "voltalacarta") {
  const interno = gestoreInterno(repos, owner);
  return async route => {
    try { await interno(route); }
    catch (e) { console.error("MOCK", route.request().method(), route.request().url(), e); await route.fulfill({ status: 500, body: String(e) }); }
  };
}
function gestoreInterno(repos, owner) {
  return async route => {
    const req = route.request();
    const url = new URL(req.url());
    const metodo = req.method();
    const corpo = req.postData() ? JSON.parse(req.postData()) : null;
    const auth = req.headers()["authorization"] || "";
    const json = (stato, dati) => route.fulfill({ status: stato, contentType: "application/json; charset=utf-8", body: JSON.stringify(dati), headers: { "access-control-allow-origin": "*" } });
    if (auth !== "Bearer token-di-prova") return json(401, { message: "Bad credentials" });
    if (url.pathname === "/user") return json(200, { login: "prova" });
    if (url.pathname.startsWith("/search/code")) {
      const q = (url.searchParams.get("q") || "").replace(/repo:\S+/, "").trim().toLowerCase();
      const r = repos.get("second-brain");
      const items = [...r.file()].filter(([p]) => p.endsWith(".md")).filter(([p]) => r.testo(p).toLowerCase().includes(q)).map(([p]) => ({ path: p, text_matches: [{ fragment: r.testo(p).slice(0, 80) }] }));
      return json(200, { items });
    }
    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m || m[1] !== owner || !repos.has(decodeURIComponent(m[2]))) return json(404, { message: "Not Found" });
    const r = repos.get(decodeURIComponent(m[2]));
    const resto = m[3] || "";
    r.log.push(`${metodo} ${resto}`);
    if (!resto) return json(200, { default_branch: "main", private: r.privata, permissions: { push: r.scrittura } });
    if (resto === "/git/ref/heads/main" && metodo === "GET") return json(200, { object: { sha: r.head } });
    let k;
    if ((k = /^\/git\/commits\/(\w+)$/.exec(resto)) && metodo === "GET") { const c = r.commit.get(k[1]); return c ? json(200, { sha: k[1], tree: { sha: c.tree } }) : json(404, { message: "Not Found" }); }
    if ((k = /^\/git\/trees\/(\w+)$/.exec(resto)) && metodo === "GET") {
      const t = r.alberi.get(k[1]); if (!t) return json(404, { message: "Not Found" });
      return json(200, { sha: k[1], truncated: false, tree: [...t].map(([path, sha]) => ({ path, type: "blob", sha, size: r.blob.get(sha).length, mode: "100644" })) });
    }
    if ((k = /^\/git\/blobs\/(\w+)$/.exec(resto)) && metodo === "GET") { const b = r.blob.get(k[1]); return b ? json(200, { sha: k[1], content: b.toString("base64"), encoding: "base64" }) : json(404, { message: "Not Found" }); }
    if ((k = /^\/contents\/(.+)$/.exec(resto)) && metodo === "GET") {
      const p = decodeURIComponent(k[1]), ref = url.searchParams.get("ref") || r.head;
      const t = r.alberi.get(r.commit.get(ref).tree), s = t.get(p);
      return s ? json(200, { sha: s, path: p }) : json(404, { message: "Not Found" });
    }
    if (!r.scrittura && metodo !== "GET") return json(403, { message: "Resource not accessible by personal access token" });
    if (resto === "/git/blobs" && metodo === "POST") return json(201, { sha: r.metti(Buffer.from(corpo.content, corpo.encoding === "base64" ? "base64" : "utf8")) });
    if (resto === "/git/trees" && metodo === "POST") {
      const base = new Map(r.alberi.get(corpo.base_tree));
      for (const v of corpo.tree) { if (v.sha === null) base.delete(v.path); else base.set(v.path, v.sha); }
      return json(201, { sha: r.nuovoAlbero(base) });
    }
    if (resto === "/git/commits" && metodo === "POST") return json(201, { sha: r.nuovoCommit(corpo.tree, corpo.parents, corpo.message) });
    if (resto === "/git/refs/heads/main" && metodo === "PATCH") {
      const c = r.commit.get(corpo.sha);
      if (!c || c.parents[0] !== r.head) return json(422, { message: "Update is not a fast forward" });
      r.head = corpo.sha; return json(200, { object: { sha: r.head } });
    }
    if (resto.startsWith("/commits") && metodo === "GET") return json(200, [{ html_url: "https://github.com/x", commit: { message: r.commit.get(r.head).message, author: { name: "Prova", date: r.commit.get(r.head).data } } }]);
    if (resto.startsWith("/actions/runs")) return json(403, { message: "Resource not accessible by personal access token" });
    return json(404, { message: "Not Found: " + resto });
  };
}
