import {
  taskPriorities,
  taskStatuses,
  taskTypes,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/types";

export type TaskInput = {
  title: string;
  details: string;
  desired_outcome: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  next_action: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isOneOf<T extends readonly string[]>(value: string, options: T): value is T[number] {
  return options.includes(value);
}

export function safeTaskId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.slice(0, 80);
}

export function parseTaskInput(payload: unknown): TaskInput {
  const body = typeof payload === "object" && payload !== null ? payload : {};
  const record = body as Record<string, unknown>;
  const title = asString(record.title);

  if (!title) {
    throw new Error("title is required");
  }

  const type = asString(record.type) || "do_now";
  const status = asString(record.status) || "inbox";
  const priority = asString(record.priority) || "medium";

  if (!isOneOf(type, taskTypes)) {
    throw new Error("invalid task type");
  }

  if (!isOneOf(status, taskStatuses)) {
    throw new Error("invalid status");
  }

  if (!isOneOf(priority, taskPriorities)) {
    throw new Error("invalid priority");
  }

  return {
    title,
    details: asString(record.details),
    desired_outcome: asString(record.desired_outcome),
    type,
    status,
    priority,
    due_date: asString(record.due_date),
    next_action: asString(record.next_action),
  };
}
