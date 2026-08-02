import { createRun, listRuns } from "@/lib/db";
import { safeTaskId } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const runs = await listRuns(safeTaskId(taskId));
    return Response.json({ runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load runs";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const result = await createRun(safeTaskId(taskId));
    if (!result) {
      return Response.json({ error: "task not found" }, { status: 404 });
    }
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create run";
    return Response.json({ error: message }, { status: 500 });
  }
}
