const { getDb } = require("./index");

function normalizePhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/\s+/g, "");
}

function getFarmerByPhone(phone) {
  return getDb()
    .prepare(`SELECT * FROM Farmers WHERE phone = ?`)
    .get(normalizePhone(phone));
}

function getFarmerById(id) {
  return getDb().prepare(`SELECT * FROM Farmers WHERE id = ?`).get(id);
}

function upsertFarmerByPhone({ phone, name = null, location = null }) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new Error("phone is required");
  }

  getDb()
    .prepare(
      `INSERT INTO Farmers (phone, name, location)
       VALUES (?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         name = COALESCE(excluded.name, Farmers.name),
         location = COALESCE(excluded.location, Farmers.location)`,
    )
    .run(normalized, name, location);

  return getFarmerByPhone(normalized);
}

function setFarmerSmartAccount(farmerId, smartAccountAddress) {
  getDb()
    .prepare(
      `UPDATE Farmers
       SET smart_account_address = ?
       WHERE id = ?`,
    )
    .run(smartAccountAddress, farmerId);

  return getFarmerById(farmerId);
}

function getPivById(pivId) {
  return getDb()
    .prepare(
      `SELECT
         ip.*,
         f.phone AS farmer_phone,
         f.name AS farmer_name,
         f.smart_account_address AS farmer_smart_account_address
       FROM Impact_Points ip
       JOIN Farmers f ON f.id = ip.farmer_id
       WHERE ip.id = ?`,
    )
    .get(pivId);
}

/** Lista PIVs para el dashboard corporativo, opcionalmente filtrando por estado. */
function listPivs({ status = null, limit = 100 } = {}) {
  const base = `SELECT
       ip.*,
       f.phone AS farmer_phone,
       f.name AS farmer_name,
       f.smart_account_address AS farmer_smart_account_address
     FROM Impact_Points ip
     JOIN Farmers f ON f.id = ip.farmer_id`;

  if (status) {
    return getDb()
      .prepare(`${base} WHERE ip.status = ? ORDER BY ip.created_at DESC LIMIT ?`)
      .all(status, limit);
  }

  return getDb().prepare(`${base} ORDER BY ip.created_at DESC LIMIT ?`).all(limit);
}

function listPendingPivs(limit = 100) {
  return listPivs({ status: "pending", limit });
}

function createPiv({
  farmerId,
  photoUrl = null,
  location = null,
  latitude = null,
  longitude = null,
  status = "pending",
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO Impact_Points (
         farmer_id, photo_url, location, latitude, longitude, status
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(farmerId, photoUrl, location, latitude, longitude, status);

  return getPivById(Number(result.lastInsertRowid));
}

function markPivFunding(pivId) {
  getDb()
    .prepare(
      `UPDATE Impact_Points
       SET status = 'funding',
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(pivId);

  return getPivById(pivId);
}

/**
 * Guarda el hash apenas el bundler acepta la UserOperation, todavía en estado
 * 'funding'. Si el proceso muere esperando la confirmación, el hash no se pierde
 * y la operación sigue siendo rastreable en el explorador.
 */
function markPivSubmitted(pivId, txHash) {
  getDb()
    .prepare(
      `UPDATE Impact_Points
       SET tx_hash = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(txHash, pivId);

  return getPivById(pivId);
}

function markPivFunded(pivId, { txHash, amountUsdt, feeUsdt }) {
  getDb()
    .prepare(
      `UPDATE Impact_Points
       SET status = 'funded',
           tx_hash = ?,
           amount_usdt = ?,
           fee_usdt = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(txHash, amountUsdt, feeUsdt, pivId);

  return getPivById(pivId);
}

function markPivFailed(pivId, reason) {
  getDb()
    .prepare(
      `UPDATE Impact_Points
       SET status = 'failed',
           fee_usdt = COALESCE(fee_usdt, ?),
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(reason ? `error:${reason}`.slice(0, 200) : null, pivId);

  return getPivById(pivId);
}

module.exports = {
  normalizePhone,
  getFarmerByPhone,
  getFarmerById,
  upsertFarmerByPhone,
  setFarmerSmartAccount,
  getPivById,
  listPivs,
  listPendingPivs,
  createPiv,
  markPivFunding,
  markPivSubmitted,
  markPivFunded,
  markPivFailed,
};
