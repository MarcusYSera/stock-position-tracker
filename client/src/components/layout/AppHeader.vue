<template>
  <header class="header">
    <div class="container">
      <div class="header__content">
        <div class="header__brand">
          <TrendingUp class="header__icon" />
          <h1 class="header__title">Stock Position Tracker</h1>
        </div>
      </div>
    </div>
  </header>
</template>

<script>
import { TrendingUp } from 'lucide-vue-next'

export default {
  name: 'AppHeader',
  components: {
    TrendingUp
  }
}
</script>

<style lang="scss" scoped>
.header {
  background: $white;
  box-shadow: $shadow-sm;
  border-bottom: 1px solid $gray-200;

  &__content {
    @include flex-between;
    padding: $spacing-md 0;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__icon {
    color: $primary;
    width: 2rem;
    height: 2rem;
  }

  &__title {
    font-size: $font-size-xl;
    font-weight: 700;
    color: $gray-900;
    margin: 0;
  }
}
</style>
