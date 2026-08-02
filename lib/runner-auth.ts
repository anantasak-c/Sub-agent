export function requireRunnerAuth(request: Request): Response | null {
  const token = process.env.CLOUD_RUNNER_TOKEN;
  if (!token) {
    return Response.json(
      { error: "CLOUD_RUNNER_TOKEN is not configured on the dashboard server" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${token}`) {
    return Response.json({ error: "Unauthorized runner request" }, { status: 401 });
  }

  return null;
}
