// Grafo interattivo su canvas: layout a forze (repulsione su griglia, O(n) per passo), zoom, trascinamento, tocco.

const COLORE_TIPO = { nota: "--g-nota", documento: "--g-doc", concetto: "--g-concetto", repo: "--g-repo" };
const COLORE_CAT = { idea: "--g-idea", normativa: "--g-normativa", sicurezza: "--g-sicurezza", strumento: "--g-strumento", metodo: "--g-metodo", organizzazione: "--g-org" };

/**
 * @param {HTMLCanvasElement} tela
 * @param {{nodi:any[], archi:any[]}} dati   nodi con id,l,t,c,g ; archi [i,j,tipo,peso]
 * @param {{onSeleziona?:Function, onApri?:Function, compatto?:boolean, evidenzia?:string}} opz
 */
export function creaGrafo(tela, dati, opz = {}) {
  const ctx = tela.getContext("2d");
  const stile = getComputedStyle(document.documentElement);
  const col = v => stile.getPropertyValue(v).trim() || "#888";
  const N = dati.nodi.map((n, i) => ({ ...n, i, x: Math.cos(i * 2.4) * (40 + i % 97 * 3), y: Math.sin(i * 2.4) * (40 + i % 89 * 3), vx: 0, vy: 0, vis: true, r: 3 + Math.min(Math.sqrt(n.g || 1), 6) * (opz.compatto ? 1.1 : 1.5) }));
  const A = dati.archi.filter(a => N[a[0]] && N[a[1]]).map(a => ({ s: N[a[0]], d: N[a[1]], tipo: a[2], w: a[3] || .5 }));
  const vicini = N.map(() => new Set());
  for (const a of A) { vicini[a.s.i].add(a.d.i); vicini[a.d.i].add(a.s.i); }
  for (const n of N) n.colore = col(COLORE_CAT[n.c] || COLORE_TIPO[n.t] || "--g-nota");
  const coloreArco = col("--g-arco"), coloreTesto = col("--fg"), coloreSfondo = col("--bg");

  let vista = { x: 0, y: 0, k: 1 }, calore = 1, selezionato = null, sopra = null, vivo = true;
  let filtro = { tipi: new Set(["nota", "documento", "concetto", "repo"]), menzioni: true, query: "", repo: "" };
  let Avis = A;

  function aggiornaVisibili() {
    const q = filtro.query;
    for (const n of N) {
      n.trovato = q ? (n.lq || (n.lq = (n.l + " " + (n.s || "")).toLowerCase())).includes(q) : false;
      n.vis = filtro.tipi.has(n.t) && (!filtro.repo || n.r === filtro.repo || n.t === "concetto");
    }
    Avis = A.filter(a => a.s.vis && a.d.vis && (filtro.menzioni || a.tipo !== "menziona") && a.tipo !== "contiene");
    // i concetti senza archi visibili non servono
    const grado = new Map();
    for (const a of Avis) { grado.set(a.s, 1); grado.set(a.d, 1); }
    for (const n of N) if (n.t === "concetto" && n.vis && !grado.has(n) && !n.trovato) n.vis = false;
    calore = Math.max(calore, .4);
  }

  function passo() {
    const cella = 90, griglia = new Map();
    const vis = N.filter(n => n.vis);
    for (const n of vis) {
      const k = Math.floor(n.x / cella) + "," + Math.floor(n.y / cella);
      (griglia.get(k) || griglia.set(k, []).get(k)).push(n);
    }
    for (const n of vis) {
      const cx = Math.floor(n.x / cella), cy = Math.floor(n.y / cella);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const g = griglia.get((cx + dx) + "," + (cy + dy)); if (!g) continue;
        for (const m of g) {
          if (m.i <= n.i) continue;
          let ddx = n.x - m.x, ddy = n.y - m.y, d2 = ddx * ddx + ddy * ddy;
          if (d2 < .01) { ddx = Math.random() - .5; ddy = Math.random() - .5; d2 = .5; }
          if (d2 > cella * cella) continue;
          const f = 900 / d2, d = Math.sqrt(d2);
          n.vx += ddx / d * f; n.vy += ddy / d * f; m.vx -= ddx / d * f; m.vy -= ddy / d * f;
        }
      }
    }
    for (const a of Avis) {
      const dx = a.d.x - a.s.x, dy = a.d.y - a.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const lungo = a.tipo === "menziona" ? 70 : 45, f = (d - lungo) * .02 * (a.w || .5);
      a.s.vx += dx / d * f; a.s.vy += dy / d * f; a.d.vx -= dx / d * f; a.d.vy -= dy / d * f;
    }
    for (const n of vis) {
      n.vx -= n.x * .002; n.vy -= n.y * .002;
      if (n === trascinato) { n.vx = n.vy = 0; continue; }
      const v = Math.hypot(n.vx, n.vy), lim = 12 * calore + .5;
      if (v > lim) { n.vx *= lim / v; n.vy *= lim / v; }
      n.x += n.vx; n.y += n.vy; n.vx *= .55; n.vy *= .55;
    }
    calore *= .992;
  }

  function dimensiona() {
    const r = tela.getBoundingClientRect(), p = window.devicePixelRatio || 1;
    tela.width = Math.max(1, r.width * p); tela.height = Math.max(1, r.height * p);
    disegna();
  }

  function disegna() {
    const p = window.devicePixelRatio || 1, W = tela.width, H = tela.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = coloreSfondo; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(p * vista.k, 0, 0, p * vista.k, W / 2 + vista.x * p, H / 2 + vista.y * p);
    const fuoco = selezionato || sopra;
    const vicin = fuoco ? vicini[fuoco.i] : null;
    ctx.lineWidth = 1 / vista.k;
    for (const a of Avis) {
      const acceso = fuoco && (a.s === fuoco || a.d === fuoco);
      ctx.strokeStyle = acceso ? fuoco.colore : coloreArco;
      ctx.globalAlpha = acceso ? .9 : (fuoco ? .08 : (a.tipo === "menziona" ? .18 : .35));
      ctx.beginPath(); ctx.moveTo(a.s.x, a.s.y); ctx.lineTo(a.d.x, a.d.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const etichette = [];
    for (const n of N) {
      if (!n.vis) continue;
      const vivoN = !fuoco || n === fuoco || vicin.has(n.i);
      ctx.globalAlpha = vivoN ? 1 : .18;
      ctx.fillStyle = n.colore;
      ctx.beginPath();
      if (n.t === "concetto") { const r = n.r * .9; ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath(); }
      else if (n.t === "repo") ctx.rect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      else ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
      if (n.trovato || n.l === opz.evidenzia || n.id === opz.evidenzia || n === selezionato) {
        ctx.lineWidth = 2.5 / vista.k; ctx.strokeStyle = coloreTesto; ctx.stroke(); ctx.lineWidth = 1 / vista.k;
      }
      const grande = n.r * vista.k > 9;
      if (n === fuoco || n.trovato || n.id === opz.evidenzia || (vicin && vicin.has(n.i) && vista.k > .6) || (!fuoco && (vista.k > 1.6 || grande)) || (opz.compatto && vivoN)) etichette.push(n);
    }
    ctx.globalAlpha = 1;
    ctx.font = `${12 / vista.k}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const occupati = [];
    etichette.sort((a, b) => (b === fuoco) - (a === fuoco) || b.g - a.g);
    for (const n of etichette.slice(0, 220)) {
      const t = n.l.length > 42 ? n.l.slice(0, 40) + "…" : n.l;
      const w = ctx.measureText(t).width, x = n.x + n.r + 3 / vista.k, y = n.y, h = 14 / vista.k;
      if (n !== fuoco && occupati.some(o => x < o.x + o.w && x + w > o.x && Math.abs(y - o.y) < h)) continue;
      occupati.push({ x, y, w });
      ctx.strokeStyle = coloreSfondo; ctx.lineWidth = 3 / vista.k; ctx.lineJoin = "round"; ctx.strokeText(t, x, y);
      ctx.fillStyle = coloreTesto; ctx.fillText(t, x, y);
    }
  }

  function ciclo() {
    if (!vivo) return;
    if (calore > .03) { passo(); passo(); disegna(); }
    requestAnimationFrame(ciclo);
  }

  // --- interazione ---
  const tocchi = new Map();
  let trascinato = null, mosso = false, inizio = null, pinch = null;
  const mondo = (cx, cy) => {
    const r = tela.getBoundingClientRect();
    return [(cx - r.left - r.width / 2 - vista.x) / vista.k, (cy - r.top - r.height / 2 - vista.y) / vista.k];
  };
  function nodoA(cx, cy) {
    const [x, y] = mondo(cx, cy);
    let meglio = null, dm = Infinity;
    for (const n of N) {
      if (!n.vis) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < n.r + 6 / vista.k && d < dm) { dm = d; meglio = n; }
    }
    return meglio;
  }
  tela.addEventListener("pointerdown", e => {
    tela.setPointerCapture(e.pointerId);
    tocchi.set(e.pointerId, [e.clientX, e.clientY]);
    mosso = false; inizio = [e.clientX, e.clientY, vista.x, vista.y];
    if (tocchi.size === 2) {
      const [a, b] = [...tocchi.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: vista.k }; trascinato = null; return;
    }
    trascinato = nodoA(e.clientX, e.clientY);
  });
  tela.addEventListener("pointermove", e => {
    if (!tocchi.has(e.pointerId)) {
      const n = nodoA(e.clientX, e.clientY);
      if (n !== sopra) { sopra = n; tela.style.cursor = n ? "pointer" : "grab"; disegna(); }
      return;
    }
    tocchi.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && tocchi.size === 2) {
      const [a, b] = [...tocchi.values()];
      vista.k = Math.min(8, Math.max(.08, pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)); disegna(); return;
    }
    if (Math.hypot(e.clientX - inizio[0], e.clientY - inizio[1]) > 4) mosso = true;
    if (!mosso) return;
    if (trascinato) { const [x, y] = mondo(e.clientX, e.clientY); trascinato.x = x; trascinato.y = y; calore = Math.max(calore, .3); disegna(); }
    else { vista.x = inizio[2] + e.clientX - inizio[0]; vista.y = inizio[3] + e.clientY - inizio[1]; disegna(); }
  });
  const fine = e => {
    tocchi.delete(e.pointerId);
    if (tocchi.size < 2) pinch = null;
    if (!mosso && e.type === "pointerup") {
      const n = nodoA(e.clientX, e.clientY);
      if (n && n === selezionato && opz.onApri) opz.onApri(n);
      else { selezionato = n; if (opz.onSeleziona) opz.onSeleziona(n); }
      disegna();
    }
    trascinato = null;
  };
  tela.addEventListener("pointerup", fine);
  tela.addEventListener("pointercancel", fine);
  tela.addEventListener("dblclick", e => { const n = nodoA(e.clientX, e.clientY); if (n && opz.onApri) opz.onApri(n); });
  tela.addEventListener("wheel", e => {
    e.preventDefault();
    const r = tela.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    const f = Math.exp(-e.deltaY * .0015), k = Math.min(8, Math.max(.08, vista.k * f));
    vista.x = mx - (mx - vista.x) * k / vista.k; vista.y = my - (my - vista.y) * k / vista.k; vista.k = k; disegna();
  }, { passive: false });
  const ro = new ResizeObserver(dimensiona); ro.observe(tela);

  function adatta() {
    const vis = N.filter(n => n.vis); if (!vis.length) return;
    const r = tela.getBoundingClientRect();
    const xs = vis.map(n => n.x), ys = vis.map(n => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    vista.k = Math.min(3, Math.max(.08, .9 * Math.min(r.width / (x1 - x0 + 60), r.height / (y1 - y0 + 60))));
    vista.x = -(x0 + x1) / 2 * vista.k; vista.y = -(y0 + y1) / 2 * vista.k; disegna();
  }

  aggiornaVisibili();
  for (let i = 0; i < (N.length > 300 ? 260 : 160); i++) passo();
  calore = .5;
  dimensiona(); adatta(); ciclo();

  return {
    filtra(f) { Object.assign(filtro, f); if (f.query !== undefined) filtro.query = f.query.toLowerCase(); aggiornaVisibili(); disegna(); },
    seleziona(id) { const n = N.find(x => x.id === id); if (n) { selezionato = n; vista.k = Math.max(vista.k, 1.3); vista.x = -n.x * vista.k; vista.y = -n.y * vista.k; disegna(); } return n; },
    primoTrovato() { return N.find(n => n.vis && n.trovato) || null; },
    adatta,
    distruggi() { vivo = false; ro.disconnect(); },
  };
}
