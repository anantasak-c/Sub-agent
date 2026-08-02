import { createTask, listTasks } from "@/lib/db";
import { parseTaskInput } from "@/lib/validation";

export async function GET() {
  try {
    const tasks = await listTasks();
    return Response.json({ tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tasks";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = parseTaskInput(await request.json());
    const task = await createTask(input);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create task";
    const status = message.includes("DATABASE_URL") ? 500 : 400;
    return Response.json({ error: message }, { status });
  }
}
