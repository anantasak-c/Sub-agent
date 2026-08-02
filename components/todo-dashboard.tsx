"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Task, TaskRun } from "@/lib/types";

const labels: Record<string, string> = {
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
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function formatLabel(value: string) {
  return labels[value] || value || "-";
}

function dueState(dueDate: string) {
  if (!dueDate) {
    return { label: "-", className: "" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: `${dueDate} overdue`, className: "due-overdue" };
  }
  if (diffDays === 0) {
    return { label: `${dueDate} today`, className: "due-today" };
  }
  if (diffDays <= 7) {
    return { label: `${dueDate} soon`, className: "due-today" };
  }
  return { label: dueDate, className: "" };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

type TasksResponse = {
  tasks: Task[];
};

type RunsResponse = {
  runs: TaskRun[];
};

type CreateTaskResponse = {
  task: Task;
};

type CreateRunResponse = {
  task: Task;
  run: TaskRun;
};

export function TodoDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const selectedTask = tasks.find((task) => task.task_id === selectedTaskId);

  async function loadTasks() {
    setLoading(true);
    try {
      const data = await api<TasksResponse>("/api/tasks");
      setTasks(data.tasks);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  async function selectTask(taskId: string) {
    setSelectedTaskId(taskId);
    try {
      const data = await api<RunsResponse>(`/api/tasks/${taskId}/runs`);
      setRuns(data.runs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load runs");
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
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
        (!typeFilter || task.type === typeFilter) &&
        (!statusFilter || task.status === statusFilter) &&
        (!agentFilter || task.assigned_agent === agentFilter)
      );
    });
  }, [agentFilter, search, statusFilter, tasks, typeFilter]);

  const dueSoonCount = tasks.filter((task) => {
    const due = dueState(task.due_date);
    return due.className === "due-overdue" || due.className === "due-today";
  }).length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const data = await api<CreateTaskResponse>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      setTasks((current) => [data.task, ...current]);
      setRuns([]);
      setSelectedTaskId(data.task.task_id);
      setMessage(`Task created and assigned to ${data.task.assigned_agent}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create task");
    }
  }

  async function createRun() {
    if (!selectedTaskId) {
      return;
    }

    try {
      const data = await api<CreateRunResponse>(`/api/tasks/${selectedTaskId}/runs`, {
        method: "POST",
      });
      setTasks((current) =>
        current.map((task) => (task.task_id === data.task.task_id ? data.task : task)),
      );
      setRuns((current) => [data.run, ...current]);
      setMessage(`Run ${data.run.run_id} created for Cloud.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create run");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Cloud Todo Dashboard</h1>
          <p>Capture tasks, assign the right agent, and prepare Codex run briefs.</p>
        </div>
        <div className="summary" aria-live="polite">
          <span>
            <strong>{tasks.length}</strong> tasks
          </span>
          <span>
            <strong>{dueSoonCount}</strong> due soon
          </span>
          <span>
            <strong>{tasks.filter((task) => task.assigned_agent === "unassigned").length}</strong>{" "}
            unassigned
          </span>
        </div>
      </header>

      <section className="task-composer" aria-labelledby="newTaskTitle">
        <h2 id="newTaskTitle">New Task</h2>
        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            Title
            <input name="title" required maxLength={120} placeholder="Research AI note-taking tools" />
          </label>
          <label>
            Desired outcome
            <input
              name="desired_outcome"
              maxLength={240}
              placeholder="A short comparison and recommendation"
            />
          </label>
          <label className="wide">
            Details
            <textarea
              name="details"
              rows={4}
              placeholder="What should Cloud understand before assigning this task?"
            />
          </label>
          <label>
            Type
            <select name="type" defaultValue="do_now">
              <option value="do_now">Do now</option>
              <option value="do_later">Do later</option>
              <option value="research">Research</option>
              <option value="debate">Debate idea</option>
              <option value="teach_me">Teach me</option>
              <option value="monitor_changes">Monitor changes</option>
              <option value="reminder">Reminder</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue="inbox">
              <option value="inbox">Inbox</option>
              <option value="ready">Ready</option>
              <option value="blocked">Blocked</option>
              <option value="in_progress">In progress</option>
              <option value="waiting_approval">Waiting approval</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue="medium">
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            Due date
            <input name="due_date" type="date" />
          </label>
          <label className="wide">
            Next action
            <input
              name="next_action"
              maxLength={240}
              placeholder="Optional. Leave blank for Cloud to suggest one."
            />
          </label>
          <button type="submit">Add task</button>
        </form>
      </section>

      {message ? <div className="notice">{message}</div> : null}

      <section className="dashboard-grid">
        <div className="task-list-panel">
          <div className="panel-heading">
            <h2>Tasks</h2>
            <div className="filters">
              <input
                type="search"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label="Filter by type"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="">All types</option>
                <option value="do_now">Do now</option>
                <option value="do_later">Do later</option>
                <option value="research">Research</option>
                <option value="debate">Debate idea</option>
                <option value="teach_me">Teach me</option>
                <option value="monitor_changes">Monitor changes</option>
                <option value="reminder">Reminder</option>
              </select>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="inbox">Inbox</option>
                <option value="ready">Ready</option>
                <option value="blocked">Blocked</option>
                <option value="in_progress">In progress</option>
                <option value="waiting_approval">Waiting approval</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                aria-label="Filter by agent"
                value={agentFilter}
                onChange={(event) => setAgentFilter(event.target.value)}
              >
                <option value="">All agents</option>
                <option value="cloud">Cloud</option>
                <option value="web_researcher">web_researcher</option>
                <option value="idea_debater">idea_debater</option>
                <option value="teacher">teacher</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Agent</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Loading tasks...</td>
                  </tr>
                ) : filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No tasks match the current filters.</td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const due = dueState(task.due_date);
                    return (
                      <tr
                        aria-label={`Select task ${task.title}`}
                        aria-selected={task.task_id === selectedTaskId}
                        className={task.task_id === selectedTaskId ? "selected" : ""}
                        key={task.task_id}
                        onClick={() => void selectTask(task.task_id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void selectTask(task.task_id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td>
                          <div className="task-title">
                            <strong>{task.title}</strong>
                            <span>{task.task_id}</span>
                          </div>
                        </td>
                        <td>
                          <span className="badge">{formatLabel(task.type)}</span>
                        </td>
                        <td>
                          <span className="badge">{formatLabel(task.status)}</span>
                        </td>
                        <td>
                          <span className={`badge priority-${task.priority}`}>
                            {formatLabel(task.priority)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${due.className}`}>{due.label}</span>
                        </td>
                        <td>
                          <span className={`badge agent-${task.assigned_agent}`}>
                            {task.assigned_agent}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="detail-panel" aria-live="polite">
          <div className="panel-heading">
            <h2>Task Detail</h2>
            <button type="button" disabled={!selectedTask} onClick={() => void createRun()}>
              Create run
            </button>
          </div>

          {!selectedTask ? (
            <div className="empty-state">
              Select a task to inspect assignment, next action, and run history.
            </div>
          ) : (
            <>
              <div className="task-detail">
                <dl>
                  <div>
                    <dt>Task ID</dt>
                    <dd>{selectedTask.task_id}</dd>
                  </div>
                  <div>
                    <dt>Title</dt>
                    <dd>{selectedTask.title}</dd>
                  </div>
                  <div>
                    <dt>Details</dt>
                    <dd>{selectedTask.details || "-"}</dd>
                  </div>
                  <div>
                    <dt>Desired outcome</dt>
                    <dd>{selectedTask.desired_outcome || "-"}</dd>
                  </div>
                  <div>
                    <dt>Assignment reason</dt>
                    <dd>{selectedTask.assignment_reason}</dd>
                  </div>
                  <div>
                    <dt>Next action</dt>
                    <dd>{selectedTask.next_action}</dd>
                  </div>
                </dl>
              </div>

              <div className="run-history">
                <h3>Run History</h3>
                {runs.length === 0 ? (
                  <p>No runs yet.</p>
                ) : (
                  runs.map((run) => (
                    <div className="run-item" key={run.run_id}>
                      <strong>
                        {run.run_id} - {run.status}
                      </strong>
                      <code>{JSON.stringify(run.brief, null, 2)}</code>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
