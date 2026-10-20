// Copia src/ in dist/ e timbra la versione (per svuotare le cache dei browser a ogni pubblicazione).
import { cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

let versione = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : "";
if (!versione) { try { versione = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { versione = "dev"; } }
versione += "-" + Date.now().toString(36);

rmSync("dist", { recursive: true, force: true });
cpSync("src", "dist", { recursive: true });
const timbra = dir => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { timbra(p); continue; }
    if (!/\.(html|js|css|webmanifest)$/.test(f)) continue;
    const t = readFileSync(p, "utf8");
    if (t.includes("__VERSIONE__")) writeFileSync(p, t.replaceAll("__VERSIONE__", versione));
  }
};
timbra("dist");
writeFileSync("dist/.nojekyll", "");
writeFileSync("dist/versione.txt", versione + "\n");
console.log("dist/ pronto, versione", versione);
