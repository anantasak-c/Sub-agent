import { neon } from "@neondatabase/serverless";
import { assignTask } from "@/lib/assignment";
import { safeTaskId, type TaskInput } from "@/lib/validation";
import type { AssignedAgent, RunBrief, Task, TaskRun } from "@/lib/types";

type DbRow = Record<string, unknown>;

let sqlClient: ReturnType<typeof neon> | null = null;
let schemaReady = false;

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }

  return sqlClient;
}

async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      desired_outcome TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      assigned_agent TEXT NOT NULL,
      assignment_reason TEXT NOT NULL,
      next_action TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS task_runs (
      run_id TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_agent TEXT NOT NULL,
      brief JSONB NOT NULL,
      PRIMARY KEY (task_id, run_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS task_runs_task_id_created_at_idx
      ON task_runs (task_id, created_at DESC)
  `;
  schemaReady = true;
}

function normalizeTask(row: Record<string, unknown>): Task {
  return {
    task_id: String(row.task_id),
    title: String(row.title),
    details: String(row.details ?? ""),
    desired_outcome: String(row.desired_outcome ?? ""),
    type: row.type as Task["type"],
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    due_date: String(row.due_date ?? ""),
    assigned_agent: row.assigned_agent as AssignedAgent,
    assignment_reason: String(row.assignment_reason ?? ""),
    next_action: String(row.next_action ?? ""),
    run_history: Array.isArray(row.run_history) ? row.run_history.map(String) : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeRun(row: Record<string, unknown>): TaskRun {
  return {
    run_id: String(row.run_id),
    task_id: String(row.task_id),
    created_at: String(row.created_at),
    status: "queued_for_cloud",
    assigned_agent: row.assigned_agent as AssignedAgent,
    brief: row.brief as RunBrief,
  };
}

async function uniqueTaskId(title: string): Promise<string> {
  const sql = getSql();
  const base = safeTaskId(title) || `task-${Date.now()}`;
  let candidate = base;
  let counter = 2;

  while (true) {
    const rows = (await sql`SELECT task_id FROM tasks WHERE task_id = ${candidate} LIMIT 1`) as DbRow[];
    if (rows.length === 0) {
      return candidate;
    }
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

export async function listTasks(): Promise<Task[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      t.*,
      COALESCE(
        ARRAY_REMOVE(ARRAY_AGG(r.run_id ORDER BY r.created_at), NULL),
        ARRAY[]::TEXT[]
      ) AS run_history
    FROM tasks t
    LEFT JOIN task_runs r ON r.task_id = t.task_id
    GROUP BY t.task_id
    ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      NULLIF(t.due_date, '') ASC NULLS LAST,
      t.created_at DESC
  `) as DbRow[];
  return rows.map((row) => normalizeTask(row));
}

export async function getTask(taskId: string): Promise<Task | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      t.*,
      COALESCE(
        ARRAY_REMOVE(ARRAY_AGG(r.run_id ORDER BY r.created_at), NULL),
        ARRAY[]::TEXT[]
      ) AS run_history
    FROM tasks t
    LEFT JOIN task_runs r ON r.task_id = t.task_id
    WHERE t.task_id = ${taskId}
    GROUP BY t.task_id
    LIMIT 1
  `) as DbRow[];
  return rows[0] ? normalizeTask(rows[0]) : null;
}

export async function createTask(input: TaskInput): Promise<Task> {
  await ensureSchema();
  const sql = getSql();
  const taskId = await uniqueTaskId(input.title);
  const assignment = assignTask(input.type, input.details, input.desired_outcome);
  const nextAction = input.next_action || assignment.next_action;
  const timestamp = nowIso();

  const rows = (await sql`
    INSERT INTO tasks (
      task_id,
      title,
      details,
      desired_outcome,
      type,
      status,
      priority,
      due_date,
      assigned_agent,
      assignment_reason,
      next_action,
      created_at,
      updated_at
    )
    VALUES (
      ${taskId},
      ${input.title},
      ${input.details},
      ${input.desired_outcome},
      ${input.type},
      ${input.status},
      ${input.priority},
      ${input.due_date},
      ${assignment.assigned_agent},
      ${assignment.assignment_reason},
      ${nextAction},
      ${timestamp},
      ${timestamp}
    )
    RETURNING *, ARRAY[]::TEXT[] AS run_history
  `) as DbRow[];

  return normalizeTask(rows[0]);
}

export async function createRun(taskId: string): Promise<{ task: Task; run: TaskRun } | null> {
  await ensureSchema();
  const sql = getSql();
  const task = await getTask(taskId);
  if (!task) {
    return null;
  }

  const timestamp = nowIso();
  const runId = `${timestamp.replace(/[-:]/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const brief: RunBrief = {
    title: task.title,
    details: task.details,
    desired_outcome: task.desired_outcome,
    type: task.type,
    priority: task.priority,
    due_date: task.due_date,
    assignment_reason: task.assignment_reason,
    next_action: task.next_action,
    approval_boundary:
      "No external actions, new agent creation, publishing, deletion, purchase, subscription, or messaging without explicit user approval.",
  };

  const runRows = (await sql`
    INSERT INTO task_runs (
      run_id,
      task_id,
      created_at,
      status,
      assigned_agent,
      brief
    )
    VALUES (
      ${runId},
      ${task.task_id},
      ${timestamp},
      ${"queued_for_cloud"},
      ${task.assigned_agent},
      ${JSON.stringify(brief)}::jsonb
    )
    RETURNING *
  `) as DbRow[];

  const nextStatus = task.assigned_agent === "unassigned" ? "waiting_approval" : "ready";
  await sql`
    UPDATE tasks
    SET status = ${nextStatus}, updated_at = ${timestamp}
    WHERE task_id = ${task.task_id}
  `;

  const updatedTask = await getTask(task.task_id);
  return {
    task: updatedTask ?? task,
    run: normalizeRun(runRows[0]),
  };
}

export async function listRuns(taskId: string): Promise<TaskRun[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM task_runs
    WHERE task_id = ${taskId}
    ORDER BY created_at DESC
  `) as DbRow[];
  return rows.map((row) => normalizeRun(row));
}
