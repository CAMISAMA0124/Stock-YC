/* ================================================
   portfolio.js — Portfolio & Watchlist Helpers
   Thin wrapper over YC.state for holding management
   ================================================ */

YC.portfolio = (() => {

    /* ── Get all holdings with market data enriched ── */
    function getEnriched() {
        const state = YC.state.get();
        const rate = state.exchangeRate || 32.0;

        return state.holdings.map(h => {
            const enriched = YC.temperature.enrich(h);
            const mkt = YC.state.getMarketData(h.symbol) || {};

            const isUS = h.currency === 'USD' || (h.type && h.type.includes('us'));
            
            // Convert to TWD for shared calculations
            const costPriceTWD = isUS ? (h.costPrice * rate) : h.costPrice;
            const feesTWD = isUS ? (h.totalFees * rate) : h.totalFees;
            const marketPriceTWD = isUS ? ((mkt.price || h.costPrice) * rate) : (mkt.price || h.costPrice);

            const costTotal = (costPriceTWD || 0) * (h.shares || 0) + (feesTWD || 0);
            const marketValue = (marketPriceTWD || 0) * (h.shares || 0);
            const gainAmt = marketValue - costTotal;
            const gainPct = costTotal > 0 ? (gainAmt / costTotal) * 100 : 0;

            return {
                ...enriched,
                costTotal,
                marketValue,
                gainAmt,
                gainPct,
                isUS
            };
        });
    }

    /* ── Total portfolio market value ── */
    function totalMarketValue() {
        return getEnriched().reduce((sum, h) => sum + (h.marketValue || 0), 0);
    }

    /* ── Current equity ratio ── */
    function equityRatio() {
        const state = YC.state.get();
        const total = state.settings.totalAssets;
        if (!total) return null;
        const equity = totalMarketValue();
        return { equityPct: (equity / total) * 100, equity, cash: total - equity };
    }

    /* ── Get watchlist with enriched data ── */
    function getWatchlistEnriched(typeFilter = null) {
        const state = YC.state.get();
        let list = state.watchlist;
        if (typeFilter && typeFilter !== 'all') list = list.filter(w => w.type === typeFilter);

        return list.map(w => YC.temperature.enrich(w));
    }

    /* ── Format currency display ── */
    function formatCurrency(value, currency = 'TWD') {
        if (value == null || isNaN(value)) return '--';
        const abs = Math.abs(value);
        if (abs >= 1e8) return (value / 1e8).toFixed(2) + '億';
        if (abs >= 1e4) return (value / 1e4).toFixed(1) + '萬';
        return value.toLocaleString();
    }

    function formatPrice(price, currency = 'USD') {
        if (price == null || isNaN(price)) return '--';
        if (currency === 'TWD' || price > 10) return price.toFixed(2);
        return price.toFixed(4);
    }

    /* ── Add symbol to watchlist if not present ── */
    function addToWatchlist(item) {
        const state = YC.state.get();
        if (!state.watchlist.find(w => w.symbol === item.symbol)) {
            state.watchlist.push(item);
            YC.state.save();
        }
    }

    /* ── Remove symbol from watchlist & holdings ── */
    function removeFromWatchlist(symbol) {
        const state = YC.state.get();
        // Remove from watchlist
        state.watchlist = state.watchlist.filter(w => w.symbol !== symbol);
        // Also remove from holdings to keep it clean
        state.holdings = state.holdings.filter(h => h.symbol !== symbol);
        YC.state.save();
    }

    return { getEnriched, totalMarketValue, equityRatio, getWatchlistEnriched, formatCurrency, formatPrice, addToWatchlist, removeFromWatchlist };
})();