/* ================================================
   ledger.js — 資產記帳頁 (Wealth Ledger Page)
   Sections: Bank | Stock | Precious | Insurance | Other | Loan | Ledger
   ================================================ */

YC.ledgerPage = (() => {

    // ─── Constants ────────────────────────────────────────────
    const CATS = [
        { key: 'bank',      label: '銀行',   emoji: '🏦', color: '#007AFF' },
        { key: 'stock',     label: '股票',   emoji: '📈', color: '#FF9500' },
        { key: 'precious',  label: '貴金屬', emoji: '🥇', color: '#FFD60A' },
        { key: 'insurance', label: '保險',   emoji: '🛡️', color: '#34C759' },
        { key: 'other',     label: '其他',   emoji: '📦', color: '#AF52DE' },
        { key: 'loan',      label: '借貸',   emoji: '💳', color: '#FF3B30' },
        { key: 'ledger',    label: '記帳',   emoji: '📒', color: '#7c6fff' }
    ];

    const METAL_KEYS = ['gold', 'silver', 'platinum'];
    const METAL_LABELS = { gold: '黃金', silver: '白銀', platinum: '白金' };
    const UNIT_LABELS  = { oz: '盎司', g: '公克', qian: '台錢', tael: '台兩' };
    const UNIT_TO_GRAM = { oz: 31.1035, g: 1, qian: 3.75, tael: 37.5 };

    const EXPENSE_CATS = ['餐飲', '交通', '購物', '娛樂', '醫療', '教育', '住房', '保險', '投資', '其他'];
    const INCOME_CATS  = ['薪資', '獎金', '投資收益', '股息', '租金', '兼職', '其他'];

    let activeTab = 'bank';
    let editId    = null;
    let currentLedgerMonth = new Date();

    // ─── Helpers ──────────────────────────────────────────────
    function fmt(n) { return (n || 0).toLocaleString(); }

    function genId() { return Date.now() + Math.floor(Math.random() * 9999); }

    function getAssets() { 
        const a = YC.state.getAssets(); 
        // Auto-sync dashboard holdings to ledger stocks
        const holdings = YC.portfolio.getEnriched();
        a.stock = holdings.map(h => {
            const mkt = YC.state.getMarketData(h.symbol) || {};
            return {
                id: 'sync_' + h.symbol,
                isSynced: true,
                symbol: h.symbol,
                name: h.name || h.symbol,
                shares: h.shares,
                cost: h.cost,
                lastPrice: mkt.price || mkt.regularMarketPrice || (h.marketValue / (h.shares || 1)) || 0
            };
        });
        return a; 
    }
    function saveAssets(a) { 
        // Don't save auto-synced stock array back to localStorage to prevent data bloating
        const aToSave = { ...a, stock: [] };
        YC.state.saveAssets(aToSave); 
    }

    function getLedger() { return YC.state.getLedger(); }
    function saveLedger(e) { YC.state.saveLedger(e); }

    /** Get TWD value of any asset item */
    function getItemTWD(item, key) {
        if (key === 'stock') {
            const mkt = YC.state.getMarketData(item.symbol) || {};
            const price = mkt.price || mkt.regularMarketPrice || item.lastPrice || 0;
            const isUS  = item.symbol && !/^\d{4,6}(\.TW)?$/.test(item.symbol);
            const rate  = YC.state.get().exchangeRate || 32.5;
            let val = (price || 0) * (item.shares || 0);
            if (isUS) val *= rate;
            return Math.round(val);
        }
        if (key === 'precious') {
            return YC.metals.calcValueTWD(item);
        }
        // Foreign currency bank: always recalculate dynamically from live rates
        if (key === 'bank' && item.type === '外幣' && item.orgAmount && item.currency) {
            const rates   = YC.state.getLiveRates();
            const usdTwd  = YC.state.get().exchangeRate || 32.0;
            const FALLBACK = { USD: usdTwd, JPY: usdTwd / 150, EUR: usdTwd * 1.08, CNY: usdTwd / 7.2, HKD: usdTwd / 7.8 };
            const fx = (rates && rates[item.currency]) ? rates[item.currency] : (FALLBACK[item.currency] || usdTwd);
            return Math.round(item.orgAmount * fx);
        }
        return Number(item.amount) || 0;
    }

    /** Compute net worth totals */
    function calcTotals() {
        const a = getAssets();
        const totals = {};
        CATS.filter(c => c.key !== 'ledger').forEach(c => {
            totals[c.key] = (a[c.key] || []).reduce((s, i) => s + getItemTWD(i, c.key), 0);
        });
        const net = totals.bank + totals.stock + totals.precious + totals.insurance + totals.other - totals.loan;
        return { ...totals, net };
    }

    // ─── Main Render ──────────────────────────────────────────
    function render() {
        const el = document.getElementById('page-ledger');
        if (!el) return;
        el.innerHTML = buildHTML();
        attachEvents();
        renderTab(activeTab);
    }

    function buildHTML() {
        const totals = calcTotals();
        const mp = YC.state.getMetalPrices();

        // Net worth card
        const netStr = totals.net < 0
            ? `-$${fmt(Math.abs(totals.net))}`
            : `$${fmt(totals.net)}`;
        const loanStr = totals.loan > 0 ? `<span style="color:#FF3B30">負債 -$${fmt(totals.loan)}</span>` : '';

        // Metal price ticker
        let metalTicker = '';
        if (mp) {
            const updAt = mp.updatedAt ? new Date(mp.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '—';
            const pctStr = (pct) => {
                if (pct == null) return '';
                const sign = pct >= 0 ? '+' : '';
                const color = pct >= 0 ? 'var(--pos)' : 'var(--neg)';
                return ` <span style="font-size:0.85em;color:${color}">${sign}${pct.toFixed(2)}%</span>`;
            };
            metalTicker = `
            <div class="lc-metal-ticker">
                <span class="lc-metal-item" style="color:#FFD60A">🥇 黃金 $${fmt(mp.gold?.twdPerQian)}/錢${pctStr(mp.gold?.changePercent)}</span>
                <span class="lc-metal-item" style="color:#C0C0C0">🥈 白銀 $${fmt(mp.silver?.twdPerQian)}/錢${pctStr(mp.silver?.changePercent)}</span>
                <span class="lc-metal-item" style="color:#A8E6FF">💎 白金 $${fmt(mp.platinum?.twdPerQian)}/錢${pctStr(mp.platinum?.changePercent)}</span>
                <span class="lc-metal-item lc-metal-time">🕐 ${updAt}</span>
            </div>`;
        } else {
            metalTicker = `<div class="lc-metal-ticker"><span class="lc-metal-item" style="color:var(--text-3)">貴金屬報價載入中…</span></div>`;
        }

        // Category breakdown bars
        const cats4bar = CATS.filter(c => c.key !== 'ledger');
        const barTotal = cats4bar.reduce((s, c) => s + (c.key === 'loan' ? 0 : (totals[c.key] || 0)), 0) || 1;
        const bars = cats4bar.map(c => {
            const v = totals[c.key] || 0;
            if (v === 0) return '';
            const pct = Math.round(v / barTotal * 100);
            return `<div class="lc-bar-seg" style="width:${Math.max(pct,2)}%; background:${c.color}" title="${c.label} $${fmt(v)}"></div>`;
        }).join('');

        // Summary grid
        const summaryGrid = cats4bar.map(c => `
        <div class="lc-sum-item" data-tab="${c.key}" onclick="YC.ledgerPage.switchTab('${c.key}')">
            <span class="lc-sum-emoji">${c.emoji}</span>
            <span class="lc-sum-label">${c.label}</span>
            <span class="lc-sum-val" style="color:${c.key === 'loan' ? '#FF3B30' : c.color}">
                ${c.key === 'loan' && totals.loan > 0 ? '-' : ''}$${fmt(totals[c.key])}
            </span>
        </div>`).join('');

        // Tab bar
        const tabBar = CATS.map(c => `
        <button class="lc-tab ${activeTab === c.key ? 'active' : ''}"
                id="lc-tab-${c.key}"
                onclick="YC.ledgerPage.switchTab('${c.key}')">${c.emoji} ${c.label}</button>`).join('');

        return `
        <!-- Net Worth Hero Card -->
        <div class="lc-hero-card">
            <div class="lc-hero-label">總淨資產</div>
            <div class="lc-hero-net">${netStr}</div>
            ${loanStr ? `<div class="lc-hero-sub">${loanStr}</div>` : ''}
            <div class="lc-bar-track">${bars || '<div style="height:6px"></div>'}</div>
            ${metalTicker}
            <div class="lc-sum-grid">${summaryGrid}</div>
        </div>

        <!-- Tab Bar -->
        <div class="lc-tab-bar" id="lc-tab-bar">${tabBar}</div>

        <!-- Tab Content -->
        <div id="lc-content"></div>

        <!-- Bottom Spacer -->
        <div style="height:20px"></div>

        <!-- Slide-up Modal -->
        <div class="lc-modal-bg" id="lc-modal-bg" onclick="YC.ledgerPage.closeModal()"></div>
        <div class="lc-modal" id="lc-modal">
            <div class="lc-modal-handle"></div>
            <div id="lc-modal-inner"></div>
        </div>
        `;
    }

    // ─── Tab Switching ────────────────────────────────────────
    function switchTab(tab) {
        activeTab = tab;
        document.querySelectorAll('.lc-tab').forEach(b => b.classList.toggle('active', b.id === `lc-tab-${tab}`));
        renderTab(tab);
    }

    function renderTab(tab) {
        const el = document.getElementById('lc-content');
        if (!el) return;
        if (tab === 'ledger') {
            el.innerHTML = renderLedgerTab();
        } else {
            el.innerHTML = renderAssetTab(tab);
        }
    }

    // ─── Asset Tab ────────────────────────────────────────────
    function renderAssetTab(key) {
        const cat   = CATS.find(c => c.key === key);
        let items = (getAssets()[key] || []);

        // Sort items: Group banks by name
        if (key === 'bank') {
            items = [...items].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }

        const total = items.reduce((s, i) => s + getItemTWD(i, key), 0);

        const itemsHTML = items.length === 0
            ? `<div class="lc-empty">尚無資料，點擊下方 ＋ 新增</div>`
            : items.map(i => renderItemCard(i, key)).join('');

        // Stock sync hint
        const syncBtn = key === 'stock'
            ? `<div style="display:flex; gap:8px;">
                 <button class="lc-sync-btn" onclick="YC.ledgerPage.syncStockPrices()">⟳ 同步市價</button>
               </div>`
            : '';

        // Metal price reference for precious tab
        const metalRef = key === 'precious' ? buildMetalRef() : '';

        return `
        <div class="lc-tab-header">
            <div>
                <div class="lc-tab-title">${cat.emoji} ${cat.label}</div>
                <div class="lc-tab-total" style="color:${cat.color}">
                    ${key === 'loan' && total > 0 ? '-' : ''}$${fmt(total)}
                </div>
            </div>
            ${syncBtn}
        </div>
        ${metalRef}
        <div class="lc-item-list">${itemsHTML}</div>
        ${key === 'stock' ? '' : `
        <button class="lc-add-btn" onclick="YC.ledgerPage.openAdd('${key}')">
            + 新增${cat.label}
        </button>
        `}
        `;
    }

    function buildMetalRef() {
        const mp = YC.state.getMetalPrices();
        if (!mp) {
            return `<div class="lc-metal-ref-wrap">
                <button class="lc-sync-btn" onclick="YC.ledgerPage.fetchMetals()">⟳ 取得最新報價</button>
            </div>`;
        }
        const cards = ['gold','silver','platinum'].map(k => {
            const m = mp[k];
            const info = YC.metals.METAL_INFO[k];
            const pct = m?.changePercent;
            const pctHtml = pct != null ? `<span style="font-size:0.85em;margin-left:6px;color:${pct >= 0 ? 'var(--pos)' : 'var(--neg)'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>` : '';
            return `<div class="lc-metal-ref-card">
                <div class="lc-metal-ref-name">${info.emoji} ${info.label}</div>
                <div class="lc-metal-ref-price" style="color:${info.color}">$${fmt(m?.twdPerQian)}<span>/台錢</span>${pctHtml}</div>
                <div class="lc-metal-ref-sub">$${fmt(m?.twdPerTael)}/台兩 ｜ $${fmt(m?.twdPerGram)}/g</div>
                <div class="lc-metal-ref-usd">≈ USD ${m?.usdPerOz}/oz</div>
            </div>`;
        }).join('');
        const updAt = new Date(mp.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        return `<div class="lc-metal-ref-wrap">
            <div class="lc-metal-ref-top">
                <span class="lc-metal-ref-title">銀樓牌價參考 (含加成)</span>
                <button class="lc-sync-btn" onclick="YC.ledgerPage.fetchMetals()">⟳ ${updAt}</button>
            </div>
            <div class="lc-metal-ref-grid">${cards}</div>
        </div>`;
    }

    function renderItemCard(item, key) {
        const twd  = getItemTWD(item, key);
        const cat  = CATS.find(c => c.key === key);
        let sub = '';
        if (key === 'bank') {
            if (item.type === '外幣' && item.orgAmount && item.currency) {
                const rates   = YC.state.getLiveRates();
                const usdTwd  = YC.state.get().exchangeRate || 32.0;
                const FALLBACK = { USD: usdTwd, JPY: usdTwd / 150, EUR: usdTwd * 1.08, CNY: usdTwd / 7.2, HKD: usdTwd / 7.8 };
                const fx = (rates && rates[item.currency]) ? rates[item.currency] : (FALLBACK[item.currency] || usdTwd);
                const isLive = !!(rates && rates[item.currency]);
                sub = `外幣 ${item.currency} ${fmt(item.orgAmount)} <span style="font-size:10px;color:var(--text-3)">@ ${fx.toFixed(2)}${isLive ? ' ●' : ' ⚠'}</span>`;
            } else {
                sub = item.type;
            }
        } else if (key === 'stock') {
            const mkt   = YC.state.getMarketData(item.symbol) || {};
            const price = mkt.price || mkt.regularMarketPrice || item.lastPrice || '—';
            const pct   = mkt.changePct != null ? `${mkt.changePct >= 0 ? '+' : ''}${mkt.changePct.toFixed(2)}%` : '';
            const pcolor= mkt.changePct >= 0 ? 'var(--pos)' : 'var(--neg)';
            sub = `${item.symbol} · ${fmt(item.shares)}股 · ${price} <span style="color:${pcolor}">${pct}</span>`;
        } else if (key === 'precious') {
            const info = YC.metals.METAL_INFO[item.metalKey] || {};
            sub = `${info.emoji || ''} ${METAL_LABELS[item.metalKey] || item.metalKey} · ${item.weight} ${UNIT_LABELS[item.unit] || item.unit}`;
        } else if (key === 'insurance') {
            sub = item.company || '';
        } else if (key === 'loan') {
            sub = item.rate ? `年利率 ${item.rate}%` : (item.note || '');
        } else {
            sub = item.note || '';
        }

        // Cost & profit (stock / precious)
        let profitLine = '';
        if ((key === 'stock' || key === 'precious') && item.cost) {
            const profit  = twd - item.cost;
            const pct     = item.cost > 0 ? (profit / item.cost * 100).toFixed(1) : '—';
            const col     = profit >= 0 ? 'var(--pos)' : 'var(--neg)';
            const sign    = profit >= 0 ? '+' : '';
            profitLine = `<div class="lc-item-profit" style="color:${col}">${sign}$${fmt(profit)} (${sign}${pct}%)</div>`;
        }

        return `
        <div class="lc-item-card" onclick="YC.ledgerPage.openEdit('${key}', ${item.id})">
            <div class="lc-item-dot" style="background:${cat.color}"></div>
            <div class="lc-item-body">
                <div class="lc-item-name">${item.name || item.symbol || '—'}</div>
                <div class="lc-item-sub">${sub}</div>
                ${profitLine}
            </div>
            <div class="lc-item-right">
                <div class="lc-item-val">$${fmt(twd)}</div>
                <div class="lc-item-actions">
                    ${item.isSynced ? 
                        `<span style="font-size:10px;color:var(--text-3);padding:4px 8px;border:1px solid #333;border-radius:4px;cursor:default;">總覽連動</span>` : 
                        `<button class="lc-btn-del" onclick="event.stopPropagation(); YC.ledgerPage.deleteItem('${key}', '${item.id}')">✕</button>`
                    }
                </div>
            </div>
        </div>`;
    }

    // ─── Ledger Tab ───────────────────────────────────────────
    function renderLedgerTab() {
        const y = currentLedgerMonth.getFullYear();
        const m = currentLedgerMonth.getMonth() + 1;
        const mStr = `${y}-${String(m).padStart(2, '0')}`;
        const entries = getLedger().filter(e => e.date && e.date.startsWith(mStr));
        entries.sort((a, b) => b.date.localeCompare(a.date));

        let inc = 0, exp = 0;
        entries.forEach(e => {
            if (e.type === 'income') inc += Number(e.amount) || 0;
            else exp += Number(e.amount) || 0;
        });

        const listHTML = entries.length === 0
            ? `<div class="lc-empty">本月尚無記帳紀錄</div>`
            : entries.map(e => {
                const isInc = e.type === 'income';
                const sign  = isInc ? '+' : '-';
                const color = isInc ? 'var(--neg)' : 'var(--pos)';
                return `<div class="lc-ledger-row" onclick="YC.ledgerPage.openLedgerEdit(${e.id})">
                    <div class="lc-ledger-cat">${e.category}</div>
                    <div class="lc-ledger-note">${e.note || ''}</div>
                    <div class="lc-ledger-date">${e.date.slice(5)}</div>
                    <div class="lc-ledger-amt" style="color:${color}">${sign}$${fmt(e.amount)}</div>
                    <button class="lc-btn-del" onclick="event.stopPropagation(); YC.ledgerPage.deleteLedger(${e.id})">✕</button>
                </div>`;
            }).join('');

        return `
        <div class="lc-ledger-nav">
            <button class="lc-month-btn" onclick="YC.ledgerPage.changeMonth(-1)">‹</button>
            <span class="lc-month-label">${y}年 ${m}月</span>
            <button class="lc-month-btn" onclick="YC.ledgerPage.changeMonth(1)">›</button>
        </div>
        <div class="lc-ledger-summary">
            <div class="lc-ledger-sum-item">
                <div class="lc-ledger-sum-label">收入</div>
                <div class="lc-ledger-sum-val" style="color:var(--neg)">+$${fmt(inc)}</div>
            </div>
            <div class="lc-ledger-sum-divider"></div>
            <div class="lc-ledger-sum-item">
                <div class="lc-ledger-sum-label">支出</div>
                <div class="lc-ledger-sum-val" style="color:var(--pos)">-$${fmt(exp)}</div>
            </div>
            <div class="lc-ledger-sum-divider"></div>
            <div class="lc-ledger-sum-item">
                <div class="lc-ledger-sum-label">結餘</div>
                <div class="lc-ledger-sum-val" style="color:${inc-exp>=0?'var(--neg)':'var(--pos)'}">
                    ${inc-exp>=0?'+':'-'}$${fmt(Math.abs(inc-exp))}
                </div>
            </div>
        </div>
        <div class="lc-item-list">${listHTML}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
            <button class="lc-add-btn lc-add-income" style="background:rgba(0,212,170,0.15);color:var(--neg);flex:1" onclick="YC.ledgerPage.openLedgerAdd('income')">+ 收入</button>
            <button class="lc-add-btn lc-add-expense" style="background:rgba(255,53,96,0.15);color:var(--pos);flex:1" onclick="YC.ledgerPage.openLedgerAdd('expense')">+ 支出</button>
        </div>`;
    }

    // ─── Modal Logic ──────────────────────────────────────────
    function openModal(html) {
        document.getElementById('lc-modal-inner').innerHTML = html;
        document.getElementById('lc-modal-bg').classList.add('show');
        document.getElementById('lc-modal').classList.add('show');
    }

    function closeModal() {
        document.getElementById('lc-modal-bg').classList.remove('show');
        document.getElementById('lc-modal').classList.remove('show');
        editId = null;
    }

    function openAdd(key) {
        editId = null;
        openModal(buildAssetForm(key, null));
        attachFormEvents(key);
    }

    function openEdit(key, id) {
        const items = getAssets()[key] || [];
        const item  = items.find(i => i.id === id);
        if (!item) return;
        editId = id;
        openModal(buildAssetForm(key, item));
        attachFormEvents(key);
        populateForm(key, item);
    }

    function openLedgerAdd(type) {
        editId = null;
        openModal(buildLedgerForm(type, null));
    }

    function openLedgerEdit(id) {
        const e = getLedger().find(e => e.id === id);
        if (!e) return;
        editId = id;
        openModal(buildLedgerForm(e.type, e));
    }

    // ─── Asset Form Builder ───────────────────────────────────
    function buildAssetForm(key, item) {
        const cat = CATS.find(c => c.key === key);
        const title = item ? `編輯${cat.label}` : `新增${cat.label}`;

        let fields = '';

        if (key === 'bank') {
            fields = `
            <label>銀行名稱</label>
            <input id="lf-name" placeholder="例：台灣銀行、花旗銀行" value="${item?.name || ''}">
            <label>帳戶類型</label>
            <select id="lf-bank-type" onchange="YC.ledgerPage.toggleBankCurrency(this.value)">
                <option value="活存" ${item?.type==='活存'?'selected':''}>活存 (TWD)</option>
                <option value="定存" ${item?.type==='定存'?'selected':''}>定存 (TWD)</option>
                <option value="外幣" ${item?.type==='外幣'?'selected':''}>外幣帳戶</option>
            </select>
            <div id="lf-currency-box" style="display:${item?.type==='外幣'?'block':'none'}; background:var(--bg-card2);padding:12px;border-radius:var(--r-md);margin-bottom:8px">
                <label>幣別</label>
                <select id="lf-currency" onchange="YC.ledgerPage.calcBankTWD()">
                    <option value="USD" ${item?.currency==='USD'?'selected':''}>美金 USD</option>
                    <option value="JPY" ${item?.currency==='JPY'?'selected':''}>日圓 JPY</option>
                    <option value="EUR" ${item?.currency==='EUR'?'selected':''}>歐元 EUR</option>
                    <option value="CNY" ${item?.currency==='CNY'?'selected':''}>人民幣 CNY</option>
                    <option value="HKD" ${item?.currency==='HKD'?'selected':''}>港幣 HKD</option>
                </select>
                <label>原幣金額</label>
                <input type="number" id="lf-org-amt" inputmode="decimal" placeholder="原幣金額" value="${item?.orgAmount||''}" oninput="YC.ledgerPage.calcBankTWD()">
                <div style="font-size:11px;color:var(--text-3);margin-top:4px">
                    換算匯率: <span id="lf-rate-disp">—</span>
                </div>
            </div>
            <label>台幣金額 (TWD)</label>
            <input type="number" id="lf-amount" inputmode="decimal" placeholder="台幣金額" value="${item?.amount||''}">`;
        } else if (key === 'stock') {
            fields = `
            <label>股票代號</label>
            <div style="display:flex;gap:8px">
                <input id="lf-symbol" placeholder="例：2330.TW 或 AAPL" value="${item?.symbol||''}" style="flex:1">
                <button class="lc-query-btn" onclick="YC.ledgerPage.queryStockPrice()">查詢</button>
            </div>
            <label>股票名稱</label>
            <input id="lf-name" placeholder="自動帶入或手動填寫" value="${item?.name||''}">
            <label>現價 (自動同步)</label>
            <input type="number" id="lf-price" inputmode="decimal" placeholder="自動同步市價" value="${item?.lastPrice||''}" readonly style="color:var(--text-2)">
            <label>持有股數</label>
            <input type="number" id="lf-shares" inputmode="decimal" placeholder="0" value="${item?.shares||''}">
            <label>總成本 (TWD)</label>
            <input type="number" id="lf-cost" inputmode="decimal" placeholder="買入總成本" value="${item?.cost||''}">`;
        } else if (key === 'precious') {
            const mp = YC.state.getMetalPrices();
            const priceHint = mp
                ? `黃金 $${fmt(mp.gold?.twdPerQian)}/台錢 | 白銀 $${fmt(mp.silver?.twdPerQian)}/台錢`
                : '點擊查詢取得最新銀樓牌價';
            fields = `
            <label>種類</label>
            <select id="lf-metal-key" onchange="YC.ledgerPage.calcMetalValue()">
                <option value="gold"     ${item?.metalKey==='gold'     ?'selected':''}>🥇 黃金</option>
                <option value="silver"   ${item?.metalKey==='silver'   ?'selected':''}>🥈 白銀</option>
                <option value="platinum" ${item?.metalKey==='platinum' ?'selected':''}>💎 白金 (鉑金)</option>
            </select>
            <div style="display:flex;gap:8px">
                <div style="flex:1"><label>重量</label>
                <input type="number" id="lf-weight" inputmode="decimal" placeholder="0" value="${item?.weight||''}" oninput="YC.ledgerPage.calcMetalValue()"></div>
                <div style="flex:1"><label>單位</label>
                <select id="lf-unit" onchange="YC.ledgerPage.calcMetalValue()">
                    <option value="tael" ${item?.unit==='tael'?'selected':''}>台兩 (37.5g)</option>
                    <option value="qian" ${item?.unit==='qian'?'selected':''}>台錢 (3.75g)</option>
                    <option value="g"    ${item?.unit==='g'   ?'selected':''}>公克 (g)</option>
                    <option value="oz"   ${item?.unit==='oz'  ?'selected':''}>盎司 (oz)</option>
                </select></div>
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-bottom:8px" id="lf-metal-hint">銀樓牌價: ${priceHint}</div>
            <label>自訂單價 USD/oz (留空用市價)</label>
            <input type="number" id="lf-custom-price" inputmode="decimal" placeholder="留空 = 使用即時銀樓牌價" value="${item?.customPriceUSD||''}" oninput="YC.ledgerPage.calcMetalValue()">
            <label>總成本 (TWD)</label>
            <input type="number" id="lf-cost" inputmode="decimal" placeholder="買入總成本" value="${item?.cost||''}">
            <label>估算市值 (TWD, 自動計算)</label>
            <input type="number" id="lf-amount" inputmode="decimal" placeholder="自動計算" value="${item?.amount||''}" readonly style="color:var(--text-2)">`;
        } else if (key === 'insurance') {
            fields = `
            <label>保險名稱</label>
            <input id="lf-name" placeholder="例：壽險、醫療險" value="${item?.name||''}">
            <label>保險公司</label>
            <input id="lf-company" placeholder="例：南山人壽" value="${item?.company||''}">
            <label>保單現值 / 解約金 (TWD)</label>
            <input type="number" id="lf-amount" inputmode="decimal" placeholder="保單價值" value="${item?.amount||''}">
            <label>備註</label>
            <input id="lf-note" placeholder="可填保額、到期日等" value="${item?.note||''}">`;
        } else if (key === 'loan') {
            fields = `
            <label>借貸名稱</label>
            <input id="lf-name" placeholder="例：房貸、車貸、信借" value="${item?.name||''}">
            <label>未償還金額 (TWD)</label>
            <input type="number" id="lf-amount" inputmode="decimal" placeholder="尚未還清金額" value="${item?.amount||''}">
            <label>年利率 (%)</label>
            <input type="number" id="lf-rate" inputmode="decimal" placeholder="例：2.5" value="${item?.rate||''}">
            <label>備註</label>
            <input id="lf-note" placeholder="還款期間、備注等" value="${item?.note||''}">`;
        } else { // other
            fields = `
            <label>項目名稱</label>
            <input id="lf-name" placeholder="例：車輛、房產、加密貨幣" value="${item?.name||''}">
            <label>估算價值 (TWD)</label>
            <input type="number" id="lf-amount" inputmode="decimal" placeholder="0" value="${item?.amount||''}">
            <label>備註</label>
            <input id="lf-note" placeholder="說明、購入價等" value="${item?.note||''}">`;
        }

        return `
        <div class="lf-header">
            <div class="lf-title">${title}</div>
            <button class="lf-close" onclick="YC.ledgerPage.closeModal()">✕</button>
        </div>
        <div class="lf-body">
            ${fields}
            <button class="lc-save-btn" onclick="YC.ledgerPage.saveItem('${key}')">
                ${item ? '更新' : '儲存'}
            </button>
        </div>`;
    }

    // ─── Ledger Form Builder ──────────────────────────────────
    function buildLedgerForm(type, item) {
        const isInc = type === 'income';
        const cats  = isInc ? INCOME_CATS : EXPENSE_CATS;
        const today = new Date().toISOString().split('T')[0];
        const opts  = cats.map(c => `<option value="${c}" ${item?.category===c?'selected':''}>${c}</option>`).join('');
        return `
        <div class="lf-header">
            <div class="lf-title">${isInc ? '➕ 新增收入' : '➖ 新增支出'}</div>
            <button class="lf-close" onclick="YC.ledgerPage.closeModal()">✕</button>
        </div>
        <div class="lf-body">
            <input type="hidden" id="lf-lg-type" value="${type}">
            <label>日期</label>
            <input type="date" id="lf-lg-date" value="${item?.date || today}">
            <label>分類</label>
            <select id="lf-lg-cat">${opts}</select>
            <label>金額 (TWD)</label>
            <input type="number" id="lf-lg-amt" inputmode="decimal" placeholder="0" value="${item?.amount||''}">
            <label>備註</label>
            <input id="lf-lg-note" placeholder="可不填" value="${item?.note||''}">
            <button class="lc-save-btn" style="background:${isInc?'rgba(0,212,170,0.2)':'rgba(255,53,96,0.2)'};color:${isInc?'var(--neg)':'var(--pos)'}" onclick="YC.ledgerPage.saveLedgerEntry()">儲存</button>
        </div>`;
    }

    // ─── Form Population ──────────────────────────────────────
    function populateForm(key, item) {
        if (key === 'bank' && item.type === '外幣') {
            toggleBankCurrency('外幣');
            setTimeout(calcBankTWD, 100);
        }
        if (key === 'precious') {
            setTimeout(calcMetalValue, 100);
        }
    }

    function attachFormEvents(key) {
        // For bank currency calc on load
        const bt = document.getElementById('lf-bank-type');
        if (bt) bt.addEventListener('change', () => toggleBankCurrency(bt.value));
    }

    // ─── Form Helpers (exposed globally via YC.ledgerPage) ────
    function toggleBankCurrency(val) {
        const box = document.getElementById('lf-currency-box');
        const amt = document.getElementById('lf-amount');
        if (!box) return;
        box.style.display = val === '外幣' ? 'block' : 'none';
        if (amt) amt.readOnly = val === '外幣';
        if (val === '外幣') calcBankTWD();
    }

    function calcBankTWD() {
        const curr   = document.getElementById('lf-currency')?.value;
        const orgAmt = Number(document.getElementById('lf-org-amt')?.value) || 0;

        // Use live rates from /api/rates (cached in state); fallback to approximate
        const rates   = YC.state.getLiveRates();
        const usdTwd  = YC.state.get().exchangeRate || 32.0;
        const FALLBACK = { USD: usdTwd, JPY: usdTwd/150, EUR: usdTwd*1.08, CNY: usdTwd/7.2, HKD: usdTwd/7.8 };
        const fx      = (rates && rates[curr]) ? rates[curr] : (FALLBACK[curr] || usdTwd);
        const isLive  = !!(rates && rates[curr]);

        const disp = document.getElementById('lf-rate-disp');
        if (disp) disp.innerHTML =
            `1 ${curr} = <strong>${fx.toFixed(4)} TWD</strong>` +
            (isLive
                ? ' <span style="color:var(--neg);font-size:10px">● 即時</span>'
                : ' <span style="color:var(--t1);font-size:10px">⚠ 估算</span>');

        const amtEl = document.getElementById('lf-amount');
        if (amtEl && orgAmt) amtEl.value = Math.round(orgAmt * fx);
    }

    function calcMetalValue() {
        const mKey = document.getElementById('lf-metal-key')?.value;
        const weight= Number(document.getElementById('lf-weight')?.value) || 0;
        const unit  = document.getElementById('lf-unit')?.value;
        const customP = Number(document.getElementById('lf-custom-price')?.value) || 0;

        const mp = YC.state.getMetalPrices();
        if (!mp || !mKey || !weight) return;

        const grams  = weight * (UNIT_TO_GRAM[unit] || 1);
        const metalD = mp[mKey];
        if (!metalD) return;

        let twdPerGram = metalD.twdPerGram;
        if (customP > 0) {
            twdPerGram = customP * (mp.twdRate || 32.5) / 31.1035;
        }
        const val = Math.round(grams * twdPerGram);
        const amtEl = document.getElementById('lf-amount');
        if (amtEl) amtEl.value = val;

        // Update hint
        const hint = document.getElementById('lf-metal-hint');
        if (hint) {
            hint.textContent = `銀樓牌價: ${METAL_LABELS[mKey]} $${fmt(metalD.twdPerQian)}/台錢 | $${fmt(metalD.twdPerTael)}/台兩`;
        }
    }

    async function queryStockPrice() {
        const sym = document.getElementById('lf-symbol')?.value?.trim();
        if (!sym) return;
        const nameEl  = document.getElementById('lf-name');
        const priceEl = document.getElementById('lf-price');
        if (nameEl) nameEl.placeholder = '查詢中…';
        try {
            const data = await YC.api.fetchStock(sym);
            if (data) {
                if (nameEl)  nameEl.value  = data.name || sym;
                if (priceEl) priceEl.value = data.price || '';
            } else {
                alert('無法查到此代號，請確認格式（台股加 .TW，如 2330.TW）');
            }
        } catch(e) {
            alert('查詢失敗: ' + e.message);
        }
        if (nameEl) nameEl.placeholder = '自動帶入或手動填寫';
    }

    async function fetchMetals() {
        const btn = document.querySelector('.lc-sync-btn');
        if (btn) btn.textContent = '更新中…';
        await YC.metals.fetchPrices(true);
        render();
    }

    /** Fetch live cross-rates from /api/rates and cache in state */
    async function fetchLiveRates() {
        try {
            const res  = await fetch('/api/rates');
            const data = await res.json();
            if (data.success && data.rates) {
                YC.state.setLiveRates(data.rates);
                return data.rates;
            }
        } catch (e) {
            console.warn('[Ledger] Live rates fetch failed:', e.message);
        }
        return YC.state.getLiveRates();
    }

    function importFromDashboard() {
        if (!confirm('將會清除記帳目前的股票清單，並從「總覽持倉」匯入覆蓋，確定嗎？')) return;
        
        const holdings = YC.portfolio.getEnriched();
        const assets = getAssets();
        
        assets.stock = holdings.map(h => {
            const mkt = YC.state.getMarketData(h.symbol) || {};
            return {
                id: genId(),
                symbol: h.symbol,
                name: h.name || h.symbol,
                shares: h.shares,
                cost: h.cost,
                lastPrice: mkt.price || mkt.regularMarketPrice || h.marketValue / (h.shares || 1) || 0
            };
        });
        
        saveAssets(assets);
        renderTab('stock');
        
        // Update hero totals
        const heroEl = document.querySelector('.lc-hero-net');
        if (heroEl) {
            const t = calcTotals();
            heroEl.textContent = t.net < 0 ? `-$${fmt(Math.abs(t.net))}` : `$${fmt(t.net)}`;
        }
    }

    async function syncStockPrices() {
        const assets = getAssets();
        const symbols = [...new Set(assets.stock.map(s => s.symbol).filter(Boolean))];
        if (!symbols.length) return;
        const [batchRes] = await Promise.allSettled([YC.api.batchQuotes(symbols)]);
        if (batchRes.status === 'fulfilled') {
            Object.values(batchRes.value).forEach(q => {
                if (q && q.symbol) {
                    const existing = YC.state.getMarketData(q.symbol) || {};
                    YC.state.setMarketData(q.symbol, { ...existing, ...q });
                }
            });
            // Also update lastPrice in asset items
            assets.stock.forEach(item => {
                const mkt = YC.state.getMarketData(item.symbol);
                if (mkt) item.lastPrice = mkt.price || mkt.regularMarketPrice;
            });
            saveAssets(assets);
        }
        renderTab('stock');
        // Update hero totals
        const heroEl = document.querySelector('.lc-hero-net');
        if (heroEl) {
            const t = calcTotals();
            heroEl.textContent = t.net < 0 ? `-$${fmt(Math.abs(t.net))}` : `$${fmt(t.net)}`;
        }
    }

    // ─── Save Item ────────────────────────────────────────────
    function saveItem(key) {
        const assets = getAssets();
        let item = editId ? assets[key].find(i => i.id === editId) || { id: editId } : { id: genId() };

        if (key === 'bank') {
            item.name = document.getElementById('lf-name')?.value || '';
            item.type = document.getElementById('lf-bank-type')?.value || '活存';
            if (item.type === '外幣') {
                item.currency  = document.getElementById('lf-currency')?.value;
                item.orgAmount = Number(document.getElementById('lf-org-amt')?.value) || 0;
                // Recalculate TWD amount at save time using live rates as fallback
                const rates   = YC.state.getLiveRates();
                const usdTwd  = YC.state.get().exchangeRate || 32.0;
                const FALLBACK = { USD: usdTwd, JPY: usdTwd / 150, EUR: usdTwd * 1.08, CNY: usdTwd / 7.2, HKD: usdTwd / 7.8 };
                const fx = (rates && rates[item.currency]) ? rates[item.currency] : (FALLBACK[item.currency] || usdTwd);
                item.amount = Math.round(item.orgAmount * fx);
            } else {
                item.amount = Number(document.getElementById('lf-amount')?.value) || 0;
            }
        } else if (key === 'stock') {
            item.symbol    = document.getElementById('lf-symbol')?.value?.toUpperCase()?.trim() || '';
            item.name      = document.getElementById('lf-name')?.value || item.symbol;
            item.shares    = Number(document.getElementById('lf-shares')?.value) || 0;
            item.cost      = Number(document.getElementById('lf-cost')?.value) || 0;
            item.lastPrice = Number(document.getElementById('lf-price')?.value) || 0;
        } else if (key === 'precious') {
            item.metalKey       = document.getElementById('lf-metal-key')?.value || 'gold';
            item.name           = METAL_LABELS[item.metalKey] || item.metalKey;
            item.weight         = Number(document.getElementById('lf-weight')?.value) || 0;
            item.unit           = document.getElementById('lf-unit')?.value || 'tael';
            item.customPriceUSD = Number(document.getElementById('lf-custom-price')?.value) || 0;
            item.cost           = Number(document.getElementById('lf-cost')?.value) || 0;
            item.amount         = Number(document.getElementById('lf-amount')?.value) || 0;
        } else if (key === 'insurance') {
            item.name    = document.getElementById('lf-name')?.value || '';
            item.company = document.getElementById('lf-company')?.value || '';
            item.amount  = Number(document.getElementById('lf-amount')?.value) || 0;
            item.note    = document.getElementById('lf-note')?.value || '';
        } else if (key === 'loan') {
            item.name   = document.getElementById('lf-name')?.value || '';
            item.amount = Number(document.getElementById('lf-amount')?.value) || 0;
            item.rate   = Number(document.getElementById('lf-rate')?.value) || 0;
            item.note   = document.getElementById('lf-note')?.value || '';
        } else {
            item.name   = document.getElementById('lf-name')?.value || '';
            item.amount = Number(document.getElementById('lf-amount')?.value) || 0;
            item.note   = document.getElementById('lf-note')?.value || '';
        }

        if (editId) {
            const idx = assets[key].findIndex(i => i.id === editId);
            if (idx >= 0) assets[key][idx] = item;
        } else {
            assets[key].push(item);
        }

        saveAssets(assets);
        closeModal();
        render();
    }

    function deleteItem(key, id) {
        if (!confirm('確定刪除？')) return;
        const assets = getAssets();
        assets[key] = assets[key].filter(i => i.id !== id);
        saveAssets(assets);
        render();
    }

    // ─── Ledger Entry Save / Delete ───────────────────────────
    function saveLedgerEntry() {
        const entries = getLedger();
        const type    = document.getElementById('lf-lg-type')?.value || 'expense';
        const entry   = editId
            ? entries.find(e => e.id === editId) || { id: editId }
            : { id: genId() };

        entry.type     = type;
        entry.date     = document.getElementById('lf-lg-date')?.value || '';
        entry.category = document.getElementById('lf-lg-cat')?.value || '';
        entry.amount   = Number(document.getElementById('lf-lg-amt')?.value) || 0;
        entry.note     = document.getElementById('lf-lg-note')?.value || '';

        if (editId) {
            const idx = entries.findIndex(e => e.id === editId);
            if (idx >= 0) entries[idx] = entry;
        } else {
            entries.push(entry);
        }

        saveLedger(entries);
        closeModal();
        renderTab('ledger');
    }

    function deleteLedger(id) {
        if (!confirm('確定刪除此筆記帳？')) return;
        saveLedger(getLedger().filter(e => e.id !== id));
        renderTab('ledger');
    }

    function changeMonth(delta) {
        currentLedgerMonth.setMonth(currentLedgerMonth.getMonth() + delta);
        renderTab('ledger');
    }

    // ─── Event Attachment ─────────────────────────────────────
    function attachEvents() {
        // Tab bar horizontal scroll on mobile (touch drag)
        const tb = document.getElementById('lc-tab-bar');
        if (tb) {
            let startX, scrollStart;
            tb.addEventListener('touchstart', e => { startX = e.touches[0].clientX; scrollStart = tb.scrollLeft; });
            tb.addEventListener('touchmove',  e => { tb.scrollLeft = scrollStart - (e.touches[0].clientX - startX); });
        }
    }

    // ─── Public API ───────────────────────────────────────────
    return {
        render,
        switchTab,
        openAdd,
        openEdit,
        openLedgerAdd,
        openLedgerEdit,
        closeModal,
        saveItem,
        deleteItem,
        queryStockPrice,
        fetchMetals,
        fetchLiveRates,
        importFromDashboard,
        syncStockPrices,
        toggleBankCurrency,
        calcBankTWD,
        calcMetalValue,
        saveLedgerEntry,
        deleteLedger,
        changeMonth
    };
})();
