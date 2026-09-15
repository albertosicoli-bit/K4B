# K4B Innovation Radar

Web app/PWA installabile per classificare e monitorare progetti, startup, call e opportunità.

## Pubblicazione con GitHub Pages

1. Crea su GitHub un nuovo repository, ad esempio `K4B-Innovation-Radar`.
2. Carica nella radice del repository tutti i file e la cartella `icons` di questo pacchetto.
3. Apri **Settings → Pages**.
4. In **Build and deployment**, seleziona **Deploy from a branch**.
5. Seleziona il branch `main`, cartella `/(root)`, quindi **Save**.
6. Dopo qualche minuto l'app sarà disponibile all'indirizzo indicato da GitHub Pages.

## Installazione

- **Computer (Chrome/Edge):** apri il sito pubblicato e premi **Installa app**. Se il pulsante non appare, usa l'icona di installazione nella barra degli indirizzi.
- **Android:** apri il sito con Chrome e scegli **Installa app** o **Aggiungi a schermata Home**.
- **iPhone/iPad:** apri con Safari, premi **Condividi**, quindi **Aggiungi alla schermata Home**.

L'app funziona anche offline dopo il primo caricamento. I dati restano nel browser del singolo dispositivo; per trasferirli usa l'esportazione JSON. Per condivisione reale tra più utenti serviranno login e database online.

## Aggiornamenti

Quando modifichi l'app, cambia `CACHE_NAME` in `sw.js` (per esempio da `k4b-radar-v1` a `k4b-radar-v2`). Nell'app puoi poi premere **Aggiorna app** senza cancellare i dati salvati.

## Avvio locale

Per provare correttamente installazione e modalità offline, servi la cartella tramite un server locale; l'apertura diretta del file `index.html` non abilita il service worker.
