import { createTicketService } from "./ticket.service.js";

export const createTicketController = async (req, res, next) => {
  try {
    const ticket = await createTicketService(req.body, req.user.id);

    return res.status(201).json({
      success: true,
      data: { ticket },
    });
  } catch (error) {
    next(error);
  }
};
