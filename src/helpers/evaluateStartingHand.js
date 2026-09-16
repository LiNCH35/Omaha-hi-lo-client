/**
 * Omaha Hi/Lo starting hand evaluator
 *
 * Поддерживает 4-7 карт на руках.
 *
 * Карта:
 *   { rank: "A", suit: "s" }
 *
 * suit:
 *   s = spades
 *   h = hearts
 *   d = diamonds
 *   c = clubs
 *
 * rank:
 *   A, K, Q, J, T, 9, 8, 7, 6, 5, 4, 3, 2
 *
 * ВАЖНО:
 * Это эвристическая PRE-FLOP оценка.
 * Она не является точным poker equity.
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

const RANK_VALUE = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "T": 10,
    "J": 11,
    "Q": 12,
    "K": 13,
    "A": 14
};


/* =========================================================
 * Utility
 * ======================================================= */

function combinations(array, size) {
    const result = [];

    function walk(start, current) {
        if (current.length === size) {
            result.push([...current]);
            return;
        }

        for (let i = start; i < array.length; i++) {
            current.push(array[i]);
            walk(i + 1, current);
            current.pop();
        }
    }

    walk(0, []);
    return result;
}


function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}


function average(values) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}


function normalize(value, min, max) {
    if (max === min) return 0;
    return clamp((value - min) / (max - min), 0, 1);
}


/* =========================================================
 * Card helpers
 * ======================================================= */

function rankValue(card) {
    return RANK_VALUE[card?.rank];
}


function isLowCard(card) {
    return rankValue(card) <= 8 || card.rank === "A";
}


function lowValue(card) {
    return card.rank === "A" ? 1 : rankValue(card);
}


/* =========================================================
 * LOW
 * ======================================================= */

/**
 * Оценивает пару карт с точки зрения Low.
 *
 * Чем меньше значения и чем больше разных low-комбинаций
 * можно построить, тем лучше.
 */
function evaluateLowPair(pair) {
    const [a, b] = pair;

    const va = lowValue(a);
    const vb = lowValue(b);

    const bothLow = isLowCard(a) && isLowCard(b);

    if (!bothLow) {
        return 0;
    }

    // Две одинаковые карты не могут одновременно
    // использоваться в Low.
    if (va === vb) {
        return 0;
    }

    let score = 0;

    const values = [va, vb].sort((a, b) => a - b);

    // A + 2 — главная low-комбинация
    if (values[0] === 1 && values[1] === 2) {
        score = 100;
    }

    // A3
    else if (values[0] === 1 && values[1] === 3) {
        score = 92;
    }

    // 23
    else if (values[0] === 2 && values[1] === 3) {
        score = 90;
    }

    // A4
    else if (values[0] === 1 && values[1] === 4) {
        score = 85;
    }

    // 24
    else if (values[0] === 2 && values[1] === 4) {
        score = 82;
    }

    // 25
    else if (values[0] === 2 && values[1] === 5) {
        score = 76;
    }

    // A5
    else if (values[0] === 1 && values[1] === 5) {
        score = 75;
    }

    // 34
    else if (values[0] === 3 && values[1] === 4) {
        score = 70;
    }

    // 35
    else if (values[0] === 3 && values[1] === 5) {
        score = 65;
    }

    // 45
    else if (values[0] === 4 && values[1] === 5) {
        score = 58;
    }

    // Остальные комбинации low
    else {
        const high = Math.max(...values);
        const spread = Math.abs(values[0] - values[1]);

        score = 65 - high * 4 - spread * 2;
    }

    return clamp(score);
}


/**
 * Насколько много low-карт в руке.
 */
function calculateLowDensity(hand) {
    const lowCards = hand.filter(isLowCard).length;

    // 4 карты:
    // 2 low уже хорошо.
    //
    // 5-7 карт:
    // дополнительные low дают backup.
    return clamp(
        normalize(lowCards, 1, Math.min(hand.length, 5)) * 100
    );
}


/**
 * Low redundancy.
 *
 * Например:
 *
 * A 2 K Q -> низкая redundancy
 * A 2 3 4 -> высокая redundancy
 *
 * Потому что A234 содержит много разных хороших пар.
 */
function calculateLowRedundancy(hand) {
    const pairs = combinations(hand, 2);

    const scores = pairs
        .map(evaluateLowPair)
        .filter(score => score > 0);

    if (!scores.length) {
        return 0;
    }

    // Количество usable low pairs
    const pairFactor = normalize(scores.length, 1, 8);

    // Среднее качество
    const qualityFactor = average(scores) / 100;

    return clamp(
        (pairFactor * 0.45 + qualityFactor * 0.55) * 100
    );
}


/**
 * Nut Low potential.
 */
function calculateNutLowPotential(hand) {
    const pairs = combinations(hand, 2);

    let best = 0;

    for (const pair of pairs) {
        best = Math.max(best, evaluateLowPair(pair));
    }

    return best;
}


/* =========================================================
 * HIGH
 * ======================================================= */

/**
 * Сила пары карт для High.
 *
 * Это не готовая комбинация — мы оцениваем потенциал.
 */
function evaluateHighPair(pair) {
    const [a, b] = pair;

    if (!a || !b) {
        return 0
    }

    const va = rankValue(a);
    const vb = rankValue(b);

    let score = 0;

    const highA = va >= 10;
    const highB = vb >= 10;

    // Высокие карты
    score += (va / 14) * 25;
    score += (vb / 14) * 25;

    // Pair
    if (va === vb) {
        if (va === 14) score += 45; // AA
        else if (va === 13) score += 40; // KK
        else if (va === 12) score += 34; // QQ
        else if (va === 11) score += 28; // JJ
        else score += 15;
    }

    // Suited
    if (a.suit === b.suit) {
        score += 15;
    }

    // Connectivity
    const diff = Math.abs(va - vb);

    if (diff === 1) score += 15;
    else if (diff === 2) score += 11;
    else if (diff === 3) score += 8;
    else if (diff === 4) score += 4;

    // Broadway
    if (highA && highB) {
        score += 10;
    }

    // A + high card
    if (
        (va === 14 && vb >= 10) ||
        (vb === 14 && va >= 10)
    ) {
        score += 15;
    }

    return clamp(score);
}


/**
 * Лучший High потенциал среди пар.
 */
function calculateHighPotential(hand) {
    const pairs = combinations(hand, 2);

    if (!pairs.length) return 0;

    const scores = pairs.map(evaluateHighPair);

    return Math.max(...scores);
}


/**
 * Средняя сила High пар.
 *
 * Это важно для 5-7 card Omaha:
 * наличие одной хорошей пары — хорошо,
 * но наличие нескольких хороших пар — намного лучше.
 */
function calculateHighRedundancy(hand) {
    const pairs = combinations(hand, 2);

    const scores = pairs.map(evaluateHighPair);

    const goodPairs = scores.filter(score => score >= 55).length;

    return clamp(
        normalize(goodPairs, 1, Math.min(8, pairs.length)) * 100
    );
}


/* =========================================================
 * SUITEDNESS
 * ======================================================= */

/**
 * Анализ мастей.
 */
function calculateSuitedness(hand) {
    const suits = {};

    for (const card of hand) {
        suits[card.suit] = (suits[card.suit] || 0) + 1;
    }

    const counts = Object.values(suits).sort((a, b) => b - a);

    if (!counts.length) return 0;

    // Нам особенно интересны пары одной масти,
    // потому что в Omaha нужно использовать ровно
    // две карты руки.
    let score = 0;

    for (const count of counts) {
        if (count >= 2) {
            score += Math.min(count, 4) * 15;
        }
    }

    // Чем больше карт одной масти, тем больше
    // потенциальных suited pairs.
    return clamp(score);
}


/**
 * Есть ли сильная suited пара?
 */
function calculateNutSuitPotential(hand) {
    const pairs = combinations(hand, 2);

    let best = 0;

    for (const [a, b] of pairs) {
        if (a.suit !== b.suit) continue;

        const values = [rankValue(a), rankValue(b)];

        let score = 0;

        if (values.includes(14)) score += 60;
        if (values.includes(13)) score += 25;
        if (values.includes(12)) score += 15;
        if (values.includes(11)) score += 10;

        // Suited connector
        const diff = Math.abs(values[0] - values[1]);

        if (diff === 1) score += 15;
        else if (diff === 2) score += 10;

        best = Math.max(best, score);
    }

    return clamp(best);
}


/* =========================================================
 * CONNECTIVITY
 * ======================================================= */

function pairConnectivity(pair) {
    const [a, b] = pair;

    const va = rankValue(a);
    const vb = rankValue(b);

    const diff = Math.abs(va - vb);

    if (diff === 1) return 100;
    if (diff === 2) return 85;
    if (diff === 3) return 70;
    if (diff === 4) return 50;
    if (diff === 5) return 30;

    return 10;
}


function calculateConnectivity(hand) {
    const pairs = combinations(hand, 2);

    const scores = pairs.map(pairConnectivity);

    return average(scores);
}


/* =========================================================
 * BROADWAY
 * ======================================================= */

function calculateBroadwayPotential(hand) {
    let score = 0;

    for (const card of hand) {
        const value = rankValue(card);

        if (value === 14) score += 25; // A
        else if (value === 13) score += 18; // K
        else if (value === 12) score += 15; // Q
        else if (value === 11) score += 12; // J
        else if (value === 10) score += 8; // T
    }

    return clamp(score);
}


/* =========================================================
 * PAIR VALUE
 * ======================================================= */

function calculatePairValue(hand) {
    const counts = {};

    for (const card of hand) {
        counts[card.rank] = (counts[card.rank] || 0) + 1;
    }

    let score = 0;

    for (const [rank, count] of Object.entries(counts)) {
        if (count < 2) continue;

        const value = RANK_VALUE[rank];

        if (value === 14) score += 45;
        else if (value === 13) score += 40;
        else if (value === 12) score += 35;
        else if (value === 11) score += 30;
        else if (value >= 9) score += 20;
        else score += 8;
    }

    return clamp(score);
}


/* =========================================================
 * LOW + HIGH INTERACTION
 * ======================================================= */

/**
 * Оценивает способность руки одновременно участвовать
 * в High и Low.
 *
 * Это один из важнейших показателей для Hi/Lo.
 */
function calculateScoopPotential(hand) {
    const low = calculateNutLowPotential(hand);
    const lowBackup = calculateLowRedundancy(hand);

    const high = calculateHighPotential(hand);
    const suited = calculateNutSuitPotential(hand);
    const connectivity = calculateConnectivity(hand);

    /*
     * Low сам по себе не означает scoop.
     *
     * Для scoop нужны:
     *   хороший Low
     *   + хороший High potential
     *   + желательно nut potential
     */

    const lowFactor = low / 100;
    const backupFactor = lowBackup / 100;

    const highFactor = high / 100;
    const suitFactor = suited / 100;
    const connectionFactor = connectivity / 100;

    const score =
        lowFactor * 35 +
        backupFactor * 20 +
        highFactor * 25 +
        suitFactor * 12 +
        connectionFactor * 8;

    return clamp(score);
}


/* =========================================================
 * MAIN EVALUATOR
 * ======================================================= */

function evaluateStartingHand(hand) {
    if (!Array.isArray(hand)) {
        throw new Error("hand must be an array");
    }

    if (hand.length < 4 || hand.length > 7) {
        throw new Error("Omaha hand must contain 4-7 cards");
    }

    const highPotential = calculateHighPotential(hand);
    const lowPotential = calculateNutLowPotential(hand);
    const lowRedundancy = calculateLowRedundancy(hand);
    const highRedundancy = calculateHighRedundancy(hand);

    const connectivity = calculateConnectivity(hand);
    const suitedness = calculateSuitedness(hand);

    const nutSuitPotential = calculateNutSuitPotential(hand);
    const broadwayPotential = calculateBroadwayPotential(hand);
    const pairValue = calculatePairValue(hand);

    const scoopPotential = calculateScoopPotential(hand);

    /*
     * Итоговый score.
     *
     * Для Hi/Lo Low и Scoop имеют повышенный вес.
     */
    let overall =
        highPotential * 0.18 +
        lowPotential * 0.20 +
        lowRedundancy * 0.12 +
        highRedundancy * 0.07 +
        connectivity * 0.08 +
        suitedness * 0.08 +
        nutSuitPotential * 0.07 +
        broadwayPotential * 0.05 +
        pairValue * 0.05 +
        scoopPotential * 0.10;

    /*
     * Штраф за руку без Low потенциала.
     *
     * Omaha Hi/Lo обычно очень сильно выигрывает
     * от возможности бороться за обе половины банка.
     */
    if (lowPotential === 0) {
        overall *= 0.78;
    }

    /*
     * Бонус за очень хороший Low + High одновременно.
     */
    if (lowPotential >= 85 && highPotential >= 65) {
        overall += 7;
    }

    /*
     * Бонус за сильный scoop potential.
     */
    if (scoopPotential >= 75) {
        overall += 5;
    }

    overall = clamp(overall);

    return {
        cards: hand,

        overall: Math.round(overall * 100) / 100,

        high: {
            potential: Math.round(highPotential * 100) / 100,
            redundancy: Math.round(highRedundancy * 100) / 100,
            pairValue: Math.round(pairValue * 100) / 100,
            broadway: Math.round(broadwayPotential * 100) / 100
        },

        low: {
            potential: Math.round(lowPotential * 100) / 100,
            redundancy: Math.round(lowRedundancy * 100) / 100
        },

        draw: {
            scoop: Math.round(scoopPotential * 100) / 100,
            connectivity: Math.round(connectivity * 100) / 100,
            suitedness: Math.round(suitedness * 100) / 100,
            nutSuit: Math.round(nutSuitPotential * 100) / 100
        }
    };
}


/* =========================================================
 * EXAMPLES
 * ======================================================= */

const hands = {

    // Очень сильная Hi/Lo структура
    A234: [
        { rank: "A", suit: "s" },
        { rank: "2", suit: "s" },
        { rank: "3", suit: "d" },
        { rank: "4", suit: "d" }
    ],

    // A2 + double suited
    A2KQ: [
        { rank: "A", suit: "s" },
        { rank: "2", suit: "s" },
        { rank: "K", suit: "d" },
        { rank: "Q", suit: "d" }
    ],

    // Сильный High, слабый Low
    AKQJ: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
        { rank: "Q", suit: "d" },
        { rank: "J", suit: "d" }
    ],

    // Плохой disconnected вариант
    A7KQ: [
        { rank: "A", suit: "s" },
        { rank: "7", suit: "h" },
        { rank: "K", suit: "c" },
        { rank: "Q", suit: "d" }
    ],

    // Пример 6 карт
    sixCards: [
        { rank: "A", suit: "s" },
        { rank: "2", suit: "s" },
        { rank: "3", suit: "d" },
        { rank: "4", suit: "d" },
        { rank: "K", suit: "h" },
        { rank: "Q", suit: "h" }
    ],

    // Пример 7 карт
    sevenCards: [
        { rank: "A", suit: "s" },
        { rank: "2", suit: "s" },
        { rank: "3", suit: "d" },
        { rank: "4", suit: "d" },
        { rank: "K", suit: "h" },
        { rank: "Q", suit: "h" },
        { rank: "J", suit: "c" }
    ]
};


// Комментируем тестовый код для использования в продакшене
// for (const [name, hand] of Object.entries(hands)) {
//     console.log(name);
//     console.log(evaluateStartingHand(hand));
// }

export { evaluateStartingHand };
