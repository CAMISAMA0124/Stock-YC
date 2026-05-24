/* ================================================
   stocks.js — Stock List Page
   4 Tabs: 台股 | 美股 | 台股ETF | 美股ETF
   Filter chips + Industry sub-filter
   Enhanced Detail Modal with mini chart & P&L
   ================================================ */

YC.stocks = (() => {
  let currentTab = 'tw';
  let currentFilter = 'all';

  const TABS = [
    { id: 'tw', label: '主要市場 台股' },
    { id: 'us', label: '海外市場 美股' },
    { id: 'twetf', label: '主要市場 ETF' },
    { id: 'usetf', label: '海外市場 ETF' },
  ];

  const FILTERS = [
    { id: 'all', label: '全部', cls: 'all' },
    { id: '0', label: '低估區', cls: 'c0' },
    { id: '1', label: '適中區', cls: 'c1' },
    { id: '2', label: '偏熱區', cls: 'c2' },
    { id: '3', label: '過熱區', cls: 'c3' },
  ];

  function render() {
    const el = document.getElementById('page-stocks');
    if (!el) return;

    el.innerHTML = `
    <div>
      <!-- Tab bar -->
      <div class="tabs" id="stock-tabs">
        ${TABS.map(t => `<button class="tab-btn ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <!-- Filter chips -->
      <div class="filter-row" id="stock-filters">
        ${FILTERS.map(f => `<button class="chip ${f.cls} ${f.id === currentFilter ? 'on' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>
      <!-- Industry sub-filter -->
      <div id="industry-bar" style="display:flex;gap:6px;overflow-x:auto;padding:6px 0 10px;scrollbar-width:none"></div>
      <!-- List -->
      <div class="stock-list" id="stock-list">
        ${buildSkeletonCards(6)}
      </div>
      <!-- Add stock button -->
      <div style="padding:16px 0">
        <button class="btn btn-ghost btn-full" onclick="YC.stocks.openAddModal()">
          + 新增至自選清單
        </button>
      </div>
    </div>`;

    // Tab listeners
    el.querySelector('#stock-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      currentTab = btn.dataset.tab;
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
      buildIndustryBar();
      renderList();
    });

    // Filter listeners
    el.querySelector('#stock-filters').addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      currentFilter = btn.dataset.filter;
      el.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.filter === currentFilter));
      renderList();
    });

    buildIndustryBar();
    renderList();
  }

  // ── Industry sub-filter bar ──────────────────────────
  let currentIndustry = 'all';
  function buildIndustryBar() {
    currentIndustry = 'all';
    const bar = document.getElementById('industry-bar');
    if (!bar) return;
    const list = YC.state.get().watchlist.filter(w => w.type === currentTab);
    const industries = ['全部', ...new Set(list.map(w => w.industry).filter(Boolean))];
    bar.innerHTML = industries.map(ind => `
      <button class="chip all ${ind === '全部' ? 'on' : ''}"
        style="white-space:nowrap;font-size:11px;padding:4px 10px"
        data-ind="${ind}" onclick="YC.stocks.filterIndustry('${ind}')">${ind}</button>`).join('');
  }

  function filterIndustry(ind) {
    currentIndustry = ind;
    document.querySelectorAll('#industry-bar [data-ind]').forEach(b =>
      b.classList.toggle('on', b.dataset.ind === ind));
    renderList();
  }

  function renderList() {
    const listEl = document.getElementById('stock-list');
    if (!listEl) return;

    let list = YC.portfolio.getWatchlistEnriched(currentTab);

    // Industry filter
    if (currentIndustry !== 'all' && currentIndustry !== '全部') {
      list = list.filter(s => s.industry === currentIndustry);
    }

    // Zone filter
    if (currentFilter !== 'all') {
      list = list.filter(s => s.tempScore !== null && YC.indicators.classify(s.tempScore).zone === parseInt(currentFilter));
    }

    list.sort((a, b) => (b.tempScore ?? 50) - (a.tempScore ?? 50));

    if (!list.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">此分類無清單</div></div>`;
      return;
    }
    listEl.innerHTML = list.map(s => YC.temperature.renderCard(s)).join('');
  }

  function buildSkeletonCards(n) {
    return Array(n).fill(0).map(() => `
    <div class="stock-card tc1" style="pointer-events:none">
      <div class="stock-avatar av1 skeleton" style="width:42px;height:42px;border-radius:8px"></div>
      <div class="stock-info">
        <div class="skeleton" style="width:80px;height:16px;margin-bottom:5px;border-radius:4px"></div>
        <div class="skeleton" style="width:55px;height:11px;border-radius:4px"></div>
      </div>
      <div style="flex:1"></div>
      <div class="skeleton" style="width:44px;height:44px;border-radius:8px"></div>
    </div>`).join('');
  }

  /* ── Open Add Stock Modal ────────────────────────────── */
  function openAddModal() {
    const existing = document.getElementById('add-stock-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'add-stock-modal';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });

    overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-drag" onclick="YC.stocks.closeModal('add-stock-modal')" style="cursor:pointer"></div>
      <div style="font-size:18px;font-weight:800;margin-bottom:16px">新增自選股票</div>

      <div class="form-group">
        <label class="form-label">股票代碼</label>
        <div style="display:flex;gap:8px">
          <input id="add-symbol-input" class="form-input" placeholder="例如：2330.TW 或 AAPL" style="text-transform:uppercase;flex:1">
          <button class="btn btn-secondary" id="btn-query-name" style="white-space:nowrap;padding:0 14px;font-size:12px">查詢</button>
        </div>
        <div class="form-hint">台股請加 .TW 後綴，美股直接輸入代碼</div>
      </div>

      <div class="form-group" id="tw-name-group" style="display:none">
        <label class="form-label">中文名稱 <span style="font-weight:400;color:var(--text-3);font-size:11px">（自動查詢，可修改）</span></label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="add-name-input" class="form-input" placeholder="查詢中…" style="flex:1">
          <span id="add-name-status" style="font-size:18px;width:24px;text-align:center"></span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">類別</label>
        <select id="add-type-input" class="form-input">
          <option value="tw">主要市場 台灣股票</option>
          <option value="twetf">主要市場 台灣 ETF</option>
          <option value="us">海外市場 美國股票</option>
          <option value="usetf">海外市場 美國 ETF</option>
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-secondary" style="flex:1" onclick="YC.stocks.closeModal('add-stock-modal')">取消</button>
        <button class="btn btn-primary" style="flex:1" id="btn-do-add">確認並新增</button>
      </div>
      <div id="add-result" style="margin-top:12px;font-size:13px;color:var(--text-2)"></div>
    </div>`;

    document.body.appendChild(overlay);
    
    const symbolInput = document.getElementById('add-symbol-input');
    const typeSelect  = document.getElementById('add-type-input');
    const nameGroup   = document.getElementById('tw-name-group');
    const nameInput   = document.getElementById('add-name-input');
    const nameStatus  = document.getElementById('add-name-status');

    // Fetch TW Chinese name from server
    async function fetchTWName(sym) {
      if (!sym.endsWith('.TW')) return;
      nameGroup.style.display = 'block';
      nameInput.value = '';
      nameInput.placeholder = '查詢中…';
      nameStatus.textContent = '⏳';
      try {
        const res = await fetch(`/api/twname/${encodeURIComponent(sym)}`);
        const data = await res.json();
        if (data.success && data.name) {
          nameInput.value = data.name;
          nameStatus.textContent = '✅';
        } else {
          nameInput.value = '';
          nameInput.placeholder = '查無中文名，請手動輸入';
          nameStatus.textContent = '✏️';
        }
      } catch {
        nameInput.placeholder = '查詢失敗，請手動輸入';
        nameStatus.textContent = '✏️';
      }
    }
    
    symbolInput.addEventListener('input', (e) => {
      let val = e.target.value.trim().toUpperCase();
      
      if (/^\d{4,6}[A-Z]?$/.test(val)) {
        val = val + '.TW';
        e.target.value = val;
        typeSelect.value = 'tw';
        fetchTWName(val);
      } else if (/^[A-Z]{1,5}$/.test(val)) {
        if (!typeSelect.value.includes('etf')) typeSelect.value = 'us';
        nameGroup.style.display = 'none';
      } else if (val.endsWith('.TW')) {
        if (!typeSelect.value.includes('etf')) typeSelect.value = 'tw';
        // Don't auto-fetch on every keystroke; wait for query button or blur
      } else {
        nameGroup.style.display = 'none';
      }
    });

    symbolInput.addEventListener('blur', () => {
      const val = symbolInput.value.trim().toUpperCase();
      if (val.endsWith('.TW')) fetchTWName(val);
    });

    document.getElementById('btn-query-name').addEventListener('click', () => {
      const val = symbolInput.value.trim().toUpperCase();
      if (val.endsWith('.TW')) {
        fetchTWName(val);
      } else {
        nameGroup.style.display = 'none';
      }
    });

    document.getElementById('btn-do-add').addEventListener('click', doAddStock);
  }

  async function doAddStock() {
    const symbolRaw = document.getElementById('add-symbol-input').value.trim().toUpperCase();
    const type      = document.getElementById('add-type-input').value;
    const res       = document.getElementById('add-result');
    if (!symbolRaw) { res.textContent = '請輸入代碼'; return; }

    res.innerHTML = '<span class="text-muted">確認中...</span>';

    const data = await YC.api.getYahooQuote(symbolRaw);
    if (!data || !data.price) {
      res.innerHTML = `<span style="color:var(--t3)">找不到此股票，請檢查代碼是否正確</span>`;
      return;
    }

    // Prioritize user-entered / TWSE-fetched Chinese name for TW stocks
    const customName = document.getElementById('add-name-input')?.value?.trim();
    const finalName  = customName || data.name;

    YC.portfolio.addToWatchlist({ symbol: symbolRaw, name: finalName, shortName: symbolRaw.replace('.TW', ''), type, industry: '自選' });
    // Persist the correct name into market data cache too
    YC.state.setMarketData(symbolRaw, { ...data, name: finalName });

    res.innerHTML = `<span style="color:var(--t0)">✅ 已新增 ${finalName} 至 ${type.includes('tw') ? '台股' : '美股'}清單</span>`;
    setTimeout(() => {
      closeModal('add-stock-modal');
      renderList();
    }, 1200);
  }

  function closeModal(idOrEl) {
    const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
    if (!el) return;
    const sheet = el.querySelector('.modal-sheet');
    if (sheet) {
      el.classList.add('closing'); // Overlay fade out
      sheet.classList.add('closing'); // Sheet slide down
      setTimeout(() => el.remove(), 280);
    } else {
      el.remove();
    }
  }

  /* ──────────────────────────────────────────────────────
     Enhanced Stock Detail Modal
  ────────────────────────────────────────────────────── */
  function openDetail(symbol) {
    const mkt = YC.state.getMarketData(symbol);
    const wItem = YC.state.get().watchlist.find(w => w.symbol === symbol) || { symbol, name: symbol, type: 'tw' };

    let overlay = document.getElementById('stock-detail-modal');
    const isUpdating = !!overlay;

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'stock-detail-modal';
      overlay.className = 'modal-overlay';
      overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
      document.body.appendChild(overlay);
    }

    if (!mkt || !mkt.history || mkt.history.length < 2) {
      // Show loading content inside the existings (or new) overlay
      overlay.innerHTML = `
        <div class="modal-sheet" style="${isUpdating ? 'animation:none' : ''}">
          <div class="modal-drag" onclick="YC.stocks.closeModal('stock-detail-modal')" style="cursor:pointer"></div>
          <div style="text-align:center;padding:40px 0">
            <div style="font-size:22px;font-weight:800;margin-bottom:8px">${wItem.name}</div>
            <div style="color:var(--text-3);font-size:13px">${symbol.replace('.TW', '')} · ${wItem.industry || ''}</div>
            <div style="margin-top:24px;color:var(--text-2)">📡 數據連線中...</div>
            <button class="btn btn-secondary" style="margin-top:24px" onclick="YC.stocks.closeModal('stock-detail-modal')">關閉</button>
          </div>
        </div>`;
      
      YC.api.fetchStock(symbol).then(d => {
        if (d) { openDetail(symbol); }
      });
      return;
    }

    // These calculations are moved to the deferred block
    // const temp = YC.indicators.temperatureScore({ price: mkt.price, high52w: mkt.high52w, low52w: mkt.low52w, ma200: mkt.ma200, ma50: mkt.ma50, history: mkt.history });
    // const cls = YC.indicators.classify(temp);
    const holding = YC.state.get().holdings.find(h => h.symbol === symbol);
    const currency = mkt.currency || 'USD';
    const curSym = currency === 'TWD' ? 'NT$' : '$';
    const sign = (mkt.changePct >= 0 ? '+' : '');
    const isTW = symbol.endsWith('.TW');

    // Holdings P&L computation
    let holdingHtml = '';
    if (holding) {
      const price = mkt.price || holding.costPrice || 0;
      const mv = price * (holding.shares || 0);
      const cost = ((holding.costPrice || 0) * (holding.shares || 0)) + (holding.totalFees || 0);
      const pnl = mv - cost;
      const pnlPct = cost ? ((pnl / cost) * 100) : 0;
      const pnlColor = pnl >= 0 ? 'var(--pos)' : 'var(--neg)';
      holdingHtml = `
        <div class="detail-pnl-box">
          <div class="detail-pnl-row">
            <span>持股 ${holding.shares} 股 @ ${curSym}${holding.costPrice?.toFixed(isTW ? 1 : 2)}</span>
            <span style="font-weight:700">${curSym}${mv.toLocaleString('zh-TW', { minimumFractionDigits: isTW ? 0 : 2, maximumFractionDigits: isTW ? 0 : 2 })}</span>
          </div>
          <div class="detail-pnl-row">
            <span style="font-size:11px;color:var(--text-3)">累計收支 (含目前的 ${curSym}${holding.totalFees || 0} 手續費)：</span>
            <span style="color:${pnlColor};font-size:12px;font-weight:700">${pnl >= 0 ? '+' : '-'}${curSym}${Math.abs(pnl).toLocaleString('zh-TW', { minimumFractionDigits: isTW ? 0 : 2, maximumFractionDigits: isTW ? 0 : 2 })} <span style="font-size:10px;font-weight:normal">(${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)</span></span>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="btn btn-secondary" style="flex:1" onclick="YC.stocks.closeModal('stock-detail-modal')">關閉</button>
          <button class="btn btn-ghost" style="flex:1" onclick="YC.stocks.openEditHoldingModal('${symbol}')">✏️ 編輯持股</button>
          <button class="btn btn-ghost" style="flex:1" onclick="YC.app.navigate('ai')">🤖 AI分析</button>
        </div>
        <button class="btn btn-danger btn-full" style="margin-top:10px; opacity:0.7" onclick="YC.stocks.removeStock('${symbol}')">🗑️ 從清單刪除標的 (含持股)</button>
        `;
    } else {
      holdingHtml = `
        <div style="padding:12px;background:var(--bg-input);border-radius:12px;margin-top:4px">
          <div style="font-size:12px;color:var(--text-2);margin-bottom:10px;font-weight:600">🚀 快速加入持股</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
            <div><div class="form-label" style="font-size:10px">股數</div>
              <input id="detail-shares" class="form-input" type="number" placeholder="0" min="0" style="padding:8px 6px;font-size:13px"></div>
            <div><div class="form-label" style="font-size:10px">總買入金額</div>
              <input id="detail-total-cost" class="form-input" type="number" placeholder="0" min="0" step="1" style="padding:8px 6px;font-size:13px"></div>
            <div><div class="form-label" style="font-size:10px">手續費</div>
              <input id="detail-fees" class="form-input" type="number" placeholder="0" min="0" style="padding:8px 6px;font-size:13px"></div>
          </div>
          <button class="btn btn-primary btn-full" onclick="YC.stocks.addToPortfolioFromDetail('${symbol}')">確認加入持股</button>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="btn btn-secondary" style="flex:1" onclick="YC.stocks.closeModal('stock-detail-modal')">關閉</button>
          <button class="btn btn-danger" style="flex:1; opacity:0.7" onclick="YC.stocks.removeStock('${symbol}')">🗑️ 刪除標的</button>
        </div>`;
    }

    // 52W range bar
    const h52 = mkt.high52w || mkt.price * 1.3;
    const l52 = mkt.low52w || mkt.price * 0.7;
    const rangePct = h52 > l52 ? Math.round(((mkt.price - l52) / (h52 - l52)) * 100) : 50;
    // const mddWarningHtml = `<span id="detail-mdd-inline" style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--bg-input);color:var(--text-3);margin-right:6px">MDD --%</span>`; // Moved to template

    // Mini spYCline SVG (30-day history)
    const spYCSvg = buildSpYCline(mkt.history || [], mkt.price);

    // Initial placeholders for instant modal popup
    overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:92vh;${isUpdating ? 'animation:none' : ''}">
      <div class="modal-drag" onclick="YC.stocks.closeModal('stock-detail-modal')" style="cursor:pointer"></div>

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:22px;font-weight:900;letter-spacing:-0.5px">${wItem.name}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;display:flex;align-items:center;">
            <span id="detail-mdd-inline" style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--bg-input);color:var(--text-3);margin-right:6px">MDD --%</span>
            ${symbol.replace('.TW', '')} · ${wItem.industry || ''}
            ${mkt.exchangeName ? `· ${mkt.exchangeName}` : ''}
          </div>
        </div>
        <div id="detail-temp-badge" class="temp-badge text-muted" style="font-size:13px;padding:5px 12px;white-space:nowrap;background:var(--bg-input)">
          -- ⚖️
        </div>
      </div>

      <!-- Price Block -->
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">
        <div>
          <div style="font-size:36px;font-weight:900;letter-spacing:-1.5px;line-height:1">
            ${curSym}${mkt.price?.toLocaleString('zh-TW', { minimumFractionDigits: isTW ? 1 : 2, maximumFractionDigits: isTW ? 1 : 2 }) || '--'}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <span class="stock-change ${mkt.changePct >= 0 ? 'pos' : 'neg'}" style="font-size:16px;font-weight:700">
              ${sign}${mkt.changePct?.toFixed(2)}% (${sign}${curSym}${Math.abs(mkt.change || 0).toFixed(isTW ? 1 : 2)})
            </span>
            <span style="font-size:11px;color:var(--text-3)">即時報價</span>
          </div>
        </div>
        <div style="text-align:right">
           <div style="font-size:11px;color:var(--text-3)">成交量</div>
           <div style="font-size:14px;font-weight:700">${mkt.volume ? (mkt.volume >= 1e6 ? (mkt.volume / 1e6).toFixed(1) + 'M' : mkt.volume.toLocaleString()) : '--'}</div>
        </div>
      </div>

      <!-- Professional Chart Container -->
      <div id="detail-chart-container" style="width:100%;height:200px;background:rgba(0,0,0,0.2);border-radius:12px;margin-bottom:16px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px">
          📈 正在載入圖表數據...
        </div>
      </div>

      <!-- 52W Range Bar -->
      <div style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3);margin-bottom:6px">
          <span>52W最低 ${curSym}${mkt.low52w?.toFixed(isTW ? 1 : 2) || '--'}</span>
          <span style="color:var(--text-2);font-weight:600">52週位階 ${rangePct}%</span>
          <span>52W最高 ${curSym}${mkt.high52w?.toFixed(isTW ? 1 : 2) || '--'}</span>
        </div>
        <div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${rangePct}%;background:linear-gradient(90deg, #00d4aa, #f5c842, #ff3560);border-radius:3px;transition:width .6s ease"></div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Data Grid 2x4 -->
      <div class="detail-grid" style="margin-top:10px; grid-template-columns: repeat(4, 1fr);">
        ${[
        ['MA50', mkt.ma50 ? `${curSym}${mkt.ma50.toFixed(isTW ? 1 : 2)}` : '--'],
        ['MA200', mkt.ma200 ? `${curSym}${mkt.ma200.toFixed(isTW ? 1 : 2)}` : '--'],
        ['MA200 乖離', mkt.ma200 && mkt.price ? `<span id="detail-ma200-dev">--%</span>` : '--'],
        ['RSI(14)', `<span id="detail-rsi-val">--</span>`],
        ['日內最高', mkt.dayHigh ? `${curSym}${mkt.dayHigh.toFixed(isTW ? 1 : 2)}` : '--'],
        ['日內最低', mkt.dayLow ? `${curSym}${mkt.dayLow.toFixed(isTW ? 1 : 2)}` : '--'],
        ['IBS 短線', `<span id="detail-ibs-val">--</span>`],
        ['量比', mkt.volume && mkt.avgVolume ? `<span id="detail-vol-ratio">--x</span>` : '--'],
      ].map(([l, v]) => `
        <div class="detail-cell">
          <div class="detail-cell-lbl">${l}</div>
          <div class="detail-cell-val" id="val-${l.replace(' ', '-')}" style="font-size: 13px;">${v}</div>
        </div>`).join('')}
      </div>

      <!-- Temperature detail -->
      <div id="detail-temp-box" style="display:flex;align-items:center;gap:12px;margin-top:16px;padding:12px 14px;background:var(--bg-input);border-radius:12px;border:1px solid rgba(255,255,255,0.05);opacity:0.5;transition:opacity 0.3s">
        <div style="width:52px;height:52px;background:var(--bg-list);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--text-3)">...</div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px">溫度診斷分析</div>
          <div id="detail-temp-title" style="font-size:15px;font-weight:800;color:var(--text-3)">載入分析中...</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;line-height:1.4">正在聚合指標進行風險測算</div>
        </div>
      </div>

      <!-- 💎 Value Fundamentals Section -->
      <div style="margin-top:16px">
        <div style="font-size:12px;color:var(--text-2);margin-bottom:8px;font-weight:600;display:flex;align-items:center;gap:6px">
          <span>💎 價值基礎指標</span>
          <span style="font-size:10px;font-weight:400;color:var(--text-3)">(TTM)</span>
        </div>
        <div style="font-size:11px;color:var(--text-3);line-height:1.5;margin-bottom:12px;background:rgba(255,255,255,0.02);padding:10px 12px;border-radius:8px;border:1px dashed rgba(255,255,255,0.05);">
          <div style="margin-bottom:4px">📍 <b style="color:var(--text-2)">本益比 (P/E)</b>：買進這間公司，大約幾年能靠本業賺回來。越低估值相對越便宜。</div>
          <div style="margin-bottom:4px">📍 <b style="color:var(--text-2)">殖利率</b>：買進並持有收息的現金回報率。通常作為下檔風險保護傘指標。</div>
          <div>📍 <b style="color:var(--text-2)">淨值比 (P/B)</b>：衡量股價相對於公司清算價值的倍數。低於 1 倍代表股價具備安全邊際。</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div class="detail-cell" style="padding:10px">
             <div class="detail-cell-lbl">P/E 本益比</div>
             <div class="detail-cell-val" style="font-size:15px">${mkt.pe ? mkt.pe.toFixed(1) + 'x' : '--'}</div>
          </div>
          <div class="detail-cell" style="padding:10px">
             <div class="detail-cell-lbl">殖利率</div>
             <div class="detail-cell-val" style="font-size:15px;color:var(--t0)">${mkt.divYield ? (mkt.divYield).toFixed(2) + '%' : (isTW ? '--' : '0.00%')}</div>
          </div>
          <div class="detail-cell" style="padding:10px">
             <div class="detail-cell-lbl">P/B 淨值比</div>
             <div class="detail-cell-val" style="font-size:15px">${mkt.pb ? mkt.pb.toFixed(1) + 'x' : '--'}</div>
          </div>
        </div>
      </div>

      <!-- ⚠️ Cash Flow Analysis Section -->
      ${(() => {
        const isETF = wItem.type.includes('etf') || wItem.industry?.toUpperCase().includes('ETF');
        if (isETF) {
          return `
          <div style="margin-top:16px">
            <div style="font-size:12px;color:var(--text-2);margin-bottom:10px;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
              <span>⚠️ 現金流量表分析</span>
            </div>
            <div style="padding:14px 12px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px dashed rgba(255,255,255,0.1);text-align:center;">
               <div style="font-size:13px;font-weight:700;color:var(--text-2);margin-bottom:6px">💡 ETF 不適用此項分析</div>
               <div style="font-size:11px;color:var(--text-3);line-height:1.5">ETF 為追蹤特定指數之一籃子股票組合，並非獨立營運企業。請關注其內扣費用、折溢價與成分股表現，而非企業現金流。</div>
            </div>
          </div>`;
        }

        const cache = YC.state.get().cfCache || {};
        const cached = cache[symbol];
        return `
        <div style="margin-top:16px">
          <div style="font-size:12px;color:var(--text-2);margin-bottom:10px;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
            <span>⚠️ 現金流量表分析</span>
          </div>
          ${!cached ? `
          <button id="btn-analyze-cf" onclick="YC.stocks.analyzeCashFlow('${symbol}')"
            style="width:100%; margin-bottom:12px; padding:16px; background:linear-gradient(135deg, rgba(82, 113, 255, 0.15), rgba(82, 113, 255, 0.05)); border:1px solid rgba(82, 113, 255, 0.3); border-radius:12px; color:var(--text-1); font-size:14px; font-weight:700; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:8px;">
            <span style="font-size:16px">🔍</span>
            <span>取得深度現金流分析數據</span>
          </button>
          ` : ''}
          <div id="cf-result-box" style="${!cached ? 'display:none;' : ''}padding:12px;background:var(--bg-input);border-radius:12px;border:1px solid rgba(255,255,255,0.05);">
          </div>
        </div>`;
      })()}

      <!-- 📊 Historical Backtest Section -->
      <div id="detail-backtest-container" style="margin-top:16px; min-height: 80px;">
        <div style="font-size:12px;color:var(--text-2);margin-bottom:10px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:6px">
          <span>📊 歷史趨勢回測</span>
          <span style="font-size:10px;font-weight:400;color:var(--text-3)">(過去 2 年)</span>
        </div>
        <div style="text-align:center;padding:10px;color:var(--text-3);font-size:12px;background:var(--bg-card);border-radius:12px;border:1px solid var(--border);">
           正在回測歷史獲利模式...
        </div>
      </div>

      <!-- 📝 Investment Journal Section -->
      <div style="margin-top:20px;padding:14px;background:rgba(124,111,255,0.05);border-radius:12px;border:1px dashed var(--accent-dim)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:12px;color:var(--accent);font-weight:700">📝 投資筆記與心得</div>
          <button class="btn-icon" style="padding:2px;color:var(--accent)" onclick="YC.stocks.saveNote('${symbol}')">儲存</button>
        </div>
        <textarea id="stock-note-${symbol.replace('.', '-')}" class="form-input" 
          placeholder="點擊輸入筆記 (例如為何看好此股票、預計停損停利點...)" 
          style="background:transparent;border:none;padding:0;font-size:13px;height:60px;resize:none;line-height:1.5">${YC.state.getNote(symbol) || ''}</textarea>
      </div>

      <div class="divider" style="margin:20px 0 10px"></div>

      <!-- Holdings Section -->
      ${holdingHtml}
    </div>`;

    document.body.appendChild(overlay);

    // 4. Render chart & Heavy stats — deferred to ensure modal animation is perfectly smooth
    setTimeout(async () => {
      const chartEl = document.getElementById('detail-chart-container');
      if (!chartEl) return;

      let latestMkt = YC.state.getMarketData(symbol) || mkt;
      if (!latestMkt.history || latestMkt.history.length < 2) {
        chartEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px">📡 載入 K 線資料中...</div>`;
        const fresh = await YC.api.fetchStock(symbol);
        if (fresh) latestMkt = fresh;
      }

      // Calculate Temperature Score (HEAVY)
      const temp = YC.indicators.temperatureScore({ 
        price: latestMkt.price, high52w: latestMkt.high52w, low52w: latestMkt.low52w, 
        ma200: latestMkt.ma200, ma50: latestMkt.ma50, history: latestMkt.history 
      });
      const cls = YC.indicators.classify(temp);

      // Update Top Badge
      const badge = document.getElementById('detail-temp-badge');
      if (badge) {
        badge.className = `temp-badge ${cls.cls}`;
        badge.innerHTML = `${temp} ${cls.icon}`;
        badge.style.background = '';
        badge.classList.remove('text-muted');
      }

      // Update Analysis Box
      const tBox = document.getElementById('detail-temp-box');
      if (tBox) {
        tBox.style.opacity = '1';
        tBox.innerHTML = `
          ${YC.temperature.renderMiniGauge(temp, 52)}
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px">溫度診斷分析</div>
            <div style="font-size:15px;font-weight:800;color:${cls.color}">${cls.label} (${temp}/100)</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px;line-height:1.4">${cls.desc || '綜合 RSI 超買超賣、MA 均線乖離與 52 週位階進行測算'}</div>
          </div>
        `;
      }

      // 1. Render Chart
      YC.charting.renderPriceChart('detail-chart-container', latestMkt.history || [], {
        ma50: true, ma200: true,
        color: latestMkt.changePct >= 0 ? 'var(--pos)' : 'var(--neg)'
      });

      // 2. Heavy Indicators Calculation & Update
      const histPrices = latestMkt.history?.map(h => h.c) || [];
      const mddVal = YC.indicators.calculateMDD(histPrices);
      const rsiVal = latestMkt.history?.length >= 14 ? YC.indicators.calculateRSI(latestMkt.history.map(h => h.c || h)).toFixed(0) : '--';
      const ibsVal = YC.indicators.calculateIBS(latestMkt.price, latestMkt.dayHigh, latestMkt.dayLow);
      
      const mddEl = document.getElementById('detail-mdd-inline');
      if (mddEl) {
        mddEl.textContent = `MDD -${mddVal}%`;
        if (parseFloat(mddVal) >= 30) {
          mddEl.style.background = 'rgba(0,212,170,0.15)';
          mddEl.style.color = 'var(--neg)';
          mddEl.innerHTML += ' ⚠️高波動';
        }
      }
      
      const rsiEl = document.getElementById('detail-rsi-val');
      if (rsiEl && rsiVal !== '--') {
        rsiEl.textContent = rsiVal;
        rsiEl.parentElement.style.color = rsiVal <= 30 ? 'var(--neg)' : rsiVal >= 70 ? 'var(--pos)' : 'inherit';
      }

      const ma200Dev = latestMkt.ma200 && latestMkt.price ? ((latestMkt.price - latestMkt.ma200) / latestMkt.ma200 * 100).toFixed(2) : null;
      const maDevEl = document.getElementById('detail-ma200-dev');
      if (maDevEl && ma200Dev !== null) {
        maDevEl.style.color = parseFloat(ma200Dev) >= 0 ? 'var(--pos)' : 'var(--neg)';
        maDevEl.textContent = `${parseFloat(ma200Dev) >= 0 ? '+' : ''}${ma200Dev}%`;
      }

      const ibsEl = document.getElementById('detail-ibs-val');
      if (ibsEl && ibsVal !== null) {
        const ibsStr = ibsVal.toFixed(2);
        let ibsColor = 'inherit';
        if (ibsVal <= 0.2) ibsColor = 'var(--neg)';
        else if (ibsVal >= 0.8) ibsColor = 'var(--pos)';
        ibsEl.textContent = ibsStr;
        ibsEl.parentElement.style.color = ibsColor;
      }

      const volRatio = latestMkt.volume && latestMkt.avgVolume ? (latestMkt.volume / latestMkt.avgVolume).toFixed(2) : null;
      const volEl = document.getElementById('detail-vol-ratio');
      if (volEl && volRatio !== null) {
        volEl.textContent = `${volRatio}x`;
        volEl.parentElement.style.color = parseFloat(volRatio) > 1.5 ? 'var(--t2)' : 'inherit';
      }

      // 3. Fetch Backtest
      YC.api.getBacktest(symbol, 2).then(bt => {
        const btContainer = document.getElementById('detail-backtest-container');
        if (!btContainer || !bt) return;
        const r = bt.rating || {};
        const stats = bt.statistics || {};
        const winRate30 = stats.winRate?.['30d'] || 'N/A';
        const avgRet30 = stats.avgReturn?.['30d'] || 'N/A';
        const mdd30 = stats.maxDrawdown?.['30d'] || 'N/A';

        btContainer.innerHTML = `
          <div style="font-size:12px;color:var(--text-2);margin-bottom:8px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:6px">
            <div>
              <span>🔹 趨勢與勝率回測</span>
              <span style="font-size:10px;font-weight:400;color:var(--text-3)">(過去 2 年 共 ${stats.totalSignals} 次交易)</span>
            </div>
            <div style="font-size:10px;color:var(--pos);background:var(--accent-dim);padding:4px 8px;border-radius:4px">
              ${r.label || '策略模擬'}
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-3);line-height:1.5;margin-bottom:12px;background:rgba(255,255,255,0.02);padding:10px 12px;border-radius:8px;border:1px dashed rgba(255,255,255,0.05);">
             <div style="margin-bottom:4px">📍 <b style="color:var(--text-2)">回測評等</b>：基於歷史均線與 RSI 指標的進出場「盲測」結果。適合用來判斷現在進場的歷史機率與預期收益幅度。</div>
             <div>📍 <b style="color:var(--text-2)">最大回撤 (MDD)</b>：在此策略下，買進後帳面曾「跌過最深」的最大幅度。必須將其視為這筆投資可能遭遇的最壞心理衝擊。</div>
          </div>
          <div style="background:var(--bg-card);border-radius:12px;border:1px solid var(--border);padding:14px;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
               <div>
                 <div style="font-size:11px;color:var(--text-3);letter-spacing:0.5px">回測評等</div>
                 <div style="font-size:15px;font-weight:800;color:${r.color || 'var(--text-1)'}">${r.label}</div>
               </div>
                <div style="text-align:right">
                  <div style="font-size:11px;color:var(--text-3);letter-spacing:0.5px">30日/90日上漲率</div>
                  <div style="font-size:16px;font-weight:800">
                    <span style="color:${winRate30 !== 'N/A' && parseFloat(winRate30) >= 60 ? 'var(--pos)' : 'var(--text-1)'}">${winRate30}</span>
                    <span style="font-size:12px;color:var(--text-3);font-weight:400"> / ${stats.winRate?.['90d'] || '--'}</span>
                  </div>
                </div>
             </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
               <div class="detail-cell" style="padding:10px">
                 <div class="detail-cell-lbl">平均回報 (30d / 90d)</div>
                 <div class="detail-cell-val" style="font-size:14px">
                    <span style="color:${avgRet30 !== 'N/A' && parseFloat(avgRet30) > 0 ? 'var(--pos)' : 'var(--text-1)'}">${avgRet30}</span>
                    <span style="font-size:11px;color:var(--text-3);font-weight:400"> / ${stats.avgReturn?.['90d'] || '--'}</span>
                  </div>
               </div>
               <div class="detail-cell" style="padding:10px">
                 <div class="detail-cell-lbl">最大回撤幅度</div>
                 <div class="detail-cell-val" style="font-size:14px;color:var(--neg)">${mdd30 !== 'N/A' ? '-' + mdd30 : mdd30}</div>
               </div>
            </div>
          </div>`;
      }).catch(() => {
        const btContainer = document.getElementById('detail-backtest-container');
        if (btContainer) btContainer.innerHTML = '';
      });

      // 4. Render cached Cash Flow if present
      const cfCache = YC.state.get().cfCache || {};
      if (cfCache[symbol]) {
        renderCashFlow(cfCache[symbol], document.getElementById('cf-result-box'));
      }

    }, 400); // Wait for the full slide-up animation (350ms) to complete first


  }

  /* ── SpYCline SVG Builder ───────────────────────────── */
  function buildSpYCline(history, currentPrice) {
    const data = history.slice(-30).map(h => h.c || h || currentPrice);
    if (data.length < 2) return `<div style="flex:1;height:48px;background:var(--bg-input);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-3)">尚無走勢</div>`;

    const w = 140, h = 48, pad = 4;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const isUp = data[data.length - 1] >= data[0];
    const color = isUp ? 'var(--pos)' : 'var(--neg)';
    const fillPts = `${pts[0].split(',')[0]},${h} ${pts.join(' ')} ${pts[pts.length - 1].split(',')[0]},${h}`;

    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex:1;min-width:0;overflow:visible">
      <defs>
        <linearGradient id="sg${Date.now()}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${fillPts}" fill="url(#sg${Date.now()})" />
      <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="3" fill="${color}"/>
    </svg>`;
  }

  /* ── Quick add to portfolio from detail ─────────────── */
  function addToPortfolioFromDetail(symbol) {
    const wItem = YC.state.get().watchlist.find(w => w.symbol === symbol);
    const mkt = YC.state.getMarketData(symbol);
    const sharesEl = document.getElementById('detail-shares');
    const totalCostEl = document.getElementById('detail-total-cost');
    const feesEl = document.getElementById('detail-fees');
    const shares = parseFloat(sharesEl?.value) || 0;
    const totalBuyAmt = parseFloat(totalCostEl?.value) || 0;
    const totalFees = parseFloat(feesEl?.value) || 0;
    
    if (!shares || shares <= 0) { sharesEl?.focus(); sharesEl?.classList.add('error'); return; }
    if (totalBuyAmt <= 0) { totalCostEl?.focus(); totalCostEl?.classList.add('error'); return; }
    
    const costPrice = totalBuyAmt / shares;
    if (!wItem) return;

    YC.state.addHolding({
      symbol, name: wItem.name, type: wItem.type,
      shares, costPrice, totalFees, targetWeight: 0, currency: wItem.type.includes('tw') ? 'TWD' : 'USD',
    });
    YC.portfolio.addToWatchlist(wItem);
    closeModal('stock-detail-modal');
    renderList();
  }

  /* ── Edit holding from detail ───────────────────────── */
  function openEditHoldingModal(symbol) {
    const holding = YC.state.get().holdings.find(h => h.symbol === symbol);
    const mkt = YC.state.getMarketData(symbol);
    if (!holding) return;
    const isTW = symbol.endsWith('.TW');
    const curSym = isTW ? 'NT$' : '$';

    document.getElementById('stock-detail-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'edit-holding-modal';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
    overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-drag" onclick="YC.stocks.closeModal('edit-holding-modal')" style="cursor:pointer"></div>
      <div style="font-size:18px;font-weight:800;margin-bottom:4px">✏️ 編輯持股</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">${holding.name} · ${symbol.replace('.TW', '')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">持股總數</label>
          <input id="eh-shares" class="form-input" type="number" value="${holding.shares || 0}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">總買入金額 (${curSym})</label>
          <input id="eh-total-cost" class="form-input" type="number" value="${(holding.costPrice || 0) * (holding.shares || 0)}" min="0" step="1">
        </div>
        <div class="form-group">
          <label class="form-label">累計手續費</label>
          <input id="eh-fees" class="form-input" type="number" value="${holding.totalFees || 0}" min="0">
        </div>
        <div class="form-group" style="grid-column: 1 / -1">
          <label class="form-label">再平衡目標比重 (%) <span style="color:var(--text-3);font-weight:normal">(選填，用於計算具體買賣建議)</span></label>
          <input id="eh-target" class="form-input" type="number" value="${holding.targetWeight || 0}" min="0" max="100" placeholder="例如: 10">
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" style="flex:1" onclick="YC.stocks.closeModal('edit-holding-modal')">取消</button>
        <button class="btn btn-primary" style="flex:1" onclick="YC.stocks.saveEditHolding('${symbol}')">儲存更改</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }

  function saveEditHolding(symbol) {
    const shares = parseFloat(document.getElementById('eh-shares')?.value) || 0;
    const totalBuyAmt = parseFloat(document.getElementById('eh-total-cost')?.value) || 0;
    const totalFees = parseFloat(document.getElementById('eh-fees')?.value) || 0;
    const targetWeight = parseFloat(document.getElementById('eh-target')?.value) || 0;
    
    // Internal average cost calculation
    const costPrice = shares > 0 ? (totalBuyAmt / shares) : 0;
    
    YC.state.updateHolding(symbol, { shares, costPrice, totalFees, targetWeight });
    closeModal('edit-holding-modal');
    YC.dashboardPage?.refreshData();
  }

  function addToPortfolio(symbol) {
    openDetail(symbol); // Redirect for proper input and review
  }

  function saveNote(symbol) {
    const id = `stock-note-${symbol.replace('.', '-')}`;
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.value.trim();
    YC.state.saveNote(symbol, text);

    // Feedback
    const btn = el.previousElementSibling.querySelector('button');
    if (btn) {
      const old = btn.textContent;
      btn.textContent = '已儲存！';
      btn.style.color = 'var(--t0)';
      setTimeout(() => {
        btn.textContent = old;
        btn.style.color = 'var(--accent)';
      }, 1500);
    }
  }

  function removeStock(symbol) {
    if (confirm(`確定要將 ${symbol} 從清單中刪除嗎？\n如果是已持有的股票，持股資料也會一併被移除。`)) {
      YC.portfolio.removeFromWatchlist(symbol);
      closeModal('stock-detail-modal');
      renderList();
    }
  }

  function refresh() { renderList(); }

  async function analyzeCashFlow(symbol) {
    const box = document.getElementById('cf-result-box');
    const btn = document.getElementById('btn-analyze-cf');
    if (!box) return;

    if (btn) btn.style.display = 'none';
    box.style.display = 'block';

    const stateProps = YC.state.get();
    stateProps.cfCache = stateProps.cfCache || {};
    let cfData = stateProps.cfCache[symbol];

    if (cfData) {
      renderCashFlow(cfData, box);
      return;
    }

    box.innerHTML = '<div style="text-align:center;color:var(--text-3);font-size:12px;padding:10px 0;">📡 正在取得財政報表資料...</div>';

    try {
      const res = await fetch('/api/finance/' + symbol);
      if (!res.ok) throw new Error('Network error');
      cfData = await res.json();
      
      const ocf = cfData.ocf || 0;
      let icf = cfData.icf || 0;
      const fcf = cfData.fcf || 0;

      // Impute ICF if missing but FCF and OCF are present (FCF ≈ OCF + ICF_CapEx)
      if (icf === 0 && fcf !== 0 && ocf !== 0) {
        icf = fcf - ocf;
      }
      
      cfData._parsed = { ocf, icf, fcf };

      stateProps.cfCache[symbol] = cfData;
      YC.state.patch({ cfCache: stateProps.cfCache });

      renderCashFlow(cfData, box);
    } catch(err) {
      box.innerHTML = '<div style="color:var(--neg);font-size:12px;text-align:center;padding:10px 0;">🔴 取得資料失敗，請稍後再試</div>';
      if (btn) btn.style.display = 'inline-block';
    }
  }

  function renderCashFlow(cfData, box) {
    const p = cfData._parsed || {};
    let label = '普通';
    let color = 'var(--text-1)';
    let desc = '';
    const ocf = p.ocf || 0;
    const icf = p.icf || 0;

    if (ocf > 0 && icf < 0) {
      label = '🛡️ 穩健經營型'; color = 'var(--pos)';
      desc = '營業現金穩定流入，且將資金持續投入資產擴張或償還債務，屬於體質優良的發展模式。';
    } else if (ocf > 0 && icf >= 0) {
      label = '📈 轉型收益型'; color = 'var(--t0)';
      desc = '本業持續賺錢，且透過處分資產或轉投資收回資金，手頭現金充裕。';
    } else if (ocf < 0 && icf < 0) {
      label = '⚠️ 燒錢擴張型'; color = 'var(--t2)';
      desc = '本業尚未實現正向現金流，且仍持續投入資金擴張，高度依賴外部融資存活。';
    } else if (ocf <= 0 && icf > 0) {
      label = '🚨 危險警戒型'; color = 'var(--neg)';
      desc = '本業虧損流失現金，需依賴變賣資產求生，財務風險極高！';
    } else {
      label = '❓ 型態不明';
      desc = '無法取得完整的營業與投資現金流數據，可能為控股公司或處於財報真空期。';
    }

    const fmt = val => {
      if (val === 0) return '無資料';
      const absV = Math.abs(val) / 1000000;
      return (val > 0 ? '+' : '-') + absV.toFixed(1) + 'M';
    };

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
         <div>
             <div style="font-size:11px;color:var(--text-3);letter-spacing:0.5px;margin-bottom:4px">現金流健康度評定</div>
             <div style="font-size:16px;font-weight:800;color:${color}">${label}</div>
         </div>
         <div style="text-align:right">
             <div style="font-size:11px;color:var(--text-3);letter-spacing:0.5px;margin-bottom:4px">自由現金流 (FCF)</div>
             <div style="font-size:13px;font-weight:700;color:${p.fcf > 0 ? 'var(--pos)' : (p.fcf < 0 ? 'var(--neg)' : 'var(--text-1)')}">${fmt(p.fcf || 0)}</div>
         </div>
      </div>
      <div style="font-size:12px;color:var(--text-3);line-height:1.5;margin-bottom:14px;">${desc}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="detail-cell" style="padding:10px;background:var(--bg-card);border:1px solid transparent">
           <div class="detail-cell-lbl" style="font-size:10px">營業現金流入 (OCF)</div>
           <div class="detail-cell-val" style="font-size:14px;color:${ocf>=0?'var(--pos)':'var(--neg)'};margin-top:2px">${fmt(ocf)}</div>
        </div>
        <div class="detail-cell" style="padding:10px;background:var(--bg-card);border:1px solid transparent">
           <div class="detail-cell-lbl" style="font-size:10px">投資現金流出 (ICF)</div>
           <div class="detail-cell-val" style="font-size:14px;color:${icf>=0?'var(--pos)':'var(--neg)'};margin-top:2px">${fmt(icf)}</div>
        </div>
      </div>
    `;
  }

  return {
    render, refresh, openDetail, openAddModal, addToPortfolio,
    addToPortfolioFromDetail, openEditHoldingModal, saveEditHolding, filterIndustry,
    saveNote, removeStock, closeModal, analyzeCashFlow, renderCashFlow
  };
})();