<template>
  <div ref="containerRef" class="stock-autocomplete">
    <div class="input-container">
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
        class="stock-input"
        autocomplete="off"
        spellcheck="false"
      />
      
      <!-- Clear button -->
      <button
        v-if="inputValue && inputValue.length > 0"
        @click="clearInput"
        type="button"
        class="clear-button"
        :disabled="disabled"
      >
        <X class="clear-icon" />
      </button>
      
      <!-- Loading indicator -->
      <div v-if="isSearching" class="loading-indicator">
        <div class="spinner"></div>
      </div>
    </div>

    <!-- Debug info - remove in production -->
    <div v-if="typeof process !== 'undefined' && process.env.NODE_ENV === 'development'" style="background: #f0f0f0; padding: 10px; margin: 10px 0; font-size: 12px; border-radius: 4px;">
      <strong>Debug Info:</strong><br>
      hasResults: {{ hasResults }}<br>
      hasError: {{ hasError }}<br>
      isSearching: {{ isSearching }}<br>
      resultsLength: {{ searchResults ? searchResults.length : 'undefined' }}<br>
      searchError: {{ searchError }}<br>
      showDropdown: {{ showDropdown }}<br>
      inputLength: {{ (inputValue || '').length }}
    </div>

    <!-- Dropdown -->
    <transition name="dropdown">
      <div v-if="showDropdown" class="dropdown">
        <!-- Popular stocks when empty input -->
        <div v-if="showPopular && popularStocks && popularStocks.length > 0" class="suggestions-section">
          <div class="section-header">
            <TrendingUp class="section-icon" />
            Popular Stocks
          </div>
          <div
            v-for="(stock, index) in popularStocks.slice(0, 8)"
            :key="`popular-${stock.symbol || index}`"
            @click="selectSuggestion(stock)"
            class="suggestion-item"
          >
            <div class="stock-symbol">{{ stock.symbol || 'N/A' }}</div>
            <div class="stock-name">{{ stock.name || 'No name available' }}</div>
            <div v-if="stock.type" class="stock-type">{{ stock.type }}</div>
            <div class="stock-badge popular-badge">Popular</div>
          </div>
        </div>

        <!-- Search Results -->
        <div v-if="searchResults && searchResults.length > 0" class="suggestions-section">
          <div class="section-header">
            <Search class="section-icon" />
            Found {{ searchResults.length }} results
          </div>
          <div
            v-for="(stock, index) in searchResults"
            :key="`result-${stock.symbol || index}`"
            @click="selectSuggestion(stock)"
            :class="[
              'suggestion-item',
              { 'selected': selectedIndex === index }
            ]"
          >
            <div class="stock-symbol">{{ stock.symbol }}</div>
            <div class="stock-name">{{ stock.name }}</div>
            <div v-if="stock.type" class="stock-type">{{ stock.type }}</div>
            <div v-if="stock.exchange" class="stock-exchange">{{ stock.exchange }}</div>
            <div v-if="stock.source" class="stock-badge source-badge">
              {{ stock.source }}
            </div>
          </div>
        </div>

        <!-- No results -->
        <div v-if="searchResults && searchResults.length === 0 && searchError" class="no-results">
          <AlertCircle class="error-icon" />
          <span>{{ searchError }}</span>
        </div>

        <!-- Empty search -->
        <div v-if="!hasResults && !showPopular && (inputValue || '').length > 2 && !isSearching && !hasError" class="no-results">
          <Search class="error-icon" />
          <span>No stocks found for "{{ inputValue }}"</span>
        </div>

        <!-- Loading state -->
        <div v-if="isSearching" class="loading-state">
          <div class="spinner"></div>
          <span>Searching...</span>
        </div>
      </div>
    </transition>

    <!-- Validation message -->
    <div v-if="validationMessage" class="validation-message" :class="validationClass">
      <AlertCircle v-if="validationClass === 'error'" class="validation-icon" />
      <CheckCircle v-else class="validation-icon" />
      {{ validationMessage }}
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X, Search, TrendingUp, AlertCircle, CheckCircle } from 'lucide-vue-next'
import { useStockSearch } from '@/composables/useStockSearch'

export default {
  name: 'StockAutocompleteInput',
  components: {
    X,
    Search,
    TrendingUp,
    AlertCircle,
    CheckCircle
  },
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    placeholder: {
      type: String,
      default: 'Search for stocks...'
    },
    disabled: {
      type: Boolean,
      default: false
    },
    validateOnInput: {
      type: Boolean,
      default: false
    },
    showPopularOnFocus: {
      type: Boolean,
      default: true
    }
  },
  emits: ['update:modelValue', 'stock-selected', 'validation-change'],
  setup(props, { emit }) {
    // DESTRUCTURE the composable properly - this fixes the reactivity issue!
    const {
      searchResults,
      isSearching,
      searchError,
      hasResults,
      hasError,
      searchStocks,
      handleKeyNavigation,
      clearSearch,
      getPopularStocks,
      validateSymbol
    } = useStockSearch()

    const containerRef = ref(null)
    const inputRef = ref(null)
    const inputValue = ref(props.modelValue || '')
    const showDropdown = ref(false)
    const validationMessage = ref('')
    const validationClass = ref('')
    const isValidating = ref(false)
    const selectedIndex = ref(-1)

    // Popular stocks for initial suggestions (with safe defaults)
    const popularStocks = computed(() => {
      try {
        return getPopularStocks() || []
      } catch (error) {
        console.warn('Error getting popular stocks:', error)
        return []
      }
    })
    
    // Show popular stocks when input is empty and focused (with safe checks)
    const showPopular = computed(() => 
      props.showPopularOnFocus && 
      (inputValue.value?.length || 0) === 0 && 
      showDropdown.value &&
      !hasResults.value
    )

    // Watch for prop changes (safer)
    watch(() => props.modelValue, (newValue) => {
      if (newValue !== inputValue.value) {
        inputValue.value = newValue || ''
      }
    })

    // Watch input value (safer)
    watch(inputValue, (newValue) => {
      emit('update:modelValue', newValue || '')
      
      const safeValue = newValue || ''
      if (safeValue.length >= 1) {
        searchStocks(safeValue)
      } else {
        clearSearch()
        clearValidation()
      }
    })

    // Debug watchers for development
    if (process.env.NODE_ENV === 'development') {
      watch(searchResults, (newResults) => {
        console.log('🔍 Vue component sees searchResults changed:', newResults?.length || 0, 'results')
        console.log('🔍 hasResults:', hasResults.value)
        console.log('🔍 hasError:', hasError.value)
        console.log('🔍 searchError:', searchError.value)
      }, { deep: true })
    }

    // Handle input events (safer)
    const handleInput = (event) => {
      const value = event?.target?.value || ''
      inputValue.value = value
      
      if (props.validateOnInput && value.length > 0) {
        validateSymbolLocal(value)
      }
    }

    // Handle keyboard navigation (safer)
    const handleKeydown = (event) => {
      if (!event) return
      
      const handled = handleKeyNavigation(
        event, 
        inputValue.value || '', 
        selectSuggestion
      )

      if (handled) return

      // Additional key handling
      if (event.key === 'Tab' && hasResults.value) {
        // Auto-complete first result on tab
        event.preventDefault()
        const results = searchResults.value || []
        const firstResult = results[0]
        if (firstResult) {
          selectSuggestion(firstResult)
        }
      }
    }

    // Handle focus (safer)
    const handleFocus = () => {
      showDropdown.value = true
      console.log('🔍 Focus - setting showDropdown to true')
      
      const safeValue = inputValue.value || ''
      if (safeValue.length === 0 && props.showPopularOnFocus) {
        // Show popular stocks immediately
      } else if (safeValue.length >= 1) {
        // Re-search if we have input
        searchStocks(safeValue, 0) // No delay on focus
      }
    }

    // Handle blur with delay to allow click selection
    const handleBlur = () => {
      setTimeout(() => {
        showDropdown.value = false
        clearSearch()
      }, 150)
    }

    // Select a suggestion (much safer)
    const selectSuggestion = (stock) => {
      if (!stock) {
        console.warn('selectSuggestion called with undefined stock')
        return
      }
      
      try {
        const symbol = stock.symbol || ''
        const name = stock.name || stock.shortname || stock.longname || ''
        const type = stock.type || 'Stock'
        
        inputValue.value = symbol
        showDropdown.value = false
        clearSearch()
        
        // Emit the selected stock with safe defaults
        emit('stock-selected', {
          symbol: symbol,
          name: name,
          type: type,
          exchange: stock.exchange,
          source: stock.source
        })

        // Validate the selected symbol
        if (props.validateOnInput && symbol) {
          validateSymbolLocal(symbol)
        }

        // Focus next input if available
        nextTick(() => {
          try {
            const form = containerRef.value?.closest('form')
            if (form) {
              const inputs = form.querySelectorAll('input')
              const currentIndex = Array.from(inputs).indexOf(inputRef.value)
              const nextInput = inputs[currentIndex + 1]
              if (nextInput) {
                nextInput.focus()
              }
            }
          } catch (error) {
            console.warn('Error focusing next input:', error)
          }
        })
      } catch (error) {
        console.error('Error in selectSuggestion:', error)
      }
    }

    // Clear input (safer)
    const clearInput = () => {
      inputValue.value = ''
      clearValidation()
      clearSearch()
      try {
        inputRef.value?.focus()
      } catch (error) {
        console.warn('Error focusing input:', error)
      }
    }

    // Validate symbol (safer) - renamed to avoid conflicts
    const validateSymbolLocal = async (symbol) => {
      if (!symbol || symbol.length < 1) {
        clearValidation()
        return
      }

      isValidating.value = true
      clearValidation()

      try {
        const isValid = await validateSymbol(symbol)
        
        if (isValid) {
          validationMessage.value = `✓ ${symbol.toUpperCase()} is a valid stock symbol`
          validationClass.value = 'success'
          emit('validation-change', { valid: true, symbol })
        } else {
          validationMessage.value = `⚠ ${symbol.toUpperCase()} may not be a valid stock symbol`
          validationClass.value = 'warning'
          emit('validation-change', { valid: false, symbol })
        }
      } catch (error) {
        console.warn('Symbol validation error:', error)
        validationMessage.value = `✗ Unable to validate ${symbol.toUpperCase()}`
        validationClass.value = 'error'
        emit('validation-change', { valid: false, symbol, error: error.message })
      } finally {
        isValidating.value = false
      }
    }

    // Clear validation
    const clearValidation = () => {
      validationMessage.value = ''
      validationClass.value = ''
      emit('validation-change', { valid: null })
    }

    // Click outside to close (safer)
    const handleClickOutside = (event) => {
      try {
        if (containerRef.value && !containerRef.value.contains(event.target)) {
          showDropdown.value = false
          clearSearch()
        }
      } catch (error) {
        console.warn('Error in handleClickOutside:', error)
      }
    }

    // Public methods
    const focus = () => {
      try {
        inputRef.value?.focus()
      } catch (error) {
        console.warn('Error focusing input:', error)
      }
    }

    const validate = () => {
      if (inputValue.value) {
        validateSymbolLocal(inputValue.value)
      }
    }

    // Lifecycle (safer)
    onMounted(() => {
      try {
        document.addEventListener('click', handleClickOutside)
      } catch (error) {
        console.warn('Error adding click listener:', error)
      }
    })

    onUnmounted(() => {
      try {
        document.removeEventListener('click', handleClickOutside)
      } catch (error) {
        console.warn('Error removing listeners:', error)
      }
    })

    return {
      // Use destructured values directly
      searchResults,
      isSearching,
      hasResults,
      hasError,
      searchError,
      selectedIndex,
      containerRef,
      inputRef,
      inputValue,
      showDropdown,
      popularStocks,
      showPopular,
      validationMessage,
      validationClass,
      isValidating,
      handleInput,
      handleKeydown,
      handleFocus,
      handleBlur,
      selectSuggestion,
      clearInput,
      focus,
      validate
    }
  }
}
</script>

<style lang="scss" scoped>
.stock-autocomplete {
  position: relative;
  width: 100%;
}

.input-container {
  position: relative;
}

.stock-input {
  width: 100%;
  padding: 12px 16px;
  padding-right: 44px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background-color: #f8fafc;
    cursor: not-allowed;
  }
}

.clear-button {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: #64748b;
  
  &:hover {
    color: #334155;
    background-color: #f1f5f9;
  }
}

.loading-indicator {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e2e8f0;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
}

.suggestions-section {
  padding: 8px 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-icon {
  width: 14px;
  height: 14px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.1s;

  &:hover,
  &.selected {
    background-color: #f8fafc;
  }
}

.stock-symbol {
  font-weight: 600;
  color: #1e293b;
  min-width: 60px;
}

.stock-name {
  flex: 1;
  color: #64748b;
  font-size: 14px;
}

.stock-type,
.stock-exchange {
  font-size: 12px;
  color: #94a3b8;
}

.stock-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.popular-badge {
  background-color: #fef3c7;
  color: #d97706;
}

.source-badge {
  background-color: #dbeafe;
  color: #2563eb;
}

.no-results,
.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: #64748b;
  font-size: 14px;
}

.error-icon {
  width: 16px;
  height: 16px;
}

.validation-message {
  display: flex;
  align-items: center;
  gap: 6px;
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

.validation-icon {
  width: 12px;
  height: 12px;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>