const path = require('path');
// Load .env from v2 folder first, fall back to repo-root .env (shared with v1)
require('dotenv').config({
  path: require('fs').existsSync(path.join(__dirname, '../.env'))
    ? path.join(__dirname, '../.env')
    : path.join(__dirname, '../../.env'),
});

const express = require('express');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/stocks',    require('./routes/stocks'));
app.use('/api/sentiment', require('./routes/sentiment'));

app.get('/api/status', (req, res) => {
  res.json({ finnhub: !!process.env.FINNHUB_API_KEY, reddit: true });
});

const PORT = process.env.PORT2 || 3001;
app.listen(PORT, () => console.log(`🫘 BeanStock V2 running at http://localhost:${PORT}`));
