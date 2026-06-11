require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const stocksRouter = require('./routes/stocks');
const sentimentRouter = require('./routes/sentiment');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.FINNHUB_API_KEY) {
  console.warn('[warn] FINNHUB_API_KEY not set — stock data will fail. Copy .env.example to .env');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/stocks', stocksRouter);
app.use('/api/sentiment', sentimentRouter);

app.get('/api/status', (req, res) => {
  res.json({
    finnhub: !!process.env.FINNHUB_API_KEY,
    reddit: true, // public JSON API — no credentials needed
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🫘 BeanStock running at http://localhost:${PORT}\n`);
});
