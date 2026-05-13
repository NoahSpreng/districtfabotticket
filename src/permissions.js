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

function categoryPermissionOverwrites(client, guild, categoryKey, userId, closed = false) {
  const category = config.categories[categoryKey] ?? config.categories[config.defaultCategory];
  const allowedRoles = new Set(category.roleIds);
  const userPermissions = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ReadMessageHistory
  ];

  if (!closed) {
    userPermissions.push(
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
  const category = config.categories[ticket.category];
  if (!category || !member?.roles?.cache) return false;

  return category.roleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function requireTicketStaff(interaction, ticket) {
  if (isTicketStaff(interaction.member, ticket)) return true;

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
