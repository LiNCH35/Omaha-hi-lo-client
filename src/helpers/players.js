const COMPUTER_NAME = 'Computer'
const PLAYER_NAME = 'Player'
const DEFAULT_CHIPS = 1000

export function createDefaultPlayers(settings = {length: 8, hasPlayer: true}) {
  const result = []

  for (let i = 0; i < settings.length; i++) {
    result.push({
      name: `${COMPUTER_NAME} ${i + 1}`,
      cards: [],
      winPercentage: 0,
      lowWinPercentage: 0,
      chips: DEFAULT_CHIPS
    })
  }

  if (settings.hasPlayer) {
    result[0].name = result[0].name.replace(COMPUTER_NAME, PLAYER_NAME)
  }

  return result
}
