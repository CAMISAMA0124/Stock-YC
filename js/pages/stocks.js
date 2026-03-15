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
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-drag"></div>
      <div style="font-size:18px;font-weight:800;margin-bottom:16px">新增自選股票</div>

      <div class="form-group">
        <label class="form-label">股票代碼</label>
        <input id="add-symbol-input" class="form-input" placeholder="例如：2330.TW 或 AAPL" style="text-transform:uppercase">
        <div class="form-hint">台股請加 .TW 後綴，美股直接輸入代碼</div>
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
        <button class="btn btn-secondary" style="flex:1" onclick="document.getElementById('add-stock-modal').remove()">取消</button>
        <button class="btn btn-primary" style="flex:1" id="btn-do-add">確認並新增</button>
      </div>
      <div id="add-result" style="margin-top:12px;font-size:13px;color:var(--text-2)"></div>
    </div>`;

    document.body.appendChild(overlay);
    
    // Add auto-detection listener
    const symbolInput = document.getElementById('add-symbol-input');
    const typeSelect = document.getElementById('add-type-input');
    
    symbolInput.addEventListener('input', (e) => {
      let val = e.target.value.trim().toUpperCase();
      
      // 1. Auto-.TW for 4-digit numbers (Taiwan stocks)
      if (/^\d{4}$/.test(val)) {
        val = val + '.TW';
        e.target.value = val;
        // Auto-select type
        typeSelect.value = 'tw';
      }
      
      // 2. Auto-select US for common US patterns (length 1-5, no dot, no digits)
      else if (/^[A-Z]{1,5}$/.test(val)) {
         // Don't override if user already picked ETF
         if (!typeSelect.value.includes('etf')) {
           typeSelect.value = 'us';
         }
      }
      
      // 3. Auto-select TW if ends with .TW
      else if (val.endsWith('.TW')) {
        if (!typeSelect.value.includes('etf')) {
          typeSelect.value = 'tw';
        }
      }
    });

    document.getElementById('btn-do-add').addEventListener('click', doAddStock);
  }

  async function doAddStock() {
    const symbolRaw = document.getElementById('add-symbol-input').value.trim().toUpperCase();
    const type = document.getElementById('add-type-input').value;
    const res = document.getElementById('add-result');
    if (!symbolRaw) { res.textContent = '請輸入代碼'; return; }

    res.innerHTML = '<span class="text-muted">確認中...</span>';

    const data = await YC.api.getYahooQuote(symbolRaw);
    if (!data || !data.price) {
      res.innerHTML = `<span style="color:var(--t3)">找不到此股票，請檢查代碼是否正確</span>`;
      return;
    }

    YC.portfolio.addToWatchlist({ symbol: symbolRaw, name: data.name, shortName: symbolRaw.replace('.TW', ''), type, industry: '自選' });
    YC.state.setMarketData(symbolRaw, data);

    res.innerHTML = `<span style="color:var(--t0)">✅ 已新增 ${data.name} 至 ${type.includes('tw') ? '台股' : '美股'}清單</span>`;
    setTimeout(() => {
      document.getElementById('add-stock-modal')?.remove();
      renderList();
    }, 1200);
  }

  /* ──────────────────────────────────────────────────────
     Enhanced Stock Detail Modal
  ────────────────────────────────────────────────────── */
  function openDetail(symbol) {
    const mkt = YC.state.getMarketData(symbol);
    const wItem = YC.state.get().watchlist.find(w => w.symbol === symbol) || { symbol, name: symbol, type: 'tw' };

    const existing = document.getElementById('stock-detail-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'stock-detail-modal';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    if (!mkt || !mkt.history || mkt.history.length < 2) {
      // No data yet or missing history — show loading state
      overlay.innerHTML = `
        <div class="modal-sheet">
          <div class="modal-drag"></div>
          <div style="text-align:center;padding:40px 0">
            <div style="font-size:22px;font-weight:800;margin-bottom:8px">${wItem.name}</div>
            <div style="color:var(--text-3);font-size:13px">${symbol.replace('.TW', '')} · ${wItem.industry || ''}</div>
            <div style="margin-top:24px;color:var(--text-2)">數據載入中...</div>
            <button class="btn btn-secondary" style="margin-top:24px" onclick="document.getElementById('stock-detail-modal').remove()">關閉</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      YC.api.fetchStock(symbol).then(d => {
        if (d) { overlay.remove(); openDetail(symbol); }
      });
      return;
    }

    const temp = YC.indicators.temperatureScore({ price: mkt.price, high52w: mkt.high52w, low52w: mkt.low52w, ma200: mkt.ma200, ma50: mkt.ma50, history: mkt.history });
    const cls = YC.indicators.classify(temp);
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
      const pnlColor = pnl >= 0 ? 'var(--t0)' : 'var(--t3)';
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
          <button class="btn btn-secondary" style="flex:1" onclick="document.getElementById('stock-detail-modal').remove()">關閉</button>
          <button class="btn btn-ghost" style="flex:1" onclick="YC.stocks.openEditHoldingModal('${symbol}')">✏️ 編輯持股</button>
          <button class="btn btn-ghost" style="flex:1" onclick="YC.app.navigate('ai')">🤖 AI分析</button>
        </div>`;
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
          <button class="btn btn-secondary" style="flex:1" onclick="document.getElementById('stock-detail-modal').remove()">關閉</button>
        </div>`;
    }

    // 52W range bar
    const h52 = mkt.high52w || mkt.price * 1.3;
    const l52 = mkt.low52w || mkt.price * 0.7;
    const rangePct = h52 > l52 ? Math.round(((mkt.price - l52) / (h52 - l52)) * 100) : 50;

    // Mini spYCline SVG (30-day history)
    const spYCSvg = buildSpYCline(mkt.history || [], mkt.price);

    // RSI estimation & IBS
    const rsiVal = mkt.history?.length >= 14 ? YC.indicators.calculateRSI(mkt.history.map(h => h.c || h)).toFixed(0) : '--';
    const ibsVal = YC.indicators.calculateIBS(mkt.price, mkt.dayHigh, mkt.dayLow);
    const ibsStr = ibsVal !== null ? ibsVal.toFixed(2) : '--';
    let ibsColor = 'inherit';
    if (ibsVal !== null) {
      if (ibsVal <= 0.2) ibsColor = 'var(--t0)'; // Low, good for bounce
      else if (ibsVal >= 0.8) ibsColor = 'var(--t3)'; // High, chance of pullback
    }
    const ma200Dev = mkt.ma200 && mkt.price ? ((mkt.price - mkt.ma200) / mkt.ma200 * 100).toFixed(2) : null;
    const volRatio = mkt.volume && mkt.avgVolume ? (mkt.volume / mkt.avgVolume).toFixed(2) : null;

    // MDD calculation
    const histPrices = mkt.history?.map(h => h.c) || [];
    const mddVal = YC.indicators.calculateMDD(histPrices);
    const mddWarningHtml = parseFloat(mddVal) >= 30 
       ? `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(255,53,96,0.15);color:var(--t3);margin-right:6px" title="過去5年最大跌幅">MDD -${mddVal}% ⚠️高波動</span>`
       : `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--bg-input);color:var(--text-2);margin-right:6px" title="過去5年最大跌幅">MDD -${mddVal}%</span>`;

    overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:92vh">
      <div class="modal-drag"></div>

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:22px;font-weight:900;letter-spacing:-0.5px">${wItem.name}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;display:flex;align-items:center;">
            ${mddWarningHtml}
            ${symbol.replace('.TW', '')} · ${wItem.industry || ''}
            ${mkt.exchangeName ? `· ${mkt.exchangeName}` : ''}
          </div>
        </div>
        <div class="temp-badge ${cls.cls}" style="font-size:13px;padding:5px 12px;white-space:nowrap">
          ${temp} ${cls.icon}
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
        ['MA200 乖離', ma200Dev !== null ? `<span style="color:${parseFloat(ma200Dev) >= 0 ? 'var(--t0)' : 'var(--t3)'}">${parseFloat(ma200Dev) >= 0 ? '+' : ''}${ma200Dev}%</span>` : '--'],
        ['RSI(14)', rsiVal !== '--' ? `<span style="color:${rsiVal <= 30 ? 'var(--t0)' : rsiVal >= 70 ? 'var(--t3)' : 'inherit'}">${rsiVal}</span>` : '--'],
        ['日內最高', mkt.dayHigh ? `${curSym}${mkt.dayHigh.toFixed(isTW ? 1 : 2)}` : '--'],
        ['日內最低', mkt.dayLow ? `${curSym}${mkt.dayLow.toFixed(isTW ? 1 : 2)}` : '--'],
        ['IBS 短線', ibsStr !== '--' ? `<span style="color:${ibsColor}">${ibsStr}</span>` : '--'],
        ['量比', volRatio !== null ? `<span style="color:${parseFloat(volRatio) > 1.5 ? 'var(--t2)' : 'inherit'}">${volRatio}x</span>` : '--'],
      ].map(([l, v]) => `
        <div class="detail-cell">
          <div class="detail-cell-lbl">${l}</div>
          <div class="detail-cell-val" style="font-size: 13px;">${v}</div>
        </div>`).join('')}
      </div>

      <!-- Temperature detail -->
      <div style="display:flex;align-items:center;gap:12px;margin-top:16px;padding:12px 14px;background:var(--bg-input);border-radius:12px;border:1px solid rgba(255,255,255,0.05)">
        ${YC.temperature.renderMiniGauge(temp, 52)}
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px">溫度診斷分析</div>
          <div style="font-size:15px;font-weight:800;color:${cls.color}">${cls.label} (${temp}/100)</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;line-height:1.4">${cls.desc || '綜合 RSI 超買超賣、MA 均線乖離與 52 週位階進行測算'}</div>
        </div>
      </div>

      <!-- 💎 Value Fundamentals Section -->
      <div style="margin-top:16px">
        <div style="font-size:12px;color:var(--text-2);margin-bottom:10px;font-weight:600;display:flex;align-items:center;gap:6px">
          <span>💎 價值基礎指標</span>
          <span style="font-size:10px;font-weight:400;color:var(--text-3)">(TTM)</span>
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

      <!-- 📊 Historical Backtest Section -->
      <div id="detail-backtest-container" style="margin-top:16px; min-height: 80px;">
        <div style="font-size:12px;color:var(--text-2);margin-bottom:10px;font-weight:600;display:flex;align-items:center;gap:6px">
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

    // Render chart — always fetch fresh history (batch data has no history)
    setTimeout(async () => {
      const chartEl = document.getElementById('detail-chart-container');
      if (!chartEl) return;

      // Get latest mkt from state (may have been updated)
      let latestMkt = YC.state.getMarketData(symbol) || mkt;

      // Fetch full history if missing (batch quotes don't include history)
      if (!latestMkt.history || latestMkt.history.length < 2) {
        chartEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px">📡 載入 K 線資料中...</div>`;
        const fresh = await YC.api.fetchStock(symbol);
        if (fresh) {
          latestMkt = fresh;
        }
      }

      YC.charting.renderPriceChart('detail-chart-container', latestMkt.history || [], {
        ma50: true, ma200: true,
        color: latestMkt.changePct >= 0 ? 'var(--pos)' : 'var(--neg)'
      });

      // Fetch and render backtest data asynchronously
      YC.api.getBacktest(symbol, 2).then(bt => {
        const btContainer = document.getElementById('detail-backtest-container');
        if (!btContainer || !bt) return;

        const r = bt.rating || {};
        const stats = bt.statistics || {};
        const winRate30 = stats.winRate?.['30d'] || 'N/A';
        const avgRet30 = stats.avgReturn?.['30d'] || 'N/A';
        const mdd30 = stats.maxDrawdown?.['30d'] || 'N/A';

        btContainer.innerHTML = `
          <div style="font-size:12px;color:var(--text-2);margin-bottom:10px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:6px">
            <div>
              <span>🔹 趨勢與勝率回測</span>
              <span style="font-size:10px;font-weight:400;color:var(--text-3)">(過去 2 年共 ${stats.totalSignals} 次)</span>
            </div>
            <div style="font-size:10px;color:var(--t0);background:rgba(0,212,170,0.1);padding:2px 6px;border-radius:4px">
              ${stats.strategy || '逢低買入'}
            </div>
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
                    <span style="color:${winRate30 !== 'N/A' && parseFloat(winRate30) >= 60 ? 'var(--t0)' : 'var(--text-1)'}">${winRate30}</span>
                    <span style="font-size:12px;color:var(--text-3);font-weight:400"> / ${stats.winRate?.['90d'] || '--'}</span>
                  </div>
                </div>
             </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
               <div class="detail-cell" style="padding:10px">
                 <div class="detail-cell-lbl">平均回報 (30d / 90d)</div>
                 <div class="detail-cell-val" style="font-size:14px">
                    <span style="color:${avgRet30 !== 'N/A' && parseFloat(avgRet30) > 0 ? 'var(--t0)' : 'var(--text-1)'}">${avgRet30}</span>
                    <span style="font-size:11px;color:var(--text-3);font-weight:400"> / ${stats.avgReturn?.['90d'] || '--'}</span>
                  </div>
               </div>
               <div class="detail-cell" style="padding:10px">
                 <div class="detail-cell-lbl">最大回撤幅度</div>
                 <div class="detail-cell-val" style="font-size:14px;color:var(--t3)">${mdd30 !== 'N/A' ? '-' + mdd30 : mdd30}</div>
               </div>
            </div>
            ${r.reason && r.reason.length > 0 ? `
              <div style="font-size:11px;color:var(--text-3);line-height:1.4;margin-top:2px;">
                💡 依據：${r.reason.join('、')}
              </div>
            ` : ''}
          </div>
        `;
      }).catch(() => {
        const btContainer = document.getElementById('detail-backtest-container');
        if (btContainer) {
          btContainer.innerHTML = `<div style="font-size:12px;color:var(--t3);padding:10px;background:var(--bg-card);border-radius:12px;">無法載入回測數據</div>`;
        }
      });
    }, 20);

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
    document.getElementById('stock-detail-modal')?.remove();
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
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-drag"></div>
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
        <button class="btn btn-secondary" style="flex:1" onclick="document.getElementById('edit-holding-modal').remove()">取消</button>
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
    document.getElementById('edit-holding-modal')?.remove();
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

  function refresh() { renderList(); }

  return {
    render, refresh, openDetail, openAddModal, addToPortfolio,
    addToPortfolioFromDetail, openEditHoldingModal, saveEditHolding, filterIndustry,
    saveNote
  };
})();