<!-- EditPositionModal.vue - Non-intrusive popup for editing positions -->
<template>
  <!-- Modal Overlay -->
  <transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <!-- Modal Container -->
      <div class="modal-container" @click.stop>
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="modal-title">
            <Edit class="modal-icon" />
            <span>Edit {{ position?.symbol }}</span>
          </div>
          <button @click="closeModal" class="modal-close">
            <X class="close-icon" />
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <form @submit.prevent="handleSubmit" class="edit-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Stock Symbol</label>
                <input 
                  v-model="formData.symbol" 
                  type="text" 
                  class="form-input"
                  placeholder="e.g., AAPL"
                  required
                  :disabled="loading"
                >
              </div>
              <div class="form-group">
                <label class="form-label">Company Name</label>
                <input 
                  v-model="formData.name" 
                  type="text" 
                  class="form-input"
                  placeholder="e.g., Apple Inc."
                  required
                  :disabled="loading"
                >
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Shares Owned</label>
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
              <div class="form-group">
                <label class="form-label">Purchase Price</label>
                <input 
                  v-model="formData.purchasePrice" 
                  type="number" 
                  step="0.01"
                  class="form-input"
                  placeholder="150.00"
                  required
                  :disabled="loading"
                >
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Current Price</label>
                <input 
                  v-model="formData.currentPrice" 
                  type="number" 
                  step="0.01"
                  class="form-input"
                  placeholder="155.00"
                  required
                  :disabled="loading"
                >
              </div>
              <div class="form-group">
                <label class="form-label">Purchase Date</label>
                <input 
                  v-model="formData.purchaseDate" 
                  type="date" 
                  class="form-input"
                  required
                  :disabled="loading"
                >
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-group--full">
                <label class="form-label">Target Price <span class="optional">(Optional)</span></label>
                <input 
                  v-model="formData.targetPrice" 
                  type="number" 
                  step="0.01"
                  class="form-input"
                  placeholder="200.00"
                  :disabled="loading"
                >
              </div>
            </div>
          </form>

          <!-- Position Preview -->
          <div class="position-preview">
            <h4 class="preview-title">Position Summary</h4>
            <div class="preview-grid">
              <div class="preview-item">
                <span class="preview-label">Market Value:</span>
                <span class="preview-value">{{ formatCurrency(marketValue) }}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Gain/Loss:</span>
                <span class="preview-value" :class="gainLossClass">
                  {{ formatCurrency(gainLoss.gainLoss) }} ({{ gainLoss.percentage.toFixed(2) }}%)
                </span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Cost Basis:</span>
                <span class="preview-value">{{ formatCurrency(costBasis) }}</span>
              </div>
              <div class="preview-item" v-if="formData.targetPrice">
                <span class="preview-label">Target:</span>
                <span class="preview-value">{{ formatCurrency(parseFloat(formData.targetPrice || 0)) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button 
            type="button" 
            @click="closeModal" 
            class="btn btn--secondary"
            :disabled="loading"
          >
            Cancel
          </button>
          <button 
            @click="handleSubmit" 
            class="btn btn--primary"
            :disabled="loading || !isFormValid"
          >
            <div v-if="loading" class="loading-spinner"></div>
            <Check v-else class="btn-icon" />
            {{ loading ? 'Updating...' : 'Update Position' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import { ref, reactive, computed, watch } from 'vue'
import { Edit, X, Check } from 'lucide-vue-next'
import { usePortfolioStore } from '@/stores/portfolio'
import { useFormatters } from '@/composables/useFormatters'

export default {
  name: 'EditPositionModal',
  components: {
    Edit,
    X,
    Check
  },
  props: {
    show: {
      type: Boolean,
      default: false
    },
    position: {
      type: Object,
      default: null
    }
  },
  emits: ['close', 'updated'],
  setup(props, { emit }) {
    const portfolioStore = usePortfolioStore()
    const { formatCurrency } = useFormatters()
    const loading = ref(false)

    const formData = reactive({
      symbol: '',
      name: '',
      shares: '',
      purchasePrice: '',
      currentPrice: '',
      purchaseDate: '',
      targetPrice: ''
    })

    // Watch for position changes and populate form
    watch(() => props.position, (newPosition) => {
      if (newPosition) {
        Object.assign(formData, {
          symbol: newPosition.symbol,
          name: newPosition.name,
          shares: newPosition.shares.toString(),
          purchasePrice: newPosition.purchasePrice.toString(),
          currentPrice: newPosition.currentPrice.toString(),
          purchaseDate: newPosition.purchaseDate,
          targetPrice: newPosition.targetPrice ? newPosition.targetPrice.toString() : ''
        })
      }
    }, { immediate: true })

    // Computed properties for live preview
    const marketValue = computed(() => {
      const shares = parseFloat(formData.shares) || 0
      const currentPrice = parseFloat(formData.currentPrice) || 0
      return shares * currentPrice
    })

    const costBasis = computed(() => {
      const shares = parseFloat(formData.shares) || 0
      const purchasePrice = parseFloat(formData.purchasePrice) || 0
      return shares * purchasePrice
    })

    const gainLoss = computed(() => {
      const gain = marketValue.value - costBasis.value
      const percentage = costBasis.value > 0 ? (gain / costBasis.value) * 100 : 0
      return { gainLoss: gain, percentage }
    })

    const gainLossClass = computed(() => ({
      'gain-positive': gainLoss.value.gainLoss >= 0,
      'gain-negative': gainLoss.value.gainLoss < 0
    }))

    const isFormValid = computed(() => {
      return formData.symbol && 
             formData.name && 
             formData.shares && 
             formData.purchasePrice && 
             formData.currentPrice && 
             formData.purchaseDate
    })

    const closeModal = () => {
      emit('close')
    }

    const handleSubmit = async () => {
      if (!isFormValid.value) {
        alert('Please fill in all required fields')
        return
      }

      loading.value = true

      try {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800))

        const updatedPosition = {
          symbol: formData.symbol.toUpperCase(),
          name: formData.name,
          shares: parseFloat(formData.shares),
          purchasePrice: parseFloat(formData.purchasePrice),
          currentPrice: parseFloat(formData.currentPrice),
          purchaseDate: formData.purchaseDate,
          targetPrice: formData.targetPrice ? parseFloat(formData.targetPrice) : null
        }

        portfolioStore.updatePosition(props.position.id, updatedPosition)
        emit('updated')
        emit('close')
      } catch (error) {
        console.error('Error updating position:', error)
        alert('Error updating position. Please try again.')
      } finally {
        loading.value = false
      }
    }

    // Close modal on Escape key
    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        closeModal()
      }
    }

    watch(() => props.show, (show) => {
      if (show) {
        document.addEventListener('keydown', handleKeydown)
        document.body.style.overflow = 'hidden'
      } else {
        document.removeEventListener('keydown', handleKeydown)
        document.body.style.overflow = ''
      }
    })

    return {
      formData,
      loading,
      formatCurrency,
      marketValue,
      costBasis,
      gainLoss,
      gainLossClass,
      isFormValid,
      closeModal,
      handleSubmit
    }
  }
}
</script>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: $spacing-md;
}

.modal-container {
  background: $white;
  border-radius: $radius-lg;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  @include flex-between;
  padding: $spacing-lg;
  border-bottom: 1px solid $gray-200;
  background: $gray-50;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  font-size: $font-size-lg;
  font-weight: 600;
  color: $gray-900;
}

.modal-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: $primary;
}

.modal-close {
  background: none;
  border: none;
  padding: $spacing-xs;
  border-radius: $radius;
  cursor: pointer;
  color: $gray-500;
  transition: all 0.2s ease;

  &:hover {
    background: $gray-200;
    color: $gray-700;
  }

  .close-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
}

.modal-body {
  padding: $spacing-lg;
  overflow-y: auto;
  flex: 1;
}

.edit-form {
  margin-bottom: $spacing-lg;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-md;
  margin-bottom: $spacing-md;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.form-group {
  &--full {
    grid-column: 1 / -1;
  }
}

.form-label {
  display: block;
  margin-bottom: $spacing-xs;
  font-size: $font-size-sm;
  font-weight: 500;
  color: $gray-700;

  .optional {
    color: $gray-400;
    font-weight: 400;
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

  &:disabled {
    background: $gray-100;
    color: $gray-500;
    cursor: not-allowed;
  }
}

.position-preview {
  background: $gray-50;
  border-radius: $radius;
  padding: $spacing-md;
  border: 1px solid $gray-200;
}

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
  grid-template-columns: 1fr 1fr;
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

.modal-footer {
  padding: $spacing-lg;
  border-top: 1px solid $gray-200;
  background: $gray-50;
  display: flex;
  gap: $spacing-sm;
  justify-content: flex-end;
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
}

.btn-icon {
  width: 1rem;
  height: 1rem;
}

.loading-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba($white, 0.3);
  border-radius: 50%;
  border-top-color: $white;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// Modal transitions
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-container,
.modal-fade-leave-to .modal-container {
  transform: scale(0.9) translateY(-20px);
}

// Mobile responsiveness
@include mobile {
  .modal-overlay {
    padding: $spacing-sm;
  }

  .modal-container {
    max-height: 95vh;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding: $spacing-md;
  }

  .modal-footer {
    flex-direction: column;

    .btn {
      width: 100%;
      justify-content: center;
    }
  }
}
</style>