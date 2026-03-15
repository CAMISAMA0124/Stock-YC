/* ================================================
   heatmap-page.js — Industry Heatmap Page
   ================================================ */

YC.heatmapPage = (() => {
    let mode = 'tw'; // tw | us

    function render() {
        const el = document.getElementById('page-heatmap');
        if (!el) return;

        el.innerHTML = `
    <div>
      <div class="tabs" id="heatmap-tabs">
        <button class="tab-btn ${mode === 'tw' ? 'active' : ''}" data-mode="tw">主要市場 台灣</button>
        <button class="tab-btn ${mode === 'us' ? 'active' : ''}" data-mode="us">海外市場 美國</button>
      </div>

      <div class="heatmap-wrap" id="heatmap-canvas" style="min-height:260px"></div>

      <div style="margin-top:14px">
        <div class="section-title">溫度計分佈</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[['低估 價值區', '0-30度'], ['適中 冷靜區', '31-60度'], ['偏熱 觀察期', '61-80度'], ['過熱 風險區', '81-100度']].map(([l, d]) =>
            `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px">
               <span style="font-weight:600">${l}</span><br><span class="text-muted">${d}</span>
             </div>`).join('')}
        </div>
      </div>

      <div style="margin-top:14px">
        <div class="section-title">使用說明</div>
        <div class="card" style="font-size:13px;color:var(--text-2);line-height:1.7">
          熱力圖面積代表該標的在資產中的權重，顏色則代表該標的目前的溫度。
          
          點擊後可以查看該標的的詳細報價與溫度分析。
          
          暖色調 (紅色) 代表過熱 (建議分批減碼或保留)，冷色調 (綠色) 代表低估 (適合分批佈局或觀望)。
        </div>
      </div>
    </div>`;

        el.querySelector('#heatmap-tabs').addEventListener('click', e => {
            const btn = e.target.closest('[data-mode]');
            if (!btn) return;
            mode = btn.dataset.mode;
            el.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            drawHeatmap();
        });

        drawHeatmap();
    }

    function drawHeatmap() {
        const canvas = document.getElementById('heatmap-canvas');
        if (!canvas) return;
        canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:260px;color:var(--text-3)">圖表繪製中...</div>';
        setTimeout(() => {
            YC.heatmap.render(canvas, mode);
        }, 50);
    }

    function refresh() { if (document.getElementById('page-heatmap').classList.contains('active')) drawHeatmap(); }

    return { render, refresh };
})();