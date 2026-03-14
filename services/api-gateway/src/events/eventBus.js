import EventEmitter2 from "eventemitter2";
import logger from "../config/logger.js";

export const eventBus = new EventEmitter2({
  wildcard: true,
  delimiter: ".",
  maxListeners: 50,
});

export const registerAsyncHandler = (eventName, handler) => {
  eventBus.on(eventName, (payload) => {
    setImmediate(() => {
      Promise.resolve(handler(payload)).catch((error) => {
        logger.error(
          {
            err: error,
            eventName,
            payload,
          },
          "Event handler failed",
        );
      });
    });
  });
};

export default eventBus;
