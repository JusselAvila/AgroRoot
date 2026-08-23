require("dotenv").config();

const express = require("express");
const { connect, listTables, getDatabasePath } = require("./db");
const pivsRouter = require("./routes/pivs");

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => {
  try {
    const tables = listTables();
    const ready = tables.includes("Farmers") && tables.includes("Impact_Points");

    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "degraded",
      db: {
        path: getDatabasePath(),
        connected: true,
        tables,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      db: {
        path: getDatabasePath(),
        connected: false,
        error: error.message,
      },
    });
  }
});

app.use("/api/pivs", pivsRouter);

app.use((error, _req, res, _next) => {
  console.error("[api]", error);
  const status = Number(error.statusCode) || 500;
  res.status(status).json({
    ok: false,
    error: error.message || "Internal server error",
  });
});

function start() {
  connect();

  const server = app.listen(PORT, () => {
    console.log(`AgroRoot listening on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
