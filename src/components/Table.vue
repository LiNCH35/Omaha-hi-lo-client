<template>
  <div class="room">
    <div class="table">
      <template v-for="(player, k) in players" :key="player">
        <seat
          :player="player"
          :class="`player-seat seat-${getSeatPost(k)}`"
        />
      </template>
<!--      <span v-html="cardDeck" />-->
      <div class="board">
        boardCards
        <PokerCard
          v-for="(card, key) in boardCards"
          :key="key"
          :card="card"
          :show="true"
        />
      </div>
    </div>
    <div class="interface">
      <button @click="next" style="font-size: 20px">next</button>
      <button @click="calc" style="font-size: 20px">calc</button>
    </div>
  </div>
</template>

<script>
import cardDeck from "../config/cardDeck";
import gcd from "../helpers/gcd";
import shuffle from "../helpers/shuffle";
import Seat from "./Seat";
import PokerCard from "./PokerCard";
import getHandHash from "@/helpers/hand";

export default {
  name: 'Table',
  components: {PokerCard, Seat},
  props: {
    placeCount: {
      default: 8
    },
    players: {
      default() {
        return []
      }
    },
    msg: String
  },

  data() {
    return {
      cardDeck: cardDeck,
      boardCards: [],
      /** @var ''|'preflop'|'flop'|'tern'|'river'|'end' */
      step: ''
    }
  },
  methods: {
    getSeatPost(i) {
      const length = this.placeCount
      const gcdValue = gcd(i, length)
      return `${i/gcdValue}of${length/gcdValue}`
    },

    shuffle() {
      this.cardDeck = shuffle(this.cardDeck)
    },

    next() {
      console.log('next')
      if (this.step === '') {
        return this.start()
      }
      if (this.step === 'preflop') {
        return this.openFlop()
      }
      if (this.step === 'flop') {
        return this.openTurn()
      }
      if (this.step === 'turn') {
        return this.openRiver()
      }
      if (this.step === 'river') {
        return this.endGame()
      }
    },

    start() {
      this.shuffle()
      this.players.forEach(player => {
        for (let i = 0; i < 4; i++) {
          player.cards.push(this.cardDeck.pop())
          player.combinations = { hi: null, lo: null }
        }
      })
      this.updatePlayers({...this.players})
      this.step = 'preflop'
    },

    openFlop() {
      for (let i = 0; i < 3; i++) {
        this.boardCards.push(this.cardDeck.pop())
      }
      this.step = 'flop'
    },
    openTurn() {
      this.boardCards.push(this.cardDeck.pop())
      this.step = 'turn'
    },
    openRiver() {
      this.boardCards.push(this.cardDeck.pop())
      this.step = 'river'
    },
    endGame() {
      this.step = 'end'
      this.players.forEach(player => {
        player.combinations = {}
      })
    },

    updatePlayers(value) {
      this.$emit('input:players', value)
    },

    calc() {
      // console.log(this.bestCombo(['5s','5s','6d','4s','4s']))
      // return
      let res = new Set()
      let i = 0
      cardDeck.forEach(c1 => {
        cardDeck.forEach(c2 => {
          cardDeck.forEach(c3 => {
            cardDeck.forEach(c4 => {
              cardDeck.forEach(c5 => {
                res.add(getHandHash([c1, c2, c3, c4, c5]))
                i++
                console.log(res.size, i)
                // const comb = [c1,c2,c3,c4,c5].sort().join('')
                // res[comb] = this.bestCombo([c1,c2,c3,c4,c5])
                // console.log(res)
                // return
              })
            })
          })
        })
      })
    },

    bestCombo(cards) {
      const values = cards.map(c => c[0])
      const suits = cards.map(c => c[1])
      const valuesSet = new Set(values)
      const suitsSet = new Set(suits)
      let isStreet = valuesSet.size === 5 && values[4] - values[0] === 4
      let isFlush = suitsSet.size === 1

      if (isStreet && isFlush) {
        return `street flush, ${values[4]}`
      }
      if (isFlush) {
        return `flush, ${values.join('_')}`
      }
      if (isStreet) {
        return `street ${values[4]}`
      }

      if (valuesSet.size !== 5) {
        let maxRepeats = 0
        let currentRepeats = 1
        let repeatsValues = []

        for (let i = 1; i < 6; i++) {
          if (values[i] === values[i - 1]) {
            currentRepeats++
          } else {
            if (currentRepeats > 1) {
              repeatsValues[values[i - 1]] = currentRepeats
              if (currentRepeats > maxRepeats) {
                maxRepeats = currentRepeats
              }
            }
            currentRepeats = 1
          }
        }

        const kare = Object.keys(repeatsValues).find(key => repeatsValues[key] === 4)
        const set = Object.keys(repeatsValues).find(key => repeatsValues[key] === 3)
        let pairs = Object.keys(repeatsValues).filter(key => repeatsValues[key] === 2)

        if (kare) {
          return `kare, ${kare}`
        }
        if (set && pairs.length) {
          return `full house, ${set}_${pairs[0]}`
        }
        if (set) {
          return `set, ${set}`
        }
        if (pairs.length === 2) {
          pairs = pairs.sort((a, b) => b-a)
          console.log({pairs})
          return `2 pairs, ${pairs[0]}_${pairs[1]}`
        }
        if (pairs.length === 1) {
          return `pair, ${pairs[0]}`
        }
      }

      return `height card ${cards[4]}`
    }
  }
}
</script>

<style lang="scss" scoped>
.room {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  .table {
    width: 850px;
    min-height: 500px;
    background-color: darkgreen;
    border-radius: 50%;
    border: solid 10px chocolate;
    box-sizing: border-box;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;

    .player-seat {
      position: absolute;
      transform: translate(-50%, -50%);
      font-weight: bold;
      font-size: 20px;
      width: 100px;
      height: 100px;
    }
    .seat {
      &-0of1 {
        color: red;
        left: 50%;
        bottom: -32%;
      }

      &-1of2 {
        left: 50%;
        top: -12%;
      }
      &-1of4 {
        left: -60px;
        top: 50%;
      }
      &-3of4 {
        right: -160px;
        top: 50%;
      }

      &-1of8 {
        left: 6%;
        bottom: -10%;
      }
      &-3of8 {
        left: 6%;
        top: 8%;
      }
      &-5of8 {
        right: -6%;
        top: 8%;
      }
      &-7of8 {
        right: -6%;
        bottom: -10%;
      }
    }
  }

  .board {
    width: 60%;
    height: 80px;
  }

  .interface {
    position: fixed;
    bottom: 0;
    right: 0;
  }
}
</style>
