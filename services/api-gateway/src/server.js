import http from "http";
import app from "./app.js";
import config from "./config/index.js";
import logger from "./config/logger.js";
import { startNotificationWorker } from "./modules/notifications/queue/notification.worker.js";
import { initializeWebsocketGateway } from "./modules/notifications/realtime/socket.gateway.js";

const PORT = config.port;

const server = http.createServer(app);

initializeWebsocketGateway(server);
startNotificationWorker();

server.listen(PORT, () => {
  logger.info({ port: PORT }, "API Gateway is running");
});
