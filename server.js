const express = require('express');
const cors = require('cors');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const { generateBacktest } = require('./backtest');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Memory storage for device migration (short-lived)
const syncVault = new Map();

// Serve static files from the current directory (frontend)
app.use(express.static(__dirname));

// Fetch history/chart for a symbol
app.get('/api/quote/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;

        // Fetch all data in parallel for speed
        const [quoteResult, summaryResult, chartResult] = await Promise.allSettled([
            yahooFinance.quote(symbol),
            yahooFinance.quoteSummary(symbol, { modules: ['summaryDetail', 'defaultKeyStatistics', 'assetProfile'] }),
            // Restoring chart() with proper Unix timestamp as it is more stable than historical()
            Promise.race([
                yahooFinance.chart(symbol, {
                    period1: Math.floor((Date.now() - 5 * 365 * 24 * 60 * 60 * 1000) / 1000), // 5 years for MDD
                    interval: '1d'
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Chart timeout")), 5000))
            ])
        ]);

        if (quoteResult.status === 'rejected') {
            throw new Error(`Quote failed: ${quoteResult.reason.message}`);
        }

        const quote = quoteResult.value;
        const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : {};
        let rawHistory = [];

        if (chartResult.status === 'fulfilled') {
            rawHistory = chartResult.value?.quotes || [];
        } else {
            console.warn(`Chart fetch failed or timed out for ${symbol}: ${chartResult.reason?.message}`);
        }

        const fundamentals = {
            trailingPE: summary.summaryDetail?.trailingPE || summary.defaultKeyStatistics?.trailingPE,
            priceToBook: summary.defaultKeyStatistics?.priceToBook,
            trailingEps: summary.defaultKeyStatistics?.trailingEps,
            marketCap: summary.summaryDetail?.marketCap,
            dividendYield: summary.summaryDetail?.dividendYield,
            sector: summary.assetProfile?.sector,
            industry: summary.assetProfile?.industry || summary.assetProfile?.sector
        };

        const history = rawHistory
            .filter(q => q && (q.close != null || q.adjClose != null))
            .map(q => ({
                t: new Date(q.date).getTime(),
                o: q.open,
                h: q.high,
                l: q.low,
                c: q.adjClose || q.close, // Use adjClose for consistency if available
                v: q.volume
            }));

        res.json({
            meta: {
                longName: quote.longName,
                shortName: quote.shortName,
                regularMarketPrice: quote.regularMarketPrice,
                previousClose: quote.regularMarketPreviousClose,
                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
                fiftyDayAverage: quote.fiftyDayAverage,
                twoHundredDayAverage: quote.twoHundredDayAverage,
                dayHigh: quote.regularMarketDayHigh,
                dayLow: quote.regularMarketDayLow,
                regularMarketVolume: quote.regularMarketVolume,
                averageDailyVolume10Day: quote.averageDailyVolume10Day,
                ...fundamentals, // Spread fundamentals here
                sector: fundamentals.sector,
                industry: fundamentals.industry,
                currency: quote.currency || 'USD',
                exchangeName: quote.fullExchangeName || quote.exchange
            },
            history: history
        });

    } catch (error) {
        console.error(`Error fetching ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// Deep Financial Analysis (ON DEMAND ONLY)
app.get('/api/finance/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    try {
        const summary = await yahooFinance.quoteSummary(symbol, {
            modules: ['cashflowStatementHistory', 'cashflowStatementHistoryQuarterly', 'financialData', 'defaultKeyStatistics']
        });
        
        const cfYearly = summary.cashflowStatementHistory?.cashflowStatements?.[0] || {};
        const cfQuarterly = summary.cashflowStatementHistoryQuarterly?.cashflowStatements?.[0] || {};
        const cf = Object.keys(cfYearly).length > 0 ? cfYearly : cfQuarterly;
        
        const fin = summary.financialData || {};
        const keys = summary.defaultKeyStatistics || {};

        const financeData = {
            ocf: cf.totalCashFromOperatingActivities ?? fin.operatingCashflow ?? null,
            icf: cf.totalCashflowsFromInvestingActivities ?? null,
            fcf: fin.freeCashflow ?? null,
            roe: fin.returnOnEquity ? fin.returnOnEquity * 100 : null,
            grossMargin: fin.grossMargins ? fin.grossMargins * 100 : null,
            operatingMargin: fin.operatingMargins ? fin.operatingMargins * 100 : null,
            debtToEquity: fin.debtToEquity || null,
            revenueGrowth: fin.revenueGrowth ? fin.revenueGrowth * 100 : null,
            payoutRatio: keys.payoutRatio ? keys.payoutRatio * 100 : null,
            financeTs: Date.now()
        };

        res.json(financeData);
    } catch (err) {
        console.error(`Finance API Error for ${symbol}:`, err.message);
        res.status(500).json({ error: 'Failed to fetch finance data' });
    }
});

// Fetch batch quotes
app.get('/api/batch', async (req, res) => {
    try {
        const symbols = req.query.symbols ? req.query.symbols.split(',') : [];
        if (!symbols.length) return res.json([]);

        // Robust batch fetching: use quote but catch schema validation errors
        // yahoo-finance2 v3 can be-be picky. If it fails, try one by one.
        try {
            const result = await yahooFinance.quote(symbols);
            // Ensure result is always an array
            const arr = Array.isArray(result) ? result : [result];
            res.json(arr);
        } catch (e) {
            console.warn(`Batch failed (${e.message}), falling back to series`);
            const results = [];
            for (const s of symbols) {
                try {
                    const q = await yahooFinance.quote(s);
                    results.push(q);
                } catch (inner) {
                    console.error(`Individual quote failed for ${s}:`, inner.message);
                }
            }
            res.json(results);
        }
    } catch (error) {
        console.error(`Critical batch error:`, error.message);
        res.status(500).json({ error: 'Failed to fetch batch' });
    }
});

// Backtest Endpoint
app.get('/api/backtest/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    const yearsBack = parseInt(req.query.years) || 2;

    const TIMEOUT_MS = 25000;
    let settled = false;
    const timeout = setTimeout(() => {
        if (!settled) {
            settled = true;
            console.warn(`Backtest timeout for ${symbol}`);
            res.status(504).json({ error: 'Backtest timed out', symbol, statistics: { totalSignals: 0, strategy: '逢低加碼', winRate: {}, avgReturn: {}, maxDrawdown: {} }, rating: { level: 'timeout', label: '⏱️ 取得超時', color: 'gray', reason: ['Yahoo Finance 回應緩慢，請稍後重試'] }, signals: [] });
        }
    }, TIMEOUT_MS);

    try {
        const result = await generateBacktest(yahooFinance, symbol, yearsBack);
        if (!settled) {
            settled = true;
            clearTimeout(timeout);
            res.json(result);
        }
    } catch (error) {
        if (!settled) {
            settled = true;
            clearTimeout(timeout);
            console.error(`Backtest error for ${symbol}:`, error.message);
            res.status(500).json({ error: error.message });
        }
    }
});

// --- Device Migration / Sync Endpoints ---

// Push state to vault, return 6-digit code
app.post('/api/sync/push', (req, res) => {
    const state = req.body;
    if (!state || typeof state !== 'object') return res.status(400).json({ error: 'Invalid state' });
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Cleanup expired entries first
    for (const [k, v] of syncVault) {
        if (v.expires < Date.now()) syncVault.delete(k);
    }

    // Hard cap: evict the oldest entry if still over limit
    if (syncVault.size >= 100) {
        const oldestKey = syncVault.keys().next().value;
        syncVault.delete(oldestKey);
        console.warn(`[Sync] Vault full — evicted oldest entry (${oldestKey})`);
    }

    syncVault.set(code, {
        data: state,
        expires: Date.now() + (10 * 60 * 1000) // 10 minutes
    });
    
    console.log(`[Sync] State pushed. Code: ${code}`);
    res.json({ code, expires: 600 });
});

// Pull state using code
app.get('/api/sync/pull/:code', (req, res) => {
    const code = req.params.code;
    const item = syncVault.get(code);
    
    if (!item || item.expires < Date.now()) {
        syncVault.delete(code);
        return res.status(404).json({ error: 'Invalid or expired code' });
    }
    
    const data = item.data;
    syncVault.delete(code); // One-time use
    console.log(`[Sync] State pulled for code: ${code}`);
    res.json(data);
});


// ── Exchange Rates API ───────────────────────────────────────────────────────
// Fetches live TWD cross-rates for all supported currencies from Yahoo Finance
// Symbols: TWD=X (USD/TWD), JPYTWD=X, EURTWD=X, CNYTWD=X, HKDTWD=X
app.get('/api/rates', async (req, res) => {
    try {
        // Yahoo Finance cross-rate symbols (price = 1 foreign unit in TWD)
        const RATE_SYMBOLS = ['TWD=X', 'JPYTWD=X', 'EURTWD=X', 'CNYTWD=X', 'HKDTWD=X'];
        const results = await Promise.allSettled(RATE_SYMBOLS.map(s => yahooFinance.quote(s)));

        const safeRate = (r, fallback) =>
            (r.status === 'fulfilled' && r.value?.regularMarketPrice) ? r.value.regularMarketPrice : fallback;

        // TWD=X gives USD→TWD rate; others give 1 foreign unit in TWD directly
        const usdTwd = safeRate(results[0], 32.0);

        res.json({
            success: true,
            rates: {
                USD: usdTwd,                         // 1 USD = ? TWD
                JPY: safeRate(results[1], usdTwd / 150), // 1 JPY = ? TWD
                EUR: safeRate(results[2], usdTwd * 1.08),// 1 EUR = ? TWD
                CNY: safeRate(results[3], usdTwd / 7.2), // 1 CNY = ? TWD
                HKD: safeRate(results[4], usdTwd / 7.8), // 1 HKD = ? TWD
            },
            updatedAt: Date.now()
        });
    } catch (error) {
        console.error('[Rates API]', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Metals Price API (Gold / Silver / Platinum) ─────────────────────────────
// Fetches futures prices from Yahoo Finance, converts to TWD 銀樓牌價
// Unit conversions: 1 troy oz = 31.1035 g | 1 台錢 = 3.75 g | 1 台兩 = 37.5 g
app.get('/api/metals', async (req, res) => {
    try {
        const SYMBOLS = ['GC=F', 'SI=F', 'PL=F', 'TWD=X'];
        const results = await Promise.allSettled(SYMBOLS.map(s => yahooFinance.quote(s)));

        const safeData = (r, fallback) => {
            if (r.status === 'fulfilled' && r.value) {
                return {
                    price: r.value.regularMarketPrice || fallback,
                    changePercent: r.value.regularMarketChangePercent || 0
                };
            }
            return { price: fallback, changePercent: 0 };
        };

        const goldData     = safeData(results[0], 3300);
        const silverData   = safeData(results[1], 33);
        const platinumData = safeData(results[2], 1000);
        const twdRate      = safeData(results[3], 32.5).price;

        // 銀樓牌價 markup (retail spread above spot)
        const RETAIL_MARKUP = { gold: 1.015, silver: 1.05, platinum: 1.05 };
        const OZ_TO_G = 31.1035;
        const G_TO_QIAN = 1 / 3.75;   // 台錢
        const G_TO_TAEL = 1 / 37.5;   // 台兩

        function buildMetal(data, markup) {
            const usdPerOz = data.price;
            const twdPerOz   = usdPerOz * twdRate * markup;
            const twdPerGram = twdPerOz / OZ_TO_G;
            return {
                usdPerOz:   Math.round(usdPerOz * 100) / 100,
                changePercent: data.changePercent,
                twdPerOz:   Math.round(twdPerOz),
                twdPerGram: Math.round(twdPerGram),
                twdPerQian: Math.round(twdPerGram / G_TO_QIAN),   // per 台錢
                twdPerTael: Math.round(twdPerGram / G_TO_TAEL),   // per 台兩
            };
        }

        res.json({
            success:    true,
            twdRate,
            gold:       buildMetal(goldData,     RETAIL_MARKUP.gold),
            silver:     buildMetal(silverData,   RETAIL_MARKUP.silver),
            platinum:   buildMetal(platinumData, RETAIL_MARKUP.platinum),
            updatedAt:  Date.now(),
            note: '銀樓牌價為現貨加成約1.5–5%，僅供參考，以各銀樓實際公告為準'
        });
    } catch (error) {
        console.error('[Metals API]', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Taiwan Stock Chinese Name API ────────────────────────────────────────────
// Fetches Chinese stock names from TWSE & TPEx OpenAPI with 24-hour memory cache.
// Merges TWSE (上市) and TPEx (上櫃) into a single code→name map.
let twNameCache = null;
let twNameCacheTime = 0;

async function fetchTWNameCache() {
    const now = Date.now();
    // Return early if cache is still fresh (24 hours)
    if (twNameCache && (now - twNameCacheTime) < 24 * 60 * 60 * 1000) {
        return twNameCache;
    }

    const map = {};

    try {
        const [twseRes, tpexRes] = await Promise.allSettled([
            fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
            fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes')
        ]);

        // TWSE listed stocks (上市)
        if (twseRes.status === 'fulfilled' && twseRes.value.ok) {
            const data = await twseRes.value.json();
            for (const item of data) {
                if (item.Code && item.Name) {
                    map[item.Code.trim()] = item.Name.trim();
                }
            }
            console.log(`[TW Names] TWSE: loaded ${Object.keys(map).length} entries`);
        } else {
            console.warn('[TW Names] TWSE fetch failed or non-OK');
        }

        // TPEx OTC stocks (上櫃)
        if (tpexRes.status === 'fulfilled' && tpexRes.value.ok) {
            const data = await tpexRes.value.json();
            const before = Object.keys(map).length;
            for (const item of data) {
                // TPEx uses 'SecuritiesCompanyCode' and 'CompanyName'
                const code = (item.SecuritiesCompanyCode || item.Code || '').trim();
                const name = (item.CompanyName || item.Name || '').trim();
                if (code && name) map[code] = name;
            }
            console.log(`[TW Names] TPEx: added ${Object.keys(map).length - before} entries`);
        } else {
            console.warn('[TW Names] TPEx fetch failed or non-OK');
        }
    } catch (e) {
        console.warn('[TW Names] Cache fetch error:', e.message);
    }

    if (Object.keys(map).length > 0) {
        twNameCache = map;
        twNameCacheTime = now;
    }

    return map;
}

// Pre-warm the cache on startup in background (non-blocking)
fetchTWNameCache().catch(() => {});

app.get('/api/twname/:symbol', async (req, res) => {
    // Accept both "2330" and "2330.TW" formats
    const code = req.params.symbol.replace(/\.TW$/i, '').trim();
    try {
        const nameMap = await fetchTWNameCache();
        const name = nameMap[code] || null;
        res.json({ success: !!name, code, name });
    } catch (error) {
        console.error('[TW Name API]', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`⚡ YC Local API Server is running on http://localhost:${PORT}`);
    console.log(`This server uses 'yahoo-finance2' to bypass blocks and provide clean data to your frontend.`);
});