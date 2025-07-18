<!-- StockAutocompleteInput.vue - Smart stock search input with suggestions -->
<template>
  <div class="stock-autocomplete" ref="containerRef">
    <div class="input-container">
      <input
        ref="inputRef"
        v-model="inputValue"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
        :class="['stock-input', { 'has-suggestions': stockSearch.hasResults }]"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
      />
      
      <!-- Loading indicator -->
      <div v-if="stockSearch.isSearching" class="input-spinner">
        <div class="spinner"></div>
      </div>
      
      <!-- Clear button -->
      <button
        v-if="inputValue && !stockSearch.isSearching"
        @click="clearInput"
        class="clear-button"
        type="button"
      >
        <X class="clear-icon" />
      </button>
    </div>

    <!-- Suggestions dropdown -->
    <transition name="dropdown">
      <div
        v-if="showDropdown && (stockSearch.hasResults || showPopular)"
        class="suggestions-dropdown"
      >
        <!-- Popular stocks (when no search results) -->
        <div v-if="showPopular" class="suggestions-section">
          <div class="section-header">
            <TrendingUp class="section-icon" />
            Popular Stocks
          </div>
          <div
            v-for="(stock, index) in popularStocks"
            :key="`popular-${stock.symbol}`"
            @click="selectSuggestion(stock)"
            :class="[
              'suggestion-item',
              { 'selected': selectedIndex === index && !stockSearch.hasResults }
            ]"
          >
            <div class="stock-symbol">{{ stock.symbol }}</div>
            <div class="stock-name">{{ stock.name }}</div>
            <div class="stock-badge popular-badge">Popular</div>
          </div>
        </div>

        <!-- Search results -->
        <div v-if="stockSearch.hasResults" class="suggestions-section">
          <div class="section-header">
            <Search class="section-icon" />
            Search Results
          </div>
          <div
            v-for="(stock, index) in stockSearch.searchResults"
            :key="`result-${stock.symbol}`"
            @click="selectSuggestion(stock)"
            :class="[
              'suggestion-item',
              { 'selected': stockSearch.selectedIndex === index }
            ]"
          >
            <div class="stock-symbol">{{ stock.symbol }}</div>
            <div class="stock-name">{{ stock.name }}</div>
            <div v-if="stock.type" class="stock-type">{{ stock.type }}</div>
            <div v-if="stock.source" class="stock-badge source-badge">
              {{ stock.source }}
            </div>
          </div>
        </div>

        <!-- No results -->
        <div v-if="stockSearch.hasError" class="no-results">
          <AlertCircle class="error-icon" />
          <span>Search failed. Please try again.</span>
        </div>

        <!-- Empty search -->
        <div v-if="!stockSearch.hasResults && !showPopular && inputValue.length > 2 && !stockSearch.isSearching" class="no-results">
          <Search class="error-icon" />
          <span>No stocks found for "{{ inputValue }}"</span>
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
      default: 'Search for stocks... (e.g., AAPL, Apple)'
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
    const stockSearch = useStockSearch()
    const containerRef = ref(null)
    const inputRef = ref(null)
    const inputValue = ref(props.modelValue)
    const showDropdown = ref(false)
    const validationMessage = ref('')
    const validationClass = ref('')
    const isValidating = ref(false)
    const selectedIndex = ref(-1)

    // Popular stocks for initial suggestions
    const popularStocks = computed(() => stockSearch.getPopularStocks())
    
    // Show popular stocks when input is empty and focused
    const showPopular = computed(() => 
      props.showPopularOnFocus && 
      inputValue.value.length === 0 && 
      showDropdown.value &&
      !stockSearch.hasResults
    )

    // Watch for prop changes
    watch(() => props.modelValue, (newValue) => {
      if (newValue !== inputValue.value) {
        inputValue.value = newValue
      }
    })

    // Watch input value
    watch(inputValue, (newValue) => {
      emit('update:modelValue', newValue)
      
      if (newValue.length >= 1) {
        stockSearch.searchStocks(newValue)
      } else {
        stockSearch.clearSearch()
        clearValidation()
      }
    })

    // Handle input events
    const handleInput = (event) => {
      inputValue.value = event.target.value
      
      if (props.validateOnInput && inputValue.value.length > 0) {
        validateSymbol(inputValue.value)
      }
    }

    // Handle keyboard navigation
    const handleKeydown = (event) => {
      const handled = stockSearch.handleKeyNavigation(
        event, 
        inputValue.value, 
        selectSuggestion
      )

      if (handled) return

      // Additional key handling
      if (event.key === 'Tab' && stockSearch.hasResults) {
        // Auto-complete first result on tab
        event.preventDefault()
        const firstResult = stockSearch.searchResults[0]
        if (firstResult) {
          selectSuggestion(firstResult)
        }
      }
    }

    // Handle focus
    const handleFocus = () => {
      showDropdown.value = true
      
      if (inputValue.value.length === 0 && props.showPopularOnFocus) {
        // Show popular stocks immediately
      } else if (inputValue.value.length >= 1) {
        // Re-search if we have input
        stockSearch.searchStocks(inputValue.value, 0) // No delay on focus
      }
    }

    // Handle blur with delay to allow click selection
    const handleBlur = () => {
      setTimeout(() => {
        showDropdown.value = false
        stockSearch.clearSearch()
      }, 150)
    }

    // Select a suggestion
    const selectSuggestion = (stock) => {
      inputValue.value = stock.symbol
      showDropdown.value = false
      stockSearch.clearSearch()
      
      // Emit the selected stock
      emit('stock-selected', {
        symbol: stock.symbol,
        name: stock.name,
        type: stock.type || 'Common Stock'
      })

      // Validate the selected symbol
      if (props.validateOnInput) {
        validateSymbol(stock.symbol)
      }

      // Focus next input if available
      nextTick(() => {
        const form = containerRef.value?.closest('form')
        if (form) {
          const inputs = form.querySelectorAll('input')
          const currentIndex = Array.from(inputs).indexOf(inputRef.value)
          const nextInput = inputs[currentIndex + 1]
          if (nextInput) {
            nextInput.focus()
          }
        }
      })
    }

    // Clear input
    const clearInput = () => {
      inputValue.value = ''
      clearValidation()
      stockSearch.clearSearch()
      inputRef.value?.focus()
    }

    // Validate symbol
    const validateSymbol = async (symbol) => {
      if (!symbol || symbol.length < 1) {
        clearValidation()
        return
      }

      isValidating.value = true
      clearValidation()

      try {
        const isValid = await stockSearch.validateSymbol(symbol)
        
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

    // Click outside to close
    const handleClickOutside = (event) => {
      if (containerRef.value && !containerRef.value.contains(event.target)) {
        showDropdown.value = false
        stockSearch.clearSearch()
      }
    }

    // Public methods
    const focus = () => {
      inputRef.value?.focus()
    }

    const validate = () => {
      if (inputValue.value) {
        validateSymbol(inputValue.value)
      }
    }

    // Lifecycle
    onMounted(() => {
      document.addEventListener('click', handleClickOutside)
    })

    onUnmounted(() => {
      document.removeEventListener('click', handleClickOutside)
    })

    return {
      stockSearch,
      containerRef,
      inputRef,
      inputValue,
      showDropdown,
      popularStocks,
      showPopular,
      validationMessage,
      validationClass,
      isValidating,
      selectedIndex,
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
  to { transform: rotate(360deg); }
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