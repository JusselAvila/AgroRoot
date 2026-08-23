const express = require("express");
const {
  createSmartAccountIfNeeded,
  getFeeQuote,
  sendFunding,
} = require("../services/wdkService");
const { getPivById, createPiv, upsertFarmerByPhone } = require("../db/pivs");

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
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

    const amount = req.body?.amount ?? req.body?.amountUsdt;
    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ error: "body.amount is required (USDT)" });
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

    const account = await createSmartAccountIfNeeded(farmer.phone);
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
      piv,
      smartAccount: account,
    });
  }),
);

module.exports = router;
