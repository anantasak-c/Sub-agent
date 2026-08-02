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
);

CREATE TABLE IF NOT EXISTS task_runs (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_agent TEXT NOT NULL,
  brief JSONB NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, run_id)
);

CREATE INDEX IF NOT EXISTS task_runs_task_id_created_at_idx
  ON task_runs (task_id, created_at DESC);
