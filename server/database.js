const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "prices.json");

// Initialize JSON file if it doesn't exist
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ prices: [] }, null, 2));
}

const readDB = () => {
  const data = fs.readFileSync(dbPath, "utf8");
  return JSON.parse(data);
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

const upsertPrice = (instrument, buy, sell, updated_at) => {
  const db = readDB();
  db.prices.push({ instrument, buy, sell, updated_at });
  writeDB(db);
};

const getLatestPrices = () => {
  const db = readDB();
  const grouped = {};

  db.prices.forEach((price) => {
    if (!grouped[price.instrument] || grouped[price.instrument].updated_at < price.updated_at) {
      grouped[price.instrument] = price;
    }
  });

  return Object.values(grouped);
};

const getAllPrices = () => {
  const db = readDB();
  return db.prices.slice(-100);
};

module.exports = {
  upsertPrice,
  getLatestPrices,
  getAllPrices,
};
