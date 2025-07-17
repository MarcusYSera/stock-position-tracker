<!-- Enhanced PositionForm.vue with Smart Stock Autocomplete -->
<template>
  <div class="position-form">
    <h3 class="form-title">Add New Position</h3>
    <div class="form-grid">
      <!-- Stock Symbol with Autocomplete -->
      <div class="form-group form-group--symbol">
        <label class="form-label">
          Stock Symbol *
          <span class="help-text">Start typing to search...</span>
        </label>
        <StockAutocompleteInput
          v-model="formData.symbol"
          placeholder="Search stocks... (e.g., AAPL, Apple, Microsoft)"
          :validate-on-input="true"
          @stock-selected="handleStockSelected"
          @validation-change="handleSymbolValidation"
        />
      </div>
      
      <!-- Company Name with Smart Suggestions -->
      <div class="form-group form-group--name">
        <label class="form-label">
          Company Name *
          <span v-if="isSymbolValid" class="auto-filled">Auto-filled</span>
        </label>
        <div class="name-input-container">
          <input 
            v-model="formData.name" 
            type="text" 
            class="form-input"
            :class="{ 'auto-filled': isAutoFilled }"
            placeholder="e.g., Apple Inc."
            required
            :disabled="loading"
          >
          <button
            v-if="formData.symbol && !formData.name"
            @click="fetchCompanyName"
            type="button"
            class="fetch-name-btn"
            :disabled="isFetchingName"
          >
            <Search v-if="!isFetchingName" class="btn-icon" />
            <div v-else class="loading-spinner"></div>
            Fetch Name
          </button>
        </div>
      </div>
      
      <!-- Shares -->
      <div class="form-group">
        <label class="form-label">Number of Shares *</label>
        <input 
          v-model="formData.shares" 
          type="number" 
          step="0.01"
          class="form-input" 
          placeholder="100"
          required
          :disabled="loading"
        >
      </div>
      
      <!-- Purchase Price -->
      <div class="form-group">
        <label class="form-label">Purchase Price *</label>
        <div class="price-input-container">
          <span class="currency-symbol">$</span>
          <input 
            v-model="formData.purchasePrice" 
            type="number" 
            step="0.01"
            class="form-input price-input" 
            placeholder="150.00"
            required
            :disabled="loading"
          >
        </div>
      </div>
      
      <!-- Current Price with Auto-fetch -->
      <div class="form-group">
        <label class="form-label">
          Current Price *
          <button
            v-if="formData.symbol && isSymbolValid"
            @click="fetchCurrentPrice"
            type="button"
            class="fetch-price-btn"
            :disabled="isFetchingPrice"
          >
            <RefreshCw v-if="!isFetchingPrice" class="btn-icon" />
            <div v-else class="loading-spinner"></div>
            Get Live Price
          </button>
        </label>
        <div class="price-input-container">
          <span class="currency-symbol">$</span>
          <input 
            v-model="formData.currentPrice" 
            type="number" 
            step="0.01"
            class="form-input price-input"
            :class="{ 'live-price': hasLivePrice }"
            placeholder="155.00"
            required
            :disabled="loading"
          >
          <div v-if="priceSource" class="price-source">
            via {{ priceSource }}
          </div>
        </div>
      </div>
      
      <!-- Purchase Date -->
      <div class="form-group">
        <label class="form-label">Purchase Date *</label>
        <input 
          v-model="formData.purchaseDate" 
          type="date" 
          class="form-input"
          required
          :disabled="loading"
        >
      </div>
      
      <!-- Target Price -->
      <div class="form-group">
        <label class="form-label">Target Price (Optional)</label>
        <div class="price-input-container">
          <span class="currency-symbol">$</span>
          <input 
            v-model="formData.targetPrice" 
            type="number" 
            step="0.01"
            class="form-input price-input" 
            placeholder="200.00"
            :disabled="loading"
          >
        </div>
      </div>
    </div>

    <!-- Position Preview -->
    <div v-if="showPreview" class="position-preview">
      <h4 class="preview-title">Position Preview</h4>
      <div class="preview-grid">
        <div class="preview-item">
          <span class="preview-label">Stock:</span>
          <span class="preview-value">{{ formData.symbol }} - {{ formData.name }}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">Investment:</span>
          <span class="preview-value">{{ formatCurrency(totalInvestment) }}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">Current Value:</span>
          <span class="preview-value">{{ formatCurrency(currentValue) }}</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">Gain/Loss:</span>
          <span class="preview-value" :class="gainLossClass">
            {{ formatCurrency(gainLoss) }} ({{ gainLossPercent.toFixed(2) }}%)
          </span>
        </div>
      </div>
    </div>

    <!-- Form Actions -->
    <div class="form-actions">
      <button 
        @click="handleSubmit" 
        class="btn btn--primary"
        :disabled="loading || !isFormValid"
      >
        <div v-if="loading" class="loading-spinner"></div>
        <Plus v-else class="btn-icon" />
        {{ loading ? 'Adding Position...' : 'Add Position' }}
      </button>
      <button 
        @click="$emit('close')" 
        class="btn btn--secondary"
        :disabled="loading"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, watch } from 'vue'
import { Plus, Search, RefreshCw } from 'lucide-vue-next'
import { usePortfolioStore } from '@/stores/portfolio'
import { useStockSearch } from '@/composables/useStockSearch'
import { useFormatters } from '@/composables/useFormatters'
import StockAutocompleteInput from './StockAutocompleteInput.vue'

export default {
  name: 'PositionForm',
  components: {
    Plus,
    Search,
    RefreshCw,
    StockAutocompleteInput
  },
  emits: ['close'],
  setup(props, { emit }) {
    const portfolioStore = usePortfolioStore()
    const stockSearch = useStockSearch()
    const { formatCurrency } = useFormatters()
    
    const loading = ref(false)
    const isFetchingName = ref(false)
    const isFetchingPrice = ref(false)
    const isSymbolValid = ref(false)
    const isAutoFilled = ref(false)
    const hasLivePrice = ref(false)
    const priceSource = ref('')

    const formData = reactive({
      symbol: '',
      name: '',
      shares: '',
      purchasePrice: '',
      currentPrice: '',
      purchaseDate: '',
      targetPrice: ''
    })

    // Computed properties
    const isFormValid = computed(() => {
      return formData.symbol && 
             formData.name && 
             formData.shares && 
             formData.purchasePrice && 
             formData.currentPrice && 
             formData.purchaseDate &&
             isSymbolValid.value
    })

    const showPreview = computed(() => {
      return formData.symbol && 
             formData.name && 
             formData.shares && 
             formData.purchasePrice && 
             formData.currentPrice
    })

    const totalInvestment = computed(() => {
      const shares = parseFloat(formData.shares) || 0
      const price = parseFloat(formData.purchasePrice) || 0
      return shares * price
    })

    const currentValue = computed(() => {
      const shares = parseFloat(formData.shares) || 0
      const price = parseFloat(formData.currentPrice) || 0
      return shares * price
    })

    const gainLoss = computed(() => currentValue.value - totalInvestment.value)

    const gainLossPercent = computed(() => {
      if (totalInvestment.value === 0) return 0
      return (gainLoss.value / totalInvestment.value) * 100
    })

    const gainLossClass = computed(() => ({
      'gain-positive': gainLoss.value >= 0,
      'gain-negative': gainLoss.value < 0
    }))

    // Handle stock selection from autocomplete
    const handleStockSelected = (stock) => {
      formData.symbol = stock.symbol
      formData.name = stock.name
      isAutoFilled.value = true
      
      // Auto-fetch current price when stock is selected
      if (stock.symbol) {
        fetchCurrentPrice()
      }
    }

    // Handle symbol validation
    const handleSymbolValidation = (validation) => {
      isSymbolValid.value = validation.valid === true
      
      if (validation.valid && formData.symbol && !formData.name) {
        fetchCompanyName()
      }
    }

    // Fetch company name for symbol using Yahoo Finance
    const fetchCompanyName = async () => {
      if (!formData.symbol || isFetchingName.value) return

      isFetchingName.value = true
      
      try {
        const stockInfo = await stockSearch.getStockInfo(formData.symbol)
        
        if (stockInfo && stockInfo.name) {
          formData.name = stockInfo.name
          isAutoFilled.value = true
        } else {
          // Fallback to a basic name
          formData.name = `${formData.symbol.toUpperCase()} Corporation`
        }
      } catch (error) {
        console.warn('Failed to fetch company name:', error)
        formData.name = `${formData.symbol.toUpperCase()} Corporation`
      } finally {
        isFetchingName.value = false
      }
    }

    // Fetch current price using Yahoo Finance
    const fetchCurrentPrice = async () => {
      if (!formData.symbol || isFetchingPrice.value) return

      isFetchingPrice.value = true
      hasLivePrice.value = false
      priceSource.value = ''
      
      try {
        console.log(`📊 Fetching live price for ${formData.symbol} from Yahoo Finance`)
        const priceData = await stockSearch.getCurrentPrice(formData.symbol)
        
        if (priceData && priceData.price) {
          formData.currentPrice = priceData.price.toString()
          hasLivePrice.value = true
          priceSource.value = priceData.source || 'Yahoo Finance'
          console.log(`✅ Got price ${priceData.price} for ${formData.symbol}`)
        } else {
          throw new Error('No price data received')
        }
      } catch (error) {
        console.warn('Failed to fetch current price:', error)
        alert(`Failed to fetch current price for ${formData.symbol}. Please enter manually.\n\nError: ${error.message}`)
      } finally {
        isFetchingPrice.value = false
      }
    }

    // Watch symbol changes to clear auto-filled state
    watch(() => formData.symbol, (newSymbol, oldSymbol) => {
      if (newSymbol !== oldSymbol) {
        isAutoFilled.value = false
        hasLivePrice.value = false
        priceSource.value = ''
      }
    })

    // Handle form submission
    const handleSubmit = async () => {
      if (!isFormValid.value) {
        alert('Please fill in all required fields with valid data')
        return
      }

      loading.value = true

      try {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500))

        const positionData = {
          symbol: formData.symbol.toUpperCase(),
          name: formData.name,
          shares: parseFloat(formData.shares),
          purchasePrice: parseFloat(formData.purchasePrice),
          currentPrice: parseFloat(formData.currentPrice),
          purchaseDate: formData.purchaseDate,
          targetPrice: formData.targetPrice ? parseFloat(formData.targetPrice) : null
        }

        portfolioStore.addPosition(positionData)
        emit('close')
      } catch (error) {
        console.error('Error saving position:', error)
        alert('Error saving position. Please try again.')
      } finally {
        loading.value = false
      }
    }

    return {
      formData,
      loading,
      isFetchingName,
      isFetchingPrice,
      isSymbolValid,
      isAutoFilled,
      hasLivePrice,
      priceSource,
      isFormValid,
      showPreview,
      totalInvestment,
      currentValue,
      gainLoss,
      gainLossPercent,
      gainLossClass,
      handleStockSelected,
      handleSymbolValidation,
      fetchCompanyName,
      fetchCurrentPrice,
      handleSubmit,
      formatCurrency
    }
  }
}
</script>

<style lang="scss" scoped>
.position-form {
  margin-top: $spacing-lg;
  padding: $spacing-lg;
  border: 1px solid $gray-200;
  border-radius: $radius;
  background: $gray-50;
}

.form-title {
  margin-bottom: $spacing-lg;
  color: $gray-900;
  font-size: $font-size-lg;
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: $spacing-md;
  margin-bottom: $spacing-lg;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.form-group {
  &--symbol,
  &--name {
    @include mobile {
      grid-column: 1;
    }
  }

  .form-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-xs;
    font-size: $font-size-sm;
    font-weight: 500;
    color: $gray-700;

    .help-text {
      font-size: $font-size-xs;
      color: $gray-500;
      font-weight: 400;
    }

    .auto-filled {
      font-size: $font-size-xs;
      color: $success;
      font-weight: 600;
    }
  }

  .form-input {
    width: 100%;
    padding: $spacing-sm $spacing-md;
    border: 1px solid $gray-300;
    border-radius: $radius;
    font-size: $font-size-sm;
    transition: border-color 0.2s ease;

    &:focus {
      outline: none;
      border-color: $primary;
      box-shadow: 0 0 0 3px rgba($primary, 0.1);
    }

    &.auto-filled {
      background: rgba($success, 0.05);
      border-color: $success;
    }

    &.live-price {
      background: rgba($primary, 0.05);
      border-color: $primary;
    }

    &:disabled {
      background: $gray-100;
      color: $gray-500;
      cursor: not-allowed;
    }
  }
}

.name-input-container {
  display: flex;
  gap: $spacing-sm;
  align-items: stretch;

  .form-input {
    flex: 1;
  }
}

.price-input-container {
  position: relative;
  display: flex;
  align-items: center;

  .currency-symbol {
    position: absolute;
    left: $spacing-sm;
    color: $gray-500;
    font-weight: 500;
    z-index: 1;
  }

  .price-input {
    padding-left: 1.75rem;
  }

  .price-source {
    position: absolute;
    right: $spacing-sm;
    font-size: $font-size-xs;
    color: $gray-500;
    background: $white;
    padding: 0 $spacing-xs;
  }
}

.fetch-name-btn,
.fetch-price-btn {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  padding: $spacing-xs $spacing-sm;
  background: $primary;
  color: $white;
  border: none;
  border-radius: $radius;
  font-size: $font-size-xs;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: $primary-hover;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-icon {
    width: 0.875rem;
    height: 0.875rem;
  }
}

.fetch-price-btn {
  background: none;
  color: $primary;
  border: 1px solid $primary;
  margin-left: $spacing-xs;

  &:hover:not(:disabled) {
    background: $primary;
    color: $white;
  }
}

.position-preview {
  background: $white;
  border: 1px solid $gray-200;
  border-radius: $radius;
  padding: $spacing-md;
  margin-bottom: $spacing-lg;

  .preview-title {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $gray-700;
    margin-bottom: $spacing-sm;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .preview-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: $spacing-sm;

    @include mobile {
      grid-template-columns: 1fr;
    }
  }

  .preview-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-xs 0;
  }

  .preview-label {
    font-size: $font-size-sm;
    color: $gray-600;
  }

  .preview-value {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $gray-900;

    &.gain-positive {
      color: $success;
    }

    &.gain-negative {
      color: $danger;
    }
  }
}

.form-actions {
  display: flex;
  gap: $spacing-sm;
  justify-content: flex-end;

  @include mobile {
    flex-direction: column;
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: $spacing-xs;
  padding: $spacing-sm $spacing-md;
  border: none;
  border-radius: $radius;
  font-size: $font-size-sm;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--primary {
    background: $primary;
    color: $white;

    &:hover:not(:disabled) {
      background: $primary-hover;
    }
  }

  &--secondary {
    background: $white;
    color: $gray-700;
    border: 1px solid $gray-300;

    &:hover:not(:disabled) {
      background: $gray-50;
    }
  }

  .btn-icon {
    width: 1rem;
    height: 1rem;
  }
}

.loading-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba($white, 0.3);
  border-radius: 50%;
  border-top-color: currentColor;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>