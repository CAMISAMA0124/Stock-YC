/* ================================================
   indicators.js — Technical Indicator Calculations
   RSI | Moving Averages | Percentile | Temperature Score
   ================================================ */

YC.indicators = (() => {

    /* ── RSI (Relative Strength Index) ─────────────── */
    function rsi(prices, period = 14) {
        if (!prices || prices.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const d = prices[i] - prices[i - 1];
            if (d > 0) gains += d; else losses -= d;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        for (let i = period + 1; i < prices.length; i++) {
            const d = prices[i] - prices[i - 1];
            const g = d > 0 ? d : 0;
            const l = d < 0 ? -d : 0;
            avgGain = (avgGain * (period - 1) + g) / period;
            avgLoss = (avgLoss * (period - 1) + l) / period;
        }
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return Math.round(100 - (100 / (1 + rs)));
    }

    /* ── Simple Moving Average ─────────────────────── */
    function sma(prices, period) {
        if (!prices || prices.length < period) return null;
        const slice = prices.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / period;
    }

    /* ── MA Deviation % ───────────────────────────── */
    function maDeviation(price, ma) {
        if (!ma || ma === 0 || !price) return null;
        return ((price - ma) / ma) * 100;
    }

    /* ── 52-Week Percentile ────────────────────────── */
    function percentile52w(price, high52w, low52w) {
        if (!high52w || !low52w || !price || high52w === low52w) return null;
        const p = ((price - low52w) / (high52w - low52w)) * 100;
        return Math.max(0, Math.min(100, p));
    }

    /* ── Volume Surge Score ────────────────────────── */
    function volumeSurgeScore(volume, avgVolume) {
        if (!avgVolume || avgVolume === 0) return 50;
        const ratio = volume / avgVolume;
        return Math.max(0, Math.min(100, ratio * 50));
    }

    /* ── IBS (Internal Bar Strength) ───────────────── */
    // Formula: (Close - Low) / (High - Low)
    function calculateIBS(close, high, low) {
        if (!close || !high || !low || high === low) return null;
        const ibs = (close - low) / (high - low);
        return Math.max(0, Math.min(1, ibs));
    }

    /* ── Max Drawdown (MDD) ────────────────────────── */
    function calculateMDD(prices) {
        if (!prices || prices.length < 2) return 0;
        let peak = prices[0];
        let maxDrawdown = 0;
        
        for (let i = 1; i < prices.length; i++) {
            const p = prices[i];
            if (p > peak) {
                peak = p;
            } else {
                const dd = (peak - p) / peak;
                if (dd > maxDrawdown) {
                    maxDrawdown = dd;
                }
            }
        }
        return (maxDrawdown * 100).toFixed(2);
    }

    /* ── Composite Temperature Score ───────────────── */
    function temperatureScore(data) {
        const { price, high52w, low52w, ma200, ma50, history, changePct } = data;
        const closes = (history || []).map(h => h.c).filter(Boolean);

        const rsiVal = closes.length >= 15 ? rsi(closes) : estimateRSI(price, ma50, ma200, changePct);

        let maScore = null;
        if (ma200 && price) {
            const dev = maDeviation(price, ma200);
            maScore = Math.max(0, Math.min(100, (dev + 40) / 80 * 100));
        } else if (ma50 && price) {
            const dev = maDeviation(price, ma50);
            maScore = Math.max(0, Math.min(100, (dev + 25) / 50 * 100));
        }

        let pctScore = null;
        if (high52w && low52w && price) {
            pctScore = percentile52w(price, high52w, low52w);
        }

        let weightedSum = 0;
        let totalWeight = 0;

        if (rsiVal != null) { weightedSum += rsiVal * 0.35; totalWeight += 0.35; }
        if (maScore != null) { weightedSum += maScore * 0.35; totalWeight += 0.35; }
        if (pctScore != null) { weightedSum += pctScore * 0.30; totalWeight += 0.30; }

        if (totalWeight < 0.1) return 50; // Truly no data
        const finalScore = Math.round(Math.max(0, Math.min(100, weightedSum / totalWeight)));
        
        // If it's EXACTLY 50, but we have some data, shift i slightly to 51 to show it's working
        // or just return it as is. Let's keep it as is.
        return finalScore;
    }

    function estimateRSI(price, ma50, ma200, changePct = 0) {
        if (!price) return null;
        const ref = ma200 || ma50;
        if (ref) {
            const dev = maDeviation(price, ref);
            return Math.max(20, Math.min(80, 50 + dev * 1.2));
        }
        // Fallback: use today's change to nudge from 50
        if (changePct && changePct !== 0) {
            return Math.max(30, Math.min(70, 50 + changePct * 2.0));
        }
        return null;
    }

    /* ── Classify Temperature Zone ─────────────────── */
    function classify(score) {
        if (score <= 30) return { zone: 0, cls: 'tc0', label: '價值區', color: 'var(--t0)', icon: '❄️', cardClass: 'tc0' };
        if (score <= 60) return { zone: 1, cls: 'tc1', label: '冷靜區', color: 'var(--t1)', icon: '🍃', cardClass: 'tc1' };
        if (score <= 80) return { zone: 2, cls: 'tc2', label: '偏熱區', color: 'var(--t2)', icon: '🔥', cardClass: 'tc2' };
        return { zone: 3, cls: 'tc3', label: '過熱區', color: 'var(--t3)', icon: '🌋', cardClass: 'tc3' };
    }

    /* ── Get initials for avatar ───────────────────── */
    function getInitials(name, symbol) {
        if (!name || typeof name !== 'string') return symbol ? String(symbol).slice(0, 2).toUpperCase() : '??';
        const cleaned = name.trim();
        if (!cleaned) return symbol ? String(symbol).slice(0, 2).toUpperCase() : '??';
        if (/[\u4e00-\u9fff]/.test(cleaned)) return cleaned.slice(0, 2);
        const words = cleaned.split(/\s+/).filter(Boolean);
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return cleaned.slice(0, 2).toUpperCase();
    }

    return {
        rsi,
        calculateRSI: rsi,
        sma,
        calculateMA: sma,
        calculateIBS,
        maDeviation,
        percentile52w,
        volumeSurgeScore,
        temperatureScore,
        classify,
        getInitials,
        calculateMDD
    };
})();