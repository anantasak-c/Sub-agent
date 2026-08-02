import { getNextQueuedRun } from "@/lib/db";
import { requireRunnerAuth } from "@/lib/runner-auth";

export async function GET(request: Request) {
  const authError = requireRunnerAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const next = await getNextQueuedRun();
    return Response.json({ item: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load next run";
    return Response.json({ error: message }, { status: 500 });
  }
}
