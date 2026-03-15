// YC/backtest.js
const calculateSMA = (data, window) => {
    if (data.length < window) return null;
    const slice = data.slice(0, window);
    const sum = slice.reduce((acc, val) => acc + val, 0);
    return sum / window;
};

const calculateEMA = (data, window) => {
    if (data.length === 0) return [];
    const k = 2 / (window + 1);
    let emaArray = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
    }
    return emaArray;
};

const calculateRSI = (prices, period = 14) => {
    if (prices.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    for (let i = period + 1; i < prices.length; i++) {
        const d = prices[i] - prices[i - 1];
        const g = d > 0 ? d : 0;
        const l = d < 0 ? -d : 0;
        avgGain = (avgGain * (period - 1) + g) / period;
        avgLoss = (avgLoss * (period - 1) + l) / period;
    }
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

const calculateKD = (quotes, period = 9) => {
    if (quotes.length < period) return { k: 50, d: 50 };
    let k = 50, d = 50;
    for (let i = 0; i < quotes.length; i++) {
        const windowStart = Math.max(0, i - period + 1);
        const windowSlice = quotes.slice(windowStart, i + 1);
        const lows = windowSlice.map(q => q.low || q.l || q.useLow);
        const highs = windowSlice.map(q => q.high || q.h || q.useHigh);
        const close = quotes[i].close || quotes[i].c || quotes[i].useClose;
        const minLow = Math.min(...lows);
        const maxHigh = Math.max(...highs);
        let rsv = 50;
        if (maxHigh !== minLow) {
            rsv = ((close - minLow) / (maxHigh - minLow)) * 100;
        }
        k = (2 / 3) * k + (1 / 3) * rsv;
        d = (2 / 3) * d + (1 / 3) * k;
    }
    return { k, d };
};

const calculateMACD = (prices) => {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = [];
    for (let i = 0; i < prices.length; i++) {
        macdLine.push(ema12[i] - ema26[i]);
    }
    const signalLine = calculateEMA(macdLine, 9);
    const lastIndex = prices.length - 1;
    const macd = macdLine[lastIndex];
    const signal = signalLine[lastIndex];
    const histogram = macd - signal;
    const prevHist = (lastIndex > 0 ? (macdLine[lastIndex - 1] - signalLine[lastIndex - 1]) : 0);
    return { macd, signal, histogram, prevHist };
};

async function generateBacktest(yahooFinance, symbol, yearsBack = 2) {
    const p1 = new Date();
    p1.setFullYear(p1.getFullYear() - (yearsBack + 1));
    const period1Str = p1.toISOString().split('T')[0];
    const period2Str = new Date().toISOString().split('T')[0];

    // Use historical() with AbortSignal timeout to prevent hanging
    const quotesRaw = await yahooFinance.historical(symbol, {
        period1: period1Str,
        period2: period2Str,
        interval: '1d'
    }, {
        fetchOptions: { signal: AbortSignal.timeout(18000) }
    });


    if (!quotesRaw || quotesRaw.length < 100) {
        throw new Error(`Insufficient data for ${symbol} (got ${quotesRaw?.length || 0} days)`);
    }


    const history = quotesRaw
        .filter(q => q && q.close != null)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const fullAdjustedHistory = history.map(h => {
        const c = h.adjClose || h.close;
        const r = h.close ? (c / h.close) : 1;
        return {
            date: h.date,
            useClose: c,
            useHigh: (h.high || h.close) * r,
            useLow: (h.low || h.close) * r
        };
    });


    // --- Pre-calculate Indicators for the whole history ---
    const allCloses = fullAdjustedHistory.map(h => h.useClose);
    for (let i = 0; i < fullAdjustedHistory.length; i++) {
        if (i >= 49) {
            fullAdjustedHistory[i].ma50 = calculateSMA(allCloses.slice(i - 49, i + 1), 50);
        }
        if (i >= 199) {
            fullAdjustedHistory[i].ma200 = calculateSMA(allCloses.slice(i - 199, i + 1), 200);
        }
    }

    let signals = [];
    const MIN_SCORE = 4.0; 

    // 1st Pass: Mean Reversion (Deep Dips)
    for (let i = 200; i < fullAdjustedHistory.length - 90; i++) {
        const currentSlice = fullAdjustedHistory.slice(0, i + 1);
        const currentCloses = currentSlice.map(h => h.useClose);
        const currentPrice = currentCloses[currentCloses.length - 1];
        
        const ma120 = fullAdjustedHistory[i].ma50; // Using MA50 as local floor
        const ma200 = fullAdjustedHistory[i].ma200;
        const rsi = calculateRSI(currentCloses, 14);
        const macdData = calculateMACD(currentCloses);
        const kd = calculateKD(currentSlice, 9);
        const bias200 = ma200 ? ((currentPrice - ma200) / ma200) * 100 : 0;

        let score = 0;
        if (kd.k < 30 && kd.k > kd.d) score += 2;
        if (macdData.histogram < 0 && macdData.histogram > macdData.prevHist) score += 1.5;
        if (rsi < 40) score += 2;
        if (bias200 < -10) score += 2;

        if (score >= MIN_SCORE) {
            recordSignal(signals, fullAdjustedHistory, i, score.toFixed(1));
        }
    }

    // 2nd Pass: Hybrid / Trend Pullback if needed
    let activeStrategy = '逢低加碼';
    if (signals.length < 5) {
        const validDays = fullAdjustedHistory.filter(h => h.ma200);
        const trendDays = validDays.filter(h => h.useClose > h.ma200).length;
        const trendRatio = trendDays / validDays.length;

        if (trendRatio > 0.6) {
            activeStrategy = '強勢拉回';
            for (let i = 200; i < fullAdjustedHistory.length - 90; i++) {
                const h = fullAdjustedHistory[i];
                if (!h.ma50) continue;
                const dist = (h.useClose - h.ma50) / h.ma50;
                
                // Pullback logic: within 2% of MA50 or bounce from it
                if (dist > -0.04 && dist < 0.02) {
                    // Filter: must be in an uptrend (MA50 > MA200)
                    if (h.ma200 && h.ma50 > h.ma200) {
                        recordSignal(signals, fullAdjustedHistory, i, '支撐');
                    }
                }
            }
        }
    }

    // Group signals to avoid clusters (max 1 signal per 10 days)
    signals = filterClusters(signals);

    const stats = {
        totalSignals: signals.length,
        period: `${yearsBack} years`,
        strategy: activeStrategy,
        winRate: calculateWinRate(signals),
        avgReturn: calculateAvgReturn(signals),
        maxDrawdown: { '30d': calculateMDD(signals) }
    };

    const rating = generateRating(symbol, signals, stats.winRate['30d'], stats.avgReturn['30d'], activeStrategy);

    // Statistical Projection (Monte Carlo Lite)
    const projections = calculateProjection(allCloses);

    return {
        symbol,
        statistics: stats,
        rating,
        signals: signals.slice(-5),
        projections
    };
}

function calculateProjection(prices) {
    if (prices.length < 50) return null;
    
    // Calculate daily returns for volatility
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / returns.length);
    
    // Annualized
    const annReturn = (Math.pow(1 + mean, 252) - 1) * 100;
    const annVol = stdDev * Math.sqrt(252) * 100;
    
    // Simple 1-year projection distribution (Gauss)
    const currentPrice = prices[prices.length - 1];
    return {
        annualizedReturn: annReturn.toFixed(2) + '%',
        annualizedVol: annVol.toFixed(2) + '%',
        confidenceInterval: {
            low95: (currentPrice * (1 + (mean * 252) - (2 * stdDev * Math.sqrt(252)))).toFixed(2),
            high95: (currentPrice * (1 + (mean * 252) + (2 * stdDev * Math.sqrt(252)))).toFixed(2),
        }
    };
}

function recordSignal(signals, history, i, score) {
    const buyPrice = history[i].useClose;
    const date = history[i].date;
    const price7d = history[i + 7]?.useClose;
    const price30d = history[i + 30]?.useClose;
    const price90d = history[i + 90]?.useClose;

    let mdd30 = 0;
    for (let j = 1; j <= 30; j++) {
        if (history[i + j]) {
            const drop = (history[i + j].useClose - buyPrice) / buyPrice * 100;
            if (drop < mdd30) mdd30 = drop;
        }
    }

    signals.push({
        date,
        score,
        buyPrice: buyPrice.toFixed(2),
        return7d: price7d ? ((price7d - buyPrice) / buyPrice * 100).toFixed(2) : null,
        return30d: price30d ? ((price30d - buyPrice) / buyPrice * 100).toFixed(2) : null,
        return90d: price90d ? ((price90d - buyPrice) / buyPrice * 100).toFixed(2) : null,
        mdd30: mdd30.toFixed(2)
    });
}

function filterClusters(signals) {
    if (signals.length === 0) return [];
    const filtered = [signals[0]];
    for (let i = 1; i < signals.length; i++) {
        const last = filtered[filtered.length - 1];
        const diff = new Date(signals[i].date) - new Date(last.date);
        if (diff > 10 * 86400000) {
            filtered.push(signals[i]);
        }
    }
    return filtered;
}

function calculateWinRate(signals) {
    const getWr = (key) => {
        const valid = signals.filter(s => s[key] !== null);
        if (valid.length === 0) return 'N/A';
        const wins = valid.filter(s => parseFloat(s[key]) > 0).length;
        return (wins / valid.length * 100).toFixed(1) + '%';
    };
    return { '7d': getWr('return7d'), '30d': getWr('return30d'), '90d': getWr('return90d') };
}

function calculateAvgReturn(signals) {
    const getAvg = (key) => {
        const valid = signals.filter(s => s[key] !== null);
        if (valid.length === 0) return 'N/A';
        const sum = valid.reduce((acc, s) => acc + parseFloat(s[key]), 0);
        return (sum / valid.length).toFixed(2) + '%';
    };
    return { '7d': getAvg('return7d'), '30d': getAvg('return30d'), '90d': getAvg('return90d') };
}

function calculateMDD(signals) {
    const mdds = signals.map(s => parseFloat(s.mdd30)).filter(m => !isNaN(m));
    if (mdds.length === 0) return '0.00%';
    return Math.abs(Math.min(...mdds)).toFixed(2) + '%';
}

function generateRating(symbol, signals, wr30, ar30, strategy) {
    const wr = parseFloat(wr30) || 0;
    const ar = parseFloat(ar30) || 0;
    const count = signals.length;
    
    if (count === 0) {
        return { level: 'steady', label: '長線強勢', color: 'emerald', reason: ['該股極其強勢，幾乎不觸發技術性回檔點位'] };
    }
    
    if (wr >= 65 && ar >= 4) return { level: 'excellent', label: '✅ 非常適合', color: 'green', reason: [`${strategy}勝率 ${wr30}`, `平均獲利 ${ar30}`] };
    if (wr >= 60 || ar >= 2) return { level: 'good', label: '✔️ 可以參考', color: '#eab308', reason: [`歷史表現穩健 (${wr30})`] };
    return { level: 'risky', label: '⚠️ 波動較大', color: 'orange', reason: [`勝率約 ${wr30}，建議嚴格停損`] };
}

module.exports = { generateBacktest };