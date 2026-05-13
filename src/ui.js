const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const config = require("../config.json");
const {
  formatTicketNumber,
  isHttpUrl,
  parseColor
} = require("./utils");

function ticketEmbed(title, description, color = 0x2f80ed) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "DISTRICT FA - Tickets" })
    .setTimestamp();
}

function panelDefaults() {
  return {
    title: config.panel?.title ?? "Ouvrir un ticket",
    description: config.panel?.description ?? "Selectionne le type de demande dans le menu ci-dessous. Un salon prive sera cree automatiquement avec l'equipe concernee.",
    color: config.panel?.color ?? "#5865F2",
    image: config.panel?.image ?? null,
    thumbnail: config.panel?.thumbnail ?? null,
    footer: config.panel?.footer ?? "DISTRICT FA - Support",
    author: config.panel?.author ?? null,
    selectPlaceholder: config.panel?.selectPlaceholder ?? "Choisir une categorie..."
  };
}

function panelEmbed(client, options = {}) {
  const defaults = panelDefaults();
  const embed = new EmbedBuilder()
    .setColor(parseColor(options.color ?? defaults.color))
    .setTitle(options.title ?? defaults.title)
    .setDescription(options.description ?? defaults.description)
    .setFooter({ text: options.footer ?? defaults.footer })
    .setTimestamp();

  const author = options.author ?? defaults.author;
  if (author) {
    embed.setAuthor({
      name: author,
      iconURL: client.user?.displayAvatarURL()
    });
  }

  const image = options.image ?? defaults.image;
  const thumbnail = options.thumbnail ?? defaults.thumbnail;

  if (image) {
    if (!isHttpUrl(image)) throw new Error("L'image doit etre une URL http ou https.");
    embed.setImage(image);
  }

  if (thumbnail) {
    if (!isHttpUrl(thumbnail)) throw new Error("La miniature doit etre une URL http ou https.");
    embed.setThumbnail(thumbnail);
  }

  return embed;
}

function categoryOptions(prefix = "") {
  return Object.entries(config.categories)
    .filter(([, category]) => prefix || !category.staffOnly)
    .map(([value, category]) => ({
      label: category.label,
      value: `${prefix}${value}`,
      description: category.description
    }));
}

function ticketPanelRow(ticketCategoryId, placeholder = panelDefaults().selectPlaceholder) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_open:${ticketCategoryId}`)
      .setPlaceholder(placeholder)
      .addOptions(categoryOptions())
  );
}

function statusButton(ticket) {
  if (ticket.status === "open") {
    return new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Fermer")
      .setStyle(ButtonStyle.Danger);
  }

  return new ButtonBuilder()
    .setCustomId("ticket_reopen")
    .setLabel("Reouvrir")
    .setStyle(ButtonStyle.Success);
}

function staffButtons(ticket) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Prendre")
        .setStyle(ButtonStyle.Success),
      statusButton(ticket),
      new ButtonBuilder()
        .setCustomId("ticket_archive")
        .setLabel("Archiver")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ticket.status === "archived")
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_redirect")
        .setLabel("Rediriger")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ticket_rename")
        .setLabel("Renommer")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_quick_menu")
        .setLabel("Reponses rapides")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ticket_note")
        .setLabel("Ajouter note")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_notes_view")
        .setLabel("Voir notes")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function ticketMemberButtons(ticket) {
  return new ActionRowBuilder().addComponents(
    statusButton(ticket).setLabel(ticket.status === "open" ? "Fermer le ticket" : "Reouvrir le ticket"),
    new ButtonBuilder()
      .setCustomId("ticket_staff_panel")
      .setLabel("Panel staff")
      .setStyle(ButtonStyle.Secondary)
  );
}

function ticketOpenEmbed(client, ticket, user, category) {
  const assignedStaff = ticket.claimedBy ? `<@${ticket.claimedBy}>` : "-";

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: "TicketBot",
      iconURL: client.user?.displayAvatarURL()
    })
    .setTitle(`Ticket #${formatTicketNumber(ticket)} - ${category.label}`)
    .setDescription(
      category.welcomeMessage ??
        [
          `Bienvenue <@${user.id}>.`,
          "Explique ta demande clairement ci-dessous, l'equipe concernee vient d'etre notifiee."
        ].join("\n")
    )
    .addFields(
      {
        name: "Categorie",
        value: category.label,
        inline: true
      },
      {
        name: "Ouvert par",
        value: `${user.username}#${user.discriminator ?? "0000"}`,
        inline: true
      },
      {
        name: "Staff assigne",
        value: assignedStaff,
        inline: true
      }
    )
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: `Ticket ID: ${ticket.id}` })
    .setTimestamp();
}

function redirectSelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_redirect_select")
      .setPlaceholder("Nouvelle categorie du ticket")
      .addOptions(categoryOptions("redirect:"))
  );
}

function quickReplySelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_quick_select")
      .setPlaceholder("Choisir une reponse rapide")
      .addOptions([
        {
          label: "Bonjour",
          value: "hello",
          description: "Message de prise en charge"
        },
        {
          label: "Patiente",
          value: "wait",
          description: "Demander au membre de patienter"
        },
        {
          label: "Besoin d'infos",
          value: "infos",
          description: "Demander des informations supplementaires"
        },
        {
          label: "Preuves",
          value: "proof",
          description: "Demander des preuves ou captures"
        },
        {
          label: "Termine",
          value: "done",
          description: "Prevenir que le dossier est traite"
        }
      ])
  );
}

function staffPanelEmbed(ticket) {
  return ticketEmbed(
    `Panel staff - Ticket #${formatTicketNumber(ticket)}`,
    [
      `**Membre :** <@${ticket.userId}>`,
      `**Categorie :** ${config.categories[ticket.category]?.label ?? ticket.category}`,
      `**Statut :** ${ticket.status}`,
      `**Staff assigne :** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "-"}`,
      `**Notes internes :** ${ticket.notes?.length ?? 0}`
    ].join("\n"),
    0x2f3136
  );
}

function closeReasonModal() {
  return new ModalBuilder()
    .setCustomId("ticket_close_reason")
    .setTitle("Fermer le ticket")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Raison de fermeture")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
}

function simpleTextModal(customId, title, label, required = true) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(required)
          .setMaxLength(100)
      )
    );
}

function noteModal() {
  return new ModalBuilder()
    .setCustomId("ticket_note_modal")
    .setTitle("Note interne")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("note")
          .setLabel("Note visible uniquement par le staff")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
}

module.exports = {
  closeReasonModal,
  noteModal,
  panelDefaults,
  panelEmbed,
  quickReplySelectRow,
  redirectSelectRow,
  simpleTextModal,
  staffButtons,
  staffPanelEmbed,
  ticketEmbed,
  ticketMemberButtons,
  ticketOpenEmbed,
  ticketPanelRow
};
