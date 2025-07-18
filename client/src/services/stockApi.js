// src/services/stockApi.js - Enhanced stock API with intelligent rate limiting
import axios from 'axios'
import { finnhubLimiter } from './finnhubRateLimiter'

class StockApiService {
  constructor() {
    // API Configuration
    this.finnhubKey = (typeof process !== 'undefined' && process.env?.VUE_APP_FINNHUB_KEY) || ''
    this.finnhubUrl = 'https://finnhub.io/api/v1'
    
    // Fallback APIs
    this.alphaVantageKey = (typeof process !== 'undefined' && process.env?.VUE_APP_ALPHA_VANTAGE_KEY) || 'demo'
    this.alphaVantageUrl = 'https://www.alphavantage.co/query'
    this.yahooFinanceUrl = 'https://query1.finance.yahoo.com/v8/finance/chart'
    
    // Cache configuration
    this.cache = new Map()
    this.cacheTimeout = 30000 // 30 seconds for real-time feel
    
    // Performance tracking
    this.stats = {
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      averageResponseTime: 0
    }
    
    console.log(`📊 Stock API initialized with Finnhub key: ${this.finnhubKey ? '✅' : '❌'}`)
  }

  // Main method - intelligently routed based on rate limits
  async getCurrentPrice(symbol, priority = 'normal') {
    const startTime = Date.now()
    
    try {
      // Check cache first
      const cached = this.getCachedPrice(symbol)
      if (cached) {
        this.stats.cacheHits++
        return cached
      }

      let price = null

      // Use Finnhub if available and within rate limits
      if (this.finnhubKey && finnhubLimiter.canMakeCall()) {
        price = await this.getFinnhubPriceWithLimiter(symbol, priority)
      } else if (this.finnhubKey) {
        // Finnhub available but rate limited - queue the call
        console.log(`⏳ Queueing ${symbol} for Finnhub (rate limited)`)
        price = await this.getFinnhubPriceWithLimiter(symbol, priority)
      } else {
        // Fallback to free APIs
        price = await this.getFallbackPrice(symbol)
      }

      if (price) {
        this.setCachedPrice(symbol, price)
        this.updateStats(startTime, true)
        return price
      }

      throw new Error('No price data available from any source')
    } catch (error) {
      this.updateStats(startTime, false)
      console.warn(`Failed to fetch price for ${symbol}:`, error.message)
      
      // Return cached data if available, even if expired
      const staleCache = this.cache.get(symbol.toUpperCase())
      if (staleCache) {
        console.log(`📦 Using stale cache for ${symbol}`)
        return { ...staleCache.data, stale: true }
      }
      
      // Final fallback to mock data
      return this.getMockPrice(symbol)
    }
  }

  // Finnhub with intelligent rate limiting
  async getFinnhubPriceWithLimiter(symbol, priority = 'normal') {
    const callFunction = () => this.getFinnhubPriceDirect(symbol)
    
    if (priority === 'high') {
      return await finnhubLimiter.priorityUpdate(symbol, callFunction)
    } else {
      return await finnhubLimiter.regularUpdate(symbol, callFunction)
    }
  }

  // Direct Finnhub API call (used by rate limiter)
  async getFinnhubPriceDirect(symbol) {
    try {
      const response = await axios.get(`${this.finnhubUrl}/quote`, {
        params: {
          symbol: symbol.toUpperCase(),
          token: this.finnhubKey
        },
        timeout: 8000
      })
      
      const data = response.data
      if (data.c && data.c > 0) {
        return {
          symbol: symbol.toUpperCase(),
          price: parseFloat(data.c.toFixed(2)),
          change: parseFloat((data.d || 0).toFixed(2)),
          changePercent: parseFloat((data.dp || 0).toFixed(2)),
          timestamp: new Date().toISOString(),
          source: 'Finnhub',
          high: parseFloat((data.h || 0).toFixed(2)),
          low: parseFloat((data.l || 0).toFixed(2)),
          open: parseFloat((data.o || 0).toFixed(2)),
          previousClose: parseFloat((data.pc || 0).toFixed(2))
        }
      }
      throw new Error('Invalid Finnhub response - no price data')
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded')
      }
      throw new Error(`Finnhub API error: ${error.message}`)
    }
  }

  // Batch update multiple symbols efficiently
  async getMultiplePrices(symbols, priority = 'normal') {
    console.log(`📈 Batch updating ${symbols.length} symbols with priority: ${priority}`)
    
    if (this.finnhubKey) {
      // Use Finnhub with rate limiting
      const results = await finnhubLimiter.batchUpdate(symbols, (symbol) => 
        this.getFinnhubPriceDirect(symbol)
      )
      
      return this.processBatchResults(symbols, results)
    } else {
      // Fallback to sequential updates with other APIs
      return this.getMultiplePricesSequential(symbols)
    }
  }

  // Process batch results from rate limiter
  processBatchResults(symbols, results) {
    const processedResults = {}
    
    results.forEach((result, index) => {
      const symbol = symbols[index]
      
      if (result.status === 'fulfilled') {
        processedResults[symbol] = result.value
      } else {
        console.warn(`❌ Failed to update ${symbol}:`, result.reason?.message)
        processedResults[symbol] = {
          symbol,
          error: result.reason?.message || 'Unknown error',
          price: this.getMockPrice(symbol).price
        }
      }
    })
    
    return processedResults
  }

  // Sequential updates for fallback APIs
  async getMultiplePricesSequential(symbols) {
    const results = {}
    
    for (const symbol of symbols) {
      try {
        const price = await this.getFallbackPrice(symbol)
        results[symbol] = price
      } catch (error) {
        results[symbol] = {
          symbol,
          error: error.message,
          price: this.getMockPrice(symbol).price
        }
      }
      
      // Small delay to be respectful
      await this.wait(200)
    }
    
    return results
  }

  // Fallback price sources when Finnhub is unavailable
  async getFallbackPrice(symbol) {
    const sources = [
      () => this.getYahooFinancePrice(symbol),
      () => this.getAlphaVantagePrice(symbol)
    ]
    
    for (const source of sources) {
      try {
        return await source()
      } catch (error) {
        console.warn(`Fallback source failed for ${symbol}:`, error.message)
      }
    }
    
    throw new Error('All fallback sources failed')
  }

  // Yahoo Finance API (Free backup)
  async getYahooFinancePrice(symbol) {
    try {
      const response = await axios.get(`${this.yahooFinanceUrl}/${symbol}`, {
        timeout: 5000
      })
      
      const data = response.data
      if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
        const meta = data.chart.result[0].meta
        const price = meta.regularMarketPrice
        const previousClose = meta.previousClose || price
        const change = price - previousClose
        const changePercent = (change / previousClose) * 100
        
        return {
          symbol: symbol.toUpperCase(),
          price: parseFloat(price.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
          timestamp: new Date().toISOString(),
          source: 'Yahoo Finance',
          high: parseFloat((meta.regularMarketDayHigh || 0).toFixed(2)),
          low: parseFloat((meta.regularMarketDayLow || 0).toFixed(2)),
          open: parseFloat((meta.regularMarketOpen || 0).toFixed(2)),
          previousClose: parseFloat(previousClose.toFixed(2))
        }
      }
      throw new Error('Invalid Yahoo Finance response')
    } catch (error) {
      throw new Error(`Yahoo Finance API error: ${error.message}`)
    }
  }

  // Alpha Vantage API (Limited but reliable)
  async getAlphaVantagePrice(symbol) {
    if (this.alphaVantageKey === 'demo') {
      throw new Error('Alpha Vantage demo key not supported for real data')
    }

    try {
      const response = await axios.get(this.alphaVantageUrl, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol.toUpperCase(),
          apikey: this.alphaVantageKey
        },
        timeout: 10000
      })
      
      const data = response.data['Global Quote']
      if (data && data['05. price']) {
        const price = parseFloat(data['05. price'])
        const change = parseFloat(data['09. change'])
        const changePercent = parseFloat(data['10. change percent'].replace('%', ''))
        
        return {
          symbol: symbol.toUpperCase(),
          price: parseFloat(price.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
          timestamp: new Date().toISOString(),
          source: 'Alpha Vantage',
          high: parseFloat(data['03. high']),
          low: parseFloat(data['04. low']),
          open: parseFloat(data['02. open']),
          previousClose: parseFloat(data['08. previous close'])
        }
      }
      throw new Error('Invalid Alpha Vantage response')
    } catch (error) {
      throw new Error(`Alpha Vantage API error: ${error.message}`)
    }
  }

  // Enhanced stock search with rate limiting
  async searchSymbol(query) {
    if (!query || query.length < 1) return []
    
    try {
      if (this.finnhubKey) {
        const callFunction = async () => {
          const response = await axios.get(`${this.finnhubUrl}/search`, {
            params: {
              q: query,
              token: this.finnhubKey
            },
            timeout: 5000
          })
          
          return response.data.result?.slice(0, 10).map(item => ({
            symbol: item.symbol,
            name: item.description,
            type: item.type,
            source: 'Finnhub'
          })) || []
        }
        
        return await finnhubLimiter.queueCall(callFunction, 'high', `search:${query}`)
      }
      
      // Fallback mock search
      return this.getMockSearchResults(query)
    } catch (error) {
      console.warn('Symbol search failed:', error.message)
      return this.getMockSearchResults(query)
    }
  }

  // Get optimal update frequency based on portfolio size and rate limits
  getOptimalUpdateSettings(portfolioSize) {
    if (!this.finnhubKey) {
      return {
        frequency: 300000, // 5 minutes for free APIs
        canAutoUpdate: true,
        maxPositions: 50,
        recommendation: 'Using free APIs - updates every 5 minutes'
      }
    }

    const frequency = finnhubLimiter.getOptimalUpdateFrequency(portfolioSize)
    const status = finnhubLimiter.getStatus()
    
    return {
      frequency,
      canAutoUpdate: portfolioSize <= 55, // Leave buffer for manual updates
      maxPositions: 55,
      portfolioSize,
      recommendation: this.getUpdateRecommendation(portfolioSize, frequency),
      rateLimit: {
        current: status.currentWindowCalls,
        max: status.maxCalls,
        timeUntilReset: status.timeUntilReset
      }
    }
  }

  // Get human-readable recommendation
  getUpdateRecommendation(portfolioSize, frequency) {
    const minutes = Math.ceil(frequency / 60000)
    
    if (portfolioSize <= 10) {
      return `Small portfolio - can update every ${minutes} minute(s)`
    } else if (portfolioSize <= 30) {
      return `Medium portfolio - updates every ${minutes} minute(s)`
    } else if (portfolioSize <= 55) {
      return `Large portfolio - updates every ${minutes} minute(s)`
    } else {
      return `Portfolio too large for real-time updates - consider reducing positions`
    }
  }

  // Priority update for user-requested updates
  async priorityUpdate(symbol) {
    return this.getCurrentPrice(symbol, 'high')
  }

  // Cache management
  getCachedPrice(symbol) {
    const cached = this.cache.get(symbol.toUpperCase())
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data
    }
    return null
  }

  setCachedPrice(symbol, data) {
    this.cache.set(symbol.toUpperCase(), {
      data,
      timestamp: Date.now()
    })
  }

  clearCache() {
    this.cache.clear()
  }

  // Performance tracking
  updateStats(startTime, success) {
    this.stats.apiCalls++
    if (!success) this.stats.errors++
    
    const responseTime = Date.now() - startTime
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (this.stats.apiCalls - 1) + responseTime) / this.stats.apiCalls
  }

  // Get comprehensive status
  getApiStatus() {
    return {
      finnhub: {
        enabled: !!this.finnhubKey,
        rateLimiter: this.finnhubKey ? finnhubLimiter.getStatus() : null
      },
      cache: {
        size: this.cache.size,
        timeout: this.cacheTimeout
      },
      stats: { ...this.stats }
    }
  }

  // Utility methods
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Mock data for development/fallback
  getMockPrice(symbol) {
    const mockPrices = {
      'AAPL': { base: 150, volatility: 5 },
      'GOOGL': { base: 2500, volatility: 50 },
      'MSFT': { base: 300, volatility: 10 },
      'TSLA': { base: 800, volatility: 40 },
      'AMZN': { base: 3000, volatility: 60 },
      'NVDA': { base: 400, volatility: 20 },
      'META': { base: 200, volatility: 15 },
      'NFLX': { base: 350, volatility: 25 }
    }

    const mock = mockPrices[symbol.toUpperCase()] || { base: 100, volatility: 5 }
    const randomChange = (Math.random() - 0.5) * mock.volatility
    const price = mock.base + randomChange
    const change = randomChange
    const changePercent = (change / mock.base) * 100

    return {
      symbol: symbol.toUpperCase(),
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      timestamp: new Date().toISOString(),
      source: 'Mock Data',
      high: parseFloat((price + Math.abs(randomChange) * 0.5).toFixed(2)),
      low: parseFloat((price - Math.abs(randomChange) * 0.5).toFixed(2)),
      open: parseFloat((mock.base).toFixed(2)),
      previousClose: parseFloat((mock.base).toFixed(2))
    }
  }

  getMockSearchResults(query) {
    const mockResults = [
      { symbol: 'AAPL', name: 'Apple Inc.', type: 'Common Stock' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Common Stock' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Common Stock' },
      { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'Common Stock' },
      { symbol: 'AMZN', name: 'Amazon.com, Inc.', type: 'Common Stock' }
    ]

    return mockResults.filter(result => 
      result.symbol.toLowerCase().includes(query.toLowerCase()) ||
      result.name.toLowerCase().includes(query.toLowerCase())
    )
  }
}

// Export singleton instance
export const stockApi = new StockApiService()
export default stockApi