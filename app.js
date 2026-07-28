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

// --- Ícones (SVG inline, estilo Material arredondado) ---------------
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  sun: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
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
  if (AREA === "projetos" && PROJ_OPEN) {
    // entra na central: tarefa do projeto OU ideia vinculada a ele
    const own = (t.projeto || "").trim() === PROJ_OPEN;
    const linked = (t.idea_links || []).some((l) => l.target_type === "projeto" && l.label === PROJ_OPEN);
    if (!own && !linked) return false;
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
  // nav
  document.querySelectorAll(".nav-item[data-area]").forEach((b) =>
    b.classList.toggle("active", b.dataset.area === AREA));
  for (const a of Object.keys(AREA_LABEL)) {
    const n = TASKS.filter((t) => inArea(t, a) && t.status !== "concluida").length;
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
  if (VIEW === "kanban") { renderKanban(board); injectIcons(); return; }
  const list = sortTasks(TASKS.filter((t) => matchesFilters(t)));
  el("empty").classList.toggle("hidden", list.length > 0);
  el("empty").textContent = "Nada por aqui ainda. Respire — e adicione quando precisar. ☕";
  for (const t of list) board.appendChild(VIEW === "lista" ? listRow(t) : card(t));
  injectIcons();
}

function renderDashboard() {
  el("greeting").textContent = greetWord() + (CONFIG.name ? `, ${CONFIG.name}` : "");
  const ativas = activeTasks();
  const atrasadas = TASKS.filter(isLate).length;
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
    AREA = "projetos"; openProject(p.name);
    return;
  }
  const t = TASKS.find((x) => x.id === id);
  if (t) openModal(t);
  else toast("Não encontrei o alvo (foi excluído?)", true);
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
  const rows = subs.map((s) =>
    `<label class="subrow"><input type="checkbox" data-sub="${s.id}"${s.done ? " checked" : ""}><span class="${s.done ? "sdone" : ""}">${esc(s.title)}</span></label>`
  ).join("");
  return `<div class="card-subs">
    <div class="subs-head"><span>Subtarefas</span><span class="subs-count">${done}/${subs.length}</span></div>
    <div class="subs-bar"><i style="width:${pct}%"></i></div>
    <div class="subs-list">${rows}</div>
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
    <div class="card-head"><div class="card-accent"></div><div class="card-title">${esc(t.title)}</div></div>
    <div class="card-meta">${metaHTML(t, metaOpts)}</div>
    ${ideaLinksHTML(t)}
    ${t.description ? `<div class="card-desc">${esc(t.description)}</div>` : ""}
    ${subtasksHTML(t)}
    ${people ? `<div class="card-people">${people}</div>` : ""}
    ${links ? `<div class="card-links">${links}</div>` : ""}
    <div class="card-foot">${routineHTML(t)}${statusSelectHTML(t)}</div>`;
  wireCard(c, t); addDrag(c, t);
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
  el("projHead").innerHTML = `
    <div class="proj-list-topbar">
      <h1 class="greeting">Projetos</h1>
      <button class="btn-soft" id="btnNewProject"><span data-icon="plus"></span> Novo projeto</button>
    </div>`;
  el("btnNewProject").addEventListener("click", () => openProjectModal(null));
  board.innerHTML = "";
  el("empty").classList.toggle("hidden", PROJECTS.length > 0);
  el("empty").textContent = "Nenhum projeto ainda. Crie o primeiro em “Novo projeto”.";
  for (const p of PROJECTS) board.appendChild(projectSection(p));
}
function projectSection(p) {
  const sec = document.createElement("section");
  sec.className = "proj-card" + (p.collapsed ? " collapsed" : "");
  sec.dataset.id = p.id;
  const tasks = sortTasks(TASKS.filter((t) => (t.projeto || "") === p.name && t.status !== "concluida"));
  const links = projLinksChips(p);
  sec.innerHTML = `
    <div class="proj-card-head">
      <button class="proj-collapse" title="Minimizar">${ICONS.chevron}</button>
      <div class="proj-card-title">${esc(p.name)}</div>
      <span class="proj-card-count">${p.task_ativas} ativa${p.task_ativas !== 1 ? "s" : ""}</span>
      <div class="spacer"></div>
      <button class="btn-icon proj-edit" title="Editar projeto">${ICONS.gear}</button>
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
  sec.querySelector(".proj-edit").addEventListener("click", (e) => { e.stopPropagation(); openProjectModal(p); });
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
  const addLabel = PROJ_TAB === "anotacoes" ? "Nova anotação" : PROJ_TAB === "links" ? "Adicionar link" : "Adicionar";
  el("projHead").innerHTML = `
    <button class="btn-ghost proj-back" id="btnProjBack">${ICONS.back} Projetos</button>
    <div class="proj-central">
      <div class="proj-central-bar">
        <h1 class="greeting">${esc(p.name)}</h1>
        <button class="btn-icon" id="btnProjEdit" title="Editar projeto">${ICONS.gear}</button>
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
  if (p.id != null) el("btnProjEdit").addEventListener("click", () => openProjectModal(p));
  else el("btnProjEdit").classList.add("hidden");
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
  if (VIEW === "kanban") { renderKanban(board); return; }
  const list = sortTasks(TASKS.filter((t) => matchesFilters(t)));
  el("empty").classList.toggle("hidden", list.length > 0);
  el("empty").textContent = "Nenhuma demanda neste projeto ainda. Use “Adicionar”.";
  for (const t of list) board.appendChild(VIEW === "lista" ? listRow(t) : card(t, { hideProjeto: true }));
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

  const form = document.createElement("div");
  form.className = "linkhub-add";
  form.innerHTML = `
    <select class="lh-kind"><option value="web">Web</option><option value="pasta">Pasta</option></select>
    <input class="lh-label" placeholder="Apelido (opcional)">
    <input class="lh-target" placeholder="Cole o link (https://...) ou o caminho da pasta">
    <button class="btn-primary lh-add" type="button">Adicionar</button>`;
  form.querySelector(".lh-add").addEventListener("click", async () => {
    const target = form.querySelector(".lh-target").value.trim();
    if (!target) { toast("Cola um link ou caminho 🙂", true); return; }
    const nl = { kind: form.querySelector(".lh-kind").value, label: form.querySelector(".lh-label").value.trim(), target };
    await persist([...(p.links || []), nl]);
    renderProjectLinks(board, p);
    const tgt = document.querySelector(".linkhub-add .lh-target"); if (tgt) tgt.focus();
  });
  form.querySelector(".lh-target").addEventListener("keydown", (e) => { if (e.key === "Enter") form.querySelector(".lh-add").click(); });
  wrap.appendChild(form);

  const listEl = document.createElement("div");
  listEl.className = "linkhub-list";
  if (!(p.links || []).length) listEl.innerHTML = `<p class="focus-empty linkhub-empty">Nenhum link ainda. Canalize aqui todos os links deste projeto.</p>`;
  (p.links || []).forEach((l, i) => {
    const row = document.createElement("div");
    row.className = "linkhub-row";
    row.innerHTML = `
      <button class="link-btn lh-open" title="${esc(l.target)}">${ic(l.kind === "pasta" ? "folder" : "link")} ${esc(l.label || l.target)}</button>
      <button class="btn-icon lh-del" title="Remover">${ICONS.close}</button>`;
    row.querySelector(".lh-open").addEventListener("click", () => openLink(l.kind, l.target));
    row.querySelector(".lh-del").addEventListener("click", async () => {
      await persist((p.links || []).filter((_, j) => j !== i));
      renderProjectLinks(board, p);
    });
    listEl.appendChild(row);
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
  el("projLinksList").innerHTML = "";
  ((p && p.links) || []).forEach((l) => el("projLinksList").appendChild(blankLinkRow(l.kind, l.label, l.target)));
  el("projModalTitle").textContent = p ? "Editar projeto" : "Novo projeto";
  el("btnProjDelete").classList.toggle("hidden", !p);
  openOverlay("projectModal");
  el("projName").focus();
}
async function saveProject(e) {
  if (e) e.preventDefault();
  const name = el("projName").value.trim();
  if (!name) { toast("Dá um nome pro projeto 🙂", true); return; }
  const payload = {
    name, scope: el("projScope").value.trim(), people: el("projPeople").value.trim(),
    links: [...el("projLinksList").querySelectorAll(".link-row")].map((r) => ({
      kind: r.querySelector("select").value,
      label: r.querySelector(".l-label").value,
      target: r.querySelector(".l-target").value,
    })).filter((l) => l.target.trim()),
  };
  const id = el("projId").value;
  const r = id ? await api("PUT", `/api/projects/${id}`, payload) : await api("POST", "/api/projects", payload);
  if (r && r.error) { toast(r.error, true); return; }
  PROJ_OPEN = name; PROJ_TAB = "demandas"; // abre/permanece no projeto salvo
  closeOverlay("projectModal"); toast("Projeto salvo ✓"); loadTasks();
}
async function deleteProjectFromModal() {
  const id = el("projId").value; if (!id) return;
  if (!confirm("Excluir este projeto? As tarefas dele ficam sem projeto (não são apagadas).")) return;
  await api("DELETE", `/api/projects/${id}`);
  PROJ_OPEN = null;
  closeOverlay("projectModal"); toast("Projeto excluído"); loadTasks();
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

  const semPrazo = TASKS.filter((t) => !(t.due_date || "").trim() && t.status !== "concluida").length;

  cont.innerHTML = `
    <div class="cal-bar">
      <div class="cal-title">${MESES[m]} <span class="cal-year">${y}</span></div>
      <div class="cal-nav">
        <button class="cal-btn" id="calPrev" title="Mês anterior">‹</button>
        <button class="cal-today" id="calToday">Hoje</button>
        <button class="cal-btn" id="calNext" title="Próximo mês">›</button>
      </div>
    </div>
    <div class="cal-grid cal-head">${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join("")}</div>
    <div class="cal-grid cal-body">${cells}</div>
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
  row.querySelector(".rm").addEventListener("click", () => row.remove());
  return row;
}
function blankSubRow(title = "", done = false) {
  const row = document.createElement("div");
  row.className = "sub-row";
  row.innerHTML = `
    <span class="s-drag" title="Arrastar para reordenar">${ICONS.grip}</span>
    <input type="checkbox" class="s-done"${done ? " checked" : ""}>
    <input class="s-title" placeholder="Passo desta demanda..." value="${esc(title)}">
    <button type="button" class="rm">✕</button>`;
  row.querySelector(".rm").addEventListener("click", () => row.remove());
  // drag-and-drop para reordenar (só inicia pelo puxador, pra não atrapalhar o texto)
  const handle = row.querySelector(".s-drag");
  handle.addEventListener("mousedown", () => { row.draggable = true; });
  row.addEventListener("mouseup", () => { row.draggable = false; });
  row.addEventListener("dragstart", () => row.classList.add("dragging"));
  row.addEventListener("dragend", () => { row.classList.remove("dragging"); row.draggable = false; });
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
  const html = grp("Projetos", projs) + grp("Rotinas", rots) + grp("Tarefas", tars);
  sel.innerHTML = html || `<option value="">Nada mais pra vincular</option>`;
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
    el("due_date").value = task.due_date || "";
    el("requested_by").value = task.requested_by || "";
    el("send_to").value = task.send_to || "";
    el("description").value = task.description || "";
    (task.links || []).forEach((l) => el("linksList").appendChild(blankLinkRow(l.kind, l.label, l.target)));
    (task.subtasks || []).forEach((s) => el("subtasksList").appendChild(blankSubRow(s.title, s.done)));
    el("btnDelete").classList.remove("hidden");
  } else {
    el("modalTitle").textContent = "Nova tarefa";
    el("taskId").value = "";
    el("tipo").value = presets.tipo || AREA_TIPO[AREA] || "tarefa";
    el("recorrencia").value = presets.recorrencia || "";
    el("projeto").value = presets.projeto || "";
    el("due_date").value = presets.due_date || "";
    el("btnDelete").classList.add("hidden");
  }
  IDEA_SELF = task ? task.id : null;
  IDEA_LINKS = task && task.idea_links
    ? task.idea_links.map((l) => ({ target_type: l.target_type, target_id: l.target_id, label: l.label, target_tipo: l.target_tipo }))
    : [];
  renderIdeaChipsModal(); fillIdeaLinkPick(IDEA_SELF);
  syncRecorField(); syncIdeaField();
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
    priority: el("priority").value, due_date: el("due_date").value,
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
  closeOverlay("modal"); toast("Salvo ✓"); loadTasks();
}
async function deleteTask() {
  const id = el("taskId").value; if (!id) return;
  if (!confirm("Excluir esta tarefa?")) return;
  await api("DELETE", `/api/tasks/${id}`); closeOverlay("modal"); loadTasks();
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
  return "";
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
      }
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
  if (key) body.nvidia_api_key = key;
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
function closeOverlay(id) { el(id).classList.add("hidden"); }

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
  AREA = b.dataset.area; PROJ_OPEN = null; render();
});
el("btnAssistant").addEventListener("click", openAssistant);
el("btnNew").addEventListener("click", () => openModal(null));
el("btnNew2").addEventListener("click", () => openModal(null));
el("btnRemind").addEventListener("click", () => openModal(null, { area: "hoje", due_date: tomorrow() }));
el("btnConfig").addEventListener("click", openConfig);
el("btnOrganize").addEventListener("click", organize);
el("btnSaveKey").addEventListener("click", async () => {
  const r = await saveKey("cfgKey");
  if (r.configured) { el("aiSetup").classList.add("hidden"); el("aiChat").classList.remove("hidden"); el("aiText").focus(); toast("Chave salva ✓"); }
  else toast("Chave inválida (deve começar com nvapi-).", true);
});
el("btnSaveConfig").addEventListener("click", async () => {
  await saveKey("cfgKey2", { name: el("cfgName").value.trim() });
  closeOverlay("configModal"); toast("Ajustes salvos ✓"); render();
});
el("taskForm").addEventListener("submit", saveTask);
el("tipo").addEventListener("change", () => { syncRecorField(); syncIdeaField(); });
el("btnAddIdeaLink").addEventListener("click", () => {
  const sel = el("ideaLinkPick");
  const v = sel.value;
  if (!v || !v.includes(":")) return;
  const [tt, id] = v.split(":");
  const label = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : "";
  IDEA_LINKS.push({ target_type: tt, target_id: Number(id), label });
  renderIdeaChipsModal(); fillIdeaLinkPick(IDEA_SELF);
});
el("btnDelete").addEventListener("click", deleteTask);
el("btnAddLink").addEventListener("click", () => el("linksList").appendChild(blankLinkRow()));
el("btnAddSub").addEventListener("click", () => el("subtasksList").appendChild(blankSubRow()));
enableSubReorder(el("subtasksList"));
el("projForm").addEventListener("submit", saveProject);
el("btnProjDelete").addEventListener("click", deleteProjectFromModal);
el("btnAddProjLink").addEventListener("click", () => el("projLinksList").appendChild(blankLinkRow()));
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((m) => m.classList.add("hidden")); });

// --- Início ---------------------------------------------------------
const _a = new URLSearchParams(location.search).get("area");
if (_a && _a in AREA_LABEL) AREA = _a;
const _p = new URLSearchParams(location.search).get("proj");
if (_p) { AREA = "projetos"; PROJ_OPEN = _p; PROJ_TAB = "demandas"; }
const _pt = new URLSearchParams(location.search).get("ptab");
if (_pt && ["demandas", "anotacoes", "links"].includes(_pt)) PROJ_TAB = _pt;
injectIcons();
(async () => { await loadStatus(); await loadTasks(); })();
