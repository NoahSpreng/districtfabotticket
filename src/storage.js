const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_PATH = path.join(__dirname, "..", "data", "tickets.json");

async function readStore() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { tickets: [] };
    }
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function findOpenTicketByUser(userId) {
  const store = await readStore();
  return store.tickets.find((ticket) => ticket.userId === userId && ticket.status === "open") ?? null;
}

async function findOpenTicketsByUser(userId) {
  const store = await readStore();
  return store.tickets.filter((ticket) => ticket.userId === userId && ticket.status === "open");
}

async function findOpenTicketByChannel(channelId) {
  const store = await readStore();
  return store.tickets.find((ticket) => ticket.channelId === channelId && ticket.status === "open") ?? null;
}

async function findTicketByChannel(channelId) {
  const store = await readStore();
  return store.tickets.find((ticket) => ticket.channelId === channelId) ?? null;
}

async function nextTicketNumber() {
  const store = await readStore();
  const highestNumber = store.tickets.reduce((highest, ticket) => {
    return Math.max(highest, Number(ticket.number) || 0);
  }, 0);

  return highestNumber + 1;
}

async function listTickets() {
  const store = await readStore();
  return store.tickets;
}

async function markTicketClosed(ticket, reason = "closed") {
  ticket.status = "closed";
  ticket.closedAt = ticket.closedAt ?? new Date().toISOString();
  ticket.closeReason = reason;
  await upsertTicket(ticket);
  return ticket;
}

async function addTicketNote(ticket, note) {
  ticket.notes = ticket.notes ?? [];
  ticket.notes.push(note);
  await upsertTicket(ticket);
  return ticket;
}

async function upsertTicket(ticket) {
  const store = await readStore();
  const index = store.tickets.findIndex((item) => item.id === ticket.id);

  if (index === -1) {
    store.tickets.push(ticket);
  } else {
    store.tickets[index] = ticket;
  }

  await writeStore(store);
  return ticket;
}

module.exports = {
  addTicketNote,
  findOpenTicketByChannel,
  findOpenTicketByUser,
  findOpenTicketsByUser,
  findTicketByChannel,
  listTickets,
  markTicketClosed,
  nextTicketNumber,
  upsertTicket
};
