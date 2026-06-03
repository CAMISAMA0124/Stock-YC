/* ================================================
   charting.js — Professional SVG Charting Module
   Renders Area Charts with Volume & Moving Averages
   Supports touch/mouse pan to view historical data
   ================================================ */

YC.charting = (() => {

    // Chart state per containerId
    const _chartState = {};

    /**
     * Renders a professional stock chart into a target element
     * @param {string} containerId - Target element ID
     * @param {Array} history - Array of {t, o, h, l, c, v}
     * @param {Object} options - { width, height, color, ma50, ma200 }
     */
    function renderPriceChart(containerId, history, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!history || history.length < 2) {
            container.innerHTML = `<div class="chart-empty" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px">目前無足夠的歷史數據</div>`;
            return;
        }

        // Initialize or restore pan state
        const VIEW_SIZE = 90; // visible candles
        if (!_chartState[containerId]) {
            _chartState[containerId] = {
                offset: 0,
                isFirstRender: true
            };
        }
        const state = _chartState[containerId];
        if (options.resetPan) {
            state.offset = 0;
            state.isFirstRender = true;
        }
        state.history = history;
        state.options = options;

        // Clamp offset
        state.offset = Math.max(0, Math.min(state.offset, Math.max(0, history.length - VIEW_SIZE)));

        // Render the chart SVG with current state
        _renderChart(container, containerId, history, options, state, VIEW_SIZE);
        
        // Attach pan listeners once per DOM element
        if (!container._panAttached) {
            _attachPanListeners(container, containerId, state, VIEW_SIZE);
            container._panAttached = true;
        }
    }

    function _renderChart(container, containerId, history, options, state, VIEW_SIZE) {
        try {
            // Helper to calculate MA series on full history
            const calcMASeries = (prices, period) => {
                return prices.map((_, i, arr) => {
                    if (i < period - 1) return null;
                    const slice = arr.slice(i - period + 1, i + 1);
                    return slice.reduce((sum, val) => sum + val, 0) / period;
                });
            };

            const fullPrices = history.map(d => d.c);
            const ma50Full  = options.ma50  ? calcMASeries(fullPrices, 50)  : null;
            const ma200Full = options.ma200 ? calcMASeries(fullPrices, 200) : null;

            // Determine viewport window (oldest on left, newest on right)
            const totalLen   = history.length;
            const endIdx     = totalLen - state.offset;               // exclusive
            const startIdx   = Math.max(0, endIdx - VIEW_SIZE);       // inclusive
            const data       = history.slice(startIdx, endIdx);

            if (data.length < 2) return;

            const width   = options.width  || container.clientWidth || 340;
            const height  = options.height || 180;
            const padding = { t: 10, r: 10, b: 36, l: 45 };

            const chartW = width - padding.l - padding.r;
            const chartH = height - padding.t - padding.b;

            // Scale using visible data + visible MA values
            const visiblePrices = [...data.map(d => d.c)];
            if (ma50Full)  visiblePrices.push(...ma50Full.slice(startIdx, endIdx).filter(v => v != null));
            if (ma200Full) visiblePrices.push(...ma200Full.slice(startIdx, endIdx).filter(v => v != null));

            const minP   = Math.min(...visiblePrices) * 0.98;
            const maxP   = Math.max(...visiblePrices) * 1.02;
            const rangeP = maxP - minP || 1;

            const getX = (i) => padding.l + (i / (data.length - 1)) * chartW;
            const getY = (price) => padding.t + chartH - ((price - minP) / rangeP) * chartH;

            const pts = data.map((d, i) => `${getX(i).toFixed(1)},${getY(d.c).toFixed(1)}`);

            // MA paths for visible window
            const ma50Pts = ma50Full
                ? ma50Full.slice(startIdx, endIdx)
                    .map((v, i) => v ? `${getX(i).toFixed(1)},${getY(v).toFixed(1)}` : null)
                    .filter(Boolean)
                : [];
            const ma200Pts = ma200Full
                ? ma200Full.slice(startIdx, endIdx)
                    .map((v, i) => v ? `${getX(i).toFixed(1)},${getY(v).toFixed(1)}` : null)
                    .filter(Boolean)
                : [];

            const isUp      = data[data.length - 1].c >= data[0].c;
            const mainColor = options.color || (isUp ? '#ff3560' : '#00d4aa');

            const gradId  = `grad-${containerId.replace(/[^a-z0-9]/gi, '')}`;
            const areaPts = `${getX(0).toFixed(1)},${padding.t + chartH} ${pts.join(' ')} ${getX(data.length - 1).toFixed(1)},${padding.t + chartH}`;

            // Mini scrollbar: show position
            const canScroll    = totalLen > VIEW_SIZE;
            const scrollBarW   = chartW;
            const thumbW       = Math.max(20, Math.round((VIEW_SIZE / totalLen) * scrollBarW));
            const thumbX       = padding.l + Math.round(((totalLen - endIdx) / Math.max(1, totalLen - VIEW_SIZE)) * (scrollBarW - thumbW));
            const scrollBarY   = height - 10;

            let svg = `
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="YC-chart-svg ${state.isFirstRender ? '' : 'no-anim'}" style="touch-action:none;user-select:none;">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${mainColor}" stop-opacity="0.2"/>
                        <stop offset="100%" stop-color="${mainColor}" stop-opacity="0"/>
                    </linearGradient>
                </defs>

                <!-- Grid Lines -->
                <line x1="${padding.l}" y1="${getY(minP)}"           x2="${width - padding.r}" y2="${getY(minP)}"           stroke="rgba(255,255,255,0.08)" stroke-dasharray="2,2" />
                <line x1="${padding.l}" y1="${getY(maxP)}"           x2="${width - padding.r}" y2="${getY(maxP)}"           stroke="rgba(255,255,255,0.08)" stroke-dasharray="2,2" />
                <line x1="${padding.l}" y1="${getY((minP+maxP)/2)}"  x2="${width - padding.r}" y2="${getY((minP+maxP)/2)}"  stroke="rgba(255,255,255,0.08)" stroke-dasharray="2,2" />

                <!-- Price Labels -->
                <text x="${padding.l - 8}" y="${getY(minP)}"          text-anchor="end" dominant-baseline="middle" fill="#555570" font-size="10" font-family="Inter">${minP.toFixed(1)}</text>
                <text x="${padding.l - 8}" y="${getY(maxP)}"          text-anchor="end" dominant-baseline="middle" fill="#555570" font-size="10" font-family="Inter">${maxP.toFixed(1)}</text>
                <text x="${padding.l - 8}" y="${getY((minP+maxP)/2)}" text-anchor="end" dominant-baseline="middle" fill="#555570" font-size="10" font-family="Inter">${((minP+maxP)/2).toFixed(1)}</text>

                <!-- X Axis Date Labels -->
                <text x="${padding.l}"             y="${height - (canScroll ? 22 : 8)}" text-anchor="start" fill="#555570" font-size="9">${new Date(data[0].t).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}</text>
                <text x="${width - padding.r}"     y="${height - (canScroll ? 22 : 8)}" text-anchor="end"   fill="#555570" font-size="9">${new Date(data[data.length - 1].t).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}</text>

                <!-- Volume Bars -->
                ${(() => {
                    const maxV = Math.max(...data.map(d => d.v || 0)) || 1;
                    return data.map((d, i) => {
                        const barH    = (d.v / maxV) * (chartH * 0.22);
                        const x       = getX(i) - (chartW / data.length) / 2;
                        const prevC   = i > 0 ? data[i - 1].c : d.o;
                        const barColor = d.c >= prevC ? 'rgba(255, 53, 96, 0.32)' : 'rgba(0, 212, 170, 0.32)';
                        return `<rect x="${x}" y="${height - padding.b - barH}" width="${(chartW / data.length) * 0.8}" height="${barH}" fill="${barColor}" rx="1"/>`;
                    }).join('');
                })()}

                <!-- MA Lines -->
                ${ma50Pts.length  > 1 ? `<polyline points="${ma50Pts.join(' ')}"  fill="none" stroke="#f5c842" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.85" />` : ''}
                ${ma200Pts.length > 1 ? `<polyline points="${ma200Pts.join(' ')}" fill="none" stroke="#7c6fff" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.85" />` : ''}

                <!-- Main Area & Line -->
                <polygon  points="${areaPts}"       fill="url(#${gradId})" />
                <polyline points="${pts.join(' ')}" fill="none" stroke="${mainColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

                <!-- Last Price Dot -->
                <circle cx="${getX(data.length - 1)}" cy="${getY(data[data.length - 1].c)}" r="4" fill="${mainColor}" stroke="white" stroke-width="1.5" />

                <!-- Pan hint label (only when there's more history) -->
                ${canScroll ? `
                <!-- Mini scrollbar track -->
                <rect x="${padding.l}" y="${scrollBarY - 3}" width="${scrollBarW}" height="4" rx="2" fill="rgba(255,255,255,0.08)"/>
                <!-- Mini scrollbar thumb -->
                <rect x="${thumbX}" y="${scrollBarY - 3}" width="${thumbW}" height="4" rx="2" fill="${mainColor}" opacity="0.5"/>
                <!-- Pan hint -->
                <text x="${width / 2}" y="${height - 1}" text-anchor="middle" fill="#555570" font-size="8.5" font-family="Inter">← 拖曳查看更早歷史 →</text>
                ` : ''}
            </svg>`;

            container.innerHTML = svg;
            state.isFirstRender = false;
        } catch (e) {
            console.error('Chart render error:', e);
            container.innerHTML = `<div class="chart-empty" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px">圖表渲染錯誤</div>`;
        }
    }

    function _attachPanListeners(container, containerId, state, VIEW_SIZE) {
        let dragStartX    = null;
        let dragStartOff  = null;
        let isDragging    = false;
        let animationFrameId = null;

        // For momentum/inertia
        let lastX = null;
        let lastTime = null;
        let velocity = 0; // px per ms
        let momentumFrameId = null;

        const pxPerCandle = () => {
            const w = container.clientWidth || 340;
            const chartW = w - 45 - 10;
            return chartW / Math.min(VIEW_SIZE, state.history.length - 1);
        };

        function onPointerDown(e) {
            if (e.type === 'mousedown' && e.button !== 0) return;
            
            // Cancel any active momentum scrolling
            if (momentumFrameId) {
                cancelAnimationFrame(momentumFrameId);
                momentumFrameId = null;
            }

            isDragging    = true;
            dragStartX    = e.clientX ?? (e.touches && e.touches[0].clientX);
            dragStartOff  = state.offset;
            lastX         = dragStartX;
            lastTime      = performance.now();
            velocity      = 0;
            container.style.cursor = 'grabbing';

            if (e.type === 'mousedown') {
                window.addEventListener('mousemove', onPointerMove);
                window.addEventListener('mouseup',   onPointerUp);
            } else {
                window.addEventListener('touchmove',  onTouchMove, { passive: false });
                window.addEventListener('touchend',   onPointerUp);
            }
        }

        function onPointerMove(e) {
            if (!isDragging) return;
            const curX = e.clientX;
            if (curX == null) return;
            trackVelocity(curX);
            updateDrag(curX);
        }

        function onTouchMove(e) {
            if (!isDragging) return;
            const curX = e.touches && e.touches[0].clientX;
            if (curX == null) return;
            e.preventDefault(); // Prevent scrolling page when dragging chart
            trackVelocity(curX);
            updateDrag(curX);
        }

        function trackVelocity(curX) {
            const now = performance.now();
            const dt = now - lastTime;
            if (dt > 0) {
                const instantV = (curX - lastX) / dt;
                // Exponential moving average to smooth velocity
                velocity = velocity * 0.4 + instantV * 0.6;
            }
            lastX = curX;
            lastTime = now;
        }

        function updateDrag(curX) {
            const maxOffset = Math.max(0, state.history.length - VIEW_SIZE);
            const dx       = curX - dragStartX; // Correct direction: curX - dragStartX
            // Added sensitivity multiplier of 1.3 to make standard dragging feel more responsive
            const candleDx = Math.round((dx * 1.3) / pxPerCandle());
            const targetOffset = Math.max(0, Math.min(maxOffset, dragStartOff + candleDx));
            
            if (state.offset !== targetOffset) {
                state.offset = targetOffset;
                if (!animationFrameId) {
                    animationFrameId = requestAnimationFrame(() => {
                        if (document.body.contains(container)) {
                            _renderChart(container, containerId, state.history, state.options, state, VIEW_SIZE);
                        }
                        animationFrameId = null;
                    });
                }
            }
        }

        function startMomentum() {
            let lastFrameTime = performance.now();
            let currentOffset = state.offset;
            const maxOffset = Math.max(0, state.history.length - VIEW_SIZE);
            const friction = 0.95; // Deceleration rate per frame
            
            function step(timestamp) {
                if (!document.body.contains(container)) {
                    momentumFrameId = null;
                    return;
                }

                const dt = timestamp - lastFrameTime;
                lastFrameTime = timestamp;
                
                // Scale friction by dt to keep rate consistent across different refresh rates (e.g. 60Hz/120Hz)
                const frictionFactor = Math.pow(friction, dt / 16.67);
                velocity *= frictionFactor;
                
                if (Math.abs(velocity) < 0.05) {
                    momentumFrameId = null;
                    return;
                }
                
                const dx = velocity * dt;
                // Apply sensitivity multiplier to momentum too
                const candleDx = (dx * 1.3) / pxPerCandle();
                
                currentOffset += candleDx;
                const targetOffset = Math.max(0, Math.min(maxOffset, Math.round(currentOffset)));
                
                if (state.offset !== targetOffset) {
                    state.offset = targetOffset;
                    _renderChart(container, containerId, state.history, state.options, state, VIEW_SIZE);
                }
                
                if (targetOffset === 0 || targetOffset === maxOffset) {
                    momentumFrameId = null;
                    return;
                }
                
                momentumFrameId = requestAnimationFrame(step);
            }
            
            momentumFrameId = requestAnimationFrame(step);
        }

        function onPointerUp() {
            isDragging = false;
            container.style.cursor = 'grab';
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            
            window.removeEventListener('mousemove', onPointerMove);
            window.removeEventListener('mouseup',   onPointerUp);
            window.removeEventListener('touchmove',  onTouchMove);
            window.removeEventListener('touchend',   onPointerUp);

            // Apply momentum on release if velocity is high enough
            const minVelocity = 0.15; // px/ms
            if (Math.abs(velocity) > minVelocity) {
                startMomentum();
            }
        }

        // Mouse events on container
        container.addEventListener('mousedown', onPointerDown);

        // Touch events on container
        container.addEventListener('touchstart', onPointerDown, { passive: true });

        // Cursor hint
        container.style.cursor = 'grab';

        // Arrow key support (when container is focused)
        container.tabIndex = 0;
        container.addEventListener('keydown', (e) => {
            const maxOffset = Math.max(0, state.history.length - VIEW_SIZE);
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                if (e.key === 'ArrowLeft') {
                    state.offset = Math.min(maxOffset, state.offset + 5);
                } else {
                    state.offset = Math.max(0, state.offset - 5);
                }
                _renderChart(container, containerId, state.history, state.options, state, VIEW_SIZE);
            }
        });
    }

    function resetPan(containerId) {
        if (_chartState[containerId]) {
            _chartState[containerId].offset = 0;
        }
    }

    return { renderPriceChart, resetPan };
})();