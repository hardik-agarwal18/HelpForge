import client from "prom-client";

const register = new client.Registry();
register.setDefaultLabels({
  service: "api-gateway",
});

client.collectDefaultMetrics({
  register,
  prefix: "helpforge_api_gateway_",
});

const httpRequestsTotal = new client.Counter({
  name: "helpforge_api_gateway_http_requests_total",
  help: "Total number of HTTP requests handled by the API gateway",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "helpforge_api_gateway_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const inFlightRequests = new client.Gauge({
  name: "helpforge_api_gateway_http_requests_in_flight",
  help: "Current in-flight HTTP requests",
  registers: [register],
});

const toRouteString = (routePath) => {
  if (typeof routePath === "string") return routePath;
  if (routePath instanceof RegExp) return routePath.toString();
  return "unknown";
};

const getRouteLabel = (req) => {
  if (req.route?.path) {
    const routePath = toRouteString(req.route.path);
    return `${req.baseUrl || ""}${routePath}` || "/";
  }

  // Keep cardinality low for unmatched requests.
  return "unmatched";
};

export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  let recorded = false;

  inFlightRequests.inc();

  const record = () => {
    if (recorded) return;
    recorded = true;

    inFlightRequests.dec();

    if (req.path === "/metrics") return;

    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: getRouteLabel(req),
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, duration);
  };

  res.on("finish", record);
  res.on("close", record);
  next();
};

export const metricsHandler = async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
};

export { register as prometheusRegistry };
