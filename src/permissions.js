const {
  ChannelType,
  PermissionsBitField
} = require("discord.js");
const config = require("../config.json");
const {
  categoryParentId,
  isDiscordId
} = require("./utils");
const { replyEphemeral } = require("./responses");

function roleIds(member) {
  return member?.roles?.cache ? [...member.roles.cache.keys()] : [];
}

function categoryPermissionOverwrites(client, guild, categoryKey, userId, closed = false, staffUserIds = [], staffRoleIds = []) {
  const category = config.categories[categoryKey] ?? config.categories[config.defaultCategory];
  const allowedRoles = new Set([...(category.roleIds ?? []), ...staffRoleIds]);
  const userPermissions = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ReadMessageHistory
  ];
  const staffPermissions = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.ManageMessages
  ];

  if (!closed) {
    userPermissions.push(
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.EmbedLinks
    );
    staffPermissions.push(
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.EmbedLinks
    );
  }

  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels
      ]
    },
    {
      id: userId,
      allow: userPermissions,
      deny: closed ? [PermissionsBitField.Flags.SendMessages] : []
    },
    ...Array.from(allowedRoles).map((roleId) => ({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ]
    })),
    ...Array.from(new Set(staffUserIds.filter((id) => id && id !== userId))).map((staffUserId) => ({
      id: staffUserId,
      allow: staffPermissions
    }))
  ];
}

async function validateTicketConfig(guild, ticketCategoryId, categoryKey) {
  const category = config.categories[categoryKey];
  if (!category) {
    throw new Error(`Le type de ticket "${categoryKey}" est introuvable dans config.json.`);
  }

  const targetCategoryId = categoryParentId(category, ticketCategoryId);
  if (!isDiscordId(ticketCategoryId)) {
    throw new Error("La categorie tickets par defaut doit etre un ID Discord numerique.");
  }

  if (!isDiscordId(targetCategoryId)) {
    throw new Error(`categories.${categoryKey}.ticketCategoryId doit etre un ID Discord numerique.`);
  }

  const ticketCategory = await guild.channels.fetch(targetCategoryId).catch(() => null);
  if (!ticketCategory) {
    throw new Error(`La categorie tickets "${targetCategoryId}" est introuvable sur ${guild.name}.`);
  }

  if (ticketCategory.type !== ChannelType.GuildCategory) {
    throw new Error(`La destination "${targetCategoryId}" doit etre une categorie Discord.`);
  }

  const invalidRoleId = category.roleIds.find((roleId) => !isDiscordId(roleId));
  if (invalidRoleId) {
    throw new Error(`Role invalide dans categories.${categoryKey}.roleIds: "${invalidRoleId}".`);
  }

  const missingRoleId = category.roleIds.find((roleId) => !guild.roles.cache.has(roleId));
  if (missingRoleId) {
    throw new Error(`Le role "${missingRoleId}" est introuvable sur ${guild.name}.`);
  }
}

function isTicketStaff(member, ticket) {
  if (!member?.roles?.cache) {
    console.log("[ticket:staff-check]", {
      result: "no_member_roles",
      userId: member?.id,
      ticketId: ticket.id,
      ticketCategory: ticket.category
    });
    return false;
  }

  if (ticket.staffAccessIds?.includes(member.id)) {
    console.log("[ticket:staff-check]", {
      result: "allowed_by_user_access",
      userId: member.id,
      ticketId: ticket.id,
      ticketCategory: ticket.category,
      staffAccessIds: ticket.staffAccessIds ?? []
    });
    return true;
  }

  const matchedRoles = [];
  for (const [categoryKey, category] of Object.entries(config.categories)) {
    for (const roleId of category.roleIds ?? []) {
      if (member.roles.cache.has(roleId)) {
        matchedRoles.push({ categoryKey, roleId });
      }
    }
  }

  const allowed = matchedRoles.length > 0;
  console.log("[ticket:staff-check]", {
    result: allowed ? "allowed_by_role" : "denied",
    userId: member.id,
    ticketId: ticket.id,
    ticketCategory: ticket.category,
    memberRoleIds: roleIds(member),
    matchedRoles,
    staffAccessIds: ticket.staffAccessIds ?? [],
    staffRoleAccessIds: ticket.staffRoleAccessIds ?? []
  });

  return allowed;
}

async function requireTicketStaff(interaction, ticket) {
  if (isTicketStaff(interaction.member, ticket)) return true;

  console.log("[ticket:staff-denied]", {
    userId: interaction.user.id,
    channelId: interaction.channelId,
    ticketId: ticket.id,
    ticketCategory: ticket.category,
    customId: interaction.customId
  });

  await replyEphemeral(interaction, {
    content: "Cette action est reservee au staff de ce ticket."
  });
  return false;
}

module.exports = {
  categoryPermissionOverwrites,
  requireTicketStaff,
  validateTicketConfig
};
