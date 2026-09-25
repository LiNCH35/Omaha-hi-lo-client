<template>
  <Table />
</template>

<script setup>
import Table from './components/Table'
</script>

<style lang="scss">
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  height: 100%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

body {
  margin: 0;
  height: 100%;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  #app {
    height: 100%;
    color: #fff;
  }
}
</style>
