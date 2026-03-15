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

// Simple Visitor Counter (In-memory for basic tracking, consider KV for production)
let totalVisitors = 0;
const activeUsers = new Set();

// Serve static files from the current directory (frontend)
app.use(express.static(__dirname));

// Fetch history/chart for a symbol
app.get('/api/quote/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;

        // Fetch all data in parallel for speed
        const [quoteResult, summaryResult, chartResult] = await Promise.allSettled([
            yahooFinance.quote(symbol),
            yahooFinance.quoteSummary(symbol, { modules: ['summaryDetail', 'defaultKeyStatistics'] }),
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
            dividendYield: summary.summaryDetail?.dividendYield
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
    syncVault.set(code, {
        data: state,
        expires: Date.now() + (10 * 60 * 1000) // 10 minutes
    });
    
    // Cleanup expired
    for (const [k, v] of syncVault) {
        if (v.expires < Date.now()) syncVault.delete(k);
    }
    
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

// --- Analytics Endpoint ---
app.get('/api/analytics', (req, res) => {
    totalVisitors++;
    res.json({
        total: totalVisitors,
        active: Math.max(1, activeUsers.size) // Simple active count
    });
});


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`??YC Local API Server is running on http://localhost:${PORT}`);
    console.log(`This server uses 'yahoo-finance2' to bypass blocks and provide clean data to your frontend.`);
});