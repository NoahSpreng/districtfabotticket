const { MessageFlags } = require("discord.js");

function sanitizeInteractionPayload(payload = {}) {
  const nextPayload = { ...payload };

  // discord.js deprecates the boolean `ephemeral` option in favor of flags.
  // Removing it here avoids warnings even if an old caller still passes it.
  if ("ephemeral" in nextPayload) {
    delete nextPayload.ephemeral;
  }

  return nextPayload;
}

function ephemeralPayload(payload = {}) {
  const safePayload = sanitizeInteractionPayload(payload);
  return {
    ...safePayload,
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
  const safePayload = sanitizeInteractionPayload(payload);

  if (interaction.deferred) {
    return interaction.editReply(safePayload);
  }

  if (interaction.replied) {
    return interaction.editReply(safePayload).catch(() => interaction.followUp(ephemeralPayload(safePayload)));
  }

  return interaction.reply(ephemeralPayload(safePayload));
}

async function respondEphemeral(interaction, payload) {
  const safePayload = sanitizeInteractionPayload(payload);

  if (interaction.deferred) {
    return interaction.editReply(safePayload);
  }

  if (interaction.replied) {
    return interaction.editReply(safePayload).catch(() => interaction.followUp(ephemeralPayload(safePayload)));
  }

  return interaction.reply(ephemeralPayload(safePayload));
}

async function respondPublic(interaction, payload) {
  const safePayload = sanitizeInteractionPayload(payload);

  if (interaction.deferred) {
    return interaction.editReply(safePayload);
  }

  if (interaction.replied) {
    return interaction.followUp(safePayload);
  }

  return interaction.reply(safePayload);
}

module.exports = {
  deferEphemeral,
  ephemeralPayload,
  finishEphemeral,
  replyEphemeral,
  respondEphemeral,
  respondPublic
};
