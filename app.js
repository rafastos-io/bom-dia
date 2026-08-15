// BOM DIA v2 — assistente + 4 áreas
let TASKS = [];
let AREA = "hoje";
let FILTER = "ativas";
let PRIO = "todas";
let SORT = "auto";
let LATE_ONLY = false;
let SEARCH = "";
let VIEW = localStorage.getItem("bomdia_view") || "cards";
let CONFIG = { configured: false, name: "" };
let PROJECTS = [];       // projetos como entidade (escopo, links, envolvidos)
let PROJ_OPEN = null;    // nome do projeto aberto na "central" (isolado), ou null
let PROJ_TAB = "demandas"; // sub-aba da central: demandas | anotacoes | links
let NOTES = [];          // anotações do projeto aberto
let NOTE_OPEN = null;    // id da anotação aberta
let IDEA_LINKS = [];     // vínculos da ideia em edição no modal (temporário)
let IDEA_SELF = null;    // id da ideia em edição (pra não vincular a si mesma)
let SHOW_ARCHIVED = false; // pasta oculta aberta na página de Projetos
let ARCHIVED_NAMES = new Set(); // nomes (lowercase) de projetos ocultos — recalculado em render()
let ARCHIVED_IDS = new Set();   // ids de projetos ocultos — recalculado em render()

const el = (id) => document.getElementById(id);
const AREA_LABEL = { hoje: "Hoje", agenda: "Agenda", projetos: "Projetos", ideias: "Ideias", rotina: "Rotina" };
const TIPO_LABEL = { tarefa: "Tarefa", ideia: "Ideia", rotina: "Rotina" };
const AREA_TIPO = { hoje: "tarefa", ideias: "ideia", rotina: "rotina" }; // área -> tipo preset
const PRIO_RANK = { alta: 0, media: 1, baixa: 2 };
const PRIO_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" };
const RECOR_LABEL = { diaria: "Diária", semanal: "Semanal", mensal: "Mensal" };
const PERIODO_LABEL = { diaria: "hoje", semanal: "nesta semana", mensal: "neste mês" };

// Uma tarefa pertence à "área" de navegação conforme tipo/projeto (dimensões cruzadas)
function inArea(t, area) {
  const tipo = t.tipo || "tarefa";
  if (area === "hoje") return tipo === "tarefa";
  if (area === "agenda") return !!(t.due_date || "").trim();
  if (area === "ideias") return tipo === "ideia";
  if (area === "rotina") return tipo === "rotina";
  if (area === "projetos") return !!(t.projeto || "").trim();
  return true;
}

// Recalcula quais projetos estão ocultos (chamado no início de render()).
function refreshArchivedSets() {
  ARCHIVED_NAMES = new Set();
  ARCHIVED_IDS = new Set();
  for (const p of PROJECTS) {
    if ((p.status || "ativo") !== "ativo") {
      ARCHIVED_NAMES.add((p.name || "").trim().toLowerCase());
      ARCHIVED_IDS.add(p.id);
    }
  }
}

// Uma tarefa/rotina/ideia é "oculta" se pertence (ou está conectada) a um projeto oculto.
function taskHidden(t) {
  const proj = (t.projeto || "").trim().toLowerCase();
  // O projeto aberto na central sempre aparece por inteiro (pra conferir/editar demandas).
  if (PROJ_OPEN && proj && proj === PROJ_OPEN.trim().toLowerCase()) return false;
  if (proj && ARCHIVED_NAMES.has(proj)) return true;
  const ls = t.idea_links || [];
  if (ls.some((l) => l.target_type === "projeto" && ARCHIVED_IDS.has(l.target_id))) return true;
  return false;
}

// --- Ícones (SVG inline, estilo Material arredondado) ---------------
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  sun: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" ${S}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" ${S}><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>`,
  grip: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" ${S}><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/></svg>`,
  repeat: `<svg viewBox="0 0 24 24" ${S}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.2V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.1 15H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.2-2.7l-.1-.1A2 2 0 1 1 8 5.4l.1.1A1.6 1.6 0 0 0 11 4.4V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8Z"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.8L12 2.5Z"/><path d="M19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${S}><path d="M12 5v14M5 12h14"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  list: `<svg viewBox="0 0 24 24" ${S}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>`,
  columns: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="16" rx="1.5"/><rect x="16" y="4" width="5" height="16" rx="1.5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" ${S}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${S}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  link: `<svg viewBox="0 0 24 24" ${S}><path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" ${S}><path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${S}><path d="M6 9l6 6 6-6"/></svg>`,
  people: `<svg viewBox="0 0 24 24" ${S}><circle cx="9" cy="8" r="3"/><path d="M15 11a3 3 0 1 0-2-5.2"/><path d="M3.5 20c0-3 2.6-5 5.5-5s5.5 2 5.5 5"/><path d="M16 15.2c2.4.3 4.5 2 4.5 4.8"/></svg>`,
  back: `<svg viewBox="0 0 24 24" ${S}><path d="M15 18l-6-6 6-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${S}><path d="M20 6 9 17l-5-5"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${S}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" ${S}><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 8.8c0-.3.3-.5.5-.5h.8c.2 0 .4.1.5.4l.5 1.3c.1.2 0 .4-.1.5l-.5.6c.5 1 1.3 1.8 2.3 2.3l.6-.5c.1-.1.3-.2.5-.1l1.3.5c.3.1.4.3.4.5v.8c0 .3-.2.5-.5.5A6 6 0 0 1 8.5 8.8Z" fill="currentColor" stroke="none"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" ${S}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeoff: `<svg viewBox="0 0 24 24" ${S}><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a13.4 13.4 0 0 1-2.2 2.9M6.6 6.6A13.3 13.3 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4.4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" ${S}><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>`,
};
function ic(name) { return `<span class="i">${ICONS[name] || ""}</span>`; }
function injectIcons() {
  document.querySelectorAll("[data-icon]").forEach((n) => {
    if (!n.dataset.filled) { n.innerHTML = ICONS[n.dataset.icon] || ""; n.dataset.filled = "1"; }
  });
}

// --- Saudação -------------------------------------------------------
function greetWord() {
  const h = new Date().getHours();
  if (h >= 12 && h < 18) return "Boa tarde";
  if (h >= 18 || h < 5) return "Boa noite";
  return "Bom dia";
}

// --- API ------------------------------------------------------------
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}
async function loadTasks() {
  TASKS = await api("GET", "/api/tasks");
  PROJECTS = await api("GET", "/api/projects");
  render();
}
async function loadStatus() { CONFIG = await api("GET", "/api/ai/status"); }

// --- Helpers de dados -----------------------------------------------
function isLate(t) {
  if (!t.due_date || t.status === "concluida") return false;
  return t.due_date < new Date().toISOString().slice(0, 10);
}
function fmtDate(d) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}`; }
function activeTasks() { return TASKS.filter((t) => t.status !== "concluida"); }

function matchesFilters(t, { ignoreStatus = false, ignoreArea = false } = {}) {
  if (taskHidden(t)) return false;
  if (AREA === "projetos" && PROJ_OPEN) {
    // central: só as demandas do projeto no grid; ideias vão como post-it à parte
    if ((t.tipo || "") === "ideia") return false;
    if ((t.projeto || "").trim() !== PROJ_OPEN) return false;
  } else if (!ignoreArea && !inArea(t, AREA)) return false;
  if (!ignoreStatus) {
    if (FILTER === "ativas" && t.status === "concluida") return false;
    if (FILTER === "concluida" && t.status !== "concluida") return false;
  }
  if (PRIO !== "todas" && t.priority !== PRIO) return false;
  if (LATE_ONLY && !isLate(t)) return false;
  if (SEARCH) {
    const hay = `${t.title} ${t.requested_by} ${t.send_to} ${t.description}`.toLowerCase();
    if (!hay.includes(SEARCH.toLowerCase())) return false;
  }
  return true;
}

function sortTasks(list) {
  const arr = [...list], far = "9999-12-31";
  if (SORT === "prazo") arr.sort((a, b) => (a.due_date || far).localeCompare(b.due_date || far));
  else if (SORT === "criacao") arr.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  else if (SORT === "az") arr.sort((a, b) => a.title.localeCompare(b.title, "pt"));
  else arr.sort((a, b) => {
    const dc = (a.status === "concluida") - (b.status === "concluida"); if (dc) return dc;
    const dp = PRIO_RANK[a.priority] - PRIO_RANK[b.priority]; if (dp) return dp;
    return (a.due_date || far).localeCompare(b.due_date || far);
  });
  return arr;
}

// --- Render principal -----------------------------------------------
function render() {
  refreshArchivedSets();
  // nav
  document.querySelectorAll(".nav-item[data-area]").forEach((b) =>
    b.classList.toggle("active", b.dataset.area === AREA));
  for (const a of Object.keys(AREA_LABEL)) {
    const n = TASKS.filter((t) => inArea(t, a) && t.status !== "concluida" && !taskHidden(t)).length;
    const badge = document.querySelector(`[data-count="${a}"]`);
    if (badge) badge.textContent = n || "";
  }
  refreshProjetosDatalist();

  const isHoje = AREA === "hoje";
  el("dashboard").classList.toggle("hidden", !isHoje);
  el("areaHeader").classList.toggle("hidden", isHoje);
  if (isHoje) renderDashboard();
  else el("areaTitle").textContent = AREA_LABEL[AREA];

  el("projHead").classList.toggle("hidden", AREA !== "projetos");

  // Agenda: calendário mensal no lugar da barra de ferramentas + board
  const isAgenda = AREA === "agenda";
  document.querySelectorAll(".toolbar").forEach((t) => t.classList.toggle("hidden", isAgenda));
  el("calendar").classList.toggle("hidden", !isAgenda);
  if (isAgenda) {
    el("board").classList.add("hidden");
    el("empty").classList.add("hidden");
    renderCalendar();
    injectIcons();
    return;
  }

  el("statusFilters").style.opacity = VIEW === "kanban" ? ".4" : "1";
  el("statusFilters").style.pointerEvents = VIEW === "kanban" ? "none" : "auto";
  [...el("viewToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.view === VIEW));

  const board = el("board");
  board.innerHTML = "";

  if (AREA === "projetos") {
    el("areaHeader").classList.add("hidden");
    const central = !!PROJ_OPEN;
    document.querySelectorAll(".toolbar").forEach((t) => t.classList.toggle("hidden", !central));
    if (central) { renderProjectCentral(board); }
    else { board.className = "board view-projetos"; renderProjectsList(board); }
    injectIcons();
    return;
  }

  board.className = "board view-" + VIEW;
  if (AREA === "ideias") {
    board.className = "board view-postits";
    const ideas = sortTasks(TASKS.filter((t) => matchesFilters(t)));
    el("empty").classList.toggle("hidden", ideas.length > 0);
    el("empty").textContent = "Nenhuma ideia ainda. Anote a próxima que surgir 💡";
    ideas.forEach((i) => board.appendChild(postit(i)));
    injectIcons(); return;
  }
  if (VIEW === "kanban") { renderKanban(board); injectIcons(); return; }
  const list = sortTasks(TASKS.filter((t) => matchesFilters(t)));
  el("empty").classList.toggle("hidden", list.length > 0);
  el("empty").textContent = "Nada por aqui ainda. Respire — e adicione quando precisar. ☕";
  for (const t of list) board.appendChild(VIEW === "lista" ? listRow(t) : card(t));
  injectIcons();
}

function renderDashboard() {
  el("greeting").textContent = greetWord() + (CONFIG.name ? `, ${CONFIG.name}` : "");
  const ativas = activeTasks().filter((t) => !taskHidden(t));
  const atrasadas = TASKS.filter((t) => isLate(t) && !taskHidden(t)).length;
  let sub = ativas.length === 0 ? "Tudo tranquilo por aqui." :
    `Você tem ${ativas.length} tarefa${ativas.length > 1 ? "s" : ""} ativa${ativas.length > 1 ? "s" : ""}`;
  if (atrasadas > 0) sub += ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}`;
  el("subtitle").textContent = sub;

  // 3 prioridades (entre as tarefas acionáveis)
  const top = sortTasks(ativas.filter((t) => (t.tipo || "tarefa") === "tarefa")).slice(0, 3);
  const pr = el("priorities");
  pr.innerHTML = top.length ? "" : `<p class="focus-empty">Sem prioridades definidas.</p>`;
  top.forEach((t, i) => {
    const line = document.createElement("div");
    line.className = "prio-line";
    const meta = [t.projeto || TIPO_LABEL[t.tipo || "tarefa"], t.due_date && (isLate(t) ? "atrasada" : fmtDate(t.due_date))].filter(Boolean).join(" · ");
    line.innerHTML = `<span class="prio-rank">${i + 1}</span><div class="prio-body"><div class="prio-name">${esc(t.title)}</div><div class="prio-meta">${esc(meta)}</div></div>`;
    line.addEventListener("click", () => openModal(t));
    pr.appendChild(line);
  });

  // agenda (ativas com prazo, mais próximas)
  const withDue = ativas.filter((t) => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
  const ag = el("agenda");
  ag.innerHTML = withDue.length ? "" : `<p class="focus-empty">Nenhum prazo à vista.</p>`;
  withDue.forEach((t) => {
    const line = document.createElement("div");
    line.className = "agenda-line";
    line.innerHTML = `<span class="agenda-date ${isLate(t) ? "late" : ""}">${fmtDate(t.due_date)}</span><span class="agenda-name">${esc(t.title)}</span>`;
    line.addEventListener("click", () => openModal(t));
    ag.appendChild(line);
  });
}

// --- Componentes compartilhados -------------------------------------
function metaHTML(t, { hideProjeto = false } = {}) {
  let m = `<span class="tag prio-${t.priority}">${PRIO_LABEL[t.priority] || t.priority}</span>`;
  if ((t.tipo || "tarefa") !== "tarefa") {
    const rec = t.recorrencia && RECOR_LABEL[t.recorrencia] ? ` · ${RECOR_LABEL[t.recorrencia]}` : "";
    m += `<span class="tag tipo">${TIPO_LABEL[t.tipo]}${rec}</span>`;
  }
  if (!hideProjeto && (t.projeto || "").trim()) m += `<span class="tag projeto">${esc(t.projeto)}</span>`;
  if (t.due_date) m += `<span class="tag ${isLate(t) ? "due-late" : ""}">${fmtDate(t.due_date)}</span>`;
  return m;
}
// Botão de check da rotina: vale pro período atual, reseta sozinho na virada
function routineHTML(t) {
  if ((t.tipo || "tarefa") !== "rotina" || !(t.recorrencia || "")) return "";
  const per = PERIODO_LABEL[t.recorrencia] || "";
  return `<button class="routine-check${t.feita ? " feita" : ""}" data-routine="1"
    title="Recorrência ${RECOR_LABEL[t.recorrencia].toLowerCase()} — clique pra ${t.feita ? "desfazer" : "marcar"}">
    ${ic(t.feita ? "check" : "repeat")} ${t.feita ? `Feito ${per}` : `Marcar feito ${per}`}</button>`;
}
// Vínculos de ideia (fase 3): chips navegáveis pra projeto/rotina/tarefa
function ideaChipKind(l) {
  if (l.target_type === "projeto") return "projeto";
  return (l.target_tipo || l.target_type) === "rotina" ? "rotina" : "tarefa";
}
function ideaLinkIcon(l) {
  if (l.target_type === "projeto") return "layers";
  return (l.target_tipo || l.target_type) === "rotina" ? "repeat" : "list";
}
function ideaChipHTML(l, mini = false) {
  const kind = ideaChipKind(l);
  return `<button class="idea-chip ${kind}${mini ? " mini" : ""}" data-ilink="${l.target_type}:${l.target_id}"
    title="${kind === "projeto" ? "Projeto" : kind === "rotina" ? "Rotina" : "Tarefa"}: ${esc(l.label)}">${ic(ideaLinkIcon(l))} ${esc(l.label)}</button>`;
}
function ideaLinksHTML(t) {
  const ls = t.idea_links || [];
  if (!ls.length) return "";
  return `<div class="idea-links">${ls.map((l) => ideaChipHTML(l)).join("")}</div>`;
}
function openIdeaTarget(tt, id) {
  if (tt === "projeto") {
    const p = PROJECTS.find((x) => x.id === id);
    if (!p) { toast("Projeto não encontrado (foi excluído?)", true); return; }
    if ((p.status || "ativo") !== "ativo") SHOW_ARCHIVED = true; // cai dentro da pasta oculta
    AREA = "projetos"; openProject(p.name);
    return;
  }
  const t = TASKS.find((x) => x.id === id);
  if (t) openModal(t);
  else toast("Não encontrei o alvo (foi excluído?)", true);
}

// Post-it: uma ideia vive na sua hierarquia mais profunda (tarefa/rotina > projeto).
function ideaHome(idea) {
  const ls = idea.idea_links || [];
  const t = ls.find((l) => l.target_type === "tarefa");
  if (t) return { type: "tarefa", id: t.target_id, key: `tarefa:${t.target_id}` };
  const r = ls.find((l) => l.target_type === "rotina");
  if (r) return { type: "rotina", id: r.target_id, key: `rotina:${r.target_id}` };
  const p = ls.find((l) => l.target_type === "projeto");
  if (p) return { type: "projeto", id: p.target_id, name: p.label, key: `projeto:${p.target_id}` };
  return null;
}
function ideasHomedOnTask(taskId) {
  return TASKS.filter((t) => (t.tipo || "") === "ideia").filter((i) => {
    const h = ideaHome(i); return h && (h.type === "tarefa" || h.type === "rotina") && h.id === taskId;
  });
}
function ideasHomedOnProject(projName) {
  return TASKS.filter((t) => (t.tipo || "") === "ideia").filter((i) => {
    const h = ideaHome(i); return h && h.type === "projeto" && h.name === projName;
  });
}
function postit(idea, { mini = false, exclude = null } = {}) {
  const c = document.createElement("div");
  c.className = "postit" + (mini ? " mini" : "");
  c.dataset.id = idea.id;
  const chips = (idea.idea_links || [])
    .filter((l) => `${l.target_type}:${l.target_id}` !== exclude)
    .map((l) => ideaChipHTML(l, true)).join("");
  c.innerHTML = `
    <div class="postit-pin"></div>
    <div class="postit-title">${esc(idea.title)}</div>
    ${idea.description ? `<div class="postit-desc">${esc(idea.description)}</div>` : ""}
    ${chips ? `<div class="idea-links">${chips}</div>` : ""}`;
  c.addEventListener("click", (e) => { if (e.target.closest("[data-ilink]")) return; openModal(idea); });
  c.querySelectorAll("[data-ilink]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const [tt, id] = b.dataset.ilink.split(":");
    openIdeaTarget(tt, Number(id));
  }));
  return c;
}
function linksHTML(t) {
  return (t.links || []).map((l) =>
    `<button class="link-btn" data-kind="${l.kind}" data-target="${esc(l.target)}" title="${esc(l.target)}">${ic(l.kind === "pasta" ? "folder" : "link")} ${esc(l.label || l.target)}</button>`
  ).join("");
}
function subtasksHTML(t) {
  const subs = t.subtasks || [];
  if (!subs.length) return "";
  const done = subs.filter((s) => s.done).length;
  const pct = Math.round((done / subs.length) * 100);
  // No card: só o progresso (o checklist completo fica no popup).
  return `<div class="card-subs">
    <div class="subs-head"><span>Subtarefas</span><span class="subs-count">${done}/${subs.length}</span></div>
    <div class="subs-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}
function subBadge(t) {
  const subs = t.subtasks || [];
  if (!subs.length) return "";
  const done = subs.filter((s) => s.done).length;
  return ` <span class="sub-badge${done === subs.length ? " full" : ""}">☑ ${done}/${subs.length}</span>`;
}
function statusSelectHTML(t) {
  return `<select class="status-select">
    <option value="aberta"${t.status === "aberta" ? " selected" : ""}>Aberta</option>
    <option value="andamento"${t.status === "andamento" ? " selected" : ""}>Em andamento</option>
    <option value="concluida"${t.status === "concluida" ? " selected" : ""}>Concluída</option></select>`;
}
function wireCard(c, t) {
  const title = c.querySelector(".card-title");
  if (title) title.addEventListener("click", () => openModal(t));
  const sel = c.querySelector(".status-select");
  if (sel) sel.addEventListener("change", async (e) => { await api("PUT", `/api/tasks/${t.id}`, { status: e.target.value }); loadTasks(); });
  c.querySelectorAll(".link-btn").forEach((b) => b.addEventListener("click", () => openLink(b.dataset.kind, b.dataset.target)));
  c.querySelectorAll("[data-sub]").forEach((cb) => cb.addEventListener("change", async (e) => {
    e.stopPropagation();
    await api("PUT", `/api/subtasks/${cb.dataset.sub}`, { done: cb.checked ? 1 : 0 });
    loadTasks();
  }));
  const rc = c.querySelector("[data-routine]");
  if (rc) rc.addEventListener("click", async (e) => {
    e.stopPropagation();
    await api("POST", `/api/tasks/${t.id}/feito`, { done: !t.feita });
    loadTasks();
  });
  const wc = c.querySelector("[data-whats]");
  if (wc) wc.addEventListener("click", (e) => { e.stopPropagation(); openWhatsapp(t); });
  c.querySelectorAll("[data-ilink]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const [tt, id] = b.dataset.ilink.split(":");
    openIdeaTarget(tt, Number(id));
  }));
}

function card(t, metaOpts = {}) {
  const c = document.createElement("div");
  const isIdea = (t.tipo || "tarefa") === "ideia";
  c.className = `card ${t.priority}` + (t.status === "concluida" ? " done" : "") + (isIdea ? " idea" : "");
  c.draggable = true; c.dataset.id = t.id;
  let people = "";
  if (t.requested_by) people += `<span>Pediu: <b>${esc(t.requested_by)}</b></span>`;
  if (t.send_to) people += `<span>Enviar p/: <b>${esc(t.send_to)}</b></span>`;
  const links = linksHTML(t);
  c.innerHTML = `
    <div class="card-head"><span class="dot dot-${t.priority} card-dot" title="${PRIO_LABEL[t.priority]}"></span><div class="card-title">${esc(t.title)}</div></div>
    <div class="card-meta">${metaHTML(t, metaOpts)}</div>
    ${ideaLinksHTML(t)}
    ${t.description ? `<div class="card-desc">${esc(t.description)}</div>` : ""}
    ${subtasksHTML(t)}
    ${links ? `<div class="card-links">${links}</div>` : ""}
    <div class="card-foot">${routineHTML(t)}<button type="button" class="btn-icon card-whats" data-whats="1" title="Gerar recado pro WhatsApp">${ICONS.whatsapp}</button>${statusSelectHTML(t)}</div>`;
  wireCard(c, t); addDrag(c, t);
  // ideias vinculadas a esta tarefa/rotina aparecem aqui dentro (post-it)
  if (!isIdea) {
    const homed = ideasHomedOnTask(t.id);
    if (homed.length) {
      const wrap = document.createElement("div");
      wrap.className = "card-ideas";
      const exKey = `${t.tipo === "rotina" ? "rotina" : "tarefa"}:${t.id}`;
      homed.forEach((i) => wrap.appendChild(postit(i, { mini: true, exclude: exKey })));
      c.insertBefore(wrap, c.querySelector(".card-foot"));
    }
  }
  return c;
}

function listRow(t) {
  const r = document.createElement("div");
  const isIdea = (t.tipo || "tarefa") === "ideia";
  r.className = `list-row ${t.priority}` + (t.status === "concluida" ? " done" : "") + (isIdea ? " idea" : "");
  r.draggable = true; r.dataset.id = t.id;
  const people = [t.requested_by && `de ${esc(t.requested_by)}`, t.send_to && `→ ${esc(t.send_to)}`].filter(Boolean).join("  ");
  const ilinks = (t.idea_links || []).map((l) => ideaChipHTML(l, true)).join("");
  r.innerHTML = `
    <span class="dot dot-${t.priority}" title="${PRIO_LABEL[t.priority]}"></span>
    <span class="list-title card-title">${esc(t.title)}${subBadge(t)}</span>
    <span class="list-people">${[people, ilinks].filter(Boolean).join(" ")}</span>
    <span class="list-due">${routineHTML(t) || (t.due_date ? (isLate(t) ? "⚠ " : "") + fmtDate(t.due_date) : "")}</span>
    <span class="list-links">${linksHTML(t)}</span>
    <span class="list-status">${statusSelectHTML(t)}</span>`;
  wireCard(r, t); addDrag(r, t);
  return r;
}

const COLUMNS = [{ key: "aberta", label: "Aberta" }, { key: "andamento", label: "Em andamento" }, { key: "concluida", label: "Concluída" }];
function renderKanban(board) {
  const list = TASKS.filter((t) => matchesFilters(t, { ignoreStatus: true }));
  el("empty").classList.add("hidden");
  for (const col of COLUMNS) {
    const colEl = document.createElement("div");
    colEl.className = "kcol"; colEl.dataset.status = col.key;
    const items = sortTasks(list.filter((t) => (t.status || "aberta") === col.key));
    colEl.innerHTML = `<div class="kcol-head">${col.label}<span class="kcount">${items.length}</span></div>`;
    const body = document.createElement("div"); body.className = "kcol-body";
    items.forEach((t) => body.appendChild(card(t)));
    colEl.appendChild(body); addDropzone(colEl, col.key); board.appendChild(colEl);
  }
}

// --- Projetos como entidade -----------------------------------------
function projLinksChips(p) {
  return (p.links || []).map((l) =>
    `<button class="link-btn" data-kind="${l.kind}" data-target="${esc(l.target)}" title="${esc(l.target)}">${ic(l.kind === "pasta" ? "folder" : "link")} ${esc(l.label || l.target)}</button>`
  ).join("");
}
function wireProjLinks(scope) {
  scope.querySelectorAll(".proj-links-row .link-btn").forEach((b) =>
    b.addEventListener("click", () => openLink(b.dataset.kind, b.dataset.target)));
}

// Lista de projetos (com colapsar) ------------------------------------
function renderProjectsList(board) {
  const isArch = (p) => (p.status || "ativo") !== "ativo";
  const showing = PROJECTS.filter((p) => (SHOW_ARCHIVED ? isArch(p) : !isArch(p)));

  if (SHOW_ARCHIVED) {
    el("projHead").innerHTML = `
      <button class="btn-ghost proj-back" id="btnArchBack">${ICONS.back} Projetos</button>
      <div class="proj-list-topbar">
        <h1 class="greeting">Ocultos</h1>
      </div>`;
    el("btnArchBack").addEventListener("click", () => { SHOW_ARCHIVED = false; render(); });
  } else {
    // Acesso discreto (ícone só, sem contagem): sempre presente pra não denunciar que há ocultos.
    el("projHead").innerHTML = `
      <div class="proj-list-topbar">
        <h1 class="greeting">Projetos</h1>
        <div class="proj-topbar-actions">
          <button class="btn-soft" id="btnNewProject"><span data-icon="plus"></span> Novo projeto</button>
          <button class="btn-icon proj-hidden-access" id="btnShowArchived" title="Ocultos">${ICONS.eyeoff}</button>
        </div>
      </div>`;
    el("btnNewProject").addEventListener("click", () => openProjectModal(null));
    el("btnShowArchived").addEventListener("click", () => { SHOW_ARCHIVED = true; render(); });
  }

  board.innerHTML = "";
  el("empty").classList.toggle("hidden", showing.length > 0);
  el("empty").textContent = SHOW_ARCHIVED
    ? "Nenhum projeto oculto. Use o ícone de ocultar num projeto pra guardá-lo aqui."
    : "Nenhum projeto ainda. Crie o primeiro em “Novo projeto”.";
  for (const p of showing) board.appendChild(projectSection(p));
}
function projectSection(p) {
  const archived = (p.status || "ativo") !== "ativo";
  const sec = document.createElement("section");
  sec.className = "proj-card" + (p.collapsed ? " collapsed" : "") + (archived ? " archived" : "");
  sec.dataset.id = p.id;
  const tasks = sortTasks(TASKS.filter((t) => (t.projeto || "") === p.name && t.status !== "concluida"));
  const links = projLinksChips(p);
  sec.innerHTML = `
    <div class="proj-card-head">
      <button class="proj-collapse" title="Minimizar">${ICONS.chevron}</button>
      <div class="proj-card-title">${esc(p.name)}</div>
      <span class="proj-card-count">${p.task_ativas} ativa${p.task_ativas !== 1 ? "s" : ""}</span>
      <div class="spacer"></div>
      <button class="btn-icon proj-archive" title="${archived ? "Reativar projeto" : "Ocultar projeto"}">${archived ? ICONS.eye : ICONS.eyeoff}</button>
      <button class="btn-icon proj-edit" title="Editar projeto">${ICONS.gear}</button>
      <button class="btn-icon proj-del" title="Excluir projeto">${ICONS.trash}</button>
      <button class="btn-soft proj-open">Abrir</button>
    </div>
    <div class="proj-card-body">
      ${p.scope ? `<p class="proj-scope">${esc(p.scope)}</p>` : ""}
      ${p.people ? `<div class="proj-people-line">${ICONS.people}<span>${esc(p.people)}</span></div>` : ""}
      ${links ? `<div class="proj-links-row">${links}</div>` : ""}
      <div class="proj-tasks-grid"></div>
    </div>`;
  const grid = sec.querySelector(".proj-tasks-grid");
  if (tasks.length) tasks.forEach((t) => grid.appendChild(card(t, { hideProjeto: true })));
  else grid.innerHTML = `<p class="focus-empty">Sem demandas ativas.</p>`;
  const open = () => openProject(p.name);
  sec.querySelector(".proj-open").addEventListener("click", open);
  sec.querySelector(".proj-card-title").addEventListener("click", open);
  sec.querySelector(".proj-archive").addEventListener("click", async (e) => {
    e.stopPropagation();
    await api("PUT", `/api/projects/${p.id}`, { status: archived ? "ativo" : "arquivado" });
    toast(archived ? "Projeto reativado ✓" : "Projeto oculto");
    loadTasks();
  });
  sec.querySelector(".proj-edit").addEventListener("click", (e) => { e.stopPropagation(); openProjectModal(p); });
  sec.querySelector(".proj-del").addEventListener("click", (e) => { e.stopPropagation(); confirmDeleteProject(p); });
  sec.querySelector(".proj-collapse").addEventListener("click", () => {
    p.collapsed = p.collapsed ? 0 : 1;
    sec.classList.toggle("collapsed", !!p.collapsed);
    api("PUT", `/api/projects/${p.id}`, { collapsed: p.collapsed });
  });
  wireProjLinks(sec);
  return sec;
}

// Central do projeto (isolada, com sub-abas) --------------------------
function openProject(name) { PROJ_OPEN = name; PROJ_TAB = "demandas"; NOTE_OPEN = null; render(); }

function renderProjectCentral(board) {
  const p = PROJECTS.find((x) => x.name === PROJ_OPEN) || { name: PROJ_OPEN, scope: "", people: "", links: [], id: null };
  const archived = (p.status || "ativo") !== "ativo";
  const addLabel = PROJ_TAB === "anotacoes" ? "Nova anotação" : PROJ_TAB === "links" ? "Adicionar link" : "Adicionar";
  el("projHead").innerHTML = `
    <button class="btn-ghost proj-back" id="btnProjBack">${ICONS.back} ${SHOW_ARCHIVED ? "Ocultos" : "Projetos"}</button>
    <div class="proj-central">
      <div class="proj-central-bar">
        <h1 class="greeting">${esc(p.name)}</h1>
        ${archived ? `<span class="proj-archived-tag">${ICONS.eyeoff} oculto</span>` : ""}
        ${p.id != null ? `<button class="btn-icon" id="btnProjArchive" title="${archived ? "Reativar projeto" : "Ocultar projeto"}">${archived ? ICONS.eye : ICONS.eyeoff}</button>` : ""}
        <button class="btn-icon" id="btnProjEdit" title="Editar projeto">${ICONS.gear}</button>
        <button class="btn-icon" id="btnProjDel" title="Excluir projeto">${ICONS.trash}</button>
        <div class="spacer"></div>
        <button class="btn-soft" id="btnProjAdd"><span data-icon="plus"></span> ${addLabel}</button>
      </div>
      ${p.scope ? `<p class="proj-central-scope">${esc(p.scope)}</p>` : ""}
      ${p.people ? `<div class="proj-people-line">${ICONS.people}<span>${esc(p.people)}</span></div>` : ""}
      <div class="proj-tabs" id="projTabs">
        <button class="ptab${PROJ_TAB === "demandas" ? " active" : ""}" data-ptab="demandas">Demandas <span class="ptab-count">${p.task_ativas || ""}</span></button>
        <button class="ptab${PROJ_TAB === "anotacoes" ? " active" : ""}" data-ptab="anotacoes">Anotações</button>
        <button class="ptab${PROJ_TAB === "links" ? " active" : ""}" data-ptab="links">Links <span class="ptab-count">${(p.links || []).length || ""}</span></button>
      </div>
    </div>`;
  el("btnProjBack").addEventListener("click", () => { PROJ_OPEN = null; render(); });
  if (p.id != null) {
    el("btnProjArchive").addEventListener("click", async () => {
      await api("PUT", `/api/projects/${p.id}`, { status: archived ? "ativo" : "arquivado" });
      toast(archived ? "Projeto reativado ✓" : "Projeto oculto");
      PROJ_OPEN = null; loadTasks();
    });
    el("btnProjEdit").addEventListener("click", () => openProjectModal(p));
    el("btnProjDel").addEventListener("click", () => confirmDeleteProject(p));
  } else {
    el("btnProjEdit").classList.add("hidden");
    el("btnProjDel").classList.add("hidden");
  }
  el("projTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".ptab"); if (!b) return;
    PROJ_TAB = b.dataset.ptab; render();
  });
  el("btnProjAdd").addEventListener("click", () => {
    if (PROJ_TAB === "anotacoes") newNote(p);
    else if (PROJ_TAB === "links") { const t = document.querySelector(".linkhub-add .lh-target"); if (t) t.focus(); }
    else openModal(null, { projeto: p.name });
  });

  document.querySelectorAll(".toolbar").forEach((t) => t.classList.toggle("hidden", PROJ_TAB !== "demandas"));

  board.innerHTML = "";
  if (PROJ_TAB === "anotacoes") renderProjectNotes(board, p);
  else if (PROJ_TAB === "links") renderProjectLinks(board, p);
  else renderProjectTasks(board);
}

function renderProjectTasks(board) {
  board.className = "board view-" + VIEW;
  const projIdeas = ideasHomedOnProject(PROJ_OPEN);
  if (VIEW === "kanban") {
    renderKanban(board);
    if (projIdeas.length) { const strip = document.createElement("div"); strip.className = "postit-strip"; projIdeas.forEach((i) => strip.appendChild(postit(i))); board.appendChild(strip); }
    return;
  }
  const list = sortTasks(TASKS.filter((t) => matchesFilters(t)));
  el("empty").classList.toggle("hidden", list.length > 0 || projIdeas.length > 0);
  el("empty").textContent = "Nenhuma demanda neste projeto ainda. Use “Adicionar”.";
  for (const t of list) board.appendChild(VIEW === "lista" ? listRow(t) : card(t, { hideProjeto: true }));
  projIdeas.forEach((i) => board.appendChild(postit(i)));
}

// Anotações (bloco de notas por "arquivos") ---------------------------
async function renderProjectNotes(board, p) {
  el("empty").classList.add("hidden");
  board.className = "board view-notes";
  board.innerHTML = `<div class="loading"><span class="spinner"></span> Carregando anotações...</div>`;
  NOTES = (p.id != null) ? await api("GET", `/api/projects/${p.id}/notes`) : [];
  if (NOTE_OPEN == null && NOTES.length) NOTE_OPEN = NOTES[0].id;
  board.innerHTML = "";
  const layout = document.createElement("div");
  layout.className = "notes-layout";

  const listEl = document.createElement("div");
  listEl.className = "notes-list";
  if (!NOTES.length) listEl.innerHTML = `<p class="focus-empty notes-empty">Sem anotações ainda.<br>Crie a primeira em “Nova anotação”.</p>`;
  NOTES.forEach((n) => {
    const it = document.createElement("button");
    it.className = "note-item" + (n.id === NOTE_OPEN ? " active" : "");
    it.innerHTML = `<span class="note-item-title">${esc(n.title || "Sem título")}</span>`;
    it.addEventListener("click", () => { NOTE_OPEN = n.id; renderProjectNotes(board, p); });
    listEl.appendChild(it);
  });
  layout.appendChild(listEl);

  const ed = document.createElement("div");
  ed.className = "note-editor";
  const note = NOTES.find((n) => n.id === NOTE_OPEN);
  if (!note) {
    ed.innerHTML = `<p class="focus-empty note-none">Selecione uma anotação ou crie uma nova.</p>`;
  } else {
    ed.innerHTML = `
      <div class="note-ed-head">
        <input class="note-title" value="${esc(note.title)}" placeholder="Título da anotação">
        <button class="btn-icon note-del" title="Excluir anotação">${ICONS.close}</button>
      </div>
      <textarea class="note-body" placeholder="Despeje aqui suas ideias, links, rascunhos...">${esc(note.body)}</textarea>
      <div class="note-saved" id="noteSaved"></div>`;
    const titleI = ed.querySelector(".note-title");
    const bodyI = ed.querySelector(".note-body");
    const saveNote = async () => {
      await api("PUT", `/api/notes/${note.id}`, { title: titleI.value, body: bodyI.value });
      note.title = titleI.value; note.body = bodyI.value;
      const sv = ed.querySelector("#noteSaved"); if (sv) { sv.textContent = "salvo ✓"; setTimeout(() => { if (sv) sv.textContent = ""; }, 1500); }
      const active = listEl.querySelector(".note-item.active .note-item-title"); if (active) active.textContent = titleI.value || "Sem título";
    };
    titleI.addEventListener("blur", saveNote);
    bodyI.addEventListener("blur", saveNote);
    ed.querySelector(".note-del").addEventListener("click", async () => {
      if (!confirm("Excluir esta anotação?")) return;
      await api("DELETE", `/api/notes/${note.id}`);
      NOTE_OPEN = null; renderProjectNotes(board, p);
    });
  }
  layout.appendChild(ed);
  board.appendChild(layout);
}
async function newNote(p) {
  if (p.id == null) { toast("Salve o projeto antes.", true); return; }
  const r = await api("POST", `/api/projects/${p.id}/notes`, { title: "Nova anotação", body: "" });
  NOTE_OPEN = r.id;
  await renderProjectNotes(el("board"), p);
  const t = document.querySelector(".note-title"); if (t) { t.focus(); t.select(); }
}

// Canalizador de links ------------------------------------------------
function renderProjectLinks(board, p) {
  el("empty").classList.add("hidden");
  board.className = "board view-linkhub";
  board.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "linkhub";
  const persist = async (links) => {
    if (p.id == null) return;
    await api("PUT", `/api/projects/${p.id}`, { links });
    p.links = links;
    const ref = PROJECTS.find((x) => x.id === p.id); if (ref) ref.links = links;
  };

  // Categorias existentes (para sugestões e para mover links entre pastas)
  const groupNames = () => [...new Set((p.links || [])
    .map((l) => (l.grupo || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const form = document.createElement("div");
  form.className = "linkhub-add";
  form.innerHTML = `
    <select class="lh-kind"><option value="web">Web</option><option value="pasta">Pasta</option></select>
    <input class="lh-grupo" list="lhGroups" placeholder="Categoria (ex: Leads)">
    <datalist id="lhGroups">${groupNames().map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
    <input class="lh-label" placeholder="Apelido (opcional)">
    <input class="lh-target" placeholder="Cole o link (https://...) ou o caminho da pasta">
    <button class="btn-primary lh-add" type="button">Adicionar</button>`;
  form.querySelector(".lh-add").addEventListener("click", async () => {
    const target = form.querySelector(".lh-target").value.trim();
    if (!target) { toast("Cola um link ou caminho 🙂", true); return; }
    const nl = {
      kind: form.querySelector(".lh-kind").value,
      grupo: form.querySelector(".lh-grupo").value.trim(),
      label: form.querySelector(".lh-label").value.trim(),
      target,
    };
    await persist([...(p.links || []), nl]);
    renderProjectLinks(board, p);
    const tgt = document.querySelector(".linkhub-add .lh-target"); if (tgt) tgt.focus();
  });
  form.querySelector(".lh-target").addEventListener("keydown", (e) => { if (e.key === "Enter") form.querySelector(".lh-add").click(); });
  wrap.appendChild(form);

  const listEl = document.createElement("div");
  listEl.className = "linkhub-list";
  const links = p.links || [];
  if (!links.length) {
    listEl.innerHTML = `<p class="focus-empty linkhub-empty">Nenhum link ainda. Canalize aqui todos os links deste projeto — organize por categoria (Leads, Visitas, Identidade visual…).</p>`;
    wrap.appendChild(listEl);
    board.appendChild(wrap);
    return;
  }

  // Agrupa por categoria, mantendo a ordem de aparição; "Sem categoria" por último
  const order = [], buckets = new Map();
  links.forEach((l, i) => {
    const g = (l.grupo || "").trim();
    if (!buckets.has(g)) { buckets.set(g, []); order.push(g); }
    buckets.get(g).push({ l, i });
  });
  const ordered = order.filter((g) => g).sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (buckets.has("")) ordered.push("");

  // Muda a categoria de um link e persiste
  const moveTo = async (i, grupo) => {
    const next = links.map((l, j) => (j === i ? { ...l, grupo } : l));
    await persist(next);
    renderProjectLinks(board, p);
  };

  ordered.forEach((g) => {
    const items = buckets.get(g);
    const sec = document.createElement("div");
    sec.className = "linkhub-group";
    const head = document.createElement("div");
    head.className = "linkhub-ghead";
    head.innerHTML = `${ic("folder")} <span class="lhg-name">${g ? esc(g) : "Sem categoria"}</span> <span class="lhg-count">${items.length}</span>`;
    sec.appendChild(head);

    items.forEach(({ l, i }) => {
      const row = document.createElement("div");
      row.className = "linkhub-row";
      const opts = ['<option value="">Sem categoria</option>']
        .concat(groupNames().map((n) => `<option value="${esc(n)}"${n === g ? " selected" : ""}>${esc(n)}</option>`))
        .concat('<option value="__new__">+ Nova categoria…</option>')
        .join("");
      row.innerHTML = `
        <button class="link-btn lh-open" title="${esc(l.target)}">${ic(l.kind === "pasta" ? "folder" : "link")} ${esc(l.label || l.target)}</button>
        <select class="lh-move" title="Mover para categoria">${opts}</select>
        <button class="btn-icon lh-del" title="Remover">${ICONS.close}</button>`;
      row.querySelector(".lh-open").addEventListener("click", () => openLink(l.kind, l.target));
      row.querySelector(".lh-move").addEventListener("change", async (e) => {
        let val = e.target.value;
        if (val === "__new__") {
          val = (prompt("Nome da nova categoria:") || "").trim();
          if (!val) { renderProjectLinks(board, p); return; }
        }
        await moveTo(i, val);
      });
      row.querySelector(".lh-del").addEventListener("click", async () => {
        await persist(links.filter((_, j) => j !== i));
        renderProjectLinks(board, p);
      });
      sec.appendChild(row);
    });
    listEl.appendChild(sec);
  });
  wrap.appendChild(listEl);
  board.appendChild(wrap);
}

// Modal de projeto ----------------------------------------------------
function openProjectModal(p) {
  el("projId").value = p ? p.id : "";
  el("projName").value = p ? p.name : "";
  el("projScope").value = p ? (p.scope || "") : "";
  el("projPeople").value = p ? (p.people || "") : "";
  el("projModalTitle").textContent = p ? "Editar projeto" : "Novo projeto";
  el("btnProjDelete").classList.toggle("hidden", !p);
  openOverlay("projectModal");
  el("projName").focus();
}
async function saveProject(e) {
  if (e) e.preventDefault();
  const name = el("projName").value.trim();
  if (!name) { toast("Dá um nome pro projeto 🙂", true); return; }
  // Links não são editados aqui — vivem na aba Links (organizados por categoria).
  // Não enviamos "links" no payload para não sobrescrever/apagar o que está lá.
  const payload = {
    name, scope: el("projScope").value.trim(), people: el("projPeople").value.trim(),
  };
  const id = el("projId").value;
  const r = id ? await api("PUT", `/api/projects/${id}`, payload) : await api("POST", "/api/projects", payload);
  if (r && r.error) { toast(r.error, true); return; }
  PROJ_OPEN = name; PROJ_TAB = "demandas"; // abre/permanece no projeto salvo
  closeOverlay("projectModal"); toast("Projeto salvo ✓"); loadTasks();
}
async function confirmDeleteProject(p) {
  if (!p || p.id == null) return;
  if (!confirm(`Excluir o projeto "${p.name}"?\n\nAs tarefas dele NÃO são apagadas — só ficam sem projeto. As anotações e os links do projeto são removidos.`)) return;
  await api("DELETE", `/api/projects/${p.id}`);
  if (PROJ_OPEN === p.name) PROJ_OPEN = null;
  closeOverlay("projectModal"); toast("Projeto excluído"); loadTasks();
}
function deleteProjectFromModal() {
  const id = el("projId").value; if (!id) return;
  const p = PROJECTS.find((x) => String(x.id) === String(id)) || { id: Number(id), name: el("projName").value.trim() };
  confirmDeleteProject(p);
}

function refreshProjetosDatalist() {
  const dl = el("projetosList");
  if (!dl) return;
  const nomes = [...new Set([
    ...PROJECTS.map((p) => p.name),
    ...TASKS.map((t) => (t.projeto || "").trim()).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b, "pt"));
  dl.innerHTML = nomes.map((n) => `<option value="${esc(n)}">`).join("");
}

// --- Visão Agenda (calendário mensal) -------------------------------
let CAL = new Date(); // qualquer data dentro do mês exibido
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function localIso(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function renderCalendar() {
  const cont = el("calendar");
  const y = CAL.getFullYear(), m = CAL.getMonth();
  const todayIso = localIso(new Date());

  // agrupa tarefas por dia de prazo
  const byDay = {};
  for (const t of TASKS) {
    if (taskHidden(t)) continue;
    const d = (t.due_date || "").trim();
    if (!d) continue;
    (byDay[d] = byDay[d] || []).push(t);
  }

  const first = new Date(y, m, 1);
  const startWd = first.getDay();                       // 0 = domingo
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const weeks = Math.ceil((startWd + daysInMonth) / 7);
  const gridStart = new Date(y, m, 1 - startWd);

  let cells = "";
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = localIso(d);
    const inMonth = d.getMonth() === m;
    const isToday = iso === todayIso;
    const items = (byDay[iso] || []).slice().sort((a, b) =>
      (PRIO_RANK[a.priority] - PRIO_RANK[b.priority]) || a.title.localeCompare(b.title, "pt"));
    const chips = items.map((t) => {
      const done = t.status === "concluida";
      const late = !done && iso < todayIso;
      return `<button class="cal-chip prio-${t.priority}${done ? " done" : ""}${late ? " late" : ""}" data-id="${t.id}" title="${esc(t.title)}">${esc(t.title)}</button>`;
    }).join("");
    cells += `<div class="cal-cell${inMonth ? "" : " out"}${isToday ? " today" : ""}" data-iso="${iso}">
      <div class="cal-daynum">${d.getDate()}</div>
      <div class="cal-chips">${chips}</div>
    </div>`;
  }

  const semPrazo = TASKS.filter((t) => !(t.due_date || "").trim() && t.status !== "concluida" && !taskHidden(t)).length;

  cont.innerHTML = `
    <div class="cal-bar">
      <div class="cal-title">${MESES[m]} <span class="cal-year">${y}</span></div>
      <div class="cal-nav">
        <button class="cal-btn" id="calPrev" title="Mês anterior">‹</button>
        <button class="cal-today" id="calToday">Hoje</button>
        <button class="cal-btn" id="calNext" title="Próximo mês">›</button>
      </div>
    </div>
    <div class="cal-surface">
      <div class="cal-grid cal-head">${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join("")}</div>
      <div class="cal-grid cal-body">${cells}</div>
    </div>
    ${semPrazo ? `<p class="cal-foot">${semPrazo} tarefa${semPrazo > 1 ? "s" : ""} sem prazo — ${semPrazo > 1 ? "não aparecem" : "não aparece"} aqui. Defina um prazo pra vê-${semPrazo > 1 ? "las" : "la"} no calendário.</p>` : ""}`;

  el("calPrev").addEventListener("click", () => { CAL = new Date(y, m - 1, 1); renderCalendar(); });
  el("calNext").addEventListener("click", () => { CAL = new Date(y, m + 1, 1); renderCalendar(); });
  el("calToday").addEventListener("click", () => { CAL = new Date(); renderCalendar(); });
  cont.querySelectorAll(".cal-chip").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const t = TASKS.find((x) => String(x.id) === b.dataset.id);
    if (t) openModal(t);
  }));
  cont.querySelectorAll(".cal-cell").forEach((c) => c.addEventListener("click", () =>
    openModal(null, { due_date: c.dataset.iso })));
}

// --- Drag & drop ----------------------------------------------------
let DRAG_ID = null;
function addDrag(node, t) {
  node.addEventListener("dragstart", (e) => { DRAG_ID = t.id; node.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
  node.addEventListener("dragend", () => { DRAG_ID = null; node.classList.remove("dragging"); });
}
function addDropzone(colEl, status) {
  colEl.addEventListener("dragover", (e) => { e.preventDefault(); colEl.classList.add("drop-hover"); });
  colEl.addEventListener("dragleave", () => colEl.classList.remove("drop-hover"));
  colEl.addEventListener("drop", async (e) => {
    e.preventDefault(); colEl.classList.remove("drop-hover");
    if (DRAG_ID == null) return;
    const task = TASKS.find((x) => x.id === DRAG_ID);
    if (task && task.status !== status) { await api("PUT", `/api/tasks/${DRAG_ID}`, { status }); loadTasks(); }
  });
}

// --- Abrir link/pasta -----------------------------------------------
async function openLink(kind, target) {
  if (kind === "pasta") {
    const r = await api("POST", "/api/open", { path: target });
    r.ok ? toast("Abrindo pasta...") : toast(r.message || "Não consegui abrir a pasta", true);
  } else {
    let url = target; if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    window.open(url, "_blank");
  }
}

// --- Modal de tarefa ------------------------------------------------
function blankLinkRow(kind = "web", label = "", target = "") {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `
    <select><option value="web"${kind === "web" ? " selected" : ""}>Web</option><option value="pasta"${kind === "pasta" ? " selected" : ""}>Pasta</option></select>
    <input class="l-label" placeholder="Apelido (opcional)" value="${esc(label)}">
    <input class="l-target" placeholder="Link ou caminho da pasta" value="${esc(target)}">
    <button type="button" class="rm">✕</button>`;
  row.querySelector(".rm").addEventListener("click", () => { row.remove(); if (typeof scheduleDirtyCheck === "function") scheduleDirtyCheck(); });
  return row;
}
// Andamento da task: barra + X/N das subtarefas, atualiza ao vivo no modal.
function updateSubProgress() {
  const box = el("subProgress");
  if (!box) return;
  const rows = [...el("subtasksList").querySelectorAll(".sub-row")];
  const total = rows.length;
  if (!total) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const done = rows.filter((r) => r.querySelector(".s-done").checked).length;
  const pct = Math.round((done / total) * 100);
  box.classList.remove("hidden");
  box.classList.toggle("full", pct === 100);
  box.innerHTML = `
    <div class="sp-top"><span class="sp-title">Andamento</span><span class="sp-pct">${pct}%</span></div>
    <div class="sp-bar"><i style="width:${pct}%"></i></div>
    <div class="sp-count">${done} de ${total} conclu${done === 1 ? "ído" : "ídos"}</div>`;
}
function blankSubRow(title = "", done = false) {
  const row = document.createElement("div");
  row.className = "sub-row";
  row.innerHTML = `
    <span class="s-drag" title="Arrastar para reordenar">${ICONS.grip}</span>
    <input type="checkbox" class="s-done"${done ? " checked" : ""}>
    <input class="s-title" placeholder="Passo desta demanda..." value="${esc(title)}">
    <button type="button" class="rm">✕</button>`;
  row.querySelector(".rm").addEventListener("click", () => { row.remove(); updateSubProgress(); if (typeof scheduleDirtyCheck === "function") scheduleDirtyCheck(); });
  row.querySelector(".s-done").addEventListener("change", updateSubProgress);
  // Enter cria a próxima linha e foca — fluxo contínuo de digitar passos (não fecha o modal).
  // Backspace em campo vazio remove a linha e volta o foco pra anterior.
  const titleInput = row.querySelector(".s-title");
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      const next = blankSubRow();
      row.parentNode.insertBefore(next, row.nextSibling);
      next.querySelector(".s-title").focus();
    } else if (e.key === "Backspace" && !titleInput.value) {
      e.preventDefault();
      const prev = row.previousElementSibling;
      row.remove(); updateSubProgress();
      if (prev) { prev.querySelector(".s-title").focus();
        const inp = prev.querySelector(".s-title"); inp.selectionStart = inp.selectionEnd = inp.value.length;
      }
    }
  });
  // drag-and-drop para reordenar (só inicia pelo puxador, pra não atrapalhar o texto)
  const handle = row.querySelector(".s-drag");
  handle.addEventListener("mousedown", () => { row.draggable = true; });
  row.addEventListener("mouseup", () => { row.draggable = false; });
  row.addEventListener("dragstart", () => row.classList.add("dragging"));
  row.addEventListener("dragend", () => { row.classList.remove("dragging"); row.draggable = false; if (typeof scheduleDirtyCheck === "function") scheduleDirtyCheck(); });
  return row;
}
function subAfterElement(list, y) {
  const els = [...list.querySelectorAll(".sub-row:not(.dragging)")];
  let closest = { offset: -Infinity, element: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
  }
  return closest.element;
}
function enableSubReorder(list) {
  list.addEventListener("dragover", (e) => {
    const dragging = list.querySelector(".sub-row.dragging");
    if (!dragging) return;
    e.preventDefault();
    const after = subAfterElement(list, e.clientY);
    if (after == null) list.appendChild(dragging);
    else list.insertBefore(dragging, after);
  });
}
function collectSubtasks() {
  return [...el("subtasksList").querySelectorAll(".sub-row")].map((r) => ({
    title: r.querySelector(".s-title").value,
    done: r.querySelector(".s-done").checked ? 1 : 0,
  })).filter((s) => s.title.trim());
}
function syncRecorField() {
  el("recorField").classList.toggle("hidden", el("tipo").value !== "rotina");
}
function syncIdeaField() {
  el("ideaLinksField").classList.toggle("hidden", el("tipo").value !== "ideia");
}
function renderIdeaChipsModal() {
  const wrap = el("ideaLinksChips");
  wrap.innerHTML = IDEA_LINKS.length ? "" : `<span class="hint">Nenhum vínculo ainda — escolha abaixo e clique em “+ Vínculo”.</span>`;
  IDEA_LINKS.forEach((l, i) => {
    const chip = document.createElement("span");
    chip.className = "idea-chip " + ideaChipKind(l);
    chip.innerHTML = `${ic(ideaLinkIcon(l))} ${esc(l.label)}<button type="button" class="rm" title="Remover vínculo">✕</button>`;
    chip.querySelector(".rm").addEventListener("click", () => {
      IDEA_LINKS.splice(i, 1);
      renderIdeaChipsModal(); fillIdeaLinkPick(IDEA_SELF);
      if (typeof scheduleDirtyCheck === "function") scheduleDirtyCheck();
    });
    wrap.appendChild(chip);
  });
}
function fillIdeaLinkPick(selfId) {
  const sel = el("ideaLinkPick");
  const has = new Set(IDEA_LINKS.map((l) => `${l.target_type}:${l.target_id}`));
  const grp = (label, items) => items.length ? `<optgroup label="${label}">${items.join("")}</optgroup>` : "";
  const projs = PROJECTS.filter((p) => !has.has(`projeto:${p.id}`))
    .map((p) => `<option value="projeto:${p.id}">${esc(p.name)}</option>`);
  const rots = TASKS.filter((t) => t.tipo === "rotina" && t.id !== selfId && !has.has(`rotina:${t.id}`))
    .map((t) => `<option value="rotina:${t.id}">${esc(t.title)}</option>`);
  const tars = TASKS.filter((t) => (t.tipo || "tarefa") === "tarefa" && t.id !== selfId && !has.has(`tarefa:${t.id}`))
    .map((t) => `<option value="tarefa:${t.id}">${esc(t.title)}</option>`);
  const groups = grp("Projetos", projs) + grp("Rotinas", rots) + grp("Tarefas", tars);
  const placeholder = `<option value="" disabled selected>Escolher para vincular…</option>`;
  sel.innerHTML = placeholder + (groups || `<option value="" disabled>Nada mais pra vincular</option>`);
}
function addIdeaLinkFromPick() {
  const sel = el("ideaLinkPick");
  const v = sel.value;
  if (!v || !v.includes(":")) return;
  const [tt, id] = v.split(":");
  const label = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : "";
  IDEA_LINKS.push({ target_type: tt, target_id: Number(id), label });
  renderIdeaChipsModal(); fillIdeaLinkPick(IDEA_SELF);
  if (typeof scheduleDirtyCheck === "function") scheduleDirtyCheck();
}
function openModal(task, presets = {}) {
  el("taskForm").reset(); el("linksList").innerHTML = ""; el("subtasksList").innerHTML = "";
  if (task) {
    el("modalTitle").textContent = "Editar tarefa";
    el("taskId").value = task.id;
    el("title").value = task.title || "";
    el("tipo").value = task.tipo || "tarefa";
    el("recorrencia").value = task.recorrencia || "";
    el("projeto").value = task.projeto || "";
    el("priority").value = task.priority || "media";
    el("status").value = task.status || "aberta";
    el("due_date").value = task.due_date || "";
    el("requested_by").value = task.requested_by || "";
    el("send_to").value = task.send_to || "";
    el("description").value = task.description || "";
    (task.links || []).forEach((l) => el("linksList").appendChild(blankLinkRow(l.kind, l.label, l.target)));
    (task.subtasks || []).forEach((s) => el("subtasksList").appendChild(blankSubRow(s.title, s.done)));
    el("btnDelete").classList.remove("hidden");
    el("btnWhats").classList.remove("hidden");
  } else {
    el("modalTitle").textContent = "Nova tarefa";
    el("taskId").value = "";
    el("tipo").value = presets.tipo || AREA_TIPO[AREA] || "tarefa";
    el("recorrencia").value = presets.recorrencia || "";
    el("projeto").value = presets.projeto || "";
    el("due_date").value = presets.due_date || "";
    el("btnDelete").classList.add("hidden");
    el("btnWhats").classList.add("hidden");
  }
  IDEA_SELF = task ? task.id : null;
  IDEA_LINKS = task && task.idea_links
    ? task.idea_links.map((l) => ({ target_type: l.target_type, target_id: l.target_id, label: l.label, target_tipo: l.target_tipo }))
    : [];
  renderIdeaChipsModal(); fillIdeaLinkPick(IDEA_SELF);
  syncRecorField(); syncIdeaField(); updateSubProgress();
  const _id = el("taskId").value || "novo";
  const _draft = (() => { try { return JSON.parse(localStorage.getItem(draftKey(_id)) || "null"); } catch { return null; } })();
  if (_draft && confirm("Existe um rascunho não salvo desta tarefa. Restaurar o que você tinha digitado?")) {
    applyFormState(_draft);
    syncRecorField(); syncIdeaField(); updateSubProgress();
  }
  markFormClean();
  openOverlay("modal"); el("title").focus();
}
function collectLinks() {
  return [...el("linksList").querySelectorAll(".link-row")].map((r) => ({
    kind: r.querySelector("select").value,
    label: r.querySelector(".l-label").value,
    target: r.querySelector(".l-target").value,
  })).filter((l) => l.target.trim());
}
async function saveTask(e) {
  e.preventDefault();
  const payload = {
    title: el("title").value, tipo: el("tipo").value, projeto: el("projeto").value.trim(),
    priority: el("priority").value, status: el("status").value, due_date: el("due_date").value,
    requested_by: el("requested_by").value, send_to: el("send_to").value,
    description: el("description").value, links: collectLinks(), subtasks: collectSubtasks(),
    recorrencia: el("tipo").value === "rotina" ? el("recorrencia").value : "",
  };
  if (el("tipo").value === "ideia") {
    payload.idea_links = IDEA_LINKS.map((l) => ({ target_type: l.target_type, target_id: l.target_id }));
  }
  const id = el("taskId").value;
  if (id) await api("PUT", `/api/tasks/${id}`, payload);
  else await api("POST", "/api/tasks", payload);
  clearDraft(id || "novo");
  setDirty(false);
  closeOverlay("modal"); toast("Salvo ✓"); loadTasks();
}
async function deleteTask() {
  const id = el("taskId").value; if (!id) return;
  if (!confirm("Excluir esta tarefa?")) return;
  await api("DELETE", `/api/tasks/${id}`); clearDraft(id); setDirty(false); closeOverlay("modal"); loadTasks();
}

// --- Recado pro WhatsApp (IA) ---------------------------------------
let WA_TASK = null;   // tarefa alvo do recado (do form ou do card)
let WA_MODO = "avisar";
// Monta a tarefa a partir do form aberto (reflete edições ainda não salvas)
function taskFromForm() {
  const projeto = el("projeto").value.trim();
  const proj = PROJECTS.find((p) => p.name === projeto);
  return {
    title: el("title").value.trim(),
    tipo: el("tipo").value,
    description: el("description").value.trim(),
    projeto,
    proj_scope: proj ? (proj.scope || "") : "",
    proj_people: proj ? (proj.people || "") : "",
    priority: el("priority").value,
    due_date: el("due_date").value,
    requested_by: el("requested_by").value.trim(),
    send_to: el("send_to").value.trim(),
    subtasks: collectSubtasks(),
    links: collectLinks(),
  };
}
function openWhatsapp(task) {
  if (!task || !(task.title || "").trim()) { toast("Dá um título pra tarefa primeiro 🙂", true); return; }
  WA_TASK = task; WA_MODO = "avisar";
  [...el("waModes").children].forEach((b) => b.classList.toggle("active", b.dataset.modo === WA_MODO));
  openOverlay("waModal");
  generateWa();
}
async function generateWa() {
  const box = el("waText");
  box.value = ""; box.classList.add("loading"); box.placeholder = "Gerando o recado...";
  el("btnWaCopy").disabled = true; el("btnWaRegen").disabled = true;
  const r = await api("POST", "/api/ai/whatsapp", { task: WA_TASK, modo: WA_MODO });
  box.classList.remove("loading");
  el("btnWaCopy").disabled = false; el("btnWaRegen").disabled = false;
  if (r.error) { toast(r.error, true); box.placeholder = "Não deu pra gerar. Tenta de novo?"; return; }
  box.value = r.mensagem || "";
}
async function copyWa() {
  const txt = el("waText").value;
  if (!txt.trim()) { toast("Nada pra copiar ainda.", true); return; }
  try {
    await navigator.clipboard.writeText(txt);
    toast("Copiado ✓");
  } catch {
    // fallback pra navegadores sem clipboard API
    el("waText").select(); document.execCommand("copy");
    toast("Copiado ✓");
  }
}

// --- Assistente -----------------------------------------------------
async function openAssistant() {
  await loadStatus();
  el("aiReview").classList.add("hidden"); el("aiReview").innerHTML = "";
  el("aiQuestions").classList.add("hidden"); el("aiQuestions").innerHTML = "";
  const needKey = !CONFIG.configured;
  el("aiSetup").classList.toggle("hidden", !needKey);
  el("aiChat").classList.toggle("hidden", needKey);
  openOverlay("assistantModal");
  if (!needKey) el("aiText").focus();
}
let PENDING = [];    // tarefas em preparo (entre parse e criação)
let PROJETOS = [];   // projetos existentes, pra sugerir
async function organize() {
  const text = el("aiText").value.trim();
  if (!text) { toast("Escreve alguma coisa primeiro 🙂", true); return; }
  el("aiChat").classList.add("hidden");
  const q = el("aiQuestions");
  q.classList.remove("hidden");
  q.innerHTML = `<div class="loading"><span class="spinner"></span> Organizando suas ideias...</div>`;
  const r = await api("POST", "/api/ai/parse", { text });
  if (r.error) {
    q.classList.add("hidden"); q.innerHTML = "";
    el("aiChat").classList.remove("hidden");
    toast(r.error, true);
    return;
  }
  PENDING = r.tarefas || [];
  PROJETOS = r.projetos || [];
  if (!PENDING.length) {
    q.classList.add("hidden"); q.innerHTML = "";
    el("aiChat").classList.remove("hidden");
    toast("Não consegui extrair tarefas. Tenta detalhar mais?", true);
    return;
  }
  const anyGaps = PENDING.some((t) => (t.perguntas || []).length);
  if (anyGaps) renderQuestions();
  else { q.classList.add("hidden"); renderReview(PENDING); }
}

// --- Passo de perguntas (lacunas detectadas pelo back-end) -----------
function questionModule(p) {
  if (p.campo === "projeto") {
    const chips = (p.opcoes || []).map((o) => `<button type="button" class="qchip" data-val="${esc(o)}">${esc(o)}</button>`).join("");
    return `<div class="qmod" data-campo="projeto">
      <div class="qmod-q">${esc(p.pergunta)}</div>
      <div class="qchips">${chips}
        <button type="button" class="qchip qchip-new" data-val="__new">+ Novo</button>
        <button type="button" class="qchip qchip-skip" data-val="">Sem projeto</button>
      </div>
      <input class="qmod-newinput hidden" placeholder="Nome do novo projeto">
    </div>`;
  }
  if (p.campo === "prazo") {
    return `<div class="qmod" data-campo="prazo">
      <div class="qmod-q">${esc(p.pergunta)}</div>
      <div class="qchips">
        <button type="button" class="qchip qdate-quick" data-days="0">Hoje</button>
        <button type="button" class="qchip qdate-quick" data-days="1">Amanhã</button>
        <button type="button" class="qchip qchip-skip" data-val="">Sem prazo</button>
      </div>
      <input type="date" class="qmod-date">
    </div>`;
  }
  if (p.campo === "links") {
    return `<div class="qmod" data-campo="links">
      <div class="qmod-q">${esc(p.pergunta)}</div>
      <div class="qlinks"></div>
      <div class="qchips">
        <button type="button" class="qchip qlink-add" data-val="add">+ Link ou pasta</button>
        <button type="button" class="qchip qchip-skip" data-val="">Não tem</button>
      </div>
    </div>`;
  }
  if (p.campo === "recorrencia") {
    return `<div class="qmod" data-campo="recorrencia">
      <div class="qmod-q">${esc(p.pergunta)}</div>
      <div class="qchips">
        <button type="button" class="qchip" data-val="diaria">Diária</button>
        <button type="button" class="qchip" data-val="semanal">Semanal</button>
        <button type="button" class="qchip" data-val="mensal">Mensal</button>
        <button type="button" class="qchip qchip-skip" data-val="">Sem recorrência</button>
      </div>
    </div>`;
  }
  if (p.campo === "vinculos") {
    return `<div class="qmod qmod-vinculos" data-campo="vinculos">
      <div class="qmod-q">${esc(p.pergunta)}</div>
      <div class="qv-chips idea-chips"></div>
      <div class="idea-add"><select class="qv-pick"></select></div>
    </div>`;
  }
  return "";
}
function ideaLinkOptions(chosen) {
  chosen = chosen || new Set();
  const grp = (label, items) => items.length ? `<optgroup label="${label}">${items.join("")}</optgroup>` : "";
  const projs = PROJECTS.filter((p) => !chosen.has(`projeto:${p.id}`)).map((p) => `<option value="projeto:${p.id}">${esc(p.name)}</option>`);
  const rots = TASKS.filter((t) => t.tipo === "rotina" && !chosen.has(`rotina:${t.id}`)).map((t) => `<option value="rotina:${t.id}">${esc(t.title)}</option>`);
  const tars = TASKS.filter((t) => (t.tipo || "tarefa") === "tarefa" && !chosen.has(`tarefa:${t.id}`)).map((t) => `<option value="tarefa:${t.id}">${esc(t.title)}</option>`);
  return `<option value="" disabled selected>Escolher para vincular…</option>` + grp("Projetos", projs) + grp("Rotinas", rots) + grp("Tarefas", tars);
}
function questionCard(t, i) {
  const mods = (t.perguntas || []).map((p) => questionModule(p)).join("");
  return `<div class="qcard" data-idx="${i}"><div class="qcard-title">${esc(t.title)}</div>${mods}</div>`;
}
function renderQuestions() {
  const q = el("aiQuestions");
  q.classList.remove("hidden");
  el("aiReview").classList.add("hidden");
  const cards = PENDING.map((t, i) => (t.perguntas && t.perguntas.length) ? questionCard(t, i) : "").join("");
  q.innerHTML = `
    <p class="assistant-lead">Quase lá. Só me confirma o que ficou em aberto:</p>
    <div class="q-cards">${cards}</div>
    <div class="modal-foot">
      <button type="button" class="btn-ghost" id="btnQBack">Voltar</button>
      <div class="spacer"></div>
      <button type="button" class="btn-primary" id="btnQNext">Continuar</button>
    </div>`;
  injectIcons();
  q.querySelectorAll(".qchips").forEach((row) => row.addEventListener("click", (e) => {
    const b = e.target.closest(".qchip"); if (!b) return;
    const mod = b.closest(".qmod");
    if (b.classList.contains("qlink-add")) { mod.querySelector(".qlinks").appendChild(blankLinkRow()); return; }
    if (b.classList.contains("qchip-skip") && mod.dataset.campo === "links") mod.querySelector(".qlinks").innerHTML = "";
    if (b.classList.contains("qdate-quick")) {
      const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.days));
      mod.querySelector(".qmod-date").value = d.toISOString().slice(0, 10);
    }
    row.querySelectorAll(".qchip:not(.qlink-add)").forEach((c) => c.classList.remove("sel"));
    b.classList.add("sel");
    const ni = mod.querySelector(".qmod-newinput");
    if (ni) { const isNew = b.dataset.val === "__new"; ni.classList.toggle("hidden", !isNew); if (isNew) ni.focus(); }
  }));
  q.querySelectorAll(".qmod-date").forEach((di) => di.addEventListener("input", () =>
    di.closest(".qmod").querySelectorAll(".qchip").forEach((c) => c.classList.remove("sel"))));
  // Vínculos: mesmo padrão do modal (seleciona no dropdown -> vira chip)
  q.querySelectorAll(".qmod-vinculos").forEach((mod) => {
    const t = PENDING[Number(mod.closest(".qcard").dataset.idx)];
    t.idea_links = t.idea_links || [];
    const chipsEl = mod.querySelector(".qv-chips");
    const pick = mod.querySelector(".qv-pick");
    const fillPick = () => { pick.innerHTML = ideaLinkOptions(new Set(t.idea_links.map((l) => `${l.target_type}:${l.target_id}`))); };
    const renderChips = () => {
      chipsEl.innerHTML = t.idea_links.length ? "" : `<span class="hint">Nenhum vínculo (opcional).</span>`;
      t.idea_links.forEach((l, i) => {
        const chip = document.createElement("span");
        chip.className = "idea-chip " + ideaChipKind(l);
        chip.innerHTML = `${ic(ideaLinkIcon(l))} ${esc(l.label)}<button type="button" class="rm">✕</button>`;
        chip.querySelector(".rm").addEventListener("click", () => { t.idea_links.splice(i, 1); renderChips(); fillPick(); });
        chipsEl.appendChild(chip);
      });
      injectIcons();
    };
    pick.addEventListener("change", () => {
      const v = pick.value; if (!v.includes(":")) return;
      const [tt, id] = v.split(":");
      t.idea_links.push({ target_type: tt, target_id: Number(id), label: pick.selectedOptions[0].textContent });
      renderChips(); fillPick();
    });
    renderChips(); fillPick();
  });
  el("btnQBack").addEventListener("click", () => {
    q.classList.add("hidden"); q.innerHTML = "";
    el("aiChat").classList.remove("hidden");
  });
  el("btnQNext").addEventListener("click", applyAnswersAndReview);
}
function applyAnswersAndReview() {
  el("aiQuestions").querySelectorAll(".qcard").forEach((card) => {
    const t = PENDING[Number(card.dataset.idx)];
    card.querySelectorAll(".qmod").forEach((mod) => {
      const campo = mod.dataset.campo;
      if (campo === "projeto") {
        const sel = mod.querySelector(".qchip.sel");
        if (sel) t.projeto = sel.dataset.val === "__new" ? (mod.querySelector(".qmod-newinput").value || "").trim() : sel.dataset.val;
      } else if (campo === "prazo") {
        if (mod.querySelector(".qchip-skip.sel")) t.due_date = "";
        else { const d = mod.querySelector(".qmod-date").value; if (d) t.due_date = d; }
      } else if (campo === "links") {
        const links = [...mod.querySelectorAll(".qlinks .link-row")].map((r) => ({
          kind: r.querySelector("select").value,
          label: r.querySelector(".l-label").value,
          target: r.querySelector(".l-target").value,
        })).filter((l) => l.target.trim());
        if (links.length) t.links = links;
      } else if (campo === "recorrencia") {
        const sel = mod.querySelector(".qchip.sel");
        if (sel) t.recorrencia = sel.dataset.val;
      }
      // vínculos já foram aplicados ao vivo em t.idea_links
    });
  });
  el("aiQuestions").classList.add("hidden");
  renderReview(PENDING);
}
function renderReview(tarefas) {
  const review = el("aiReview");
  if (!tarefas.length) {
    review.innerHTML = "";
    el("aiChat").classList.remove("hidden");
    toast("Não consegui extrair tarefas. Tenta detalhar mais?", true);
    return;
  }
  review.classList.remove("hidden");
  review.innerHTML = `<p class="review-lead">Organizei em ${tarefas.length} tarefa${tarefas.length > 1 ? "s" : ""}. Ajuste o que quiser e confirme:</p>`;
  tarefas.forEach((t) => review.appendChild(reviewCard(t)));
  const foot = document.createElement("div");
  foot.className = "modal-foot";
  foot.innerHTML = `<button type="button" class="btn-ghost" id="btnBackChat">Voltar</button><div class="spacer"></div><button type="button" class="btn-primary" id="btnCreateAll">Criar tudo</button>`;
  review.appendChild(foot);
  foot.querySelector("#btnBackChat").addEventListener("click", () => { review.classList.add("hidden"); el("aiChat").classList.remove("hidden"); });
  foot.querySelector("#btnCreateAll").addEventListener("click", createAllFromReview);
  injectIcons();
}
function reviewCard(t) {
  const c = document.createElement("div");
  c.className = "rcard";
  const opt = (v, cur, lbl) => `<option value="${v}"${v === cur ? " selected" : ""}>${lbl}</option>`;
  c.innerHTML = `
    <div class="rcard-top"><input class="r-title" value="${esc(t.title)}"><button type="button" class="rm" title="Descartar">✕</button></div>
    ${t.description ? `<div class="rcard-desc">${esc(t.description)}</div>` : ""}
    ${t.motivo ? `<div class="rcard-motivo">${esc(t.motivo)}</div>` : ""}
    ${(t.subtasks && t.subtasks.length) ? `<ul class="rcard-subs">${t.subtasks.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    ${(t.links && t.links.length) ? `<div class="rcard-links">${t.links.map((l) => `<span class="rlink">${ic(l.kind === "pasta" ? "folder" : "link")} ${esc(l.label || l.target)}</span>`).join("")}</div>` : ""}
    ${(t.idea_links && t.idea_links.length) ? `<div class="rcard-links">${t.idea_links.map((l) => `<span class="rlink">${ic(ideaLinkIcon(l))} ${esc(l.label)}</span>`).join("")}</div>` : ""}
    <div class="rcard-controls">
      <select class="r-tipo">${opt("tarefa", t.tipo, "Tarefa")}${opt("ideia", t.tipo, "Ideia")}${opt("rotina", t.tipo, "Rotina")}</select>
      <select class="r-recor${t.tipo === "rotina" ? "" : " hidden"}" title="Recorrência da rotina">
        ${opt("", t.recorrencia || "", "Sem recorrência")}${opt("diaria", t.recorrencia || "", "Diária")}${opt("semanal", t.recorrencia || "", "Semanal")}${opt("mensal", t.recorrencia || "", "Mensal")}
      </select>
      <select class="r-prio">${opt("alta", t.priority, "Alta")}${opt("media", t.priority, "Média")}${opt("baixa", t.priority, "Baixa")}</select>
      <input class="r-date" type="date" value="${esc(t.due_date || "")}">
      <input class="r-projeto" placeholder="Projeto" value="${esc(t.projeto || "")}" list="projetosList">
    </div>`;
  c._data = t;
  c.querySelector(".rm").addEventListener("click", () => c.remove());
  c.querySelector(".r-tipo").addEventListener("change", (e) =>
    c.querySelector(".r-recor").classList.toggle("hidden", e.target.value !== "rotina"));
  return c;
}
async function createAllFromReview() {
  const cards = [...el("aiReview").querySelectorAll(".rcard")];
  if (!cards.length) { toast("Nada pra criar."); return; }
  for (const c of cards) {
    const t = c._data;
    const tipo = c.querySelector(".r-tipo").value;
    await api("POST", "/api/tasks", {
      title: c.querySelector(".r-title").value,
      description: t.description || "",
      priority: c.querySelector(".r-prio").value,
      tipo,
      recorrencia: tipo === "rotina" ? c.querySelector(".r-recor").value : "",
      projeto: c.querySelector(".r-projeto").value.trim(),
      due_date: c.querySelector(".r-date").value,
      requested_by: t.requested_by || "",
      send_to: t.send_to || "",
      subtasks: t.subtasks || [],
      links: t.links || [],
      idea_links: tipo === "ideia" ? (t.idea_links || []).map((l) => ({ target_type: l.target_type, target_id: l.target_id })) : [],
    });
  }
  closeOverlay("assistantModal");
  el("aiText").value = "";
  toast(`${cards.length} tarefa${cards.length > 1 ? "s" : ""} criada${cards.length > 1 ? "s" : ""} ✓`);
  loadTasks();
}
async function saveKey(inputId, extra = {}) {
  const key = el(inputId).value.trim();
  const body = { ...extra };
  if (key) body.openai_api_key = key;
  const r = await api("POST", "/api/ai/config", body);
  CONFIG.configured = r.configured; CONFIG.name = r.name;
  return r;
}

// --- Config ---------------------------------------------------------
async function openConfig() {
  await loadStatus();
  el("cfgName").value = CONFIG.name || "";
  el("cfgKey2").value = "";
  el("cfgStatus").textContent = CONFIG.configured ? "✓ Chave configurada." : "Nenhuma chave configurada ainda.";
  openOverlay("configModal");
}

// --- Overlays -------------------------------------------------------
function openOverlay(id) { el(id).classList.remove("hidden"); injectIcons(); }
// Guarda de fluxo: fecha nada "modal" sujo sem confirmar, e integra a limpeza do draft.
let FORM_DIRTY = false;
let FORM_SNAPSHOT = "";
function closeOverlay(id) {
  if (id === "modal" && FORM_DIRTY && !confirm("Você tem alterações não salvas. Sair mesmo assim e descartar?")) return;
  if (id === "modal") clearDraft(el("taskId").value || "novo");
  el(id).classList.add("hidden");
}

// --- Rascunho do modal de tarefa (não perde mais nada) --------------
// Snapshot do estado limpo; flag DIRTY indica sujeira desde a última foto;
// draft persiste em localStorage com debounce e sobrevive a refresh/queda.
function draftKey(id) { return "bomdia_draft_" + (id || "novo"); }
function captureFormState() {
  return {
    title: el("title").value, tipo: el("tipo").value, recorrencia: el("recorrencia").value,
    projeto: el("projeto").value, priority: el("priority").value, status: el("status").value,
    due_date: el("due_date").value, requested_by: el("requested_by").value, send_to: el("send_to").value,
    description: el("description").value,
    links: collectLinks(), subtasks: collectSubtasks(), ideaLinks: IDEA_LINKS,
  };
}
function setDirty(v) {
  FORM_DIRTY = v;
  const flag = el("dirtyFlag"); if (flag) flag.hidden = !v;
}
function markFormClean() {
  FORM_SNAPSHOT = JSON.stringify(captureFormState());
  setDirty(false);
}
let _dirtyTimer = null, _draftTimer = null;
function scheduleDirtyCheck() {
  clearTimeout(_dirtyTimer);
  _dirtyTimer = setTimeout(() => { if (JSON.stringify(captureFormState()) !== FORM_SNAPSHOT) setDirty(true); }, 80);
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(() => persistDraft(), 800);
}
function persistDraft() {
  try {
    const id = el("taskId").value || "novo";
    const state = captureFormState();
    if (!JSON.stringify(state)) return;
    localStorage.setItem(draftKey(id), JSON.stringify(state));
  } catch {}
}
function clearDraft(id) {
  try { localStorage.removeItem(draftKey(id)); } catch {}
  setDirty(false);
}
function applyFormState(s) {
  if (!s) return;
  if ("title" in s) el("title").value = s.title; if ("tipo" in s) el("tipo").value = s.tipo;
  if ("recorrencia" in s) el("recorrencia").value = s.recorrencia; if ("projeto" in s) el("projeto").value = s.projeto;
  if ("priority" in s) el("priority").value = s.priority; if ("status" in s) el("status").value = s.status;
  if ("due_date" in s) el("due_date").value = s.due_date; if ("requested_by" in s) el("requested_by").value = s.requested_by;
  if ("send_to" in s) el("send_to").value = s.send_to; if ("description" in s) el("description").value = s.description;
  if (Array.isArray(s.links)) { el("linksList").innerHTML = ""; s.links.forEach((l) => el("linksList").appendChild(blankLinkRow(l.kind, l.label, l.target))); }
  if (Array.isArray(s.subtasks)) { el("subtasksList").innerHTML = ""; s.subtasks.forEach((sub) => el("subtasksList").appendChild(blankSubRow(sub.title, sub.done))); }
  if (Array.isArray(s.ideaLinks)) { IDEA_LINKS = s.ideaLinks.slice(); renderIdeaChipsModal(); }
}

// --- Util -----------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
let toastTimer;
function toast(msg, isError) {
  const t = el("toast"); t.textContent = msg; t.className = "toast" + (isError ? " error" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2800);
}
function tomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

// --- Eventos --------------------------------------------------------
el("nav").addEventListener("click", (e) => {
  const b = e.target.closest(".nav-item[data-area]"); if (!b) return;
  AREA = b.dataset.area; PROJ_OPEN = null; SHOW_ARCHIVED = false; render();
});
el("btnAssistant").addEventListener("click", openAssistant);
el("btnNew").addEventListener("click", () => openModal(null));
el("btnNew2").addEventListener("click", () => openModal(null));
el("btnRemind").addEventListener("click", () => openModal(null, { area: "hoje", due_date: tomorrow() }));
// --- Tema (claro/escuro) --------------------------------------------
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
  const dark = t === "dark";
  const btn = el("btnTheme");
  if (btn) btn.innerHTML = `${ic(dark ? "sun" : "moon")} ${dark ? "Modo claro" : "Modo noturno"}`;
}
applyTheme(document.documentElement.getAttribute("data-theme") || "light");
el("btnTheme").addEventListener("click", () =>
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));

el("btnConfig").addEventListener("click", openConfig);
el("btnOrganize").addEventListener("click", organize);
el("btnSaveKey").addEventListener("click", async () => {
  const r = await saveKey("cfgKey");
  if (r.configured) { el("aiSetup").classList.add("hidden"); el("aiChat").classList.remove("hidden"); el("aiText").focus(); toast("Chave salva ✓"); }
  else toast("Chave inválida (deve começar com sk-).", true);
});
el("btnSaveConfig").addEventListener("click", async () => {
  await saveKey("cfgKey2", { name: el("cfgName").value.trim() });
  closeOverlay("configModal"); toast("Ajustes salvos ✓"); render();
});
el("taskForm").addEventListener("submit", saveTask);
// Detection de sujeira (DIRTY) + persistência de rascunho (debounce 800ms).
el("taskForm").addEventListener("input", scheduleDirtyCheck);
el("taskForm").addEventListener("change", scheduleDirtyCheck);
// Enter não deve fechar/salvar o modal por acidente. Só o título mantém o salvar-no-Enter
// (atalho de teclado natural). Em inputs auxiliares, o Enter move o foco pro próximo campo.
// Subtarefas tratam o Enter no próprio handler (cria próxima linha).
el("taskForm").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const t = e.target;
  if (!t || !t.matches("input, select")) return;
  if (t.tagName === "TEXTAREA") return;
  if (t.id === "title") return;
  if (t.classList.contains("s-title")) return;
  if (t.classList.contains("lh-target")) return;
  e.preventDefault();
  const focusables = [...el("taskForm").querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')];
  const idx = focusables.indexOf(t);
  if (idx >= 0 && idx < focusables.length - 1) focusables[idx + 1].focus();
});
el("tipo").addEventListener("change", () => { syncRecorField(); syncIdeaField(); });
el("ideaLinkPick").addEventListener("change", addIdeaLinkFromPick); // vincula na hora que escolhe
el("btnAddIdeaLink").addEventListener("click", addIdeaLinkFromPick);  // botão continua funcionando
el("btnDelete").addEventListener("click", deleteTask);
el("btnWhats").addEventListener("click", () => openWhatsapp(taskFromForm()));
el("btnWaCopy").addEventListener("click", copyWa);
el("btnWaRegen").addEventListener("click", generateWa);
el("waModes").addEventListener("click", (e) => {
  const b = e.target.closest(".wa-mode"); if (!b || b.dataset.modo === WA_MODO) return;
  WA_MODO = b.dataset.modo;
  [...el("waModes").children].forEach((c) => c.classList.toggle("active", c === b));
  generateWa();
});
el("btnAddLink").addEventListener("click", () => el("linksList").appendChild(blankLinkRow()));
el("btnAddSub").addEventListener("click", () => {
  const r = blankSubRow(); el("subtasksList").appendChild(r);
  r.querySelector(".s-title").focus(); updateSubProgress();
});
enableSubReorder(el("subtasksList"));
el("projForm").addEventListener("submit", saveProject);
el("btnProjDelete").addEventListener("click", deleteProjectFromModal);
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeOverlay(b.dataset.close)));
document.querySelectorAll(".modal-overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) closeOverlay(ov.id); }));
el("search").addEventListener("input", (e) => { SEARCH = e.target.value; render(); });
el("sort").addEventListener("change", (e) => { SORT = e.target.value; render(); });
el("lateOnly").addEventListener("change", (e) => { LATE_ONLY = e.target.checked; render(); });
el("statusFilters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  [...el("statusFilters").children].forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active"); FILTER = e.target.dataset.status; render();
});
el("prioFilters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  [...el("prioFilters").querySelectorAll(".chip")].forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active"); PRIO = e.target.dataset.prio; render();
});
el("viewToggle").addEventListener("click", (e) => {
  const b = e.target.closest(".vbtn"); if (!b) return;
  VIEW = b.dataset.view; localStorage.setItem("bomdia_view", VIEW); render();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((m) => closeOverlay(m.id)); });

// --- Início ---------------------------------------------------------
const _a = new URLSearchParams(location.search).get("area");
if (_a && _a in AREA_LABEL) AREA = _a;
const _p = new URLSearchParams(location.search).get("proj");
if (_p) { AREA = "projetos"; PROJ_OPEN = _p; PROJ_TAB = "demandas"; }
const _pt = new URLSearchParams(location.search).get("ptab");
if (_pt && ["demandas", "anotacoes", "links"].includes(_pt)) PROJ_TAB = _pt;
injectIcons();
(async () => { await loadStatus(); await loadTasks(); })();
