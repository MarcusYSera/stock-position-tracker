// src/composables/useStockSearch.js - Yahoo Finance stock search with unlimited calls
import { ref, computed } from 'vue'
import { yahooFinanceSearch } from '@/services/yahooFinanceSearch'

export function useStockSearch() {
  // State
  const searchResults = ref([])
  const isSearching = ref(false)
  const searchError = ref(null)
  const selectedIndex = ref(-1)
  const lastQuery = ref('')
  
  // Debounce timer
  let searchTimeout = null
  
  // Search method with debouncing and Yahoo Finance
  const searchStocks = async (query, delay = 300) => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout)
    }
    
    // Reset state
    searchError.value = null
    selectedIndex.value = -1
    lastQuery.value = query
    
    // Handle empty query
    if (!query || query.length < 1) {
      searchResults.value = []
      return
    }
    
    // For very short queries, return trending/popular stocks immediately
    if (query.length === 1) {
      try {
        const popular = await yahooFinanceSearch.getPopularStocksFallback(query, 10)
        searchResults.value = popular
      } catch (error) {
        searchResults.value = yahooFinanceSearch.getPopularStocksFallback(query, 10)
      }
      return
    }
    
    // Debounce the search for longer queries
    searchTimeout = setTimeout(async () => {
      isSearching.value = true
      
      try {
        console.log(`🔍 Searching Yahoo Finance for "${query}"`)
        
        // Search using Yahoo Finance (unlimited calls!)
        const results = await yahooFinanceSearch.searchStocks(query, 12)
        
        // Only update if this is still the current query
        if (lastQuery.value === query) {
          searchResults.value = results
          console.log(`✅ Yahoo Finance returned ${results.length} results`)
        }
      } catch (error) {
        console.error('Yahoo Finance search failed:', error)
        searchError.value = error.message
        
        // Fallback to popular stocks filtered by query
        if (lastQuery.value === query) {
          searchResults.value = yahooFinanceSearch.getPopularStocksFallback(query, 8)
        }
      } finally {
        if (lastQuery.value === query) {
          isSearching.value = false
        }
      }
    }, delay)
  }
  
  // Handle keyboard navigation
  const handleKeyNavigation = (event, inputValue, onSelect) => {
    if (searchResults.value.length === 0) return false
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        selectedIndex.value = Math.min(selectedIndex.value + 1, searchResults.value.length - 1)
        return true
        
      case 'ArrowUp':
        event.preventDefault()
        selectedIndex.value = Math.max(selectedIndex.value - 1, -1)
        return true
        
      case 'Enter':
        event.preventDefault()
        if (selectedIndex.value >= 0) {
          const selected = searchResults.value[selectedIndex.value]
          onSelect(selected)
          clearSearch()
        }
        return true
        
      case 'Tab':
        if (selectedIndex.value < 0 && searchResults.value.length > 0) {
          event.preventDefault()
          const firstResult = searchResults.value[0]
          onSelect(firstResult)
          clearSearch()
          return true
        }
        break
        
      case 'Escape':
        event.preventDefault()
        clearSearch()
        return true
        
      default:
        return false
    }
    
    return false
  }
  
  // Select a stock from results
  const selectStock = (stock) => {
    return {
      symbol: stock.symbol,
      name: stock.name,
      type: stock.type || 'Stock',
      exchange: stock.exchange || '',
      source: stock.source || 'Yahoo Finance'
    }
  }
  
  // Clear search results
  const clearSearch = () => {
    searchResults.value = []
    selectedIndex.value = -1
    isSearching.value = false
    searchError.value = null
    lastQuery.value = ''
    
    if (searchTimeout) {
      clearTimeout(searchTimeout)
      searchTimeout = null
    }
  }
  
  // Get popular/trending stocks for initial suggestions
  const getPopularStocks = async () => {
    try {
      // Try to get trending stocks first
      const trending = await yahooFinanceSearch.getTrendingStocks(8)
      if (trending.length > 0) {
        return trending.map(stock => ({
          ...stock,
          isPopular: true
        }))
      }
    } catch (error) {
      console.warn('Failed to get trending stocks, using popular fallback')
    }
    
    // Fallback to popular stocks
    return [
      { symbol: 'AAPL', name: 'Apple Inc.', type: 'Stock' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Stock' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Stock' },
      { symbol: 'AMZN', name: 'Amazon.com, Inc.', type: 'Stock' },
      { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'Stock' },
      { symbol: 'META', name: 'Meta Platforms, Inc.', type: 'Stock' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'Stock' },
      { symbol: 'NFLX', name: 'Netflix, Inc.', type: 'Stock' }
    ].map(stock => ({
      ...stock,
      displayText: `${stock.symbol} - ${stock.name}`,
      isPopular: true,
      source: 'Popular'
    }))
  }
  
  // Validate if a symbol exists using Yahoo Finance
  const validateSymbol = async (symbol) => {
    if (!symbol) return false
    
    try {
      return await yahooFinanceSearch.validateSymbol(symbol)
    } catch (error) {
      console.warn(`Symbol validation failed for ${symbol}:`, error.message)
      return false
    }
  }
  
  // Get stock info by symbol using Yahoo Finance
  const getStockInfo = async (symbol) => {
    if (!symbol) return null
    
    try {
      // First try to find in current search results
      const cached = searchResults.value.find(stock => 
        stock.symbol.toLowerCase() === symbol.toLowerCase()
      )
      
      if (cached) {
        return selectStock(cached)
      }
      
      // Search specifically for this symbol
      const searchResults = await yahooFinanceSearch.searchStocks(symbol, 5)
      const exact = searchResults.find(stock => 
        stock.symbol.toLowerCase() === symbol.toLowerCase()
      )
      
      if (exact) {
        return selectStock(exact)
      }
      
      // Try to get detailed quote info
      const details = await yahooFinanceSearch.getStockDetails(symbol)
      if (details && details.symbol) {
        return {
          symbol: details.symbol.toUpperCase(),
          name: details.name || `${symbol.toUpperCase()} Corporation`,
          type: details.type || 'Stock',
          exchange: details.exchange || '',
          source: 'Yahoo Finance'
        }
      }
      
      // Final fallback
      return {
        symbol: symbol.toUpperCase(),
        name: `${symbol.toUpperCase()} Corporation`,
        type: 'Stock',
        source: 'Yahoo Finance'
      }
    } catch (error) {
      console.warn(`Failed to get stock info for ${symbol}:`, error.message)
      return {
        symbol: symbol.toUpperCase(),
        name: `${symbol.toUpperCase()} Corporation`,
        type: 'Stock',
        source: 'Yahoo Finance'
      }
    }
  }
  
  // Get current price using Yahoo Finance
  const getCurrentPrice = async (symbol) => {
    try {
      return await yahooFinanceSearch.getCurrentPrice(symbol)
    } catch (error) {
      throw new Error(`Failed to get current price: ${error.message}`)
    }
  }
  
  // Get detailed stock information
  const getStockDetails = async (symbols) => {
    try {
      return await yahooFinanceSearch.getStockDetails(symbols)
    } catch (error) {
      throw new Error(`Failed to get stock details: ${error.message}`)
    }
  }
  
  // Clear cache (useful for refresh)
  const clearCache = () => {
    yahooFinanceSearch.clearCache()
  }
  
  // Get service statistics
  const getSearchStats = () => {
    return yahooFinanceSearch.getStats()
  }
  
  // Computed properties
  const hasResults = computed(() => searchResults.value.length > 0)
  const hasError = computed(() => !!searchError.value)
  const currentSelection = computed(() => {
    if (selectedIndex.value >= 0 && selectedIndex.value < searchResults.value.length) {
      return searchResults.value[selectedIndex.value]
    }
    return null
  })
  
  return {
    // State
    searchResults,
    isSearching,
    searchError,
    selectedIndex,
    
    // Computed
    hasResults,
    hasError,
    currentSelection,
    
    // Methods
    searchStocks,
    handleKeyNavigation,
    selectStock,
    clearSearch,
    clearCache,
    getPopularStocks,
    validateSymbol,
    getStockInfo,
    getCurrentPrice,
    getStockDetails,
    getSearchStats
  }
}