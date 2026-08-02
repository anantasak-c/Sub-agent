import type { AssignedAgent, TaskType } from "@/lib/types";

type Assignment = {
  assigned_agent: AssignedAgent;
  assignment_reason: string;
  next_action: string;
};

export function assignTask(type: TaskType, details: string, desiredOutcome: string): Assignment {
  const text = `${details} ${desiredOutcome}`.toLowerCase();

  if (type === "research") {
    return {
      assigned_agent: "web_researcher",
      assignment_reason:
        "Research tasks require current information, source checking, or multiple-source comparison.",
      next_action: "Prepare a concise research brief with sources if requested.",
    };
  }

  if (type === "debate") {
    return {
      assigned_agent: "idea_debater",
      assignment_reason:
        "Debate tasks require challenging assumptions, risks, counterarguments, and simpler alternatives.",
      next_action:
        "Pressure-test the idea and return the strongest objections plus recommended next step.",
    };
  }

  if (type === "teach_me") {
    return {
      assigned_agent: "teacher",
      assignment_reason:
        "Teaching tasks require clear Thai explanations, examples, analogies, and minimal jargon.",
      next_action: "Explain the topic simply and include practical examples.",
    };
  }

  if (type === "monitor_changes") {
    return {
      assigned_agent: "web_researcher",
      assignment_reason:
        "Monitoring tasks usually need periodic research or source checking, but this MVP only prepares the tracking brief.",
      next_action:
        "Record source, frequency, and next check date. Cloud must approve any automation later.",
    };
  }

  if (type === "reminder") {
    return {
      assigned_agent: "cloud",
      assignment_reason:
        "Reminder tasks are local dashboard reminders and do not require a specialist agent in this MVP.",
      next_action: "Track due date and show reminder state in the dashboard.",
    };
  }

  if (/(research|latest|compare|source|ข้อมูลล่าสุด|ค้นคว้า)/i.test(text)) {
    return {
      assigned_agent: "web_researcher",
      assignment_reason:
        "The task text suggests research, latest information, comparison, or source verification.",
      next_action: "Prepare a research brief before action.",
    };
  }

  if (/(risk|assumption|debate|challenge|โต้แย้ง|ความเสี่ยง)/i.test(text)) {
    return {
      assigned_agent: "idea_debater",
      assignment_reason: "The task text suggests pressure-testing an idea or plan.",
      next_action: "Identify assumptions, risks, and simpler alternatives.",
    };
  }

  if (/(explain|teach|learn|สอน|อธิบาย|เข้าใจ)/i.test(text)) {
    return {
      assigned_agent: "teacher",
      assignment_reason: "The task text suggests the user needs explanation or learning support.",
      next_action: "Explain the topic clearly with examples.",
    };
  }

  return {
    assigned_agent: "unassigned",
    assignment_reason:
      "No current team member clearly matches this task. Cloud should ask the user or propose a new agent before assigning.",
    next_action:
      "Clarify the task or propose a new agent. Do not create a new agent without user approval.",
  };
}
