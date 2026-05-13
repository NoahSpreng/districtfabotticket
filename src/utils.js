const config = require("../config.json");

function isDiscordId(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

function parseColor(value, fallback = 0x2f80ed) {
  if (!value) return fallback;

  const cleanValue = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(cleanValue)) {
    throw new Error("La couleur doit etre au format HEX, exemple: #2F80ED.");
  }

  return Number.parseInt(cleanValue, 16);
}

function isHttpUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatTicketNumber(ticket) {
  return String(ticket.number ?? 1).padStart(4, "0");
}

function roleMentions(category) {
  return [...new Set(category.roleIds)].map((roleId) => `<@&${roleId}>`).join(" ");
}

function categoryParentId(category, fallbackCategoryId) {
  return category.ticketCategoryId ?? fallbackCategoryId ?? config.ticketCategoryId;
}

module.exports = {
  categoryParentId,
  formatTicketNumber,
  isDiscordId,
  isHttpUrl,
  parseColor,
  roleMentions
};
