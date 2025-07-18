const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/yahoo-finance/*', async (req, res) => {
  try {
    const yahooUrl = req.url.replace('/api/yahoo-finance/', 'https://query1.finance.yahoo.com/');
    const response = await axios.get(yahooUrl, {
      params: req.query,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => console.log('Proxy server running on port 3001'));