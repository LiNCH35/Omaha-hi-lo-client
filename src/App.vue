<template>
  <Table :players="players" @input:players="players = $event" />
</template>

<script>
import Table from "./components/Table"

export default {
  name: 'App',
  components: {
    Table
  },

  data() {
    return {
      players: [
        {
          name: 'Player 1',
          cards: []
        },
        {
          name: 'Player 2',
          cards: []
        },
        {
          name: 'Player 3',
          cards: []
        },
        {
          name: 'Player 4',
          cards: []
        },
        {
          name: 'Player 5',
          cards: []
        },
        {
          name: 'Player 6',
          cards: []
        },
        {
          name: 'Player 7',
          cards: []
        },
        {
          name: 'Player 8',
          cards: []
        },
      ]
    }
  }
}
</script>

<style lang="scss">
html {
  height: 100%;
  background-color: whitesmoke;
}

body {
  margin: 0;
  height: 100%;
  #app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: center;
    color: #2c3e50;
    height: 100%;
  }
}
</style>
