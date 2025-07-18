<template>
  <div class="card mb-6">
    <div class="card-body p-6">
      <div class="grid grid--4">
        <div class="summary-card summary-card--primary">
          <div class="summary-card__header">
            <DollarSign class="summary-card__icon" />
            <span>Total Value</span>
          </div>
          <div class="summary-card__value">
            {{ formatCurrency(portfolioStore.totalValue) }}
          </div>
        </div>
        
        <div class="summary-card">
          <div class="summary-card__header">
            <Target class="summary-card__icon" />
            <span>Total Cost</span>
          </div>
          <div class="summary-card__value text-muted">
            {{ formatCurrency(portfolioStore.totalCost) }}
          </div>
        </div>
        
        <div class="summary-card" :class="gainLossClass">
          <div class="summary-card__header">
            <TrendingUp v-if="portfolioStore.totalGainLoss >= 0" class="summary-card__icon" />
            <TrendingDown v-else class="summary-card__icon" />
            <span>Gain/Loss</span>
          </div>
          <div class="summary-card__value" :class="gainLossTextClass">
            {{ formatCurrency(portfolioStore.totalGainLoss) }}
          </div>
        </div>
        
        <div class="summary-card" :class="gainLossClass">
          <div class="summary-card__header">
            <span>Gain/Loss %</span>
          </div>
          <div class="summary-card__value" :class="gainLossTextClass">
            {{ portfolioStore.totalGainLossPercent.toFixed(2) }}%
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { DollarSign, Target, TrendingUp, TrendingDown } from 'lucide-vue-next'
import { usePortfolioStore } from '@/stores/portfolio'
import { useFormatters } from '@/composables/useFormatters'

export default {
  name: 'PortfolioSummary',
  components: {
    DollarSign,
    Target,
    TrendingUp,
    TrendingDown
  },
  setup() {
    const portfolioStore = usePortfolioStore()
    const { formatCurrency } = useFormatters()

    const gainLossClass = computed(() => {
      return {
        'summary-card--success': portfolioStore.totalGainLoss >= 0,
        'summary-card--danger': portfolioStore.totalGainLoss < 0
      }
    })

    const gainLossTextClass = computed(() => {
      return {
        'text-success': portfolioStore.totalGainLoss >= 0,
        'text-danger': portfolioStore.totalGainLoss < 0
      }
    })

    return {
      portfolioStore,
      formatCurrency,
      gainLossClass,
      gainLossTextClass
    }
  }
}
</script>

<style lang="scss" scoped>
.summary-card {
  padding: $spacing-lg;
  border-radius: $radius-lg;
  border: 1px solid $gray-200;
  background: $white;

  &--primary {
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    border-color: #93c5fd;
  }

  &--success {
    background: $success-light;
    border-color: #86efac;
  }

  &--danger {
    background: $danger-light;
    border-color: #fca5a5;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: $gray-600;
  }

  &__icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  &__value {
    font-size: $font-size-2xl;
    font-weight: 700;
    color: $gray-900;
  }
}
</style>
