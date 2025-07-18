<!-- Enhanced PositionForm.vue with Smart Stock Autocomplete -->
<template>
  <div class="position-form">
    <div class="form-header">
      <h2>Add New Position</h2>
      <button @click="$emit('close')" class="close-button">
        <X class="close-icon" />
      </button>
    </div>

    <!-- Success/Error Messages -->
    <div v-if="successMessage" class="message success-message">
      <CheckCircle class="message-icon" />
      {{ successMessage }}
    </div>

    <div v-if="errorMessage" class="message error-message">
      <AlertCircle class="message-icon" />
      {{ errorMessage }}
    </div>

    <div v-if="warningMessage" class="message warning-message">
      <AlertTriangle class="message-icon" />
      {{ warningMessage }}
    </div>

    <form @submit.prevent="handleSubmit" class="form">
      <!-- Stock Symbol Input -->
      <div class="form-group">
        <label for="symbol" class="form-label required">Stock Symbol</label>
        <StockAutocompleteInput v-model="formData.symbol" placeholder="e.g., AAPL, GOOGL, MSFT"
          :validate-on-input="true" @stock-selected="onStockSelected" @validation-change="onValidationChange" />
        <div v-if="symbolValidation.message" :class="['validation-message', symbolValidation.class]">
          {{ symbolValidation.message }}
        </div>
      </div>

      <!-- Company Name Input -->
      <div class="form-group">
        <label for="name" class="form-label required">Company Name</label>
        <div class="input-with-button">
          <input id="name" v-model="formData.name" type="text" placeholder="e.g., Apple Inc." class="form-input"
            :class="{ 'auto-filled': isAutoFilled }" required />
          <button type="button" @click="fetchCompanyName" :disabled="!formData.symbol || isFetchingName"
            class="fetch-button">
            <Loader v-if="isFetchingName" class="button-icon spinning" />
            <Building v-else class="button-icon" />
            Fetch Name
          </button>
        </div>
        <div v-if="isAutoFilled" class="auto-fill-notice">
          <Info class="info-icon" />
          Auto-filled from stock data
        </div>
      </div>

      <!-- Number of Shares -->
      <div class="form-group">
        <label for="shares" class="form-label required">Number of Shares</label>
        <input id="shares" v-model.number="formData.shares" type="number" step="0.001" min="0.001" placeholder="100"
          class="form-input" required />
      </div>

      <!-- Purchase Price -->
      <div class="form-group">
        <label for="purchasePrice" class="form-label required">Purchase Price</label>
        <div class="currency-input">
          <span class="currency-symbol">$</span>
          <input id="purchasePrice" v-model.number="formData.purchasePrice" type="number" step="0.01" min="0.01"
            placeholder="150.00" class="form-input currency-input-field" required />
        </div>
      </div>

      <!-- Current Price -->
      <div class="form-group">
        <label for="currentPrice" class="form-label required">Current Price</label>
        <div class="input-with-button">
          <div class="currency-input">
            <span class="currency-symbol">$</span>
            <input id="currentPrice" v-model.number="formData.currentPrice" type="number" step="0.01" min="0.01"
              placeholder="155.00" class="form-input currency-input-field" :class="{ 'live-price': hasLivePrice }"
              required />
          </div>
          <button type="button" @click="fetchCurrentPrice" :disabled="!formData.symbol || isFetchingPrice"
            class="fetch-button">
            <Loader v-if="isFetchingPrice" class="button-icon spinning" />
            <DollarSign v-else class="button-icon" />
            Fetch Price
          </button>
        </div>
        <div v-if="hasLivePrice && priceSource" class="live-price-notice">
          <TrendingUp class="info-icon" />
          Live price from {{ priceSource }}
        </div>
      </div>

      <!-- Purchase Date -->
      <div class="form-group">
        <label for="purchaseDate" class="form-label required">Purchase Date</label>
        <input id="purchaseDate" v-model="formData.purchaseDate" type="date" class="form-input" :max="today" required />
      </div>

      <!-- Target Price (Optional) -->
      <div class="form-group">
        <label for="targetPrice" class="form-label">Target Price (Optional)</label>
        <div class="currency-input">
          <span class="currency-symbol">$</span>
          <input id="targetPrice" v-model.number="formData.targetPrice" type="number" step="0.01" min="0.01"
            placeholder="200.00" class="form-input currency-input-field" />
        </div>
      </div>

      <!-- Position Summary -->
      <div v-if="positionSummary.isValid" class="position-summary">
        <h3>Position Summary</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Total Investment:</span>
            <span class="summary-value">${{ positionSummary.totalInvestment }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Current Value:</span>
            <span class="summary-value">${{ positionSummary.currentValue }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Gain/Loss:</span>
            <span :class="['summary-value', positionSummary.gainLossClass]">
              ${{ positionSummary.gainLoss }} ({{ positionSummary.gainLossPercent }}%)
            </span>
          </div>
        </div>
      </div>

      <!-- Form Actions -->
      <div class="form-actions">
        <button type="button" @click="$emit('close')" class="btn btn-secondary">
          Cancel
        </button>
        <button type="submit" :disabled="!isFormValid || loading" class="btn btn-primary">
          <Loader v-if="loading" class="button-icon spinning" />
          <Plus v-else class="button-icon" />
          Add Position
        </button>
      </div>
    </form>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue'
import {
  X,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader,
  Building,
  DollarSign,
  TrendingUp,
  Info,
  Plus
} from 'lucide-vue-next'
import StockAutocompleteInput from './StockAutocompleteInput.vue'
import { useStockSearch } from '@/composables/useStockSearch'
import { usePortfolioStore } from '@/stores/portfolio'

export default {
  name: 'PositionForm',
  components: {
    X,
    CheckCircle,
    AlertCircle,
    AlertTriangle,
    Loader,
    Building,
    DollarSign,
    TrendingUp,
    Info,
    Plus,
    StockAutocompleteInput
  },
  emits: ['close', 'position-added'],
  setup(props, { emit }) {
    // Composables
    const stockSearch = useStockSearch()
    const portfolioStore = usePortfolioStore()

    // Form data
    const formData = ref({
      symbol: '',
      name: '',
      shares: null,
      purchasePrice: null,
      currentPrice: null,
      purchaseDate: '',
      targetPrice: null
    })

    // UI state
    const loading = ref(false)
    const isFetchingName = ref(false)
    const isFetchingPrice = ref(false)
    const isAutoFilled = ref(false)
    const hasLivePrice = ref(false)
    const priceSource = ref('')

    // Messages
    const successMessage = ref('')
    const errorMessage = ref('')
    const warningMessage = ref('')

    // Validation
    const symbolValidation = ref({
      message: '',
      class: ''
    })

    // Today's date for max date validation
    const today = computed(() => {
      return new Date().toISOString().split('T')[0]
    })

    // Position summary calculations
    const positionSummary = computed(() => {
      const shares = parseFloat(formData.value.shares) || 0
      const purchasePrice = parseFloat(formData.value.purchasePrice) || 0
      const currentPrice = parseFloat(formData.value.currentPrice) || 0

      if (shares > 0 && purchasePrice > 0 && currentPrice > 0) {
        const totalInvestment = shares * purchasePrice
        const currentValue = shares * currentPrice
        const gainLoss = currentValue - totalInvestment
        const gainLossPercent = ((gainLoss / totalInvestment) * 100)

        return {
          isValid: true,
          totalInvestment: totalInvestment.toFixed(2),
          currentValue: currentValue.toFixed(2),
          gainLoss: gainLoss.toFixed(2),
          gainLossPercent: gainLossPercent.toFixed(2),
          gainLossClass: gainLoss >= 0 ? 'positive' : 'negative'
        }
      }

      return { isValid: false }
    })

    // Form validation
    const isFormValid = computed(() => {
      return formData.value.symbol &&
        formData.value.name &&
        formData.value.shares > 0 &&
        formData.value.purchasePrice > 0 &&
        formData.value.currentPrice > 0 &&
        formData.value.purchaseDate
    })

    // Message helpers
    const showSuccessMessage = (message) => {
      successMessage.value = message
      errorMessage.value = ''
      warningMessage.value = ''
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    }

    const showErrorMessage = (message) => {
      errorMessage.value = message
      successMessage.value = ''
      warningMessage.value = ''
    }

    const showWarningMessage = (message) => {
      warningMessage.value = message
      successMessage.value = ''
      errorMessage.value = ''
      setTimeout(() => {
        warningMessage.value = ''
      }, 3000)
    }

    const clearMessages = () => {
      successMessage.value = ''
      errorMessage.value = ''
      warningMessage.value = ''
    }

    // Enhanced fetchCurrentPrice method
    const fetchCurrentPrice = async () => {
      if (!formData.value.symbol || isFetchingPrice.value) return

      isFetchingPrice.value = true
      hasLivePrice.value = false
      priceSource.value = ''
      clearMessages()

      try {
        console.log(`📊 Fetching live price for ${formData.value.symbol} from Yahoo Finance`)

        const priceData = await stockSearch.getCurrentPrice(formData.value.symbol)

        if (priceData && priceData.price && priceData.price > 0) {
          formData.value.currentPrice = priceData.price
          hasLivePrice.value = true
          priceSource.value = priceData.source || 'Yahoo Finance'

          console.log(`✅ Got price $${priceData.price} for ${formData.value.symbol}`)
          showSuccessMessage(`✅ Current price: $${priceData.price}`)

        } else {
          throw new Error('No valid price data received')
        }
      } catch (error) {
        console.warn('Failed to fetch current price:', error.message)

        let userMessage = `Unable to fetch current price for ${formData.value.symbol}.`

        if (error.message.includes('not found') || error.message.includes('verify the symbol')) {
          userMessage += ' Please verify the symbol is correct.'
        } else if (error.message.includes('delisted') || error.message.includes('no longer trading')) {
          userMessage += ' This stock may be delisted or no longer trading.'
        } else if (error.message.includes('market is closed') || error.message.includes('data unavailable')) {
          userMessage += ' Markets may be closed or data temporarily unavailable.'
        } else if (error.message.includes('connection') || error.message.includes('service')) {
          userMessage += ' There\'s a connection issue with the price service.'
        } else {
          userMessage += ' Please enter the price manually.'
        }

        showErrorMessage(userMessage)
        hasLivePrice.value = false
        priceSource.value = ''

      } finally {
        isFetchingPrice.value = false
      }
    }

    // Enhanced fetchCompanyName method
    const fetchCompanyName = async () => {
      if (!formData.value.symbol || isFetchingName.value) return

      isFetchingName.value = true
      clearMessages()

      try {
        console.log(`🏢 Fetching company name for ${formData.value.symbol}`)

        const stockInfo = await stockSearch.getStockInfo(formData.value.symbol)

        if (stockInfo && stockInfo.name) {
          formData.value.name = stockInfo.name
          isAutoFilled.value = true
          console.log(`✅ Found company name: ${stockInfo.name} for ${formData.value.symbol}`)
          showSuccessMessage(`✅ Company: ${stockInfo.name}`)
        } else {
          // Fallback to basic name format
          formData.value.name = `${formData.value.symbol.toUpperCase()} Corporation`
          console.log(`⚠️ Using fallback name for ${formData.value.symbol}`)
          showWarningMessage(`Using fallback name for ${formData.value.symbol}`)
        }
      } catch (error) {
        console.warn('Failed to fetch company name:', error.message)

        formData.value.name = `${formData.value.symbol.toUpperCase()} Corporation`
        showWarningMessage(`Could not fetch company name. Using fallback: ${formData.value.name}`)
      } finally {
        isFetchingName.value = false
      }
    }

    // Enhanced form validation
    const validateForm = () => {
      const errors = []

      if (!formData.value.symbol || formData.value.symbol.trim().length === 0) {
        errors.push('Stock symbol is required')
      }

      if (!formData.value.name || formData.value.name.trim().length === 0) {
        errors.push('Company name is required')
      }

      if (!formData.value.shares || formData.value.shares <= 0) {
        errors.push('Number of shares must be greater than 0')
      }

      if (!formData.value.purchasePrice || formData.value.purchasePrice <= 0) {
        errors.push('Purchase price must be greater than 0')
      }

      if (!formData.value.currentPrice || formData.value.currentPrice <= 0) {
        errors.push('Current price must be greater than 0')
      }

      if (!formData.value.purchaseDate) {
        errors.push('Purchase date is required')
      }

      if (errors.length > 0) {
        showErrorMessage('Please fix the following errors:\n' + errors.join('\n'))
        return false
      }

      return true
    }

    // Enhanced form submission
    const handleSubmit = async () => {
      if (!validateForm()) {
        return
      }

      loading.value = true
      clearMessages()

      try {
        // Add a small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 500))

        const positionData = {
          symbol: formData.value.symbol.toUpperCase(),
          name: formData.value.name,
          shares: parseFloat(formData.value.shares),
          purchasePrice: parseFloat(formData.value.purchasePrice),
          currentPrice: parseFloat(formData.value.currentPrice),
          purchaseDate: formData.value.purchaseDate,
          targetPrice: formData.value.targetPrice ? parseFloat(formData.value.targetPrice) : null,
          // Add metadata
          priceSource: priceSource.value,
          addedAt: new Date().toISOString(),
          hasLivePrice: hasLivePrice.value,
          id: Date.now().toString() // Simple ID generation
        }

        // Add to portfolio store
        portfolioStore.addPosition(positionData)

        showSuccessMessage(`✅ Added ${formData.value.symbol} to your portfolio!`)

        // Emit events
        emit('position-added', positionData)

        // Close form after short delay
        setTimeout(() => {
          emit('close')
        }, 1000)

      } catch (error) {
        console.error('Error saving position:', error)
        showErrorMessage('Error saving position. Please try again.')
      } finally {
        loading.value = false
      }
    }

    // Stock selection handler
    const onStockSelected = (stock) => {
      console.log('Stock selected:', stock)
      formData.value.symbol = stock.symbol
      formData.value.name = stock.name
      isAutoFilled.value = true

      // Clear previous price data
      hasLivePrice.value = false
      priceSource.value = ''
    }

    // Validation change handler
    const onValidationChange = (validation) => {
      if (validation.valid === true) {
        symbolValidation.value = {
          message: `✓ ${validation.symbol} is valid`,
          class: 'success'
        }
      } else if (validation.valid === false) {
        symbolValidation.value = {
          message: `⚠ ${validation.symbol} may not be valid`,
          class: 'warning'
        }
      } else {
        symbolValidation.value = {
          message: '',
          class: ''
        }
      }
    }

    // Watch symbol changes to clear auto-filled state
    watch(() => formData.value.symbol, (newSymbol, oldSymbol) => {
      if (newSymbol !== oldSymbol) {
        isAutoFilled.value = false
        hasLivePrice.value = false
        priceSource.value = ''
      }
    })

    return {
      formData,
      loading,
      isFetchingName,
      isFetchingPrice,
      isAutoFilled,
      hasLivePrice,
      priceSource,
      successMessage,
      errorMessage,
      warningMessage,
      symbolValidation,
      today,
      positionSummary,
      isFormValid,
      fetchCurrentPrice,
      fetchCompanyName,
      handleSubmit,
      onStockSelected,
      onValidationChange,
      showSuccessMessage,
      showErrorMessage,
      showWarningMessage
    }
  }
}
</script>

<style lang="scss" scoped>
.position-form {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;

  h2 {
    margin: 0;
    color: #1e293b;
    font-size: 24px;
    font-weight: 600;
  }
}

.close-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  color: #64748b;
  transition: all 0.2s;

  &:hover {
    background: #e2e8f0;
    color: #334155;
  }
}

.close-icon {
  width: 20px;
  height: 20px;
}

.message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 32px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;

  &.success-message {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #bbf7d0;
  }

  &.error-message {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  &.warning-message {
    background: #fefce8;
    color: #ca8a04;
    border: 1px solid #fef3c7;
  }
}

.message-icon {
  width: 16px;
  height: 16px;
}

.form {
  padding: 32px;
}

.form-group {
  margin-bottom: 24px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #374151;
  font-size: 14px;

  &.required::after {
    content: ' *';
    color: #dc2626;
  }
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &.auto-filled {
    background-color: #f0f9ff;
    border-color: #0ea5e9;
  }

  &.live-price {
    background-color: #f0fdf4;
    border-color: #22c55e;
  }
}

.input-with-button {
  display: flex;
  gap: 12px;
}

.currency-input {
  position: relative;
  flex: 1;
}

.currency-symbol {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-weight: 500;
}

.currency-input-field {
  padding-left: 32px;
}

.fetch-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f1f5f9;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: #e2e8f0;
    border-color: #cbd5e1;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.button-icon {
  width: 16px;
  height: 16px;

  &.spinning {
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.auto-fill-notice,
.live-price-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: #059669;
}

.info-icon {
  width: 14px;
  height: 14px;
}

.validation-message {
  margin-top: 6px;
  font-size: 12px;

  &.success {
    color: #059669;
  }

  &.warning {
    color: #d97706;
  }

  &.error {
    color: #dc2626;
  }
}

.position-summary {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;

  h3 {
    margin: 0 0 16px 0;
    color: #1e293b;
    font-size: 16px;
    font-weight: 600;
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-label {
  font-size: 14px;
  color: #64748b;
}

.summary-value {
  font-weight: 600;
  font-size: 14px;

  &.positive {
    color: #059669;
  }

  &.negative {
    color: #dc2626;
  }
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 24px;
  border-top: 1px solid #e2e8f0;
}

.btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.btn-secondary {
    background: #f1f5f9;
    color: #475569;

    &:hover:not(:disabled) {
      background: #e2e8f0;
    }
  }

  &.btn-primary {
    background: #3b82f6;
    color: white;

    &:hover:not(:disabled) {
      background: #2563eb;
    }
  }
}

@media (max-width: 768px) {
  .position-form {
    margin: 16px;
  }

  .form-header,
  .form {
    padding: 16px;
  }

  .input-with-button {
    flex-direction: column;
  }

  .fetch-button {
    width: 100%;
    justify-content: center;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column;
  }
}
</style>