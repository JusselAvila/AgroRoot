CREATE TABLE IF NOT EXISTS Farmers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT NOT NULL UNIQUE,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Impact_Points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL,
  photo_url TEXT,
  location TEXT,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  amount_usdt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (farmer_id) REFERENCES Farmers(id)
);

CREATE INDEX IF NOT EXISTS idx_farmers_phone ON Farmers(phone);
CREATE INDEX IF NOT EXISTS idx_impact_points_status ON Impact_Points(status);
CREATE INDEX IF NOT EXISTS idx_impact_points_farmer ON Impact_Points(farmer_id);
