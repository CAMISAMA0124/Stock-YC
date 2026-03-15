/* ================================================
   ai-analysis.js — AI Stock Analysis Module
   Supports OpenAI, Google Gemini, Anthropic Claude
   ================================================ */

YC.ai = (() => {

    /* ── Build prompt for a single holding ──────────────── */
    function buildHoldingPrompt(holding, backtestStr = '尚無回測數據可用') {
        const { name, symbol, price, currency, changePct, tempScore, label, gainPct, shares, pe, divYield } = holding;
        const priceStr = price ? `${currency === 'TWD' ? 'NT$' : '$'}${price?.toFixed(2)}` : '未知';
        const changeStr = changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '未知';
        const tempInfo = tempScore != null ? `${tempScore}/100 (${label})` : '未知';
        const gainStr = gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '未知';
        const myNote = YC.state.getNote(symbol);

        return `你是一位專業的證券投資分析師，請針對以下標的進行趨勢分析、基本面診斷與投資建議：

【標的基本資訊】
- 名稱：${name} (${symbol.replace('.TW', '')})
- 目前價格：${priceStr} | 漲跌：${changeStr}
- 溫度計評分：${tempInfo} (註：0=極低估，100=極高估)
- 本益比 (P/E)：${pe ? pe.toFixed(1) + 'x' : '未知'}
- 股息殖利率：${divYield ? divYield.toFixed(2) + '%' : '未知'}
- 我的報酬率：${gainStr} | 持股數：${shares || '暫未持有'}
- IBS 短線指標：${price && holding.dayHigh && holding.dayLow ? YC.indicators.calculateIBS(price, holding.dayHigh, holding.dayLow)?.toFixed(2) || '未知' : '未知'} (註: <=0.2易反彈, >=0.8易回檔)

【回測與量化指標】(過去2年數據)
${backtestStr}

【我的投資備註】
${myNote || '(目前無備註)'}

【請針對以下內容分析】
1. **趨勢判定與建議**：加碼 / 持有 / 減碼 (請根據溫度計與回測趨勢判斷，原因為何？)
2. **財報與基本面關鍵點**：簡述獲利動能、P/E 或殖利率的意義。
3. **對整體配置的影響**：是否適合作為核心持股或短期操作？
4. **風險提示**：注意事項。

請用繁體中文，格式清晰簡直，重點條列，總結在 250 字內。`;
    }

    /* ── Build portfolio summary prompt ────────────────── */
    function buildPortfolioPrompt(holdings, sentimentScore) {
        const heatLabel = sentimentScore <= 30 ? '極冷' : sentimentScore <= 55 ? '適中' : sentimentScore <= 75 ? '偏熱' : '極熱';
        const names = holdings.map(h => `${h.name}(溫度${h.tempScore || '?'})`).join('、');
        return `你是一位資深理財分析師，請針對以下投資組合給予專業的全局建議。

【市場環境】當前市場情緒：${sentimentScore}/100 (${heatLabel})
【持倉標的】${names}

請用繁體中文，針對以下分析：
1. 整體風險配置建議 (1-2段)
2. 目前是否需要調節倉位 (優點、缺點)
3. 具體建議採取的動作 (1-2點)

不超過 250 字，回覆簡潔專業。`;
    }

    /* ── Call OpenAI API ──────────────────────────────── */
    async function callOpenAI(prompt, apiKey, onChunk) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 600,
                stream: true,
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || `OpenAI Error ${res.status}`);
        }
        return readStream(res, onChunk, 'openai');
    }

    /* ── Call Google Gemini API ───────────────────────── */
    async function callGemini(prompt, apiKey, onChunk) {
        const model = 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || `Gemini Error ${res.status}`);
        }
        return readStream(res, onChunk, 'gemini');
    }

    /* ── Call Anthropic Claude API ─────────────────────── */
    async function callClaude(prompt, apiKey, onChunk) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 600,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || `Claude Error ${res.status}`);
        }
        return readStream(res, onChunk, 'claude');
    }

    /* ── Stream reader (SSE) ───────────────────────────── */
    async function readStream(res, onChunk, provider) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete last line

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]') break;
                try {
                    const json = JSON.parse(data);
                    let chunk = '';
                    if (provider === 'openai') {
                        chunk = json?.choices?.[0]?.delta?.content || '';
                    } else if (provider === 'gemini') {
                        chunk = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } else if (provider === 'claude') {
                        chunk = json?.delta?.text || '';
                    }
                    if (chunk) {
                        fullText += chunk;
                        if (onChunk) onChunk(chunk, fullText);
                    }
                } catch { /* skip malformed JSON */ }
            }
        }
        return fullText;
    }

    /* ── Main analyze function ────────────────────────── */
    async function analyze(holding, { onChunk, onDone, onError } = {}) {
        const settings = YC.state.get().settings;
        const provider = settings.aiProvider || 'gemini';
        const keyMap = { openai: settings.apiKeyOpenAI, gemini: settings.apiKeyGemini, claude: settings.apiKeyClaude };
        const apiKey = keyMap[provider] || settings.apiKey;

        if (!apiKey) {
            const msg = '請在設定中輸入 AI API Key';
            if (onError) onError(msg);
            return msg;
        }

        let backtestStr = '尚無回測數據可用';
        try {
            const bt = await YC.api.getBacktest(holding.symbol, 2);
            if (bt && bt.rating) {
                const s = bt.statistics || {};
                const r = bt.rating;
                backtestStr = `- 持股評等: ${r.label}\n- 近30日上漲機率: ${s.winRate?.['30d'] || '未知'}\n- 30日平均報酬率: ${s.avgReturn?.['30d'] || '未知'}\n- 30日最大回落: ${s.maxDrawdown?.['30d'] || '未知'}\n- 評分依據: ${(r.reason || []).join('、')}`;
            }
        } catch (e) {
            console.warn('AI failed to load backtest data for prompt', e);
        }

        const prompt = buildHoldingPrompt(holding, backtestStr);
        try {
            let text;
            if (provider === 'openai') text = await callOpenAI(prompt, apiKey, onChunk);
            else if (provider === 'gemini') text = await callGemini(prompt, apiKey, onChunk);
            else if (provider === 'claude') text = await callClaude(prompt, apiKey, onChunk);
            else throw new Error('不支援的 AI 供應商: ' + provider);
            if (onDone) onDone(text);
            return text;
        } catch (e) {
            const msg = `AI 分析失敗：${e.message}`;
            if (onError) onError(msg);
            return msg;
        }
    }

    /* ── Analyze full portfolio ──────────────────── */
    async function analyzePortfolio(holdings, { onChunk, onDone, onError } = {}) {
        const settings = YC.state.get().settings;
        const provider = settings.aiProvider || 'gemini';
        const keyMap = { openai: settings.apiKeyOpenAI, gemini: settings.apiKeyGemini, claude: settings.apiKeyClaude };
        const apiKey = keyMap[provider] || settings.apiKey;
        if (!apiKey) { if (onError) onError('請先設定 API Key'); return; }

        const sentiment = YC.state.get().sentiment;
        const score = sentiment?.composite || 50;
        const prompt = buildPortfolioPrompt(holdings, score);
        try {
            let text;
            if (provider === 'openai') text = await callOpenAI(prompt, apiKey, onChunk);
            else if (provider === 'gemini') text = await callGemini(prompt, apiKey, onChunk);
            else text = await callClaude(prompt, apiKey, onChunk);
            if (onDone) onDone(text);
            return text;
        } catch (e) {
            const msg = `AI 分析失敗：${e.message}`;
            if (onError) onError(msg);
        }
    }

    /* ── Test API connection ─────────────────────────── */
    async function testConnection(provider, apiKey) {
        const testPrompt = '請用1句話中文回覆「連線成功」即可。';
        try {
            let result = '';
            if (provider === 'openai') result = await callOpenAI(testPrompt, apiKey, null);
            else if (provider === 'gemini') result = await callGemini(testPrompt, apiKey, null);
            else result = await callClaude(testPrompt, apiKey, null);
            return { ok: true, message: result.trim() || '連線成功' };
        } catch (e) {
            return { ok: false, message: e.message };
        }
    }

    return { analyze, analyzePortfolio, testConnection };
})();