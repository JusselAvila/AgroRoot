const express = require("express");
const {
  createSmartAccountIfNeeded,
  getFeeQuote,
  sendFunding,
} = require("../services/wdkService");
const {
  getPivById,
  listPivs,
  listPendingPivs,
  createPiv,
  upsertFarmerByPhone,
} = require("../db/pivs");
const { getFileUrl } = require("../services/notifier");

const router = express.Router();

/** Precio fijo por PIV (regla de scope del proyecto). */
function getPivPrice() {
  return String(process.env.PIV_PRICE_USDT || "25");
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Forma que consume el dashboard — evita filtrar columnas internas. */
function toDashboardPiv(piv) {
  return {
    id: piv.id,
    farmerId: piv.farmer_id,
    farmerName: piv.farmer_name,
    chatId: piv.farmer_phone,
    smartAccountAddress: piv.farmer_smart_account_address,
    location: piv.location,
    latitude: piv.latitude,
    longitude: piv.longitude,
    hasPhoto: Boolean(piv.photo_url),
    photoUrl: piv.photo_url ? `/api/pivs/${piv.id}/photo` : null,
    status: piv.status,
    txHash: piv.tx_hash,
    explorerUrl: piv.tx_hash ? `https://sepolia.etherscan.io/tx/${piv.tx_hash}` : null,
    amountUsdt: piv.amount_usdt,
    feeUsdt: piv.fee_usdt,
    createdAt: piv.created_at,
    updatedAt: piv.updated_at,
  };
}

/**
 * POST /api/pivs/fund/:pivId
 * Body: { "amount": "1" }  // USDT (human) or base units >= 1000000
 */
router.post(
  "/fund/:pivId",
  asyncHandler(async (req, res) => {
    const pivId = Number(req.params.pivId);
    if (!Number.isInteger(pivId) || pivId <= 0) {
      return res.status(400).json({ error: "pivId must be a positive integer" });
    }

    // Sin monto explícito se usa el precio fijo por PIV (regla de scope).
    let amount = req.body?.amount ?? req.body?.amountUsdt;
    if (amount === undefined || amount === null || amount === "") {
      amount = getPivPrice();
    }

    const result = await sendFunding(pivId, amount);
    return res.status(200).json({
      ok: true,
      ...result,
    });
  }),
);

/**
 * GET /api/pivs/quote?amount=1
 * Lets Persona B show gas cost in USD₮ before confirm.
 */
router.get(
  "/quote",
  asyncHandler(async (req, res) => {
    const amount = req.query.amount ?? "1";
    const quote = await getFeeQuote(amount);
    return res.status(200).json({ ok: true, ...quote });
  }),
);

/**
 * GET /api/pivs/pending
 * Lista de PIVs esperando comprador — alimenta el dashboard corporativo.
 */
router.get(
  "/pending",
  asyncHandler(async (_req, res) => {
    const pivs = listPendingPivs().map(toDashboardPiv);
    return res.status(200).json({
      ok: true,
      priceUsdt: getPivPrice(),
      count: pivs.length,
      pivs,
    });
  }),
);

/**
 * GET /api/pivs?status=funded
 * Listado general (sin filtro devuelve todos).
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const pivs = listPivs({ status }).map(toDashboardPiv);
    return res.status(200).json({
      ok: true,
      priceUsdt: getPivPrice(),
      count: pivs.length,
      pivs,
    });
  }),
);

/**
 * GET /api/pivs/:pivId/photo
 * Proxy de la foto que el agricultor mandó por Telegram. Se resuelve el
 * file_id server-side para que el token del bot nunca llegue al navegador.
 */
router.get(
  "/:pivId/photo",
  asyncHandler(async (req, res) => {
    const piv = getPivById(Number(req.params.pivId));
    if (!piv) {
      return res.status(404).json({ error: "PIV not found" });
    }
    if (!piv.photo_url) {
      return res.status(404).json({ error: "PIV has no photo" });
    }

    const fileUrl = await getFileUrl(piv.photo_url);
    const upstream = await fetch(fileUrl);
    if (!upstream.ok) {
      return res.status(502).json({ error: "Could not fetch photo from Telegram" });
    }

    // Telegram sirve las fotos como application/octet-stream; siempre son JPEG.
    const upstreamType = upstream.headers.get("content-type");
    const contentType =
      upstreamType && upstreamType.startsWith("image/") ? upstreamType : "image/jpeg";

    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "public, max-age=3600");
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  }),
);

/**
 * GET /api/pivs/:pivId
 */
router.get(
  "/:pivId",
  asyncHandler(async (req, res) => {
    const piv = getPivById(Number(req.params.pivId));
    if (!piv) {
      return res.status(404).json({ error: "PIV not found" });
    }
    return res.status(200).json({ ok: true, piv });
  }),
);

/**
 * POST /api/pivs
 * Dev/helper so A can seed a pending PIV without Twilio.
 * Body: { phone, name?, location?, photoUrl?, amount? }
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const phone = req.body?.phone;
    if (!phone) {
      return res.status(400).json({ error: "body.phone is required" });
    }

    const farmer = upsertFarmerByPhone({
      phone,
      name: req.body?.name ?? null,
      location: req.body?.location ?? null,
    });

    // Derivar la smart account necesita RPC/paymaster; sin acceso a Sepolia el
    // PIV igual debe poder crearse (se deriva de nuevo al momento de fondear).
    let account = null;
    let accountError = null;
    try {
      account = await createSmartAccountIfNeeded(farmer.phone);
    } catch (error) {
      accountError = error.message;
      console.warn("[pivs] smart account diferida:", error.message);
    }

    const piv = createPiv({
      farmerId: farmer.id,
      photoUrl: req.body?.photoUrl ?? null,
      location: req.body?.location ?? farmer.location,
      latitude: req.body?.latitude ?? null,
      longitude: req.body?.longitude ?? null,
      status: "pending",
    });

    return res.status(201).json({
      ok: true,
      piv: toDashboardPiv(piv),
      smartAccount: account,
      smartAccountError: accountError,
    });
  }),
);

module.exports = router;
