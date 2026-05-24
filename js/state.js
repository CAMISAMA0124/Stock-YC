/* ================================================
   state.js — Global State Management
   Uses localStorage as persistence layer
   All pages read/write via YC.state
   ================================================ */

window.YC = window.YC || {};

YC.state = (() => {
  const LS_KEY = 'YC_v1';

  /* Default state */
  const DEFAULTS = {
    settings: {
      totalAssets: 0,           // User's total assets in NTD
      currency: 'TWD',
      maxCashPct: 50,           // Max cash position %
      minCashPct: 5,            // Min cash position %
      adjustCoeff: 0.8,         // Sensitivity 0~1
      goalName: '財務自由',
      goalAmount: 10000000,
      currentAge: 30,
      monthlyInvest: 0,
      aiProvider: 'gemini',     // openai | gemini | claude
      apiKey: '',
      apiKeyOpenAI: '',
      apiKeyGemini: '',
      apiKeyClaude: '',
    },
    // User's portfolio holdings
    holdings: [],
    // Investment notes
    stockNotes: {},
    // Watchlist (Definitive 2026 Comprehensive Database - v2)
    watchlist: [
      // ── 🇹🇼 台灣股票 (主要權值與產業者) ───────────────────
      { symbol: '2330.TW', name: '台積電', type: 'tw', industry: '半導體' },
      { symbol: '2454.TW', name: '聯發科', type: 'tw', industry: '半導體' },
      { symbol: '2303.TW', name: '聯電', type: 'tw', industry: '半導體' },
      { symbol: '2337.TW', name: '旺宏', type: 'tw', industry: '半導體' },
      { symbol: '2449.TW', name: '京元電子', type: 'tw', industry: '半導體' },
      { symbol: '3711.TW', name: '日月光投控', type: 'tw', industry: '半導體' },
      
      { symbol: '2317.TW', name: '鴻海', type: 'tw', industry: 'AI/伺服器' },
      { symbol: '2382.TW', name: '廣達', type: 'tw', industry: 'AI/伺服器' },
      { symbol: '3231.TW', name: '緯創', type: 'tw', industry: 'AI/伺服器' },
      { symbol: '6669.TW', name: '緯穎', type: 'tw', industry: 'AI/伺服器' },
      { symbol: '2357.TW', name: '華碩', type: 'tw', industry: 'AI/伺服器' },
      { symbol: '2353.TW', name: '宏碁', type: 'tw', industry: 'AI/伺服器' },

      { symbol: '3034.TW', name: '聯詠', type: 'tw', industry: 'IC設計' },
      { symbol: '3661.TW', name: '世芯-KY', type: 'tw', industry: 'IC設計' },
      { symbol: '5274.TW', name: '信驊', type: 'tw', industry: 'IC設計' },
      { symbol: '3443.TW', name: '創意', type: 'tw', industry: 'IC設計' },

      { symbol: '2881.TW', name: '富邦金', type: 'tw', industry: '金融保險' },
      { symbol: '2882.TW', name: '國泰金', type: 'tw', industry: '金融保險' },
      { symbol: '2886.TW', name: '兆豐金', type: 'tw', industry: '金融保險' },
      { symbol: '2884.TW', name: '玉山金', type: 'tw', industry: '金融保險' },
      { symbol: '2891.TW', name: '中信金', type: 'tw', industry: '金融保險' },
      { symbol: '5880.TW', name: '合庫金', type: 'tw', industry: '金融保險' },

      { symbol: '2603.TW', name: '長榮', type: 'tw', industry: '航運物流' },
      { symbol: '2609.TW', name: '陽明', type: 'tw', industry: '航運物流' },
      { symbol: '2615.TW', name: '萬海', type: 'tw', industry: '航運物流' },
      { symbol: '2618.TW', name: '長榮航', type: 'tw', industry: '航運物流' },
      { symbol: '2610.TW', name: '華航', type: 'tw', industry: '航運物流' },

      { symbol: '2308.TW', name: '台達電', type: 'tw', industry: '電子零組件' },
      { symbol: '3037.TW', name: '欣興', type: 'tw', industry: '電子零組件' },
      { symbol: '8046.TW', name: '南電', type: 'tw', industry: '電子零組件' },
      { symbol: '2492.TW', name: '華新科', type: 'tw', industry: '電子零組件' },
      { symbol: '2327.TW', name: '國巨', type: 'tw', industry: '電子零組件' },

      { symbol: '1216.TW', name: '統一', type: 'tw', industry: '傳產/零售' },
      { symbol: '2002.TW', name: '中鋼', type: 'tw', industry: '傳產/零售' },
      { symbol: '2105.TW', name: '正新', type: 'tw', industry: '傳產/零售' },
      { symbol: '2912.TW', name: '統一超', type: 'tw', industry: '傳產/零售' },
      { symbol: '2207.TW', name: '和泰車', type: 'tw', industry: '傳產/零售' },

      { symbol: '0050.TW', name: '元大台灣50', type: 'twetf', industry: '台股ETF' },
      { symbol: '006208.TW', name: '富邦台50', type: 'twetf', industry: '台股ETF' },
      { symbol: '0056.TW', name: '元大高股息', type: 'twetf', industry: '台股ETF' },
      { symbol: '00878.TW', name: '國泰永續高股息', type: 'twetf', industry: '台股ETF' },
      { symbol: '00919.TW', name: '群益台灣精選高息', type: 'twetf', industry: '台股ETF' },
      { symbol: '00929.TW', name: '復華台灣科技優息', type: 'twetf', industry: '台股ETF' },

      // ── 🇺🇸 美國股票 (S&P 500 核心) ─────────────────────
      { symbol: 'AAPL', name: 'Apple', type: 'us', industry: '科技巨頭' },
      { symbol: 'MSFT', name: 'Microsoft', type: 'us', industry: '科技巨頭' },
      { symbol: 'GOOGL', name: 'Alphabet', type: 'us', industry: '科技巨頭' },
      { symbol: 'AMZN', name: 'Amazon', type: 'us', industry: '科技巨頭' },
      { symbol: 'META', name: 'Meta', type: 'us', industry: '科技巨頭' },
      { symbol: 'TSLA', name: 'Tesla', type: 'us', industry: '科技巨頭' },
      { symbol: 'NFLX', name: 'Netflix', type: 'us', industry: '科技巨頭' },

      { symbol: 'NVDA', name: 'NVIDIA', type: 'us', industry: '半導體' },
      { symbol: 'AVGO', name: 'Broadcom', type: 'us', industry: '半導體' },
      { symbol: 'AMD', name: 'AMD', type: 'us', industry: '半導體' },
      { symbol: 'INTC', name: 'Intel', type: 'us', industry: '半導體' },
      { symbol: 'QCOM', name: 'Qualcomm', type: 'us', industry: '半導體' },
      { symbol: 'MU', name: 'Micron', type: 'us', industry: '半導體' },
      { symbol: 'TXN', name: 'Texas Instruments', type: 'us', industry: '半導體' },

      { symbol: 'ADBE', name: 'Adobe', type: 'us', industry: '軟體/雲端' },
      { symbol: 'CRM', name: 'Salesforce', type: 'us', industry: '軟體/雲端' },
      { symbol: 'ORCL', name: 'Oracle', type: 'us', industry: '軟體/雲端' },
      { symbol: 'NOW', name: 'ServiceNow', type: 'us', industry: '軟體/雲端' },
      { symbol: 'INTU', name: 'Intuit', type: 'us', industry: '軟體/雲端' },

      { symbol: 'JPM', name: 'JPMorgan', type: 'us', industry: '金融服務' },
      { symbol: 'V', name: 'Visa', type: 'us', industry: '金融服務' },
      { symbol: 'MA', name: 'Mastercard', type: 'us', industry: '金融服務' },
      { symbol: 'BAC', name: 'Bank of America', type: 'us', industry: '金融服務' },
      { symbol: 'GS', name: 'Goldman Sachs', type: 'us', industry: '金融服務' },
      { symbol: 'WFC', name: 'Wells Fargo', type: 'us', industry: '金融服務' },

      { symbol: 'UNH', name: 'UnitedHealth', type: 'us', industry: '醫療保健' },
      { symbol: 'LLY', name: 'Eli Lilly', type: 'us', industry: '醫療保健' },
      { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'us', industry: '醫療保健' },
      { symbol: 'PFE', name: 'Pfizer', type: 'us', industry: '醫療保健' },
      { symbol: 'ABBV', name: 'AbbVie', type: 'us', industry: '醫療保健' },
      { symbol: 'AMGN', name: 'Amgen', type: 'us', industry: '醫療保健' },

      { symbol: 'COST', name: 'Costco', type: 'us', industry: '消費零售' },
      { symbol: 'WMT', name: 'Walmart', type: 'us', industry: '消費零售' },
      { symbol: 'HD', name: 'Home Depot', type: 'us', industry: '消費零售' },
      { symbol: 'MCD', name: 'McDonald\'s', type: 'us', industry: '消費零售' },
      { symbol: 'NKE', name: 'Nike', type: 'us', industry: '消費零售' },
      { symbol: 'KO', name: 'Coca-Cola', type: 'us', industry: '消費零售' },
      { symbol: 'PEP', name: 'PepsiCo', type: 'us', industry: '消費零售' },

      { symbol: 'XOM', name: 'Exxon Mobil', type: 'us', industry: '能源/工業' },
      { symbol: 'CVX', name: 'Chevron', type: 'us', industry: '能源/工業' },
      { symbol: 'DIS', name: 'Disney', type: 'us', industry: '能源/工業' },
      { symbol: 'CAT', name: 'Caterpillar', type: 'us', industry: '能源/工業' },
      { symbol: 'GE', name: 'GE Aerospace', type: 'us', industry: '能源/工業' },
      
      { symbol: 'SPY', name: 'SPDR S&P 500', type: 'usetf', industry: '美股ETF' },
      { symbol: 'QQQ', name: 'Invesco QQQ', type: 'usetf', industry: '美股ETF' },
      { symbol: 'VOO', name: 'Vanguard S&P 500', type: 'usetf', industry: '美股ETF' },
      { symbol: 'VTI', name: 'Vanguard Total Stock', type: 'usetf', industry: '美股ETF' },
      { symbol: 'IVV', name: 'iShares Core S&P 500', type: 'usetf', industry: '美股ETF' },
      
      // ── 🌐 特色與避險資產 (多元化配置) ───────────────────
      { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond', type: 'usetf', industry: '債券/避險' },
      { symbol: 'GLD', name: 'SPDR Gold Shares', type: 'usetf', industry: '債券/避險' },
      { symbol: 'SOXX', name: 'iShares Semiconductor ETF', type: 'usetf', industry: '產業特色ETF' },
      { symbol: 'ARKK', name: 'ARK Innovation ETF', type: 'usetf', industry: '產業特色ETF' },
      
      { symbol: '00713.TW', name: '元大台灣高息低波', type: 'twetf', industry: '台股特色ETF' },
      { symbol: '00881.TW', name: '國泰台灣5G+', type: 'twetf', industry: '台股特色ETF' },
      { symbol: '00757.TW', name: '統一 FANG+', type: 'twetf', industry: '台股特色ETF' },
      
      { symbol: '2409.TW', name: '友達', type: 'tw', industry: '面板/硬體' },
      { symbol: '3481.TW', name: '群創', type: 'tw', industry: '面板/硬體' },
      { symbol: '2542.TW', name: '興富發', type: 'tw', industry: '營建/內需' },
      { symbol: 'SLB', name: 'Schlumberger', type: 'us', industry: '能源/工業' },
      { symbol: 'SBUX', name: 'Starbucks', type: 'us', industry: '消費零售' },
    ],
    // Volatile market data fetched from remote
    marketData: {},
    // Cached sentiment index
    sentiment: null,
    sentimentFetchedAt: null,

    // ── Asset Ledger (記帳 / 資產管理) ────────────────────────
    assets: {
      bank:      [], // { id, name, type:'活存'|'定存'|'外幣', amount, currency?, orgAmount? }
      stock:     [], // { id, symbol, name, shares, cost }  — price auto-synced from marketData
      precious:  [], // { id, metalKey:'gold'|'silver'|'platinum', name, weight, unit:'oz'|'g'|'qian'|'tael', cost, amount }
      insurance: [], // { id, name, company, amount, note }
      other:     [], // { id, name, amount, note }
      loan:      []  // { id, name, amount, rate, note }
    },
    ledger:           [], // { id, date, type:'income'|'expense', category, amount, note }
    metalPrices:      null, // { gold, silver, platinum, twdRate, updatedAt }
    metalPricesFetchedAt: null,
    liveRates:        null, // { USD, JPY, EUR, CNY, HKD } each = 1 unit in TWD
    liveRatesFetchedAt: null
  };

  let data = null;

  function load() {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        data = { ...DEFAULTS, ...parsed };
        data.settings = { ...DEFAULTS.settings, ...parsed.settings };
        
        // Use parsed watchlist if it exists (even if empty)
        if (parsed.watchlist !== undefined) {
          data.watchlist = parsed.watchlist;
        } else {
          data.watchlist = DEFAULTS.watchlist;
        }

        data.marketData = parsed.marketData || {};
        data.exchangeRate = parsed.exchangeRate || 31.5;
        // Load asset ledger
        data.assets = parsed.assets ? {
          bank:      parsed.assets.bank      || [],
          stock:     parsed.assets.stock     || [],
          precious:  parsed.assets.precious  || [],
          insurance: parsed.assets.insurance || [],
          other:     parsed.assets.other     || [],
          loan:      parsed.assets.loan      || []
        } : DEFAULTS.assets;
        data.ledger              = parsed.ledger              || [];
        data.metalPrices         = parsed.metalPrices         || null;
        data.metalPricesFetchedAt= parsed.metalPricesFetchedAt|| null;
        data.liveRates           = parsed.liveRates           || null;
        data.liveRatesFetchedAt  = parsed.liveRatesFetchedAt  || null;
      } catch (e) {
        data = { ...DEFAULTS };
      }
    } else {
      data = { ...DEFAULTS };
    }
    save();
  }

  function save() {
    if (!data) return;
    localStorage.setItem(LS_KEY, JSON.stringify({
      settings: data.settings,
      holdings: data.holdings,
      watchlist: data.watchlist,
      stockNotes: data.stockNotes,
      sentiment: data.sentiment,
      sentimentFetchedAt: data.sentimentFetchedAt,
      exchangeRate: data.exchangeRate,
      marketData: data.marketData,
      assets: data.assets,
      ledger: data.ledger,
      metalPrices: data.metalPrices,
      metalPricesFetchedAt: data.metalPricesFetchedAt,
      liveRates: data.liveRates,
      liveRatesFetchedAt: data.liveRatesFetchedAt
    }));
  }

  function get() {
    if (!data) load();

    // Automatically keep cashAssets and totalAssets in sync if cashMode is 'auto'
    if (data.settings && data.settings.cashMode === 'auto' && window.YC && YC.ledgerPage && typeof YC.ledgerPage.calcTotals === 'function') {
      try {
        const t = YC.ledgerPage.calcTotals();
        const calculatedCash = (t.bank || 0) + (t.precious || 0) + (t.insurance || 0) + (t.other || 0) - (t.loan || 0);
        if (data.settings.cashAssets !== calculatedCash) {
          data.settings.cashAssets = calculatedCash;
          
          // Re-calculate totalAssets as well
          if (window.YC.portfolio && typeof window.YC.portfolio.getEnriched === 'function') {
            const holdings = window.YC.portfolio.getEnriched();
            const equity = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
            data.settings.totalAssets = calculatedCash + equity;
          }
          save();
        }
      } catch (e) {
        console.warn('[State] Dynamic cashAssets calculation failed:', e.message);
      }
    }

    return data;
  }

  function patch(obj) {
    if (!data) load();
    data = { ...data, ...obj };
    save();
  }

  function setSettings(newSettings) {
    data.settings = { ...data.settings, ...newSettings };
    save();
  }

  function setHoldings(newHoldings) {
    data.holdings = newHoldings;
    save();
  }

  function addHolding(item) {
    if (!data) load();
    // Check if already exists to avoid duplicates
    const idx = data.holdings.findIndex(h => h.symbol === item.symbol);
    if (idx >= 0) {
      data.holdings[idx] = { ...data.holdings[idx], ...item };
    } else {
      data.holdings.push(item);
    }
    save();
  }

  function updateHolding(symbol, updates) {
    if (!data) load();
    const idx = data.holdings.findIndex(h => h.symbol === symbol);
    if (idx >= 0) {
      data.holdings[idx] = { ...data.holdings[idx], ...updates };
      save();
    }
  }

  function getMarketData(symbol) {
    return data.marketData[symbol] || null;
  }

  function setMarketData(symbol, mkt) {
    data.marketData[symbol] = {
      ...mkt,
      lastUpdated: Date.now()
    };
  }

  function isStale(symbol) {
    const mkt = data.marketData[symbol];
    if (!mkt || !mkt.lastUpdated) return true;
    return (Date.now() - mkt.lastUpdated) > 300000; // 5 mins
  }

  function getNote(symbol) {
    return data.stockNotes[symbol] || '';
  }

  function saveNote(symbol, text) {
    if (!data) load();
    data.stockNotes[symbol] = text;
    save();
  }

  // --- Backup & Migration ---
  function exportJSON() {
    const raw = get();
    const str = JSON.stringify(raw, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ARK_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          if (json.settings || json.holdings) {
            patch(json);
            resolve(true);
          } else {
            reject('無效的備份檔案格式');
          }
        } catch (err) {
          reject('檔案讀取失敗');
        }
      };
      reader.readAsText(file);
    });
  }

  const EXPENSE_RATIOS = {
      'VOO': 0.03, 'VTI': 0.03, 'IVV': 0.03, 'SPY': 0.09, 'QQQ': 0.20,
      'TLT': 0.15, 'GLD': 0.40, 'SOXX': 0.35, 'ARKK': 0.75,
      '0050.TW': 0.43, '0056.TW': 0.74, '00878.TW': 0.25, '00919.TW': 0.30,
      '00929.TW': 0.30, '00713.TW': 0.38, '00881.TW': 0.35, '00757.TW': 0.65,
      '00924.TW': 0.45, '00915.TW': 0.35, '00918.TW': 0.30
  };

  // ── Asset Ledger helpers ────────────────────────────────────────────
  function getAssets() {
    if (!data) load();
    return data.assets;
  }

  function saveAssets(assets) {
    if (!data) load();
    data.assets = assets;
    save();
  }

  function getLedger() {
    if (!data) load();
    return data.ledger || [];
  }

  function saveLedger(entries) {
    if (!data) load();
    data.ledger = entries;
    save();
  }

  function getMetalPrices() {
    if (!data) load();
    return data.metalPrices || null;
  }

  function setMetalPrices(prices) {
    if (!data) load();
    data.metalPrices = prices;
    data.metalPricesFetchedAt = Date.now();
    save();
  }

  function isMetalPricesStale() {
    if (!data) load();
    if (!data.metalPricesFetchedAt) return true;
    return (Date.now() - data.metalPricesFetchedAt) > 5 * 60 * 1000; // 5 mins
  }

  function getLiveRates() {
    if (!data) load();
    return data.liveRates || null;
  }

  function setLiveRates(rates) {
    if (!data) load();
    data.liveRates = rates;
    data.liveRatesFetchedAt = Date.now();
    save();
  }

  function isRatesStale() {
    if (!data) load();
    if (!data.liveRatesFetchedAt) return true;
    return (Date.now() - data.liveRatesFetchedAt) > 5 * 60 * 1000; // 5 mins
  }

  return {
    get, patch, setSettings, setHoldings, addHolding, updateHolding,
    setMarketData, getMarketData, isStale,
    getNote, saveNote, save, exportJSON, importJSON, EXPENSE_RATIOS,
    getAssets, saveAssets, getLedger, saveLedger,
    getMetalPrices, setMetalPrices, isMetalPricesStale,
    getLiveRates, setLiveRates, isRatesStale
  };
})();