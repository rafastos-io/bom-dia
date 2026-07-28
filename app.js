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

const el = (id) => document.getElementById(id);
const AREA_LABEL = { hoje: "Hoje", projetos: "Projetos", ideias: "Ideias", rotina: "Rotina" };
const TIPO_LABEL = { tarefa: "Tarefa", ideia: "Ideia", rotina: "Rotina" };
const AREA_TIPO = { hoje: "tarefa", ideias: "ideia", rotina: "rotina" }; // área -> tipo preset
const PRIO_RANK = { alta: 0, media: 1, baixa: 2 };
const PRIO_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" };

// Uma tarefa pertence à "área" de navegação conforme tipo/projeto (dimensões cruzadas)
function inArea(t, area) {
  const tipo = t.tipo || "tarefa";
  if (area === "hoje") return tipo === "tarefa";
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
async function loadTasks() { TASKS = await api("GET", "/api/tasks"); render(); }
async function loadStatus() { CONFIG = await api("GET", "/api/ai/status"); }

// --- Helpers de dados -----------------------------------------------
function isLate(t) {
  if (!t.due_date || t.status === "concluida") return false;
  return t.due_date < new Date().toISOString().slice(0, 10);
}
function fmtDate(d) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}`; }
function activeTasks() { return TASKS.filter((t) => t.status !== "concluida"); }

function matchesFilters(t, { ignoreStatus = false, ignoreArea = false } = {}) {
  if (!ignoreArea && !inArea(t, AREA)) return false;
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

  el("statusFilters").style.opacity = VIEW === "kanban" ? ".4" : "1";
  el("statusFilters").style.pointerEvents = VIEW === "kanban" ? "none" : "auto";
  [...el("viewToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.view === VIEW));

  const board = el("board");
  board.innerHTML = "";

  if (AREA === "projetos") { board.className = "board view-projetos"; renderProjetos(board); injectIcons(); return; }

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
  if ((t.tipo || "tarefa") !== "tarefa") m += `<span class="tag tipo">${TIPO_LABEL[t.tipo]}</span>`;
  if (!hideProjeto && (t.projeto || "").trim()) m += `<span class="tag projeto">${esc(t.projeto)}</span>`;
  if (t.due_date) m += `<span class="tag ${isLate(t) ? "due-late" : ""}">${fmtDate(t.due_date)}</span>`;
  return m;
}
function linksHTML(t) {
  return (t.links || []).map((l) =>
    `<button class="link-btn" data-kind="${l.kind}" data-target="${esc(l.target)}" title="${esc(l.target)}">${ic(l.kind === "pasta" ? "folder" : "link")} ${esc(l.label || l.target)}</button>`
  ).join("");
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
}

function card(t, metaOpts = {}) {
  const c = document.createElement("div");
  c.className = `card ${t.priority}` + (t.status === "concluida" ? " done" : "");
  c.draggable = true; c.dataset.id = t.id;
  let people = "";
  if (t.requested_by) people += `<span>Pediu: <b>${esc(t.requested_by)}</b></span>`;
  if (t.send_to) people += `<span>Enviar p/: <b>${esc(t.send_to)}</b></span>`;
  const links = linksHTML(t);
  c.innerHTML = `
    <div class="card-head"><div class="card-accent"></div><div class="card-title">${esc(t.title)}</div></div>
    <div class="card-meta">${metaHTML(t, metaOpts)}</div>
    ${t.description ? `<div class="card-desc">${esc(t.description)}</div>` : ""}
    ${people ? `<div class="card-people">${people}</div>` : ""}
    ${links ? `<div class="card-links">${links}</div>` : ""}
    <div class="card-foot">${statusSelectHTML(t)}</div>`;
  wireCard(c, t); addDrag(c, t);
  return c;
}

function listRow(t) {
  const r = document.createElement("div");
  r.className = `list-row ${t.priority}` + (t.status === "concluida" ? " done" : "");
  r.draggable = true; r.dataset.id = t.id;
  const people = [t.requested_by && `de ${esc(t.requested_by)}`, t.send_to && `→ ${esc(t.send_to)}`].filter(Boolean).join("  ");
  r.innerHTML = `
    <span class="dot dot-${t.priority}" title="${PRIO_LABEL[t.priority]}"></span>
    <span class="list-title card-title">${esc(t.title)}</span>
    <span class="list-people">${people}</span>
    <span class="list-due">${t.due_date ? (isLate(t) ? "⚠ " : "") + fmtDate(t.due_date) : ""}</span>
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

// --- Visão Projetos (agrupado por projeto) --------------------------
function renderProjetos(board) {
  const list = sortTasks(TASKS.filter((t) => matchesFilters(t)));
  el("empty").classList.toggle("hidden", list.length > 0);
  el("empty").textContent = "Nenhuma demanda com projeto ainda. Defina um projeto ao criar/editar uma tarefa.";
  // agrupa por nome de projeto
  const groups = {};
  for (const t of list) {
    const key = (t.projeto || "Sem projeto").trim() || "Sem projeto";
    (groups[key] = groups[key] || []).push(t);
  }
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pt"));
  for (const name of names) {
    const sec = document.createElement("section");
    sec.className = "proj-group";
    const ativos = groups[name].filter((t) => t.status !== "concluida").length;
    sec.innerHTML = `<div class="proj-head"><span class="proj-name">${esc(name)}</span><span class="proj-count">${ativos} ativa${ativos !== 1 ? "s" : ""}</span></div>`;
    const grid = document.createElement("div");
    grid.className = "proj-grid";
    groups[name].forEach((t) => grid.appendChild(card(t, { hideProjeto: true })));
    sec.appendChild(grid);
    board.appendChild(sec);
  }
}

function refreshProjetosDatalist() {
  const dl = el("projetosList");
  if (!dl) return;
  const nomes = [...new Set(TASKS.map((t) => (t.projeto || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
  dl.innerHTML = nomes.map((n) => `<option value="${esc(n)}">`).join("");
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
function openModal(task, presets = {}) {
  el("taskForm").reset(); el("linksList").innerHTML = "";
  if (task) {
    el("modalTitle").textContent = "Editar tarefa";
    el("taskId").value = task.id;
    el("title").value = task.title || "";
    el("tipo").value = task.tipo || "tarefa";
    el("projeto").value = task.projeto || "";
    el("priority").value = task.priority || "media";
    el("due_date").value = task.due_date || "";
    el("requested_by").value = task.requested_by || "";
    el("send_to").value = task.send_to || "";
    el("description").value = task.description || "";
    (task.links || []).forEach((l) => el("linksList").appendChild(blankLinkRow(l.kind, l.label, l.target)));
    el("btnDelete").classList.remove("hidden");
  } else {
    el("modalTitle").textContent = "Nova tarefa";
    el("taskId").value = "";
    el("tipo").value = presets.tipo || AREA_TIPO[AREA] || "tarefa";
    el("projeto").value = presets.projeto || "";
    el("due_date").value = presets.due_date || "";
    el("btnDelete").classList.add("hidden");
  }
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
    description: el("description").value, links: collectLinks(),
  };
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
  const needKey = !CONFIG.configured;
  el("aiSetup").classList.toggle("hidden", !needKey);
  el("aiChat").classList.toggle("hidden", needKey);
  openOverlay("assistantModal");
  if (!needKey) el("aiText").focus();
}
async function organize() {
  const text = el("aiText").value.trim();
  if (!text) { toast("Escreve alguma coisa primeiro 🙂", true); return; }
  el("aiChat").classList.add("hidden");
  const review = el("aiReview");
  review.classList.remove("hidden");
  review.innerHTML = `<div class="loading"><span class="spinner"></span> Organizando suas ideias...</div>`;
  const r = await api("POST", "/api/ai/parse", { text });
  if (r.error) {
    review.innerHTML = "";
    el("aiChat").classList.remove("hidden");
    toast(r.error, true);
    return;
  }
  renderReview(r.tarefas || []);
}
function renderReview(tarefas) {
  const review = el("aiReview");
  if (!tarefas.length) {
    review.innerHTML = "";
    el("aiChat").classList.remove("hidden");
    toast("Não consegui extrair tarefas. Tenta detalhar mais?", true);
    return;
  }
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
    <div class="rcard-controls">
      <select class="r-tipo">${opt("tarefa", t.tipo, "Tarefa")}${opt("ideia", t.tipo, "Ideia")}${opt("rotina", t.tipo, "Rotina")}</select>
      <select class="r-prio">${opt("alta", t.priority, "Alta")}${opt("media", t.priority, "Média")}${opt("baixa", t.priority, "Baixa")}</select>
      <input class="r-date" type="date" value="${esc(t.due_date || "")}">
      <input class="r-projeto" placeholder="Projeto" value="${esc(t.projeto || "")}" list="projetosList">
    </div>`;
  c._data = t;
  c.querySelector(".rm").addEventListener("click", () => c.remove());
  return c;
}
async function createAllFromReview() {
  const cards = [...el("aiReview").querySelectorAll(".rcard")];
  if (!cards.length) { toast("Nada pra criar."); return; }
  for (const c of cards) {
    const t = c._data;
    await api("POST", "/api/tasks", {
      title: c.querySelector(".r-title").value,
      description: t.description || "",
      priority: c.querySelector(".r-prio").value,
      tipo: c.querySelector(".r-tipo").value,
      projeto: c.querySelector(".r-projeto").value.trim(),
      due_date: c.querySelector(".r-date").value,
      requested_by: t.requested_by || "",
      send_to: t.send_to || "",
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
  AREA = b.dataset.area; render();
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
el("btnDelete").addEventListener("click", deleteTask);
el("btnAddLink").addEventListener("click", () => el("linksList").appendChild(blankLinkRow()));
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
injectIcons();
(async () => { await loadStatus(); await loadTasks(); })();
