---
titolo: "Grafo della conoscenza"
type: "indice"
generato: true
---

# Grafo della conoscenza

<!-- File generato da .github/kg: non modificarlo a mano, viene riscritto a ogni aggiornamento. -->

**2 repo · 2 documenti · 6 note · 11 concetti · 22 collegamenti**

Le repo (cilindri blu) e i concetti più presenti, con quanti file li citano. Le frecce tratteggiate sono link tra repo. Ogni nome nelle tabelle apre la sua pagina.

```mermaid
flowchart LR
  n0[("documentazione<br/>2 file")]:::repo
  n1[("second-brain<br/>6 file")]:::repo
  n2(["Stripe<br/>3 file"]):::cat_strumento
  n3(["Indice<br/>2 file"]):::cat_tag
  n1 --> n2
  n0 --> n2
  n1 --> n3
  n0 --> n3
  classDef repo fill:#1f6feb,stroke:#1f6feb,color:#ffffff
  classDef documento fill:#f6f8fa,stroke:#8c959f,color:#1f2328
  classDef nota fill:#dafbe1,stroke:#1a7f37,color:#1f2328
  classDef concetto fill:#fff8c5,stroke:#9a6700,color:#1f2328
  classDef segnaposto fill:#ffffff,stroke:#8c959f,color:#57606a,stroke-dasharray:4 3
  classDef cartella fill:#ddf4ff,stroke:#0969da,color:#1f2328
  classDef centro fill:#9a6700,stroke:#9a6700,color:#ffffff
  classDef cat_strumento fill:#ddf4ff,stroke:#0969da,color:#1f2328
  classDef cat_metodo fill:#dafbe1,stroke:#1a7f37,color:#1f2328
  classDef cat_sicurezza fill:#ffebe9,stroke:#cf222e,color:#1f2328
  classDef cat_normativa fill:#fbefff,stroke:#8250df,color:#1f2328
  classDef cat_organizzazione fill:#fff1e5,stroke:#bc4c00,color:#1f2328
  classDef cat_idea fill:#f1e8d6,stroke:#7d4e00,color:#1f2328
  classDef cat_glossario fill:#f6f8fa,stroke:#57606a,color:#1f2328
  classDef cat_tag fill:#fff8c5,stroke:#9a6700,color:#1f2328
  classDef cat_tema fill:#fff8c5,stroke:#9a6700,color:#1f2328
  classDef cat_segnaposto fill:#ffffff,stroke:#8c959f,color:#57606a,stroke-dasharray:4 3
```

Legenda: 🟦 Strumenti · 🟨 Tag

## Repo

| Repo | File | Concetti principali | Ultimo aggiornamento |
| --- | --- | --- | --- |
| [documentazione](_grafo/repo/repo-documentazione.md) | 2 | [Pagamenti](_grafo/concetti/pagamenti.md), [Stripe](_grafo/concetti/stripe.md), [Indice](_grafo/concetti/indice.md) | — |
| [second-brain](_grafo/repo/repo-second-brain.md) 🔒 | 6 | [Stripe](_grafo/concetti/stripe.md), [Inbox](_grafo/concetti/inbox.md), [MePA](_grafo/concetti/mepa.md), [<img src=x onerror=alert(4)>](_grafo/concetti/img-src-x-onerror-alert-4.md), [Demo](_grafo/concetti/demo.md) | — |

## Concetti

| Concetto | Categoria | File | Repo |
| --- | --- | --- | --- |
| [Stripe](_grafo/concetti/stripe.md) | Strumenti | 3 | 2 |
| [Indice](_grafo/concetti/indice.md) | Tag | 2 | 2 |
| [<img src=x onerror=alert(4)>](_grafo/concetti/img-src-x-onerror-alert-4.md) | Da creare | 1 | 1 |
| [Cookie](_grafo/concetti/cookie.md) | Normativa | 1 | 1 |
| [Demo](_grafo/concetti/demo.md) | Tag | 1 | 1 |
| [idea-futura](_grafo/concetti/idea-futura.md) | Da creare | 1 | 1 |
| [Inbox](_grafo/concetti/inbox.md) | Tag | 1 | 1 |
| [MePA](_grafo/concetti/mepa.md) | Organizzazione | 1 | 1 |
| [Pagamenti](_grafo/concetti/pagamenti.md) | Tag | 1 | 1 |
| [Progetto](_grafo/concetti/progetto.md) | Tag | 1 | 1 |
| [Strumenti](20-aree/strumenti.md) | Tag | 1 | 1 |

## Altri modi di vedere il grafo

- **Interattivo, con ricerca e filtri:** apri questa repo in un Codespace: il grafo si apre da solo in una nuova scheda (oppure apri `_grafo/index.html` con il pulsante *Show Preview*).
- **Obsidian (telefono) o Foam (Codespace):** la vista grafo mostra note, documenti di tutte le repo e concetti.
- **Per cercare in fretta:** [indice compatto](_grafo/indice.md) · [manutenzione](_grafo/revisione.md) · [parole chiave suggerite](_grafo/suggerimenti.md)
