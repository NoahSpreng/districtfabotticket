const { AttachmentBuilder } = require("discord.js");
const fs = require("node:fs/promises");
const path = require("node:path");
const { formatTicketNumber } = require("./utils");

const LOGS_DIR = path.join(__dirname, "..", "data", "logs");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function fetchAllMessages(channel) {
  if (!channel?.messages?.fetch) return [];

  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;

    messages.push(...batch.values());
    before = batch.last()?.id;
    if (!before) break;
    if (batch.size < 100) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function createTranscriptAttachment(channel, ticket) {
  const html = await createTranscriptHtml(channel, ticket);
  return createTranscriptAttachmentFromHtml(html, ticket);
}

function createTranscriptAttachmentFromHtml(html, ticket) {
  return new AttachmentBuilder(Buffer.from(html, "utf8"), {
    name: `ticket-${formatTicketNumber(ticket)}.html`
  });
}

function renderNotes(ticket) {
  const notes = ticket.notes ?? [];
  if (!notes.length) return "";

  return `
  <section>
    <h2>Notes internes</h2>
    ${notes.map((note) => `
      <article class="note">
        <div class="meta">${escapeHtml(note.authorId ? `Auteur: ${note.authorId}` : "Auteur inconnu")} - ${escapeHtml(note.createdAt ? new Date(note.createdAt).toLocaleString("fr-FR") : "date inconnue")}</div>
        <div class="content">${escapeHtml(note.content ?? "")}</div>
      </article>
    `).join("\n")}
  </section>`;
}

function renderAnswers(ticket) {
  const answers = ticket.answers ?? [];
  if (!answers.length) return "";

  return `
  <section>
    <h2>Questionnaire</h2>
    ${answers.map((answer) => `
      <article class="answer">
        <div class="meta">${escapeHtml(answer.label ?? answer.id ?? "Question")}</div>
        <div class="content">${escapeHtml(answer.value ?? "")}</div>
      </article>
    `).join("\n")}
  </section>`;
}

async function createTranscriptHtml(channel, ticket) {
  const messages = await fetchAllMessages(channel);
  const rows = messages.length ? messages.map((message) => {
    const attachments = message.attachments.size
      ? `<div class="attachments">${[...message.attachments.values()].map((attachment) => `<a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.name ?? attachment.url)}</a>`).join("<br>")}</div>`
      : "";

    return `
      <article>
        <div class="meta">${escapeHtml(message.author?.tag ?? "Utilisateur inconnu")} - ${new Date(message.createdTimestamp).toLocaleString("fr-FR")}</div>
        <div class="content">${escapeHtml(message.content || "[embed / composant / message vide]")}</div>
        ${attachments}
      </article>
    `;
  }).join("\n") : `
      <article>
        <div class="meta">Transcript indisponible</div>
        <div class="content">Aucun message n'a pu etre recupere. Le salon est peut-etre supprime, introuvable ou inaccessible.</div>
      </article>
    `;

  const channelName = channel?.name ?? `salon-${ticket.channelId ?? "introuvable"}`;

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Transcript ticket #${formatTicketNumber(ticket)}</title>
  <style>
    body { background:#111318; color:#e5e7eb; font-family:Arial,sans-serif; margin:32px; }
    h1 { color:#fff; }
    h2 { color:#fff; margin-top:32px; }
    article { background:#1f232b; border-left:4px solid #5865f2; padding:12px 16px; margin:12px 0; border-radius:6px; }
    article.note { border-left-color:#f2c94c; }
    article.answer { border-left-color:#36b37e; }
    .meta { color:#9ca3af; font-size:13px; margin-bottom:8px; }
    .content { white-space:pre-wrap; line-height:1.45; }
    .attachments { margin-top:8px; }
    a { color:#93c5fd; }
  </style>
</head>
<body>
  <h1>Ticket #${formatTicketNumber(ticket)}</h1>
  <p>Salon: ${escapeHtml(channelName)} | Ticket ID: ${escapeHtml(ticket.id)}</p>
  <p>Statut: ${escapeHtml(ticket.status ?? "-")} | Categorie: ${escapeHtml(ticket.category ?? "-")}</p>
  ${renderAnswers(ticket)}
  ${renderNotes(ticket)}
  <h2>Messages</h2>
  ${rows}
</body>
</html>`;

  return html;
}

async function saveTranscriptFile(channel, ticket) {
  const html = await createTranscriptHtml(channel, ticket);
  return saveTranscriptHtml(html, ticket);
}

async function saveTranscriptHtml(html, ticket) {
  await fs.mkdir(LOGS_DIR, { recursive: true });

  const filePath = path.join(LOGS_DIR, `ticket-${formatTicketNumber(ticket)}-${Date.now()}.html`);
  await fs.writeFile(filePath, html, "utf8");
  return filePath;
}

module.exports = {
  createTranscriptAttachment,
  createTranscriptAttachmentFromHtml,
  createTranscriptHtml,
  saveTranscriptFile,
  saveTranscriptHtml
};
