const http = require("node:http");
const mode = process.env.INTEGRATION_MODE || "mock";
if (!["mock", "live"].includes(mode))
  throw new Error("INTEGRATION_MODE must be mock or live");
const breakers = new Map();
async function external(name, base, route, headers) {
  const state = breakers.get(name) || { failures: 0, until: 0 };
  if (state.until > Date.now())
    return { status: "unavailable", reason: "circuit_open" };
  try {
    const baseUrl = new URL(base);
    if (baseUrl.protocol !== "https:") throw new Error("HTTPS required");
    const response = await fetch(new URL(route, baseUrl), {
      headers,
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Upstream error");
    const data = await response.json();
    breakers.set(name, { failures: 0, until: 0 });
    return { status: "available", data };
  } catch {
    state.failures++;
    state.until = state.failures >= 3 ? Date.now() + 10000 : 0;
    breakers.set(name, state);
    return { status: "unavailable", reason: "upstream_failure" };
  }
}
http
  .createServer(async (req, res) => {
    const send = (code, value) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const url = new URL(req.url, "http://localhost");
    if (req.method !== "GET") return send(405, { error: "Read-only service" });
    if (["/health", "/ready"].includes(url.pathname))
      return send(200, { status: "ok", mode });
    if (url.pathname !== "/v1/status") return send(404, { error: "Not found" });
    const project = url.searchParams.get("gitlabProjectId"),
      namespace = url.searchParams.get("namespace"),
      deployment = url.searchParams.get("deployment");
    if (
      !project ||
      !namespace ||
      !deployment ||
      [project, namespace, deployment].some((x) => x.length > 200)
    )
      return send(400, {
        error: "Project, namespace and deployment are required",
      });
    if (mode === "mock")
      return send(200, {
        mode,
        gitlab: {
          status: "available",
          project: {
            id: project,
            name: "Demo project",
            webUrl: "https://gitlab.com",
          },
          pipeline: { status: "success" },
        },
        openshift: {
          status: "available",
          deployment,
          namespace,
          desiredReplicas: 1,
          readyReplicas: 1,
        },
      });
    const [gitlab, pipeline, openshift] = await Promise.all([
      external(
        "gitlab",
        process.env.GITLAB_URL,
        `/api/v4/projects/${encodeURIComponent(project)}`,
        { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN || "" },
      ),
      external(
        "gitlab-pipelines",
        process.env.GITLAB_URL,
        `/api/v4/projects/${encodeURIComponent(project)}/pipelines?per_page=1`,
        { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN || "" },
      ),
      external(
        "openshift",
        process.env.OPENSHIFT_URL,
        `/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(deployment)}`,
        { Authorization: `Bearer ${process.env.OPENSHIFT_TOKEN || ""}` },
      ),
    ]);
    send(200, {
      mode,
      gitlab:
        gitlab.status === "available"
          ? {
              status: "available",
              project: {
                id: gitlab.data.id,
                name: gitlab.data.name,
                webUrl: gitlab.data.web_url,
              },
              pipeline:
                pipeline.status === "available"
                  ? pipeline.data[0]
                    ? { status: pipeline.data[0].status }
                    : null
                  : { status: "unavailable" },
            }
          : gitlab,
      openshift:
        openshift.status === "available"
          ? {
              status: "available",
              namespace,
              deployment,
              desiredReplicas: openshift.data.spec?.replicas ?? 1,
              readyReplicas: openshift.data.status?.readyReplicas ?? 0,
            }
          : openshift,
    });
  })
  .listen(process.env.PORT || 8081, () =>
    console.log(JSON.stringify({ service: "integrations", mode })),
  );
