# Claude · regole dell'app web del second brain

Repo **pubblica**: solo codice. Mai note vere, dati dell'azienda o token, nemmeno nei test (usa `test/fixture/`, inventate).

## Spendere pochi token

- Mappa dei file nel README («Sviluppo»). Apri solo il modulo che serve.
- Zero dipendenze: non aggiungere librerie né CDN (la CSP le bloccherebbe e il token deve restare al sicuro).

## Prima di ogni push

```bash
npm test && npm run build && npm run e2e
```

Tutto verde, poi commit `app: …` e push: l'Action prova di nuovo e pubblica su Pages.

## Regole fisse

- Il token va solo a `https://api.github.com` (costante in `github.js`), mai in URL o log.
- Il renderer in `md.js` non deve mai lasciare passare HTML grezzo o schemi diversi da http, https, mailto.
- Niente stili o script in linea (CSP `'self'`).
- File generati del second brain (`_grafo/`, `grafo.md`, `.github/`) in sola lettura.
- Testi dell'interfaccia in italiano semplice.
