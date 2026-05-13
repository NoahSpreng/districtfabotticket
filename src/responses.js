const { MessageFlags } = require("discord.js");

function ephemeralPayload(payload = {}) {
  return {
    ...payload,
    flags: MessageFlags.Ephemeral
  };
}

async function replyEphemeral(interaction, payload) {
  return interaction.reply(ephemeralPayload(payload));
}

async function deferEphemeral(interaction) {
  return interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

async function finishEphemeral(interaction, payload) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }

  if (interaction.replied) {
    return interaction.followUp(ephemeralPayload(payload));
  }

  return interaction.reply(ephemeralPayload(payload));
}

async function respondEphemeral(interaction, payload) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }

  if (interaction.replied) {
    return interaction.followUp(ephemeralPayload(payload));
  }

  return interaction.reply(ephemeralPayload(payload));
}

async function respondPublic(interaction, payload) {
  if (interaction.deferred) {
    return interaction.editReply(payload);
  }

  if (interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

module.exports = {
  deferEphemeral,
  ephemeralPayload,
  finishEphemeral,
  replyEphemeral,
  respondEphemeral,
  respondPublic
};
