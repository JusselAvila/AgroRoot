/**
 * AgroRoot — bot de Telegram (@AgroRoot_bot).
 *
 * Fase 1: recibe foto + ubicación de la parcela, crea el Farmer/PIV en la
 * base de datos real (rate-limiting: un PIV pendiente a la vez por chatId).
 *
 * El aviso de pago al agricultor (Fase 4) NO se dispara desde aquí: lo manda el
 * servidor Express vía src/services/notifier.js cuando WDK confirma la
 * transferencia. Este proceso solo recibe.
 *
 * El chatId de Telegram hace de identificador único del agricultor y se
 * guarda en la columna `phone` de Farmers (ver RESUMEN_PROYECTO_1.md).
 *
 * Uso:
 *   cp .env.example .env   # completar TELEGRAM_BOT_TOKEN
 *   npm install
 *   npm run bot
 */

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const { connect, getDb } = require("./src/db");
const { upsertFarmerByPhone, getFarmerByPhone, createPiv } = require("./src/db/pivs");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN || !TOKEN.trim()) {
  throw new Error("Falta TELEGRAM_BOT_TOKEN en .env (token de @BotFather)");
}

connect();

const bot = new TelegramBot(TOKEN.trim(), { polling: true });

// chatId -> { photoFileId?, latitude?, longitude? } mientras se completa el envío
const pendingSubmissions = new Map();

function hasOpenPiv(chatId) {
  const farmer = getFarmerByPhone(String(chatId));
  if (!farmer) {
    return false;
  }

  const row = getDb()
    .prepare(
      `SELECT id FROM Impact_Points WHERE farmer_id = ? AND status IN ('pending', 'funding') LIMIT 1`,
    )
    .get(farmer.id);

  return Boolean(row);
}

function finalizeSubmission(chatId) {
  const submission = pendingSubmissions.get(chatId);
  pendingSubmissions.delete(chatId);

  const farmer = upsertFarmerByPhone({ phone: String(chatId) });
  const piv = createPiv({
    farmerId: farmer.id,
    photoUrl: submission.photoFileId,
    latitude: submission.latitude,
    longitude: submission.longitude,
    status: "pending",
  });

  bot.sendMessage(
    chatId,
    `✅ ¡Listo! Tu Punto de Impacto Verificado #${piv.id} quedó registrado y pendiente de revisión. Te aviso apenas se confirme el pago.`,
  );
}

bot.onText(/^\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "🌱 Bienvenido a AgroRoot.\n\n" +
      "Para registrar un Punto de Impacto Verificado (PIV) de tu parcela, mándame:\n" +
      "1. Una 📷 foto de la parcela\n" +
      "2. Tu 📍 ubicación (clip → Ubicación)\n\n" +
      "Puedes mandarlos en cualquier orden.",
  );
});

bot.on("location", (msg) => {
  const chatId = msg.chat.id;

  if (hasOpenPiv(chatId)) {
    bot.sendMessage(chatId, "⏳ Ya tienes un PIV pendiente de pago. Espera la confirmación antes de enviar otro.");
    return;
  }

  const submission = pendingSubmissions.get(chatId) || {};
  submission.latitude = msg.location.latitude;
  submission.longitude = msg.location.longitude;
  pendingSubmissions.set(chatId, submission);

  if (submission.photoFileId) {
    finalizeSubmission(chatId);
  } else {
    bot.sendMessage(chatId, "📍 Ubicación recibida. Ahora mándame la foto de la parcela.");
  }
});

bot.on("photo", (msg) => {
  const chatId = msg.chat.id;

  if (hasOpenPiv(chatId)) {
    bot.sendMessage(chatId, "⏳ Ya tienes un PIV pendiente de pago. Espera la confirmación antes de enviar otro.");
    return;
  }

  const submission = pendingSubmissions.get(chatId) || {};
  submission.photoFileId = msg.photo[msg.photo.length - 1].file_id;
  pendingSubmissions.set(chatId, submission);

  if (submission.latitude !== undefined) {
    finalizeSubmission(chatId);
  } else {
    bot.sendMessage(chatId, "📷 Foto recibida. Ahora comparte tu ubicación (clip → Ubicación).");
  }
});

bot.on("message", (msg) => {
  const isCommand = typeof msg.text === "string" && msg.text.startsWith("/");
  if (msg.photo || msg.location || isCommand) {
    return;
  }

  bot.sendMessage(
    msg.chat.id,
    "Mándame una 📷 foto de tu parcela y tu 📍 ubicación para registrar un PIV. Usa /start si necesitas ayuda.",
  );
});

bot.on("polling_error", (error) => {
  console.error("[bot] polling error:", error.message);
});

console.log("AgroRoot Telegram bot escuchando (polling)...");

// El aviso de pago (Fase 4) vive en src/services/notifier.js y lo dispara el
// servidor Express tras un sendFunding() exitoso — no este proceso.
module.exports = { bot };
