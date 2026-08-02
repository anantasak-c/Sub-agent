import { claimRun } from "@/lib/db";
import { requireRunnerAuth } from "@/lib/runner-auth";
import { safeTaskId } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    taskId: string;
    runId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authError = requireRunnerAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const { taskId, runId } = await context.params;
    const result = await claimRun(safeTaskId(taskId), runId);
    if (!result) {
      return Response.json({ error: "run is not queued or was already claimed" }, { status: 409 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to claim run";
    return Response.json({ error: message }, { status: 500 });
  }
}
