/* ================================================
   metals.js — Precious Metals Price Module
   ================================================
   Sources: /api/metals (Yahoo Finance GC=F / SI=F / PL=F)
   Unit support: oz | g | qian(台錢) | tael(台兩)
   Converts to 銀樓牌價 (retail reference price)
   ================================================ */

YC.metals = (() => {

    const STALE_MS = 5 * 60 * 1000; // 5 minutes

    // Unit → grams multiplier
    const UNIT_TO_GRAM = {
        oz:   31.1035,
        g:    1,
        qian: 3.75,   // 台錢
        tael: 37.5    // 台兩 (= 10 台錢)
    };

    // Display labels
    const UNIT_LABELS = {
        oz: '盎司', g: '公克', qian: '台錢', tael: '台兩'
    };

    const METAL_INFO = {
        gold:     { label: '黃金', emoji: '🥇', color: '#FFD60A' },
        silver:   { label: '白銀', emoji: '🥈', color: '#C0C0C0' },
        platinum: { label: '白金', emoji: '💎', color: '#A8E6FF' }
    };

    /* ── Fetch from server ──────────────────────────── */
    async function fetchPrices(forceRefresh = false) {
        // Return cached if fresh
        if (!forceRefresh && !YC.state.isMetalPricesStale()) {
            return YC.state.getMetalPrices();
        }
        try {
            const res = await fetch('/api/metals');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.success) {
                YC.state.setMetalPrices(data);
                return data;
            }
            throw new Error(data.error || 'Unknown error');
        } catch (err) {
            console.warn('[Metals] Fetch failed, using cache:', err.message);
            return YC.state.getMetalPrices() || null;
        }
    }

    /* ── Get current price object for one metal ────── */
    function getPrice(metalKey) {
        const prices = YC.state.getMetalPrices();
        return prices ? prices[metalKey] : null;
    }

    /* ── Calculate TWD value of a precious metal item ─
       item: { metalKey, weight, unit, customPrice? }
       customPrice: override USD/oz (optional)
    ─────────────────────────────────────────────────── */
    function calcValueTWD(item) {
        const prices = YC.state.getMetalPrices();
        if (!prices) return 0;

        const metalData = prices[item.metalKey];
        if (!metalData) return 0;

        const weightGrams = (item.weight || 0) * (UNIT_TO_GRAM[item.unit] || 1);

        // Use custom override price if provided
        let twdPerGram = metalData.twdPerGram;
        if (item.customPriceUSD && item.customPriceUSD > 0) {
            const twdRate = prices.twdRate || 32.5;
            twdPerGram = (item.customPriceUSD * twdRate) / 31.1035;
        }

        return Math.round(weightGrams * twdPerGram);
    }

    /* ── Price display string (銀樓牌價 reference) ──── */
    function formatPriceLabel(metalKey, unit) {
        const prices = YC.state.getMetalPrices();
        if (!prices) return '載入中…';
        const m = prices[metalKey];
        if (!m) return '—';
        const unitLabel = UNIT_LABELS[unit] || unit;
        let twdPrice;
        if (unit === 'oz')   twdPrice = m.twdPerOz;
        if (unit === 'g')    twdPrice = m.twdPerGram;
        if (unit === 'qian') twdPrice = m.twdPerQian;
        if (unit === 'tael') twdPrice = m.twdPerTael;
        if (!twdPrice) twdPrice = m.twdPerGram;
        return `$${twdPrice.toLocaleString()} / ${unitLabel}`;
    }

    return {
        fetchPrices,
        getPrice,
        calcValueTWD,
        formatPriceLabel,
        UNIT_TO_GRAM,
        UNIT_LABELS,
        METAL_INFO
    };
})();
