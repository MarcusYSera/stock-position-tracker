// src/services/yahooFinanceSearch.js - Yahoo Finance search with unlimited calls
import axios from 'axios'

class YahooFinanceSearchService {
  constructor() {
    // Yahoo Finance search endpoints
    // local host testing
    this.searchUrl = 'http://localhost:3001/api/yahoo-finance/v1/finance/search'
    // this.searchUrl = 'https://query1.finance.yahoo.com/v1/finance/search'
    this.quoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote'
    this.chartUrl = 'https://query1.finance.yahoo.com/v8/finance/chart'
    
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

    console.log('📊 Yahoo Finance Search initialized - unlimited API calls!')
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
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })

      const data = response.data
      if (!data?.quotes) {
        throw new Error('Invalid Yahoo Finance search response')
      }

      // Process and filter results
      const results = data.quotes
        .filter(quote => this.isValidStock(quote))
        .map(quote => this.processSearchResult(quote, query))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit)

      // Cache results
      this.setCache(cacheKey, results)
      
      console.log(`🔍 Yahoo Finance found ${results.length} results for "${query}"`)
      return results
    } catch (error) {
      this.stats.errors++
      console.error('Yahoo Finance search failed:', error.message)
      
      // Return popular stocks as fallback
      return this.getPopularStocksFallback(query, limit)
    }
  }

  // Get detailed stock information
  async getStockDetails(symbols) {
    if (!symbols || symbols.length === 0) return []
    
    // Convert single symbol to array
    const symbolList = Array.isArray(symbols) ? symbols : [symbols]
    const symbolsStr = symbolList.join(',')
    
    const cacheKey = `details_${symbolsStr}`
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      this.stats.cacheHits++
      return Array.isArray(symbols) ? cached : cached[0]
    }

    this.stats.quoteCalls++

    try {
      const response = await axios.get(this.quoteUrl, {
        params: {
          symbols: symbolsStr,
          fields: 'symbol,longName,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketState,quoteType,currency,exchange'
        },
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })

      const quotes = response.data?.quoteResponse?.result || []
      const results = quotes.map(quote => this.processQuoteResult(quote))
      
      this.setCache(cacheKey, results)
      
      return Array.isArray(symbols) ? results : results[0]
    } catch (error) {
      this.stats.errors++
      console.error('Yahoo Finance quote failed:', error.message)
      throw error
    }
  }

  // Get current stock price (optimized single call)
  async getCurrentPrice(symbol) {
    try {
      const response = await axios.get(this.chartUrl + `/${symbol}`, {
        params: {
          interval: '1d',
          range: '1d',
          includePrePost: true
        },
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })

      const data = response.data
      if (!data?.chart?.result?.[0]?.meta) {
        throw new Error('Invalid Yahoo Finance chart response')
      }

      const meta = data.chart.result[0].meta
      const price = meta.regularMarketPrice || meta.previousClose
      const previousClose = meta.previousClose
      const change = price - previousClose
      const changePercent = (change / previousClose) * 100

      return {
        symbol: symbol.toUpperCase(),
        price: parseFloat(price.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        currency: meta.currency || 'USD',
        marketState: meta.marketState || 'REGULAR',
        timestamp: new Date().toISOString(),
        source: 'Yahoo Finance',
        high: parseFloat((meta.regularMarketDayHigh || 0).toFixed(2)),
        low: parseFloat((meta.regularMarketDayLow || 0).toFixed(2)),
        open: parseFloat((meta.regularMarketOpen || 0).toFixed(2)),
        previousClose: parseFloat(previousClose.toFixed(2))
      }
    } catch (error) {
      throw new Error(`Yahoo Finance price error: ${error.message}`)
    }
  }

  // Check if quote result is a valid stock
  isValidStock(quote) {
    // Filter for stocks, ETFs, and major exchanges
    const validTypes = ['EQUITY', 'ETF', 'INDEX']
    const validExchanges = ['NAS', 'NYQ', 'NCM', 'ASE', 'NMS', 'NGM', 'BTS', 'PNK']
    
    return quote &&
           quote.symbol &&
           quote.shortName &&
           validTypes.includes(quote.quoteType) &&
           (validExchanges.includes(quote.exchange) || quote.symbol.length <= 5) &&
           !quote.symbol.includes('=') && // Exclude currency pairs
           !quote.symbol.includes('^') && // Exclude indices (unless specifically wanted)
           quote.marketState !== 'CLOSED' // Prefer active markets
  }

  // Process search result into standardized format
  processSearchResult(quote, query) {
    const symbol = quote.symbol || ''
    const name = quote.longName || quote.shortName || ''
    const exchange = quote.exchange || ''
    const type = this.getDisplayType(quote.quoteType)
    
    return {
      symbol: symbol.toUpperCase(),
      name: name,
      type: type,
      exchange: exchange,
      quoteType: quote.quoteType,
      displayText: `${symbol.toUpperCase()} - ${name}`,
      relevanceScore: this.calculateRelevanceScore(query, symbol, name),
      source: 'Yahoo Finance',
      isYahoo: true
    }
  }

  // Process quote result for detailed info
  processQuoteResult(quote) {
    return {
      symbol: quote.symbol?.toUpperCase() || '',
      name: quote.longName || quote.shortName || '',
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      currency: quote.currency || 'USD',
      exchange: quote.exchange || '',
      type: this.getDisplayType(quote.quoteType),
      marketState: quote.marketState || 'REGULAR',
      source: 'Yahoo Finance'
    }
  }

  // Calculate relevance score for search results
  calculateRelevanceScore(query, symbol, name) {
    const q = query.toLowerCase()
    const sym = symbol.toLowerCase()
    const nm = name.toLowerCase()
    
    let score = 0
    
    // Exact matches get highest priority
    if (sym === q) score += 1000
    else if (sym.startsWith(q)) score += 500
    else if (sym.includes(q)) score += 100
    
    // Company name matches
    if (nm.startsWith(q)) score += 200
    else if (nm.includes(q)) score += 50
    
    // Prefer shorter symbols (usually major stocks)
    if (symbol.length <= 4) score += 50
    else if (symbol.length <= 5) score += 25
    
    // Prefer major exchanges
    const majorExchanges = ['NAS', 'NYQ', 'NCM']
    if (majorExchanges.some(exchange => symbol.includes(exchange))) score += 30
    
    // Bonus for common words in tech stocks
    const techWords = ['corp', 'inc', 'ltd', 'company', 'technologies', 'systems']
    if (techWords.some(word => nm.includes(word))) score += 20
    
    return score
  }

  // Convert quote type to display-friendly format
  getDisplayType(quoteType) {
    const typeMap = {
      'EQUITY': 'Stock',
      'ETF': 'ETF',
      'INDEX': 'Index',
      'MUTUALFUND': 'Mutual Fund',
      'CRYPTOCURRENCY': 'Crypto',
      'FUTURE': 'Future',
      'OPTION': 'Option'
    }
    
    return typeMap[quoteType] || 'Stock'
  }

  // Popular stocks fallback when search fails
  getPopularStocksFallback(query, limit) {
    const popular = [
      { symbol: 'AAPL', name: 'Apple Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Stock', exchange: 'NAS' },
      { symbol: 'AMZN', name: 'Amazon.com, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'META', name: 'Meta Platforms, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'Stock', exchange: 'NAS' },
      { symbol: 'NFLX', name: 'Netflix, Inc.', type: 'Stock', exchange: 'NAS' },
      { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', type: 'Stock', exchange: 'NAS' },
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
      apiProvider: 'Yahoo Finance',
      unlimited: true
    }
  }

  // Validate if symbol exists
  async validateSymbol(symbol) {
    try {
      await this.getCurrentPrice(symbol)
      return true
    } catch (error) {
      console.warn(`Symbol validation failed for ${symbol}:`, error.message)
      return false
    }
  }

  // Search trending stocks
  async getTrendingStocks(limit = 10) {
    try {
      // Yahoo Finance trending endpoint
      const response = await axios.get('https://query1.finance.yahoo.com/v1/finance/trending/US', {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })

      const trending = response.data?.finance?.result?.[0]?.quotes || []
      
      return trending.slice(0, limit).map(quote => ({
        symbol: quote.symbol?.toUpperCase() || '',
        name: quote.longName || quote.shortName || '',
        type: this.getDisplayType(quote.quoteType),
        displayText: `${quote.symbol?.toUpperCase()} - ${quote.longName || quote.shortName}`,
        relevanceScore: 0,
        source: 'Yahoo Trending',
        isTrending: true
      }))
    } catch (error) {
      console.warn('Failed to fetch trending stocks:', error.message)
      return this.getPopularStocksFallback('', limit)
    }
  }
}

// Export singleton instance
export const yahooFinanceSearch = new YahooFinanceSearchService()
export default yahooFinanceSearch