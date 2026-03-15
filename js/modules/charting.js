/* ================================================
   charting.js — Professional SVG Charting Module
   Renders Area Charts with Volume & Moving Averages
   ================================================ */

YC.charting = (() => {

    /**
     * Renders a professional stock chart into a target element
     * @param {string} containerId - Target element ID
     * @param {Array} history - Array of {t, o, h, l, c, v}
     * @param {Object} options - { width, height, color, ma50, ma200 }
     */
    function renderPriceChart(containerId, history, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
        // Helper to calculate MA series
        const calcMASeries = (prices, period) => {
            return prices.map((_, i, arr) => {
                if (i < period - 1) return null;
                const slice = arr.slice(i - period + 1, i + 1);
                return slice.reduce((sum, val) => sum + val, 0) / period;
            });
        };

        // Calculate MAs on full history for accuracy before slicing
        const fullPrices = history.map(d => d.c);
        const ma50Full = options.ma50 ? calcMASeries(fullPrices, 50) : null;
        const ma200Full = options.ma200 ? calcMASeries(fullPrices, 200) : null;

        const data = history.slice(-90); // Last 90 days for display

        const startIndex = history.length - data.length;

        if (data.length < 2) {
            container.innerHTML = `<div class="chart-empty" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px">目前無足夠的歷史數據</div>`;
            return;
        }

        const width = options.width || container.clientWidth || 340;
        const height = options.height || 180;
        const padding = { t: 10, r: 10, b: 25, l: 45 };

        const chartW = width - padding.l - padding.r;
        const chartH = height - padding.t - padding.b;

        // Calculate scales
        const visiblePrices = data.map(d => d.c);
        if (ma50Full) visiblePrices.push(...ma50Full.slice(startIndex).filter(v => v != null));
        if (ma200Full) visiblePrices.push(...ma200Full.slice(startIndex).filter(v => v != null));

        const minP = Math.min(...visiblePrices) * 0.98;
        const maxP = Math.max(...visiblePrices) * 1.02;
        const rangeP = maxP - minP || 1;

        const getX = (i) => padding.l + (i / (data.length - 1)) * chartW;
        const getY = (price) => padding.t + chartH - ((price - minP) / rangeP) * chartH;

        const pts = data.map((d, i) => `${getX(i).toFixed(1)},${getY(d.c).toFixed(1)}`);

        // MA Paths
        const ma50Pts = ma50Full ? ma50Full.slice(startIndex)
            .map((v, i) => v ? `${getX(i).toFixed(1)},${getY(v).toFixed(1)}` : null)
            .filter(Boolean) : [];
        const ma200Pts = ma200Full ? ma200Full.slice(startIndex)
            .map((v, i) => v ? `${getX(i).toFixed(1)},${getY(v).toFixed(1)}` : null)
            .filter(Boolean) : [];
        const isUp = data[data.length - 1].c >= data[0].c;
        const mainColor = options.color || (isUp ? '#00d4aa' : '#ff3560');

        // Gradient & Area fill
        const gradId = `grad-${Math.random().toString(36).substr(2, 9)}`;
        const areaPts = `${getX(0).toFixed(1)},${padding.t + chartH} ${pts.join(' ')} ${getX(data.length - 1).toFixed(1)},${padding.t + chartH}`;

        // Build SVG
        let svg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="YC-chart-svg">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${mainColor}" stop-opacity="0.2"/>
                    <stop offset="100%" stop-color="${mainColor}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            
            <!-- Grid Lines & Labels -->
            <line x1="${padding.l}" y1="${getY(minP)}" x2="${width - padding.r}" y2="${getY(minP)}" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2,2" />
            <line x1="${padding.l}" y1="${getY(maxP)}" x2="${width - padding.r}" y2="${getY(maxP)}" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2,2" />
            <line x1="${padding.l}" y1="${getY((minP + maxP) / 2)}" x2="${width - padding.r}" y2="${getY((minP + maxP) / 2)}" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2,2" />

            <!-- Price Labels (Fixed colors) -->
            <text x="${padding.l - 8}" y="${getY(minP)}" text-anchor="end" dominant-baseline="middle" fill="#555570" font-size="10" font-family="Inter">${minP.toFixed(1)}</text>
            <text x="${padding.l - 8}" y="${getY(maxP)}" text-anchor="end" dominant-baseline="middle" fill="#555570" font-size="10" font-family="Inter">${maxP.toFixed(1)}</text>
            <text x="${padding.l - 8}" y="${getY((minP + maxP) / 2)}" text-anchor="end" dominant-baseline="middle" fill="#555570" font-size="10" font-family="Inter">${((minP + maxP) / 2).toFixed(1)}</text>

            <!-- X Axis Ticks (Dates) -->
            <text x="${padding.l}" y="${height - 8}" text-anchor="start" fill="#555570" font-size="9">${new Date(data[0].t).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}</text>
            <text x="${width - padding.r}" y="${height - 8}" text-anchor="end" fill="#555570" font-size="9">${new Date(data[data.length - 1].t).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}</text>

            <!-- Volume Bars -->
            ${(() => {
                const maxV = Math.max(...data.map(d => d.v || 0)) || 1;
                return data.map((d, i) => {
                    const barH = (d.v / maxV) * (chartH * 0.25);
                    const x = getX(i) - (chartW / data.length) / 2;
                    const prevC = i > 0 ? data[i - 1].c : d.o;
                    const barColor = d.c >= prevC ? 'rgba(0, 212, 170, 0.35)' : 'rgba(255, 53, 96, 0.35)';
                    return `<rect x="${x}" y="${height - padding.b - barH}" width="${(chartW / data.length) * 0.8}" height="${barH}" fill="${barColor}" rx="1"/>`;
                }).join('');
            })()}

            <!-- MA Lines (Background) -->
            ${ma50Pts.length > 1 ? `<polyline points="${ma50Pts.join(' ')}" fill="none" stroke="#f5c842" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.8" />` : ''}
            ${ma200Pts.length > 1 ? `<polyline points="${ma200Pts.join(' ')}" fill="none" stroke="#7c6fff" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.8" />` : ''}

            <!-- Main Area & Path -->
            <polygon points="${areaPts}" fill="url(#${gradId})" />
            <polyline points="${pts.join(' ')}" fill="none" stroke="${mainColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            
            <!-- Last Price Dot -->
            <circle cx="${getX(data.length - 1)}" cy="${getY(data[data.length - 1].c)}" r="4" fill="${mainColor}" stroke="white" stroke-width="1.5" />
        </svg>`;

        container.innerHTML = svg;
        } catch (e) {
            console.error('Chart render error:', e);
            container.innerHTML = `<div class="chart-empty" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px">圖表渲染錯誤</div>`;
        }
    }

    return { renderPriceChart };
})();