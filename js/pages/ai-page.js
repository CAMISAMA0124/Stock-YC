/* ================================================
   ai-page.js — AI Stock Analysis Page
   ================================================ */

YC.aiPage = (() => {

    function render() {
        const el = document.getElementById('page-ai');
        if (!el) return;
        const holdings = YC.portfolio.getEnriched();
        const settings = YC.state.get().settings;
        const hasKey = !!(settings.apiKeyOpenAI || settings.apiKeyGemini || settings.apiKeyClaude || settings.apiKey);
        const providerName = { openai: 'OpenAI GPT', gemini: 'Google Gemini', claude: 'Anthropic Claude' }[settings.aiProvider] || 'AI';

        el.innerHTML = `
    <div>
      ${!hasKey ? `
      <div class="card" style="border-color:rgba(245,200,66,0.3);background:var(--t1-bg);margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:6px">⚠️ 需要 AI API Key</div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">請到設定中輸入您的 AI API Key 才能使用分析功能。支援 OpenAI、Google Gemini 與 Anthropic Claude。</div>
        <button class="btn btn-primary btn-sm" onclick="YC.app.navigate('settings')">前往設定</button>
      </div>` : `
      <div class="card" style="background:var(--accent-dim);border-color:rgba(124,111,255,0.3);margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:700">🤖 使用 ${providerName}</div>
            <div style="font-size:11px;color:var(--text-2)">每次分析約消耗數千個 Token 資源</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-portfolio-ai" ${!holdings.length ? 'disabled' : ''}>分析全投資組合</button>
        </div>
        <div id="portfolio-ai-result" style="margin-top:0"></div>
      </div>`}

      ${!holdings.length ? `
      <div class="empty-state">
        <div class="empty-state-icon">📄</div>
        <div class="empty-state-text">請先在「股票」頁面新增持股，<br>才能啟動 AI 診斷。</div>
        <br>
        <button class="btn btn-primary btn-sm" onclick="YC.app.navigate('stocks')">前往選股</button>
      </div>` : `
      <div class="section-title">個股 AI 診斷</div>
      <div id="ai-holdings-list">
        ${holdings.map(h => buildHoldingCard(h)).join('')}
      </div>`}
    </div>`;

        // Portfolio AI button
        if (hasKey && holdings.length) {
            document.getElementById('btn-portfolio-ai')?.addEventListener('click', () => runPortfolioAnalysis(holdings));
        }

        // Per-holding AI buttons
        holdings.forEach(h => {
            document.getElementById(`btn-ai-${h.symbol}`)?.addEventListener('click', () => runHoldingAnalysis(h));
        });
    }

    function buildHoldingCard(h) {
        const gainStr = h.gainPct != null ? `${h.gainPct >= 0 ? '+' : ''}${h.gainPct.toFixed(2)}%` : '--';
        const gainCls = (h.gainPct || 0) >= 0 ? 'pos' : 'neg';
        const priceStr = h.price ? `${h.currency === 'TWD' ? 'NT$' : '$'}${h.price.toFixed(2)}` : '--';
        const initials = YC.indicators.getInitials(h.name, h.shortName);
        return `
    <div class="ai-card" id="ai-card-${h.symbol}">
      <div class="ai-card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="stock-avatar av${(h.cls || 'tc1').replace('tc', '')}">${initials}</div>
          <div>
            <div style="font-size:16px;font-weight:700">${h.name}</div>
            <div style="font-size:11px;color:var(--text-3)">${(h.symbol || '').replace('.TW', '')} · ${priceStr}</div>
          </div>
        </div>
        <div style="text-align:right">
          ${h.tempScore != null ? `<div class="temp-badge ${h.cls}">${h.tempScore} · ${h.label}</div>` : ''}
          <div class="stock-change ${gainCls}" style="font-size:12px;margin-top:4px">報酬率 ${gainStr}</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm btn-full" id="btn-ai-${h.symbol}" style="margin-top:4px">
        🚀 AI 診斷此標的
      </button>
      <div id="ai-result-${h.symbol}"></div>
    </div>`;
    }

    async function runHoldingAnalysis(holding) {
        const resultEl = document.getElementById(`ai-result-${holding.symbol}`);
        const btn = document.getElementById(`btn-ai-${holding.symbol}`);
        if (!resultEl || !btn) return;

        btn.disabled = true;
        btn.textContent = '分析中...';

        resultEl.innerHTML = `<div class="ai-result ai-typing" id="ai-stream-${holding.symbol}"></div>`;
        const streamEl = document.getElementById(`ai-stream-${holding.symbol}`);
        let fullText = '';

        await YC.ai.analyze(holding, {
            onChunk: (chunk, full) => {
                fullText = full;
                if (streamEl) streamEl.innerHTML = renderMYCdown(full);
                streamEl?.classList.add('ai-typing');
            },
            onDone: (text) => {
                if (streamEl) {
                    streamEl.innerHTML = renderMYCdown(text);
                    streamEl.classList.remove('ai-typing');
                }
                btn.disabled = false;
                btn.textContent = '🔄 重新分析';
                // Extract recommendation badge
                const recMatch = text.match(/(加碼|持有|減碼)/);
                if (recMatch) {
                    const rec = recMatch[1];
                    const badgeCls = rec === '加碼' ? 'buy' : rec === '減碼' ? 'sell' : 'hold';
                    const badgeEl = document.createElement('div');
                    badgeEl.style.cssText = 'margin-bottom:8px';
                    badgeEl.innerHTML = `<span class="ai-badge ${badgeCls}">建議內容：${rec}</span>`;
                    resultEl.insertBefore(badgeEl, resultEl.firstChild);
                }
            },
            onError: (msg) => {
                if (resultEl) resultEl.innerHTML = `<div class="ai-result" style="color:var(--t3)">${msg}</div>`;
                btn.disabled = false;
                btn.textContent = '❌ 重試';
            },
        });
    }

    async function runPortfolioAnalysis(holdings) {
        const btn = document.getElementById('btn-portfolio-ai');
        const resultEl = document.getElementById('portfolio-ai-result');
        if (!btn || !resultEl) return;
        btn.disabled = true;
        btn.textContent = '分析中...';
        resultEl.innerHTML = `<div class="ai-result ai-typing" id="portfolio-stream"></div>`;
        const streamEl = document.getElementById('portfolio-stream');

        await YC.ai.analyzePortfolio(holdings, {
            onChunk: (chunk, full) => {
                if (streamEl) streamEl.innerHTML = renderMYCdown(full);
            },
            onDone: (text) => {
                if (streamEl) { streamEl.innerHTML = renderMYCdown(text); streamEl.classList.remove('ai-typing'); }
                btn.disabled = false;
                btn.textContent = '分析全投資組合';
            },
            onError: (msg) => {
                resultEl.innerHTML = `<div class="ai-result" style="color:var(--t3)">${msg}</div>`;
                btn.disabled = false;
                btn.textContent = '分析全投資組合';
            },
        });
    }

    /* Simple mYCdown-to-html (bold + newlines) */
    function renderMYCdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-1)">$1</strong>')
            .replace(/\n/g, '<br>');
    }

    return { render };
})();