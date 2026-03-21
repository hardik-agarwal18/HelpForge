import prisma from "../../../config/database.config.js";

export const getUserMembershipInOrganization = async ({ userId, orgId }) => {
  return await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
    include: {
      organization: true,
    },
  });
};
