/* ================================================
   dashboard.js — Main Dashboard Page
   Enhanced: Portfolio P&L summary card (日損益 + 帳面損益)
   ================================================ */

YC.dashboardPage = (() => {

  function render() {
    const el = document.getElementById('page-dashboard');
    if (!el) return;
    el.innerHTML = buildSkeleton();
    refreshData(el);
  }

  function buildSkeleton() {
    return `
    <div style="padding-top:4px">

      <!-- Portfolio P&L Summary Card -->
      <div id="dash-pnl-card" class="pnl-summary-card" style="display:none"></div>

      <div id="visitor-count" style="text-align:center; font-size:10px; color:var(--text-3); margin-bottom:10px; opacity:0.6">👁️ 載入中...</div>

      <!-- Dividend Tracking Card (Phase 1) -->
      <div id="dash-div-card" class="card" style="display:none; background: linear-gradient(135deg, rgba(0,212,170,0.1) 0%, rgba(20,20,20,1) 100%); border-color: rgba(0,212,170,0.2);"></div>

      <!-- Rebalance Recommendation Card (Phase 2) -->
      <div id="dash-rebalance-card" style="display:none; margin-top:14px"></div>

      <!-- Portfolio Health & Sector Analysis (Medium-term Roadmap) -->
      <div id="dash-health-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:14px">
        <div id="dash-health-card" class="card" style="margin-top:0"></div>
        <div id="dash-sector-card" class="card" style="margin-top:0"></div>
      </div>

      <!-- Allocation Card -->
      <div id="dash-alloc" class="alloc-card">
        <div class="alloc-header">
          <span class="alloc-title">📊 配置建議</span>
          <span class="alloc-date" id="dash-date">—</span>
        </div>
        <div class="alloc-main">
          <div class="alloc-pct hold" id="dash-equity-pct">—%</div>
          <div class="alloc-desc" id="dash-alloc-desc">建議持股比例</div>
        </div>
        <div class="alloc-rows">
          <div class="alloc-row">
            <span class="alloc-row-label">目前持股</span>
            <span class="alloc-row-value" id="dash-cur-equity">設定總資產後顯示</span>
          </div>
          <div class="alloc-row">
            <span class="alloc-row-label">建議股票倉位</span>
            <span class="alloc-row-value" id="dash-sug-equity">—</span>
          </div>
          <div class="alloc-row">
            <span class="alloc-row-label">建議現金部位</span>
            <span class="alloc-row-value" id="dash-sug-cash">—</span>
          </div>
        </div>
        <div id="dash-adjust-banner"></div>
        <div id="dash-stack-bar" style="margin-top:14px"></div>
      </div>

      <!-- Opportunity Radar (NEW) -->
      <div id="dash-radar-card"></div>

      <!-- Sentiment Indicators -->
      <div class="card">
        <div class="card-title">🌡️ 市場情緒指標</div>
        <div class="sentiment-list" id="dash-sentiment-list">
          ${[0, 1, 2, 3, 4].map(() => `
          <div class="s-item">
            <div class="s-icon skeleton" style="width:28px;height:28px;border-radius:4px"></div>
            <div class="s-body">
              <div class="skeleton" style="width:80px;height:12px;margin-bottom:5px"></div>
              <div class="s-bar"><div class="skeleton" style="width:60%;height:5px"></div></div>
            </div>
          </div>`).join('')}
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--text-2)">綜合市場溫度</span>
          <span style="font-size:18px;font-weight:800" id="dash-composite">—</span>
        </div>
      </div>

      <!-- Portfolio Holdings Summary -->
      <div class="card" id="dash-holdings-card">
        <div class="card-title row-between">
          <span>💼 我的持倉</span>
          <button class="btn btn-sm btn-ghost" onclick="YC.app.navigate('stocks')">管理</button>
        </div>
        <div id="dash-holdings-list">
          <div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">尚未新增持股<br><small class="text-muted">到「股票」頁面點擊任一股票即可加入</small></div></div>
        </div>
      </div>

      <!-- Goal Card -->
      <div id="dash-goal-card"></div>
    </div>`;
  }

  async function refreshData(el) {
    if (!el) el = document.getElementById('page-dashboard');
    if (!el || !el.classList.contains('active')) return;

    let sentiment;
    try { sentiment = await YC.sentiment.fetchAll(); }
    catch { sentiment = { composite: 50, indicators: [] }; }

    const settings = YC.state.get().settings;
    const holdings = YC.portfolio.getEnriched();
    const currentEquity = holdings.reduce((s, h) => s + (h.marketValue || 0), 0);

    // 自動計算總現金 + 市值 = 總資產
    const cash = parseFloat(settings.cashAssets) || 0;
    const combinedSettings = { ...settings };
    if (cash > 0 || currentEquity > 0) {
      combinedSettings.totalAssets = cash + currentEquity;
    } else {
      combinedSettings.totalAssets = settings.totalAssets || 0; // fallback if everything is 0
    }

    // ── P&L Summary Card ──────────────────────────────
    renderPnlCard(holdings);

    // ── Dividend Card ─────────────────────────────────
    renderDividendCard(holdings);

    // ── Rebalance Recommendation Card ─────────────────
    renderRebalanceCard(holdings, combinedSettings.totalAssets);

    // ── Health & Sector ───────────────────────────────
    renderHealthAndSector(holdings);

    // ── Allocation ────────────────────────────────────
    const alloc = YC.allocation.compute(sentiment.composite, combinedSettings, currentEquity);

    // ── Opportunity Radar ─────────────────────────────
    renderRadar();

    const dateEl = document.getElementById('dash-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Fetch analytics
    fetch('/api/analytics')
      .then(r => r.json())
      .then(data => {
        const vc = document.getElementById('visitor-count');
        if (vc) vc.innerText = `👁️ 本站累計瀏覽次數: ${data.total}`;
      }).catch(() => {});

    const eqEl = document.getElementById('dash-equity-pct');
    if (eqEl && alloc.ready) {
      const dir = alloc.direction;
      eqEl.textContent = alloc.suggestedEquityPct + '%';
      eqEl.className = `alloc-pct ${dir === 'reduce' ? 'reduce' : dir === 'add' ? 'add' : 'hold'}`;

      const descEl = document.getElementById('dash-alloc-desc');
      if (descEl) descEl.textContent = `建議持股比例（現金 ${alloc.suggestedCashPct}%）`;

      document.getElementById('dash-cur-equity').textContent =
        `NT$ ${YC.allocation.formatNTD(currentEquity)}（${alloc.currentEquityPct}%）`;
      document.getElementById('dash-sug-equity').textContent =
        `NT$ ${YC.allocation.formatNTD(alloc.suggestedEquity)}`;
      document.getElementById('dash-sug-cash').textContent =
        `NT$ ${YC.allocation.formatNTD(alloc.suggestedCash)}`;

      const banner = document.getElementById('dash-adjust-banner');
      if (banner) {
        const amt = Math.abs(alloc.adjustmentAmt);
        const dirText = dir === 'reduce' ? '⚠️ 建議調節（出售）' : dir === 'add' ? '🚀 建議加碼（買入）' : '✅ 持倉合理';
        
        // --- 智慧推薦邏輯 (區分市場 & 買賣) ---
        let recHtml = '';
        if (dir === 'reduce' && holdings.length > 0) {
          const hotTW = holdings.filter(h => h.symbol.endsWith('.TW') && h.tempScore >= 50).sort((a,b) => b.tempScore - a.tempScore);
          const hotUS = holdings.filter(h => !h.symbol.endsWith('.TW') && h.tempScore >= 50).sort((a,b) => b.tempScore - a.tempScore);
          
          let recs = [];
          if (hotTW.length > 0) recs.push(`🇹🇼 <strong style="color:var(--t3)">${hotTW[0].name.slice(0,4)}</strong>`);
          if (hotUS.length > 0) recs.push(`🇺🇸 <strong style="color:var(--t3)">${hotUS[0].name.slice(0,4)}</strong>`);
          
          if (recs.length > 0) {
            recHtml = `<div style="font-size:12px; margin-top:2px; color:var(--text-3)">💡 <span style="color:var(--t2)">優先減碼過熱部位：</span>${recs.join('、')}</div>`;
          }
        } else if (dir === 'add') {
          const wl = window.YC?.portfolio?.getWatchlistEnriched('all') || [];
          const coldTW = wl.filter(w => w.symbol.endsWith('.TW') && w.hasData && w.tempScore <= 35).sort((a,b) => a.tempScore - b.tempScore);
          const coldUS = wl.filter(w => !w.symbol.endsWith('.TW') && w.hasData && w.tempScore <= 35).sort((a,b) => a.tempScore - b.tempScore);

          let recs = [];
          if (coldTW.length > 0) recs.push(`🇹🇼 <strong style="color:var(--t0)">${coldTW[0].name.slice(0,4)}</strong>`);
          if (coldUS.length > 0) recs.push(`🇺🇸 <strong style="color:var(--t0)">${coldUS[0].name.slice(0,4)}</strong>`);

          if (recs.length > 0) {
            recHtml = `<div style="font-size:12px; margin-top:2px; color:var(--text-3)">💡 <span style="color:var(--t0)">推薦加碼低溫標的：</span>${recs.join('、')}</div>`;
          }
        }

        banner.innerHTML = `<div class="adjust-banner ${dir}" style="display:flex; flex-direction:column; align-items:stretch; gap:6px">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span class="adjust-label">${dirText}</span>
            <span class="adjust-amount ${dir}">NT$ ${YC.allocation.formatNTD(amt)}</span>
          </div>
          ${recHtml}
        </div>`;
      }

      const stackEl = document.getElementById('dash-stack-bar');
      if (stackEl) stackEl.innerHTML = YC.allocation.renderStackBar(alloc.suggestedEquityPct, alloc.suggestedCashPct);
    } else if (eqEl && !alloc.ready) {
      eqEl.textContent = '—';
      document.getElementById('dash-alloc-desc').textContent = alloc.reason || '請設定總資產';
    }

    // ── Sentiment ─────────────────────────────────────
    const sentList = document.getElementById('dash-sentiment-list');
    if (sentList && sentiment.indicators?.length) {
      sentList.innerHTML = sentiment.indicators.map(ind => `
        <div class="s-item">
          <div class="s-icon">${ind.icon}</div>
          <div class="s-body">
            <div class="s-name" title="${ind.desc || ''}">${ind.label} <span style="font-size:10px; color:var(--text-3); margin-left:4px; font-weight:normal; cursor:help" title="${ind.desc || ''}">ⓘ</span></div>
            <div class="s-bar">
              <div class="s-bar-fill" style="width:${ind.score}%;background:${ind.color}"></div>
            </div>
          </div>
          <div class="s-score" style="color:${ind.color}">${ind.score}</div>
        </div>`).join('');
    }

    const comp = document.getElementById('dash-composite');
    if (comp && sentiment.composite != null) {
      const c = sentiment.composite;
      const color = c <= 30 ? 'var(--t0)' : c <= 60 ? 'var(--t1)' : c <= 80 ? 'var(--t2)' : 'var(--t3)';
      comp.style.color = color;
      comp.textContent = c + ' / 100';
    }

    // ── Holdings list ─────────────────────────────────
    const holdList = document.getElementById('dash-holdings-list');
    if (holdList) {
      if (!holdings.length) {
        holdList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">尚未新增持股</div></div>`;
      } else {
        holdList.innerHTML = `<div class="stock-list">${holdings.map(h => renderHoldingCard(h)).join('')}</div>
          ${holdings.length > 5 ? `<div style="text-align:center;padding:8px;color:var(--text-3);font-size:12px">還有 ${holdings.length - 5} 支持股...</div>` : ''}`;
      }
    }

    renderGoal(combinedSettings);
  }

  /* ── Opportunity Radar ──────────────────────────── */
  async function renderRadar() {
    const card = document.getElementById('dash-radar-card');
    if (!card) return;

    const wl = window.YC?.portfolio?.getWatchlistEnriched('all') || [];
    const holdings = YC.portfolio.getEnriched();

    // Categorize
    const buyTW = wl.filter(s => s.symbol.endsWith('.TW') && s.hasData && s.tempScore <= 35).sort((a, b) => a.tempScore - b.tempScore);
    const buyUS = wl.filter(s => !s.symbol.endsWith('.TW') && s.hasData && s.tempScore <= 35).sort((a, b) => a.tempScore - b.tempScore);
    const sellTW = holdings.filter(h => h.symbol.endsWith('.TW') && h.tempScore >= 60).sort((a, b) => b.tempScore - a.tempScore);
    const sellUS = holdings.filter(h => !h.symbol.endsWith('.TW') && h.tempScore >= 60).sort((a, b) => b.tempScore - a.tempScore);

    const hasData = buyTW.length || buyUS.length || sellTW.length || sellUS.length;

    if (!hasData) {
      card.innerHTML = `
        <div class="card" style="border:1px dashed var(--border);background:transparent">
           <div class="card-title">🎯 今日雷達</div>
           <div class="empty-state"><div class="empty-state-icon" style="opacity:0.5">🔭</div><div class="empty-state-text">市場處於中性區間<br><small>策略判定目前無極端買賣點</small></div></div>
        </div>`;
      return;
    }

    let html = `
      <div class="card" style="background: linear-gradient(145deg, rgba(0, 212, 170, 0.05) 0%, rgba(20, 20, 20, 1) 100%); border-color: rgba(0, 212, 170, 0.2)">
        <div class="card-title">🎯 今日多空診斷雷達</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px">
          <!-- Taiwan Section -->
          <div>
            <div style="color:var(--text-1); font-size:12px; font-weight:700; border-left:3px solid var(--t0); padding-left:8px; margin-bottom:8px">🇹🇼 台股市場</div>
            <div id="radar-tw-list"></div>
          </div>
          <!-- US Section -->
          <div>
            <div style="color:var(--text-1); font-size:12px; font-weight:700; border-left:3px solid var(--accent); padding-left:8px; margin-bottom:8px">🇺🇸 美股市場</div>
            <div id="radar-us-list"></div>
          </div>
        </div>
      </div>
    `;
    card.innerHTML = html;

    const renderItems = (items, type) => {
      if (!items.length) return `<div style="font-size:11px; color:var(--text-3); padding:8px">暫無建議</div>`;
      return items.slice(0, 3).map(s => {
        const isSell = type === 'sell';
        const color = isSell ? 'var(--t3)' : 'var(--t0)';
        const icon = isSell ? '⚠️' : '🚀';
        const label = isSell ? '減碼' : '加碼';
        const symbolDisplay = s.symbol.replace('.TW', '');
        return `
          <div class="stock-card tc0" style="padding:6px 8px; margin-bottom:6px; cursor:pointer; background:rgba(255,255,255,0.03)" onclick="YC.stocks.openDetail('${s.symbol}')">
            <div style="flex:1">
              <div style="font-size:12px; font-weight:700; display:flex; justify-content:space-between">
                <span>${s.name.slice(0,6)}</span>
                <span style="color:${color}">${icon} ${label}</span>
              </div>
              <div style="font-size:10px; color:var(--text-3); margin-top:2px">
                ${symbolDisplay} ｜ 溫度: <span style="color:${color}">${s.tempScore}°C</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    document.getElementById('radar-tw-list').innerHTML = renderItems(buyTW, 'buy') + renderItems(sellTW, 'sell');
    document.getElementById('radar-us-list').innerHTML = renderItems(buyUS, 'buy') + renderItems(sellUS, 'sell');
  }

  /* ── P&L Summary Card ─────────────────────────── */
  function renderPnlCard(holdings) {
    const card = document.getElementById('dash-pnl-card');
    if (!card || !holdings.length) { if (card) card.style.display = 'none'; return; }

    let totalMV = 0, totalCost = 0, totalDayPnl = 0;
    for (const h of holdings) {
      const mkt = YC.state.getMarketData(h.symbol) || {};
      const shares = h.shares || 0;
      const price = mkt.price || h.costPrice || 0;
      const mv = price * shares;
      const cost = ((h.costPrice || 0) * shares) + (h.totalFees || 0);
      const dayPnl = mkt.price ? (mv * ((mkt.changePct || 0) / 100)) : 0;

      totalMV += mv;
      totalCost += cost;
      totalDayPnl += dayPnl;
    }

    const totalPnl = totalMV - totalCost;
    const totalPnlPct = totalCost ? (totalPnl / totalCost * 100) : 0;
    const daySign = totalDayPnl >= 0 ? '+' : '';
    const pnlSign = totalPnl >= 0 ? '+' : '';
    const dayColor = totalDayPnl >= 0 ? 'var(--t0)' : 'var(--t3)';
    const pnlColor = totalPnl >= 0 ? 'var(--t0)' : 'var(--t3)';

    card.style.display = 'block';
    card.innerHTML = `
      <div class="pnl-header">
        <span class="pnl-label">💼 持倉總市值</span>
        <span class="pnl-total">NT$ ${totalMV.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="pnl-row-main">
        <div class="pnl-col">
          <div class="pnl-col-lbl">今日損益</div>
          <div class="pnl-col-val" style="color:${dayColor}">${daySign}NT$ ${Math.abs(totalDayPnl).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</div>
        </div>
        <div class="pnl-divider"></div>
        <div class="pnl-col">
          <div class="pnl-col-lbl">帳面損益<span style="font-size:9px;opacity:0.7">（扣成本）</span></div>
          <div class="pnl-col-val" style="color:${pnlColor}">${pnlSign}NT$ ${Math.abs(totalPnl).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</div>
          <div class="pnl-col-sub" style="color:${pnlColor}">${pnlSign}${totalPnlPct.toFixed(2)}%</div>
        </div>
      </div>`;
  }

  /* ── Dividend & Expense Card Phase 1 & 4 ────────── */
  function renderDividendCard(holdings) {
    const card = document.getElementById('dash-div-card');
    if (!card || !holdings.length) { if (card) card.style.display = 'none'; return; }

    const divData = YC.allocation.computePortfolioDividends(holdings);
    const avgExpRatio = YC.allocation.computeAverageExpenseRatio(holdings);
    
    const expColor = avgExpRatio > 0.50 ? 'var(--t3)' : avgExpRatio < 0.20 ? 'var(--t0)' : 'var(--text-1)';
    
    card.style.display = 'block';
    card.innerHTML = `
      <div class="card-title">💰 股息收支與內扣分析</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; align-items:flex-end">
        <div>
          <div style="color:var(--text-2); font-size:12px; margin-bottom:4px">預估年領股息</div>
          <div style="font-size:20px; font-weight:800; color:var(--t0)">NT$ ${divData.totalDividends.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--text-2); font-size:12px; margin-bottom:4px">組合平均殖利率</div>
          <div style="font-size:18px; font-weight:700; color:var(--accent)">${divData.avgYield.toFixed(2)}%</div>
        </div>
        <div style="text-align:right">
          <div style="color:var(--text-2); font-size:12px; margin-bottom:4px">組合平均內扣</div>
          <div style="font-size:18px; font-weight:700; color:${expColor}">${avgExpRatio.toFixed(2)}%</div>
        </div>
      </div>
    `;
  }

  /* ── Rebalance Recommendation Card Phase 2 ───────── */
  function renderRebalanceCard(holdings, totalAssets) {
    const card = document.getElementById('dash-rebalance-card');
    if (!card || !holdings.length) { if (card) card.style.display = 'none'; return; }

    const rebalData = YC.allocation.calculateRebalanceSteps(totalAssets, holdings);
    // Only show if there are steps and user has configured some target weights
    if (rebalData.totalTargetPct === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    
    let stepsHtml = '';
    if (rebalData.steps.length === 0) {
        stepsHtml = `<div class="empty-state" style="padding:10px; min-height:60px; background:transparent"><div class="empty-state-text" style="color:var(--t0)">✅ 目前各項資產皆接近目標權重，無需大幅調整</div></div>`;
    } else {
        stepsHtml = rebalData.steps.map(s => {
            const color = s.action === '買入' ? 'var(--t0)' : 'var(--t3)';
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05)">
              <div>
                <div style="font-weight:700">${s.name} <span style="font-size:11px;color:var(--text-3);font-weight:normal">${s.symbol}</span></div>
                <div style="font-size:11px;color:var(--text-2);margin-top:2px">目標 ${s.targetPct}% ｜ 現有 NT$ ${s.currentVal.toLocaleString('zh-TW', {maximumFractionDigits:0})}</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:800; color:${color}">${s.action} NT$ ${s.diffAmount.toLocaleString('zh-TW', {maximumFractionDigits:0})}</div>
                <div style="font-size:11px;color:var(--text-3);margin-top:2px">至 NT$ ${s.targetVal.toLocaleString('zh-TW', {maximumFractionDigits:0})}</div>
              </div>
            </div>`;
        }).join('');
    }

    card.innerHTML = `
      <div class="card" style="border-color: rgba(124,111,255,0.3)">
        <div class="card-title row-between">
          <span>⚖️ 資產再平衡建議</span>
          <span style="font-size:11px;font-weight:normal;color:var(--text-2)">目標股票總佔比: ${rebalData.totalTargetPct}%</span>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:10px;line-height:1.4">
          根據您設定的各資產「目標比重」，系統計算出的具體買賣金額以維持最佳配置：
        </div>
        <div style="background:var(--bg-input); border-radius:8px; padding:0 12px">
          ${stepsHtml}
        </div>
        <div style="text-align:right; margin-top:10px; font-size:11px; color:var(--text-3)">
            * 單筆調整金額小於 1000 元將被隱藏以節省頻繁交易成本
        </div>
      </div>
    `;
  }

  /* ── Health & Sector (Roadmap) ─────────────────── */
  function renderHealthAndSector(holdings) {
    const healthCard = document.getElementById('dash-health-card');
    const sectorCard = document.getElementById('dash-sector-card');
    if (!healthCard || !sectorCard) return;

    if (!holdings.length) {
      document.getElementById('dash-health-row').style.display = 'none';
      return;
    }
    document.getElementById('dash-health-row').style.display = 'grid';

    // 1. Health Score
    const health = YC.allocation.calculatePortfolioScore(holdings);
    const cls = YC.indicators.classify(health.score);
    
    healthCard.innerHTML = `
      <div class="card-title" style="font-size:12px; margin-bottom:10px">組合健康評分</div>
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:80px">
        <div style="font-size:32px; font-weight:900; color:${cls.color}">${health.score}</div>
        <div style="font-size:11px; font-weight:700; color:${cls.color}; margin-top:4px">${cls.icon} ${cls.label}</div>
      </div>
      <div style="font-size:10px; color:var(--text-3); margin-top:6px; text-align:center">持倉加權溫度計</div>
    `;

    // 2. Sector Allocation (Simplified SVG Bar Chart)
    const sectors = {};
    let totalValue = 0;
    const rate = YC.state.get().exchangeRate || 31.5;

    for (const h of holdings) {
      const mkt = YC.state.getMarketData(h.symbol);
      let mv = (mkt?.price || h.costPrice || 0) * (h.shares || 0);
      if (mkt?.currency === 'USD' || (h.type && h.type.includes('us'))) mv *= rate;
      
      const sector = h.industry || '未分類';
      sectors[sector] = (sectors[sector] || 0) + mv;
      totalValue += mv;
    }

    const sortedSectors = Object.entries(sectors).sort((a, b) => b[1] - a[1]).slice(0, 4);
    
    sectorCard.innerHTML = `
      <div class="card-title" style="font-size:12px; margin-bottom:10px">核心產業分布</div>
      <div style="display:flex; flex-direction:column; gap:6px; height:80px; justify-content:center">
        ${sortedSectors.map(([name, val]) => {
          const pct = Math.round((val / totalValue) * 100);
          return `
            <div style="display:flex; align-items:center; gap:8px">
              <div style="font-size:9px; color:var(--text-2); width:45px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${name}</div>
              <div style="flex:1; height:4px; background:var(--bg-input); border-radius:2px; overflow:hidden">
                <div style="height:100%; width:${pct}%; background:var(--accent)"></div>
              </div>
              <div style="font-size:9px; color:var(--text-3); width:22px; text-align:right">${pct}%</div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="font-size:10px; color:var(--text-3); margin-top:6px; text-align:center">前四大持倉領域</div>
    `;
  }

  /* ── Individual Holding Card ──────────────────── */
  function renderHoldingCard(h) {
    const mkt = YC.state.getMarketData(h.symbol);
    const isTW = h.symbol?.endsWith('.TW');
    const curSym = isTW ? 'NT$' : '$';

    if (!mkt || !mkt.price) {
      return `<div class="stock-card tc1" onclick="YC.stocks.openDetail('${h.symbol}')">
        <div class="stock-avatar av2" style="width:42px;height:42px;font-size:13px">${YC.indicators.getInitials(h.name)}</div>
        <div class="stock-info">
          <div class="stock-name">${h.name}</div>
          <div class="stock-sub">${(h.symbol || '').replace('.TW', '')} · ${h.shares || 0}股</div>
        </div>
        <div style="font-size:11px;color:var(--text-3)">載入中...</div>
      </div>`;
    }

    const mv = mkt.price * (h.shares || 0);
    const dayPnl = mv * ((mkt.changePct || 0) / 100);
    const cost = ((h.costPrice || 0) * (h.shares || 0)) + (h.totalFees || 0);
    const totalPnl = mv - cost;
    const totalPnlPct = cost ? (totalPnl / cost * 100) : 0;
    const daySign = dayPnl >= 0 ? '+' : '';
    const pnlSign = totalPnl >= 0 ? '+' : '';
    const dayColor = dayPnl >= 0 ? 'var(--t0)' : 'var(--t3)';
    const pnlColor = totalPnl >= 0 ? 'var(--t0)' : 'var(--t3)';
    const temp = YC.indicators.temperatureScore({ price: mkt.price, high52w: mkt.high52w, low52w: mkt.low52w, ma200: mkt.ma200, history: mkt.history });
    const cls = YC.indicators.classify(temp);

    return `
    <div class="stock-card ${cls.cardClass || 'tc1'}" onclick="YC.stocks.openDetail('${h.symbol}')">
      <div class="stock-avatar av2" style="width:42px;height:42px;font-size:12px">${YC.indicators.getInitials(h.name)}</div>
      <div class="stock-info" style="flex:1;min-width:0">
        <div class="stock-name">${h.name}</div>
        <div class="stock-sub">${(h.symbol || '').replace('.TW', '')} · ${h.shares}股 @ ${curSym}${h.costPrice?.toFixed(isTW ? 1 : 2)}</div>
        <!-- Market Value -->
        <div style="display:flex;align-items:baseline;gap:6px;margin-top:3px">
          <span style="font-size:13px;font-weight:700">${curSym}${mv.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</span>
          <span style="font-size:12px;font-weight:600;color:${dayColor}">${daySign}${curSym}${Math.abs(dayPnl).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}<span style="font-size:10px;margin-left:2px">(${daySign}${mkt.changePct?.toFixed(2)}%)</span></span>
        </div>
        <!-- Cost P&L sub-line -->
        <div style="font-size:10px;color:${pnlColor};margin-top:1px">
          帳面 ${pnlSign}${curSym}${Math.abs(totalPnl).toLocaleString('zh-TW', { maximumFractionDigits: 0 })} <span style="opacity:0.8">(${pnlSign}${totalPnlPct.toFixed(2)}%)</span>
        </div>
      </div>
      <div class="temp-badge ${cls.cls}" style="font-size:11px;padding:4px 8px;align-self:flex-start">${temp}</div>
    </div>`;
  }

  function renderGoal(settings) {
    const el = document.getElementById('dash-goal-card');
    if (!el) return;
    if (!settings.goalAmount || !settings.goalName) { el.innerHTML = ''; return; }

    const totalAssets = settings.totalAssets || 0;
    const pct = Math.min(100, Math.round((totalAssets / settings.goalAmount) * 100));
    const remaining = settings.goalAmount - totalAssets;

    let daysLeft = '';
    if (settings.goalDate) {
      const diff = new Date(settings.goalDate) - new Date();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (days > 0) {
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        daysLeft = years > 0 ? `${years}年 ${months}個月` : `${months}個月`;
      }
    }

    el.innerHTML = `
    <div class="goal-card">
      <div class="goal-top">
        <span class="goal-name-text">🎯 ${settings.goalName}</span>
        <span class="goal-pct-text">${pct}%</span>
      </div>
      <div class="goal-track"><div class="goal-fill" style="width:${pct}%"></div></div>
      <div class="goal-stats">
        <div class="goal-stat">
          <div class="goal-stat-val">${YC.allocation.formatNTD(totalAssets)}</div>
          <div class="goal-stat-lbl">目前資產</div>
        </div>
        <div class="goal-stat">
          <div class="goal-stat-val">${YC.allocation.formatNTD(settings.goalAmount)}</div>
          <div class="goal-stat-lbl">目標金額</div>
        </div>
        <div class="goal-stat">
          <div class="goal-stat-val" style="color:var(--t3)">${YC.allocation.formatNTD(remaining)}</div>
          <div class="goal-stat-lbl">尚差金額</div>
        </div>
        ${daysLeft ? `<div class="goal-stat"><div class="goal-stat-val" style="color:var(--accent)">${daysLeft}</div><div class="goal-stat-lbl">剩餘時間</div></div>` : ''}
      </div>
    </div>`;
  }

  return { render, refreshData };
})();