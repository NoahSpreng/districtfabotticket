const { ChannelType } = require("discord.js");
const crypto = require("node:crypto");
const config = require("../config.json");
const {
  findOpenTicketByUser,
  findOpenTicketsByUser,
  markTicketClosed,
  nextTicketNumber,
  upsertTicket
} = require("./storage");
const {
  categoryPermissionOverwrites,
  validateTicketConfig
} = require("./permissions");
const {
  panelDefaults,
  panelEmbed,
  staffButtons,
  ticketEmbed,
  ticketMemberButtons,
  ticketOpenEmbed,
  ticketPanelRow
} = require("./ui");
const {
  createTranscriptAttachmentFromHtml,
  createTranscriptHtml,
  saveTranscriptHtml
} = require("./transcripts");
const {
  categoryParentId,
  formatTicketNumber,
  roleMentions
} = require("./utils");
const {
  finishEphemeral,
  replyEphemeral,
  respondEphemeral,
  respondPublic
} = require("./responses");

const FALLBACK_ARCHIVE_CATEGORY_ID = "1499885144729976974";

async function sendLog(client, embed) {
  if (!process.env.TICKET_LOG_CHANNEL_ID) return;

  const channel = await client.channels.fetch(process.env.TICKET_LOG_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

async function sendLogMessage(client, payload) {
  if (!process.env.TICKET_LOG_CHANNEL_ID) return;

  const channel = await client.channels.fetch(process.env.TICKET_LOG_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(payload).catch(() => null);
  }
}

async function sendTicketPanel(client, channel, ticketCategoryId, options) {
  const defaults = panelDefaults();
  await channel.send({
    embeds: [panelEmbed(client, options)],
    components: [ticketPanelRow(ticketCategoryId, options.selectPlaceholder ?? defaults.selectPlaceholder)]
  });
}

function answersText(answers) {
  if (!answers?.length) return null;

  return answers.map((answer) => `**${answer.label}**\n${answer.value}`).join("\n\n");
}

function rememberStaffAccess(ticket, userId) {
  if (!userId) return;

  ticket.staffAccessIds = [...new Set([...(ticket.staffAccessIds ?? []), userId])];
}

function rememberCategoryRoles(ticket, categoryKey) {
  const roleIds = config.categories[categoryKey]?.roleIds ?? [];
  ticket.staffRoleAccessIds = [...new Set([...(ticket.staffRoleAccessIds ?? []), ...roleIds])];
}

function isUnknownChannelError(error) {
  return error?.code === 10003 || error?.rawError?.code === 10003;
}

function isUnknownInteractionError(error) {
  return error?.code === 10062 || error?.rawError?.code === 10062;
}

function archiveCategoryId() {
  return config.archiveCategoryId || FALLBACK_ARCHIVE_CATEGORY_ID;
}

async function ensureInteractionDeferred(interaction) {
  if (interaction.deferred || interaction.replied) return true;

  try {
    await interaction.deferReply();
    return true;
  } catch (error) {
    if (isUnknownInteractionError(error)) return false;
    throw error;
  }
}

async function fetchTicketChannel(interaction, ticket) {
  const channel = await interaction.guild.channels.fetch(ticket.channelId).catch((error) => {
    if (isUnknownChannelError(error)) return null;
    throw error;
  });

  return channel?.isTextBased?.() ? channel : null;
}

async function fetchCategory(guild, categoryId, label) {
  const category = await guild.channels.fetch(categoryId).catch(() => null);

  if (!category) {
    throw new Error(`${label} introuvable: ${categoryId}`);
  }

  if (category.type !== ChannelType.GuildCategory) {
    throw new Error(`${label} doit etre une categorie Discord: ${categoryId}`);
  }

  return category;
}

async function finishClosedWithoutChannel(client, interaction, ticket, reason) {
  await respondEphemeral(interaction, {
    content: "Ticket ferme dans la base, mais le salon Discord est introuvable ou a ete supprime. Un log minimal a ete sauvegarde."
  }).catch((error) => {
    if (!isUnknownInteractionError(error)) throw error;
    return null;
  });

  const transcriptHtml = await createTranscriptHtml(null, ticket);
  const savedTranscriptPath = await saveTranscriptHtml(transcriptHtml, ticket).catch(() => null);
  const logTranscript = createTranscriptAttachmentFromHtml(transcriptHtml, ticket);

  await sendLogMessage(client, {
    embeds: [ticketEmbed("Ticket ferme", [
      `Ticket de <@${ticket.userId}> ferme par <@${interaction.user.id}>.`,
      `**Raison :** ${reason}`,
      "Salon introuvable ou supprime, transcript minimal.",
      savedTranscriptPath ? `Log local: ${savedTranscriptPath}` : "Log local: impossible a sauvegarder"
    ].join("\n"), 0xeb5757)],
    files: [logTranscript]
  });
  await notifyTicketUser(client, ticket, `Ton ticket #${formatTicketNumber(ticket)} a ete ferme. Raison: ${reason}`);
}

async function createTicket(client, interaction, ticketCategoryId, categoryKey, answers = []) {
  const existingTickets = await findOpenTicketsByUser(interaction.user.id);
  const maxOpenTickets = config.limits?.maxOpenTicketsPerUser ?? 1;
  const existingTicket = existingTickets[0];
  if (existingTicket) {
    const existingChannel = await interaction.guild.channels.fetch(existingTicket.channelId).catch(() => null);
    if (!existingChannel) {
      await markTicketClosed(existingTicket, "channel_deleted");
    } else {
      await finishEphemeral(interaction, {
        content: `Tu as deja un ticket ouvert : <#${existingTicket.channelId}>`
      });
      return;
    }
  }

  const refreshedExistingTickets = await findOpenTicketsByUser(interaction.user.id);
  if (refreshedExistingTickets.length >= maxOpenTickets) {
    await finishEphemeral(interaction, {
      content: `Tu as deja ${refreshedExistingTickets.length} ticket(s) ouvert(s). Limite: ${maxOpenTickets}.`
    });
    return;
  }

  await validateTicketConfig(interaction.guild, ticketCategoryId, categoryKey);

  const category = config.categories[categoryKey];
  const parentId = categoryParentId(category, ticketCategoryId);
  const number = await nextTicketNumber();
  const ticketNumber = String(number).padStart(4, "0");
  const channel = await interaction.guild.channels.create({
    name: `ticket-${ticketNumber}`,
    type: ChannelType.GuildText,
    parent: parentId,
    topic: `Ticket ${category.label} de ${interaction.user.tag} (${interaction.user.id})`,
    permissionOverwrites: categoryPermissionOverwrites(client, interaction.guild, categoryKey, interaction.user.id)
  });

  const ticket = await upsertTicket({
    id: crypto.randomUUID(),
    userId: interaction.user.id,
    channelId: channel.id,
    number,
    category: categoryKey,
    claimedBy: null,
    status: "open",
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    answers,
    staffAccessIds: [],
    staffRoleAccessIds: [...new Set(category.roleIds ?? [])]
  });

  await channel.setTopic(`creator=${interaction.user.id}; type=${categoryKey}; staff=none; ticket=${ticket.id}`).catch(() => null);

  await channel.send({
    content: `<@${interaction.user.id}> ${roleMentions(category)}`,
    embeds: [ticketOpenEmbed(client, ticket, interaction.user, category)],
    components: [ticketMemberButtons(ticket)],
    allowedMentions: {
      users: [interaction.user.id],
      roles: [...new Set(category.roleIds)]
    }
  });

  const answerBlock = answersText(answers);
  if (answerBlock) {
    await channel.send({
      embeds: [ticketEmbed("Questionnaire", answerBlock, 0x5865f2)]
    });
  }

  await finishEphemeral(interaction, {
    content: `Ton ticket a ete cree : <#${channel.id}>`
  });

  await sendLog(client, ticketEmbed("Ticket ouvert", `Ticket ${category.label} cree par <@${interaction.user.id}> dans <#${channel.id}>.`, 0x36b37e));
}

async function changeTicketCategory(client, interaction, ticket, categoryKey) {
  const category = config.categories[categoryKey];
  if (!category) {
    await finishEphemeral(interaction, { content: "Categorie introuvable." });
    return;
  }

  await validateTicketConfig(interaction.guild, config.ticketCategoryId, categoryKey);
  const channel = await fetchTicketChannel(interaction, ticket);
  if (!channel) {
    await finishEphemeral(interaction, { content: "Salon du ticket introuvable. Lance /ticket-clean pour nettoyer les tickets fantomes." });
    return;
  }

  const previousCategoryKey = ticket.category;
  rememberStaffAccess(ticket, interaction.user.id);
  rememberCategoryRoles(ticket, previousCategoryKey);
  rememberCategoryRoles(ticket, categoryKey);

  try {
    await channel.setTopic(`creator=${ticket.userId}; type=${categoryKey}; staff=${ticket.claimedBy ?? "none"}; ticket=${ticket.id}`).catch(() => null);
    await channel.setParent(categoryParentId(category), { lockPermissions: false });
    await channel.permissionOverwrites.set(
      categoryPermissionOverwrites(
        client,
        interaction.guild,
        categoryKey,
        ticket.userId,
        ticket.status === "closed",
        ticket.staffAccessIds,
        ticket.staffRoleAccessIds
      )
    );
  } catch (error) {
    console.error("Erreur redirection ticket:", {
      ticketId: ticket.id,
      channelId: ticket.channelId,
      from: previousCategoryKey,
      to: categoryKey,
      error
    });
    await finishEphemeral(interaction, {
      content: `Impossible de rediriger vers **${category.label}**: ${error.message}`
    });
    return;
  }

  ticket.category = categoryKey;
  await upsertTicket(ticket);

  await finishEphemeral(interaction, {
    content: `Ticket redirige vers **${category.label}**.`
  });

  await channel.send({
    content: roleMentions(category),
    embeds: [ticketEmbed("Ticket redirige", `Ce ticket est maintenant en **${category.label}**. L'equipe concernee a ete notifiee.`, 0x9b51e0)],
    allowedMentions: {
      roles: [...new Set(category.roleIds)]
    }
  });

  await sendLog(client, ticketEmbed("Ticket redirige", `Ticket #${formatTicketNumber(ticket)} redirige vers **${category.label}** par <@${interaction.user.id}>.`, 0x9b51e0));
  await notifyTicketUser(client, ticket, `Ton ticket #${formatTicketNumber(ticket)} a ete redirige vers ${category.label}.`);
}

async function claimTicket(client, interaction, ticket) {
  ticket.claimedBy = interaction.user.id;
  rememberStaffAccess(ticket, interaction.user.id);
  rememberCategoryRoles(ticket, ticket.category);
  ticket.firstResponseAt = ticket.firstResponseAt ?? new Date().toISOString();
  await upsertTicket(ticket);
  await interaction.channel.setTopic(`creator=${ticket.userId}; type=${ticket.category}; staff=${ticket.claimedBy}; ticket=${ticket.id}`).catch(() => null);

  await interaction.reply({
    embeds: [ticketEmbed("Ticket claim", `<@${interaction.user.id}> prend en charge ce ticket.`, 0x36b37e)]
  });
  await sendLog(client, ticketEmbed("Ticket claim", `Ticket #${formatTicketNumber(ticket)} claim par <@${interaction.user.id}>.`, 0x36b37e));
}

async function closeTicket(client, interaction, ticket, reason = "Aucune raison indiquee.") {
  await ensureInteractionDeferred(interaction);
  const channel = await fetchTicketChannel(interaction, ticket);

  ticket.status = "closed";
  ticket.closedBy = interaction.user.id;
  ticket.closedAt = new Date().toISOString();
  ticket.closeReason = reason;
  await upsertTicket(ticket);

  if (!channel) {
    await finishClosedWithoutChannel(client, interaction, ticket, reason);
    return;
  }

  try {
    await channel.permissionOverwrites.set(
      categoryPermissionOverwrites(client, interaction.guild, ticket.category, ticket.userId, true, ticket.staffAccessIds, ticket.staffRoleAccessIds)
    );
    await channel.setName(`closed-${channel.name.replace(/^ticket-/, "")}`).catch((error) => {
      if (isUnknownChannelError(error)) throw error;
      return null;
    });
  } catch (error) {
    if (!isUnknownChannelError(error)) throw error;
    await finishClosedWithoutChannel(client, interaction, ticket, reason);
    return;
  }

  const transcriptHtml = await createTranscriptHtml(channel, ticket);
  const savedTranscriptPath = await saveTranscriptHtml(transcriptHtml, ticket).catch(() => null);
  const transcript = createTranscriptAttachmentFromHtml(transcriptHtml, ticket);
  const logTranscript = createTranscriptAttachmentFromHtml(transcriptHtml, ticket);

  const closePayload = {
    embeds: [ticketEmbed("Ticket ferme", [`<@${interaction.user.id}> a ferme ce ticket.`, `**Raison :** ${reason}`].join("\n"), 0xeb5757)],
    components: staffButtons(ticket),
    files: [transcript]
  };

  await respondPublic(interaction, closePayload).catch(async (error) => {
    if (!isUnknownInteractionError(error)) throw error;
    await channel.send({
      embeds: closePayload.embeds,
      components: closePayload.components,
      files: [createTranscriptAttachmentFromHtml(transcriptHtml, ticket)]
    });
  });
  await sendLogMessage(client, {
    embeds: [ticketEmbed("Ticket ferme", [
      `Ticket de <@${ticket.userId}> ferme par <@${interaction.user.id}>.`,
      `**Raison :** ${reason}`,
      savedTranscriptPath ? `Log local: ${savedTranscriptPath}` : "Log local: impossible a sauvegarder"
    ].join("\n"), 0xeb5757)],
    files: [logTranscript]
  });
  await notifyTicketUser(client, ticket, `Ton ticket #${formatTicketNumber(ticket)} a ete ferme. Raison: ${reason}`);
}

async function reopenTicket(client, interaction, ticket) {
  ticket.status = "open";
  ticket.reopenedBy = interaction.user.id;
  ticket.reopenedAt = new Date().toISOString();
  await upsertTicket(ticket);

  await interaction.channel.permissionOverwrites.set(
    categoryPermissionOverwrites(client, interaction.guild, ticket.category, ticket.userId, false, ticket.staffAccessIds, ticket.staffRoleAccessIds)
  );
  await interaction.channel.setName(`ticket-${interaction.channel.name.replace(/^closed-/, "")}`).catch(() => null);

  await interaction.reply({
    embeds: [ticketEmbed("Ticket reouvert", `<@${interaction.user.id}> a reouvert ce ticket.`, 0x36b37e)],
    components: staffButtons(ticket)
  });
  await sendLog(client, ticketEmbed("Ticket reouvert", `Ticket #${formatTicketNumber(ticket)} reouvert par <@${interaction.user.id}>.`, 0x36b37e));
}

async function archiveTicket(client, interaction, ticket) {
  const channel = await fetchTicketChannel(interaction, ticket);
  if (!channel) {
    ticket.status = "archived";
    ticket.archivedBy = interaction.user.id;
    ticket.archivedAt = new Date().toISOString();
    await upsertTicket(ticket);
    await finishEphemeral(interaction, { content: "Ticket archive dans la base, mais le salon Discord est introuvable." });
    return;
  }

  const targetArchiveCategoryId = archiveCategoryId();
  await fetchCategory(interaction.guild, targetArchiveCategoryId, "Categorie d'archive");

  ticket.status = "archived";
  ticket.archivedBy = interaction.user.id;
  ticket.archivedAt = new Date().toISOString();
  await upsertTicket(ticket);

  await channel.permissionOverwrites.set(
    categoryPermissionOverwrites(client, interaction.guild, ticket.category, ticket.userId, true, ticket.staffAccessIds, ticket.staffRoleAccessIds)
  );
  await channel.setParent(targetArchiveCategoryId, { lockPermissions: false });
  await channel.setName(`archive-${channel.name.replace(/^closed-/, "").replace(/^ticket-/, "")}`).catch(() => null);

  await finishEphemeral(interaction, {
    embeds: [ticketEmbed("Ticket archive", `<@${interaction.user.id}> a archive ce ticket.`, 0x95a5a6)]
  });
  await sendLog(client, ticketEmbed("Ticket archive", `Ticket #${formatTicketNumber(ticket)} archive par <@${interaction.user.id}>.`, 0x95a5a6));
}

async function renameTicket(interaction, ticket, name) {
  const channel = await fetchTicketChannel(interaction, ticket);
  if (!channel) {
    await finishEphemeral(interaction, { content: "Salon du ticket introuvable. Impossible de le renommer." });
    return;
  }

  const cleanName = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const nextName = cleanName || `ticket-${formatTicketNumber(ticket)}`;

  const renamedChannel = await channel.setName(nextName);
  await finishEphemeral(interaction, { content: `Ticket renomme en **${renamedChannel.name}**.` });
}

async function quickReply(interaction, kind) {
  const messages = {
    hello: "Bonjour, un membre du staff prend en charge ta demande.",
    wait: "Merci de patienter, nous revenons vers toi des que possible.",
    infos: "Peux-tu envoyer plus d'informations pour que nous puissions traiter ta demande ?",
    proof: "Peux-tu envoyer les preuves, captures ou informations utiles au dossier ?",
    done: "Le dossier semble traite. Tu peux ajouter un dernier message si besoin."
  };

  await interaction.channel.send(messages[kind]);
  await replyEphemeral(interaction, { content: "Message envoye." });
}

async function addInternalNote(interaction, ticket, note) {
  ticket.notes = ticket.notes ?? [];
  ticket.notes.push({
    authorId: interaction.user.id,
    content: note,
    createdAt: new Date().toISOString()
  });
  await upsertTicket(ticket);
  await replyEphemeral(interaction, { content: "Note interne ajoutee." });
}

function notesText(ticket) {
  const notes = ticket.notes ?? [];
  if (!notes.length) return "Aucune note interne pour ce ticket.";

  return notes
    .slice(-10)
    .map((note, index) => {
      const createdAt = note.createdAt
        ? new Date(note.createdAt).toLocaleString("fr-FR")
        : "date inconnue";
      const content = String(note.content ?? "").slice(0, 800);
      return `**${index + 1}. <@${note.authorId}> - ${createdAt}**\n${content}`;
    })
    .join("\n\n")
    .slice(0, 4000);
}

async function viewInternalNotes(interaction, ticket) {
  await replyEphemeral(interaction, {
    embeds: [ticketEmbed(`Notes internes - Ticket #${formatTicketNumber(ticket)}`, notesText(ticket), 0x2f3136)]
  });
}

async function notifyTicketUser(client, ticket, message) {
  const user = await client.users.fetch(ticket.userId).catch(() => null);
  await user?.send(message).catch(() => null);
}

async function recordActivity(ticket, message) {
  ticket.lastActivityAt = new Date().toISOString();
  if (!message.author.bot && !ticket.claimedBy && message.author.id !== ticket.userId) {
    ticket.claimedBy = message.author.id;
    rememberStaffAccess(ticket, message.author.id);
    rememberCategoryRoles(ticket, ticket.category);
    ticket.firstResponseAt = ticket.firstResponseAt ?? new Date().toISOString();
    await message.channel.setTopic(`creator=${ticket.userId}; type=${ticket.category}; staff=${ticket.claimedBy}; ticket=${ticket.id}`).catch(() => null);
  }
  await upsertTicket(ticket);
}

module.exports = {
  addInternalNote,
  archiveTicket,
  changeTicketCategory,
  claimTicket,
  closeTicket,
  createTicket,
  quickReply,
  recordActivity,
  renameTicket,
  reopenTicket,
  sendTicketPanel,
  viewInternalNotes
};
