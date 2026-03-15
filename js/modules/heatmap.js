/* ================================================
   heatmap.js — Industry Heatmap (Treemap Layout)
   Squarified Treemap algorithm for industry display
   ================================================ */

YC.heatmap = (() => {

    /* ?? Industry Definitions ?????????????????????? */
    const TW_INDUSTRIES = [
        { id: 'semiconductor', name: '半導體', symbols: ['2330.TW', '2454.TW', '2379.TW'] },
        { id: 'electronics', name: '電子', symbols: ['2317.TW', '2308.TW', '2382.TW'] },
        { id: 'finance', name: '金融保險', symbols: ['2882.TW', '2881.TW', '2886.TW'] },
        { id: 'telecom', name: '通訊', symbols: ['2412.TW', '3045.TW'] },
        { id: 'biotech', name: '生技醫療', symbols: ['4711.TW', '6547.TW'] },
        { id: 'twetf', name: '台灣ETF', symbols: ['0050.TW', '0056.TW', '00878.TW'] },
    ];

    const US_INDUSTRIES = [
        { id: 'semi', name: '半導體', symbols: ['NVDA', 'AVGO'] },
        { id: 'tech', name: '科技與軟體', symbols: ['AAPL', 'MSFT'] },
        { id: 'internet', name: '網路通訊', symbols: ['GOOGL', 'META'] },
        { id: 'consumer', name: '非必需消費', symbols: ['TSLA', 'AMZN'] },
        { id: 'finance', name: '金融', symbols: ['JPM', 'V', 'BRK-B'] },
        { id: 'health_staples', name: '醫療與民生', symbols: ['UNH', 'COST'] },
        { id: 'usetf', name: '美國ETF', symbols: ['SPY', 'QQQ', 'VOO', 'VTI', 'ARKK'] },
    ];

    /* ?? Compute industry avg change & avg temp ????? */
    function buildIndustryData(industries) {
        return industries.map(ind => {
            const stocks = ind.symbols.map(sym => YC.state.getMarketData(sym)).filter(Boolean);
            if (!stocks.length) return { ...ind, changePct: 0, avgTemp: 50, size: 1, count: ind.symbols.length };

            const avgChange = stocks.reduce((s, d) => s + (d.changePct || 0), 0) / stocks.length;
            const avgTemp = stocks.reduce((s, d) => {
                return s + YC.indicators.temperatureScore({
                    price: d.price, high52w: d.high52w, low52w: d.low52w,
                    ma200: d.ma200, ma50: d.ma50, history: d.history,
                    volume: d.volume, avgVolume: d.avgVolume,
                });
            }, 0) / stocks.length;

            // Size = number of symbols (affects treemap cell size)
            const size = Math.max(1, ind.symbols.length);
            return { ...ind, changePct: avgChange, avgTemp, size, count: stocks.length };
        });
    }

    /* ?? Color by temp score ??????????????????????? */
    function tempColor(score) {
        if (score <= 30) return '#00584a';  // dark teal  (value zone)
        if (score <= 50) return '#3a4a1a';  // olive
        if (score <= 65) return '#5a3a00';  // dark orange
        if (score <= 80) return '#7a2200';  // deep orange
        return '#6a0020';                    // dark red (overheated)
    }

    function tempColorBright(score) {
        if (score <= 30) return '#00d4aa';
        if (score <= 50) return '#a0c040';
        if (score <= 65) return '#f5c842';
        if (score <= 80) return '#ff8c42';
        return '#ff3560';
    }

    /* ?? Squarified Treemap (simplified) ??????????? */
    function squarify(items, x, y, w, h) {
        /* items: [{size, ...}] ??[{x,y,w,h, ...}] */
        if (!items.length) return [];
        const total = items.reduce((s, i) => s + i.size, 0);
        const area = w * h;

        const result = [];
        let remaining = [...items];
        let rx = x, ry = y, rw = w, rh = h;

        while (remaining.length > 0) {
            if (remaining.length === 1) {
                result.push({ ...remaining[0], x: rx, y: ry, w: rw, h: rh });
                break;
            }

            // Try to fit as many as possible keeping aspect ratio ??golden ratio
            let bestRow = [remaining[0]];
            let bestAspect = Infinity;

            for (let i = 1; i <= remaining.length; i++) {
                const row = remaining.slice(0, i);
                const rowSize = row.reduce((s, it) => s + it.size, 0);
                const remaining2 = remaining.slice(i);
                const remainSize = remaining2.reduce((s, it) => s + it.size, 0) || 1;

                // Layout row horizontally or vertically depending on aspect
                const isHoriz = rw >= rh;
                const bandLen = isHoriz ? rw : rh;
                const bandThick = (rowSize / (total - (total - rowSize - remainSize))) * (isHoriz ? rh : rw);
                // Actually use simple approach:
                const dimA = isHoriz ? rh * (rowSize / (rowSize + remainSize || 1)) : rw * (rowSize / (rowSize + remainSize || 1));
                const maxAspect = row.reduce((worst, item) => {
                    const cellArea = (area * (item.size / total));
                    const cellW = isHoriz ? (item.size / rowSize) * rw : dimA;
                    const cellH = isHoriz ? dimA : (item.size / rowSize) * rh;
                    const asp = Math.max(cellW / cellH, cellH / cellW);
                    return Math.max(worst, asp);
                }, 0);

                if (maxAspect < bestAspect) { bestAspect = maxAspect; bestRow = row; }
                else break;
            }

            // Place bestRow
            const rowSize = bestRow.reduce((s, it) => s + it.size, 0);
            const isHoriz = rw >= rh;
            const strip = isHoriz ? rh * (rowSize / (total)) : rw * (rowSize / total);
            // Adjust strip to remaining area
            const adjStrip = isHoriz
                ? (rowSize / (remaining.reduce((s, i) => s + i.size, 0))) * rh
                : (rowSize / (remaining.reduce((s, i) => s + i.size, 0))) * rw;

            let cx = rx, cy = ry;
            for (const item of bestRow) {
                const frac = item.size / rowSize;
                if (isHoriz) {
                    const cw = frac * rw;
                    result.push({ ...item, x: cx, y: cy, w: cw, h: adjStrip });
                    cx += cw;
                } else {
                    const ch = frac * rh;
                    result.push({ ...item, x: cx, y: cy, w: adjStrip, h: ch });
                    cy += ch;
                }
            }

            remaining = remaining.slice(bestRow.length);
            if (isHoriz) { ry += adjStrip; rh -= adjStrip; }
            else { rx += adjStrip; rw -= adjStrip; }
            total; // recalc would be needed for perfect squarify, this is simplified
            break; // simplified: do one pass, place all in a grid
        }

        return result;
    }

    /* ?? Full render ??????????????????????????????? */
    function render(container, mode = 'tw') {
        const watchlist = YC.state.get().watchlist || [];
        const filtered = watchlist.filter(w => mode === 'tw' ? (w.type === 'tw' || w.type === 'twetf') : (w.type === 'us' || w.type === 'usetf'));
        
        const indMap = {};
        for (const item of filtered) {
             const indName = item.industry || (item.type.includes('etf') ? 'ETF' : '未分類');
             if (!indMap[indName]) indMap[indName] = [];
             indMap[indName].push(item.symbol);
        }
        
        const industries = Object.keys(indMap).map((name, i) => ({
             id: mode + '_dyn_' + i,
             name: name,
             symbols: indMap[name]
        }));
        
        // Sort industries by number of symbols (largest first)
        industries.sort((a, b) => b.symbols.length - a.symbols.length);

        const data = buildIndustryData(industries);

        const cw = container.clientWidth || 340;
        const ch = Math.min(cw * 0.75, 300);
        container.style.height = ch + 'px';
        container.style.position = 'relative';
        container.innerHTML = '';

        // Simple grid layout (more reliable than squarified for small counts)
        const n = data.length;
        const cols = n <= 4 ? 2 : (n > 8 ? 4 : 3);
        const rows = Math.ceil(n / cols);
        const cellW = cw / Math.max(1, cols);
        const cellH = ch / Math.max(1, rows);

        data.forEach((ind, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cell = document.createElement('div');
            cell.className = 'treemap-cell';
            cell.style.cssText = `
        left:${col * cellW}px; top:${row * cellH}px;
        width:${cellW}px; height:${cellH}px;
        background:${tempColor(ind.avgTemp)};
        border-radius:4px;
      `;
            const sign = ind.changePct >= 0 ? '+' : '';
            const chgColor = ind.count > 0 ? tempColorBright(ind.avgTemp) : '#888';
            cell.innerHTML = `
        <div class="treemap-name" style="color:rgba(255,255,255,0.95)">${ind.name}</div>
        <div class="treemap-chg" style="color:${chgColor}">${ind.count > 0 ? sign + ind.changePct.toFixed(2) + '%' : '暫無數據'}</div>
      `;
            cell.addEventListener('click', () => showIndustryDetail(ind.id, ind.name, ind.symbols, mode));
            container.appendChild(cell);
        });
    }

    /* ?? Show industry detail overlay ??????????????? */
    function showIndustryDetail(id, name, symbols, mode) {
        const existing = document.getElementById('industry-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'industry-modal';
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        const stocks = symbols.map(sym => {
            const mdata = YC.state.getMarketData(sym);
            const wItem = YC.state.get().watchlist.find(w => w.symbol === sym) || { symbol: sym, name: sym, type: mode === 'us' ? 'us' : 'tw' };
            if (!mdata) return `<div class="holding-row"><span>${sym}</span><span class="text-muted">暫無數據</span></div>`;
            const temp = YC.indicators.temperatureScore({ price: mdata.price, high52w: mdata.high52w, low52w: mdata.low52w, ma200: mdata.ma200, ma50: mdata.ma50, history: mdata.history });
            const cls = YC.indicators.classify(temp);
            const sign = mdata.changePct >= 0 ? '+' : '';
            return `<div class="holding-row">
        <div>
          <div style="font-weight:700">${wItem.name || sym}</div>
          <div class="text-muted" style="font-size:11px">${sym.replace('.TW', '')}</div>
        </div>
        <div style="text-align:right">
          <div class="temp-badge ${cls.cls}">${temp} · ${cls.label}</div>
          <div class="stock-change ${mdata.changePct >= 0 ? 'pos' : 'neg'}" style="font-size:12px;margin-top:3px">${sign}${mdata.changePct.toFixed(2)}%</div>
        </div>
      </div>`;
        }).join('');

        overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-drag"></div>
        <div style="font-size:18px;font-weight:800;margin-bottom:14px">產業 ${name}</div>
        ${stocks || '<div class="text-muted">暫無資料</div>'}
        <button class="btn btn-secondary btn-full" style="margin-top:14px" onclick="document.getElementById('industry-modal').remove()">關閉</button>
      </div>`;
        document.body.appendChild(overlay);
    }

    return { render };
})();