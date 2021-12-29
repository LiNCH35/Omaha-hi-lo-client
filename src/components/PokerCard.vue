<template>
  <span class="poker-card">
    <span v-if="show" v-html="text" :style="{color}" />
    <span v-else v-html="`&#10720;`" />
  </span>
</template>

<script>

export default {
  name: 'PokerCard',
  props: {
    card: {
      default: 'd'
    },
    show: {
      default: false
    }
  },
  computed: {
    text() {
      return this.card
        .replace('10', 'T')
        .replace('11', 'J')
        .replace('12', 'Q')
        .replace('13', 'K')
        .replace('14', 'A')
        .replace('s', '&#9824;')
        .replace('h', '&#9829;')
        .replace('c', '&#9827;')
        .replace('d', '&#9830;')
    },
    color() {
      return this.card?.includes('h') || this.card?.includes('d') ? 'red' : 'black'
    },
  },
}
</script>

<style lang="scss" scoped>
.seat {
  text-align: center;
}
</style>
