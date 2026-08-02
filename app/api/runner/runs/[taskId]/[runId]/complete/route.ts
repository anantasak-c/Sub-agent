import { completeRun } from "@/lib/db";
import { requireRunnerAuth } from "@/lib/runner-auth";
import { safeTaskId } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    taskId: string;
    runId: string;
  }>;
};

type CompletePayload = {
  status?: unknown;
  result?: unknown;
  error?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request, context: RouteContext) {
  const authError = requireRunnerAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const { taskId, runId } = await context.params;
    const payload = (await request.json()) as CompletePayload;
    const status = payload.status === "completed" ? "completed" : "failed";
    const result = asString(payload.result);
    const error = asString(payload.error);

    const completed = await completeRun(safeTaskId(taskId), runId, status, result, error);
    if (!completed) {
      return Response.json({ error: "run is not running or was already completed" }, { status: 409 });
    }

    return Response.json(completed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete run";
    return Response.json({ error: message }, { status: 500 });
  }
}
