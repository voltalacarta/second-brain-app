---
titolo: "documentazione"
type: "repo"
generato: true
---

# 📦 documentazione

<!-- File generato da .github/kg: non modificarlo a mano, viene riscritto a ogni aggiornamento. -->

> Decisioni: 0001.

[Apri su GitHub](https://github.com/voltalacarta/documentazione) · pubblica · 2 file Markdown

## Mappa delle cartelle

L'albero delle cartelle con quanti file contiene ciascuna; le frecce tratteggiate sono i rimandi più frequenti tra cartelle.

```mermaid
flowchart LR
  n0[("documentazione")]:::repo
  n1[/"radice<br/>1 file"/]:::cartella
  n2[/"10-decisioni<br/>1 file"/]:::cartella
  n0 --> n1
  n0 --> n2
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

## Concetti principali

[Pagamenti](../concetti/pagamenti.md) (1), [Stripe](../concetti/stripe.md) (1), [Indice](../concetti/indice.md) (1)

## File

### `(radice)`

| File | Sintesi | Stato |
| --- | --- | --- |
| [Documentazione di prova](../documenti/documentazione/documentazione-di-prova.md) | Decisioni: 0001. | attivo |

### `10-decisioni`

| File | Sintesi | Stato |
| --- | --- | --- |
| [Usare Stripe per le carte](../documenti/documentazione/usare-stripe-per-le-carte.md) | Si usa Stripe come gateway. | accettato |
