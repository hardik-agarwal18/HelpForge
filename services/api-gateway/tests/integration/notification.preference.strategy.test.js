import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import {
  applyRecipientPreferences,
  filterRecipientsByChannelPreference,
} from "../../src/modules/notifications/strategies/preference.strategy.js";
import { sendWebsocketChannel } from "../../src/modules/notifications/channels/websocket.channel.js";
import {
  cleanDatabase,
  createTestUser,
  disconnectDatabase,
  getTestPrisma,
} from "../helpers/dbHelper.js";

const prisma = getTestPrisma();

describe("Notification preference integration", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it("filters websocket recipients when websocket is disabled", async () => {
    const user = await createTestUser({
      email: `ws-off-${Date.now()}@example.com`,
    });

    await prisma.notificationPreference.create({
      data: {
        userId: user.id,
        websocketEnabled: false,
      },
    });

    const recipients = await filterRecipientsByChannelPreference({
      recipientIds: [user.id],
      channel: "websocket",
    });

    expect(recipients).toEqual([]);

    const channelResult = await sendWebsocketChannel({
      recipientIds: [user.id],
      type: "TICKET_COMMENT_ADDED",
      ticketId: "ticket-1",
      organizationId: "org-1",
      actorId: "actor-1",
    });

    expect(channelResult).toEqual({
      channel: "websocket",
      delivered: false,
    });
  });

  it("removes recipients when notification type is disabled", async () => {
    const actor = await createTestUser({
      email: `actor-${Date.now()}@example.com`,
    });
    const recipient = await createTestUser({
      email: `recipient-${Date.now()}@example.com`,
    });

    await prisma.notificationPreference.create({
      data: {
        userId: recipient.id,
        disabledTypes: ["TICKET_COMMENT_ADDED"],
      },
    });

    const filtered = await applyRecipientPreferences({
      recipientIds: [recipient.id],
      actorId: actor.id,
      type: "TICKET_COMMENT_ADDED",
    });

    expect(filtered).toEqual([]);
  });
});
