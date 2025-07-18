// src/composables/useStockData.js - Enhanced composable with intelligent rate limiting
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { stockApi } from '@/services/stockApi'
import { usePortfolioStore } from '@/stores/portfolio'

export function useStockData() {
  const portfolioStore = usePortfolioStore()
  
  // State
  const isUpdating = ref(false)
  const lastUpdated = ref(null)
  const updateInterval = ref(null)
  const autoUpdateEnabled = ref(false)
  const updateFrequency = ref(300000) // Will be dynamically calculated
  const errors = ref([])
  const updateQueue = ref([])
  const rateLimitStatus = ref(null)

  // Computed
  const canUpdate = computed(() => !isUpdating.value && portfolioStore.positions.length > 0)
  
  const nextUpdateTime = computed(() => {
    if (!lastUpdated.value || !autoUpdateEnabled.value) return null
    return new Date(lastUpdated.value.getTime() + updateFrequency.value)
  })

  const updateSettings = computed(() => {
    return stockApi.getOptimalUpdateSettings(portfolioStore.positions.length)
  })

  const portfolioHealth = computed(() => {
    const positions = portfolioStore.positions
    const now = Date.now()
    const staleThreshold = 5 * 60 * 1000 // 5 minutes
    
    const stalePositions = positions.filter(pos => {
      if (!pos.lastUpdated) return true
      return now - new Date(pos.lastUpdated).getTime() > staleThreshold
    })

    return {
      total: positions.length,
      stale: stalePositions.length,
      fresh: positions.length - stalePositions.length,
      healthScore: positions.length > 0 ? (1 - stalePositions.length / positions.length) * 100 : 100
    }
  })

  // Methods
  const updateSinglePosition = async (positionId, symbol, priority = 'high') => {
    try {
      console.log(`🔄 Updating ${symbol} with ${priority} priority`)
      const stockData = await stockApi.priorityUpdate(symbol)
      
      portfolioStore.updatePosition(positionId, {
        currentPrice: stockData.price,
        lastUpdated: new Date().toISOString(),
        marketData: {
          change: stockData.change,
          changePercent: stockData.changePercent,
          source: stockData.source,
          high: stockData.high,
          low: stockData.low,
          open: stockData.open,
          previousClose: stockData.previousClose
        }
      })

      return { success: true, data: stockData }
    } catch (error) {
      console.error(`Failed to update ${symbol}:`, error)
      errors.value.push(`${symbol}: ${error.message}`)
      return { success: false, error: error.message }
    }
  }

  const updateAllPositions = async (priority = 'normal') => {
    if (isUpdating.value || portfolioStore.positions.length === 0) return

    isUpdating.value = true
    errors.value = []
    const startTime = Date.now()
    
    try {
      console.log(`📊 Starting batch update of ${portfolioStore.positions.length} positions`)
      
      // Get all unique symbols
      const symbols = [...new Set(portfolioStore.positions.map(pos => pos.symbol))]
      
      // Update rate limit status
      updateRateLimitStatus()
      
      // Use intelligent batch update
      const priceResults = await stockApi.getMultiplePrices(symbols, priority)
      
      // Update each position
      let successCount = 0
      const updatePromises = portfolioStore.positions.map(async (position) => {
        const priceData = priceResults[position.symbol]
        
        if (priceData && !priceData.error) {
          const updated = portfolioStore.updatePosition(position.id, {
            currentPrice: priceData.price,
            lastUpdated: new Date().toISOString(),
            marketData: {
              change: priceData.change || 0,
              changePercent: priceData.changePercent || 0,
              source: priceData.source || 'Unknown',
              high: priceData.high || 0,
              low: priceData.low || 0,
              open: priceData.open || 0,
              previousClose: priceData.previousClose || 0
            }
          })
          
          if (updated) successCount++
          return true
        } else {
          errors.value.push(`${position.symbol}: ${priceData?.error || 'Unknown error'}`)
          return false
        }
      })

      await Promise.all(updatePromises)
      lastUpdated.value = new Date()
      
      const duration = Date.now() - startTime
      console.log(`✅ Batch update completed in ${duration}ms - ${successCount}/${portfolioStore.positions.length} successful`)
      
      // Update rate limit status after batch
      updateRateLimitStatus()
      
      return {
        success: true,
        updatedCount: successCount,
        totalCount: portfolioStore.positions.length,
        errors: errors.value,
        duration
      }
    } catch (error) {
      console.error('Failed to update positions:', error)
      errors.value.push(`Update failed: ${error.message}`)
      return { success: false, error: error.message }
    } finally {
      isUpdating.value = false
    }
  }

  const startAutoUpdate = (customFrequency = null) => {
    if (updateInterval.value) {
      clearInterval(updateInterval.value)
    }

    // Calculate optimal frequency based on portfolio size
    const settings = updateSettings.value
    updateFrequency.value = customFrequency || settings.frequency
    
    console.log(`🔄 Starting auto-update every ${Math.ceil(updateFrequency.value / 60000)} minutes`)
    console.log(`📊 ${settings.recommendation}`)
    
    if (!settings.canAutoUpdate) {
      console.warn(`⚠️ Portfolio too large (${settings.portfolioSize}) for optimal auto-updates`)
      errors.value.push('Portfolio too large for optimal auto-updates - consider manual updates')
    }

    autoUpdateEnabled.value = true
    
    updateInterval.value = setInterval(async () => {
      if (portfolioStore.positions.length > 0 && !isUpdating.value) {
        await updateAllPositions('normal')
      }
    }, updateFrequency.value)

    // Save preference
    localStorage.setItem('autoUpdateEnabled', 'true')
    localStorage.setItem('updateFrequency', updateFrequency.value.toString())

    // Initial update
    updateAllPositions('normal')
  }

  const stopAutoUpdate = () => {
    if (updateInterval.value) {
      clearInterval(updateInterval.value)
      updateInterval.value = null
    }
    autoUpdateEnabled.value = false
    localStorage.setItem('autoUpdateEnabled', 'false')
    console.log('🛑 Auto-update stopped')
  }

  const toggleAutoUpdate = () => {
    if (autoUpdateEnabled.value) {
      stopAutoUpdate()
    } else {
      startAutoUpdate()
    }
  }

  const optimizeUpdateFrequency = () => {
    const settings = updateSettings.value
    updateFrequency.value = settings.frequency
    
    if (autoUpdateEnabled.value) {
      console.log(`🔧 Optimizing update frequency to ${Math.ceil(settings.frequency / 60000)} minutes`)
      startAutoUpdate()
    }
    
    return settings
  }

  const updateRateLimitStatus = () => {
    rateLimitStatus.value = stockApi.getApiStatus()
  }

  const getStalePositions = () => {
    const now = Date.now()
    const staleThreshold = 5 * 60 * 1000 // 5 minutes
    
    return portfolioStore.positions.filter(pos => {
      if (!pos.lastUpdated) return true
      return now - new Date(pos.lastUpdated).getTime() > staleThreshold
    })
  }

  const updateStalePositions = async () => {
    const stalePositions = getStalePositions()
    if (stalePositions.length === 0) return { success: true, message: 'All positions are fresh' }

    console.log(`🔄 Updating ${stalePositions.length} stale positions`)
    
    const promises = stalePositions.map(pos => 
      updateSinglePosition(pos.id, pos.symbol, 'high')
    )
    
    const results = await Promise.allSettled(promises)
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    
    return {
      success: successful > 0,
      updated: successful,
      total: stalePositions.length,
      message: `Updated ${successful}/${stalePositions.length} stale positions`
    }
  }

  const searchStocks = async (query) => {
    if (!query || query.length < 1) return []
    
    try {
      return await stockApi.searchSymbol(query)
    } catch (error) {
      console.error('Stock search failed:', error)
      return []
    }
  }

  const validateSymbol = async (symbol) => {
    try {
      const price = await stockApi.getCurrentPrice(symbol)
      return price.source !== 'Mock Data'
    } catch (error) {
      console.error('Symbol validation failed:', error)
      return false
    }
  }

  const getMarketStatus = () => {
    const now = new Date()
    const day = now.getDay() // 0 = Sunday, 6 = Saturday
    const hour = now.getHours()
    const minutes = now.getMinutes()
    const currentTime = hour * 60 + minutes

    // Weekend
    if (day === 0 || day === 6) {
      return { isOpen: false, status: 'Market Closed - Weekend', color: 'gray' }
    }

    // Market hours: 9:30 AM - 4:00 PM EST
    const marketOpen = 9 * 60 + 30 // 9:30 AM
    const marketClose = 16 * 60 // 4:00 PM

    if (currentTime >= marketOpen && currentTime <= marketClose) {
      return { isOpen: true, status: 'Market Open', color: 'green' }
    } else if (currentTime < marketOpen) {
      return { isOpen: false, status: 'Pre-Market', color: 'yellow' }
    } else {
      return { isOpen: false, status: 'After Hours', color: 'orange' }
    }
  }

  const formatLastUpdated = () => {
    if (!lastUpdated.value) return 'Never'
    
    const now = new Date()
    const diff = now - lastUpdated.value
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'Just now'
    if (minutes === 1) return '1 minute ago'
    if (minutes < 60) return `${minutes} minutes ago`
    
    const hours = Math.floor(minutes / 60)
    if (hours === 1) return '1 hour ago'
    if (hours < 24) return `${hours} hours ago`
    
    return lastUpdated.value.toLocaleDateString()
  }

  const getUpdateStats = () => {
    const apiStatus = stockApi.getApiStatus()
    const settings = updateSettings.value
    const health = portfolioHealth.value
    
    return {
      api: apiStatus,
      settings,
      health,
      rateLimits: rateLimitStatus.value?.finnhub?.rateLimiter || null,
      autoUpdate: {
        enabled: autoUpdateEnabled.value,
        frequency: updateFrequency.value,
        nextUpdate: nextUpdateTime.value
      }
    }
  }

  const exportMarketData = () => {
    const data = portfolioStore.positions.map(position => ({
      symbol: position.symbol,
      name: position.name,
      currentPrice: position.currentPrice,
      lastUpdated: position.lastUpdated,
      marketData: position.marketData,
      gainLoss: portfolioStore.calculateGainLoss(position)
    }))

    return {
      positions: data,
      summary: {
        totalValue: portfolioStore.totalValue,
        totalCost: portfolioStore.totalCost,
        totalGainLoss: portfolioStore.totalGainLoss,
        totalGainLossPercent: portfolioStore.totalGainLossPercent
      },
      metadata: {
        lastUpdated: lastUpdated.value,
        marketStatus: getMarketStatus(),
        updateStats: getUpdateStats(),
        portfolioHealth: portfolioHealth.value
      }
    }
  }

  const clearAllErrors = () => {
    errors.value = []
  }

  const forceRefreshAll = async () => {
    console.log('🔄 Force refreshing all positions with high priority')
    stockApi.clearCache() // Clear cache to force fresh data
    return await updateAllPositions('high')
  }

  // Watch for portfolio size changes to optimize frequency
  watch(() => portfolioStore.positions.length, (newSize, oldSize) => {
    if (newSize !== oldSize && autoUpdateEnabled.value) {
      console.log(`📊 Portfolio size changed from ${oldSize} to ${newSize} - optimizing update frequency`)
      optimizeUpdateFrequency()
    }
  })

  // Lifecycle
  onMounted(() => {
    // Load saved preferences
    const savedAutoUpdate = localStorage.getItem('autoUpdateEnabled')
    const savedFrequency = localStorage.getItem('updateFrequency')
    
    if (savedFrequency) {
      updateFrequency.value = parseInt(savedFrequency)
    }
    
    if (savedAutoUpdate === 'true' && portfolioStore.positions.length > 0) {
      startAutoUpdate()
    }
    
    // Update rate limit status
    updateRateLimitStatus()
    
    // Update rate limit status every 30 seconds
    const statusInterval = setInterval(updateRateLimitStatus, 30000)
    
    onUnmounted(() => {
      clearInterval(statusInterval)
    })
  })

  onUnmounted(() => {
    stopAutoUpdate()
  })

  return {
    // State
    isUpdating,
    lastUpdated,
    autoUpdateEnabled,
    updateFrequency,
    errors,
    updateQueue,
    rateLimitStatus,
    
    // Computed
    canUpdate,
    nextUpdateTime,
    updateSettings,
    portfolioHealth,
    
    // Methods
    updateSinglePosition,
    updateAllPositions,
    startAutoUpdate,
    stopAutoUpdate,
    toggleAutoUpdate,
    optimizeUpdateFrequency,
    updateStalePositions,
    searchStocks,
    validateSymbol,
    getMarketStatus,
    formatLastUpdated,
    getUpdateStats,
    exportMarketData,
    clearAllErrors,
    forceRefreshAll,
    getStalePositions
  }
}