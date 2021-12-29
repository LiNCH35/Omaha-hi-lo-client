<template>
  <div class="seat">
    <p>{{ player.name }}</p>
    <p>
      <PokerCard v-for="(card, key) in player.cards" :key="key" :card="card" :show="true" />
    </p>
  </div>
</template>

<script>

import PokerCard from "./PokerCard";
export default {
  name: 'Seat',
  components: {PokerCard},
  props: {
    player: {
      default() {
        return {
          name: 'empty',
          cards: [],
          combinations: {
            hi: null,
            lo: null
          }
        }
      }
    },
  },

}
</script>

<style lang="scss" scoped>
.seat {
  text-align: center;
}
</style>
