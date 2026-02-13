import { useEffect, useMemo, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const socketUrl = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";
const apiUrl = process.env.REACT_APP_API_URL || socketUrl;
const socket = io(socketUrl, { transports: ["websocket", "polling"] });

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const ratioFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const timeFormatter = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function App() {
  const [prices, setPrices] = useState(null);
  const [status, setStatus] = useState({ message: "Baglaniyor...", connected: false });

  useEffect(() => {
    const controller = new AbortController();
    const loadLatestPrices = async () => {
      try {
        const response = await fetch(`${apiUrl}/prices/latest`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setPrices(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Ilk fiyatlar alinmadi:", error);
        }
      }
    };

    const handleConnect = () => setStatus({ message: "Canli", connected: true });
    const handleDisconnect = () => setStatus({ message: "Baglanti koptu", connected: false });

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("prices", (payload) => setPrices(payload));
    socket.on("status", (payload) => setStatus((prev) => ({ ...prev, message: payload.message })));

    loadLatestPrices();

    return () => {
      controller.abort();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("prices");
      socket.off("status");
    };
  }, []);

  const goldData = prices?.GRAM_ALTIN_24;
  const usdData = prices?.["USD/TRY"];
  const eurData = prices?.["EUR/TRY"];
  const ceyrekData = prices?.CEYREK_ALTIN;

  const lastUpdated = useMemo(() => {
    if (!prices) return "--:--:--";
    
    const timestamps = Object.values(prices)
      .map(p => p?.updatedAt)
      .filter(Boolean);
    
    if (timestamps.length === 0) return "--:--:--";
    
    const mostRecent = Math.max(...timestamps.map(t => new Date(t).getTime()));
    return timeFormatter.format(new Date(mostRecent));
  }, [prices]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <span className="badge">CANLI</span>
          <h1>LiveGold</h1>
          <p>Anlık altın fiyatı ve döviz kurları.</p>
        </div>
        <div className={`status ${status.connected ? "online" : "offline"}`}>
          <span className="status-dot" />
          <span>{status.message}</span>
        </div>
      </header>

      <section className="cards">
        <div className="card highlight">
          <div className="card-title">24 Ayar Gram Altin</div>
          <div className="price-rows">
            <div className="price-row">
              <span className="price-label">Satis</span>
              <span className="price-value">
                {goldData ? currencyFormatter.format(goldData.sell) : "--"}
              </span>
            </div>
            <div className="price-row">
              <span className="price-label">Alis</span>
              <span className="price-value">
                {goldData ? currencyFormatter.format(goldData.buy) : "--"}
              </span>
            </div>
          </div>
          <div className="card-sub">TRY</div>
        </div>

        <div className="card">
          <div className="card-title">USD / TRY</div>
          <div className="price-rows">
            <div className="price-row">
              <span className="price-label">Satis</span>
              <span className="price-value">
                {usdData ? `${ratioFormatter.format(usdData.sell)} ₺` : "--"}
              </span>
            </div>
            <div className="price-row">
              <span className="price-label">Alis</span>
              <span className="price-value">
                {usdData ? `${ratioFormatter.format(usdData.buy)} ₺` : "--"}
              </span>
            </div>
          </div>
          <div className="card-sub">Dolar kuru</div>
        </div>

        <div className="card">
          <div className="card-title">EUR / TRY</div>
          <div className="price-rows">
            <div className="price-row">
              <span className="price-label">Satis</span>
              <span className="price-value">
                {eurData ? `${ratioFormatter.format(eurData.sell)} ₺` : "--"}
              </span>
            </div>
            <div className="price-row">
              <span className="price-label">Alis</span>
              <span className="price-value">
                {eurData ? `${ratioFormatter.format(eurData.buy)} ₺` : "--"}
              </span>
            </div>
          </div>
          <div className="card-sub">Euro kuru</div>
        </div>

        <div className="card">
          <div className="card-title">Ceyrek Altin</div>
          <div className="price-rows">
            <div className="price-row">
              <span className="price-label">Satis</span>
              <span className="price-value">
                {ceyrekData ? currencyFormatter.format(ceyrekData.sell) : "--"}
              </span>
            </div>
            <div className="price-row">
              <span className="price-label">Alis</span>
              <span className="price-value">
                {ceyrekData ? currencyFormatter.format(ceyrekData.buy) : "--"}
              </span>
            </div>
          </div>
          <div className="card-sub">TRY</div>
        </div>
      </section>

      <section className="meta">
        <div>
          <span>Son guncelleme</span>
          <strong>{lastUpdated}</strong>
        </div>
        <div>
          <span>Kaynak</span>
          <strong>Livegold.com</strong>
        </div>
        <div>
          <span>Yenileme Süresi</span>
          <strong>10 saniye</strong>
        </div>
      </section>
    </div>
  );
}

export default App;
