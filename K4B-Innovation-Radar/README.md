# K4B Innovation Radar

Web app/PWA installabile per classificare e monitorare progetti, startup, call e opportunità. Versione 3: login Supabase e archivio online condiviso.

## Attivazione Cloud V3

1. Nel progetto Supabase esegui lo script delle tabelle già fornito nella conversazione.
2. Apri `02_Salvataggio_Atomico.sql`, copia tutto il contenuto e incollalo in una nuova query nel SQL Editor Supabase. Premi Run: deve risultare Success.
3. In Authentication → URL Configuration, imposta Site URL e Redirect URL a `https://albertosicoli-bit.github.io/K4B/`.
4. Verifica che il provider Email sia attivo e che gli accessi anonimi siano disabilitati.
5. Carica su GitHub i file di questo pacchetto, mantenendo index.html, cloud.js, cloud.css, sw.js, manifest e icons nella radice corretta.
6. Apri il sito e crea un account K4B. Non usare la password del database. Se Email Confirmation è attivo, conferma l'email ricevuta e poi accedi normalmente.
7. Dopo il login, dal PC con i vecchi dati apri Import / Export → Trasferisci dati locali nel cloud. Prima puoi scaricare il backup locale originale.
8. Accedi dal telefono e premi Sincronizza dati: i conteggi devono essere identici.

URL e chiave publishable del progetto sono configurati in cloud.js. Non sono chiavi segrete. La protezione dei dati dipende da Supabase Auth, grants e RLS; non inserire mai service_role o chiavi secret nel frontend.

### Accesso all'archivio

Tutti gli utenti registrati possono leggere, creare, modificare ed eliminare singoli record. Se abiliti la registrazione pubblica, chiunque si registri ottiene questi permessi. Per un gruppo chiuso, disabilita Allow new users to sign up nella configurazione Auth e crea gli account autorizzati da Authentication → Users → Add user / Create user. Questo pacchetto non implementa ruoli amministratore o revisore. Non abilitare gli utenti anonimi.

La registrazione email dipende dalla configurazione email di Supabase e dai suoi limiti di invio. Per prove con account autorizzati puoi creare gli utenti direttamente dalla dashboard con password dedicata e conferma email. Per molti utenti configura un servizio SMTP.

### Sincronizzazione e salvataggio

- Archivio condiviso PostgreSQL: nessuna copia locale è la sorgente principale.
- Controllo automatico ogni 10 secondi quando la pagina è visibile, più aggiornamento al ritorno in primo piano e al ripristino rete.
- Pulsante Sincronizza dati per la rilettura immediata. Non è una connessione WebSocket: la pubblicazione Realtime creata dal primo script resta disponibile per evoluzioni.
- Salvataggi tramite RPC transazionale, con controllo versione per record. Un conflitto annulla tutta la richiesta; l'utente deve sincronizzare e ripetere la modifica.
- Importazione aggiuntiva: gli ID esistenti vengono saltati, mai sovrascritti. Non viene eseguita alcuna migrazione automatica all'accesso.
- In caso di errore resta disponibile il download della modifica tentata; il file è un recupero manuale, non una coda di sincronizzazione.
- La cancellazione completa del cloud è disabilitata nell'interfaccia. Le cancellazioni singole richiedono conferma esplicita e rimuovono il record per tutti. Fai backup prima di eliminare.
- Le modifiche richiedono Internet. Senza rete puoi continuare a consultare i dati già aperti in memoria, ma una nuova apertura non ricarica l'archivio offline.
- Il service worker memorizza solo risorse della PWA: nessuna risposta Supabase viene memorizzata nella cache.

### Prova di accettazione

1. Accedi da PC e telefono.
2. Crea dal PC un progetto con nome univoco.
3. Premi Sincronizza dati sul telefono: deve comparire il progetto.
4. Aggiorna lo stato dal telefono, sincronizza il PC e verifica il risultato.
5. Chiudi e riapri entrambe le app: i dati devono provenire dal medesimo archivio online.
6. Esci: le schermate dell'archivio devono essere nascoste.

Verifiche eseguite durante lo sviluppo: test della logica con API/DOM simulati, salvataggio tra due client, timeline, conflitti, import idempotente, preservazione backup locale, refresh token, logout e blocco offline. Non sono stati eseguiti login o scritture nel progetto Supabase reale. Il test visivo in browser non era disponibile nell'ambiente di sviluppo: controllare desktop e telefono durante la prova di accettazione.

Documenti, assistente AI, audit storico, ripristino cancellazioni, ruoli avanzati e sincronizzazione offline non sono inclusi in V3.

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

Il guscio della PWA può aprirsi offline dopo il primo caricamento, ma login e caricamento dei dati condivisi richiedono Internet. I vecchi dati locali non vengono cancellati o trasferiti automaticamente.

## Aggiornamenti

Quando modifichi l'app, cambia `CACHE_NAME` in `sw.js` (per esempio da `k4b-radar-v3` a `k4b-radar-v4`). Il pulsante **Aggiorna app** aggiorna codice e grafica; **Sincronizza dati** rilegge il database.

## Avvio locale

Per provare correttamente installazione e modalità offline, servi la cartella tramite un server locale; l'apertura diretta del file `index.html` non abilita il service worker.
