import type { AssignedAgent, Task } from "@/lib/types";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type AgentRunResult = {
  result: string;
};

const agentInstructions: Record<AssignedAgent, string> = {
  cloud: [
    "You are Cloud, a formal Thai personal assistant.",
    "Create a concise execution outcome for this task.",
    "If the task is a reminder or local planning task, summarize the reminder state and next practical step.",
  ].join("\n"),
  web_researcher: [
    "You are web_researcher, a formal research specialist for Cloud.",
    "Use current information when useful. Compare sources when available.",
    "Return a concise research brief in Thai unless the task clearly asks for English.",
    "Include source links when web search results or citations are available.",
  ].join("\n"),
  idea_debater: [
    "You are idea_debater, a formal critical thinking specialist for Cloud.",
    "Challenge assumptions directly. Identify weak points, counterarguments, risks, and simpler alternatives.",
    "Be candid and practical. Do not soften important objections.",
    "Return the short summary first, then details.",
  ].join("\n"),
  teacher: [
    "You are teacher, a formal Thai explainer for Cloud.",
    "Explain complex topics simply with examples or analogies.",
    "Avoid unnecessary technical jargon. Be direct and concise.",
    "Return the short summary first, then details.",
  ].join("\n"),
  unassigned: [
    "This task has no assigned agent.",
    "Do not execute the task. Explain why Cloud should ask the user to clarify or approve a new agent.",
  ].join("\n"),
};

const approvalBoundary =
  "Hard boundary: Do not send messages, delete data, publish content, deploy, buy, subscribe, modify external systems, create new agents, or perform external actions. Only produce a text outcome for this dashboard run.";

function buildInput(task: Task): string {
  return [
    agentInstructions[task.assigned_agent],
    approvalBoundary,
    "",
    "Task:",
    `- ID: ${task.task_id}`,
    `- Title: ${task.title}`,
    `- Type: ${task.type}`,
    `- Priority: ${task.priority}`,
    `- Due date: ${task.due_date || "-"}`,
    `- Details: ${task.details || "-"}`,
    `- Desired outcome: ${task.desired_outcome || "-"}`,
    `- Assignment reason: ${task.assignment_reason}`,
    `- Next action: ${task.next_action}`,
    "",
    "Return a useful outcome that can be saved in run history. Use Markdown.",
  ].join("\n");
}

function extractOutputText(data: OpenAIResponse): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const fromOutput = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return fromOutput || "";
}

export async function runAssignedAgent(task: Task): Promise<AgentRunResult> {
  if (task.assigned_agent === "unassigned") {
    throw new Error(
      "No assigned agent matches this task. Cloud must clarify the task or propose a new agent before running it.",
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured, so Cloud cannot run agents automatically yet.");
  }

  const body: Record<string, unknown> = {
    model: process.env.OPENAI_MODEL || "gpt-5",
    input: buildInput(task),
  };

  if (task.assigned_agent === "web_researcher") {
    body.tools = [{ type: "web_search" }];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as OpenAIResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI request failed with status ${response.status}`);
  }

  const result = extractOutputText(data);
  if (!result) {
    throw new Error("OpenAI returned no text output for this run.");
  }

  return { result };
}
