/* K4B Cloud v3 — no secret or service_role keys in this file. */
const CLOUD_URL = 'https://roiykbcgqdpkrguhtaqn.supabase.co';
const CLOUD_KEY = 'sb_publishable_tcaSdkLn9sU-5Kibv5v5jQ_GJxDE62c';
const CLOUD_SESSION_KEY = 'k4b_cloud_session_v3';
const CLOUD_RECOVERY_KEY = 'k4b_cloud_unsaved_v3';
let cloudSession = null;
let cloudSnapshot = { projects: [], opportunities: [] };
let cloudVersions = { projects: new Map(), opportunities: new Map() };
let cloudBusy = false;
let cloudReading = false;
let cloudReady = false;
let cloudRefreshPromise = null;
let cloudDetailId = null;
let cloudDetailDirty = false;
let cloudRecovery = null;
const cloudClone = value => JSON.parse(JSON.stringify(value));

function cloudStatus(text) {
  document.getElementById('syncStatus').textContent = text;
}

function cloudLock(locked) {
  document.body.classList.toggle('cloud-busy', locked);
}

function cloudCanEdit() {
  if (!cloudSession || !cloudReady || cloudBusy || cloudReading || !navigator.onLine) {
    alert('Modifica non disponibile: accedi, attendi la sincronizzazione e verifica la connessione.');
    return false;
  }
  return true;
}

function cloudPersistSession(session) {
  cloudSession = session;
  if (session && !session.expires_at) session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  try {
    if (session) localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(CLOUD_SESSION_KEY);
  } catch {
    document.getElementById('authMessage').textContent = 'Il browser non consente di mantenere il login: dovrai accedere nuovamente alla riapertura.';
  }
}

async function cloudRaw(path, method = 'GET', body, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = { apikey: CLOUD_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (path.startsWith('/rest/')) headers.Prefer = 'return=representation';
    const response = await fetch(CLOUD_URL + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', signal: controller.signal
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { result = null; }
    if (!response.ok) {
      const message = result?.msg || result?.message || result?.error_description || result?.error || ('HTTP ' + response.status);
      const error = new Error(message);
      error.status = response.status;
      error.code = result?.code;
      throw error;
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Tempo di attesa scaduto. Verifica la connessione e riprova.');
    throw error;
  } finally { clearTimeout(timeout); }
}

async function cloudEnsureSession() {
  if (!cloudSession) throw new Error('Accedi prima di continuare.');
  if (cloudSession.expires_at > Date.now() / 1000 + 90) return;
  if (!cloudRefreshPromise) {
    const refresh = async () => {
      // Another tab may already have rotated the refresh token.
      try {
        const cached = JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY));
        if (cached?.expires_at > Date.now() / 1000 + 90) { cloudSession = cached; return; }
        if (cached?.refresh_token) cloudSession = cached;
      } catch { /* Use in-memory session. */ }
      try {
        const session = await cloudRaw('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: cloudSession.refresh_token });
        cloudPersistSession(session);
      } catch (error) {
        if (error.status === 400 || error.status === 401) cloudShowLogin('Sessione scaduta: accedi nuovamente.');
        throw error;
      }
    };
    cloudRefreshPromise = (navigator.locks
      ? navigator.locks.request('k4b-auth-refresh', refresh)
      : refresh()).finally(() => { cloudRefreshPromise = null; });
  }
  await cloudRefreshPromise;
}

async function cloudApi(path, method = 'GET', body) {
  await cloudEnsureSession();
  return cloudRaw(path, method, body, cloudSession.access_token);
}

function cloudShowLogin(message = 'Accedi o crea il tuo account K4B.') {
  cloudReady = false;
  cloudPersistSession(null);
  cloudSnapshot = { projects: [], opportunities: [] };
  cloudVersions = { projects: new Map(), opportunities: new Map() };
  state = { projects: [], opportunities: [] };
  closeProject();
  renderAll();
  document.body.classList.remove('cloud-authenticated');
  document.getElementById('authMessage').textContent = message;
  cloudStatus('Accesso richiesto · V3');
}

async function cloudAuthenticate(signup = false) {
  const form = document.getElementById('authForm');
  if (!form.reportValidity()) return;
  const message = document.getElementById('authMessage');
  form.querySelectorAll('button').forEach(button => button.disabled = true);
  message.textContent = signup ? 'Creazione account…' : 'Accesso…';
  try {
    const credentials = {
      email: document.getElementById('authEmail').value.trim(),
      password: document.getElementById('authPassword').value
    };
    const path = signup
      ? '/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname)
      : '/auth/v1/token?grant_type=password';
    const session = await cloudRaw(path, 'POST', credentials);
    document.getElementById('authPassword').value = '';
    if (!session?.access_token) {
      message.textContent = 'Se la registrazione è consentita, riceverai una email. Conferma l’account, poi torna qui e premi Accedi. Controlla anche lo spam.';
      return;
    }
    cloudPersistSession(session);
    document.body.classList.add('cloud-authenticated');
    await cloudRefresh(true);
  } catch (error) {
    message.textContent = 'Accesso/registrazione non riusciti: ' + error.message;
  } finally { form.querySelectorAll('button').forEach(button => button.disabled = false); }
}

async function cloudRows(collection) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await cloudApi('/rest/v1/k4b_' + collection + '?select=id,data,version&order=id.asc&limit=500&offset=' + offset);
    if (!Array.isArray(page)) throw new Error('Risposta database non valida.');
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

function cloudValidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Il backup deve essere un oggetto JSON.');
  if (!Array.isArray(input.projects) || !Array.isArray(input.opportunities)) throw new Error('Il backup deve contenere gli elenchi projects e opportunities.');
  const clean = cloudClone(input);
  for (const collection of ['projects', 'opportunities']) {
    const seen = new Set();
    for (const item of clean[collection]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Record non valido.');
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(item.id)) throw new Error('ID non valido: usa lettere, numeri, trattini o underscore.');
      if (seen.has(item.id)) throw new Error('ID duplicato nel backup: ' + item.id);
      seen.add(item.id);
      if (typeof item.name !== 'string' || !item.name.trim()) throw new Error('Nome mancante nel record ' + item.id);
      for (const key of ['owner','email','eventName','sector','technology','maturity','status','need','traction','description','notes','createdAt','type','deadline']) {
        if (item[key] != null && typeof item[key] !== 'string') throw new Error('Campo ' + key + ' non valido in ' + item.id);
      }
      if (item.timeline != null && (!Array.isArray(item.timeline) || item.timeline.some(t => !t || typeof t.date !== 'string' || typeof t.text !== 'string'))) throw new Error('Timeline non valida in ' + item.id);
      if (collection === 'projects') item.score = calculateScore(item);
    }
  }
  return clean;
}

async function cloudRefresh(manual = false, force = false) {
  if (!cloudSession || cloudReading || (cloudBusy && !force)) return;
  cloudReading = true;
  cloudLock(true);
  try {
    if (manual) cloudStatus('Sincronizzazione…');
    const [projects, opportunities] = await Promise.all([cloudRows('projects'), cloudRows('opportunities')]);
    if (!cloudSession) return;
    const next = cloudValidate({
      projects: projects.map(row => ({ ...row.data, id: row.id })),
      opportunities: opportunities.map(row => ({ ...row.data, id: row.id }))
    });
    const changed = JSON.stringify(next) !== JSON.stringify(cloudSnapshot);
    for (const [collection, rows] of [['projects', projects], ['opportunities', opportunities]]) {
      cloudVersions[collection] = new Map(rows.map(row => [row.id, row.version]));
    }
    cloudSnapshot = cloudClone(next);
    state = cloudClone(next);
    cloudReady = true;
    if (changed || manual) {
      renderAll();
      if (cloudDetailId && !cloudDetailDirty) {
        if (state.projects.some(p => p.id === cloudDetailId)) openProject(cloudDetailId);
        else closeProject();
      }
    }
    cloudStatus('Cloud aggiornato · ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
  } catch (error) {
    cloudReady = false;
    if (error.status === 401) cloudShowLogin('Sessione non valida: accedi nuovamente.');
    cloudStatus('Sincronizzazione non disponibile');
    if (manual) alert('Impossibile caricare l’archivio: ' + error.message + '\nControlla che lo script SQL sia stato eseguito e che il progetto Supabase sia attivo.');
    if (force) throw error;
  } finally {
    cloudReading = false;
    cloudLock(cloudBusy);
  }
}

function cloudChanges(before, after) {
  const changes = [];
  for (const collection of ['projects', 'opportunities']) {
    const previous = new Map(before[collection].map(item => [item.id, item]));
    const current = new Map(after[collection].map(item => [item.id, item]));
    for (const [id, item] of current) {
      if (!previous.has(id) || JSON.stringify(previous.get(id)) !== JSON.stringify(item)) {
        changes.push({ collection, id, expected_version: previous.has(id) ? cloudVersions[collection].get(id) : null, data: item });
      }
    }
    for (const id of previous.keys()) {
      if (!current.has(id)) changes.push({ collection, id, expected_version: cloudVersions[collection].get(id), data: null });
    }
  }
  return changes;
}

async function cloudSaveState() {
  if (!cloudCanEdit()) { state = cloudClone(cloudSnapshot); renderAll(); return false; }
  cloudBusy = true;
  cloudLock(true);
  cloudStatus('Salvataggio nel cloud…');
  const attempt = cloudClone(state);
  let committed = false;
  try {
    const next = cloudValidate(attempt);
    const changes = cloudChanges(cloudSnapshot, next);
    if (changes.length) await cloudApi('/rest/v1/rpc/k4b_apply_changes', 'POST', { changes });
    committed = true;
    cloudSnapshot = cloudClone(next);
    state = cloudClone(next);
    renderAll();
    try { await cloudRefresh(false, true); }
    catch { cloudStatus('Salvato · rilettura da riprovare'); }
    return true;
  } catch (error) {
    cloudRecovery = attempt;
    try { sessionStorage.setItem(CLOUD_RECOVERY_KEY, JSON.stringify(attempt)); } catch { /* In-memory recovery remains available. */ }
    state = cloudClone(cloudSnapshot);
    renderAll();
    const conflict = error.code === '40001' || error.code === '23505';
    alert((conflict
      ? 'Un altro utente ha modificato lo stesso record. Il salvataggio è stato annullato: sincronizza e ripeti la modifica.'
      : 'Salvataggio non riuscito: ' + error.message)
      + '\nLa modifica tentata è disponibile in Import / Export → Scarica modifica non salvata.');
    try { await cloudRefresh(false, true); } catch { /* Keep last known data, read-only. */ }
    return false;
  } finally {
    cloudBusy = false;
    cloudLock(false);
    if (!committed) cloudStatus('Salvataggio annullato · verifica dati');
  }
}

function cloudReadFile(file) {
  if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('Il backup supera 10 MB. Dividilo in file più piccoli.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^\uFEFF/, ''));
    reader.onerror = () => reject(new Error('Il telefono non riesce a leggere il file. Scaricalo prima sul dispositivo e riprova.'));
    reader.onabort = () => reject(new Error('Lettura del file interrotta.'));
    reader.readAsText(file);
  });
}

async function cloudImport(input) {
  if (!cloudCanEdit()) return;
  const imported = cloudValidate(input);
  await cloudRefresh(true);
  if (!cloudCanEdit()) return;
  const next = cloudClone(cloudSnapshot);
  let added = 0, skipped = 0;
  for (const collection of ['projects', 'opportunities']) {
    const ids = new Set(next[collection].map(item => item.id));
    for (const item of imported[collection]) {
      if (ids.has(item.id)) { skipped++; continue; }
      next[collection].push(item);
      added++;
    }
  }
  if (!added) { alert('Nessun nuovo record: ' + skipped + ' ID già presenti sono stati saltati.'); return; }
  if (!confirm('Aggiungere ' + added + ' record all’archivio condiviso? ' + skipped + ' ID già presenti verranno saltati. Nessun record esistente sarà cancellato o sovrascritto.')) return;
  state = next;
  if (await saveState()) alert('Importazione completata nel cloud: ' + added + ' nuovi record.');
}

async function cloudMigrateLocal() {
  try {
    const original = localStorage.getItem(STORAGE_KEY);
    if (!original) { alert('Nessun vecchio archivio trovato in questo browser. Apri questa funzione sul PC/browser che contiene i dati oppure importa il backup JSON.'); return; }
    await cloudImport(JSON.parse(original));
  } catch (error) { alert('Trasferimento non riuscito: ' + error.message); }
}

function cloudExportLegacy() {
  if (!cloudSession) return;
  const original = localStorage.getItem(STORAGE_KEY);
  if (!original) { alert('Nessun backup locale originale in questo browser.'); return; }
  downloadFile('k4b_backup_locale_originale.json', original, 'application/json');
}

function cloudExportRecovery() {
  if (!cloudSession) return;
  let text = cloudRecovery ? JSON.stringify(cloudRecovery, null, 2) : null;
  try { text = text || sessionStorage.getItem(CLOUD_RECOVERY_KEY); } catch { /* Optional. */ }
  if (!text) { alert('Non ci sono modifiche non salvate da esportare.'); return; }
  downloadFile('k4b_modifica_non_salvata.json', text, 'application/json');
}

async function cloudLogout() {
  if (cloudBusy || cloudReading) { alert('Attendi la fine del salvataggio/sincronizzazione prima di uscire.'); return; }
  try { if (cloudSession) await cloudApi('/auth/v1/logout?scope=local', 'POST'); } catch { /* Always clear the local session. */ }
  cloudRecovery = null;
  try { sessionStorage.removeItem(CLOUD_RECOVERY_KEY); } catch { /* Optional. */ }
  cloudShowLogin();
}

async function initCloudApp() {
  document.getElementById('authForm').addEventListener('submit', event => { event.preventDefault(); cloudAuthenticate(false); });
  document.getElementById('signupBtn').addEventListener('click', () => cloudAuthenticate(true));
  // Keep editing controls in an open detail panel intact until saved/closed.
  const originalOpen = openProject;
  const originalClose = closeProject;
  openProject = id => { cloudDetailId = id; cloudDetailDirty = false; originalOpen(id); };
  closeProject = () => { cloudDetailId = null; cloudDetailDirty = false; originalClose(); };
  document.getElementById('projectDetail').addEventListener('input', () => { cloudDetailDirty = true; });
  document.getElementById('projectDetail').addEventListener('change', () => { cloudDetailDirty = true; });
  // Confirmation links can return URL tokens: discard them and require normal login.
  if (location.hash.includes('access_token=') || location.hash.includes('error=')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  try { cloudSession = JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)); } catch { cloudSession = null; }
  if (cloudSession?.access_token && cloudSession?.refresh_token) {
    document.body.classList.add('cloud-authenticated');
    await cloudRefresh(true);
  } else cloudShowLogin();
  setInterval(() => { if (!document.hidden && cloudSession) cloudRefresh(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cloudRefresh(); });
  window.addEventListener('online', () => cloudRefresh(true));
  window.addEventListener('offline', () => { cloudReady = false; cloudStatus('Offline · sola consultazione dei dati già aperti'); });
  window.addEventListener('storage', event => {
    if (event.key === CLOUD_SESSION_KEY && event.newValue === null) cloudShowLogin('Accesso terminato in un’altra scheda.');
  });
  window.addEventListener('beforeunload', event => { if (cloudBusy) { event.preventDefault(); event.returnValue = ''; } });
}
