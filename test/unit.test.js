import { test } from "node:test";
import assert from "node:assert/strict";
import * as u from "../src/js/util.js";
import { renderMarkdown } from "../src/js/md.js";

test("slug e ancore", () => {
  assert.equal(u.slug("Città & Società: idee!"), "citta-societa-idee");
  assert.equal(u.slug(""), "nota");
  assert.equal(u.githubSlug("Punti chiariti con il titolare (16/10/2026)"), "punti-chiariti-con-il-titolare-16102026");
  assert.equal(u.githubSlug("1. Chi siete, in breve"), "1-chi-siete-in-breve");
});

test("base64 UTF-8 andata e ritorno", () => {
  const s = "Perché è così · €100 — 😀\nriga 2";
  assert.equal(u.b64ToText(u.textToB64(s)), s);
});

test("risoluzione dei link", () => {
  assert.deepEqual(u.resolveLink("10-progetti/a/README.md", "../b/x.md#sez"), { tipo: "interno", path: "10-progetti/b/x.md", hash: "sez" });
  assert.deepEqual(u.resolveLink("a/b.md", "c%20d.md"), { tipo: "interno", path: "a/c d.md", hash: "" });
  assert.equal(u.resolveLink("a.md", "javascript:alert(1)").tipo, "vietato");
  assert.equal(u.resolveLink("a.md", "JaVaScRiPt:alert(1)").tipo, "vietato");
  assert.equal(u.resolveLink("a.md", "data:text/html,x").tipo, "vietato");
  assert.equal(u.resolveLink("a.md", "../../fuori.md").tipo, "vietato");
  assert.equal(u.resolveLink("a.md", "https://x.it").tipo, "esterno");
  assert.equal(u.resolveLink("a.md", "#titolo").tipo, "ancora");
  assert.equal(u.relativePath("10-progetti/a/b.md", "_allegati/x.png"), "../../_allegati/x.png");
  assert.equal(u.relativePath("nota.md", "_allegati/x.png"), "_allegati/x.png");
});

test("frontmatter", () => {
  const f = u.splitFrontmatter('---\ntitolo: "Ciao: mondo"\ntags: [a, b]\ncreato: 2026-10-20 # data\n---\n# T\n');
  assert.deepEqual(f.data, { titolo: "Ciao: mondo", tags: ["a", "b"], creato: "2026-10-20" });
  assert.equal(f.body, "# T\n");
  assert.equal(f.righe, 5);
  assert.deepEqual(u.splitFrontmatter("niente").data, {});
});

test("modelli, archivio, sola lettura", () => {
  assert.equal(u.fillTemplate("# {{title}} {{date:YYYY-MM-DD}} {{date}}", { title: "X", date: "2026-01-02" }), "# X 2026-01-02 2026-01-02");
  assert.equal(u.archivePath("00-inbox/x.md"), "40-archivio/x.md");
  assert.equal(u.archivePath("10-progetti/p/a.md"), "40-archivio/p/a.md");
  assert.equal(u.archivePath("40-archivio/x.md"), null);
  assert.ok(u.isReadOnly("_grafo/indice.md"));
  assert.ok(u.isReadOnly("grafo.md"));
  assert.ok(!u.isReadOnly("00-inbox/x.md"));
});

test("wikilink", () => {
  const idx = u.buildNameIndex(["00-inbox/benvenuto.md", "_grafo/concetti/benvenuto.md", "30-risorse/guida-rapida.md", "a.png"]);
  assert.equal(u.resolveWikilink(idx, "Benvenuto"), "00-inbox/benvenuto.md");
  assert.equal(u.resolveWikilink(u.buildNameIndex(["_grafo/concetti/futura.md"]), "futura"), null);
  assert.equal(u.resolveWikilink(idx, "guida-rapida|la guida"), "30-risorse/guida-rapida.md");
  assert.equal(u.resolveWikilink(idx, "30-risorse/guida-rapida"), "30-risorse/guida-rapida.md");
  assert.equal(u.resolveWikilink(idx, "manca"), null);
});

test("spunta attività", () => {
  assert.equal(u.toggleTask("a\n- [ ] x\n", 1), "a\n- [x] x\n");
  assert.equal(u.toggleTask("  1. [X] y", 0), "  1. [ ] y");
  assert.equal(u.toggleTask("testo", 0), null);
});

test("markdown: niente HTML grezzo né link pericolosi", () => {
  const { html } = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) [y](https://ok.it "t\\"") ![i](https://e.it/a.png)\n\n**<b>**');
  assert.ok(!/<script/i.test(html), html);
  assert.ok(!/<img src=x/i.test(html));
  assert.ok(!/href="javascript/i.test(html));
  assert.ok(html.includes('href="https://ok.it"'));
  assert.ok(!/onerror=alert/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/, "")));
  assert.ok(html.includes("<strong>&lt;b&gt;</strong>"));
  const ostile = renderMarkdown("[a](java\tscript:x) [b]( JAVASCRIPT:x) ![c](vbscript:x)", { link: h => ({ href: h, esterno: false }), img: s => ({ src: s }) }).html;
  assert.ok(!/script:/i.test(ostile.replace(/>[^<]*</g, "><")), ostile);
});

test("markdown: blocchi", () => {
  const src = "# Titolo\n\nTesto **forte** e *corsivo* e `codice <x>`.\n\n- a\n  - b\n- [ ] c\n- [x] d\n\n1. uno\n2. due\n\n| A | B |\n|---|:-:|\n| 1 | 2 \\| 3 |\n\n> [!NOTE]\n> nota\n\n```mermaid\ngraph TD\n```\n\n---\n<!-- commento -->\nfine  \nriga";
  const { html, titoli } = renderMarkdown(src, { offset: 10 });
  assert.equal(titoli[0].id, "titolo");
  assert.ok(html.includes("<strong>forte</strong>") && html.includes("<em>corsivo</em>"));
  assert.ok(html.includes("<code>codice &lt;x&gt;</code>"));
  assert.ok(/<ul[^>]*><li>a\n?<ul><li>b<\/li><\/ul><\/li>/.test(html), html);
  assert.ok(html.includes('data-riga="16"'), html);
  assert.ok(html.includes("checked"));
  assert.ok(html.includes("<ol><li>uno</li><li>due</li></ol>"));
  assert.ok(html.includes('<td class="al-center">2 | 3</td>'), html);
  assert.ok(html.includes('<h1 id="h-titolo">'));
  assert.ok(html.includes("avviso-note"));
  assert.ok(html.includes('class="diagramma"'));
  assert.ok(html.includes("<hr>"));
  assert.ok(!html.includes("commento"));
  assert.ok(html.includes("fine<br>"));
});

test("markdown: wikilink e link interni passano dal contesto", () => {
  const ctx = {
    wiki: t => ({ href: "#/n/" + t + ".md", esiste: t === "si" }),
    link: h => ({ href: "#/n/" + h, esterno: false }),
  };
  const { html } = renderMarkdown("[[si]] [[no|Alias]] [testo `c`](a.md)", ctx);
  assert.ok(html.includes('<a href="#/n/si.md" class="wikilink">si</a>'));
  assert.ok(html.includes('class="wikilink mancante"') && html.includes(">Alias<"));
  assert.ok(html.includes('<a href="#/n/a.md">testo <code>c</code></a>'), html);
});

test("ricerca", () => {
  const v = { t: u.normalizza("Città di Ferrara"), p: "a/b.md", c: "", s: "" };
  assert.ok(u.punteggio(v, ["citta"]) > 0);
  assert.equal(u.punteggio(v, ["citta", "roma"]), 0);
});
