/* ================================================
   app.js — Main Application Controller
   Initialises app, handles routing, refresh cycle
   ================================================ */

YC.app = (() => {

    // Define pages globally for easier debugging and consistent access
    // Note: render functions are lazy arrow functions to ensure page modules (YC.stocks etc) are loaded
    const PAGES = {
        dashboard: { title: '市場總覽', render: () => YC.dashboardPage && YC.dashboardPage.render() },
        stocks: { title: '股票溫度', render: () => YC.stocks && YC.stocks.render() },
        heatmap: { title: '熱力分佈', render: () => YC.heatmapPage && YC.heatmapPage.render() },
        ai: { title: 'AI 持倉分析', render: () => YC.aiPage && YC.aiPage.render() },
        settings: { title: '設定', render: () => YC.settingsPage && YC.settingsPage.render() },
        ledger: { title: '資產記帳', render: () => YC.ledgerPage && YC.ledgerPage.render() },
    };

    let currentPage = 'dashboard';

    /* ── Render Utility ────────────────────────── */
    function safeRender(pageId) {
        const page = PAGES[pageId];
        if (!page) {
            console.error(`[App] Page configuration not found for: ${pageId}`);
            return;
        }

        try {
            console.log(`[App] Rendering view: ${pageId}`);
            page.render();
        } catch (err) {
            console.error(`[App] Render failed on ${pageId}:`, err);
        }
    }

    /* ── Navigate to a page ────────────────────────── */
    function navigate(pageId) {
        if (!PAGES[pageId]) {
            console.warn(`[App] Attempted to navigate to invalid page: ${pageId}`);
            return;
        }
        currentPage = pageId;

        // Update CSS visibility
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(`page-${pageId}`);
        if (el) el.classList.add('active');

        // Update Bottom Nav UI
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.toggle('active', n.dataset.page === pageId);
        });

        // Update Header
        const titleEl = document.getElementById('header-title');
        if (titleEl) titleEl.textContent = PAGES[pageId].title;

        // Perform Render
        safeRender(pageId);

        // Scroll to top
        document.getElementById('page-container')?.scrollTo(0, 0);
    }

    /* ── Data Fetching & Sync ──────────────────────── */
    async function refreshData() {
        setStatus('loading', '更新中...');
        const btn = document.getElementById('btn-refresh');
        if (btn) btn.classList.add('spinning');

        try {
            const state = YC.state.get();
            const symbols = [
                ...state.holdings.map(h => h.symbol),
                ...state.watchlist.map(w => w.symbol)
            ];
            const uniqueSymbols = [...new Set(symbols)];

            // Parallel fetch: Batch for all + Full History for SPY + Exchange Rate
            console.log(`[App] Refreshing data for ${uniqueSymbols.length} symbols...`);
            const [batchRes, spyRes, rateRes] = await Promise.allSettled([
                uniqueSymbols.length ? YC.api.batchQuotes(uniqueSymbols) : Promise.resolve({}),
                YC.api.getYahooQuote('SPY'),
                YC.api.getExchangeRate()
            ]);

            // Sync Batch Data
            if (batchRes.status === 'fulfilled') {
                Object.values(batchRes.value).forEach(q => {
                    if (q && q.symbol) {
                        const existing = YC.state.getMarketData(q.symbol) || {};
                        YC.state.setMarketData(q.symbol, { ...existing, ...q });
                    }
                });
            }

            // Sync SPY Full Data & Invalidate Cache
            if (spyRes.status === 'fulfilled' && spyRes.value) {
                YC.state.setMarketData('SPY', spyRes.value);
                // Force sentiment recompute by clearing cache
                YC.state.patch({ sentimentFetchedAt: null });
            }

            // Trigger UI Refresh
            console.log(`[App] Data sync complete. Refreshing active view: ${currentPage}`);

            // Also refresh live exchange rates BEFORE rendering so bank TWD values are correct
            try {
                const r = await fetch('/api/rates');
                const d = await r.json();
                if (d.success && d.rates) YC.state.setLiveRates(d.rates);
            } catch (err) {
                console.warn('[App] Rates fetch failed:', err);
            }

            safeRender(currentPage);
            setStatus('success', '數據已更新');

        } catch (e) {
            console.error('[App] Refresh critical error:', e);
            setStatus('error', '連線失敗');
        } finally {
            if (btn) btn.classList.remove('spinning');
        }
    }

    /* ── UI Helpers ────────────────────────────────── */
    function setStatus(type, text) {
        const dot = document.getElementById('status-dot');
        const txt = document.getElementById('status-text');
        if (!dot || !txt) return;
        dot.className = 'status-dot ' + type;
        txt.textContent = text;
    }

    /* ── Initialization ────────────────────────────── */
    function init() {
        console.log('[App] Initializing system modules...');

        // 1. Initial State Load
        YC.state.get();

        // 2. Event Listeners
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => navigate(btn.dataset.page));
        });

        document.getElementById('btn-refresh')?.addEventListener('click', () => refreshData());

        // 3. Enter App
        navigate('dashboard');

        // Kick off initial data background fetch
        refreshData();

        // Pre-fetch metal prices in background
        YC.metals.fetchPrices().catch(e => console.warn('[App] Metals pre-fetch failed:', e));

        // Pre-fetch live exchange rates in background
        fetch('/api/rates')
            .then(r => r.json())
            .then(d => { if (d.success && d.rates) YC.state.setLiveRates(d.rates); })
            .catch(e => console.warn('[App] Rates pre-fetch failed:', e));

        // 4. Loading Screen Dismissal
        setTimeout(() => {
            const loading = document.getElementById('loading-screen');
            if (loading) {
                loading.classList.add('fade-out');
                setTimeout(() => {
                    loading.remove();
                    document.getElementById('main-app')?.classList.remove('hidden');
                }, 500);
            }
        }, 800);

        // 5. Auto Refresh (5 mins)
        setInterval(() => refreshData(), 300000);
    }

    function showHint(title, msg) {
        alert(`${title}\n\n${msg}`);
    }

    return { init, navigate, refreshData, showHint };
})();

// Boot YC
window.addEventListener('DOMContentLoaded', () => YC.app.init());