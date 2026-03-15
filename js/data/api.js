/* ================================================
   api.js — Market Data API Layer
   Sources: Yahoo Finance (CORS proxy)
   ================================================ */

YC.api = (() => {
    const API_BASE = '/api';

    /* ── Yahoo Finance Quote ───────────────────────── */
    async function getYahooQuote(symbol) {
        try {
            const res = await fetch(`${API_BASE}/quote/${encodeURIComponent(symbol)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            const meta = json.meta;
            const history = json.history || [];

            const price = meta.regularMarketPrice;
            const prevClose = meta.previousClose || price;
            const change = price - prevClose;
            const changePct = (change / prevClose) * 100;

            let displayName = meta.longName || meta.shortName || symbol;
            
            // Local fallback for common TW stocks/ETFs
            const TW_NAMES = {
                '00924.TW': '復華美國標普500低波動高股息',
                '0050.TW': '元大台灣50',
                '0056.TW': '元大高股息',
                '00878.TW': '國泰永續高股息',
                '00919.TW': '群益台灣精選高息',
                '00929.TW': '復華台灣科技優息',
                '00713.TW': '元大台灣高息低波'
            };

            if (symbol.endsWith('.TW')) {
                if (TW_NAMES[symbol]) {
                    displayName = TW_NAMES[symbol];
                }
                const localMeta = YC.state.get().watchlist.find(w => w.symbol === symbol);
                if (localMeta && localMeta.name && localMeta.name !== symbol.replace('.TW','')) {
                    displayName = localMeta.name;
                }
            }

            return {
                symbol,
                name: displayName,
                price,
                prevClose,
                change,
                changePct,
                high52w: meta.fiftyTwoWeekHigh,
                low52w: meta.fiftyTwoWeekLow,
                ma50: meta.fiftyDayAverage,
                ma200: meta.twoHundredDayAverage,
                dayHigh: meta.dayHigh,
                dayLow: meta.dayLow,
                volume: meta.regularMarketVolume,
                avgVolume: meta.averageDailyVolume10Day || meta.regularMarketVolume,
                pe: meta.trailingPE,
                pb: meta.priceToBook,
                eps: meta.trailingEps,
                mktCap: meta.marketCap,
                divYield: meta.dividendYield,
                sector: meta.sector,
                industry: meta.industry || meta.sector,
                currency: meta.currency || 'USD',
                exchangeName: meta.exchangeName || '',
                history,
                fetchedAt: Date.now(),
            };
        } catch (err) {
            console.warn(`Yahoo quote failed for ${symbol}:`, err.message);
            return null;
        }
    }

    /* ── Batch Quote (multiple symbols) ────────────── */
    async function batchQuotes(symbols) {
        try {
            const res = await fetch(`${API_BASE}/batch?symbols=${symbols.map(encodeURIComponent).join(',')}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const results = await res.json() || [];
            const dataArr = Array.isArray(results) ? results : Object.values(results);
            const map = {};

            for (const q of dataArr) {
                if (!q || !q.symbol) continue;
                const ticker = q.symbol;
                const isTW = ticker.endsWith('.TW');

                const price = q.regularMarketPrice || q.price || 0;
                const prevClose = q.regularMarketPreviousClose || q.previousClose || price;
                const change = q.regularMarketChange != null ? q.regularMarketChange : (price - prevClose);
                const changePct = q.regularMarketChangePercent != null ? q.regularMarketChangePercent : (prevClose !== 0 ? (change / prevClose * 100) : 0);

                const localMeta = YC.state.get().watchlist.find(w => w.symbol === ticker);
                
                // Fallback for names
                const TW_NAMES = {
                    '00924.TW': '復華美國標普500低波動高股息',
                    '0050.TW': '元大台灣50',
                    '0056.TW': '元大高股息',
                    '00878.TW': '國泰永續高股息',
                    '00919.TW': '群益台灣精選高息',
                    '00929.TW': '復華台灣科技優息',
                    '00713.TW': '元大台灣高息低波'
                };

                let displayName = q.longName || q.shortName || q.displayName || q.symbol;
                if (isTW) {
                    if (TW_NAMES[ticker]) displayName = TW_NAMES[ticker];
                    if (localMeta && localMeta.name && localMeta.name !== ticker.replace('.TW','')) {
                        displayName = localMeta.name;
                    }
                }

                map[ticker] = {
                    symbol: ticker,
                    name: displayName,
                    price,
                    prevClose,
                    change,
                    changePct,
                    high52w: q.fiftyTwoWeekHigh,
                    low52w: q.fiftyTwoWeekLow,
                    ma50: q.fiftyDayAverage,
                    ma200: q.twoHundredDayAverage,
                    dayHigh: q.regularMarketDayHigh,
                    dayLow: q.regularMarketDayLow,
                    pe: q.trailingPE || q.forwardPE,
                    pb: q.priceToBook,
                    divYield: q.dividendYield,
                    mktCap: q.marketCap,
                    volume: q.regularMarketVolume,
                    avgVolume: q.averageDailyVolume10Day || q.averageDailyVolume3Month,
                    sector: q.sector,
                    industry: q.industry || q.sector,
                    currency: q.currency || 'USD',
                    history: [],
                    fetchedAt: Date.now(),
                };
            }
            return map;
        } catch (err) {
            console.warn('Batch quote failed:', err.message);
            return {};
        }
    }

    /* ── Fear & Greed Index (Alternative.me) ───────── */
    async function getFearGreedIndex() {
        try {
            const url = 'https://api.alternative.me/fng/?limit=1&format=json';
            const res = await fetch(url);
            const json = await res.json();
            const val = parseInt(json?.data?.[0]?.value || 50);
            const label = json?.data?.[0]?.value_classification || '';
            return { value: val, label };
        } catch {
            return { value: 50, label: 'Neutral', estimated: true };
        }
    }

    /* ── VIX (Volatility / Fear proxy) ─────────────── */
    async function getVIX() {
        try {
            const batchUrl = `${API_BASE}/batch?symbols=^VIX`;
            const res = await fetch(batchUrl);
            const json = await res.json();
            const vix = json?.[0]?.regularMarketPrice;
            return vix || 20;
        } catch {
            return 20;
        }
    }

    /* ── Single Stock Fetch (with cache check) ─────── */
    async function fetchStock(symbol) {
        const cached = YC.state.getMarketData(symbol);
        // Always re-fetch if history is missing (batch quotes don't include history)
        const hasHistory = cached && cached.history && cached.history.length > 1;
        if (hasHistory && !YC.state.isStale(symbol)) {
            return cached;
        }
        const data = await getYahooQuote(symbol);
        if (data) YC.state.setMarketData(symbol, data);
        return data;
    }

    /* ── Exchange Rate Fetching (TWD/USD) ──────────── */
    async function getExchangeRate() {
        try {
            const res = await fetch(`${API_BASE}/quote/TWD=X`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const rate = json.meta?.regularMarketPrice;
            if (rate) YC.state.patch({ exchangeRate: rate });
            return rate;
        } catch (err) {
            console.warn('Exchange rate fetch failed:', err.message);
            // Dynamic fallback: if we have holdings in different currencies, we need a rate
            return YC.state.get().exchangeRate || 31.5;
        }
    }

    /* ── Backtest Endpoint ─────────────────────────── */
    async function getBacktest(symbol, yearsBack = 2) {
        try {
            const res = await fetch(`${API_BASE}/backtest/${symbol}?years=${yearsBack}`);
            if (!res.ok) throw new Error('Backtest failed');
            return await res.json();
        } catch (err) {
            console.warn('Backtest error:', err.message);
            return null;
        }
    }

    return {
        getYahooQuote,
        batchQuotes,
        getFearGreedIndex,
        getVIX,
        fetchStock,
        getBacktest,
        getExchangeRate
    };
})();