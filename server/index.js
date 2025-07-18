// server/index.js - Yahoo Finance CORS Proxy
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:3000', 'http://127.0.0.1:8080'],
  credentials: true
}));

app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Yahoo Finance proxy routes
app.get('/api/yahoo-finance/*', async (req, res) => {
  try {
    // Extract the Yahoo Finance path from the request
    const yahooPath = req.url.replace('/api/yahoo-finance/', '');
    const yahooUrl = `https://query1.finance.yahoo.com/${yahooPath}`;
    
    console.log(`📊 Proxying to Yahoo Finance: ${yahooUrl}`);
    
    const response = await axios.get(yahooUrl, {
      params: req.query,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000
    });
    
    // Add cache headers
    res.set({
      'Cache-Control': 'public, max-age=60', // Cache for 1 minute
      'Content-Type': 'application/json'
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Yahoo Finance proxy error:', error.message);
    
    if (error.response) {
      // Yahoo Finance returned an error
      res.status(error.response.status).json({
        error: 'Yahoo Finance API error',
        message: error.response.data || error.message,
        status: error.response.status
      });
    } else if (error.code === 'ECONNABORTED') {
      // Timeout
      res.status(408).json({
        error: 'Request timeout',
        message: 'Yahoo Finance API request timed out'
      });
    } else {
      // Other errors
      res.status(500).json({
        error: 'Proxy server error',
        message: error.message
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Yahoo Finance Proxy'
  });
});

// Generic proxy for other APIs (optional)
app.get('/api/proxy/*', async (req, res) => {
  try {
    const targetUrl = req.url.replace('/api/proxy/', '');
    
    if (!targetUrl.startsWith('http')) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    
    const response = await axios.get(targetUrl, {
      params: req.query,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Generic proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `Route ${req.url} not found`
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Yahoo Finance Proxy Server running on http://localhost:${PORT}`);
  console.log(`📊 Yahoo Finance API available at: http://localhost:${PORT}/api/yahoo-finance/`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

module.exports = app;