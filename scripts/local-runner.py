#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path.cwd()


def load_env_file(name: str) -> None:
    path = ROOT / name
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if key in os.environ:
            continue

        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        os.environ[key] = value


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def api_url(path: str) -> str:
    base = os.environ.get("CLOUD_RUNNER_BASE_URL", "https://sub-agent-cyan.vercel.app")
    return f"{base.rstrip('/')}{path}"


def request_json(method: str, path: str, payload: dict | None = None) -> dict:
    token = os.environ.get("CLOUD_RUNNER_TOKEN")
    if not token:
        raise RuntimeError("CLOUD_RUNNER_TOKEN is not configured locally")

    body = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    request = Request(api_url(path), data=body, headers=headers, method=method)

    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Network error: {error.reason}") from error


def build_prompt(task: dict) -> str:
    agent_intro = {
        "cloud": "You are Cloud, a formal Thai personal assistant. Produce a concise execution outcome.",
        "web_researcher": (
            "You are web_researcher. Research current information, compare sources when useful, "
            "and cite source links when available."
        ),
        "idea_debater": (
            "You are idea_debater. Challenge assumptions directly, list weak points, "
            "counterarguments, risks, and simpler alternatives."
        ),
        "teacher": (
            "You are teacher. Explain clearly in Thai with examples or analogies and avoid "
            "unnecessary jargon."
        ),
        "unassigned": (
            "This task has no assigned agent. Do not execute it. Explain what clarification "
            "or new agent approval is needed."
        ),
    }.get(task["assigned_agent"], "You are Cloud. Produce a concise execution outcome.")

    lines = [
        agent_intro,
        "",
        "Hard boundary:",
        "- Do not send messages, delete data, publish content, deploy, buy, subscribe, create new agents, or modify external systems.",
        "- Only produce a text outcome to save into Cloud Dashboard run history.",
        "- Use Thai unless the task clearly requires English.",
        "- Start with a short summary, then details as needed.",
        "",
        "Task:",
        f"- ID: {task['task_id']}",
        f"- Title: {task['title']}",
        f"- Type: {task['type']}",
        f"- Priority: {task['priority']}",
        f"- Due date: {task.get('due_date') or '-'}",
        f"- Details: {task.get('details') or '-'}",
        f"- Desired outcome: {task.get('desired_outcome') or '-'}",
        f"- Assignment reason: {task['assignment_reason']}",
        f"- Next action: {task['next_action']}",
        "",
        "Return only the final outcome in Markdown.",
    ]
    return "\n".join(lines)


def run_codex(task: dict) -> str:
    if task["assigned_agent"] == "unassigned":
        raise RuntimeError(
            "No assigned agent matches this task. Cloud must clarify the task or propose a new agent first."
        )

    codex_bin = os.environ.get("CODEX_BIN", "codex")
    model = os.environ.get("CLOUD_RUNNER_MODEL", "")

    with tempfile.TemporaryDirectory(prefix="cloud-runner-") as temp_dir:
        output_path = Path(temp_dir) / "outcome.md"
        args = [
            codex_bin,
            "exec",
            "--ephemeral",
            "--color",
            "never",
            "-s",
            "read-only",
            "-a",
            "never",
            "-C",
            str(ROOT),
            "--output-last-message",
            str(output_path),
        ]

        if model:
            args.extend(["-m", model])

        if task["assigned_agent"] == "web_researcher":
            args.append("--search")

        args.append("-")

        completed = subprocess.run(
            args,
            input=build_prompt(task),
            text=True,
            capture_output=True,
            cwd=ROOT,
            check=False,
        )

        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip()
            raise RuntimeError(message or f"codex exec exited with code {completed.returncode}")

        if not output_path.exists():
            raise RuntimeError("Codex did not write a final output file")

        outcome = output_path.read_text(encoding="utf-8").strip()
        if not outcome:
            raise RuntimeError("Codex returned no final output")
        return outcome


def process_once() -> bool:
    response = request_json("GET", "/api/runner/next")
    item = response.get("item")
    if not item:
        print(f"[{now_iso()}] no queued runs", flush=True)
        return False

    task = item["task"]
    run = item["run"]
    task_id = task["task_id"]
    run_id = run["run_id"]

    request_json("POST", f"/api/runner/runs/{task_id}/{run_id}/claim")
    print(f"[{now_iso()}] running {task_id}/{run_id} with {task['assigned_agent']}", flush=True)

    try:
        outcome = run_codex(task)
        request_json(
            "POST",
            f"/api/runner/runs/{task_id}/{run_id}/complete",
            {"status": "completed", "result": outcome, "error": ""},
        )
        print(f"[{now_iso()}] completed {task_id}/{run_id}", flush=True)
    except Exception as error:
        message = str(error)
        request_json(
            "POST",
            f"/api/runner/runs/{task_id}/{run_id}/complete",
            {"status": "failed", "result": "", "error": message},
        )
        print(f"[{now_iso()}] failed {task_id}/{run_id}: {message}", flush=True)

    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Cloud local runner")
    parser.add_argument("--once", action="store_true", help="process one queued run and exit")
    args = parser.parse_args()

    load_env_file(".env.local")
    load_env_file(".env")

    interval_ms = int(os.environ.get("CLOUD_RUNNER_INTERVAL_MS", "10000"))
    print(f"[{now_iso()}] Cloud local runner started", flush=True)

    while True:
        process_once()
        if args.once:
            return 0
        time.sleep(interval_ms / 1000)


if __name__ == "__main__":
    sys.exit(main())
