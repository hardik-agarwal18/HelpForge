import eventBus from "./eventBus.js";

export const emitTicketEvent = (eventName, payload) => {
  eventBus.emit(eventName, payload);
};
