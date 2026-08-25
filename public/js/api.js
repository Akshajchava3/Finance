const API = {
  async _get(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  searchStocks:       (q)     => API._get(`/api/stocks/search?q=${encodeURIComponent(q)}`),
  getQuote:           (t)     => API._get(`/api/stocks/quote/${t}`),
  getCandles:         (t, r)  => API._get(`/api/stocks/candles/${t}?range=${r}`),
  getMetrics:         (t)     => API._get(`/api/stocks/metrics/${t}`),
  getNews:            (t)     => API._get(`/api/stocks/news/${t}`),
  getSectors:         ()      => API._get('/api/stocks/sectors'),
  getAnalyst:         (t)     => API._get(`/api/stocks/analyst/${t}`),
  getBatch:           (tickers) => API._get(`/api/stocks/batch?tickers=${encodeURIComponent(tickers)}`),
  getIPOs:            ()        => API._get('/api/stocks/ipos'),
  getPennyStocks:     (max)     => API._get(`/api/stocks/penny${max ? '?max=' + max : ''}`),

  getTickerSentiment: (t)     => API._get(`/api/sentiment/ticker/${t}`),
  getPennySentiment:  (t)     => API._get(`/api/sentiment/penny/${t}`),
  getTrending:        ()      => API._get('/api/sentiment/trending'),
};
