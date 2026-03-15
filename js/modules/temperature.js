/* ================================================
   temperature.js — Temperature System Module
   Generates stock card HTML + thermometer components
   ================================================ */

YC.temperature = (() => {

  /* ── Build temperature-enriched stock info ───────── */
  function enrich(stockMeta, marketData) {
    if (!stockMeta) return {};
    const symbol = stockMeta.symbol || '--';
    const mkt = marketData || YC.state.getMarketData(symbol) || {};

    // Prefer the most descriptive name
    const name = mkt.longName || mkt.name || stockMeta.name || symbol;
    const shortName = stockMeta.shortName || mkt.shortName || symbol;
    const type = stockMeta.type || mkt.type || 'tw';

    let tempScore = 50;
    let hasData = false;
    if (mkt.price != null) {
      hasData = true;
      tempScore = YC.indicators.temperatureScore({
        price: mkt.price,
        high52w: mkt.high52w,
        low52w: mkt.low52w,
        ma200: mkt.ma200,
        ma50: mkt.ma50,
        history: mkt.history,
        volume: mkt.volume,
        avgVolume: mkt.avgVolume,
        changePct: mkt.changePct
      });
    }

    const clsObj = YC.indicators.classify(tempScore);
    const initials = YC.indicators.getInitials(name, symbol.replace('.TW', ''));
    const changePct = mkt.changePct || mkt.regularMarketChangePercent || 0;
    const price = mkt.price || mkt.regularMarketPrice;
    const currency = mkt.currency || (type.includes('tw') ? 'TWD' : 'USD');

    const FALLBACK_INDUSTRIES = {
      '2330': '半導體', '2317': '電子代工/伺服器', '2454': 'IC設計', '2303': '半導體',
      '2382': 'AI伺服器', '3231': 'AI伺服器', '6669': 'AI伺服器', '3034': 'IC設計',
      '2881': '金融保險', '2882': '金融保險', '2603': '航運物流', '2308': '電子零組件',
      '0050': '市值型ETF', '0056': '高股息ETF', '00878': '高股息ETF', '00919': '高股息ETF',
      '00929': '科技高息ETF', '00713': '高息低波ETF', '00924': '美股高息ETF',
      'AAPL': '消費電子/美股', 'MSFT': '雲端服務/美股', 'GOOGL': '網路搜尋/美股',
      'AMZN': '電子商務/美股', 'META': '社交媒體/美股', 'TSLA': '電動車/美股',
      'NVDA': '半導體/AI', 'AVGO': '半導體', 'AMD': '半導體', 'TSM': '半導體',
      'VOO': '市值型ETF', 'VTI': '市值型ETF', 'QQQ': '科技型ETF'
    };

    let industry = stockMeta.industry || mkt.industry || mkt.sector || '';
    if (!industry || industry === '未分類') {
      const base = symbol.split('.')[0];
      industry = FALLBACK_INDUSTRIES[symbol] || FALLBACK_INDUSTRIES[base];
    }
    
    // Final defensive check
    if (!industry && (symbol.endsWith('.TW') || /^\d{4,6}/.test(symbol))) {
       if (symbol.startsWith('00')) industry = '台股ETF';
       else industry = '台股標的';
    }
    if (!industry || industry === 'undefined') industry = '未分類';

    return {
      symbol,
      name,
      shortName,
      type,
      industry,
      price,
      currency,
      changePct,
      change: mkt.change || mkt.regularMarketChange || 0,
      tempScore,
      hasData,
      initials: initials || '--',
      ...clsObj,
    };
  }

  /* ── Render a Stock Card ──────────────────────────
     Returns HTML string for a stock-card div
  */
  function renderCard(enriched) {
    const { name, symbol, type, price, currency, changePct, tempScore, cls, label, initials, hasData } = enriched;
    const priceStr = hasData && price ? formatPrice(price, currency) : '--';
    const changeSign = changePct >= 0 ? '+' : '';
    const changeStr = hasData ? `${changeSign}${changePct.toFixed(2)}%` : '--';
    const changeCls = changePct >= 0 ? 'pos' : 'neg';
    const barWidth = Math.max(2, tempScore);
    const currencySymbol = currency === 'TWD' ? 'NT$' : currency === 'USD' ? '$' : '';
    const typeTag = buildTypeTag(type);

    return `
    <div class="stock-card ${cls}" data-symbol="${symbol}" onclick="YC.stocks && YC.stocks.openDetail('${symbol}')">
      <div class="stock-avatar av${cls.replace('tc', '')}">${initials}</div>
      <div class="stock-info">
        <div class="stock-name">${name}</div>
        <div class="stock-symbol">${symbol.replace('.TW', '')} ${typeTag}</div>
      </div>
      <div class="stock-right">
        <div class="stock-price-wrap">
          <div class="stock-price">${currencySymbol}${priceStr}</div>
          <div class="stock-change ${changeCls}">${changeStr}</div>
        </div>
        <div class="stock-temp-wrap">
          ${hasData ? `
            <div class="temp-score ${cls}">${tempScore}</div>
            <div class="temp-badge ${cls}">${label}</div>
            <div class="temp-bar"><div class="temp-bar-fill ${cls}" style="width:${barWidth}%"></div></div>
          ` : `<div class="text-muted" style="font-size:20px">--</div>`}
        </div>
      </div>
    </div>`;
  }

  /* ── Render Thermometer SVG gauge (mini) ──────── */
  function renderMiniGauge(score, size = 48) {
    const cls = YC.indicators.classify(score);
    const colorMap = { tc0: '#00d4aa', tc1: '#f5c842', tc2: '#ff8c42', tc3: '#ff3560' };
    const color = colorMap[cls.cls] || '#f5c842';
    const pct = score / 100;
    const r = 20, cx = 24, cy = 24;
    const circumference = 2 * Math.PI * r;
    const dash = circumference * pct;
    const gap = circumference - dash;
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 48 48" style="transform:rotate(-90deg)">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="5"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${dash} ${gap}" stroke-linecap="round"
        style="transition:stroke-dasharray 1s ease"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
        fill="${color}" font-size="12" font-weight="800" font-family="Inter,sans-serif"
        style="transform:rotate(90deg);transform-origin:${cx}px ${cy}px">${score}</text>
    </svg>`;
  }

  function buildTypeTag(type) {
    const tags = { tw: '🇹🇼', us: '🇺🇸', twetf: '🇹🇼 ETF', usetf: '🇺🇸 ETF' };
    return `<span style="font-size:10px">${tags[type] || ''}</span>`;
  }

  function formatPrice(price, currency) {
    if (currency === 'TWD' || price > 50) return price.toFixed(2);
    return price < 1 ? price.toFixed(4) : price.toFixed(2);
  }

  return { enrich, renderCard, renderMiniGauge };
})();