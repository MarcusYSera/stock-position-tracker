// src/services/finnhubRateLimiter.js - Smart rate limiter for Finnhub API
class FinnhubRateLimiter {
  constructor() {
    // Finnhub limits: 60 calls per minute
    this.maxCallsPerMinute = 60
    this.safetyBuffer = 5 // Leave 5 calls as buffer
    this.effectiveLimit = this.maxCallsPerMinute - this.safetyBuffer // 55 calls/minute
    
    // Tracking
    this.callHistory = []
    this.priorityQueue = []
    this.regularQueue = []
    
    // State
    this.isProcessing = false
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      rateLimitHits: 0,
      currentWindowCalls: 0
    }
    
    // Start the processing loop
    this.startProcessing()
    
    // Clean up old calls every minute
    setInterval(() => this.cleanupOldCalls(), 60000)
  }

  // Main method to queue API calls
  async queueCall(callFunction, priority = 'normal', symbol = null) {
    return new Promise((resolve, reject) => {
      const callItem = {
        id: Date.now() + Math.random(),
        callFunction,
        symbol,
        resolve,
        reject,
        timestamp: Date.now(),
        retries: 0,
        maxRetries: 3
      }

      if (priority === 'high') {
        this.priorityQueue.push(callItem)
      } else {
        this.regularQueue.push(callItem)
      }

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue()
      }
    })
  }

  // Process the queue with intelligent timing
  async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.priorityQueue.length > 0 || this.regularQueue.length > 0) {
      // Check if we can make a call
      if (!this.canMakeCall()) {
        const waitTime = this.getWaitTime()
        console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s before next call...`)
        await this.wait(waitTime)
        continue
      }

      // Get next call (priority first)
      const nextCall = this.priorityQueue.length > 0 
        ? this.priorityQueue.shift() 
        : this.regularQueue.shift()

      if (!nextCall) break

      try {
        // Execute the API call
        const result = await this.executeCall(nextCall)
        nextCall.resolve(result)
        this.stats.successfulCalls++
      } catch (error) {
        // Handle retries
        if (nextCall.retries < nextCall.maxRetries && this.shouldRetry(error)) {
          nextCall.retries++
          console.log(`Retrying call for ${nextCall.symbol} (attempt ${nextCall.retries + 1})`)
          
          // Add back to appropriate queue
          if (nextCall.retries <= 1) {
            this.priorityQueue.unshift(nextCall) // High priority for retries
          } else {
            this.regularQueue.push(nextCall)
          }
        } else {
          nextCall.reject(error)
        }
      }

      // Smart delay between calls
      const delay = this.calculateOptimalDelay()
      if (delay > 0) {
        await this.wait(delay)
      }
    }

    this.isProcessing = false
  }

  // Execute individual API call with tracking
  async executeCall(callItem) {
    const startTime = Date.now()
    
    try {
      // Record the call
      this.recordCall()
      
      // Execute the actual API function
      const result = await callItem.callFunction()
      
      // Track successful call
      const duration = Date.now() - startTime
      console.log(`✅ API call for ${callItem.symbol || 'unknown'} completed in ${duration}ms`)
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      console.warn(`❌ API call for ${callItem.symbol || 'unknown'} failed after ${duration}ms:`, error.message)
      
      // Check if it's a rate limit error
      if (this.isRateLimitError(error)) {
        this.stats.rateLimitHits++
        console.warn('🚨 Rate limit hit! Adjusting strategy...')
      }
      
      throw error
    }
  }

  // Check if we can make a call within rate limits
  canMakeCall() {
    this.updateCurrentWindowCalls()
    return this.stats.currentWindowCalls < this.effectiveLimit
  }

  // Calculate optimal delay between calls
  calculateOptimalDelay() {
    this.updateCurrentWindowCalls()
    
    const remainingCalls = this.effectiveLimit - this.stats.currentWindowCalls
    const timeUntilReset = this.getTimeUntilWindowReset()
    
    if (remainingCalls <= 0) {
      return timeUntilReset
    }
    
    // Distribute remaining calls evenly over remaining time
    const optimalDelay = Math.max(0, timeUntilReset / remainingCalls)
    
    // Minimum delay to be respectful to the API
    const minDelay = 1000 // 1 second minimum
    
    return Math.max(minDelay, optimalDelay)
  }

  // Get time to wait before next call
  getWaitTime() {
    return this.getTimeUntilWindowReset() + 1000 // Add 1 second buffer
  }

  // Get time until the current rate limit window resets
  getTimeUntilWindowReset() {
    if (this.callHistory.length === 0) return 0
    
    const oldestCall = this.callHistory[0]
    const windowEnd = oldestCall + 60000 // 60 seconds
    const now = Date.now()
    
    return Math.max(0, windowEnd - now)
  }

  // Record a new API call
  recordCall() {
    const now = Date.now()
    this.callHistory.push(now)
    this.stats.totalCalls++
    this.updateCurrentWindowCalls()
  }

  // Update current window call count
  updateCurrentWindowCalls() {
    this.cleanupOldCalls()
    this.stats.currentWindowCalls = this.callHistory.length
  }

  // Remove calls older than 1 minute
  cleanupOldCalls() {
    const cutoff = Date.now() - 60000 // 1 minute ago
    this.callHistory = this.callHistory.filter(timestamp => timestamp > cutoff)
  }

  // Check if error is due to rate limiting
  isRateLimitError(error) {
    const message = error.message.toLowerCase()
    return message.includes('rate limit') || 
           message.includes('too many requests') ||
           error.status === 429
  }

  // Determine if we should retry a failed call
  shouldRetry(error) {
    if (this.isRateLimitError(error)) return true
    if (error.message.includes('timeout')) return true
    if (error.message.includes('network')) return true
    if (error.status >= 500) return true // Server errors
    return false
  }

  // Start the automatic processing loop
  startProcessing() {
    // Process queue every 2 seconds
    setInterval(() => {
      if (!this.isProcessing && (this.priorityQueue.length > 0 || this.regularQueue.length > 0)) {
        this.processQueue()
      }
    }, 2000)
  }

  // Utility: Wait for specified milliseconds
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Get current rate limit status
  getStatus() {
    this.updateCurrentWindowCalls()
    
    return {
      canMakeCall: this.canMakeCall(),
      currentWindowCalls: this.stats.currentWindowCalls,
      maxCalls: this.effectiveLimit,
      timeUntilReset: this.getTimeUntilWindowReset(),
      queueLength: this.priorityQueue.length + this.regularQueue.length,
      priorityQueueLength: this.priorityQueue.length,
      regularQueueLength: this.regularQueue.length,
      stats: { ...this.stats }
    }
  }

  // Get optimized update frequency based on portfolio size
  getOptimalUpdateFrequency(portfolioSize) {
    // Calculate how often we can update all positions
    const callsPerUpdate = portfolioSize
    const updatesPerWindow = Math.floor(this.effectiveLimit / callsPerUpdate)
    
    if (updatesPerWindow >= 1) {
      // Can update all positions multiple times per minute
      const optimalFrequency = Math.floor(60000 / updatesPerWindow) // milliseconds
      return Math.max(optimalFrequency, 30000) // Minimum 30 seconds between full updates
    } else {
      // Need multiple minutes to update all positions once
      const minutesNeeded = Math.ceil(callsPerUpdate / this.effectiveLimit)
      return minutesNeeded * 60000 // Convert to milliseconds
    }
  }

  // Priority methods for different types of updates
  async priorityUpdate(symbol, callFunction) {
    return this.queueCall(callFunction, 'high', symbol)
  }

  async regularUpdate(symbol, callFunction) {
    return this.queueCall(callFunction, 'normal', symbol)
  }

  // Batch update multiple symbols efficiently
  async batchUpdate(symbols, callFunction) {
    const promises = symbols.map(symbol => 
      this.queueCall(() => callFunction(symbol), 'normal', symbol)
    )
    
    return Promise.allSettled(promises)
  }

  // Reset stats (useful for monitoring)
  resetStats() {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      rateLimitHits: 0,
      currentWindowCalls: this.callHistory.length
    }
  }
}

// Export singleton instance
export const finnhubLimiter = new FinnhubRateLimiter()
export default finnhubLimiter