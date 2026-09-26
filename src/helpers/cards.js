export const SUIT_SYMBOLS = {
  s: '♠',
  h: '♥',
  c: '♣',
  d: '♦'
}

export const RANK_VALUES = {
  'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10,
  '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
}

export function isRedSuit(suit) {
  return suit === 'h' || suit === 'd'
}

export function isSameCard(a, b) {
  return Boolean(a && b) && a.rank === b.rank && a.suit === b.suit
}

export function isCardInHand(card, hand) {
  if (!card || !Array.isArray(hand)) {
    return false
  }
  return hand.some(c => isSameCard(c, card))
}
