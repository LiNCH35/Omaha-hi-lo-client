<template>
  <Table :players="players" @update:players="players = $event" />
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
