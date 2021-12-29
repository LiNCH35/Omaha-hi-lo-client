const cardDeckValues = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14']
const cardDeck = []
// Пики spades, Черви hearts, Крести/Трефы clubs, Бубны diamonds
// for (const suit of ['&#9824;', '&#9829;', '&#9827;', '&#9830;']) {
for (const suit of ['s', 'h', 'c', 'd']) {
  cardDeckValues.forEach(v => cardDeck.push(`${v}${suit}`))
}
// console.log(cardDeck)
export default cardDeck