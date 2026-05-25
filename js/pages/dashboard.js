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
        <div id="dash-deviation-summary" style="margin-top:14px; border-top:1px dashed rgba(255,255,255,0.08); padding-top:12px; display:none"></div>
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

    // ── Rebalance Card: hide (info is now in allocation card deviation summary)
    const rebalCardEl = document.getElementById('dash-rebalance-card');
    if (rebalCardEl) rebalCardEl.style.display = 'none';

    // ── Health & Sector ───────────────────────────────
    renderHealthAndSector(holdings);

    // ── Allocation ────────────────────────────────────
    const alloc = YC.allocation.compute(sentiment.composite, combinedSettings, currentEquity);

    // ── Opportunity Radar ─────────────────────────────
    renderRadar();

    const dateEl = document.getElementById('dash-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
        
        banner.innerHTML = `<div class="adjust-banner ${dir}" style="display:flex; flex-direction:column; align-items:stretch; gap:6px">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span class="adjust-label">${dirText}</span>
            <span class="adjust-amount ${dir}">NT$ ${YC.allocation.formatNTD(amt)}</span>
          </div>
        </div>`;
      }

      const stackEl = document.getElementById('dash-stack-bar');
      if (stackEl) stackEl.innerHTML = YC.allocation.renderStackBar(alloc.suggestedEquityPct, alloc.suggestedCashPct);

      // ── Deviation Summary inside Allocation Card ──────
      renderDeviationSummary(holdings, combinedSettings.totalAssets, alloc.suggestedEquityPct);
    } else if (eqEl && !alloc.ready) {
      eqEl.textContent = '—';
      document.getElementById('dash-alloc-desc').textContent = alloc.reason || '請設定總資產';
      // still try to render deviation summary if holdings exist
      renderDeviationSummary(holdings, combinedSettings.totalAssets, 0);
    }

    // ── Sentiment ─────────────────────────────────────
    const sentList = document.getElementById('dash-sentiment-list');
    if (sentList && sentiment.indicators?.length) {
      sentList.innerHTML = sentiment.indicators.map(ind => `
        <div class="s-item">
          <div class="s-icon">${ind.icon}</div>
          <div class="s-body">
            <div class="s-name">
              ${ind.label} 
              <span class="hint-trigger" 
                data-label="${ind.label}" 
                data-desc="${ind.desc}" 
                onclick="YC.app.showHint(this.dataset.label, this.dataset.desc)">ⓘ</span>
            </div>
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
        const remained = holdings.length - 5;
        const displayHoldings = isExpanded ? holdings : holdings.slice(0, 5);
        
        holdList.innerHTML = `
          <div class="stock-list">${displayHoldings.map(h => renderHoldingCard(h)).join('')}</div>
          ${remained > 0 ? `
            <div id="dash-expand-btn" style="text-align:center; padding:12px; color:var(--accent); font-size:12px; cursor:pointer; font-weight:700; transition: opacity 0.2s">
              ${isExpanded ? '🔼 收合持股清單' : `📂 展開查看剩餘 ${remained} 檔持股...`}
            </div>
          ` : ''}
        `;

        const btn = document.getElementById('dash-expand-btn');
        if (btn) {
          btn.onclick = () => {
            isExpanded = !isExpanded;
            refreshData(el);
          };
        }
      }
    }

    renderGoal(combinedSettings);
  }

  // State: closure variable for holdings expand/collapse toggle
  let isExpanded = false;

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
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">🎯 今日多空診斷雷達</div>
          <div style="font-size:9px; color:var(--text-3);">*基於短線動能，供波段參考</div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
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
        
        <!-- AI section -->
        <div style="margin-top:14px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.08)">
          <button class="btn btn-ghost btn-sm btn-full" id="btn-radar-ai" style="display:flex; align-items:center; justify-content:center; gap:6px; color:var(--t0); font-weight:700">
            🔮 AI 診斷當日最佳買股 (基於低溫自選)
          </button>
          <div id="radar-ai-result" style="display:none"></div>
        </div>
      </div>
    `;
    card.innerHTML = html;

    const renderGroup = (buyItems, sellItems) => {
      if (!buyItems.length && !sellItems.length) {
         return `<div style="font-size:11px; color:var(--text-3); padding:8px">目前無極端買點</div>`;
      }
      
      let res = '';
      if (buyItems.length > 0) {
        res += `<div style="font-size:10px; color:var(--t0); font-weight:700; margin:6px 0 4px">🚀 低溫尋寶</div>`;
        res += buyItems.slice(0, 3).map(s => renderItem(s, 'buy')).join('');
      }
      if (sellItems.length > 0) {
        res += `<div style="font-size:10px; color:var(--pos); font-weight:700; margin:6px 0 4px">⚠️ 高溫警戒</div>`;
        res += sellItems.slice(0, 3).map(s => renderItem(s, 'sell')).join('');
      }
      return res;
    };

    const renderItem = (s, type) => {
        const isSell = type === 'sell';
        const color = isSell ? 'var(--pos)' : 'var(--t0)';
        const label = isSell ? '建議減碼' : '建議加碼';
        const symbolDisplay = s.symbol.replace('.TW', '');
        return `
          <div class="stock-card tc0" style="padding:6px 8px; margin-bottom:6px; cursor:pointer; background:rgba(255,255,255,0.03)" onclick="YC.stocks.openDetail('${s.symbol}')">
            <div style="flex:1">
              <div style="font-size:12px; font-weight:700; display:flex; justify-content:space-between">
                <span>${s.name.slice(0,6)}</span>
                <span style="color:${color}; font-size:10px">${label}</span>
              </div>
              <div style="font-size:10px; color:var(--text-3); margin-top:2px">
                ${symbolDisplay} ｜ 溫度: <span style="color:${color}">${s.tempScore}°C</span>
              </div>
            </div>
          </div>
        `;
    };

    document.getElementById('radar-tw-list').innerHTML = renderGroup(buyTW, sellTW);
    document.getElementById('radar-us-list').innerHTML = renderGroup(buyUS, sellUS);

    const btnRadarAi = document.getElementById('btn-radar-ai');
    if (btnRadarAi) {
      btnRadarAi.onclick = async () => {
        const resultEl = document.getElementById('radar-ai-result');
        if (!resultEl) return;
        
        const settings = YC.state.get().settings || {};
        const hasKey = !!(settings.apiKeyOpenAI || settings.apiKeyGemini || settings.apiKeyClaude || settings.apiKey);
        if (!hasKey) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `<div style="font-size:12px; color:var(--pos); background:rgba(255,80,80,0.07); border:1px solid rgba(255,80,80,0.15); border-radius:8px; padding:10px; margin-top:8px">⚠️ 請先至「設定」頁面設定您的 AI API Key。</div>`;
          return;
        }

        // Get candidates: all watchlist items that are low temperature
        let candidates = wl.filter(s => s.hasData && s.tempScore <= 35);
        if (candidates.length === 0) {
          // Fallback: take top 5 lowest temperature items from the watchlist
          candidates = wl.filter(s => s.hasData).sort((a, b) => a.tempScore - b.tempScore).slice(0, 5);
        }

        if (candidates.length === 0) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `<div style="font-size:12px; color:var(--pos); background:rgba(255,80,80,0.07); border:1px solid rgba(255,80,80,0.15); border-radius:8px; padding:10px; margin-top:8px">⚠️ 請先在自選清單中加入股票，AI 才能為您進行挑選診斷。</div>`;
          return;
        }

        btnRadarAi.disabled = true;
        btnRadarAi.textContent = '🔮 AI 診斷中...';
        resultEl.style.display = 'block';
        resultEl.innerHTML = `<div class="ai-result ai-typing" style="margin-top:10px"></div>`;
        const streamEl = resultEl.querySelector('.ai-result');

        const renderMYCdown = (text) => {
          return text
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-1)">$1</strong>')
            .replace(/\n/g, '<br>');
        };

        await YC.ai.analyzeBestBuy(candidates, {
          onChunk: (chunk, full) => {
            if (streamEl) streamEl.innerHTML = renderMYCdown(full);
          },
          onDone: (text) => {
            if (streamEl) {
              streamEl.innerHTML = renderMYCdown(text);
              streamEl.classList.remove('ai-typing');
            }
            btnRadarAi.disabled = false;
            btnRadarAi.textContent = '🔄 重新診斷當日最佳買股';
          },
          onError: (msg) => {
            if (resultEl) {
              resultEl.innerHTML = `<div style="font-size:12px; color:var(--pos); background:rgba(255,80,80,0.07); border:1px solid rgba(255,80,80,0.15); border-radius:8px; padding:10px; margin-top:8px">❌ 診斷失敗：${msg}</div>`;
            }
            btnRadarAi.disabled = false;
            btnRadarAi.textContent = '❌ 重試診斷當日最佳買股';
          }
        });
      };
    }
  }

  /* ── P&L Summary Card ─────────────────────────── */
  function renderPnlCard(holdings) {
    const card = document.getElementById('dash-pnl-card');
    if (!card) return;
    
    if (!holdings || holdings.length === 0) {
      card.style.display = 'none';
      return;
    }

    let totalMV = 0, totalCost = 0, totalDayPnl = 0;
    const state = YC.state.get();
    const rate = state.exchangeRate || 32.0;

    for (const h of holdings) {
      totalMV += (h.marketValue || 0);
      totalCost += (h.costTotal || 0);
      
      // Day P&L needs to be converted if it's US
      const mkt = YC.state.getMarketData(h.symbol) || {};
      const mvTWD = h.marketValue || 0;
      const dayPnlTWD = mvTWD * ((mkt.changePct || 0) / 100);
      totalDayPnl += dayPnlTWD;
    }

    const totalPnl = totalMV - totalCost;
    const totalPnlPct = totalCost ? (totalPnl / totalCost * 100) : 0;
    
    const daySign = totalDayPnl >= 0 ? '+' : '';
    const pnlSign = totalPnl >= 0 ? '+' : '';
    const dayColor = totalDayPnl >= 0 ? 'var(--pos)' : 'var(--neg)';
    const pnlColor = totalPnl >= 0 ? 'var(--pos)' : 'var(--neg)';

    console.log(`[Dashboard] Rendering P&L: MV=${totalMV}, Cost=${totalCost}, Pnl=${totalPnl}`);

    card.style.display = 'block';
    card.innerHTML = `
      <div class="pnl-header">
        <span class="pnl-label">💼 持倉總市值 (TWD)</span>
        <span class="pnl-total">NT$ ${YC.allocation.formatNTD(totalMV)}</span>
      </div>
      <div class="pnl-row-main">
        <div class="pnl-col">
          <div class="pnl-col-lbl">今日損益</div>
          <div class="pnl-col-val" style="color:${dayColor}">${daySign}NT$ ${YC.allocation.formatNTD(totalDayPnl)}</div>
        </div>
        <div class="pnl-divider"></div>
        <div class="pnl-col">
          <div class="pnl-col-lbl">帳面損益 (含手續費)</div>
          <div class="pnl-col-val" style="color:${pnlColor}">${pnlSign}NT$ ${YC.allocation.formatNTD(totalPnl)}</div>
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
    
    const expColor = avgExpRatio > 0.50 ? 'var(--pos)' : avgExpRatio < 0.20 ? 'var(--neg)' : 'var(--text-1)';
    
    card.style.display = 'block';
    card.innerHTML = `
      <div class="card-title">💰 股息收支與內扣分析</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; align-items:flex-end">
        <div>
          <div style="color:var(--text-2); font-size:12px; margin-bottom:4px">預估年領股息</div>
          <div style="font-size:20px; font-weight:800; color:var(--pos)">NT$ ${divData.totalDividends.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</div>
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

  function renderRebalanceCard(holdings, totalAssets) {
    const card = document.getElementById('dash-rebalance-card');
    if (!card || !holdings.length) { if (card) card.style.display = 'none'; return; }

    const rebalData = YC.allocation.calculateRebalanceSteps(totalAssets, holdings);
    if (rebalData.totalTargetPct === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    
    let hasBigDeviation = false;
    let stepsHtml = '';
    
    if (rebalData.steps.length === 0) {
        stepsHtml = `<div class="empty-state" style="padding:10px; min-height:60px; background:transparent"><div class="empty-state-text" style="color:var(--t0)">✅ 目前各項資產皆接近目標權重，無需大幅調整</div></div>`;
    } else {
        stepsHtml = rebalData.steps.map(s => {
            const color = s.action === '買入' ? 'var(--t0)' : 'var(--t3)';
            const dev = s.deviationPct || 0;
            const devAbs = Math.abs(dev);
            if (devAbs >= 5) hasBigDeviation = true;
            
            const devColor = devAbs >= 5 ? 'var(--neg)' : (devAbs >= 3 ? 'var(--accent)' : 'var(--text-3)');
            const devSign = dev > 0 ? '+' : '';
            const devText = `(偏離 ${devSign}${dev.toFixed(1)}%)`;
            const currentPctVal = s.currentPct || 0;

            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05)">
              <div>
                <div style="font-weight:700">${s.name} <span style="font-size:11px;color:var(--text-3);font-weight:normal">${s.symbol}</span></div>
                <div style="font-size:11px;color:var(--text-2);margin-top:4px;display:flex;align-items:center;gap:6px">
                  <span>目標 ${s.targetPct}%</span>
                  <span style="color:var(--border)">|</span>
                  <span>現有 ${currentPctVal.toFixed(1)}%</span>
                  <span style="color:${devColor};font-weight:${devAbs >= 5 ? '800' : 'normal'};background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:4px">${devText}</span>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:800; color:${color}">${s.action} NT$ ${s.diffAmount.toLocaleString('zh-TW', {maximumFractionDigits:0})}</div>
                <div style="font-size:11px;color:var(--text-3);margin-top:2px">至 NT$ ${s.targetVal.toLocaleString('zh-TW', {maximumFractionDigits:0})}</div>
              </div>
            </div>`;
        }).join('');
    }

    let warningHtml = '';
    if (hasBigDeviation) {
      warningHtml = `
      <div style="background:rgba(255,80,80,0.1); border-left:4px solid var(--neg); padding:10px 12px; border-radius:4px; margin-top:10px; margin-bottom:12px; display:flex; align-items:center; gap:10px; animation: pulse-border 2s infinite">
        <div style="font-size:20px; animation: shake 3s infinite">🚨</div>
        <div>
          <div style="color:var(--neg); font-weight:800; font-size:13px">強烈建議執行再平衡</div>
          <div style="color:var(--text-1); font-size:11px; margin-top:3px; line-height:1.4">部分資產偏離目標比例已達 <strong style="color:var(--neg)">5%</strong> 以上，風險可能超出您的原始設定。</div>
        </div>
      </div>
      <style>
        @keyframes pulse-border {
          0% { box-shadow: 0 0 0 0 rgba(255,80,80,0.4); }
          70% { box-shadow: 0 0 0 4px rgba(255,80,80,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,80,80,0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
      </style>
      `;
    }

    card.innerHTML = `
      <div class="card" style="border-color: ${hasBigDeviation ? 'rgba(255,80,80,0.4)' : 'rgba(124,111,255,0.3)'}">
        <div class="card-title row-between">
          <span>⚖️ 資產再平衡建議</span>
          <span style="font-size:11px;font-weight:normal;color:var(--text-2)">目標股票佔比: ${rebalData.totalTargetPct}%</span>
        </div>
        <div style="font-size:12px;color:var(--text-3);line-height:1.4">
          根據您設定的各資產「目標比重」，系統計算出的具體買賣金額以維持最佳配置：
        </div>
        ${warningHtml}
        <div style="background:var(--bg-input); border-radius:8px; padding:0 12px; margin-top:10px">
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
    const watchlistScore = YC.allocation.calculateWatchlistScore();
    const cls = YC.indicators.classify(health.score);
    const wCls = YC.indicators.classify(watchlistScore);
    
    healthCard.innerHTML = `
      <div class="card-title row-between" style="font-size:12px; margin-bottom:10px">
        <span>組合健康評分</span>
        <span style="font-size:10px;font-weight:400;color:var(--text-3)">持倉權重制</span>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-around; height:80px">
        <div style="display:flex; flex-direction:column; align-items:center">
          <div style="font-size:32px; font-weight:900; color:${cls.color}">${health.score}</div>
          <div style="font-size:10px; font-weight:700; color:${cls.color}; margin-top:2px">${cls.icon} ${cls.label}</div>
          <div style="font-size:9px; color:var(--text-3); margin-top:4px">目前持倉</div>
        </div>
        <div style="width:1px; height:40px; background:rgba(255,255,255,0.1)"></div>
        <div style="display:flex; flex-direction:column; align-items:center; opacity:0.8">
          <div style="font-size:24px; font-weight:800; color:${wCls.color}">${watchlistScore}</div>
          <div style="font-size:10px; font-weight:600; color:${wCls.color}; margin-top:2px">${wCls.label}</div>
          <div style="font-size:9px; color:var(--text-3); margin-top:4px">自選平均</div>
        </div>
      </div>
      <div style="font-size:9px; color:var(--text-3); margin-top:6px; text-align:center; opacity:0.7">
        綜合 ${holdings.length} 檔持倉與 ${YC.state.get().watchlist.length} 檔自選標的
      </div>
    `;

    // 2. Sector Allocation (Simplified SVG Bar Chart)
    const sectors = {};
    let totalValue = 0;

    for (const h of holdings) {
      const mv = h.marketValue || 0;
      const sector = h.industry || '未分類';
      sectors[sector] = (sectors[sector] || 0) + mv;
      totalValue += mv;
    }

    const sortedSectors = Object.entries(sectors)
        .filter(([name, val]) => val > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
    
    // Safety check for empty or zero-value portfolio
    if (totalValue <= 0) {
        sectorCard.innerHTML = `
          <div class="card-title" style="font-size:12px; margin-bottom:10px">核心產業分布</div>
          <div style="height:80px; display:flex; align-items:center; justify-content:center; color:var(--text-3); font-size:11px">暫無持倉數據</div>
        `;
        return;
    }

    sectorCard.innerHTML = `
      <div class="card-title" style="font-size:12px; margin-bottom:10px">核心產業分布</div>
      <div style="display:flex; flex-direction:column; gap:6px; height:80px; justify-content:center">
        ${sortedSectors.map(([name, val]) => {
          const pct = totalValue > 0 ? Math.round((val / totalValue) * 100) : 0;
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
    const daySign = dayPnl > 0 ? '+' : (dayPnl < 0 ? '-' : '');
    const pnlSign = totalPnl > 0 ? '+' : (totalPnl < 0 ? '-' : '');
    
    // For percentage strings: Only prefix "+" if positive, negative already has "-" from toFixed()
    const buildPctStr = (val) => (val > 0 ? '+' : '') + val.toFixed(2) + '%';
    const buildPnlPctStr = (val, sign) => (val > 0 ? '+' : (val < 0 ? '' : '')) + val.toFixed(2) + '%';
    
    const dayColor = dayPnl >= 0 ? 'var(--t3)' : 'var(--t0)';
    const pnlColor = totalPnl >= 0 ? 'var(--t3)' : 'var(--t0)';
    const temp = YC.indicators.temperatureScore({ 
        price: mkt.price, 
        high52w: mkt.high52w, 
        low52w: mkt.low52w, 
        ma200: mkt.ma200, 
        ma50: mkt.ma50,
        history: mkt.history,
        changePct: mkt.changePct
    });
    const cls = YC.indicators.classify(temp);

    const rate = YC.state.get().exchangeRate || 31.5;
    const pnlTWDHtml = (!isTW && totalPnl !== 0) 
      ? `<span style="font-size:9px;opacity:0.7;margin-left:2px">(TWD: ${pnlSign}${Math.round(Math.abs(totalPnl) * rate).toLocaleString()})</span>` 
      : '';

    return `
    <div class="stock-card ${cls.cardClass || 'tc1'}" onclick="YC.stocks.openDetail('${h.symbol}')">
      <div class="stock-avatar av2" style="width:42px;height:42px;font-size:12px">${YC.indicators.getInitials(h.name)}</div>
      <div class="stock-info" style="flex:1;min-width:0">
        <div class="stock-name">${h.name}</div>
        <div class="stock-sub">${(h.symbol || '').replace('.TW', '')} · ${h.shares}股 @ ${curSym}${h.costPrice?.toFixed(isTW ? 1 : 2)}</div>
        <!-- Market Value -->
        <div style="display:flex;align-items:baseline;gap:6px;margin-top:3px">
          <span style="font-size:13px;font-weight:700">${curSym}${mv.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</span>
          <span style="font-size:12px;font-weight:600;color:${dayColor}">${daySign}${curSym}${Math.abs(dayPnl).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}<span style="font-size:10px;margin-left:2px">(${buildPctStr(mkt.changePct)})</span></span>
        </div>
        <!-- Cost P&L sub-line -->
        <div style="font-size:10px;color:${pnlColor};margin-top:1px;display:flex;align-items:center;flex-wrap:wrap">
          <span>帳面 ${pnlSign}${curSym}${Math.abs(totalPnl).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</span>
          ${pnlTWDHtml}
          <span style="margin-left:5px">(${buildPnlPctStr(totalPnlPct)})</span>
        </div>
      </div>
      <div class="temp-badge ${cls.cls}" style="font-size:11px;padding:4px 8px;align-self:flex-start">${temp}</div>
    </div>`;
  }

  function renderGoal(settings) {
    const el = document.getElementById('dash-goal-card');
    if (!el) return;
    if (!settings.goalAmount || !settings.goalName) { el.innerHTML = ''; return; }

    const totalAssets  = settings.totalAssets || 0;
    const goalAmt      = settings.goalAmount;
    const currentAge   = settings.currentAge || 30;
    const monthlyPMT   = parseFloat(settings.monthlyInvest) || 0;
    const annualPMT    = monthlyPMT * 12;
    const pct          = Math.min(100, Math.round((totalAssets / goalAmt) * 100));
    const remaining    = goalAmt - totalAssets;

    // ── 1. Detect investment style from holdings ──────────────────
    const holdings = YC.portfolio.getEnriched();
    const style    = YC.allocation.detectInvestmentStyle(holdings);

    // ── 2. Expert neutral rate (blended from real holdings history) ──
    const expertRate = YC.allocation.computeExpertExpectedReturn(holdings, settings.cashAssets || 0);
    // Use style-aware neutral as floor if expert rate is too low (data insufficient)
    const neutralRate = Math.max(expertRate, style.neutral);

    // ── 3. Solve NPER for three scenarios (annual compounding + PMT) ──
    //   solveNPER(PV, annualPMT, FV, annualRate)
    const safeR    = rate => Math.max(rate, 0.001);
    const nBear    = YC.allocation.solveNPER(totalAssets, annualPMT, goalAmt, safeR(style.conservative));
    const nNeutral = YC.allocation.solveNPER(totalAssets, annualPMT, goalAmt, safeR(neutralRate));
    const nBull    = YC.allocation.solveNPER(totalAssets, annualPMT, goalAmt, safeR(style.optimistic));

    const toAge    = n => (n === Infinity || isNaN(n)) ? null : Math.round(currentAge + n);
    const ageStr   = age => age === null ? '難以達成' : `${age} 歲`;
    const yrsStr   = n   => {
        if (n === Infinity || isNaN(n)) return '難以達成';
        if (n < 1) return '預計 1 年內';
        return `${Math.floor(n)} 年 ${Math.round((n % 1) * 12)} 個月`;
    };

    const bearAge    = toAge(nBear);
    const neutralAge = toAge(nNeutral);
    const bullAge    = toAge(nBull);

    // ── 4. PMT hint line ─────────────────────────────────────────
    const pmtHint = monthlyPMT > 0
        ? `<span style="color:var(--pos)">含每月投入 NT$${monthlyPMT.toLocaleString()}</span>`
        : `<span style="color:var(--text-3)">⚠ 未設定每月投入金額（設定頁面可設定）</span>`;

    // ── 5. Neutral years string ───────────────────────────────────
    const yearsStr = yrsStr(nNeutral);

    el.innerHTML = `
    <div class="goal-card">
      <div class="goal-top">
        <div style="display:flex; align-items:center; gap:8px">
          <span class="goal-name-text">🎯 ${settings.goalName}</span>
          <span style="background:var(--accent); color:black; font-size:9px; font-weight:900; padding:2px 6px; border-radius:4px; opacity:0.8; letter-spacing:0.5px">EXPERT</span>
        </div>
        <span class="goal-pct-text">${pct}%</span>
      </div>
      <div class="goal-track"><div class="goal-fill" style="width:${pct}%"></div></div>
      <div class="goal-stats">
        <div class="goal-stat">
          <div class="goal-stat-val">NT$ ${YC.allocation.formatNTD(totalAssets)}</div>
          <div class="goal-stat-lbl">目前資產</div>
        </div>
        <div class="goal-stat">
          <div class="goal-stat-val" style="color:var(--t3)">NT$ ${YC.allocation.formatNTD(remaining)}</div>
          <div class="goal-stat-lbl">尚差金額</div>
        </div>
        <div class="goal-stat">
          <div class="goal-stat-val" style="color:var(--accent)">${yearsStr}</div>
          <div class="goal-stat-lbl">預計剩餘時間</div>
        </div>
        <div class="goal-stat">
          <div class="goal-stat-val" style="color:var(--t0)">${ageStr(neutralAge)}</div>
          <div class="goal-stat-lbl">達成預估年齡</div>
        </div>
      </div>

      <!-- Expert Analysis Detail -->
      <div style="margin-top:15px; padding-top:12px; border-top:1px dashed var(--border); display:flex; flex-direction:column; gap:10px">

        <!-- Style Badge + Expert Rate -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px">
          <div style="display:flex; align-items:center; gap:8px">
            <span style="font-size:11px; color:var(--text-3)">🎯 持倉風格偵測</span>
            <span style="font-size:12px; font-weight:700; background:rgba(255,255,255,0.07); padding:2px 8px; border-radius:20px; border:1px solid rgba(255,255,255,0.12)">${style.emoji} ${style.label}</span>
          </div>
          <span style="font-size:11px; color:var(--text-3)">${pmtHint}</span>
        </div>

        <!-- Rate Row -->
        <div style="display:flex; justify-content:space-between; align-items:center">
          <span style="font-size:11px; color:var(--text-3)">🏦 多因子加權期望報酬率</span>
          <span style="font-size:14px; font-weight:800; color:var(--pos)">${(neutralRate * 100).toFixed(2)}% <small style="font-size:9px; font-weight:normal; color:var(--text-3)">(已扣除內扣)</small></span>
        </div>

        <!-- Three scenario cards -->
        <div style="display:flex; gap:6px; font-size:10px">
          <div style="flex:1; background:rgba(255,80,80,0.07); padding:10px; border-radius:8px; border:1px solid rgba(255,80,80,0.15); text-align:center">
            <div style="color:var(--text-3); margin-bottom:4px; font-size:9px">🐻 保守情境</div>
            <div style="color:var(--pos); font-weight:800; font-size:15px">${ageStr(bearAge)}</div>
            <div style="color:var(--text-3); font-size:9px; margin-top:3px">年化 ${(style.conservative*100).toFixed(0)}%</div>
          </div>
          <div style="flex:1; background:rgba(0,229,255,0.07); padding:10px; border-radius:8px; border:1px solid rgba(0,229,255,0.2); text-align:center">
            <div style="color:var(--text-3); margin-bottom:4px; font-size:9px">📊 中性情境</div>
            <div style="color:var(--accent); font-weight:800; font-size:15px">${ageStr(neutralAge)}</div>
            <div style="color:var(--text-3); font-size:9px; margin-top:3px">年化 ${(neutralRate*100).toFixed(0)}%</div>
          </div>
          <div style="flex:1; background:rgba(0,212,100,0.07); padding:10px; border-radius:8px; border:1px solid rgba(0,212,100,0.15); text-align:center">
            <div style="color:var(--text-3); margin-bottom:4px; font-size:9px">🚀 樂觀情境</div>
            <div style="color:var(--neg); font-weight:800; font-size:15px">${ageStr(bullAge)}</div>
            <div style="color:var(--text-3); font-size:9px; margin-top:3px">年化 ${(style.optimistic*100).toFixed(0)}%</div>
          </div>
        </div>

        <div style="font-size:9px; color:var(--text-3); text-align:center; line-height:1.5">
          ※ 中性情境 = 多因子專家模型 (持倉歷史 CAGR×40% + 指數基線×60% + 股息)。<br>
          保守/樂觀情境依照「${style.label}」風格的歷史報酬區間自動校準，已計入每月定期投入的複利效益。
        </div>
      </div>
    </div>`;
  }


  /* ── Deviation Summary (inside Allocation Card) ─── */
  function renderDeviationSummary(holdings, totalAssets, suggestedEquityPct) {
    const el = document.getElementById('dash-deviation-summary');
    if (!el) return;

    // Filter to holdings with shares/value
    const allHoldings = (holdings || []).filter(h => (h.shares || 0) > 0);
    if (!allHoldings.length || !totalAssets || totalAssets <= 0) { el.style.display = 'none'; return; }

    // Check if any holding has manual targetWeight
    const withManualTarget = allHoldings.filter(h => (h.targetWeight || 0) > 0);

    // Determine effective target weights:
    // - If manual targets exist → use them
    // - Otherwise → auto-split suggestedEquityPct equally among all holdings
    let items;
    let usingAutoTarget = false;

    if (withManualTarget.length > 0) {
      // Use manual targets for those that have them
      items = withManualTarget.map(h => {
        const mkt = YC.state.getMarketData(h.symbol);
        const price = mkt ? (mkt.price || h.costPrice || 0) : (h.costPrice || 0);
        const currentVal = price * (h.shares || 0);
        const currentPct = (currentVal / totalAssets) * 100;
        const deviationPct = currentPct - (h.targetWeight || 0);
        return { name: h.name || h.symbol, symbol: h.symbol, targetPct: h.targetWeight, currentPct, deviationPct };
      });
    } else {
      // Auto-mode: derive equal-weight targets from suggestedEquityPct
      usingAutoTarget = true;
      const eqPct = (suggestedEquityPct > 0) ? suggestedEquityPct : 100;
      const autoTarget = eqPct / allHoldings.length;
      items = allHoldings.map(h => {
        const mkt = YC.state.getMarketData(h.symbol);
        const price = mkt ? (mkt.price || h.costPrice || 0) : (h.costPrice || 0);
        const currentVal = price * (h.shares || 0);
        const currentPct = (currentVal / totalAssets) * 100;
        const deviationPct = currentPct - autoTarget;
        return { name: h.name || h.symbol, symbol: h.symbol, targetPct: autoTarget, currentPct, deviationPct };
      });
    }

    const maxAbsDev = Math.max(...items.map(i => Math.abs(i.deviationPct)));
    const hasCritical = maxAbsDev >= 5;
    const hasWarning = !hasCritical && maxAbsDev >= 3;

    // Sort by absolute deviation descending to find worst offenders
    const sorted = [...items].sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct));
    const worst = sorted[0];
    const needsAction = sorted.filter(i => Math.abs(i.deviationPct) >= 5);
    const nearBoundary = sorted.filter(i => Math.abs(i.deviationPct) >= 3 && Math.abs(i.deviationPct) < 5);
    const balanced = sorted.filter(i => Math.abs(i.deviationPct) < 3);

    // Overall status label
    let statusEmoji, statusLabel, statusColor, borderColor;
    if (hasCritical) {
      statusEmoji = '🚨'; statusLabel = '需要再平衡'; statusColor = 'var(--pos)';
      borderColor = 'rgba(255,80,80,0.4)';
    } else if (hasWarning) {
      statusEmoji = '⚠️'; statusLabel = '輕微偏移'; statusColor = 'var(--accent)';
      borderColor = 'rgba(124,111,255,0.4)';
    } else {
      statusEmoji = '✅'; statusLabel = '配置平衡'; statusColor = 'var(--t0)';
      borderColor = 'rgba(0,212,170,0.3)';
    }

    // Max deviation bar: map 0~15% → 0~100% width, clamp
    const barPct = Math.min(100, (maxAbsDev / 15) * 100);
    const barColor = hasCritical ? 'var(--pos)' : hasWarning ? 'var(--accent)' : 'var(--t0)';

    // Worst asset detail line
    const worstSign = worst.deviationPct > 0 ? '+' : '';
    const worstLabel = worst.name && worst.name.length <= 5 ? worst.name : (worst.symbol || '').replace('.TW','').slice(0,6);
    const worstColor = Math.abs(worst.deviationPct) >= 5 ? 'var(--pos)'
                     : Math.abs(worst.deviationPct) >= 3 ? 'var(--accent)' : 'var(--t0)';

    // Summary chips: show name/symbol + deviation % + NTD amount
    const makeChips = (arr, chipColor) => arr.slice(0,3).map(i => {
      const sign = i.deviationPct > 0 ? '+' : '';
      const label = i.name && i.name.length <= 5 ? i.name : (i.symbol || '').replace('.TW','').slice(0,6);
      const ntdAmt = Math.round(Math.abs(i.deviationPct) / 100 * totalAssets);
      const ntdStr = ntdAmt >= 10000
        ? 'NT$' + (ntdAmt / 10000).toFixed(1) + '萬'
        : 'NT$' + ntdAmt.toLocaleString('zh-TW');
      const finalColor = i.deviationPct < 0 ? 'var(--neg)' : chipColor;
      return `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(255,255,255,0.05);border:1px solid ${finalColor}44;border-radius:20px;padding:2px 7px;font-size:10px;color:${finalColor};font-weight:700">${label} <span style="opacity:0.8">${sign}${i.deviationPct.toFixed(1)}%</span><span style="opacity:0.55;font-size:9px;margin-left:1px">(${ntdStr})</span></span>`;
    }).join('');

    let contentHtml = '';

    if (needsAction.length) {
      contentHtml += `
        <div style="margin-bottom:8px">
          <div style="font-size:10px;color:var(--pos);font-weight:700;margin-bottom:4px">🔴 偏離 ≥5%（建議調整）</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${makeChips(needsAction, 'var(--pos)')}</div>
        </div>`;
    }
    if (nearBoundary.length) {
      contentHtml += `
        <div style="margin-bottom:8px">
          <div style="font-size:10px;color:var(--accent);font-weight:700;margin-bottom:4px">🟡 偏離 3~5%（留意觀察）</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${makeChips(nearBoundary, 'var(--accent)')}</div>
        </div>`;
    }
    if (balanced.length && !hasCritical) {
      contentHtml += `
        <div>
          <div style="font-size:10px;color:var(--t0);font-weight:700;margin-bottom:4px">🟢 偏離 <3%（目標內）</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${makeChips(balanced, 'var(--t0)')}</div>
        </div>`;
    }

    el.style.display = 'block';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:1px">⚖️ 再平衡診斷</div>
          ${usingAutoTarget ? `<span style="font-size:9px;background:rgba(124,111,255,0.15);color:var(--accent);border:1px solid rgba(124,111,255,0.3);border-radius:20px;padding:1px 6px;font-weight:600">自動等權</span>` : ''}
        </div>
        <div style="font-size:12px;font-weight:800;color:${statusColor}">${statusEmoji} ${statusLabel}</div>
      </div>

      <!-- Max deviation gauge -->
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:11px;color:var(--text-3)">最大偏離幅度</span>
          <span style="font-size:13px;font-weight:800;color:${worstColor}">
            ${worstLabel}&nbsp;
            <span style="font-size:11px">${worstSign}${worst.deviationPct.toFixed(1)}%</span>
          </span>
        </div>
        <div style="height:5px;background:var(--bg-input);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:4px;transition:width 0.6s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:3px">
          <span style="font-size:9px;color:var(--text-3)">0%</span>
          <span style="font-size:9px;color:var(--accent)">3%</span>
          <span style="font-size:9px;color:var(--pos)">5%</span>
          <span style="font-size:9px;color:var(--text-3)">15%+</span>
        </div>
      </div>

      <!-- Asset breakdown -->
      ${contentHtml}

      ${hasCritical ? `
      <div style="background:rgba(255,80,80,0.08);border-left:3px solid var(--pos);padding:8px 10px;border-radius:4px;margin-top:8px;font-size:11px;color:var(--text-1);line-height:1.5">
        依「<strong style='color:var(--pos)'>幅度制</strong>」原則：偏離已達 5%，請執行再平衡以控制風險。
      </div>` : ''}
    `;
  }

  return { render, refreshData };
})();