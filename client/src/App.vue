<template>
  <div id="app">
    <AppHeader />
    <main class="main-content">
      <div class="container">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script>
import AppHeader from '@/components/layout/AppHeader.vue'

export default {
  name: 'App',
  components: {
    AppHeader
  }
}
</script>

<style lang="scss" scoped>
.main-content {
  padding: $spacing-lg 0;
  min-height: calc(100vh - 80px);
}
</style>
