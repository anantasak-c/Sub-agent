const state = {
  tasks: [],
  selectedTaskId: null,
  runs: [],
};

const labels = {
  do_now: "Do now",
  do_later: "Do later",
  research: "Research",
  debate: "Debate idea",
  teach_me: "Teach me",
  monitor_changes: "Monitor changes",
  reminder: "Reminder",
  inbox: "Inbox",
  ready: "Ready",
  blocked: "Blocked",
  in_progress: "In progress",
  waiting_approval: "Waiting approval",
  done: "Done",
  cancelled: "Cancelled",
};

const taskForm = document.querySelector("#taskForm");
const taskRows = document.querySelector("#taskRows");
const searchInput = document.querySelector("#searchInput");
const typeFilter = document.querySelector("#typeFilter");
const statusFilter = document.querySelector("#statusFilter");
const agentFilter = document.querySelector("#agentFilter");
const createRunBtn = document.querySelector("#createRunBtn");
const taskDetail = document.querySelector("#taskDetail");
const runHistory = document.querySelector("#runHistory");
const emptyState = document.querySelector("#emptyState");
const totalCount = document.querySelector("#totalCount");
const dueCount = document.querySelector("#dueCount");
const unassignedCount = document.querySelector("#unassignedCount");

function formatLabel(value) {
  return labels[value] || value || "-";
}

function dueState(dueDate) {
  if (!dueDate) return { label: "-", className: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return { label: `${dueDate} overdue`, className: "due-overdue" };
  if (diffDays === 0) return { label: `${dueDate} today`, className: "due-today" };
  if (diffDays <= 7) return { label: `${dueDate} soon`, className: "due-today" };
  return { label: dueDate, className: "" };
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.append(el);
  window.setTimeout(() => el.remove(), 3600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

async function loadTasks() {
  const data = await api("/api/tasks");
  state.tasks = data.tasks;
  render();
}

function filteredTasks() {
  const query = searchInput.value.trim().toLowerCase();
  return state.tasks.filter((task) => {
    const haystack = [
      task.task_id,
      task.title,
      task.details,
      task.desired_outcome,
      task.assigned_agent,
      task.next_action,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!query || haystack.includes(query)) &&
      (!typeFilter.value || task.type === typeFilter.value) &&
      (!statusFilter.value || task.status === statusFilter.value) &&
      (!agentFilter.value || task.assigned_agent === agentFilter.value)
    );
  });
}

function renderSummary() {
  totalCount.textContent = state.tasks.length;
  dueCount.textContent = state.tasks.filter((task) => {
    const due = dueState(task.due_date);
    return due.className === "due-overdue" || due.className === "due-today";
  }).length;
  unassignedCount.textContent = state.tasks.filter((task) => task.assigned_agent === "unassigned").length;
}

function renderRows() {
  const rows = filteredTasks();
  taskRows.innerHTML = "";
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No tasks match the current filters.";
    tr.append(td);
    taskRows.append(tr);
    return;
  }

  rows.forEach((task) => {
    const tr = document.createElement("tr");
    tr.className = task.task_id === state.selectedTaskId ? "selected" : "";
    tr.tabIndex = 0;
    tr.addEventListener("click", () => selectTask(task.task_id));
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter") selectTask(task.task_id);
    });

    const due = dueState(task.due_date);
    tr.innerHTML = `
      <td>
        <div class="task-title">
          <strong></strong>
          <span></span>
        </div>
      </td>
      <td><span class="badge"></span></td>
      <td><span class="badge"></span></td>
      <td><span class="badge priority-${task.priority}"></span></td>
      <td><span class="badge ${due.className}"></span></td>
      <td><span class="badge agent-${task.assigned_agent}"></span></td>
    `;
    tr.querySelector("strong").textContent = task.title;
    tr.querySelector(".task-title span").textContent = task.task_id;
    const badges = tr.querySelectorAll(".badge");
    badges[0].textContent = formatLabel(task.type);
    badges[1].textContent = formatLabel(task.status);
    badges[2].textContent = formatLabel(task.priority);
    badges[3].textContent = due.label;
    badges[4].textContent = task.assigned_agent;
    taskRows.append(tr);
  });
}

function renderDetail() {
  const task = state.tasks.find((item) => item.task_id === state.selectedTaskId);
  createRunBtn.disabled = !task;

  if (!task) {
    taskDetail.hidden = true;
    runHistory.hidden = true;
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  taskDetail.hidden = false;
  runHistory.hidden = false;
  const template = document.querySelector("#taskDetailTemplate");
  const fragment = template.content.cloneNode(true);
  fragment.querySelectorAll("[data-field]").forEach((node) => {
    node.textContent = task[node.dataset.field] || "-";
  });
  taskDetail.innerHTML = "";
  taskDetail.append(fragment);
  renderRuns();
}

function renderRuns() {
  runHistory.innerHTML = "<h3>Run History</h3>";
  if (state.runs.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No runs yet.";
    runHistory.append(empty);
    return;
  }
  state.runs.forEach((run) => {
    const item = document.createElement("div");
    item.className = "run-item";
    item.innerHTML = `
      <strong></strong>
      <code></code>
    `;
    item.querySelector("strong").textContent = `${run.run_id} - ${run.status}`;
    item.querySelector("code").textContent = JSON.stringify(run.brief, null, 2);
    runHistory.append(item);
  });
}

function render() {
  renderSummary();
  renderRows();
  renderDetail();
}

async function selectTask(taskId) {
  state.selectedTaskId = taskId;
  const data = await api(`/api/tasks/${taskId}/runs`);
  state.runs = data.runs;
  render();
}

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const data = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    taskForm.reset();
    state.selectedTaskId = data.task.task_id;
    state.runs = [];
    await loadTasks();
    toast(`Task created and assigned to ${data.task.assigned_agent}.`);
  } catch (error) {
    toast(error.message);
  }
});

createRunBtn.addEventListener("click", async () => {
  if (!state.selectedTaskId) return;
  try {
    const data = await api(`/api/tasks/${state.selectedTaskId}/runs`, { method: "POST" });
    state.tasks = state.tasks.map((task) => (task.task_id === data.task.task_id ? data.task : task));
    const runs = await api(`/api/tasks/${state.selectedTaskId}/runs`);
    state.runs = runs.runs;
    render();
    toast(`Run ${data.run.run_id} created for Cloud.`);
  } catch (error) {
    toast(error.message);
  }
});

[searchInput, typeFilter, statusFilter, agentFilter].forEach((control) => {
  control.addEventListener("input", render);
});

loadTasks().catch((error) => toast(error.message));
