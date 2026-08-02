export const taskTypes = [
  "do_now",
  "do_later",
  "research",
  "debate",
  "teach_me",
  "monitor_changes",
  "reminder",
] as const;

export const taskStatuses = [
  "inbox",
  "ready",
  "blocked",
  "in_progress",
  "waiting_approval",
  "done",
  "cancelled",
] as const;

export const taskPriorities = ["low", "medium", "high", "urgent"] as const;

export type TaskType = (typeof taskTypes)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];

export type AssignedAgent =
  | "cloud"
  | "web_researcher"
  | "idea_debater"
  | "teacher"
  | "unassigned";

export type Task = {
  task_id: string;
  title: string;
  details: string;
  desired_outcome: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  assigned_agent: AssignedAgent;
  assignment_reason: string;
  next_action: string;
  run_history: string[];
  created_at: string;
  updated_at: string;
};

export type RunBrief = {
  title: string;
  details: string;
  desired_outcome: string;
  type: TaskType;
  priority: TaskPriority;
  due_date: string;
  assignment_reason: string;
  next_action: string;
  approval_boundary: string;
};

export type TaskRun = {
  run_id: string;
  task_id: string;
  created_at: string;
  status: "queued_for_cloud" | "running" | "completed" | "failed";
  assigned_agent: AssignedAgent;
  brief: RunBrief;
  result: string;
  error: string;
  completed_at: string;
};
