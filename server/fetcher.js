const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

/**
 * BloombergHT'den Puppeteer kullanarak canlı veri çekme
 * JavaScript render edilerek gerçek fiyatlar elde edilir
 */

const DOVIZ_URL = "https://www.bloomberght.com/doviz";
const ALTIN_URL = "https://www.bloomberght.com/altin";

let browser = null;

async function closeBrowser() {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      // Zaten kapanmış olabilir
    }
    browser = null;
  }
}

async function initBrowser() {
  // Browser bağlantısı kopmuşsa yeniden başlat
  if (browser && !browser.isConnected()) {
    console.log("Browser baglantisi kopmus, yeniden baslatiliyor...");
    await closeBrowser();
  }

  if (!browser) {
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      console.log("Puppeteer browser baslatildi");
    } catch (error) {
      console.error("Tarayici baslatma hatasi:", error.message);
      return null;
    }
  }
  return browser;
}

function parsePrice(priceString) {
  if (!priceString) return 0;
  const cleaned = priceString.trim().replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

async function fetchDovizPrices() {
  let page = null;
  try {
    const browserInstance = await initBrowser();
    if (!browserInstance) return [];

    page = await browserInstance.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    await page.goto(DOVIZ_URL, { waitUntil: "networkidle2" });

    const dovizData = await page.evaluate(() => {
      const data = {};

      // Sayfadaki tüm tabloları ara
      document.querySelectorAll("table tr").forEach((row) => {
        const text = row.innerText.toUpperCase();
        const parts = row.innerText.split(/\s+/);

        // USD/TRY satırı
        if (text.includes("USD/TRY")) {
          // parts'tan ilk yüksek sayıyı (40+) bul
          const numbers = parts.filter(p => /^[\d,]+$/.test(p));
          if (numbers.length > 0) {
            const price = parseFloat(numbers[0].replace(",", "."));
            if (price > 40) {
              data.USD = price;
            }
          }
        }

        // EUR/TRY satırı
        if (text.includes("EUR/TRY")) {
          const numbers = parts.filter(p => /^[\d,]+$/.test(p));
          if (numbers.length > 0) {
            const price = parseFloat(numbers[0].replace(",", "."));
            if (price > 40) {
              data.EUR = price;
            }
          }
        }
      });

      return data;
    });

    const instruments = [];
    if (dovizData.USD) {
      instruments.push({
        instrument: "USD/TRY",
        buy: dovizData.USD,
        sell: dovizData.USD,
      });
    }
    if (dovizData.EUR) {
      instruments.push({
        instrument: "EUR/TRY",
        buy: dovizData.EUR,
        sell: dovizData.EUR,
      });
    }

    return instruments;
  } catch (err) {
    console.error("Doviz cekim hatasi:", err.message || String(err));
    // Browser hatası varsa kapatıp yeniden başlatmak için
    const errorMsg = err.message || String(err);
    if (errorMsg.includes("closed") || errorMsg.includes("disconnected")) {
      await closeBrowser();
    }
    return [];
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Sayfa zaten kapalı olabilir
      }
    }
  }
}

async function fetchAltinPrices() {
  let page = null;
  try {
    const browserInstance = await initBrowser();
    if (!browserInstance) return [];

    page = await browserInstance.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    await page.goto(ALTIN_URL, { waitUntil: "networkidle2" });

    // Altın verileri çek
    const altinData = await page.evaluate(() => {
      const data = {};

      // Sayfadaki tüm tabloları ara
      document.querySelectorAll("table tr").forEach((row) => {
        const text = row.innerText.toUpperCase();
        const parts = row.innerText.split(/\s+/);

        // GRAM ALTIN satırı
        if (text.includes("GRAM ALTIN") && !text.includes("ONS")) {
          const numbers = parts.filter(p => /^[\d,.]+$/.test(p));
          if (numbers.length >= 2) {
            const buy = parseFloat(numbers[0].replace(/\./g, "").replace(",", "."));
            const sell = parseFloat(numbers[1].replace(/\./g, "").replace(",", "."));
            if (buy > 1000 && sell > 1000) {
              data.GRAM = { buy, sell };
            }
          }
        }

        // ÇEYREK ALTIN satırı
        if (text.includes("ÇEYREK ALTIN")) {
          const numbers = parts.filter(p => /^[\d,.]+$/.test(p));
          if (numbers.length >= 2) {
            const buy = parseFloat(numbers[0].replace(/\./g, "").replace(",", "."));
            const sell = parseFloat(numbers[1].replace(/\./g, "").replace(",", "."));
            if (buy > 5000 && sell > 5000) {
              data.CEYREK = { buy, sell };
            }
          }
        }
      });

      return data;
    });

    const instruments = [];
    if (altinData.GRAM) {
      instruments.push({
        instrument: "GRAM_ALTIN_24",
        buy: altinData.GRAM.buy,
        sell: altinData.GRAM.sell,
      });
    }
    if (altinData.CEYREK) {
      instruments.push({
        instrument: "CEYREK_ALTIN",
        buy: altinData.CEYREK.buy,
        sell: altinData.CEYREK.sell,
      });
    }

    return instruments;
  } catch (err) {
    console.error("Altin cekim hatasi:", err.message || String(err));
    // Browser hatası varsa kapatıp yeniden başlatmak için
    const errorMsg = err.message || String(err);
    if (errorMsg.includes("closed") || errorMsg.includes("disconnected")) {
      await closeBrowser();
    }
    return [];
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Sayfa zaten kapalı olabilir
      }
    }
  }
}

async function fetchPricesFromSource() {
  try {
    console.log("BloombergHT'den veri cekilmeye baslanidi...");

    const [dovizPrices, altinPrices] = await Promise.all([
      fetchDovizPrices(),
      fetchAltinPrices(),
    ]);

    const allPrices = [...dovizPrices, ...altinPrices];

    console.log(`BloombergHT'den ${allPrices.length} fiyat cekildi`);
    allPrices.forEach((price) => {
      console.log(`  ${price.instrument}: A=${price.buy}, S=${price.sell}`);
    });

    return allPrices;
  } catch (error) {
    console.error("BloombergHT veri cekme hatasi:", error.message);
    return [];
  }
}

module.exports = { fetchPricesFromSource };
