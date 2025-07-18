// src/services/yahooFinanceSearch.js - Complete file with all fixes
import axios from 'axios'

class YahooFinanceSearchService {
  constructor() {
    // Use proxy server instead of direct Yahoo Finance URLs
    const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost'
    const proxyBaseUrl = isDevelopment ? 'http://localhost:3001' : '/api'
    
    // Yahoo Finance search endpoints via proxy
    this.searchUrl = `${proxyBaseUrl}/api/yahoo-finance/v1/finance/search`
    this.quoteUrl = `${proxyBaseUrl}/api/yahoo-finance/v7/finance/quote`
    this.chartUrl = `${proxyBaseUrl}/api/yahoo-finance/v8/finance/chart`
    
    // Cache for search results
    this.searchCache = new Map()
    this.cacheTimeout = 300000 // 5 minutes cache for search results
    
    // Statistics
    this.stats = {
      searchCalls: 0,
      quoteCalls: 0,
      cacheHits: 0,
      errors: 0
    }

    console.log('📊 Yahoo Finance Search initialized with proxy server!')
    console.log('🔗 Proxy URLs:', {
      search: this.searchUrl,
      quote: this.quoteUrl,
      chart: this.chartUrl
    })
  }

  // Main search method for stock symbols and companies
  async searchStocks(query, limit = 10) {
    if (!query || query.length < 1) return []
    
    const cacheKey = `search_${query.toLowerCase().trim()}_${limit}`
    
    // Check cache first
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      this.stats.cacheHits++
      return cached
    }

    this.stats.searchCalls++
    
    try {
      console.log(`🔍 Searching via proxy for: "${query}"`)
      
      const response = await axios.get(this.searchUrl, {
        params: {
          q: query,
          quotesCount: limit,
          newsCount: 0,
          listsCount: 0,
          enableFuzzyQuery: false,
          quotesQueryId: 'tss_match_phrase_query',
          multiQuoteQueryId: 'multi_quote_single_token_query',
          enableCb: true,
          enableNavLinks: true,
          enableEnhancedTrivialQuery: true
        },
        timeout: 15000,
      })

      const data = response.data
      
      // Debug: Log the raw response
      console.log(`📊 Raw Yahoo Finance Response:`, data)
      
      if (!data?.quotes || !Array.isArray(data.quotes)) {
        throw new Error('Invalid Yahoo Finance search response - no quotes array')
      }

      console.log(`📈 Found ${data.quotes.length} raw quotes from Yahoo Finance`)

      // Filter and process results
      const results = data.quotes
        .filter(quote => {
          // Only include Yahoo Finance results (exclude Crunchbase, etc.)
          if (!quote.isYahooFinance) {
            console.log(`⏭️  Skipping non-Yahoo Finance result: ${quote.name || quote.symbol}`)
            return false
          }
          
          // Check if it's a valid stock/ETF
          const isValid = this.isValidStock(quote)
          if (!isValid) {
            console.log(`⏭️  Skipping invalid quote: ${quote.symbol} (${quote.quoteType})`)
          }
          return isValid
        })
        .map(quote => {
          const processed = this.processSearchResult(quote, query)
          console.log(`✅ Processed: ${processed.symbol} - ${processed.name}`)
          return processed
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit)

      // Convert to plain objects to avoid reactivity issues
      const plainResults = results.map(result => ({
        symbol: result.symbol,
        name: result.name,
        type: result.type,
        exchange: result.exchange,
        displayText: result.displayText,
        relevanceScore: result.relevanceScore,
        source: result.source,
        quoteType: result.quoteType,
        marketState: result.marketState,
        sector: result.sector,
        industry: result.industry
      }))

      // Cache results
      this.setCache(cacheKey, plainResults)
      
      console.log(`✅ Yahoo Finance proxy returned ${plainResults.length} processed results for "${query}"`)
      return plainResults
    } catch (error) {
      this.stats.errors++
      console.error('Yahoo Finance proxy search failed:', error.message)
      
      // Check if it's a proxy connection error
      if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
        console.error('❌ Proxy server not running! Start with: npm run dev')
        throw new Error('Proxy server not available. Please start the backend server.')
      }
      
      // Return popular stocks as fallback
      console.log(`🔄 Falling back to popular stocks for "${query}"`)
      return this.getPopularStocksFallback(query, limit)
    }
  }

  // Get current stock price (FIXED VERSION)
  async getCurrentPrice(symbol) {
    try {
      console.log(`📊 Fetching current price for ${symbol}`)
      
      const response = await axios.get(`${this.chartUrl}/${symbol}`, {
        params: {
          interval: '1d',
          range: '1d',
          includePrePost: true
        },
        timeout: 10000
      })

      const data = response.data
      console.log(`📊 Yahoo Finance chart response for ${symbol}:`, data)
      
      // Check if we have valid chart data
      if (!data?.chart?.result?.length) {
        throw new Error(`No chart data available for ${symbol}`)
      }

      const result = data.chart.result[0]
      if (!result?.meta) {
        throw new Error(`No meta data available for ${symbol}`)
      }

      const meta = result.meta
      console.log(`📊 Meta data for ${symbol}:`, meta)

      // Safely extract price values with multiple fallbacks
      const regularMarketPrice = meta.regularMarketPrice
      const previousClose = meta.previousClose
      const chartClose = meta.chartPreviousClose
      
      // Try to get a valid price value
      let price = null
      if (typeof regularMarketPrice === 'number' && !isNaN(regularMarketPrice)) {
        price = regularMarketPrice
      } else if (typeof previousClose === 'number' && !isNaN(previousClose)) {
        price = previousClose
      } else if (typeof chartClose === 'number' && !isNaN(chartClose)) {
        price = chartClose
      }

      // Try to get a valid previous close value
      let prevClose = null
      if (typeof previousClose === 'number' && !isNaN(previousClose)) {
        prevClose = previousClose
      } else if (typeof chartClose === 'number' && !isNaN(chartClose)) {
        prevClose = chartClose
      } else if (price) {
        prevClose = price // Use current price as fallback
      }

      // Validate we have at least a price
      if (!price || price <= 0) {
        throw new Error(`No valid price data found for ${symbol}. Received: regularMarketPrice=${regularMarketPrice}, previousClose=${previousClose}`)
      }

      // Use price as previous close if we don't have one
      if (!prevClose) {
        prevClose = price
      }

      // Calculate change safely
      const change = price - prevClose
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

      // Safely extract other values with defaults
      const safeNumber = (value, defaultValue = 0) => {
        return (typeof value === 'number' && !isNaN(value)) ? value : defaultValue
      }

      const priceResult = {
        symbol: symbol.toUpperCase(),
        price: Math.round(price * 100) / 100, // Safe rounding instead of toFixed
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        currency: meta.currency || 'USD',
        marketState: meta.marketState || 'REGULAR',
        timestamp: new Date().toISOString(),
        source: 'Yahoo Finance (Proxy)',
        high: Math.round(safeNumber(meta.regularMarketDayHigh, price) * 100) / 100,
        low: Math.round(safeNumber(meta.regularMarketDayLow, price) * 100) / 100,
        open: Math.round(safeNumber(meta.regularMarketOpen, price) * 100) / 100,
        previousClose: Math.round(prevClose * 100) / 100
      }

      console.log(`✅ Successfully processed price for ${symbol}:`, priceResult)
      return priceResult

    } catch (error) {
      console.error(`❌ Error fetching current price for ${symbol}:`, error.message)
      
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Proxy server not available. Please start the backend server.')
      }
      
      // Provide more specific error messages
      if (error.message.includes('No chart data available')) {
        throw new Error(`Stock symbol ${symbol} not found or market is closed`)
      }
      
      if (error.message.includes('No valid price data')) {
        throw new Error(`Unable to retrieve current price for ${symbol}. The stock may be delisted or market data unavailable.`)
      }
      
      throw new Error(`Failed to fetch price for ${symbol}: ${error.message}`)
    }
  }

  // Validate if symbol exists (FIXED VERSION)
  async validateSymbol(symbol) {
    // Don't validate very short symbols (less than 1 character)
    if (!symbol || symbol.length < 1) {
      return false
    }
    
    // Don't validate symbols that are too long (likely not valid)
    if (symbol.length > 10) {
      console.warn(`Symbol ${symbol} is too long, likely invalid`)
      return false
    }
    
    try {
      console.log(`🔍 Validating symbol: ${symbol}`)
      
      // Try to get current price to validate the symbol
      const price = await this.getCurrentPrice(symbol)
      
      // Consider symbol valid if we got price data
      const isValid = price && 
                     typeof price.price === 'number' && 
                     price.price > 0 &&
                     price.source !== 'Mock Data'
      
      console.log(`${isValid ? '✅' : '❌'} Symbol validation result for ${symbol}: ${isValid}`)
      return isValid
      
    } catch (error) {
      console.warn(`❌ Symbol validation failed for ${symbol}:`, error.message)
      
      // Consider some errors as "symbol not found" rather than validation failure
      if (error.message.includes('not found') || 
          error.message.includes('No chart data') ||
          error.message.includes('delisted')) {
        return false // Symbol doesn't exist
      }
      
      // For other errors (network, etc.), we can't be sure, so return false
      return false
    }
  }

  // Process search result with relevance scoring
  processSearchResult(quote, query) {
    const symbol = quote.symbol || ''
    const name = quote.shortname || quote.longname || ''
    const type = this.getReadableType(quote.quoteType)
    const exchange = quote.exchDisp || quote.exchange || ''
    
    return {
      symbol: symbol.toUpperCase(),
      name: name,
      type: type,
      exchange: exchange,
      displayText: `${symbol.toUpperCase()} - ${name}`,
      relevanceScore: this.calculateRelevanceScore(query, symbol, name),
      source: 'Yahoo Finance (Proxy)',
      quoteType: quote.quoteType,
      marketState: quote.marketState || 'REGULAR',
      sector: quote.sector || '',
      industry: quote.industry || ''
    }
  }

  // Calculate relevance score for search results
  calculateRelevanceScore(query, symbol, name) {
    const q = query.toLowerCase()
    const s = symbol.toLowerCase()
    const n = name.toLowerCase()
    
    let score = 0
    
    // Exact symbol match gets highest score
    if (s === q) score += 100
    else if (s.startsWith(q)) score += 80
    else if (s.includes(q)) score += 60
    
    // Name matching
    if (n.includes(q)) score += 40
    if (n.startsWith(q)) score += 20
    
    // Prefer shorter symbols (typically more popular)
    if (symbol.length <= 4) score += 10
    
    return score
  }

  // Convert quoteType to readable format
  getReadableType(quoteType) {
    const typeMap = {
      'EQUITY': 'Stock',
      'ETF': 'ETF',
      'INDEX': 'Index',
      'MUTUALFUND': 'Mutual Fund',
      'FUTURE': 'Future',
      'OPTION': 'Option',
      'CURRENCY': 'Currency',
      'CRYPTOCURRENCY': 'Crypto'
    }
    return typeMap[quoteType] || 'Stock'
  }

  // Check if quote result is a valid stock
  isValidStock(quote) {
    // Must have required fields
    if (!quote || !quote.symbol || !quote.shortname) {
      return false
    }
    
    // Must be a Yahoo Finance result (exclude Crunchbase, etc.)
    if (!quote.isYahooFinance) {
      return false
    }
    
    // Filter for stocks, ETFs, and major exchanges
    const validTypes = ['EQUITY', 'ETF', 'INDEX']
    const validExchanges = ['NMS', 'NYQ', 'NCM', 'ASE', 'NGM', 'BTS', 'PNK', 'WCB']
    
    const hasValidType = validTypes.includes(quote.quoteType)
    const hasValidExchange = validExchanges.includes(quote.exchange) || !quote.exchange
    
    console.log(`🔍 Validating ${quote.symbol}: type=${quote.quoteType} exchange=${quote.exchange} valid=${hasValidType && hasValidExchange}`)
    
    return hasValidType && hasValidExchange
  }

  // Fallback popular stocks when search fails
  getPopularStocksFallback(query, limit = 10) {
    const popular = [
      { symbol: 'AAPL', name: 'Apple Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Stock', exchange: 'NAS' },
      { symbol: 'AMZN', name: 'Amazon.com, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'META', name: 'Meta Platforms, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'Stock', exchange: 'NAS' },
      { symbol: 'NFLX', name: 'Netflix, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'CRM', name: 'Salesforce, Inc.', type: 'Stock', exchange: 'NYQ' },
      { symbol: 'ORCL', name: 'Oracle Corporation', type: 'Stock', exchange: 'NYQ' },
      { symbol: 'IBM', name: 'International Business Machines Corporation', type: 'Stock', exchange: 'NYQ' },
      { symbol: 'INTC', name: 'Intel Corporation', type: 'Stock', exchange: 'NAS' },
      { symbol: 'CSCO', name: 'Cisco Systems, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'ADBE', name: 'Adobe Inc.', type: 'Stock', exchange: 'NAS' }
    ]

    if (!query) {
      return popular.slice(0, limit).map(stock => ({
        ...stock,
        displayText: `${stock.symbol} - ${stock.name}`,
        relevanceScore: 0,
        source: 'Popular',
        isPopular: true
      }))
    }

    // Filter popular stocks by query
    const q = query.toLowerCase()
    return popular
      .filter(stock => 
        stock.symbol.toLowerCase().includes(q) || 
        stock.name.toLowerCase().includes(q)
      )
      .slice(0, limit)
      .map(stock => ({
        ...stock,
        displayText: `${stock.symbol} - ${stock.name}`,
        relevanceScore: this.calculateRelevanceScore(query, stock.symbol, stock.name),
        source: 'Popular',
        isPopular: true
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
  }

  // Cache management
  getFromCache(key) {
    const cached = this.searchCache.get(key)
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data
    }
    return null
  }

  setCache(key, data) {
    this.searchCache.set(key, {
      data,
      timestamp: Date.now()
    })

    // Clean old cache entries (keep cache size reasonable)
    if (this.searchCache.size > 100) {
      const oldestKey = this.searchCache.keys().next().value
      this.searchCache.delete(oldestKey)
    }
  }

  clearCache() {
    this.searchCache.clear()
  }

  // Get service statistics
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.searchCache.size,
      apiProvider: 'Yahoo Finance (Proxy)',
      unlimited: true
    }
  }
}

// Export singleton instance
export const yahooFinanceSearch = new YahooFinanceSearchService()