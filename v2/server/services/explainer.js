// Generates plain-English explanations of a stock's sentiment, volatility,
// and price position, along with beginner-appropriate next steps.

function generate({ ticker, score, label, breakdown, sources, beta, price, priceChange, high52, low52 }) {
  return {
    summary:      buildSummary(ticker, score, label, breakdown, sources),
    volatility:   buildVolatility(ticker, beta),
    priceContext: buildPriceContext(ticker, price, priceChange, high52, low52),
    nextSteps:    buildNextSteps(score, beta, price, high52, low52, priceChange),
    riskLevel:    classifyRisk(beta, score),
    riskColor:    riskColor(beta, score),
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────

function buildSummary(ticker, score, label, breakdown, sources) {
  const total = breakdown.positive + breakdown.neutral + breakdown.negative || 1;
  const posPct = Math.round(breakdown.positive / total * 100);
  const negPct = Math.round(breakdown.negative / total * 100);

  const scoreDesc = Math.abs(score) > 3 ? 'strongly' : Math.abs(score) > 1.5 ? 'moderately' : 'slightly';

  let lead;
  if (label === 'very positive') {
    lead = `Social media is ${scoreDesc} bullish on $${ticker}. Across Reddit, StockTwits, and recent news, ${posPct}% of posts and articles carry a positive tone.`;
  } else if (label === 'positive') {
    lead = `Overall sentiment for $${ticker} leans positive (${posPct}% positive vs ${negPct}% negative), though the enthusiasm is measured rather than overwhelming.`;
  } else if (label === 'neutral') {
    lead = `$${ticker} is generating mixed signals — investors on Reddit and StockTwits are split, with no strong consensus in either direction right now.`;
  } else if (label === 'negative') {
    lead = `Sentiment around $${ticker} is currently leaning negative (${negPct}% of posts bearish). Investors are expressing caution or concern.`;
  } else {
    lead = `Strong bearish sentiment is surrounding $${ticker}. ${negPct}% of social posts are negative, and there are signs of significant investor concern.`;
  }

  const sourceBreakdown = buildSourceSummary(sources);
  return `${lead} ${sourceBreakdown}`;
}

function buildSourceSummary(sources) {
  const parts = [];
  if (sources?.reddit?.score != null) {
    const r = sources.reddit;
    parts.push(`Reddit (${r.breakdown?.positive || 0} bullish / ${r.breakdown?.negative || 0} bearish posts)`);
  }
  if (sources?.stocktwits?.total > 0) {
    const s = sources.stocktwits;
    parts.push(`StockTwits (${s.bullish} Bullish / ${s.bearish} Bearish flags from traders who self-reported their position)`);
  }
  if (sources?.news?.score != null) {
    const n = sources.news;
    parts.push(`${n.articles?.length || 0} recent news articles`);
  }
  if (!parts.length) return '';
  return `Data pulled from: ${parts.join('; ')}.`;
}

// ── Volatility ────────────────────────────────────────────────────────────────

function buildVolatility(ticker, beta) {
  if (beta == null || isNaN(beta)) {
    return `Volatility data for $${ticker} is not available right now. As a general rule, always check a stock's Beta before investing — it tells you how wild the price swings can be.`;
  }

  const b = parseFloat(beta);

  let riskTier, move, suitability;

  if (b > 2) {
    riskTier = 'extremely high volatility';
    move = `On a day the market moves 1%, $${ticker} could move ${b.toFixed(1)}% — more than double the market.`;
    suitability = 'This level of volatility is generally suited only to experienced traders comfortable with rapid, large price swings.';
  } else if (b > 1.5) {
    riskTier = 'high volatility';
    move = `$${ticker} moves roughly ${b.toFixed(1)}× as much as the S&P 500. A 1% market day could mean a ${b.toFixed(1)}% move for this stock.`;
    suitability = 'This makes it a higher-risk investment — potential for bigger gains, but also sharper drops.';
  } else if (b > 1.1) {
    riskTier = 'above-average volatility';
    move = `$${ticker} is somewhat more volatile than the market average (Beta: ${b.toFixed(2)}).`;
    suitability = 'It carries more risk than a broad index fund, but not dramatically so.';
  } else if (b >= 0.8) {
    riskTier = 'average volatility';
    move = `$${ticker} moves roughly in line with the overall market (Beta: ${b.toFixed(2)}).`;
    suitability = 'This is generally considered a moderate-risk stock — neither unusually calm nor unusually wild.';
  } else if (b >= 0.3) {
    riskTier = 'low volatility';
    move = `$${ticker} tends to be calmer than the broader market (Beta: ${b.toFixed(2)}).`;
    suitability = 'Lower-beta stocks typically see smaller swings, which can be attractive for conservative investors.';
  } else {
    riskTier = 'very low volatility';
    move = `$${ticker} has a very low Beta (${b.toFixed(2)}), meaning its price moves very little relative to the market.`;
    suitability = 'This often describes utility stocks, REITs, or very stable blue-chip companies.';
  }

  return `$${ticker} has ${riskTier} (Beta: ${b.toFixed(2)}). ${move} ${suitability}`;
}

// ── Price context ─────────────────────────────────────────────────────────────

function buildPriceContext(ticker, price, priceChange, high52, low52) {
  if (!price || !high52 || !low52) {
    return `Price history data for $${ticker} is unavailable. Check price charts to assess recent momentum before making any decision.`;
  }

  const range = high52 - low52;
  const fromHigh = ((high52 - price) / high52 * 100).toFixed(1);
  const fromLow  = ((price - low52)  / low52  * 100).toFixed(1);
  const inRange  = range > 0 ? ((price - low52) / range * 100).toFixed(0) : 50;

  let position;
  if (fromHigh < 3) {
    position = `At $${price.toFixed(2)}, $${ticker} is trading very close to its 52-week high of $${high52.toFixed(2)} (within ${fromHigh}%). This suggests strong momentum but may also mean the stock is near a resistance level — prices sometimes pull back from annual highs.`;
  } else if (fromHigh < 15) {
    position = `$${ticker} is trading at $${price.toFixed(2)}, which is ${fromHigh}% below its 52-week high of $${high52.toFixed(2)}. The stock has pulled back somewhat from its peak but remains in the upper half of its yearly range.`;
  } else if (parseFloat(inRange) > 50) {
    position = `At $${price.toFixed(2)}, $${ticker} is in the upper half of its 52-week range ($${low52.toFixed(2)} – $${high52.toFixed(2)}). It's ${fromHigh}% below its annual high.`;
  } else if (fromLow < 10) {
    position = `$${ticker} is trading near its 52-week low of $${low52.toFixed(2)}, currently at $${price.toFixed(2)} — just ${fromLow}% above the floor. This could signal either a buying opportunity (if the fundamentals are sound) or continued downward pressure.`;
  } else {
    position = `$${ticker} is in the lower half of its 52-week range ($${low52.toFixed(2)} – $${high52.toFixed(2)}), currently at $${price.toFixed(2)}. It's ${fromHigh}% below its annual high.`;
  }

  const todayMove = priceChange != null
    ? ` Today, the stock is ${priceChange >= 0 ? 'up' : 'down'} ${Math.abs(priceChange).toFixed(2)}%.`
    : '';

  return `${position}${todayMove}`;
}

// ── Next steps ────────────────────────────────────────────────────────────────

function buildNextSteps(score, beta, price, high52, low52, priceChange) {
  const steps = [];
  const b = parseFloat(beta) || 1;
  const fromHigh = high52 ? ((high52 - price) / high52 * 100) : null;
  const fromLow  = low52  ? ((price - low52)  / low52  * 100) : null;

  // Sentiment-based step
  if (score > 2) {
    steps.push({
      icon: '📈',
      title: 'High positive sentiment — but stay cautious',
      body: 'Strong social sentiment can be a leading indicator, but also a contrarian warning sign when "everyone is bullish." Consider the fundamentals alongside the hype.',
    });
  } else if (score > 0.5) {
    steps.push({
      icon: '🔍',
      title: 'Moderate bullish signal — do your research',
      body: 'Positive sentiment is present but not overwhelming. A good moment to dig into earnings reports, analyst ratings, and upcoming news catalysts before deciding.',
    });
  } else if (score < -2) {
    steps.push({
      icon: '⚠️',
      title: 'Strong negative sentiment — understand why',
      body: 'Heavy bearish sentiment warrants caution. Read recent news to understand if there\'s a specific event driving it (bad earnings, scandal, regulatory issue) or if it\'s general market fear.',
    });
  } else if (score < -0.5) {
    steps.push({
      icon: '😐',
      title: 'Negative lean — wait for clarity',
      body: 'Sentiment is leaning bearish. This doesn\'t necessarily mean the stock will fall, but it\'s worth waiting for a clearer signal or a catalyst before entering.',
    });
  } else {
    steps.push({
      icon: '⚖️',
      title: 'Neutral sentiment — watch for a catalyst',
      body: 'No strong sentiment in either direction. This can be an opportunity to watch the stock closely for a news event or earnings report that could move it decisively.',
    });
  }

  // Volatility-based step
  if (b > 1.5) {
    steps.push({
      icon: '🎢',
      title: 'High volatility — size positions carefully',
      body: `With a Beta of ${b.toFixed(1)}, price swings can be dramatic. If you decide to invest, consider using a smaller position size than you might with a more stable stock. Never invest money you can\'t afford to lose.`,
    });
  } else if (b < 0.8) {
    steps.push({
      icon: '🛡️',
      title: 'Low volatility — good for steady exposure',
      body: 'This stock tends to move calmly relative to the market. It can be a lower-stress way to add sector exposure, though lower volatility often means lower potential upside too.',
    });
  }

  // Price position step
  if (fromHigh != null && fromHigh < 5) {
    steps.push({
      icon: '🏔️',
      title: 'Near 52-week high — watch for resistance',
      body: 'Stocks near annual highs sometimes face "resistance" — sellers who bought at the top taking profits. Monitor volume closely; a breakout above the high on strong volume is a bullish signal.',
    });
  } else if (fromLow != null && fromLow < 10) {
    steps.push({
      icon: '🎯',
      title: 'Near 52-week low — potential value or falling knife',
      body: 'Stocks near yearly lows can be bargains — or they can keep falling. Look for signs of stabilization (price holding steady for several days, increasing volume) before considering entry.',
    });
  }

  // Beginner universal step
  steps.push({
    icon: '📚',
    title: 'For beginners — start with a small position',
    body: 'If you\'re new to investing, consider starting with a small amount (what you\'re truly comfortable losing) to get experience with how the stock moves before committing more. Paper trading (simulating trades without real money) is also a great learning tool.',
  });

  return steps;
}

// ── Risk classification ───────────────────────────────────────────────────────

function classifyRisk(beta, score) {
  const b = parseFloat(beta) || 1;
  const s = parseFloat(score) || 0;

  if (b > 2 || (b > 1.5 && s < -1))  return 'Very High Risk';
  if (b > 1.5 || (b > 1.2 && s < 0)) return 'High Risk';
  if (b > 1.1)                         return 'Moderate-High Risk';
  if (b > 0.8)                         return 'Moderate Risk';
  if (b > 0.5)                         return 'Low-Moderate Risk';
  return 'Low Risk';
}

function riskColor(beta, score) {
  const b = parseFloat(beta) || 1;
  if (b > 2 || (b > 1.5 && score < -1)) return 'red';
  if (b > 1.4) return 'orange';
  if (b > 1.1) return 'yellow';
  return 'green';
}

module.exports = { generate };
