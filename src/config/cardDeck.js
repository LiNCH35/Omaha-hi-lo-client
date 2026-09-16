const cardDeckValues = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const cardDeck = []
// Пики spades, Черви hearts, Крести/Трефы clubs, Бубны diamonds
const suits = ['s', 'h', 'c', 'd']

for (const suit of suits) {
  cardDeckValues.forEach(rank => cardDeck.push({ rank, suit }))
}

export default cardDeck