// Updated src/stores/portfolio.js with edit functionality
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePortfolioStore = defineStore('portfolio', () => {
  const positions = ref([])
  const loading = ref(false)

  const totalValue = computed(() =>
    positions.value.reduce((sum, pos) => sum + pos.shares * pos.currentPrice, 0)
  )

  const totalCost = computed(() =>
    positions.value.reduce((sum, pos) => sum + pos.shares * pos.purchasePrice, 0)
  )

  const totalGainLoss = computed(() => totalValue.value - totalCost.value)

  const totalGainLossPercent = computed(() =>
    totalCost.value > 0 ? (totalGainLoss.value / totalCost.value) * 100 : 0
  )

  const positionCount = computed(() => positions.value.length)

  const addPosition = (position) => {
    const newPosition = {
      id: Date.now(),
      ...position,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    positions.value.push(newPosition)
    saveToStorage()
  }

  const updatePosition = (id, updates) => {
    const index = positions.value.findIndex(pos => pos.id === id)
    if (index !== -1) {
      positions.value[index] = {
        ...positions.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }
      saveToStorage()
      return true
    }
    return false
  }

  const deletePosition = (id) => {
    positions.value = positions.value.filter(pos => pos.id !== id)
    saveToStorage()
  }

  const getPositionById = (id) => {
    return positions.value.find(pos => pos.id === id)
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem('positions', JSON.stringify(positions.value))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
  }

  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem('positions')
      if (saved) {
        positions.value = JSON.parse(saved)
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error)
      positions.value = []
    }
  }

  const exportPositions = () => {
    return JSON.stringify(positions.value, null, 2)
  }

  const importPositions = (newPositions) => {
    if (Array.isArray(newPositions)) {
      positions.value = newPositions.map(pos => ({
        ...pos,
        id: pos.id || Date.now() + Math.random(),
        updatedAt: new Date().toISOString()
      }))
      saveToStorage()
      return true
    }
    return false
  }

  const clearAllPositions = () => {
    if (confirm('Are you sure you want to delete all positions? This cannot be undone.')) {
      positions.value = []
      saveToStorage()
      return true
    }
    return false
  }

  const calculateGainLoss = (position) => {
    const gainLoss = (position.currentPrice - position.purchasePrice) * position.shares
    const percentage = ((position.currentPrice - position.purchasePrice) / position.purchasePrice) * 100
    return { gainLoss, percentage }
  }

  const getTopPerformers = (limit = 5) => {
    return [...positions.value]
      .map(pos => ({
        ...pos,
        ...calculateGainLoss(pos)
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, limit)
  }

  const getWorstPerformers = (limit = 5) => {
    return [...positions.value]
      .map(pos => ({
        ...pos,
        ...calculateGainLoss(pos)
      }))
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, limit)
  }

  const getPositionsBySymbol = (symbol) => {
    return positions.value.filter(pos => 
      pos.symbol.toLowerCase().includes(symbol.toLowerCase())
    )
  }

  const validatePosition = (position) => {
    const required = ['symbol', 'name', 'shares', 'purchasePrice', 'currentPrice', 'purchaseDate']
    const missing = required.filter(field => !position[field])
    
    if (missing.length > 0) {
      return { valid: false, errors: missing }
    }

    if (position.shares <= 0) {
      return { valid: false, errors: ['shares must be greater than 0'] }
    }

    if (position.purchasePrice <= 0 || position.currentPrice <= 0) {
      return { valid: false, errors: ['prices must be greater than 0'] }
    }

    return { valid: true, errors: [] }
  }

  // Load data on store creation
  loadFromStorage()

  return {
    // State
    positions,
    loading,
    
    // Getters
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
    positionCount,
    
    // Actions
    addPosition,
    updatePosition,
    deletePosition,
    getPositionById,
    exportPositions,
    importPositions,
    clearAllPositions,
    calculateGainLoss,
    getTopPerformers,
    getWorstPerformers,
    getPositionsBySymbol,
    validatePosition
  }
})