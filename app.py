from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
TASKS_DIR = ROOT / "tasks" / "items"
RUNS_DIR = ROOT / "runs"

TASK_TYPES = {
    "do_now",
    "do_later",
    "research",
    "debate",
    "teach_me",
    "monitor_changes",
    "reminder",
}

STATUSES = {
    "inbox",
    "ready",
    "blocked",
    "in_progress",
    "waiting_approval",
    "done",
    "cancelled",
}

PRIORITIES = {"low", "medium", "high", "urgent"}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def safe_task_id(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower()).strip("-")
    return cleaned[:80] or f"task-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"


def unique_task_id(title: str) -> str:
    base = safe_task_id(title)
    candidate = base
    counter = 2
    while (TASKS_DIR / f"{candidate}.json").exists():
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def assignment_for(task_type: str, details: str, desired_outcome: str) -> tuple[str, str, str]:
    text = f"{details} {desired_outcome}".lower()

    if task_type == "research":
        return (
            "web_researcher",
            "Research tasks require current information, source checking, or multiple-source comparison.",
            "Prepare a concise research brief with sources if requested.",
        )
    if task_type == "debate":
        return (
            "idea_debater",
            "Debate tasks require challenging assumptions, risks, counterarguments, and simpler alternatives.",
            "Pressure-test the idea and return the strongest objections plus recommended next step.",
        )
    if task_type == "teach_me":
        return (
            "teacher",
            "Teaching tasks require clear Thai explanations, examples, analogies, and minimal jargon.",
            "Explain the topic simply and include practical examples.",
        )
    if task_type == "monitor_changes":
        return (
            "web_researcher",
            "Monitoring tasks usually need periodic research or source checking, but this MVP only prepares the tracking brief.",
            "Record source, frequency, and next check date. Cloud must approve any automation later.",
        )
    if task_type == "reminder":
        return (
            "cloud",
            "Reminder tasks are local dashboard reminders and do not require a specialist agent in this MVP.",
            "Track due date and show reminder state in the dashboard.",
        )

    if any(word in text for word in ("research", "latest", "compare", "source", "ข้อมูลล่าสุด", "ค้นคว้า")):
        return (
            "web_researcher",
            "The task text suggests research, latest information, comparison, or source verification.",
            "Prepare a research brief before action.",
        )
    if any(word in text for word in ("risk", "assumption", "debate", "challenge", "โต้แย้ง", "ความเสี่ยง")):
        return (
            "idea_debater",
            "The task text suggests pressure-testing an idea or plan.",
            "Identify assumptions, risks, and simpler alternatives.",
        )
    if any(word in text for word in ("explain", "teach", "learn", "สอน", "อธิบาย", "เข้าใจ")):
        return (
            "teacher",
            "The task text suggests the user needs explanation or learning support.",
            "Explain the topic clearly with examples.",
        )

    return (
        "unassigned",
        "No current team member clearly matches this task. Cloud should ask the user or propose a new agent before assigning.",
        "Clarify the task or propose a new agent. Do not create a new agent without user approval.",
    )


def public_task(task: dict) -> dict:
    task_id = task["task_id"]
    run_dir = RUNS_DIR / task_id
    run_files = sorted(run_dir.glob("*.json")) if run_dir.exists() else []
    task["run_history"] = [path.stem for path in run_files]
    return task


def task_from_payload(payload: dict, existing: dict | None = None) -> dict:
    existing = existing or {}
    title = str(payload.get("title", existing.get("title", ""))).strip()
    if not title:
        raise ValueError("title is required")

    task_type = str(payload.get("type", existing.get("type", "do_now"))).strip()
    if task_type not in TASK_TYPES:
        raise ValueError("invalid task type")

    status = str(payload.get("status", existing.get("status", "inbox"))).strip()
    if status not in STATUSES:
        raise ValueError("invalid status")

    priority = str(payload.get("priority", existing.get("priority", "medium"))).strip()
    if priority not in PRIORITIES:
        raise ValueError("invalid priority")

    details = str(payload.get("details", existing.get("details", ""))).strip()
    desired_outcome = str(payload.get("desired_outcome", existing.get("desired_outcome", ""))).strip()
    due_date = str(payload.get("due_date", existing.get("due_date", ""))).strip()
    next_action = str(payload.get("next_action", existing.get("next_action", ""))).strip()

    assigned_agent, assignment_reason, default_next_action = assignment_for(task_type, details, desired_outcome)
    if not next_action:
        next_action = default_next_action

    created_at = existing.get("created_at") or now_iso()
    return {
        "task_id": existing.get("task_id") or unique_task_id(title),
        "title": title,
        "details": details,
        "desired_outcome": desired_outcome,
        "type": task_type,
        "status": status,
        "priority": priority,
        "due_date": due_date,
        "assigned_agent": assigned_agent,
        "assignment_reason": assignment_reason,
        "next_action": next_action,
        "run_history": existing.get("run_history", []),
        "created_at": created_at,
        "updated_at": now_iso(),
    }


def run_payload(task: dict) -> dict:
    created_at = now_iso()
    task_id = task["task_id"]
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return {
        "run_id": run_id,
        "task_id": task_id,
        "created_at": created_at,
        "status": "queued_for_cloud",
        "assigned_agent": task["assigned_agent"],
        "brief": {
            "title": task["title"],
            "details": task["details"],
            "desired_outcome": task["desired_outcome"],
            "type": task["type"],
            "priority": task["priority"],
            "due_date": task["due_date"],
            "assignment_reason": task["assignment_reason"],
            "next_action": task["next_action"],
            "approval_boundary": "No external actions, new agent creation, publishing, deletion, purchase, subscription, or messaging without explicit user approval.",
        },
    }


class CloudDashboardHandler(SimpleHTTPRequestHandler):
    server_version = "CloudDashboard/1.0"

    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        clean_path = unquote(parsed.path.lstrip("/"))
        if not clean_path:
            clean_path = "index.html"
        candidate = (PUBLIC_DIR / clean_path).resolve()
        if PUBLIC_DIR.resolve() not in (candidate, *candidate.parents):
            return str(PUBLIC_DIR / "index.html")
        return str(candidate)

    def log_message(self, format: str, *args: object) -> None:
        return

    def send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/tasks":
            tasks = [public_task(read_json(task_path)) for task_path in sorted(TASKS_DIR.glob("*.json"))]
            self.send_json({"tasks": tasks})
            return
        if path.startswith("/api/tasks/") and path.endswith("/runs"):
            task_id = safe_task_id(path.removeprefix("/api/tasks/").removesuffix("/runs"))
            run_dir = RUNS_DIR / task_id
            runs = [read_json(run_path) for run_path in sorted(run_dir.glob("*.json"), reverse=True)] if run_dir.exists() else []
            self.send_json({"runs": runs})
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/tasks":
                task = task_from_payload(self.read_body())
                write_json(TASKS_DIR / f"{task['task_id']}.json", task)
                self.send_json({"task": public_task(task)}, HTTPStatus.CREATED)
                return

            if path.startswith("/api/tasks/") and path.endswith("/runs"):
                task_id = safe_task_id(path.removeprefix("/api/tasks/").removesuffix("/runs"))
                task_path = TASKS_DIR / f"{task_id}.json"
                if not task_path.exists():
                    self.send_json({"error": "task not found"}, HTTPStatus.NOT_FOUND)
                    return
                task = read_json(task_path)
                run = run_payload(task)
                write_json(RUNS_DIR / task_id / f"{run['run_id']}.json", run)
                task["run_history"] = sorted([path.stem for path in (RUNS_DIR / task_id).glob("*.json")])
                task["status"] = "waiting_approval" if task["assigned_agent"] == "unassigned" else "ready"
                task["updated_at"] = now_iso()
                write_json(task_path, task)
                self.send_json({"run": run, "task": public_task(task)}, HTTPStatus.CREATED)
                return
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/tasks/"):
                task_id = safe_task_id(path.removeprefix("/api/tasks/"))
                task_path = TASKS_DIR / f"{task_id}.json"
                if not task_path.exists():
                    self.send_json({"error": "task not found"}, HTTPStatus.NOT_FOUND)
                    return
                existing = read_json(task_path)
                task = task_from_payload({**existing, **self.read_body()}, existing)
                write_json(task_path, task)
                self.send_json({"task": public_task(task)})
                return
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)


def main() -> None:
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8765), CloudDashboardHandler)
    print("Cloud Todo Dashboard: http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
