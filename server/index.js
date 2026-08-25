const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

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
app.listen(PORT, () => console.log(`🫘 BeanStock running at http://localhost:${PORT}`));
