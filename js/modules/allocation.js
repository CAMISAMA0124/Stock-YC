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
            
            const currentPct = totalAssets > 0 ? (currentVal / totalAssets) * 100 : 0;
            const deviationPct = currentPct - pct;
            
            // Only suggest action if diff is somewhat meaningful (e.g. > 1000 NTD) or deviation is >= 1%
            if (Math.abs(diff) > 1000 || Math.abs(deviationPct) >= 1) {
                const action = diff > 0 ? '買入' : '賣出';
                steps.push({
                    symbol: h.symbol,
                    name: h.name,
                    action,
                    diffAmount: Math.abs(diff),
                    targetPct: pct,
                    currentPct,
                    deviationPct,
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
                history: mkt.history,
                changePct: mkt.changePct
            });

            let mv = mkt.price * (h.shares || 0);
            // Convert to base currency (TWD) for weighting accuracy
            if (mkt.currency === 'USD' || (h.type && h.type.includes('us'))) {
                mv *= rate;
            }

            weightedTemp += temp * mv;
            totalWeight += mv;
        }
        const avgScore = totalWeight > 0 ? (weightedTemp / totalWeight) : 50;
        return {
            score: Math.round(avgScore),
            totalWeight
        };
    }

    /* ── Calculate Watchlist Heat (Simple Avg) ──────── */
    function calculateWatchlistScore() {
        const state = YC.state.get();
        let totalScore = 0;
        let count = 0;

        for (const w of state.watchlist) {
            const mkt = YC.state.getMarketData(w.symbol);
            if (!mkt || !mkt.price) continue;

            const temp = YC.indicators.temperatureScore({
                price: mkt.price,
                high52w: mkt.high52w,
                low52w: mkt.low52w,
                ma200: mkt.ma200,
                ma50: mkt.ma50,
                history: mkt.history,
                changePct: mkt.changePct
            });

            totalScore += temp;
            count++;
        }
        return count > 0 ? Math.round(totalScore / count) : 50;
    }

    /* ── Financial Expert Expected Return Model ──────────────────
       Multi-factor: (Hist CAGR * 0.4) + (Market Index * 0.6)
       Dividend yield added on top. Caps at 20% to avoid overoptimism.
    */
    function computeExpertExpectedReturn(holdings, cashAssets) {
        const rate_tw_index = 0.065; // TAIEX 10-year avg
        const rate_us_index = 0.095; // S&P 500 10-year avg
        const rate_cash = 0.015;     // Savings rate

        let totalWeight = cashAssets || 0;
        let weightedReturnSum = (cashAssets || 0) * rate_cash;

        for (const h of holdings) {
            const mv = h.marketValue || 0;
            if (mv <= 0) continue;

            const mkt = YC.state.getMarketData(h.symbol) || {};
            const isTW = h.symbol.endsWith('.TW');
            const indexBaseline = isTW ? rate_tw_index : rate_us_index;

            // 1. Calculate Historical CAGR (up to 3-5 years if history available)
            let histReturn = indexBaseline;
            if (mkt.history && mkt.history.length > 20) {
                const sorted = [...mkt.history].sort((a,b) => a.t - b.t);
                const newest = sorted[sorted.length - 1];
                const oldest = sorted[0];
                const years = (newest.t - oldest.t) / (1000 * 60 * 60 * 24 * 365);
                
                if (years >= 0.5) {
                    const rawCAGR = Math.pow(newest.c / oldest.c, 1 / years) - 1;
                    // Blend 40% History / 60% Index (Conservative Rule)
                    histReturn = (rawCAGR * 0.4) + (indexBaseline * 0.6);
                }
            }

            // 2. Add Dividend Yield
            let divYield = (mkt.divYield || 0);
            if (divYield > 0.4) divYield /= 100;
            
            // 3. Expert Total Return = HistReturn + Dividend
            let symbolTotalReturn = histReturn + divYield;

            // 4. Safety cap 1%~20%
            symbolTotalReturn = Math.min(0.20, Math.max(0.01, symbolTotalReturn));

            weightedReturnSum += mv * symbolTotalReturn;
            totalWeight += mv;
        }

        return totalWeight > 0 ? (weightedReturnSum / totalWeight) : 0.07;
    }

    /* ── Detect Investment Style from holdings ───────────────────
       Analyzes industry / symbol patterns of the portfolio to classify
       the user's primary investment direction, then returns three
       scenario rates (conservative / neutral / optimistic) that
       reflect the realistic upside & downside for that style —
       similar to how the chart uses 8% (bear) vs 15% (neutral) for
       a heavy-tech / FANG+ strategy.

       Styles:
         'tech'     — High-growth tech (NVDA, TSLA, FANG+, 半導體...)
         'dividend' — High-dividend / defensive (高股息ETF, 金融, REITs...)
         'balanced' — Mix of tech + dividend / broad index
         'index'    — Mostly broad index ETFs (VOO, 0050...)
    */
    function detectInvestmentStyle(holdings) {
        if (!holdings || holdings.length === 0) {
            return { style: 'balanced', label: '均衡配置', emoji: '⚖️', conservative: 0.06, neutral: 0.09, optimistic: 0.13 };
        }

        // Score buckets (accumulate by market value weight)
        let techMV = 0, divMV = 0, indexMV = 0, totalMV = 0;

        const TECH_INDUSTRIES = ['科技巨頭','半導體','IC設計','AI/伺服器','軟體/雲端','產業特色ETF'];
        const DIV_INDUSTRIES  = ['金融保險','金融服務','台股ETF','消費零售','能源/工業','傳產/零售','醫療保健'];
        const INDEX_SYMBOLS   = ['SPY','VOO','VTI','IVV','QQQ','0050.TW','006208.TW'];
        const TECH_KEYWORDS   = ['NVDA','TSLA','META','AAPL','MSFT','GOOGL','AMZN','NFLX','AMD','AVGO',
                                  '2330','2454','2317','2382','00757','00881','SOXX','ARKK','QQQ'];

        for (const h of holdings) {
            const mv = h.marketValue || 0;
            if (mv <= 0) continue;
            totalMV += mv;

            const sym = h.symbol || '';
            const ind = h.industry || '';

            if (INDEX_SYMBOLS.some(s => sym.includes(s))) {
                indexMV += mv;
            } else if (TECH_KEYWORDS.some(k => sym.includes(k)) || TECH_INDUSTRIES.includes(ind)) {
                techMV += mv;
            } else if (DIV_INDUSTRIES.includes(ind)) {
                divMV += mv;
            } else {
                // Unknown → split evenly
                techMV += mv * 0.4;
                divMV  += mv * 0.4;
                indexMV += mv * 0.2;
            }
        }

        if (totalMV === 0) {
            return { style: 'balanced', label: '均衡配置', emoji: '⚖️', conservative: 0.06, neutral: 0.09, optimistic: 0.13 };
        }

        const techPct  = techMV  / totalMV;
        const divPct   = divMV   / totalMV;
        const indexPct = indexMV / totalMV;

        // Classify
        if (indexPct >= 0.6) {
            return { style: 'index', label: '指數被動型', emoji: '📊',
                conservative: 0.06, neutral: 0.09, optimistic: 0.12 };
        }
        if (techPct >= 0.55) {
            return { style: 'tech', label: '科技成長型', emoji: '🚀',
                conservative: 0.08, neutral: 0.15, optimistic: 0.22 };
        }
        if (divPct >= 0.55) {
            return { style: 'dividend', label: '高息防禦型', emoji: '💰',
                conservative: 0.05, neutral: 0.08, optimistic: 0.11 };
        }
        // Default: balanced
        return { style: 'balanced', label: '均衡成長型', emoji: '⚖️',
            conservative: 0.07, neutral: 0.11, optimistic: 0.16 };
    }

    /* ── NPER solver with regular cash flow (PMT) ────────────────
       Uses iterative approximation of the standard NPER financial formula:
       FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r
       Solve for n given PV, PMT, FV, r.
       Returns years as float; returns Infinity if unreachable.
    */
    function solveNPER(pv, pmt, fv, rate) {
        if (rate <= 0) return Infinity;
        // If monthly investing alone can't grow (fv <= pv), still check
        // Use binary search on n
        if (pv >= fv) return 0;
        let lo = 0, hi = 200;
        for (let i = 0; i < 100; i++) {
            const mid = (lo + hi) / 2;
            const growth = Math.pow(1 + rate, mid);
            const fvCalc = pv * growth + pmt * (growth - 1) / rate;
            if (fvCalc < fv) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    }

    return {
        compute, renderStackBar, formatNTD,
        computePortfolioDividends, calculateRebalanceSteps,
        computeAverageExpenseRatio, calculatePortfolioScore,
        calculateWatchlistScore, computeExpertExpectedReturn,
        detectInvestmentStyle, solveNPER
    };
})();