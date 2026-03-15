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

            // Parallel fetch: Batch for all + Full History for SPY (essential for sentiment logic)
            console.log(`[App] Refreshing data for ${uniqueSymbols.length} symbols...`);
            const [batchRes, spyRes] = await Promise.allSettled([
                uniqueSymbols.length ? YC.api.batchQuotes(uniqueSymbols) : Promise.resolve({}),
                YC.api.getYahooQuote('SPY')
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

    return { init, navigate, refreshData };
})();

// Boot YC
window.addEventListener('DOMContentLoaded', () => YC.app.init());