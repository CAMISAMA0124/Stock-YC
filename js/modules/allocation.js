/* ================================================
   allocation.js — Cash Allocation Recommendation
   Computes suggested equity/cash split + adjustment
   ================================================ */

YC.allocation = (() => {

    /* ── Main compute function ──────────────────────────
       sentimentScore: 0-100 (higher = market hotter)
       settings: from YC.state.get().settings
       currentEquity: current market value of holdings
    */
    function compute(sentimentScore, settings, currentEquity) {
        const { totalAssets, maxCashPct = 50, minCashPct = 5, adjustCoeff = 0.8 } = settings || {};
        if (!totalAssets || totalAssets <= 0 || isNaN(totalAssets)) {
            return { ready: false, reason: '請在設定中輸入總資產金額' };
        }

        const maxEquityPct = 100 - minCashPct;
        const minEquityPct = 100 - maxCashPct;

        // Kelly-inspired formula (Faber 2007 / Antonacci 2012)
        // suggestedEquity% = maxEquity% * (1 - heatRatio * coeff)
        const score = isNaN(sentimentScore) ? 50 : sentimentScore;
        const heatRatio = score / 100;
        const suggestedEquityPct = Math.max(
            minEquityPct,
            Math.min(maxEquityPct, maxEquityPct * (1 - heatRatio * adjustCoeff))
        );
        const suggestedCashPct = 100 - suggestedEquityPct;

        const suggestedEquity = totalAssets * (suggestedEquityPct / 100);
        const suggestedCash = totalAssets - suggestedEquity;

        const currentEquityValue = isNaN(currentEquity) ? 0 : currentEquity;
        const currentEquityPct = totalAssets > 0 ? (currentEquityValue / totalAssets) * 100 : 0;
        const currentCash = totalAssets - currentEquity;

        // Adjustment: positive = need to sell (over-invested), negative = can buy more
        const adjustmentAmt = currentEquity - suggestedEquity;
        const direction = adjustmentAmt > 5000 ? 'reduce'
            : adjustmentAmt < -5000 ? 'add'
                : 'hold';

        // Heat level for display
        const heatLabel = sentimentScore <= 30 ? '極冷' :
            sentimentScore <= 55 ? '適中' :
                sentimentScore <= 75 ? '偏熱' : '極熱';

        return {
            ready: true,
            sentimentScore,
            suggestedEquityPct: Math.round(suggestedEquityPct),
            suggestedCashPct: Math.round(suggestedCashPct),
            suggestedEquity,
            suggestedCash,
            currentEquity,
            currentEquityPct: Math.round(currentEquityPct),
            currentCash,
            adjustmentAmt,
            direction,
            totalAssets,
            heatLabel,
        };
    }

    /* ── Render raw progress bar for equity/cash visual ── */
    function renderStackBar(equityPct, cashPct) {
        return `
    <div style="width:100%;height:10px;background:var(--border);border-radius:var(--r-full);overflow:hidden;display:flex">
      <div style="width:${equityPct}%;background:var(--accent);transition:width 0.8s ease;border-radius:var(--r-full) 0 0 var(--r-full)"></div>
      <div style="width:${cashPct}%;background:var(--t0);opacity:0.6;border-radius:0 var(--r-full) var(--r-full) 0"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--text-2)">
      <span style="color:var(--accent)">持股 ${equityPct}%</span>
      <span style="color:var(--t0)">現金 ${cashPct}%</span>
    </div>`;
    }

    function formatNTD(amount) {
        if (amount == null || isNaN(amount)) return '--';
        const abs = Math.abs(amount);
        const prefix = amount < 0 ? '-' : '';
        return prefix + Math.round(abs).toLocaleString('zh-TW');
    }

    /* ── Compute Portfolio Dividends ──────────────── */
    function computePortfolioDividends(holdings) {
        let totalDividends = 0;
        let totalMarketValue = 0;

        const yieldFallbacks = {
            '0050.TW': 0.035, '0056.TW': 0.075, '00878.TW': 0.062, '00919.TW': 0.10,
            '00929.TW': 0.08, '00713.TW': 0.065, '00924.TW': 0.06, '00881.TW': 0.04,
            '2330.TW': 0.02, '2317.TW': 0.05, '1101.TW': 0.04, '2881.TW': 0.045
        };

        for (const h of holdings) {
            const mv = h.marketValue || 0;
            if (mv <= 0) continue;
            
            const mkt = YC.state.getMarketData(h.symbol) || {};
            
            // Normalize: Yahoo API sometimes returns 0.045 (ratio) and sometimes 4.5 (%)
            // If it's > 0.4 (40%), it's almost certainly a percentage that needs dividing by 100
            let yieldVal = mkt.divYield || 0;
            if (yieldVal > 0.4) {
                yieldVal = yieldVal / 100;
            }

            if (yieldVal === 0 && yieldFallbacks[h.symbol]) {
                yieldVal = yieldFallbacks[h.symbol];
            }
            
            totalDividends += (mv * yieldVal);
            totalMarketValue += mv;
        }

        const avgYield = totalMarketValue > 0 ? (totalDividends / totalMarketValue) : 0;
        
        return {
            totalDividends,
            avgYield: avgYield * 100 // Convert to percentage
        };
    }

    /* ── Calculate Rebalance Steps ────────────────── */
    function calculateRebalanceSteps(totalAssets, holdings) {
        const steps = [];
        let totalTargetPct = 0;

        for (const h of holdings) {
            const pct = h.targetWeight || 0;
            if (pct <= 0) continue;
            
            totalTargetPct += pct;
            
            const mkt = YC.state.getMarketData(h.symbol);
            const price = mkt ? (mkt.price || h.costPrice || 0) : (h.costPrice || 0);
            const shares = h.shares || 0;
            const currentVal = price * shares;
            
            const targetVal = totalAssets * (pct / 100);
            const diff = targetVal - currentVal;
            
            // Only suggest action if diff is somewhat meaningful (e.g. > 1000 NTD)
            if (Math.abs(diff) > 1000) {
                const action = diff > 0 ? '買入' : '賣出';
                steps.push({
                    symbol: h.symbol,
                    name: h.name,
                    action,
                    diffAmount: Math.abs(diff),
                    targetPct: pct,
                    currentVal,
                    targetVal
                });
            }
        }
        
        // Sort by absolute diffAmount descending (prioritize largest changes)
        steps.sort((a, b) => b.diffAmount - a.diffAmount);
        
        return {
            steps,
            totalTargetPct,
            cashRemainingPct: Math.max(0, 100 - totalTargetPct)
        };
    }

    /* ── Calculate Average Expense Ratio ──────────── */
    function computeAverageExpenseRatio(holdings) {
        let totalExpense = 0;
        let totalEquity = 0;
        
        for (const h of holdings) {
            const mv = h.marketValue || 0;
            if (mv <= 0) continue;

            totalEquity += mv;
            
            let ratio = 0;
            const symbol = h.symbol || '';
            if (YC.state.EXPENSE_RATIOS && YC.state.EXPENSE_RATIOS[symbol]) {
                ratio = YC.state.EXPENSE_RATIOS[symbol];
            } else if (h.type === 'usetf' || symbol.includes('.US') || /^[A-Z]{1,5}$/.test(symbol)) {
                ratio = 0.15; // default avg for us etf
            } else if (h.type === 'twetf' || symbol.endsWith('.TW')) {
                // If it's 00xxx.TW it's likely an ETF
                if (/^00\d{3,5}/.test(symbol)) {
                    ratio = 0.45; // default avg for tw etf
                }
            }
            // individual stocks assume 0 expense ratio
            
            totalExpense += mv * (ratio / 100);
        }
        
        return totalEquity > 0 ? (totalExpense / totalEquity) * 100 : 0;
    }

    /* ── Calculate Portfolio Quality Score (Health) ── */
    function calculatePortfolioScore(holdings) {
        let weightedTemp = 0;
        let totalWeight = 0;
        const rate = YC.state.get().exchangeRate || 31.5;

        for (const h of holdings) {
            const mkt = YC.state.getMarketData(h.symbol);
            if (!mkt || !mkt.price) continue;

            const temp = YC.indicators.temperatureScore({ 
                price: mkt.price, 
                high52w: mkt.high52w, 
                low52w: mkt.low52w, 
                ma200: mkt.ma200, 
                ma50: mkt.ma50, 
                history: mkt.history 
            });

            let mv = mkt.price * (h.shares || 0);
            // Convert to base currency (TWD) for weighting accuracy
            if (mkt.currency === 'USD' || (h.type && h.type.includes('us'))) {
                mv *= rate;
            }

            weightedTemp += temp * mv;
            totalWeight += mv;
        }

        const avgScore = totalWeight > 0 ? Math.round(weightedTemp / totalWeight) : 50;
        return {
            score: avgScore,
            totalWeight
        };
    }

    return { compute, renderStackBar, formatNTD, computePortfolioDividends, calculateRebalanceSteps, computeAverageExpenseRatio, calculatePortfolioScore };
})();