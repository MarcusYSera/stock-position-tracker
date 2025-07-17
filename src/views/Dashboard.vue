<!-- Fixed Dashboard.vue with correct imports and no ESLint errors -->
<template>
  <div class="dashboard">
    <!-- Market Status & Update Controls -->
    <div class="market-controls card mb-6">
      <div class="card-body p-6">
        <div class="controls-header">
          <div class="market-info">
            <div class="market-status" :class="marketStatusClass">
              <div class="status-indicator"></div>
              <span class="status-text">{{ marketStatus.status }}</span>
            </div>
            <div class="last-updated">
              Last updated: {{ stockData.formatLastUpdated() }}
            </div>
          </div>
          
          <div class="update-controls">
            <button 
              @click="handleManualUpdate"
              :disabled="!stockData.canUpdate"
              class="btn btn--secondary"
            >
              <RefreshCw class="icon" :class="{ 'spinning': stockData.isUpdating }" />
              {{ stockData.isUpdating ? 'Updating...' : 'Update Prices' }}
            </button>
            
            <button 
              @click="stockData.toggleAutoUpdate()"
              :class="['btn', stockData.autoUpdateEnabled ? 'btn--success' : 'btn--secondary']"
            >
              <Clock class="icon" />
              Auto Update {{ stockData.autoUpdateEnabled ? 'On' : 'Off' }}
            </button>
          </div>
        </div>

        <!-- Update Errors -->
        <div v-if="stockData.errors.length > 0" class="update-errors">
          <div v-for="error in stockData.errors" :key="error" class="error-message">
            <AlertTriangle class="error-icon" />
            {{ error }}
          </div>
        </div>
      </div>
    </div>

    <PortfolioSummary />
    
    <div class="dashboard__content">
      <div class="card">
        <div class="card-body p-6">
          <div class="dashboard__header">
            <h2 class="dashboard__title">Your Positions</h2>
            <button @click="showForm = true" class="btn btn--primary">
              <Plus class="icon" />
              Add Position
            </button>
          </div>
          
          <PositionForm v-if="showForm" @close="showForm = false" />
          
          <div v-if="portfolioStore.positions.length === 0" class="empty-state">
            <TrendingUp class="empty-state__icon" />
            <h3>No positions yet</h3>
            <p>Start tracking your portfolio by adding your first position.</p>
            <button @click="showForm = true" class="btn btn--primary">
              Add Your First Position
            </button>
          </div>
          
          <!-- Enhanced Positions Table with Real-time Data -->
          <div v-else class="positions-table-container">
            <div class="positions-table">
              <!-- Table Header -->
              <div class="table-header">
                <div class="header-cell header-cell--stock">Stock Info</div>
                <div class="header-cell header-cell--shares">Shares Owned</div>
                <div class="header-cell header-cell--purchase">Purchase Price</div>
                <div class="header-cell header-cell--current">Current Price</div>
                <div class="header-cell header-cell--change">Today's Change</div>
                <div class="header-cell header-cell--value">Market Value</div>
                <div class="header-cell header-cell--gain">Total Gain/Loss</div>
                <div class="header-cell header-cell--actions">Actions</div>
              </div>
              
              <!-- Position Rows -->
              <div v-for="position in portfolioStore.positions" :key="position.id" class="position-row">
                <!-- Stock Info -->
                <div class="position-cell position-cell--stock">
                  <div class="stock-info">
                    <div class="stock-symbol">{{ position.symbol }}</div>
                    <div class="stock-name">{{ position.name }}</div>
                    <div v-if="position.marketData?.source" class="data-source">
                      via {{ position.marketData.source }}
                    </div>
                  </div>
                </div>
                
                <!-- Shares -->
                <div class="position-cell position-cell--shares">
                  <div class="cell-label">Shares:</div>
                  <div class="cell-value">{{ formatNumber(position.shares) }}</div>
                </div>
                
                <!-- Purchase Price -->
                <div class="position-cell position-cell--purchase">
                  <div class="cell-label">Bought at:</div>
                  <div class="cell-value">{{ formatCurrency(position.purchasePrice) }}</div>
                </div>
                
                <!-- Current Price with Real-time Indicator -->
                <div class="position-cell position-cell--current">
                  <div class="cell-label">Current:</div>
                  <div class="cell-value current-price">
                    {{ formatCurrency(position.currentPrice) }}
                    <div v-if="position.lastUpdated" class="price-timestamp">
                      {{ formatUpdateTime(position.lastUpdated) }}
                    </div>
                  </div>
                </div>
                
                <!-- Today's Change -->
                <div class="position-cell position-cell--change">
                  <div class="cell-label">Today's Change:</div>
                  <div class="cell-value" v-if="position.marketData">
                    <div 
                      class="market-change" 
                      :class="position.marketData.changePercent >= 0 ? 'change-positive' : 'change-negative'"
                    >
                      <div class="change-amount">{{ formatCurrency(position.marketData.change || 0) }}</div>
                      <div class="change-percentage">({{ position.marketData.changePercent?.toFixed(2) || 0 }}%)</div>
                    </div>
                  </div>
                  <div v-else class="cell-value text-muted">
                    No data
                  </div>
                </div>
                
                <!-- Market Value -->
                <div class="position-cell position-cell--value">
                  <div class="cell-label">Total Value:</div>
                  <div class="cell-value market-value">{{ formatCurrency(position.shares * position.currentPrice) }}</div>
                </div>
                
                <!-- Total Gain/Loss -->
                <div class="position-cell position-cell--gain">
                  <div class="cell-label">Total Profit/Loss:</div>
                  <div class="cell-value gain-loss" :class="gainLossClass(position)">
                    <div class="gain-amount">{{ formatCurrency(calculateGainLoss(position).gainLoss) }}</div>
                    <div class="gain-percentage">({{ calculateGainLoss(position).percentage.toFixed(2) }}%)</div>
                  </div>
                </div>
                
                <!-- Actions -->
                <div class="position-cell position-cell--actions">
                  <button 
                    @click="updateSingleStock(position)"
                    :disabled="stockData.isUpdating"
                    class="btn-action btn-action--refresh" 
                    title="Update Price"
                  >
                    <RefreshCw class="action-icon" :class="{ 'spinning': stockData.isUpdating }" />
                  </button>
                  <button 
                    @click="editPosition(position)" 
                    class="btn-action btn-action--edit" 
                    title="Edit Position"
                  >
                    <Edit class="action-icon" />
                  </button>
                  <button 
                    @click="deletePosition(position.id)" 
                    class="btn-action btn-action--delete" 
                    title="Delete Position"
                  >
                    <Trash2 class="action-icon" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Position Modal -->
    <EditPositionModal 
      :show="showEditModal"
      :position="editingPosition"
      @close="closeEditModal"
      @updated="handlePositionUpdated"
    />

    <!-- Success Toast -->
    <div v-if="showSuccessToast" class="success-toast">
      <CheckCircle class="toast-icon" />
      {{ successMessage }}
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { 
  Plus, TrendingUp, Trash2, Edit, RefreshCw, Clock, 
  AlertTriangle, CheckCircle 
} from 'lucide-vue-next'
import { usePortfolioStore } from '@/stores/portfolio'
import { useFormatters } from '@/composables/useFormatters'
import { useStockData } from '@/composables/useStockData'
import PortfolioSummary from '@/components/portfolio/PortfolioSummary.vue'
import PositionForm from '@/components/portfolio/PositionForm.vue'
import EditPositionModal from '@/components/portfolio/EditPositionModal.vue'

export default {
  name: 'Dashboard',
  components: {
    Plus,
    TrendingUp,
    Trash2,
    Edit,
    RefreshCw,
    Clock,
    AlertTriangle,
    CheckCircle,
    PortfolioSummary,
    PositionForm,
    EditPositionModal
  },
  setup() {
    const showForm = ref(false)
    const showEditModal = ref(false)
    const editingPosition = ref(null)
    const showSuccessToast = ref(false)
    const successMessage = ref('')
    
    const portfolioStore = usePortfolioStore()
    const { formatCurrency, formatDate } = useFormatters()
    const stockData = useStockData()

    const formatNumber = (value) => {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      })
    }

    const formatUpdateTime = (timestamp) => {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      const now = new Date()
      const diff = now - date
      const minutes = Math.floor(diff / 60000)
      
      if (minutes < 1) return 'now'
      if (minutes < 60) return `${minutes}m ago`
      return formatDate(timestamp)
    }

    const marketStatus = computed(() => stockData.getMarketStatus())
    
    const marketStatusClass = computed(() => ({
      'market-status--open': marketStatus.value.isOpen,
      'market-status--closed': !marketStatus.value.isOpen
    }))

    const editPosition = (position) => {
      editingPosition.value = position
      showEditModal.value = true
    }

    const closeEditModal = () => {
      showEditModal.value = false
      editingPosition.value = null
    }

    const handlePositionUpdated = () => {
      showToast('Position updated successfully!')
    }

    const deletePosition = (id) => {
      if (confirm('Are you sure you want to delete this position?')) {
        portfolioStore.deletePosition(id)
        showToast('Position deleted')
      }
    }

    const calculateGainLoss = (position) => {
      return portfolioStore.calculateGainLoss(position)
    }

    const gainLossClass = (position) => {
      const result = calculateGainLoss(position)
      return result.gainLoss >= 0 ? 'gain-positive' : 'gain-negative'
    }

    const handleManualUpdate = async () => {
      const result = await stockData.updateAllPositions()
      if (result.success) {
        showToast(`Updated ${result.updatedCount} positions successfully!`)
      } else {
        showToast('Update failed. Please try again.', 'error')
      }
    }

    const updateSingleStock = async (position) => {
      const result = await stockData.updateSinglePosition(position.id, position.symbol)
      if (result.success) {
        showToast(`${position.symbol} updated to ${formatCurrency(result.data.price)}`)
      } else {
        showToast(`Failed to update ${position.symbol}`, 'error')
      }
    }

    const showToast = (message) => {
      successMessage.value = message
      showSuccessToast.value = true
      setTimeout(() => {
        showSuccessToast.value = false
      }, 3000)
    }

    // Auto-update on mount if user has positions
    onMounted(() => {
      if (portfolioStore.positions.length > 0) {
        // Initial price update
        stockData.updateAllPositions()
      }
    })

    return {
      showForm,
      showEditModal,
      editingPosition,
      showSuccessToast,
      successMessage,
      portfolioStore,
      stockData,
      marketStatus,
      marketStatusClass,
      formatCurrency,
      formatDate,
      formatNumber,
      formatUpdateTime,
      editPosition,
      closeEditModal,
      handlePositionUpdated,
      deletePosition,
      calculateGainLoss,
      gainLossClass,
      handleManualUpdate,
      updateSingleStock
    }
  }
}
</script>

<style lang="scss" scoped>
.dashboard {
  &__content {
    margin-top: $spacing-lg;
  }

  &__header {
    @include flex-between;
    margin-bottom: $spacing-lg;
  }

  &__title {
    font-size: $font-size-xl;
    font-weight: 700;
    color: $gray-900;
    margin: 0;
  }
}

.market-controls {
  .controls-header {
    @include flex-between;
    align-items: flex-start;

    @include mobile {
      flex-direction: column;
      gap: $spacing-md;
    }
  }

  .market-info {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  .market-status {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    font-weight: 600;

    &--open {
      color: $success;
    }

    &--closed {
      color: $gray-500;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 2s infinite;
    }
  }

  .last-updated {
    font-size: $font-size-sm;
    color: $gray-500;
  }

  .update-controls {
    display: flex;
    gap: $spacing-sm;

    @include mobile {
      width: 100%;
      
      .btn {
        flex: 1;
      }
    }
  }
}

.update-errors {
  margin-top: $spacing-md;
  padding-top: $spacing-md;
  border-top: 1px solid $gray-200;

  .error-message {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    color: $danger;
    font-size: $font-size-sm;
    margin-bottom: $spacing-xs;

    .error-icon {
      width: 1rem;
      height: 1rem;
    }
  }
}

.empty-state {
  text-align: center;
  padding: $spacing-xl 0;

  &__icon {
    width: 4rem;
    height: 4rem;
    color: $gray-400;
    margin: 0 auto $spacing-lg;
  }

  h3 {
    font-size: $font-size-lg;
    color: $gray-700;
    margin-bottom: $spacing-sm;
  }

  p {
    color: $gray-500;
    margin-bottom: $spacing-lg;
  }
}

.positions-table-container {
  overflow-x: auto;
  border-radius: $radius-lg;
  border: 1px solid $gray-200;
}

.positions-table {
  min-width: 1000px;
  width: 100%;
}

.table-header {
  display: grid;
  grid-template-columns: 200px 120px 130px 130px 140px 140px 160px 120px;
  background: $gray-50;
  border-bottom: 2px solid $gray-200;
}

.header-cell {
  padding: $spacing-md $spacing-sm;
  font-weight: 600;
  font-size: $font-size-sm;
  color: $gray-700;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  border-right: 1px solid $gray-200;

  &:last-child {
    border-right: none;
  }

  &--stock { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); }
  &--shares { background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); }
  &--purchase { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); }
  &--current { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }
  &--change { background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%); }
  &--value { background: linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%); }
  &--gain { background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%); }
  &--actions { background: $gray-100; }
}

.position-row {
  display: grid;
  grid-template-columns: 200px 120px 130px 130px 140px 140px 160px 120px;
  border-bottom: 1px solid $gray-200;
  transition: background-color 0.2s ease;

  &:hover {
    background: $gray-50;
  }

  &:last-child {
    border-bottom: none;
  }
}

.position-cell {
  padding: $spacing-md $spacing-sm;
  border-right: 1px solid $gray-200;
  
  &:last-child {
    border-right: none;
  }

  &--stock {
    padding: $spacing-md;
  }
}

.cell-label {
  font-size: $font-size-xs;
  color: $gray-500;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  margin-bottom: 2px;
  font-weight: 500;

  @include desktop {
    display: none;
  }
}

.cell-value {
  font-size: $font-size-sm;
  color: $gray-900;
  font-weight: 500;
}

.stock-info {
  .stock-symbol {
    font-weight: 700;
    font-size: $font-size-base;
    color: $gray-900;
    margin-bottom: 2px;
  }

  .stock-name {
    font-size: $font-size-xs;
    color: $gray-500;
    line-height: 1.2;
    margin-bottom: 2px;
  }

  .data-source {
    font-size: 10px;
    color: $gray-400;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
}

.current-price {
  color: $primary;
  font-weight: 600;

  .price-timestamp {
    font-size: 10px;
    color: $gray-400;
    font-weight: 400;
    margin-top: 2px;
  }
}

.market-change {
  &.change-positive {
    color: $success;
  }

  &.change-negative {
    color: $danger;
  }

  .change-amount {
    font-weight: 600;
  }

  .change-percentage {
    font-size: $font-size-xs;
    margin-top: 2px;
    opacity: 0.8;
  }
}

.market-value {
  color: $gray-900;
  font-weight: 600;
}

.gain-loss {
  &.gain-positive {
    color: $success;
    
    .gain-amount {
      font-weight: 600;
    }
  }

  &.gain-negative {
    color: $danger;
    
    .gain-amount {
      font-weight: 600;
    }
  }

  .gain-percentage {
    font-size: $font-size-xs;
    margin-top: 2px;
    opacity: 0.8;
  }
}

.btn-action {
  background: none;
  border: none;
  padding: $spacing-xs;
  border-radius: $radius;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-right: $spacing-xs;

  &:last-child {
    margin-right: 0;
  }

  &--refresh {
    color: $primary;

    &:hover {
      background: rgba($primary, 0.1);
      color: $primary-hover;
    }
  }

  &--edit {
    color: $gray-600;

    &:hover {
      background: rgba($gray-600, 0.1);
      color: $gray-800;
    }
  }

  &--delete {
    color: $danger;

    &:hover {
      background: rgba($danger, 0.1);
      color: darken($danger, 10%);
    }
  }

  .action-icon {
    width: 1rem;
    height: 1rem;
  }
}

.btn--success {
  background: $success;
  color: $white;

  &:hover:not(:disabled) {
    background: darken($success, 10%);
  }
}

.icon {
  width: 1rem;
  height: 1rem;
}

.spinning {
  animation: spin 1s linear infinite;
}

.success-toast {
  position: fixed;
  bottom: $spacing-lg;
  right: $spacing-lg;
  background: $success;
  color: $white;
  padding: $spacing-md $spacing-lg;
  border-radius: $radius;
  box-shadow: $shadow-lg;
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  z-index: 1000;
  animation: slideInUp 0.3s ease;

  .toast-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes slideInUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

// Mobile responsiveness
@include mobile {
  .positions-table {
    min-width: auto;
  }

  .table-header {
    display: none;
  }

  .position-row {
    display: block;
    border: 1px solid $gray-200;
    border-radius: $radius;
    margin-bottom: $spacing-md;
    padding: $spacing-md;
  }

  .position-cell {
    display: block;
    padding: $spacing-xs 0;
    border: none;

    &--stock {
      padding-bottom: $spacing-sm;
      margin-bottom: $spacing-sm;
      border-bottom: 1px solid $gray-200;
    }

    &--actions {
      margin-top: $spacing-sm;
      padding-top: $spacing-sm;
      border-top: 1px solid $gray-200;
    }
  }

  .cell-label {
    display: block !important;
  }

  .success-toast {
    bottom: $spacing-md;
    right: $spacing-md;
    left: $spacing-md;
  }
}
</style>