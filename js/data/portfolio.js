/* ================================================
   portfolio.js — Portfolio & Watchlist Helpers
   Thin wrapper over YC.state for holding management
   ================================================ */

YC.portfolio = (() => {

    /* ── Get all holdings with market data enriched ── */
    function getEnriched() {
        const state = YC.state.get();
        return state.holdings.map(h => {
            const enriched = YC.temperature.enrich(h);
            const mkt = YC.state.getMarketData(h.symbol) || {};

            const costTotal = (h.costPrice || 0) * (h.shares || 1) + (h.totalFees || 0);
            const marketValue = (mkt.price || h.costPrice || 0) * (h.shares || 1);
            const gainAmt = marketValue - costTotal;
            const gainPct = costTotal > 0 ? (gainAmt / costTotal) * 100 : 0;

            return {
                ...enriched,
                costTotal,
                marketValue,
                gainAmt,
                gainPct,
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
            YC.state.save(); // Now calling the exported save()
        }
    }

    return { getEnriched, totalMarketValue, equityRatio, getWatchlistEnriched, formatCurrency, formatPrice, addToWatchlist };
})();