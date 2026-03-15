/* ================================================
   sentiment.js — 5 Market Sentiment Indicators
   Uses Fear&Greed, VIX, SPY vs MA, momentum, volume
   ================================================ */

YC.sentiment = (() => {

    /* ── Indicator Definitions ─────────────────────── */
    const INDICATORS = [
        { id: 'feargreed', label: '恐懼貪婪指數', icon: '😨', desc: '衡量市場整體情緒。數值越低代表市場恐慌(超賣)，越高代表貪婪(超買)。' },
        { id: 'vix', label: '波動係數 VIX', icon: '📉', desc: '俗稱恐慌指數，反映對未來波動的預期。分數已轉換：越高代表波動越小越安全。' },
        { id: 'position', label: '位階乖離度', icon: '📍', desc: '大盤價格與長期(200日)均線的距離。乖離過大代表長線可能過熱或超跌。' },
        { id: 'momentum', label: '大盤動能', icon: '🚀', desc: '追蹤過去三個月的漲跌幅，判斷目前市場趨勢位於強烈的多頭還是空頭。' },
        { id: 'volume', label: '量能熱度', icon: '📊', desc: '比較近期交易量與平均量。量能熱度高代表資金活水充足、市場參與度高。' },
    ];

    /* ── Compute Score Color ───────────────────────── */
    function scoreColor(score) {
        if (score <= 30) return 'var(--t0)';
        if (score <= 60) return 'var(--t1)';
        if (score <= 80) return 'var(--t2)';
        return 'var(--t3)';
    }

    /* ── Fetch all sentiment indicators ────────────── */
    async function fetchAll() {
        // Check cache (10 min)
        const state = YC.state.get();
        if (state.sentiment && state.sentimentFetchedAt) {
            if (Date.now() - state.sentimentFetchedAt < 10 * 60 * 1000) {
                return state.sentiment;
            }
        }

        const results = await Promise.allSettled([
            fetchFearGreed(),
            fetchVIX(),
            fetchPositionWarming(),
            fetchMomentum(),
            fetchVolumeBreath(),
        ]);

        const indicators = INDICATORS.map((def, i) => {
            const r = results[i];
            const score = r.status === 'fulfilled' ? r.value : 50;
            return {
                ...def,
                score: Math.round(Math.max(0, Math.min(100, score))),
                color: scoreColor(score),
            };
        });

        // Weighted composite (Fear&Greed 25%, VIX 20%, Position 25%, Momentum 20%, Volume 10%)
        const weights = [0.25, 0.20, 0.25, 0.20, 0.10];
        let composite = indicators.reduce((sum, ind, i) => sum + (ind.score || 50) * weights[i], 0);
        
        if (isNaN(composite)) composite = 50;
        composite = Math.round(composite);

        const sentiment = { indicators, composite };
        YC.state.patch({ sentiment, sentimentFetchedAt: Date.now() });
        return sentiment;
    }

    /* ── 1. Fear & Greed Index ─────────────────────── */
    async function fetchFearGreed() {
        try {
            const { value } = await YC.api.getFearGreedIndex();
            return value;
        } catch { return 50; }
    }

    /* ── 2. VIX (inverted) ─────────────────────────── */
    async function fetchVIX() {
        try {
            const vix = await YC.api.getVIX();
            const score = 90 - ((vix - 10) / 30) * 80;
            return Math.max(0, Math.min(100, score));
        } catch { return 50; }
    }

    /* ── 3. Position Warming (SPY vs MA200) ────────── */
    async function fetchPositionWarming() {
        const spyData = YC.state.getMarketData('SPY');
        if (!spyData) return 50;
        const dev = YC.indicators.maDeviation(spyData.price, spyData.ma200);
        return Math.max(0, Math.min(100, 50 + dev * 2.0));
    }

    /* ── 4. Momentum (SPY 3-month return) ──────────── */
    async function fetchMomentum() {
        const spyData = YC.state.getMarketData('SPY');
        if (!spyData || !spyData.history || spyData.history.length < 60) return 50;
        const closes = spyData.history.map(h => h.c);
        const current = closes[closes.length - 1];
        const past = closes[Math.max(0, closes.length - 63)];
        const ret = ((current - past) / past) * 100;
        return Math.max(0, Math.min(100, 50 + ret * 2.0));
    }

    /* ── 5. Volume Breadth ─────────────────────────── */
    async function fetchVolumeBreath() {
        const spyData = YC.state.getMarketData('SPY');
        if (!spyData) return 50;
        return YC.indicators.volumeSurgeScore(spyData.volume, spyData.avgVolume);
    }

    return { fetchAll, INDICATORS, scoreColor };
})();