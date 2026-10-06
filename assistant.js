(function () {
  "use strict";

  const STOP_WORDS = new Set([
    "a","ad","al","alla","alle","anche","che","chi","come","con","da","dal","dalla","dei","del","della","delle",
    "di","e","gli","ha","i","il","in","la","le","lo","mi","nel","nella","o","per","piu","quale","quali","sono",
    "su","tra","un","una","uno","vorrei","mostra","dimmi","elenca","progetto","progetti","opportunita"
  ]);

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function tokens(value) {
    return normalize(value).split(/[^a-z0-9]+/).filter(word => word.length > 2 && !STOP_WORDS.has(word));
  }

  function currentState() {
    const archive = typeof state === "object" && state ? state : {};
    return {
      projects: Array.isArray(archive.projects) ? archive.projects : [],
      opportunities: Array.isArray(archive.opportunities) ? archive.opportunities : []
    };
  }

  function projectText(project) {
    return normalize([project.name, project.owner, project.email, project.eventName, project.sector, project.technology,
      project.maturity, project.status, project.need, project.traction, project.description, project.notes,
      ...(project.timeline || []).flatMap(item => [item.date, item.text])].join(" "));
  }

  function opportunityText(opportunity) {
    return normalize([opportunity.name, opportunity.type, opportunity.sector, opportunity.deadline, opportunity.description].join(" "));
  }

  function sourceProject(project) { return { type: "project", id: project.id, name: project.name }; }
  function sourceOpportunity(opportunity) { return { type: "opportunity", id: opportunity.id, name: opportunity.name }; }
  function fmtScore(project) { return Number.isFinite(Number(project.score)) ? Number(project.score) + "/100" : "non disponibile"; }
  function safeDate(value) {
    if (!value) return "data non indicata";
    const date = new Date(value + (String(value).length === 10 ? "T12:00:00" : ""));
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("it-IT", { day:"2-digit", month:"long", year:"numeric" }).format(date);
  }

  function findNamedProject(question, projects) {
    const q = normalize(question);
    return [...projects].sort((a,b) => String(b.name || "").length - String(a.name || "").length)
      .find(project => project.name && q.includes(normalize(project.name)));
  }

  function detectedValue(question, values) {
    const q = normalize(question);
    return values.filter(Boolean).find(value => q.includes(normalize(value)));
  }

  function listProjects(projects, limit = 8) {
    return `<ul class="assistant-list">${projects.slice(0, limit).map(project => `<li><strong>${escapeHtml(project.name)}</strong> · ${escapeHtml(project.sector || "Settore non indicato")} · score ${escapeHtml(fmtScore(project))} · ${escapeHtml(project.status || "stato non indicato")}</li>`).join("")}</ul>`;
  }

  function listOpportunities(opportunities, limit = 8) {
    return `<ul class="assistant-list">${opportunities.slice(0, limit).map(item => `<li><strong>${escapeHtml(item.name)}</strong> · ${escapeHtml(item.type || "tipo non indicato")} · ${escapeHtml(item.sector || "settore non indicato")} · ${escapeHtml(safeDate(item.deadline))}</li>`).join("")}</ul>`;
  }

  function answerQuestion(question) {
    const archive = currentState();
    const projects = archive.projects;
    const opportunities = archive.opportunities;
    const q = normalize(question);

    if (!projects.length && !opportunities.length) {
      return { title:"Archivio vuoto", html:"<p>Non risultano progetti o opportunità nell’archivio sincronizzato. Importa dei dati oppure premi <strong>Sincronizza dati</strong> e riprova.</p>", sources:[], confidence:"Nessun dato" };
    }

    const named = findNamedProject(question, projects);
    if (named) {
      const matching = opportunities.filter(item => normalize(item.sector) === normalize(named.sector));
      if (/referent|contatt|email|responsabil|owner/.test(q)) {
        return { title:`Referente di ${named.name}`, html:`<p>Il referente registrato è <strong>${escapeHtml(named.owner || "non indicato")}</strong>${named.email ? `, contattabile all’indirizzo <strong>${escapeHtml(named.email)}</strong>` : ". Nell’archivio non è presente un indirizzo email."}</p>`, sources:[sourceProject(named)], confidence:"Risposta diretta" };
      }
      if (/cronolog|timeline|aggiornament|ultimo/.test(q)) {
        const timeline = [...(named.timeline || [])].sort((a,b) => String(b.date).localeCompare(String(a.date)));
        const html = timeline.length ? `<p>La cronologia contiene ${timeline.length} aggiornamenti:</p><ul class="assistant-list">${timeline.map(item => `<li><strong>${escapeHtml(safeDate(item.date))}</strong> · ${escapeHtml(item.text)}</li>`).join("")}</ul>` : "<p>Per questo progetto non sono presenti aggiornamenti in cronologia.</p>";
        return { title:`Cronologia di ${named.name}`, html, sources:[sourceProject(named)], confidence:"Risposta diretta" };
      }
      if (/opportun|bando|match|abbin/.test(q)) {
        return { title:`Opportunità per ${named.name}`, html: matching.length ? `<p>Ho trovato ${matching.length} opportunità nello stesso settore, <strong>${escapeHtml(named.sector)}</strong>:</p>${listOpportunities(matching)}` : `<p>Non risultano opportunità registrate per il settore <strong>${escapeHtml(named.sector || "non indicato")}</strong>.</p>`, sources:[sourceProject(named), ...matching.map(sourceOpportunity)], confidence:"Abbinamento per settore" };
      }
      return { title:named.name, html:`<p><strong>${escapeHtml(named.description || "Descrizione non presente.")}</strong></p><ul class="assistant-list"><li>Settore: ${escapeHtml(named.sector || "non indicato")}</li><li>Tecnologia: ${escapeHtml(named.technology || "non indicata")}</li><li>Stato e maturità: ${escapeHtml(named.status || "non indicato")} · ${escapeHtml(named.maturity || "non indicata")}</li><li>Score: ${escapeHtml(fmtScore(named))}</li><li>Bisogno: ${escapeHtml(named.need || "non indicato")}</li><li>Note: ${escapeHtml(named.notes || "nessuna nota")}</li></ul>`, sources:[sourceProject(named)], confidence:"Scheda progetto" };
    }

    if (/quanti|numero|totale|panoram|riepilog/.test(q)) {
      const active = projects.filter(project => ["Attivo","In crescita","Finanziato"].includes(project.status)).length;
      const high = projects.filter(project => Number(project.score) >= 75).length;
      const update = projects.filter(project => project.status === "Da aggiornare").length;
      return { title:"Riepilogo dell’archivio", html:`<p>Sono presenti <strong>${projects.length} progetti</strong> e <strong>${opportunities.length} opportunità</strong>. I progetti attivi sono ${active}; ${high} hanno score almeno 75/100 e ${update} risultano da aggiornare.</p>`, sources:projects.slice(0,10).map(sourceProject), confidence:"Conteggio completo" };
    }

    if (/scad|deadline|prima|prossim/.test(q) && /opportun|bando|evento|call/.test(q)) {
      const sorted = opportunities.filter(item => item.deadline).sort((a,b) => String(a.deadline).localeCompare(String(b.deadline)));
      return { title:"Scadenze delle opportunità", html:sorted.length ? `<p>Le opportunità ordinate dalla scadenza più vicina registrata sono:</p>${listOpportunities(sorted,10)}` : "<p>Nell’archivio non sono presenti opportunità con una scadenza indicata.</p>", sources:sorted.slice(0,10).map(sourceOpportunity), confidence:"Ordinamento per data" };
    }

    if (/match|abbin|colleg|compatib/.test(q) && /opportun|bando/.test(q)) {
      const matches = projects.map(project => ({ project, items: opportunities.filter(item => normalize(item.sector) === normalize(project.sector)) })).filter(row => row.items.length).sort((a,b) => b.project.score - a.project.score);
      const html = matches.length ? `<p>Gli abbinamenti sono basati sulla coincidenza del settore:</p><ul class="assistant-list">${matches.slice(0,10).map(row => `<li><strong>${escapeHtml(row.project.name)}</strong> → ${row.items.map(item => escapeHtml(item.name)).join(", ")}</li>`).join("")}</ul>` : "<p>Non ho trovato progetti e opportunità appartenenti allo stesso settore.</p>";
      return { title:"Abbinamenti progetto–opportunità", html, sources:matches.flatMap(row => [sourceProject(row.project), ...row.items.map(sourceOpportunity)]).slice(0,20), confidence:"Abbinamento per settore" };
    }

    const sectors = [...new Set([...projects.map(p => p.sector), ...opportunities.map(o => o.sector)])];
    const statuses = [...new Set(projects.map(p => p.status))];
    const maturities = [...new Set(projects.map(p => p.maturity))];
    const needs = [...new Set(projects.map(p => p.need))];
    const sector = detectedValue(question, sectors);
    const status = detectedValue(question, statuses);
    const maturity = detectedValue(question, maturities);
    const need = detectedValue(question, needs);

    let filtered = [...projects];
    if (sector) filtered = filtered.filter(project => project.sector === sector);
    if (status) filtered = filtered.filter(project => project.status === status);
    if (maturity) filtered = filtered.filter(project => project.maturity === maturity);
    if (need) filtered = filtered.filter(project => project.need === need);

    if (/score|potenzial|miglior|alto|priorit/.test(q) || sector || status || maturity || need) {
      filtered.sort((a,b) => Number(b.score || 0) - Number(a.score || 0));
      const filters = [sector, status, maturity, need].filter(Boolean);
      return { title:filters.length ? `Progetti: ${filters.join(" · ")}` : "Progetti con score più alto", html:filtered.length ? `<p>Ho trovato <strong>${filtered.length}</strong> progetti${filters.length ? " coerenti con i criteri indicati" : ", ordinati per score"}:</p>${listProjects(filtered,10)}` : "<p>Non risultano progetti che rispettano contemporaneamente i criteri indicati.</p>", sources:filtered.slice(0,10).map(sourceProject), confidence:"Filtro sui campi" };
    }

    const words = tokens(question);
    const rankedProjects = projects.map(project => {
      const text = projectText(project);
      const name = normalize(project.name);
      const score = words.reduce((total, word) => total + (name.includes(word) ? 5 : 0) + (text.includes(word) ? 1 : 0), 0);
      return { item:project, score };
    }).filter(row => row.score > 0).sort((a,b) => b.score - a.score || Number(b.item.score || 0) - Number(a.item.score || 0));
    const rankedOpportunities = opportunities.map(item => ({ item, score:words.reduce((total, word) => total + (normalize(item.name).includes(word) ? 5 : 0) + (opportunityText(item).includes(word) ? 1 : 0), 0) })).filter(row => row.score > 0).sort((a,b) => b.score - a.score);

    if (rankedProjects.length || rankedOpportunities.length) {
      const foundProjects = rankedProjects.slice(0,6).map(row => row.item);
      const foundOpportunities = rankedOpportunities.slice(0,6).map(row => row.item);
      return { title:"Risultati pertinenti nell’archivio", html:`<p>Ho cercato i concetti presenti nella domanda. Ecco i record più pertinenti:</p>${foundProjects.length ? `<h4>Progetti</h4>${listProjects(foundProjects,6)}` : ""}${foundOpportunities.length ? `<h4>Opportunità</h4>${listOpportunities(foundOpportunities,6)}` : ""}`, sources:[...foundProjects.map(sourceProject), ...foundOpportunities.map(sourceOpportunity)], confidence:"Ricerca testuale" };
    }

    return { title:"Nessuna evidenza sufficiente", html:"<p>Non trovo nei dati presenti elementi sufficienti per rispondere. Prova a indicare il nome di un progetto, un settore, uno stato, una tecnologia oppure chiedi delle scadenze o degli score.</p>", sources:[], confidence:"Nessun risultato" };
  }

  function renderAnswer(question, result) {
    const container = document.getElementById("assistantAnswer");
    const uniqueSources = result.sources.filter((source,index,list) => list.findIndex(item => item.type === source.type && item.id === source.id) === index);
    const sourceHtml = uniqueSources.length ? `<div class="assistant-sources"><strong>Fonti nell’archivio (${uniqueSources.length})</strong><div class="assistant-source-list">${uniqueSources.map(source => source.type === "project" ? `<button class="assistant-source" type="button" onclick="assistantOpenProject('${source.id}')">Progetto · ${escapeHtml(source.name)}</button>` : `<span class="assistant-source">Opportunità · ${escapeHtml(source.name)}</span>`).join("")}</div></div>` : "";
    container.innerHTML = `<div class="assistant-response-head"><div><h3>${escapeHtml(result.title)}</h3><span class="small">Domanda: ${escapeHtml(question)}</span></div><span class="assistant-confidence">${escapeHtml(result.confidence)}</span></div><div class="assistant-response-body">${result.html}${sourceHtml}</div>`;
  }

  window.askDataAssistant = function (event) {
    if (event) event.preventDefault();
    const input = document.getElementById("assistantQuestion");
    const question = String(input?.value || "").trim();
    if (!question) return;
    renderAnswer(question, answerQuestion(question));
  };

  window.askSuggestedQuestion = function (button) {
    const input = document.getElementById("assistantQuestion");
    input.value = button.textContent.trim();
    window.askDataAssistant();
  };

  window.assistantOpenProject = function (id) {
    const button = [...document.querySelectorAll("nav button")].find(item => normalize(item.textContent) === "progetti");
    showSection("projects", button);
    openProject(id);
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("assistantQuestion")?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        window.askDataAssistant();
      }
    });
  });
})();
