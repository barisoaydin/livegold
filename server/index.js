require("dotenv").config();

const cors = require("cors");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { upsertPrice, getLatestPrices } = require("./database");
const { fetchPricesFromSource } = require("./fetcher");

const app = express();
const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const updateIntervalMs = Number(process.env.UPDATE_INTERVAL_MS || 30000);

const buildPayloadFromRows = (rows) => {
  const payload = {};

  rows.forEach((row) => {
    payload[row.instrument] = {
      buy: row.buy,
      sell: row.sell,
      updatedAt: row.updated_at,
    };
  });

  return payload;
};

const getLatestUpdatedAt = (rows) => {
  if (rows.length === 0) return null;

  return rows.reduce((latest, row) => {
    if (!latest) return row.updated_at;
    return row.updated_at > latest ? row.updated_at : latest;
  }, null);
};

app.use(cors({ origin: clientOrigin }));
app.use(express.json());
app.use(express.static(__dirname));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// GET /prices/latest - Son fiyatlar
app.get("/prices/latest", (req, res) => {
  try {
    const rows = getLatestPrices();
    res.json(buildPayloadFromRows(rows));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: clientOrigin,
  },
});

let latestPayload = null;

const emitLatestPayload = (payload, updatedAt, message) => {
  latestPayload = payload;
  io.emit("prices", payload);
  io.emit("status", { message, updatedAt });
};

const preloadLatestPayload = () => {
  const rows = getLatestPrices();

  if (rows.length === 0) {
    return;
  }

  latestPayload = buildPayloadFromRows(rows);
};

const fetchAndBroadcastPrices = async () => {
  try {
    const instruments = await fetchPricesFromSource();

    if (instruments.length === 0) {
      const rows = getLatestPrices();

      if (rows.length > 0) {
        const payload = buildPayloadFromRows(rows);
        const updatedAt = getLatestUpdatedAt(rows);
        emitLatestPayload(payload, updatedAt, "Kaynak cekilemedi, son veri gosteriliyor");
      } else {
        io.emit("status", { message: "Veri kaynağından fiyat alınamadı" });
      }

      return;
    }

    const updatedAt = new Date().toISOString();

    instruments.forEach((item) => {
      upsertPrice(item.instrument, item.buy, item.sell, updatedAt);
    });

    const rows = getLatestPrices();
    const payload = buildPayloadFromRows(rows);
    emitLatestPayload(payload, updatedAt, "Guncel");
  } catch (error) {
    console.error("Fiyat çekme hatası:", error.message);
    io.emit("status", { message: `Hata: ${error.message}` });
  }
};

const startPolling = () => {
  fetchAndBroadcastPrices();
  setInterval(fetchAndBroadcastPrices, updateIntervalMs);
};

io.on("connection", (socket) => {
  if (latestPayload) {
    socket.emit("prices", latestPayload);
  }

  socket.emit("status", {
    message: "Baglanti kuruldu",
    updatedAt: latestPayload?.updatedAt || null,
  });
});

server.listen(port, () => {
  console.log(`LiveGold API ${port} portunda calisiyor.`);
  preloadLatestPayload();
  startPolling();
});

// POST /admin/prices - Fiyat güncelleme
app.post("/admin/prices", (req, res) => {
  try {
    const { instrument, buy, sell } = req.body;

    if (!instrument || buy == null || sell == null) {
      return res.status(400).json({ error: "instrument, buy, sell gerekli" });
    }

    const updatedAt = new Date().toISOString();

    upsertPrice(instrument, buy, sell, updatedAt);

    const rows = getLatestPrices();
    const payload = buildPayloadFromRows(rows);
    emitLatestPayload(payload, updatedAt, "Admin guncelledi");

    res.json({ success: true, instrument, buy, sell, updatedAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
