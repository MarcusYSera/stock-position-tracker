// src/services/yahooFinanceSearch.js - Updated to use proxy server
import axios from "axios";

class YahooFinanceSearchService {
  constructor() {
    // Use proxy server instead of direct Yahoo Finance URLs
    const isDevelopment =
      process.env.NODE_ENV === "development" ||
      window.location.hostname === "localhost";
    const proxyBaseUrl = isDevelopment ? "http://localhost:3001" : "/api";

    // Yahoo Finance search endpoints via proxy
    this.searchUrl = `${proxyBaseUrl}/api/yahoo-finance/v1/finance/search`;
    this.quoteUrl = `${proxyBaseUrl}/api/yahoo-finance/v7/finance/quote`;
    this.chartUrl = `${proxyBaseUrl}/api/yahoo-finance/v8/finance/chart`;

    // Cache for search results
    this.searchCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache for search results

    // Statistics
    this.stats = {
      searchCalls: 0,
      quoteCalls: 0,
      cacheHits: 0,
      errors: 0,
    };

    console.log("📊 Yahoo Finance Search initialized with proxy server!");
    console.log("🔗 Proxy URLs:", {
      search: this.searchUrl,
      quote: this.quoteUrl,
      chart: this.chartUrl,
    });
  }

  // Main search method for stock symbols and companies
  async searchStocks(query, limit = 10) {
    if (!query || query.length < 1) return [];

    const cacheKey = `search_${query.toLowerCase().trim()}_${limit}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.searchCalls++;

    try {
      console.log(`🔍 Searching via proxy for: "${query}"`);

      const response = await axios.get(this.searchUrl, {
        params: {
          q: query,
          quotesCount: limit,
          newsCount: 0,
          listsCount: 0,
          enableFuzzyQuery: false,
          quotesQueryId: "tss_match_phrase_query",
          multiQuoteQueryId: "multi_quote_single_token_query",
          enableCb: true,
          enableNavLinks: true,
          enableEnhancedTrivialQuery: true,
        },
        timeout: 15000,
      });

      const data = response.data;

      // Debug: Log the raw response
      console.log(`📊 Raw Yahoo Finance Response:`, data);

      if (!data?.quotes || !Array.isArray(data.quotes)) {
        throw new Error(
          "Invalid Yahoo Finance search response - no quotes array"
        );
      }

      console.log(
        `📈 Found ${data.quotes.length} raw quotes from Yahoo Finance`
      );

      // Filter and process results
      const results = data.quotes
        .filter((quote) => {
          // Only include Yahoo Finance results (exclude Crunchbase, etc.)
          if (!quote.isYahooFinance) {
            console.log(
              `⏭️  Skipping non-Yahoo Finance result: ${
                quote.name || quote.symbol
              }`
            );
            return false;
          }

          // Check if it's a valid stock/ETF
          const isValid = this.isValidStock(quote);
          if (!isValid) {
            console.log(
              `⏭️  Skipping invalid quote: ${quote.symbol} (${quote.quoteType})`
            );
          }
          return isValid;
        })
        .map((quote) => {
          const processed = this.processSearchResult(quote, query);
          console.log(`✅ Processed: ${processed.symbol} - ${processed.name}`);
          return processed;
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

      // Cache results
      this.setCache(cacheKey, results);

      console.log(
        `✅ Yahoo Finance proxy returned ${results.length} processed results for "${query}"`
      );
      return results;
    } catch (error) {
      this.stats.errors++;
      console.error("Yahoo Finance proxy search failed:", error.message);

      // Check if it's a proxy connection error
      if (
        error.code === "ECONNREFUSED" ||
        error.message.includes("ECONNREFUSED")
      ) {
        console.error("❌ Proxy server not running! Start with: npm run dev");
        throw new Error(
          "Proxy server not available. Please start the backend server."
        );
      }

      // Return popular stocks as fallback
      console.log(`🔄 Falling back to popular stocks for "${query}"`);
      return this.getPopularStocksFallback(query, limit);
    }
  }

  // Get detailed stock information
  async getStockDetails(symbols) {
    if (!symbols || symbols.length === 0) return [];

    // Convert single symbol to array
    const symbolList = Array.isArray(symbols) ? symbols : [symbols];
    const symbolsStr = symbolList.join(",");

    const cacheKey = `details_${symbolsStr}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return Array.isArray(symbols) ? cached : cached[0];
    }

    this.stats.quoteCalls++;

    try {
      const response = await axios.get(this.quoteUrl, {
        params: {
          symbols: symbolsStr,
          fields:
            "symbol,longName,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketState,quoteType,currency,exchange",
        },
        timeout: 15000,
      });

      const quotes = response.data?.quoteResponse?.result || [];
      const results = quotes.map((quote) => this.processQuoteResult(quote));

      this.setCache(cacheKey, results);

      return Array.isArray(symbols) ? results : results[0];
    } catch (error) {
      this.stats.errors++;
      console.error("Yahoo Finance proxy quote failed:", error.message);

      if (error.code === "ECONNREFUSED") {
        throw new Error(
          "Proxy server not available. Please start the backend server."
        );
      }

      throw error;
    }
  }

  // Get current stock price (optimized single call)
  async getCurrentPrice(symbol) {
    try {
      const response = await axios.get(`${this.chartUrl}/${symbol}`, {
        params: {
          interval: "1d",
          range: "1d",
          includePrePost: true,
        },
        timeout: 10000,
      });

      const data = response.data;
      if (!data?.chart?.result?.[0]?.meta) {
        throw new Error("Invalid Yahoo Finance chart response");
      }

      const meta = data.chart.result[0].meta;
      const price = meta.regularMarketPrice || meta.previousClose;
      const previousClose = meta.previousClose;
      const change = price - previousClose;
      const changePercent = (change / previousClose) * 100;

      return {
        symbol: symbol.toUpperCase(),
        price: parseFloat(price.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        currency: meta.currency || "USD",
        marketState: meta.marketState || "REGULAR",
        timestamp: new Date().toISOString(),
        source: "Yahoo Finance (Proxy)",
        high: parseFloat((meta.regularMarketDayHigh || 0).toFixed(2)),
        low: parseFloat((meta.regularMarketDayLow || 0).toFixed(2)),
        open: parseFloat((meta.regularMarketOpen || 0).toFixed(2)),
        previousClose: parseFloat(previousClose.toFixed(2)),
      };
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          "Proxy server not available. Please start the backend server."
        );
      }
      throw new Error(`Yahoo Finance proxy price error: ${error.message}`);
    }
  }

  // Process search result with relevance scoring
  processSearchResult(quote, query) {
    const symbol = quote.symbol || "";
    const name = quote.shortname || quote.longname || "";
    const type = this.getReadableType(quote.quoteType);
    const exchange = quote.exchDisp || quote.exchange || "";

    const result = {
      symbol: symbol.toUpperCase(),
      name: name,
      type: type,
      exchange: exchange,
      displayText: `${symbol.toUpperCase()} - ${name}`,
      relevanceScore: this.calculateRelevanceScore(query, symbol, name),
      source: "Yahoo Finance (Proxy)",
      quoteType: quote.quoteType,
      marketState: quote.marketState || "REGULAR",
      // Additional fields that might be useful
      sector: quote.sector || "",
      industry: quote.industry || "",
    };

    console.log(`📋 Processed result:`, result);
    return result;
  }

  // Process quote result for detailed info
  processQuoteResult(quote) {
    return {
      symbol: quote.symbol?.toUpperCase() || "",
      name: quote.longName || quote.shortName || "",
      type: this.getReadableType(quote.quoteType),
      exchange: quote.exchange || "",
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      currency: quote.currency || "USD",
      marketState: quote.marketState || "REGULAR",
      source: "Yahoo Finance (Proxy)",
    };
  }

  // Calculate relevance score for search results
  calculateRelevanceScore(query, symbol, name) {
    const q = query.toLowerCase();
    const s = symbol.toLowerCase();
    const n = name.toLowerCase();

    let score = 0;

    // Exact symbol match gets highest score
    if (s === q) score += 100;
    else if (s.startsWith(q)) score += 80;
    else if (s.includes(q)) score += 60;

    // Name matching
    if (n.includes(q)) score += 40;
    if (n.startsWith(q)) score += 20;

    // Prefer shorter symbols (typically more popular)
    if (symbol.length <= 4) score += 10;

    return score;
  }

  // Convert quoteType to readable format
  getReadableType(quoteType) {
    const typeMap = {
      EQUITY: "Stock",
      ETF: "ETF",
      INDEX: "Index",
      MUTUALFUND: "Mutual Fund",
      FUTURE: "Future",
      OPTION: "Option",
      CURRENCY: "Currency",
      CRYPTOCURRENCY: "Crypto",
    };
    return typeMap[quoteType] || "Stock";
  }

  // Check if quote result is a valid stock
  isValidStock(quote) {
    // Must have required fields
    if (!quote || !quote.symbol || !quote.shortname) {
      return false;
    }

    // Must be a Yahoo Finance result (exclude Crunchbase, etc.)
    if (!quote.isYahooFinance) {
      return false;
    }

    // Filter for stocks, ETFs, and major exchanges
    const validTypes = ["EQUITY", "ETF", "INDEX"];
    const validExchanges = [
      "NMS",
      "NYQ",
      "NCM",
      "ASE",
      "NGM",
      "BTS",
      "PNK",
      "WCB",
    ];

    const hasValidType = validTypes.includes(quote.quoteType);
    const hasValidExchange =
      validExchanges.includes(quote.exchange) || !quote.exchange;

    console.log(
      `🔍 Validating ${quote.symbol}: type=${quote.quoteType} exchange=${
        quote.exchange
      } valid=${hasValidType && hasValidExchange}`
    );

    return hasValidType && hasValidExchange;
  }

  // Fallback popular stocks when search fails
  getPopularStocksFallback(query, limit = 10) {
    const popular = [
      { symbol: "AAPL", name: "Apple Inc.", type: "Stock", exchange: "NAS" },
      {
        symbol: "GOOGL",
        name: "Alphabet Inc.",
        type: "Stock",
        exchange: "NAS",
      },
      {
        symbol: "MSFT",
        name: "Microsoft Corporation",
        type: "Stock",
        exchange: "NAS",
      },
      {
        symbol: "AMZN",
        name: "Amazon.com, Inc.",
        type: "Stock",
        exchange: "NAS",
      },
      { symbol: "TSLA", name: "Tesla, Inc.", type: "Stock", exchange: "NAS" },
      {
        symbol: "META",
        name: "Meta Platforms, Inc.",
        type: "Stock",
        exchange: "NAS",
      },
      {
        symbol: "NVDA",
        name: "NVIDIA Corporation",
        type: "Stock",
        exchange: "NAS",
      },
      { symbol: "NFLX", name: "Netflix, Inc.", type: "Stock", exchange: "NAS" },
      {
        symbol: "CRM",
        name: "Salesforce, Inc.",
        type: "Stock",
        exchange: "NYQ",
      },
      {
        symbol: "ORCL",
        name: "Oracle Corporation",
        type: "Stock",
        exchange: "NYQ",
      },
      {
        symbol: "IBM",
        name: "International Business Machines Corporation",
        type: "Stock",
        exchange: "NYQ",
      },
      {
        symbol: "INTC",
        name: "Intel Corporation",
        type: "Stock",
        exchange: "NAS",
      },
      {
        symbol: "CSCO",
        name: "Cisco Systems, Inc.",
        type: "Stock",
        exchange: "NAS",
      },
      { symbol: "ADBE", name: "Adobe Inc.", type: "Stock", exchange: "NAS" },
    ];

    if (!query) {
      return popular.slice(0, limit).map((stock) => ({
        ...stock,
        displayText: `${stock.symbol} - ${stock.name}`,
        relevanceScore: 0,
        source: "Popular",
        isPopular: true,
      }));
    }

    // Filter popular stocks by query
    const q = query.toLowerCase();
    return popular
      .filter(
        (stock) =>
          stock.symbol.toLowerCase().includes(q) ||
          stock.name.toLowerCase().includes(q)
      )
      .slice(0, limit)
      .map((stock) => ({
        ...stock,
        displayText: `${stock.symbol} - ${stock.name}`,
        relevanceScore: this.calculateRelevanceScore(
          query,
          stock.symbol,
          stock.name
        ),
        source: "Popular",
        isPopular: true,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Cache management
  getFromCache(key) {
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.searchCache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Clean old cache entries (keep cache size reasonable)
    if (this.searchCache.size > 100) {
      const oldestKey = this.searchCache.keys().next().value;
      this.searchCache.delete(oldestKey);
    }
  }

  clearCache() {
    this.searchCache.clear();
  }

  // Get service statistics
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.searchCache.size,
      apiProvider: "Yahoo Finance (Proxy)",
      unlimited: true,
    };
  }

  // Validate if symbol exists
  // In your yahooFinanceSearch.js, update the validateSymbol method:

  async validateSymbol(symbol) {
    // Don't validate very short symbols (less than 2 characters)
    if (!symbol || symbol.length < 2) {
      return false;
    }

    try {
      const price = await this.getCurrentPrice(symbol);
      return price && price.price > 0;
    } catch (error) {
      console.warn(`Symbol validation failed for ${symbol}:`, error.message);
      return false;
    }
  }
}

// Export singleton instance
export const yahooFinanceSearch = new YahooFinanceSearchService();
