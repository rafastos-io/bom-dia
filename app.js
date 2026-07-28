// BOM DIA - logica da interface
let TASKS = [];
let FILTER = "ativas";
let PRIO = "todas";
let SORT = "auto";
let LATE_ONLY = false;
let SEARCH = "";
let VIEW = localStorage.getItem("bomdia_view") || "cards";

const el = (id) => document.getElementById(id);

// --- Saudacao pela hora do dia --------------------------------------
function greet() {
  const h = new Date().getHours();
  let g = "Bom dia";
  if (h >= 12 && h < 18) g = "Boa tarde";
  else if (h >= 18 || h < 5) g = "Boa noite";
  el("greeting").textContent = g;
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
  render();
}

// --- Helpers de dados -----------------------------------------------
function isLate(t) {
  if (!t.due_date || t.status === "concluida") return false;
  return t.due_date < new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const PRIO_RANK = { alta: 0, media: 1, baixa: 2 };
const PRIO_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" };

function matchesFilters(t, { ignoreStatus = false } = {}) {
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
  const arr = [...list];
  const far = "9999-12-31";
  if (SORT === "prazo") {
    arr.sort((a, b) => (a.due_date || far).localeCompare(b.due_date || far));
  } else if (SORT === "criacao") {
    arr.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  } else if (SORT === "az") {
    arr.sort((a, b) => a.title.localeCompare(b.title, "pt"));
  } else {
    // auto: concluidas por ultimo, depois prioridade, depois prazo
    arr.sort((a, b) => {
      const dc = (a.status === "concluida") - (b.status === "concluida");
      if (dc) return dc;
      const dp = PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
      if (dp) return dp;
      return (a.due_date || far).localeCompare(b.due_date || far);
    });
  }
  return arr;
}

// --- Render principal -----------------------------------------------
function render() {
  greet();
  updateSubtitle();

  // reflete o modo ativo nos botoes
  [...el("viewToggle").children].forEach((b) =>
    b.classList.toggle("active", b.dataset.view === VIEW));
  // filtro de status nao se aplica ao kanban (as colunas ja sao o status)
  el("statusFilters").style.opacity = VIEW === "kanban" ? ".4" : "1";
  el("statusFilters").style.pointerEvents = VIEW === "kanban" ? "none" : "auto";

  const board = el("board");
  board.className = "board view-" + VIEW;
  board.innerHTML = "";

  if (VIEW === "kanban") return renderKanban(board);

  const list = sortTasks(TASKS.filter((t) => matchesFilters(t)));
  el("empty").classList.toggle("hidden", list.length > 0);
  for (const t of list) {
    board.appendChild(VIEW === "lista" ? listRow(t) : card(t));
  }
}

function updateSubtitle() {
  const ativas = TASKS.filter((t) => t.status !== "concluida").length;
  const atrasadas = TASKS.filter(isLate).length;
  let sub = ativas === 0 ? "Tudo em dia por aqui ☕" :
    `Você tem ${ativas} demanda${ativas > 1 ? "s" : ""} ativa${ativas > 1 ? "s" : ""}`;
  if (atrasadas > 0) sub += ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}`;
  el("subtitle").textContent = sub;
}

// --- Componentes: metadados compartilhados --------------------------
function metaHTML(t) {
  const late = isLate(t);
  let meta = `<span class="tag prio-${t.priority}">${PRIO_LABEL[t.priority] || t.priority}</span>`;
  if (t.due_date)
    meta += `<span class="tag ${late ? "due-late" : ""}">📅 ${fmtDate(t.due_date)}</span>`;
  return meta;
}

function linksHTML(t) {
  let links = "";
  for (const l of t.links || []) {
    const icon = l.kind === "pasta" ? "📁" : "🔗";
    links += `<button class="link-btn" data-kind="${l.kind}" data-target="${esc(l.target)}" title="${esc(l.target)}">${icon} ${esc(l.label || l.target)}</button>`;
  }
  return links;
}

function statusSelectHTML(t) {
  return `<select class="status-select">
      <option value="aberta"${t.status === "aberta" ? " selected" : ""}>◽ Aberta</option>
      <option value="andamento"${t.status === "andamento" ? " selected" : ""}>🔨 Em andamento</option>
      <option value="concluida"${t.status === "concluida" ? " selected" : ""}>✅ Concluída</option>
    </select>`;
}

function wireCard(c, t) {
  const title = c.querySelector(".card-title");
  if (title) title.addEventListener("click", () => openModal(t));
  const sel = c.querySelector(".status-select");
  if (sel) sel.addEventListener("change", async (e) => {
    await api("PUT", `/api/tasks/${t.id}`, { status: e.target.value });
    loadTasks();
  });
  c.querySelectorAll(".link-btn").forEach((b) =>
    b.addEventListener("click", () => openLink(b.dataset.kind, b.dataset.target)));
}

// --- Modo Cards -----------------------------------------------------
function card(t) {
  const c = document.createElement("div");
  c.className = `card ${t.priority}` + (t.status === "concluida" ? " done" : "");
  c.draggable = true;
  c.dataset.id = t.id;

  let people = "";
  if (t.requested_by) people += `<span>Pediu: <b>${esc(t.requested_by)}</b></span>`;
  if (t.send_to) people += `<span>Enviar p/: <b>${esc(t.send_to)}</b></span>`;
  const links = linksHTML(t);

  c.innerHTML = `
    <div class="card-head"><div class="card-title">${esc(t.title)}</div></div>
    <div class="card-meta">${metaHTML(t)}</div>
    ${t.description ? `<div class="card-desc">${esc(t.description)}</div>` : ""}
    ${people ? `<div class="card-people">${people}</div>` : ""}
    ${links ? `<div class="card-links">${links}</div>` : ""}
    <div class="card-foot">${statusSelectHTML(t)}</div>`;

  wireCard(c, t);
  addDrag(c, t);
  return c;
}

// --- Modo Lista -----------------------------------------------------
function listRow(t) {
  const r = document.createElement("div");
  r.className = `list-row ${t.priority}` + (t.status === "concluida" ? " done" : "");
  r.draggable = true;
  r.dataset.id = t.id;

  const people = [t.requested_by && `de ${esc(t.requested_by)}`,
                  t.send_to && `→ ${esc(t.send_to)}`].filter(Boolean).join("  ");
  const links = linksHTML(t);

  r.innerHTML = `
    <span class="dot dot-${t.priority}" title="${PRIO_LABEL[t.priority]}"></span>
    <span class="list-title card-title">${esc(t.title)}</span>
    <span class="list-people">${people}</span>
    <span class="list-due">${t.due_date ? (isLate(t) ? "⚠️ " : "📅 ") + fmtDate(t.due_date) : ""}</span>
    <span class="list-links">${links}</span>
    <span class="list-status">${statusSelectHTML(t)}</span>`;

  wireCard(r, t);
  addDrag(r, t);
  return r;
}

// --- Modo Kanban ----------------------------------------------------
const COLUMNS = [
  { key: "aberta", label: "◽ Aberta" },
  { key: "andamento", label: "🔨 Em andamento" },
  { key: "concluida", label: "✅ Concluída" },
];

function renderKanban(board) {
  const list = TASKS.filter((t) => matchesFilters(t, { ignoreStatus: true }));
  el("empty").classList.add("hidden");
  for (const col of COLUMNS) {
    const colEl = document.createElement("div");
    colEl.className = "kcol";
    colEl.dataset.status = col.key;
    const items = sortTasks(list.filter((t) => (t.status || "aberta") === col.key));
    colEl.innerHTML = `<div class="kcol-head">${col.label}<span class="kcount">${items.length}</span></div>`;
    const body = document.createElement("div");
    body.className = "kcol-body";
    items.forEach((t) => body.appendChild(card(t)));
    colEl.appendChild(body);
    addDropzone(colEl, col.key);
    board.appendChild(colEl);
  }
}

// --- Drag & drop (muda status ao soltar) ----------------------------
let DRAG_ID = null;
function addDrag(node, t) {
  node.addEventListener("dragstart", (e) => {
    DRAG_ID = t.id;
    node.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  node.addEventListener("dragend", () => {
    DRAG_ID = null;
    node.classList.remove("dragging");
  });
}
function addDropzone(colEl, status) {
  colEl.addEventListener("dragover", (e) => { e.preventDefault(); colEl.classList.add("drop-hover"); });
  colEl.addEventListener("dragleave", () => colEl.classList.remove("drop-hover"));
  colEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    colEl.classList.remove("drop-hover");
    if (DRAG_ID == null) return;
    const task = TASKS.find((x) => x.id === DRAG_ID);
    if (task && task.status !== status) {
      await api("PUT", `/api/tasks/${DRAG_ID}`, { status });
      loadTasks();
    }
  });
}

// --- Abrir link/pasta ------------------------------------------------
async function openLink(kind, target) {
  if (kind === "pasta") {
    const r = await api("POST", "/api/open", { path: target });
    if (!r.ok) toast(r.message || "Não consegui abrir a pasta", true);
    else toast("Abrindo pasta...");
  } else {
    let url = target;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    window.open(url, "_blank");
  }
}

// --- Modal ----------------------------------------------------------
function blankLinkRow(kind = "web", label = "", target = "") {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `
    <select>
      <option value="web"${kind === "web" ? " selected" : ""}>🔗 Web</option>
      <option value="pasta"${kind === "pasta" ? " selected" : ""}>📁 Pasta</option>
    </select>
    <input class="l-label" placeholder="Apelido (opcional)" value="${esc(label)}">
    <input class="l-target" placeholder="Link ou caminho da pasta" value="${esc(target)}">
    <button type="button" class="rm">✕</button>`;
  row.querySelector(".rm").addEventListener("click", () => row.remove());
  return row;
}

function openModal(task) {
  el("taskForm").reset();
  el("linksList").innerHTML = "";
  if (task) {
    el("modalTitle").textContent = "Editar demanda";
    el("taskId").value = task.id;
    el("title").value = task.title || "";
    el("priority").value = task.priority || "media";
    el("due_date").value = task.due_date || "";
    el("requested_by").value = task.requested_by || "";
    el("send_to").value = task.send_to || "";
    el("description").value = task.description || "";
    (task.links || []).forEach((l) =>
      el("linksList").appendChild(blankLinkRow(l.kind, l.label, l.target)));
    el("btnDelete").classList.remove("hidden");
  } else {
    el("modalTitle").textContent = "Nova demanda";
    el("taskId").value = "";
    el("btnDelete").classList.add("hidden");
  }
  el("modal").classList.remove("hidden");
  el("title").focus();
}

function closeModal() { el("modal").classList.add("hidden"); }

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
    title: el("title").value,
    priority: el("priority").value,
    due_date: el("due_date").value,
    requested_by: el("requested_by").value,
    send_to: el("send_to").value,
    description: el("description").value,
    links: collectLinks(),
  };
  const id = el("taskId").value;
  if (id) await api("PUT", `/api/tasks/${id}`, payload);
  else await api("POST", "/api/tasks", payload);
  closeModal();
  toast("Salvo ✓");
  loadTasks();
}

async function deleteTask() {
  const id = el("taskId").value;
  if (!id) return;
  if (!confirm("Excluir esta demanda?")) return;
  await api("DELETE", `/api/tasks/${id}`);
  closeModal();
  loadTasks();
}

// --- Util -----------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
let toastTimer;
function toast(msg, isError) {
  const t = el("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

// --- Eventos --------------------------------------------------------
el("btnNew").addEventListener("click", () => openModal(null));
el("btnClose").addEventListener("click", closeModal);
el("btnCancel").addEventListener("click", closeModal);
el("btnDelete").addEventListener("click", deleteTask);
el("taskForm").addEventListener("submit", saveTask);
el("btnAddLink").addEventListener("click", () =>
  el("linksList").appendChild(blankLinkRow()));
el("modal").addEventListener("click", (e) => {
  if (e.target === el("modal")) closeModal();
});
el("search").addEventListener("input", (e) => { SEARCH = e.target.value; render(); });
el("sort").addEventListener("change", (e) => { SORT = e.target.value; render(); });
el("lateOnly").addEventListener("change", (e) => { LATE_ONLY = e.target.checked; render(); });

el("statusFilters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  [...el("statusFilters").querySelectorAll(".chip")].forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  FILTER = e.target.dataset.status;
  render();
});
el("prioFilters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  [...el("prioFilters").querySelectorAll(".chip")].forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  PRIO = e.target.dataset.prio;
  render();
});
el("viewToggle").addEventListener("click", (e) => {
  const b = e.target.closest(".vbtn");
  if (!b) return;
  VIEW = b.dataset.view;
  localStorage.setItem("bomdia_view", VIEW);
  render();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

loadTasks();
