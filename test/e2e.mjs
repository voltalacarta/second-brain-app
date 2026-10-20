// Prove end-to-end: Chromium vero, app compilata in dist/, API di GitHub simulata.
// Uso: npm run build && npm run e2e      (SB_SCREENSHOT=cartella per salvare le schermate)
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import assert from "node:assert/strict";
import { Repo, gestore } from "./mock-github.mjs";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/npm-tools/node_modules/playwright/index.mjs")); }

const DIST = new URL("../dist/", import.meta.url).pathname;
const FIX = new URL("./fixture/", import.meta.url).pathname;
const SCREEN = process.env.SB_SCREENSHOT || "";
if (SCREEN) mkdirSync(SCREEN, { recursive: true });
const TIPI = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = join(DIST, p);
  if (!f.startsWith(DIST) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TIPI[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;

const repos = new Map([
  ["second-brain", new Repo("second-brain", FIX + "second-brain")],
  ["documentazione", new Repo("documentazione", FIX + "documentazione", { privata: false, scrittura: false })],
]);
const opz = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(opz);
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "it-IT" });
await ctx.route("https://api.github.com/**", gestore(repos));
const page = await ctx.newPage();
const errori = [];
page.on("pageerror", e => errori.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/status of (401|403|404)/.test(m.text())) errori.push("console: " + m.text()); });
page.on("dialog", d => { errori.push("dialogo inatteso: " + d.message()); d.dismiss(); });
const foto = async nome => { if (SCREEN) await page.screenshot({ path: join(SCREEN, nome + ".png"), fullPage: false }); };

let n = 0, falliti = 0;
async function prova(nome, fn) {
  n++;
  try { await fn(); console.log(`ok ${n} - ${nome}`); }
  catch (e) { falliti++; console.log(`not ok ${n} - ${nome}\n  ${String(e.stack || e).split("\n").slice(0, 4).join("\n  ")}`); await foto("errore-" + n); }
}
const sb = repos.get("second-brain");

await prova("schermata di accesso e token sbagliato", async () => {
  await page.goto(BASE);
  await page.waitForSelector("#accesso:not([hidden])");
  await page.fill("#in-token", "sbagliato");
  await page.click("#form-accesso button");
  await page.waitForSelector("#err-accesso:not([hidden])");
  assert.match(await page.textContent("#err-accesso"), /Token non valido/);
  await foto("01-accesso");
});

await prova("accesso e pagina iniziale", async () => {
  await page.fill("#in-token", "token-di-prova");
  await page.click("#form-accesso button");
  await page.waitForSelector("#app:not([hidden]) article .testo-nota h1");
  assert.equal(await page.textContent("article .testo-nota h1"), "Inizia qui");
  assert.ok(await page.isVisible('.albero a[href="#/n/00-inbox/benvenuto.md"]') || await page.isVisible('.albero button[data-cartella="00-inbox"]'));
  assert.ok(await page.isVisible(".wikilink.mancante"));
  // il token non è nell'URL e non è in localStorage (non abbiamo scelto «ricorda»)
  assert.ok(!page.url().includes("token"));
  assert.equal(await page.evaluate(() => localStorage.getItem("sb:token")), null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("sb:token")), "token-di-prova");
  await page.waitForSelector("#collegamenti .blocco");
  await foto("02-inizio");
});

await prova("link interni, wikilink, tabelle, immagini private, collegamenti dal grafo", async () => {
  await page.click('.testo-nota a[href="#/n/10-progetti/demo/README.md"]');
  await page.waitForSelector("article .testo-nota h1:text('Progetto demo')");
  assert.ok(await page.isVisible(".tabella table"));
  assert.ok(await page.isVisible(".avviso-note"));
  assert.ok(await page.isVisible("pre.diagramma"));
  await page.waitForFunction(() => { const i = document.querySelector(".testo-nota img[data-path]"); return i && i.src.startsWith("blob:") && i.naturalWidth > 0; });
  assert.equal(await page.getAttribute(".testo-nota a.esterno", "rel"), "noopener noreferrer");
  await page.waitForSelector("#collegamenti h2:has-text('Ci rimandano')");
  await page.waitForSelector("#grafo-locale");
  await foto("03-nota");
  await page.click('.testo-nota a[href*="20-aree/strumenti.md"]');
  await page.waitForSelector("article .testo-nota h1:text('Strumenti')");
  assert.ok(page.url().includes("h=stripe"));
  await page.click(".testo-nota a.wikilink");
  await page.waitForSelector("article .testo-nota h1:text('Benvenuto')");
});

await prova("HTML ostile nelle note non viene eseguito", async () => {
  await page.goto(BASE + "#/n/00-inbox/prova-xss.md");
  await page.waitForSelector("article .testo-nota h1:text('Prova sicurezza')");
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".testo-nota script").count(), 0);
  assert.equal(await page.locator(".testo-nota img[onerror]").count(), 0);
  assert.equal(await page.locator('.testo-nota a[href^="javascript"]').count(), 0);
  assert.equal(await page.locator('.testo-nota img[src^="javascript"]').count(), 0);
});

await prova("ricerca istantanea e pagina dei risultati", async () => {
  await page.fill("#cerca", "stripe");
  await page.waitForSelector("#cerca-esiti:not([hidden]) a");
  const voci = await page.locator("#cerca-esiti a").allTextContents();
  assert.ok(voci.some(v => /Stripe/.test(v)), voci.join(" | "));
  await foto("04-ricerca");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.hash.startsWith("#/c/") || location.hash.startsWith("#/n/") || location.hash.startsWith("#/r/"));
  await page.goto(BASE + "#/s/carte");
  await page.waitForSelector("h1:has-text('Risultati')");
  await page.click("#cerca-testo");
  await page.waitForSelector("#esiti-testo li, #esiti-testo p");
});

await prova("concetto e documento di un'altra repo (sola lettura)", async () => {
  await page.goto(BASE + "#/c/stripe");
  await page.waitForSelector("h1:text('Stripe')");
  assert.ok(await page.isVisible("h2:has-text('documentazione')"));
  await foto("05-concetto");
  await page.click(".nota a:has-text('Usare Stripe per le carte')");
  await page.waitForSelector("article .testo-nota h1:has-text('0001')");
  assert.ok(await page.isVisible(".chip-repo"));
  assert.equal(await page.locator(".nota-azioni a:has-text('Modifica')").count(), 0);
});

await prova("grafo completo", async () => {
  await page.goto(BASE + "#/g");
  await page.waitForSelector("#g-tela");
  await page.waitForTimeout(600);
  const pieno = await page.evaluate(() => {
    const c = document.querySelector("#g-tela"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let diversi = 0; for (let i = 0; i < d.length; i += 4 * 97) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) > 40) diversi++;
    return diversi;
  });
  assert.ok(pieno > 5, "il grafo sembra vuoto: " + pieno);
  await page.fill("#g-cerca", "benvenuto");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await foto("06-grafo");
});

await prova("nuova nota con modello, [[suggerimenti]] e salvataggio", async () => {

  await page.goto(BASE + "#/");
  await page.waitForSelector("article .testo-nota h1");
  await page.click("#btn-nuova");
  await page.fill("dialog input[name=titolo]", "Idea del giorno");
  await page.click("dialog button[value=ok]");
  await page.waitForSelector(".ed-testo");
  assert.match(await page.inputValue(".ed-testo"), /# Idea del giorno/);
  await page.click(".ed-testo");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nCollegata a [[benv");
  await page.waitForSelector(".ed-suggerimenti:not([hidden]) button");
  await foto("07-editor");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".ed-anteprima").textContent.includes("Collegata a"));
  assert.ok(await page.isVisible(".ed-anteprima a.wikilink:not(.mancante)"));
  await page.keyboard.type(" e una lista:\n- primo");
  await page.keyboard.press("Enter");
  await page.keyboard.type("secondo");
  const t = await page.inputValue(".ed-testo");
  assert.ok(t.includes("[[benvenuto]]"), t);
  assert.ok(t.includes("- primo\n- secondo"), t);
  await page.keyboard.press("Control+s");
  await page.waitForSelector("article .testo-nota h1:text('Idea del giorno')");
  const salvato = sb.testo("00-inbox/idea-del-giorno.md");
  assert.ok(salvato && salvato.includes("[[benvenuto]]"));
  assert.match(sb.commit.get(sb.head).message, /^note: crea idea-del-giorno/);
  assert.match(salvato, /creato: \d{4}-\d{2}-\d{2}/);
});

await prova("modifica, bozza e conflitto con un altro dispositivo", async () => {
  await page.goto(BASE + "#/e/20-aree/strumenti.md");
  await page.waitForSelector(".ed-testo");
  await page.click(".ed-testo"); await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\nRiga aggiunta dall'app.");
  await page.waitForTimeout(800);
  assert.ok(await page.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith("sb:bozza:"))));
  sb.scriviDaFuori("20-aree/strumenti.md", "# Strumenti\n\nCambiato altrove.\n");
  await page.click("#btn-salva");
  await page.waitForSelector("dialog[open] h2:text('Il file è cambiato su GitHub')");
  await foto("08-conflitto");
  await page.click("dialog button[value=mia]");
  await page.waitForSelector("article .testo-nota h1:text('Strumenti')");
  assert.ok(sb.testo("20-aree/strumenti.md").includes("Riga aggiunta dall'app."));
  const bozze = await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith("sb:bozza:") && k.endsWith("strumenti.md")));
  assert.deepEqual(bozze, []);
});

await prova("uscire dall'editor con modifiche chiede conferma", async () => {
  await page.goto(BASE + "#/e/00-inbox/benvenuto.md");
  await page.waitForSelector(".ed-testo");
  await page.click(".ed-testo"); await page.keyboard.type("xyz");
  await page.click(".logo");
  await page.waitForSelector("dialog[open] h2:text('Modifiche non salvate')");
  await page.click("dialog button[value=scarta]");
  await page.waitForSelector("article .testo-nota h1:text('Inizia qui')");
  assert.ok(!sb.testo("00-inbox/benvenuto.md").includes("xyz"));
});

await prova("spuntare un'attività fa un commit", async () => {
  await page.goto(BASE + "#/n/00-inbox/benvenuto.md");
  await page.waitForSelector("input.attivita");
  await page.locator("input.attivita").first().check();
  await page.waitForSelector("#avviso:has-text('Attività fatta')");
  assert.ok(sb.testo("00-inbox/benvenuto.md").includes("- [x] Leggere la guida"));
});

await prova("nota del giorno", async () => {
  await page.click("#btn-oggi");
  await page.waitForSelector(".ed-testo");
  assert.match(await page.inputValue(".ed-testo"), /tipo: giornaliera/);
  await page.click("#btn-salva");
  await page.waitForSelector("article .testo-nota h1");
  assert.ok([...sb.file().keys()].some(p => /^01-giornaliere\/\d{4}-\d{2}-\d{2}\.md$/.test(p)));
});

await prova("archiviare sposta in 40-archivio con un solo commit", async () => {
  await page.goto(BASE + "#/n/00-inbox/idea-del-giorno.md");
  await page.waitForSelector("#btn-file");
  await page.click("#btn-file");
  await page.click("[data-f=archivia]");
  await page.waitForSelector("dialog[open] input[name=dest]");
  assert.equal(await page.inputValue("dialog input[name=dest]"), "40-archivio/idea-del-giorno.md");
  const prima = sb.head;
  await page.click("dialog button[value=ok]");
  await page.waitForFunction(() => location.hash.includes("40-archivio"));
  assert.ok(sb.file().has("40-archivio/idea-del-giorno.md") && !sb.file().has("00-inbox/idea-del-giorno.md"));
  assert.equal(sb.commit.get(sb.head).parents[0], prima);
});

await prova("i file generati sono in sola lettura", async () => {
  await page.goto(BASE + "#/e/_grafo/indice.md");
  await page.waitForSelector("h1:text('Qualcosa non va')");
});

await prova("telefono: menu laterale e editor", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "#/n/10-progetti/demo/README.md");
  await page.waitForSelector("article .testo-nota h1");
  const largo = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(largo, "la pagina scorre in orizzontale");
  await foto("09-telefono");
  await page.click("#btn-menu");
  await page.waitForTimeout(250);
  assert.ok(await page.isVisible(".albero"));
  await foto("10-telefono-menu");
  await page.click("#btn-menu");
  await page.waitForTimeout(250);
  assert.ok(!(await page.evaluate(() => document.body.classList.contains("lato-aperto"))));
  await page.goto(BASE + "#/e/10-progetti/demo/README.md");
  await page.waitForSelector(".ed-testo");
  await foto("11-telefono-editor");
  await page.setViewportSize({ width: 1400, height: 900 });
});

await prova("esci cancella il token", async () => {
  await page.goto(BASE + "#/");
  await page.waitForSelector("article .testo-nota h1");
  await page.click("#btn-altro");
  await page.click("#m-esci");
  await page.waitForSelector("#accesso:not([hidden])");
  assert.equal(await page.evaluate(() => sessionStorage.getItem("sb:token")), null);
});

await prova("tema scuro", async () => {
  const p2 = await ctx.newPage();
  await p2.emulateMedia({ colorScheme: "dark" });
  await p2.goto(BASE);
  await p2.fill("#in-token", "token-di-prova"); await p2.check("#in-ricorda");
  await p2.click("#form-accesso button");
  await p2.waitForSelector("article .testo-nota h1");
  assert.equal(await p2.evaluate(() => localStorage.getItem("sb:token")), "token-di-prova");
  if (SCREEN) await p2.screenshot({ path: join(SCREEN, "12-scuro.png") });
  await p2.goto(BASE + "#/g"); await p2.waitForTimeout(700);
  if (SCREEN) await p2.screenshot({ path: join(SCREEN, "13-grafo-scuro.png") });
  await p2.close();
});

await prova("nessun errore in console", async () => { assert.deepEqual(errori, [], errori.join("\n")); });

await browser.close(); server.close();
console.log(`# pass ${n - falliti}\n# fail ${falliti}`);
process.exit(falliti ? 1 : 0);
