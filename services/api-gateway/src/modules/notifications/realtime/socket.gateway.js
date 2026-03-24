import { Server } from "socket.io";
import { verifyToken } from "../../auth/auth.utils.js";
import logger from "../../../config/logger.js";

let ioInstance;

const userRoom = (userId) => `user:${userId}`;

const getTokenFromSocket = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (authToken) {
    return authToken.replace("Bearer ", "");
  }

  const headerAuth = socket.handshake.headers?.authorization;
  if (headerAuth) {
    return String(headerAuth).replace("Bearer ", "");
  }

  const queryToken = socket.handshake.query?.token;
  if (queryToken) {
    return String(queryToken).replace("Bearer ", "");
  }

  return null;
};

export const initializeWebsocketGateway = (httpServer) => {
  if (ioInstance) {
    return ioInstance;
  }

  ioInstance = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  ioInstance.use((socket, next) => {
    try {
      const token = getTokenFromSocket(socket);

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = verifyToken(token);
      socket.data.userId = decoded.sub;
      return next();
    } catch (_error) {
      return next(new Error("Unauthorized"));
    }
  });

  ioInstance.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(userRoom(userId));

    logger.debug({ userId, socketId: socket.id }, "WebSocket client connected");

    socket.on("disconnect", () => {
      logger.debug(
        {
          userId,
          socketId: socket.id,
        },
        "WebSocket client disconnected",
      );
    });
  });

  return ioInstance;
};

export const emitNotificationToUser = (userId, payload) => {
  if (!ioInstance || !userId) {
    return false;
  }

  ioInstance.to(userRoom(userId)).emit("notification.created", payload);
  return true;
};

export const getIoInstance = () => ioInstance;

export default {
  initializeWebsocketGateway,
  emitNotificationToUser,
  getIoInstance,
};
