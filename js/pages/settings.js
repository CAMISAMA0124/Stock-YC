/* ================================================
   settings.js — Settings Page
   Manage Assets, API Keys, and Portfolio
   ================================================ */

YC.settingsPage = (() => {

  function render() {
    const el = document.getElementById('page-settings');
    if (!el) return;

    const state = YC.state.get();
    const settings = state.settings;

    el.innerHTML = `
        <div class="settings-page">
            
            <!-- Asset Section -->
            <div class="card">
                <div class="card-title">💰 資產配置設定</div>
                <div class="form-group">
                    <label class="form-label">目前總可用現金 (TWD)</label>
                    <input type="number" id="set-cash" class="form-input" value="${settings.cashAssets || 0}" placeholder="輸入您的銀行活存/現金總額">
                    <div class="form-help">系統將自動加總您的「庫存持股市值」與此「現金」，計算出「總資產」。</div>
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label class="form-label" style="color:var(--t0)">💡 推薦投資策略 (點擊自動填寫現金比例)</label>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px">
                        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('set-max-cash').value=30; document.getElementById('set-min-cash').value=0; return false;" style="flex:1">🚀 積極型<br><span style="font-size:10px;opacity:0.7">長線/市值型ETF為主</span></button>
                        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('set-max-cash').value=50; document.getElementById('set-min-cash').value=15; return false;" style="flex:1">⚖️ 穩健型<br><span style="font-size:10px;opacity:0.7">核心衛星配置(推薦)</span></button>
                        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('set-max-cash').value=80; document.getElementById('set-min-cash').value=30; return false;" style="flex:1">🛡️ 保守型<br><span style="font-size:10px;opacity:0.7">高現金水位備戰抄底</span></button>
                    </div>
                    <div class="form-help" style="line-height:1.6; padding:8px; background:var(--t1-bg); border-radius:6px; border: 1px dashed var(--border);">
                        <b>專家配置建議 (核心與衛星策略)：</b><br>
                        建立紀律的關鍵在於設定<strong style="color:var(--t0)">現金水位上下限</strong>。當市場極度恐慌(低溫)時，系統會指示您動用多數現金買入(趨近最低現金%)；當市場瘋狂(高溫)時，會要求您獲利了結，將現金拉高(趨近最高現金%)。這能有效克服追高殺低的人性弱點。
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">最高持有現金 %<br><span style="font-size:10px;font-weight:normal;color:var(--text-3)">(市場過熱時的防守水位)</span></label>
                        <input type="number" id="set-max-cash" class="form-input" value="${settings.maxCashPct}" min="0" max="100">
                    </div>
                    <div class="form-group">
                        <label class="form-label">最低預留現金 %<br><span style="font-size:10px;font-weight:normal;color:var(--text-3)">(市場極冷時的壓箱寶)</span></label>
                        <input type="number" id="set-min-cash" class="form-input" value="${settings.minCashPct}" min="0" max="100">
                    </div>
                </div>
            </div>

            <!-- AI Settings -->
            <div class="card">
                <div class="card-title">🤖 AI 助手設定</div>
                <div class="form-group">
                    <label class="form-label">AI 模型來源</label>
                    <select id="set-ai-provider" class="form-input">
                        <option value="gemini" ${settings.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini (推薦)</option>
                        <option value="openai" ${settings.aiProvider === 'openai' ? 'selected' : ''}>OpenAI ChatGPT</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">API Key (Gemini)</label>
                    <input type="password" id="set-api-key-gemini" class="form-input" value="${settings.apiKeyGemini || settings.apiKey || ''}" placeholder="貼上您的 Gemini API Key">
                </div>
                <div class="form-group">
                    <label class="form-label">API Key (OpenAI)</label>
                    <input type="password" id="set-api-key-openai" class="form-input" value="${settings.apiKeyOpenAI || ''}" placeholder="貼上您的 OpenAI API Key (選填)">
                    <div class="form-help" style="line-height:1.6; padding-top:4px;">
                        <ul style="margin:4px 0 0 18px; padding:0; color:var(--text-3);">
                            <li><span style="color:var(--t0)">安全性保證：</span>金鑰僅加密儲存於您的瀏覽器本地，絕不上傳。</li>
                            <li><a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent); text-decoration:underline;">👉 點此前往取得 Google Gemini API Key</a> (免費額度充足，推薦使用)</li>
                            <li><a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--accent); text-decoration:underline;">👉 點此前往取得 OpenAI API Key</a> (適合進階訂閱用戶)</li>
                            <li><span style="color:white">操作步驟：</span>複製取得的 API Key → 貼上至上方欄位 → 點擊下方「💾 儲存所有設定」。完成後即可至「AI 分析」分頁啟用智慧財經顧問！</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Investment Goal -->
            <div class="card">
                <div class="card-title">🎯 投資目標管理</div>
                <div class="form-group">
                    <label class="form-label">目標名稱</label>
                    <input type="text" id="set-goal-name" class="form-input" value="${settings.goalName}" placeholder="例如：退休基金、購屋頭期款">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">目標金額 (TWD)</label>
                        <input type="number" id="set-goal-amt" class="form-input" value="${settings.goalAmount}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">目前年齡</label>
                        <input type="number" id="set-current-age" class="form-input" value="${settings.currentAge || 30}" min="0" max="120">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">💳 每月定期定額投入 (TWD)
                        <span style="font-size:10px; font-weight:normal; color:var(--text-3); margin-left:6px">用於財務自由預測模型</span>
                    </label>
                    <input type="number" id="set-monthly-invest" class="form-input" value="${settings.monthlyInvest || 0}" placeholder="例如：20000" min="0">
                    <div class="form-help">填入您每月固定投入的金額，系統將納入複利計算，讓財務自由預測更準確。</div>
                </div>
            </div>

            <!-- Data Management -->
            <div class="card">
                <div class="card-title">📦 數據備份與同步</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px">
                  <button class="btn btn-secondary btn-sm" onclick="YC.state.exportJSON()">📤 匯出 JSON 備份</button>
                  <label class="btn btn-secondary btn-sm" style="display:flex; align-items:center; justify-content:center; cursor:pointer">
                    📥 匯入 JSON 備份
                    <input type="file" style="display:none" onchange="YC.settingsPage.handleImport(this.files[0])">
                  </label>
                </div>
                
                <div style="background:var(--bg-input); padding:12px; border-radius:8px">
                  <div style="font-size:13px; font-weight:700; margin-bottom:6px">🧱 跨裝置遷移</div>
                  <div style="font-size:11px; color:var(--text-3); margin-bottom:10px; line-height:1.4">
                    取得 10 分鐘內有效的驗證碼，在其他裝置輸入即可同步所有資料。
                  </div>
                  <div id="sync-area" style="display:flex; gap:8px">
                    <button class="btn btn-primary btn-sm" style="flex:1" onclick="YC.settingsPage.pushSync()">發送同步代碼</button>
                    <button class="btn btn-secondary btn-sm" style="flex:1" onclick="YC.settingsPage.pullSync()">輸入代碼同步</button>
                  </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px; margin-top:20px">
                    <button class="btn btn-primary" onclick="YC.settingsPage.saveAll()">💾 儲存所有設定</button>
                    <button class="btn btn-secondary" onclick="YC.settingsPage.resetApp()">🔄 重設系統 (清除快取)</button>
                </div>
                <div style="margin-top:15px; text-align:center; color:var(--text-3); font-size:11px">
                    Version 1.3.0 • YC Financial System
                </div>
            </div>

            <div style="height:40px"></div>
        </div>
        `;
  }

  function saveAll() {
    const state = YC.state.get();
    const currentSettings = state.settings || {};

    const newSettings = {
      ...currentSettings,
      cashAssets: parseFloat(document.getElementById('set-cash').value) || 0,
      maxCashPct: parseInt(document.getElementById('set-max-cash').value) || 50,
      minCashPct: parseInt(document.getElementById('set-min-cash').value) || 5,
      aiProvider: document.getElementById('set-ai-provider').value,
      apiKeyGemini: document.getElementById('set-api-key-gemini').value.trim(),
      apiKeyOpenAI: document.getElementById('set-api-key-openai').value.trim(),
      apiKey: document.getElementById('set-api-key-gemini').value.trim(), // Keep for legacy
      goalName: document.getElementById('set-goal-name').value,
      goalAmount: parseFloat(document.getElementById('set-goal-amt').value) || 0,
      currentAge: parseInt(document.getElementById('set-current-age').value) || 30,
      monthlyInvest: parseFloat(document.getElementById('set-monthly-invest').value) || 0,
    };

    // Calculate totalAssets = cash + current equity market value, then write once
    const holdings = YC.portfolio.getEnriched();
    const equity = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    newSettings.totalAssets = (newSettings.cashAssets || 0) + equity;

    YC.state.setSettings(newSettings);

    alert('✅ 設定已儲存成功！');
    YC.app.refreshData();
  }

  function resetApp() {
    if (confirm('確定要清除所有資料嗎？這將會刪除您的持倉設定。')) {
      localStorage.clear();
      location.reload();
    }
  }

  async function handleImport(file) {
    if (!file) return;
    try {
      await YC.state.importJSON(file);
      alert('✅ 匯入成功！系統將自動重新整理。');
      location.reload();
    } catch (err) {
      alert('❌ 匯入失敗：' + err);
    }
  }

  async function pushSync() {
    const btn = event.target;
    btn.disabled = true;
    btn.innerText = '處理中...';
    try {
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(YC.state.get())
      });
      const res = await response.json();
      if (res.code) {
        document.getElementById('sync-area').innerHTML = `
          <div style="flex:1; background:var(--bg-card); border:1px solid var(--accent); border-radius:6px; display:flex; flex-direction:column; align-items:center; padding:5px">
            <div style="font-size:10px; color:var(--accent)">同步代碼 (10分鐘後失效)</div>
            <div style="font-size:20px; letter-spacing:4px; font-weight:900; color:var(--t0)">${res.code}</div>
          </div>
        `;
      }
    } catch (err) {
      alert('❌ 同步失敗，請確認網路連線。');
      btn.disabled = false;
      btn.innerText = '發送同步代碼';
    }
  }

  async function pullSync() {
    const code = prompt('請輸入 6 位數同步代碼：');
    if (!code || code.length !== 6) return;
    
    try {
      const response = await fetch(`/api/sync/pull/${code}`);
      if (!response.ok) throw new Error('代碼無效或已過期');
      const data = await response.json();
      
      if (confirm('找到備份資料，是否覆蓋此裝置目前的資料？')) {
        YC.state.patch(data);
        alert('✅ 同步完成！');
        location.reload();
      }
    } catch (err) {
      alert('❌ 錯誤：' + err.message);
    }
  }

  return { render, saveAll, resetApp, handleImport, pushSync, pullSync };
})();