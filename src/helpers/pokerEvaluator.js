import { evaluateCardCodes, cardCodes, rankDescription, handRank } from 'phe'

/**
 * Конвертирует внутренний формат карт в формат phe
 * Внутренний формат: "14s" (туз пик), "13h" (король червей)
 * Формат phe: "As", "Kh"
 */
function convertCardToPheFormat(card) {
  const value = card.substring(0, card.length - 1)
  const suit = card[card.length - 1]
  
  // Конвертация значений
  const valueMap = {
    '14': 'A',
    '13': 'K', 
    '12': 'Q',
    '11': 'J',
    '10': 'T'
  }
  
  const pheValue = valueMap[value] || value
  
  // Конвертация мастей
  const suitMap = {
    's': 's', // spades
    'h': 'h', // hearts  
    'c': 'c', // clubs
    'd': 'd'  // diamonds
  }
  
  return pheValue + suitMap[suit]
}

/**
 * Оценивает 5-карточную руку используя Perfect Hash
 * @param {Array} cards - массив карт в формате ["14s", "13h", ...]
 * @returns {Object} объект с рангом и описанием руки
 */
export function evaluateFiveCardHand(cards) {
  if (cards.length !== 5) {
    throw new Error('Требуется ровно 5 карт для оценки')
  }
  
  const pheCards = cards.map(convertCardToPheFormat)
  
  try {
    // Сначала конвертируем строковые карты в числовые коды
    const cardCodesArray = cardCodes(pheCards)
    
    // Оцениваем по числовым кодам
    const score = evaluateCardCodes(cardCodesArray)
    
    // Используем специальную функцию handRank для получения категории
    const category = handRank(score)
    const description = rankDescription[category]
    
    return {
      score, // Меньший score = сильнее рука
      rank: category, // Меньшая категория = сильнее комбинация
      description,
      cards: pheCards.join(' ')
    }
  } catch (e) {
    throw new Error('Не удалось оценить руку с помощью phe: ' + e.message)
  }
}

/**
 * Оценивает руку в зависимости от количества карт игрока
 * @param {Array} playerCards - карты игрока (2, 4, 6 или 7)
 * @param {Array} boardCards - общие карты
 * @param {Boolean} evaluateLow - нужно ли оценивать low комбинацию
 * @returns {Object} лучшая комбинация
 */
export function evaluateHand(playerCards, boardCards, evaluateLow = false) {
  if (boardCards.length < 3) {
    return { bestHand: null, description: 'Недостаточно карт на столе' }
  }
  
  const cardCount = playerCards.length
  
  // Для 2 карт (Hold'em): 2 карманные + 3 из общих
  if (cardCount === 2) {
    return evaluateHoldemHand(playerCards, boardCards, evaluateLow)
  }

  // Для 4 карт (Omaha): 2 из 4 карманных + 3 из 5 общих
  if (cardCount === 4) {
    return evaluateOmahaHand(playerCards, boardCards, evaluateLow)
  }

  // Для 6 карт: 2 из 6 карманных + 3 из 5 общих
  if (cardCount === 6) {
    return evaluateSixCardHand(playerCards, boardCards, evaluateLow)
  }

  // Для 7 карт: 2 из 7 карманных + 3 из 5 общих
  if (cardCount === 7) {
    return evaluateSevenCardHand(playerCards, boardCards, evaluateLow)
  }
  
  return { bestHand: null, description: 'Неподдерживаемое количество карт' }
}

/**
 * Оценивает руку Hold'em (2 карты)
 */
function evaluateHoldemHand(playerCards, boardCards, evaluateLow = false) {
  let bestScore = Infinity
  let bestHand = null
  let bestDescription = ''
  let bestRank = Infinity

  let lowHand = null
  let lowDescription = null
  let lowScore = Infinity

  // Перебираем все комбинации 3 карт из общих
  const boardCombinations = getCombinations(boardCards, 3)

  for (const boardCombo of boardCombinations) {
    const hand = [...playerCards, ...boardCombo]

    if (hand.length === 5) {
      try {
        const result = evaluateFiveCardHand(hand)
        if (result.score < bestScore) {
          bestScore = result.score
          bestRank = result.rank
          bestHand = hand
          bestDescription = result.description
        }

        // Оцениваем low комбинацию если нужно
        if (evaluateLow) {
          const lowResult = evaluateLowHand(hand)
          if (lowResult && lowResult.score < lowScore) {
            lowScore = lowResult.score
            lowHand = lowResult.hand
            lowDescription = lowResult.description
          }
        }
      } catch (e) {
        console.error('Ошибка оценки руки:', e)
      }
    }
  }

  return {
    bestHand,
    description: bestDescription,
    rank: bestRank,
    score: bestScore,
    lowHand,
    lowDescription,
    lowScore
  }
}

/**
 * Оценивает low комбинацию (8-or-better)
 * Для low нужно 5 карт с номиналом 8 или ниже, без пар
 * @param {Array} hand - 5 карт
 * @returns {Object|null} информация о low комбинации или null если нет low
 */
function evaluateLowHand(hand) {
  if (hand.length !== 5) {
    return null
  }

  // Извлекаем значения карт (убираем масть)
  const values = hand.map(card => parseInt(card.substring(0, card.length - 1)))

  // Конвертируем туз (14) в 1 для low оценки
  const lowValues = values.map(v => v === 14 ? 1 : v)

  // Проверяем, что все карты 8 или ниже (туз уже конвертирован в 1)
  if (lowValues.some(v => v > 8)) {
    return null
  }

  // Проверяем на пары (для low не должно быть пар)
  const uniqueValues = new Set(lowValues)
  if (uniqueValues.size !== 5) {
    return null
  }

  // Сортируем по возрастанию для low
  const sortedValues = [...uniqueValues].sort((a, b) => a - b)

  // Вычисляем score (меньший = лучше для low)
  // Используем шестнадцатеричную систему для правильного сравнения
  // Например: A-2-3-4-5 лучше чем 2-3-4-5-6
  let score = 0
  sortedValues.forEach((value, index) => {
    score += value * Math.pow(16, 4 - index)
  })

  // Формируем описание (для отображения туз как A, даже если он считается как 1)
  const valueNames = sortedValues.map(v => {
    // Для отображения конвертируем 1 обратно в A (если это был туз)
    if (v === 1) return 'A'
    if (v === 13) return 'K'
    if (v === 12) return 'Q'
    if (v === 11) return 'J'
    if (v === 10) return 'T'
    return v.toString()
  }).join('-')

  return {
    hand,
    description: valueNames,
    score
  }
}

/**
 * Оценивает руку Omaha Hi-Lo
 * Для Omaha нужно выбрать 2 карты из 4 карманных и 3 из 5 общих
 */
function evaluateOmahaHand(playerCards, boardCards, evaluateLow = false) {
  let bestScore = Infinity
  let bestHand = null
  let bestDescription = ''
  let bestRank = Infinity

  let lowHand = null
  let lowDescription = null
  let lowScore = Infinity

  // Перебираем все комбинации 2 карт из 4 карманных
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const pocketCards = [playerCards[i], playerCards[j]]

      // Перебираем все комбинации 3 карт из общих
      const boardCombinations = getCombinations(boardCards, 3)

      for (const boardCombo of boardCombinations) {
        const hand = [...pocketCards, ...boardCombo]

        if (hand.length === 5) {
          try {
            const result = evaluateFiveCardHand(hand)
            if (result.score < bestScore) {
              bestScore = result.score
              bestRank = result.rank
              bestHand = hand
              bestDescription = result.description
            }

            // Оцениваем low комбинацию если нужно
            if (evaluateLow) {
              const lowResult = evaluateLowHand(hand)
              if (lowResult && lowResult.score < lowScore) {
                lowScore = lowResult.score
                lowHand = lowResult.hand
                lowDescription = lowResult.description
              }
            }
          } catch (e) {
            console.error('Ошибка оценки руки:', e)
          }
        }
      }
    }
  }

  return {
    bestHand,
    description: bestDescription,
    rank: bestRank,
    score: bestScore,
    lowHand,
    lowDescription,
    lowScore
  }
}

/**
 * Оценивает руку с 6 картами (2 из 6 + 3 из 5)
 */
function evaluateSixCardHand(playerCards, boardCards, evaluateLow = false) {
  let bestScore = Infinity
  let bestHand = null
  let bestDescription = ''
  let bestRank = Infinity

  let lowHand = null
  let lowDescription = null
  let lowScore = Infinity

  // Перебираем все комбинации 2 карт из 6 карманных
  const pocketCombinations = getCombinations(playerCards, 2)

  for (const pocketCards of pocketCombinations) {
    // Перебираем все комбинации 3 карт из общих
    const boardCombinations = getCombinations(boardCards, 3)

    for (const boardCombo of boardCombinations) {
      const hand = [...pocketCards, ...boardCombo]

      if (hand.length === 5) {
        try {
          const result = evaluateFiveCardHand(hand)
          if (result.score < bestScore) {
            bestScore = result.score
            bestRank = result.rank
            bestHand = hand
            bestDescription = result.description
          }

          // Оцениваем low комбинацию если нужно
          if (evaluateLow) {
            const lowResult = evaluateLowHand(hand)
            if (lowResult && lowResult.score < lowScore) {
              lowScore = lowResult.score
              lowHand = lowResult.hand
              lowDescription = lowResult.description
            }
          }
        } catch (e) {
          console.error('Ошибка оценки руки:', e)
        }
      }
    }
  }

  return {
    bestHand,
    description: bestDescription,
    rank: bestRank,
    score: bestScore,
    lowHand,
    lowDescription,
    lowScore
  }
}

/**
 * Оценивает руку с 7 картами (2 из 7 + 3 из 5)
 */
function evaluateSevenCardHand(playerCards, boardCards, evaluateLow = false) {
  let bestScore = Infinity
  let bestHand = null
  let bestDescription = ''
  let bestRank = Infinity

  let lowHand = null
  let lowDescription = null
  let lowScore = Infinity

  // Перебираем все комбинации 2 карт из 7 карманных
  const pocketCombinations = getCombinations(playerCards, 2)

  for (const pocketCards of pocketCombinations) {
    // Перебираем все комбинации 3 карт из общих
    const boardCombinations = getCombinations(boardCards, 3)

    for (const boardCombo of boardCombinations) {
      const hand = [...pocketCards, ...boardCombo]

      if (hand.length === 5) {
        try {
          const result = evaluateFiveCardHand(hand)
          if (result.score < bestScore) {
            bestScore = result.score
            bestRank = result.rank
            bestHand = hand
            bestDescription = result.description
          }

          // Оцениваем low комбинацию если нужно
          if (evaluateLow) {
            const lowResult = evaluateLowHand(hand)
            if (lowResult && lowResult.score < lowScore) {
              lowScore = lowResult.score
              lowHand = lowResult.hand
              lowDescription = lowResult.description
            }
          }
        } catch (e) {
          console.error('Ошибка оценки руки:', e)
        }
      }
    }
  }

  return {
    bestHand,
    description: bestDescription,
    rank: bestRank,
    score: bestScore,
    lowHand,
    lowDescription,
    lowScore
  }
}

/**
 * Определяет победителя среди игроков
 * @param {Array} players - массив игроков с картами
 * @param {Array} boardCards - общие карты
 * @param {Boolean} evaluateLow - нужно ли оценивать low комбинации
 * @returns {Object} информация о победителе
 */
export function determineWinner(players, boardCards, evaluateLow = false) {
  if (boardCards.length < 5) {
    return { winner: null, message: 'Игра еще не завершена' }
  }

  let bestScore = Infinity
  let winners = []

  let lowBestScore = Infinity
  let lowWinners = []

  for (const player of players) {
    if (player.cards.length >= 2) {
      const result = evaluateHand(player.cards, boardCards, evaluateLow)

      if (result.bestHand) {
        player.bestHand = result.bestHand
        player.handDescription = result.description
        player.handRank = result.rank
        player.handScore = result.score

        // Сравниваем по точному score для правильного определения силы
        if (result.score < bestScore) {
          bestScore = result.score
          winners = [player]
        } else if (result.score === bestScore) {
          winners.push(player)
        }

        // Low комбинации
        if (evaluateLow && result.lowHand) {
          player.lowHand = result.lowHand
          player.lowDescription = result.lowDescription
          player.lowScore = result.lowScore

          if (result.lowScore < lowBestScore) {
            lowBestScore = result.lowScore
            lowWinners = [player]
          } else if (result.lowScore === lowBestScore) {
            lowWinners.push(player)
          }
        } else {
          player.lowHand = null
          player.lowDescription = null
          player.lowScore = null
        }
      }
    }
  }

  return {
    winners,
    isSplit: winners.length > 1,
    bestScore,
    lowWinners,
    lowIsSplit: lowWinners.length > 1,
    lowBestScore
  }
}

/**
 * Вспомогательная функция для получения комбинаций
 */
function getCombinations(array, size) {
  const result = []
  
  function combine(start, combo) {
    if (combo.length === size) {
      result.push([...combo])
      return
    }
    
    for (let i = start; i < array.length; i++) {
      combo.push(array[i])
      combine(i + 1, combo)
      combo.pop()
    }
  }
  
  combine(0, [])
  return result
}

/**
 * Конвертирует описание руки на русский язык
 */
export function translateHandDescription(description) {
  const translations = {
    'Royal Flush': 'Роял-флеш',
    'Straight Flush': 'Стрит-флеш', 
    'Four of a Kind': 'Каре',
    'Full House': 'Фулл-хаус',
    'Flush': 'Флеш',
    'Straight': 'Стрит',
    'Three of a Kind': 'Сет (тройка)',
    'Two Pair': 'Две пары',
    'One Pair': 'Пара',
    'High Card': 'Старшая карта'
  }
  
  return translations[description] || description
}