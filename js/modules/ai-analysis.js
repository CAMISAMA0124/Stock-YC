/* ================================================
   ai-analysis.js ── AI Stock Analysis Module
   Supports OpenAI, Google Gemini, Anthropic Claude
   ================================================ */

YC.ai = (() => {

    /* ── Build prompt for a single holding ── */
    function buildHoldingPrompt(holding, backtestStr = '暫無回測數據參考') {
        const { name, symbol, price, currency, changePct, tempScore, label, gainPct, shares, pe, divYield } = holding;
        const priceStr = price ? `${currency === 'TWD' ? 'NT$' : '$'}${price?.toFixed(2)}` : '未知';
        const changeStr = changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '未知';
        const tempInfo = tempScore != null ? `${tempScore}/100 (${label})` : '未知';
        const gainStr = gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '未知';
        const myNote = YC.state.getNote(symbol);

        return `你是一位資深的股票投資專家與分析師，請你針對以下這檔持股的現狀與各個層面進行評估與給予建議：

【持股的基本資訊】
- 名稱：${name} (${symbol.replace('.TW', '')})
- 目前價格與漲跌：${priceStr} | 漲跌幅度：${changeStr}
- 溫度計評分/評量：${tempInfo} (註：0=極度超跌，100=極度超漲)
- 本益比(P/E)：${pe ? pe.toFixed(1) + 'x' : '未知'}
- 現金殖利率：${divYield ? divYield.toFixed(2) + '%' : '未知'}
- 我的帳面盈虧：${gainStr} | 持有份數：${shares || '目前未持有'}
- IBS 指標參考狀態：${price && holding.dayHigh && holding.dayLow ? YC.indicators.calculateIBS(price, holding.dayHigh, holding.dayLow)?.toFixed(2) || '未知' : '未知'} (註: <=0.2屬相對低位，>=0.8屬相對高位)

【歷史回測表現參考 (過去2年數據)】
${backtestStr}

【我的投資筆記與心得】
${myNote || '(目前尚無筆記)'}

【請針對此檔股票以下列幾個面向進行分析】
1. **短線現狀與操作建議**：根據當前價格趨勢與指標、溫度計進行短中線多空判斷與進出場建議；
2. **財報基本面與評價亮點**：簡述該產業目前處境、P/E 水位或殖利率的吸引力程度；
3. **對當前持有持倉的影響評估**：是對原有持倉進行加碼、持平或是減碼調整較為適宜；
4. **風險提示與小結**：結論與注意事項。

請使用繁體中文，格式清晰簡要，條列式說明，文字儘量控制在 350 字內。`;
    }

    /* ── Build portfolio summary prompt ── */
    function buildPortfolioPrompt(holdings, sentimentScore) {
        const heatLabel = sentimentScore <= 30 ? '極度恐慌' : sentimentScore <= 55 ? '中性盤整' : sentimentScore <= 75 ? '市場偏熱' : '極度貪婪'; 
        const names = holdings.map(h => `${h.name}(溫度${h.tempScore || '?'})`).join('、');
        return `你是一位專業的複利投資與資產配置教練，請對以下我的投資組合整體狀況與配置提出看法：
【市場恐慌貪婪情緒指標】：${sentimentScore}/100 (${heatLabel})
【目前重點持股】：${names}

請使用繁體中文，針對以下幾點提供建議：
1. 整體風險水平與當前操作建議 (1-2段)
2. 持股之間的分散性與產業平衡評比
3. 給予未來一個月的具體策略方針 (譬如加現金水位或尋找低位標的)

字數請控制在 300字以內。`;
    }

    /* ── Call Google Gemini API ── */
    async function callGemini(prompt, apiKey, onChunk) {
        // Updated for 2026: Priority to latest stable and next-gen flash models
        const models = [
            'gemini-flash-latest', 
            'gemini-2.5-flash', 
            'gemini-pro-latest', 
            'gemini-3-flash-preview',
            'gemini-2.0-flash' // Move 429-heavy model to end
        ];
        const versions = ['v1beta', 'v1'];
        let lastError = null;

        for (const model of models) {
            for (const ver of versions) {
                try {
                    const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                    });

                    if (res.ok) {
                        console.log(`Gemini success with ${ver}/${model}`);
                        return await readStream(res, onChunk, 'gemini');
                    }

                    const errorData = await res.json().catch(() => ({}));
                    const msg = errorData?.error?.message || '';
                    
                    // Skip if Not Found (404) OR Quota Exceeded (429) to try next candidate
                    if (res.status === 404 || res.status === 429 || msg.includes('not found') || msg.includes('quota')) {
                        console.warn(`Gemini ${ver}/${model} unavailable (${res.status}), trying next...`);
                        continue;
                    }

                    throw new Error(msg || `Gemini Error ${res.status}`);
                } catch (e) {
                    lastError = e;
                    if (e.message.includes('not found') || e.message.includes('404')) continue;
                    throw e; 
                }
            }
        }
        throw lastError || new Error('所有 Gemini 模型與 API 版本均嘗試失敗 (404)');
    }

    /* ── Call OpenAI API ── */
    async function callOpenAI(prompt, apiKey, onChunk) {
        const url = 'https://api.openai.com/v1/chat/completions';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ 
                model: 'gpt-4o-mini', 
                messages: [{ role: 'user', content: prompt }],
                stream: true
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || `OpenAI Error ${res.status}`);
        }
        return readStream(res, onChunk, 'openai');
    }

    /* ── Call Claude API ── */
    async function callClaude(prompt, apiKey, onChunk) {
        // Note: Claude CORS can be tricky, using standard headers
        const url = 'https://api.anthropic.com/v1/messages';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({ 
                model: 'claude-3-haiku-20240307', 
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }],
                stream: true
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || `Claude Error ${res.status}`);
        }
        return readStream(res, onChunk, 'claude');
    }

    /* ── Stream reader (SSE) ── */
    async function readStream(res, onChunk, provider) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete last line

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    // Claude SSE uses 'event:' and 'data:'
                    if (provider === 'claude') {
                        if (trimmedLine.startsWith('data:')) {
                            const data = trimmedLine.slice(5).trim();
                            try {
                                const json = JSON.parse(data);
                                if (json.type === 'content_block_delta') {
                                    const chunk = json.delta?.text || '';
                                    if (chunk) {
                                        fullText += chunk;
                                        if (onChunk) onChunk(chunk, fullText);
                                    }
                                }
                            } catch(e) {}
                        }
                        continue;
                    }

                    // OpenAI / Gemini SSE
                    if (trimmedLine.startsWith('data:')) {
                        const data = trimmedLine.slice(5).trim();
                        if (data === '[DONE]') break;
                        try {
                            const json = JSON.parse(data);
                            let chunk = '';
                            // Gemini
                            if (json.candidates) {
                                chunk = json.candidates[0]?.content?.parts[0]?.text || '';
                            } 
                            // OpenAI
                            else if (json.choices) {
                                chunk = json.choices[0]?.delta?.content || '';
                            }

                            if (chunk) {
                                fullText += chunk;
                                if (onChunk) onChunk(chunk, fullText);
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch(e) {
            console.error('Stream read error:', e);
            throw e;
        }
        return fullText;
    }

    /* ── Main analyze function ── */
    async function analyze(holding, { onChunk, onDone, onError } = {}) {
        const settings = YC.state.get().settings || {};
        const provider = settings.aiProvider || 'gemini';

        let apiKey = settings.apiKey;
        if (provider === 'openai' && settings.apiKeyOpenAI) apiKey = settings.apiKeyOpenAI;
        else if (provider === 'gemini' && settings.apiKeyGemini) apiKey = settings.apiKeyGemini;
        else if (provider === 'claude' && settings.apiKeyClaude) apiKey = settings.apiKeyClaude;

        if (!apiKey) {
            if (onError) onError('請先在設定中配置對應的 API Key');
            return;
        }

        let backtestStr = '暫無回測數據參考';
        try {
            const bt = await YC.api.getBacktest(holding.symbol, 2);
            if (bt && bt.rating) {
                const s = bt.statistics || {};
                const r = bt.rating;
                backtestStr = `- 綜合評級: ${r.label}\n- 近30天正報酬機率: ${s.winRate?.['30d'] || '未知'}\n- 30天平均報酬率: ${s.avgReturn?.['30d'] || '未知'}\n- 評估理由: ${(r.reason || []).join('、')}`;
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

            if (!text && !onChunk) throw new Error('AI 回傳內容為空');

            if (onDone) onDone(text);
            return text;
        } catch (e) {
            const msg = `AI 分析失敗：${e.message}`;
            console.error('AI Analysis Error Detail:', e);
            if (onError) onError(msg);
            return msg;
        }
    }

    /* ── Analyze full portfolio ── */
    async function analyzePortfolio(holdings, { onChunk, onDone, onError } = {}) {
        const settings = YC.state.get().settings || {};
        const provider = settings.aiProvider || 'gemini';

        let apiKey = settings.apiKey;
        if (provider === 'openai' && settings.apiKeyOpenAI) apiKey = settings.apiKeyOpenAI;
        else if (provider === 'gemini' && settings.apiKeyGemini) apiKey = settings.apiKeyGemini;
        else if (provider === 'claude' && settings.apiKeyClaude) apiKey = settings.apiKeyClaude;

        if (!apiKey) { if (onError) onError('請先在設定中配置 API Key'); return; }

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

    /* ── Test API connection ── */
    async function testConnection(provider, apiKey) {
        const testPrompt = '請用1句話中文回覆：連線測試成功。';
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
