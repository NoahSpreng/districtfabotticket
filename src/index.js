require("dotenv").config();

const {
  ActivityType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits
} = require("discord.js");
const config = require("../config.json");
const { registerCommands } = require("./commands");
const {
  findOpenTicketByChannel,
  findTicketByChannel,
  listTickets,
  markTicketClosed
} = require("./storage");
const {
  requireTicketStaff,
  validateTicketConfig
} = require("./permissions");
const {
  closeReasonModal,
  noteModal,
  quickReplySelectRow,
  redirectSelectRow,
  simpleTextModal,
  staffButtons,
  staffPanelEmbed
} = require("./ui");
const {
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
  viewInternalNotes,
} = require("./tickets");
const {
  deferEphemeral,
  replyEphemeral,
  respondEphemeral
} = require("./responses");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, async (readyClient) => {
  readyClient.user.setPresence({
    activities: [{ name: config.status, type: ActivityType.Playing }],
    status: "online"
  });

  const guild = await readyClient.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (guild) {
    await registerCommands(guild);
    console.log(`Commande /ticket-panel enregistree sur ${guild.name} (${guild.id})`);
  } else {
    console.error(`Serveur introuvable avec GUILD_ID=${process.env.GUILD_ID}. Verifie .env et l'invitation du bot.`);
  }

  console.log(`Connecte en tant que ${readyClient.user.tag}`);
});

async function handleTicketPanelCommand(interaction) {
  const channel = interaction.options.getChannel("salon", true);
  const panelOptions = {
    title: interaction.options.getString("titre"),
    description: interaction.options.getString("description")
  };

  await validateTicketConfig(interaction.guild, config.ticketCategoryId, config.defaultCategory);
  await sendTicketPanel(client, channel, config.ticketCategoryId, panelOptions);
  await replyEphemeral(interaction, { content: `Panel cree dans <#${channel.id}>.` });
}

async function handleTicketConfigCommand(interaction) {
  const categories = Object.entries(config.categories)
    .map(([key, category]) => `${category.emoji ?? "🎫"} **${key}** -> ${category.ticketCategoryId} (${category.roleIds.length} roles)${category.staffOnly ? " [staff]" : ""}`)
    .join("\n");

  await replyEphemeral(interaction, {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Configuration tickets")
        .setDescription([
          `**Limite par membre :** ${config.limits?.maxOpenTicketsPerUser ?? 1}`,
          `**Auto-close :** ${config.autoCloseHours ?? "desactive"}h`,
          "",
          categories
        ].join("\n"))
    ]
  });
}

async function handleTicketCleanCommand(interaction) {
  await deferEphemeral(interaction);
  const tickets = await listTickets();
  let closed = 0;

  for (const ticket of tickets.filter((item) => item.status === "open")) {
    const channel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      await markTicketClosed(ticket, "channel_deleted_clean");
      closed += 1;
    }
  }

  await interaction.editReply(`${closed} ticket(s) fantome(s) ferme(s).`);
}

async function handleTicketStatsCommand(interaction) {
  const tickets = await listTickets();
  const opened = tickets.filter((ticket) => ticket.status === "open").length;
  const closed = tickets.filter((ticket) => ticket.status === "closed").length;
  const archived = tickets.filter((ticket) => ticket.status === "archived").length;
  const responseDurations = tickets
    .filter((ticket) => ticket.createdAt && ticket.firstResponseAt)
    .map((ticket) => new Date(ticket.firstResponseAt) - new Date(ticket.createdAt));
  const averageResponse = responseDurations.length
    ? Math.round(responseDurations.reduce((sum, value) => sum + value, 0) / responseDurations.length / 60000)
    : null;

  await replyEphemeral(interaction, {
    embeds: [
      new EmbedBuilder()
        .setColor(0x36b37e)
        .setTitle("Statistiques tickets")
        .setDescription([
          `**Ouverts :** ${opened}`,
          `**Fermes :** ${closed}`,
          `**Archives :** ${archived}`,
          `**Total :** ${tickets.length}`,
          `**Temps moyen premiere reponse :** ${averageResponse === null ? "-" : `${averageResponse} min`}`
        ].join("\n"))
    ]
  });
}

async function requireTicketCloser(interaction, ticket) {
  if (interaction.user.id === ticket.userId) return true;
  return requireTicketStaff(interaction, ticket);
}

async function handleTicketButton(interaction, ticket) {
  if (interaction.customId === "ticket_claim") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await claimTicket(client, interaction, ticket);
    return;
  }

  if (interaction.customId === "ticket_redirect") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await replyEphemeral(interaction, {
      content: "Choisis la nouvelle categorie du ticket.",
      components: [redirectSelectRow()]
    });
    return;
  }

  if (interaction.customId === "ticket_staff_panel") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await replyEphemeral(interaction, {
      embeds: [staffPanelEmbed(ticket)],
      components: staffButtons(ticket)
    });
    return;
  }

  if (interaction.customId === "ticket_close") {
    if (!(await requireTicketCloser(interaction, ticket))) return;
    await interaction.showModal(closeReasonModal());
    return;
  }

  if (interaction.customId === "ticket_reopen") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await reopenTicket(client, interaction, ticket);
    return;
  }

  if (interaction.customId === "ticket_archive") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await deferEphemeral(interaction);
    await archiveTicket(client, interaction, ticket);
    return;
  }

  if (interaction.customId === "ticket_rename") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await interaction.showModal(simpleTextModal("ticket_rename_modal", "Renommer le ticket", "Nouveau nom du salon"));
    return;
  }

  if (interaction.customId === "ticket_note") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await interaction.showModal(noteModal());
    return;
  }

  if (interaction.customId === "ticket_notes_view") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await viewInternalNotes(interaction, ticket);
    return;
  }

  if (interaction.customId === "ticket_quick_menu") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await replyEphemeral(interaction, {
      content: "Choisis une reponse rapide.",
      components: [quickReplySelectRow()]
    });
    return;
  }

  await replyEphemeral(interaction, { content: "Action inconnue ou retiree du panel." });
}

async function handleTicketModal(interaction) {
  const ticket = await findTicketByChannel(interaction.channelId);

  if (!ticket) {
    await replyEphemeral(interaction, { content: "Ce salon n'est pas un ticket connu." });
    return;
  }

  if (interaction.customId === "ticket_close_reason") {
    if (!(await requireTicketCloser(interaction, ticket))) return;
    await closeTicket(client, interaction, ticket, interaction.fields.getTextInputValue("reason"));
    return;
  }

  if (interaction.customId === "ticket_rename_modal") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await renameTicket(interaction, ticket, interaction.fields.getTextInputValue("value"));
    return;
  }

  if (interaction.customId === "ticket_note_modal") {
    if (!(await requireTicketStaff(interaction, ticket))) return;
    await addInternalNote(interaction, ticket, interaction.fields.getTextInputValue("note"));
    return;
  }

  await replyEphemeral(interaction, { content: "Action inconnue ou retiree du panel." });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "ticket-panel") {
      await handleTicketPanelCommand(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "ticket-config") {
      await handleTicketConfigCommand(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "ticket-clean") {
      await handleTicketCleanCommand(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "ticket-stats") {
      await handleTicketStatsCommand(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ticket_open:")) {
      const ticketCategoryId = interaction.customId.replace("ticket_open:", "");
      await deferEphemeral(interaction);
      await createTicket(client, interaction, ticketCategoryId, interaction.values[0]);
      return;
    }

    if (interaction.isButton()) {
      const ticket = await findTicketByChannel(interaction.channelId);
      if (!ticket) {
        await replyEphemeral(interaction, { content: "Ce salon n'est pas un ticket connu." });
        return;
      }

      await handleTicketButton(interaction, ticket);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_redirect_select") {
      const ticket = await findTicketByChannel(interaction.channelId);
      if (!ticket) {
        await replyEphemeral(interaction, { content: "Ce salon n'est pas un ticket connu." });
        return;
      }

      if (!(await requireTicketStaff(interaction, ticket))) return;
      await deferEphemeral(interaction);
      await changeTicketCategory(client, interaction, ticket, interaction.values[0].replace("redirect:", ""));
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_quick_select") {
      const ticket = await findTicketByChannel(interaction.channelId);
      if (!ticket) {
        await replyEphemeral(interaction, { content: "Ce salon n'est pas un ticket connu." });
        return;
      }
      if (!(await requireTicketStaff(interaction, ticket))) return;
      await quickReply(interaction, interaction.values[0]);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleTicketModal(interaction);
    }
  } catch (error) {
    console.error("Erreur interaction ticket:", error);
    await respondEphemeral(interaction, {
      content: `Erreur: ${error.message}`
    }).catch(() => null);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const ticket = await findOpenTicketByChannel(message.channel.id);
  if (ticket) {
    await recordActivity(ticket, message);
  }
});

setInterval(async () => {
  const autoCloseHours = Number(config.autoCloseHours);
  if (!autoCloseHours) return;

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  const now = Date.now();
  for (const ticket of (await listTickets()).filter((item) => item.status === "open")) {
    const lastActivityAt = new Date(ticket.lastActivityAt ?? ticket.createdAt).getTime();
    if (now - lastActivityAt < autoCloseHours * 60 * 60 * 1000) continue;

    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      await markTicketClosed(ticket, "channel_deleted_autoclose");
      continue;
    }

    ticket.status = "closed";
    ticket.closedAt = new Date().toISOString();
    ticket.closeReason = "Auto-close inactivite";
    await markTicketClosed(ticket, "auto_close");
    await channel.send("Ticket ferme automatiquement pour inactivite.").catch(() => null);
  }
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
