<!-- StockAutocompleteInput.vue - Smart stock search input with suggestions -->

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

    <!-- DEBUG INFO -->
    <div style="background: #f0f0f0; padding: 10px; margin: 10px 0; font-size: 12px; border-radius: 4px;">
      <strong>Debug Info:</strong><br>
      hasResults: {{ hasResults }}<br>
      hasError: {{ hasError }}<br>
      isSearching: {{ isSearching }}<br>
      resultsLength: {{ debugInfo.resultsLength }}<br>
      searchError: {{ searchError }}<br>
      showDropdown: {{ showDropdown }}<br>
      inputLength: {{ debugInfo.inputLength }}
    </div>

    <!-- SAFER DEBUG SECTION -->
    <div style="background: red; color: white; padding: 10px; margin: 10px 0;">
      <strong>DIRECT ARRAY CHECK:</strong><br>
      Array.isArray: {{ Array.isArray(searchResults) }}<br>
      Length: {{ searchResults ? searchResults.length : 'undefined' }}<br>
      <div v-if="searchResults && searchResults.length > 0">
        First result symbol: {{ searchResults[0]?.symbol }}<br>
        First result name: {{ searchResults[0]?.name }}
      </div>
    </div>

    <!-- FORCE DROPDOWN TO SHOW (temporary test) -->
    <div v-if="true" class="dropdown" style="display: block !important;">
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

      <!-- Search Results - Using destructured values directly -->
      <div v-if="searchResults && searchResults.length > 0" class="suggestions-section">
        <div class="section-header">
          <Search class="section-icon" />
          Found {{ searchResults.length }} results
        </div>
        <div
          v-for="(stock, index) in searchResults"
          :key="`result-${stock.symbol || index}`"
          @click="selectSuggestion(stock)"
          class="suggestion-item"
        >
          <div class="stock-symbol">{{ stock.symbol }}</div>
          <div class="stock-name">{{ stock.name }}</div>
          <div class="stock-type">{{ stock.type }}</div>
        </div>
      </div>

      <!-- No results -->
      <div v-if="searchResults && searchResults.length === 0 && searchError" class="no-results">
        <AlertCircle class="error-icon" />
        <span>{{ searchError }}</span>
      </div>

      <!-- Loading state -->
      <div v-if="isSearching" class="loading-state">
        <div class="spinner"></div>
        <span>Searching...</span>
      </div>
    </div>

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
    // DESTRUCTURE the composable properly - this is the key fix!
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

    // Debug info using destructured values
    const debugInfo = computed(() => {
      return {
        hasResults: hasResults.value,
        hasError: hasError.value,
        isSearching: isSearching.value,
        resultsLength: searchResults.value?.length || 0,
        searchError: searchError.value,
        showDropdown: showDropdown.value,
        inputLength: (inputValue.value || '').length
      }
    })

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

    // Debug watchers using destructured values
    watch(searchResults, (newResults) => {
      console.log('🔍 Vue component sees searchResults changed:', newResults?.length || 0, 'results')
      console.log('🔍 hasResults:', hasResults.value)
      console.log('🔍 hasError:', hasError.value)
      console.log('🔍 searchError:', searchError.value)
    }, { deep: true })

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
          type: type
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
      containerRef,
      inputRef,
      inputValue,
      showDropdown,
      popularStocks,
      showPopular,
      validationMessage,
      validationClass,
      isValidating,
      debugInfo,
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
  display: flex;
  align-items: center;
}

.stock-input {
  width: 100%;
  padding: $spacing-sm $spacing-md;
  padding-right: 2.5rem; // Space for spinner/clear button
  border: 1px solid $gray-300;
  border-radius: $radius;
  font-size: $font-size-sm;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: $primary;
    box-shadow: 0 0 0 3px rgba($primary, 0.1);
  }

  &.has-suggestions {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  &:disabled {
    background: $gray-100;
    color: $gray-500;
    cursor: not-allowed;
  }

  &::placeholder {
    color: $gray-400;
  }
}

.input-spinner {
  position: absolute;
  right: $spacing-sm;
  display: flex;
  align-items: center;
  pointer-events: none;

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid $gray-300;
    border-radius: 50%;
    border-top-color: $primary;
    animation: spin 1s linear infinite;
  }
}

.clear-button {
  position: absolute;
  right: $spacing-sm;
  background: none;
  border: none;
  color: $gray-400;
  cursor: pointer;
  padding: 2px;
  border-radius: $radius-sm;
  transition: all 0.2s ease;

  &:hover {
    color: $gray-600;
    background: $gray-100;
  }

  .clear-icon {
    width: 1rem;
    height: 1rem;
  }
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: $white;
  border: 1px solid $gray-300;
  border-top: none;
  border-bottom-left-radius: $radius;
  border-bottom-right-radius: $radius;
  box-shadow: $shadow-lg;
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}

.suggestions-section {
  .section-header {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    padding: $spacing-sm $spacing-md;
    background: $gray-50;
    border-bottom: 1px solid $gray-200;
    font-size: $font-size-xs;
    font-weight: 600;
    color: $gray-600;
    text-transform: uppercase;
    letter-spacing: 0.025em;

    .section-icon {
      width: 0.875rem;
      height: 0.875rem;
    }
  }
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover,
  &.selected {
    background: $primary;
    color: $white;

    .stock-name,
    .stock-type {
      color: rgba($white, 0.9);
    }

    .stock-badge {
      background: rgba($white, 0.2);
      color: $white;
    }
  }

  &:last-child {
    border-bottom-left-radius: $radius;
    border-bottom-right-radius: $radius;
  }
}

.stock-symbol {
  font-weight: 700;
  font-size: $font-size-sm;
  color: $gray-900;
  min-width: 60px;
}

.stock-name {
  flex: 1;
  font-size: $font-size-sm;
  color: $gray-600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stock-type {
  font-size: $font-size-xs;
  color: $gray-500;
}

.stock-badge {
  font-size: $font-size-xs;
  padding: 2px 6px;
  border-radius: $radius-sm;
  font-weight: 500;

  &.popular-badge {
    background: rgba($success, 0.1);
    color: $success;
  }

  &.source-badge {
    background: rgba($primary, 0.1);
    color: $primary;
  }
}

.no-results {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-lg;
  color: $gray-500;
  font-size: $font-size-sm;
  text-align: center;
  justify-content: center;

  .error-icon {
    width: 1rem;
    height: 1rem;
  }
}

.validation-message {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  font-weight: 500;

  &.success {
    color: $success;
  }

  &.warning {
    color: $warning;
  }

  &.error {
    color: $danger;
  }

  .validation-icon {
    width: 0.875rem;
    height: 0.875rem;
  }
}

// Dropdown animation
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// Mobile responsive
@include mobile {
  .suggestions-dropdown {
    max-height: 250px;
  }

  .suggestion-item {
    padding: $spacing-md;
  }

  .stock-name {
    white-space: normal;
    line-height: 1.3;
  }
}
</style>