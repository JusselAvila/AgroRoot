/**
 * Capa de mensajería de AgroRoot (Telegram).
 *
 * Usa la API HTTP de Telegram directamente en vez de importar `bot.js`, porque
 * el bot corre con polling en su propio proceso: si el servidor Express también
 * lo instanciara, ambos harían polling del mismo token y Telegram devolvería
 * 409 Conflict. Así el servidor solo *envía* y el bot solo *recibe*.
 *
 * Esta es la única pieza que sabe que el canal es Telegram — cambiar a WhatsApp
 * en el futuro es reescribir este archivo, nada más.
 */

const TELEGRAM_API = "https://api.telegram.org";

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !String(token).trim()) {
    throw new Error("Falta TELEGRAM_BOT_TOKEN en .env");
  }
  return String(token).trim();
}

async function sendMessage(chatId, text) {
  const response = await fetch(`${TELEGRAM_API}/bot${getToken()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`Telegram sendMessage falló: ${payload.description || response.status}`);
  }

  return payload.result;
}

/**
 * Fase 4: avisar al agricultor que su PIV fue pagado.
 * Se llama después de que WDK confirma la transferencia (ver wdkService.sendFunding).
 */
function notificarPagoConfirmado(chatId, { txHash, amountUsdt }) {
  return sendMessage(
    chatId,
    `💸 ¡Pago confirmado! Recibiste ${amountUsdt} USD₮ por tu Punto de Impacto Verificado.\n\n` +
      `Comprobante: https://sepolia.etherscan.io/tx/${txHash}\n\n` +
      `No pagaste comisión de red: AgroRoot la cubrió por ti.`,
  );
}

/**
 * Resuelve un file_id de Telegram a una URL descargable temporal.
 * La usa el proxy de fotos del dashboard (la URL incluye el token, nunca sale del servidor).
 */
async function getFileUrl(fileId) {
  const response = await fetch(
    `${TELEGRAM_API}/bot${getToken()}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const payload = await response.json();

  if (!payload.ok) {
    throw new Error(`Telegram getFile falló: ${payload.description || response.status}`);
  }

  return `${TELEGRAM_API}/file/bot${getToken()}/${payload.result.file_path}`;
}

module.exports = { sendMessage, notificarPagoConfirmado, getFileUrl };
