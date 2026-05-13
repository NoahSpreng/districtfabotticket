const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");

async function registerCommands(guild) {
  const ticketPanelCommand = new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Cree un panel de tickets avec selecteur")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon ou envoyer le panel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("titre")
        .setDescription("Titre du panel")
        .setMaxLength(100)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Texte affiche sur le panel")
        .setMaxLength(1000)
        .setRequired(false)
    );

  const ticketConfigCommand = new SlashCommandBuilder()
    .setName("ticket-config")
    .setDescription("Affiche la configuration actuelle des tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  const ticketCleanCommand = new SlashCommandBuilder()
    .setName("ticket-clean")
    .setDescription("Ferme les tickets ouverts dont le salon a ete supprime")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  const ticketStatsCommand = new SlashCommandBuilder()
    .setName("ticket-stats")
    .setDescription("Affiche les statistiques des tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  await guild.commands.set([
    ticketPanelCommand.toJSON(),
    ticketConfigCommand.toJSON(),
    ticketCleanCommand.toJSON(),
    ticketStatsCommand.toJSON()
  ]);
}

module.exports = {
  registerCommands
};
