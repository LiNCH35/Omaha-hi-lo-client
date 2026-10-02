const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

/*
  Card encoding:
    card = rank * 4 + suit

  rank: 0..12 = 2..A
  suit: 0..3  = c,d,h,s

  Examples:
    2c = 0
    2d = 1
    As = 51
*/

function card(rank, suit) {
    return rank * 4 + suit;
}

function rankOf(c) {
    return c >> 2;
}

function suitOf(c) {
    return c & 3;
}

function parseCard(str) {
    const r = RANKS.indexOf(str[0]);
    const s = SUITS.indexOf(str[1]);

    if (r < 0 || s < 0) {
        throw new Error(`Invalid card: ${str}`);
    }

    return card(r, s);
}

function cardToString(c) {
    return RANKS[rankOf(c)] + SUITS[suitOf(c)];
}

/* ---------------------------------------------------------
   5-card HIGH evaluator

   Returns a comparable integer.
   Higher = better.

   Category:
     8 straight flush
     7 quads
     6 full house
     5 flush
     4 straight
     3 trips
     2 two pair
     1 pair
     0 high card
--------------------------------------------------------- */

function evaluate5High(a, b, c, d, e) {
    const cards = [a, b, c, d, e];

    const counts = new Int8Array(13);
    const suits = new Int8Array(4);

    for (const x of cards) {
        counts[rankOf(x)]++;
        suits[suitOf(x)]++;
    }

    // Flush
    let flush = false;
    for (let s = 0; s < 4; s++) {
        if (suits[s] === 5) {
            flush = true;
            break;
        }
    }

    // Straight.
    // highStraight = rank of highest card in straight.
    // 3 means A2345 (wheel).
    let straightHigh = -1;

    // A2345
    if (
        counts[12] &&
        counts[0] &&
        counts[1] &&
        counts[2] &&
        counts[3]
    ) {
        straightHigh = 3;
    }

    for (let r = 12; r >= 4; r--) {
        if (
            counts[r] &&
            counts[r - 1] &&
            counts[r - 2] &&
            counts[r - 3] &&
            counts[r - 4]
        ) {
            straightHigh = r;
            break;
        }
    }

    if (flush && straightHigh >= 0) {
        return 8_000_000 + straightHigh;
    }

    // Quads
    let quad = -1;
    let quadKicker = -1;

    for (let r = 12; r >= 0; r--) {
        if (counts[r] === 4) {
            quad = r;
            break;
        }
    }

    if (quad >= 0) {
        for (let r = 12; r >= 0; r--) {
            if (r !== quad && counts[r]) {
                quadKicker = r;
                break;
            }
        }

        return 7_000_000 + quad * 13 + quadKicker;
    }

    // Full house
    let trips = -1;
    let pair = -1;

    for (let r = 12; r >= 0; r--) {
        if (counts[r] >= 3) {
            trips = r;
            break;
        }
    }

    if (trips >= 0) {
        for (let r = 12; r >= 0; r--) {
            if (r !== trips && counts[r] >= 2) {
                pair = r;
                break;
            }
        }
    }

    if (trips >= 0 && pair >= 0) {
        return 6_000_000 + trips * 13 + pair;
    }

    // Flush
    if (flush) {
        let value = 5_000_000;
        let mul = 1;

        for (let r = 0; r <= 12; r++) {
            if (counts[r]) {
                value += r * mul;
                mul *= 13;
            }
        }

        return value;
    }

    // Straight
    if (straightHigh >= 0) {
        return 4_000_000 + straightHigh;
    }

    // Trips
    if (trips >= 0) {
        let value = 3_000_000 + trips * 169;

        let mul = 13;
        for (let r = 12; r >= 0; r--) {
            if (r !== trips && counts[r]) {
                value += r * mul;
                mul *= 13;
            }
        }

        return value;
    }

    // Two pair
    let p1 = -1;
    let p2 = -1;

    for (let r = 12; r >= 0; r--) {
        if (counts[r] >= 2) {
            if (p1 < 0) p1 = r;
            else {
                p2 = r;
                break;
            }
        }
    }

    if (p2 >= 0) {
        let kicker = -1;

        for (let r = 12; r >= 0; r--) {
            if (r !== p1 && r !== p2 && counts[r]) {
                kicker = r;
                break;
            }
        }

        return 2_000_000 + p1 * 169 + p2 * 13 + kicker;
    }

    // One pair
    if (p1 >= 0) {
        let value = 1_000_000 + p1 * 2197;
        let mul = 169;

        for (let r = 12; r >= 0; r--) {
            if (r !== p1 && counts[r]) {
                value += r * mul;
                mul *= 13;
            }
        }

        return value;
    }

    // High card
    let value = 0;
    let mul = 1;

    for (let r = 0; r <= 12; r++) {
        if (counts[r]) {
            value += r * mul;
            mul *= 13;
        }
    }

    return value;
}


/* ---------------------------------------------------------
   LOW evaluator

   Omaha Hi-Lo low:
     - exactly 5 cards
     - 5 different ranks
     - all ranks <= 8
     - A counts as 1
     - lower is better

   Returns:
     0 = no low
     >0 = comparable low value

   Smaller value = better low.

   Encoding:
     highest rank gets highest significance.

   A2345 => 0x...
--------------------------------------------------------- */

function evaluate5Low(a, b, c, d, e) {
    const ranks = [
        rankOf(a),
        rankOf(b),
        rankOf(c),
        rankOf(d),
        rankOf(e),
    ];

    // A counts as 1, 2..8 stay 2..8, 9+ is not a low.
    const lowValues = ranks.map(r => (r === 12 ? 1 : r + 2));

    if (lowValues.some(v => v > 8)) return 0;

    let mask = 0;

    for (const v of lowValues) {
        const bit = 1 << v;

        if (mask & bit) return 0;
        mask |= bit;
    }

    if (popcount(mask) !== 5) return 0;

    // Extract ranks descending.
    const values = [];

    for (let v = 8; v >= 1; v--) {
        if (mask & (1 << v)) values.push(v);
    }

    if (values.length !== 5) return 0;

    // Smaller is better.
    return (
        values[0] * 10000 +
        values[1] * 1000 +
        values[2] * 100 +
        values[3] * 10 +
        values[4]
    );
}

function popcount(x) {
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}


/* ---------------------------------------------------------
   COMBINATIONS
--------------------------------------------------------- */

function forEachPair(arr, fn) {
    for (let i = 0; i < arr.length - 1; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            fn(arr[i], arr[j]);
        }
    }
}

function forEachTriple(arr, fn) {
    for (let i = 0; i < arr.length - 2; i++) {
        for (let j = i + 1; j < arr.length - 1; j++) {
            for (let k = j + 1; k < arr.length; k++) {
                fn(arr[i], arr[j], arr[k]);
            }
        }
    }
}


/* ---------------------------------------------------------
   OMAHA HI-LO EVALUATOR

   EXACTLY:
     2 cards from hole
     3 cards from board
--------------------------------------------------------- */

function evaluateOmaha(hole, board) {
    if (hole.length < 2) {
        throw new Error("Need at least 2 hole cards");
    }

    if (board.length < 3 || board.length > 5) {
        throw new Error("Board must contain 3-5 cards");
    }

    let bestHigh = -1;
    let bestLow = 0;

    forEachPair(hole, (h1, h2) => {
        forEachTriple(board, (b1, b2, b3) => {
            const high = evaluate5High(h1, h2, b1, b2, b3);

            if (high > bestHigh) {
                bestHigh = high;
            }

            const low = evaluate5Low(h1, h2, b1, b2, b3);

            if (low !== 0 && (bestLow === 0 || low < bestLow)) {
                bestLow = low;
            }
        });
    });

    return {
        high: bestHigh,
        low: bestLow,
    };
}


/* ---------------------------------------------------------
   DECK
--------------------------------------------------------- */

function fullDeck() {
    const deck = new Array(52);

    for (let i = 0; i < 52; i++) {
        deck[i] = i;
    }

    return deck;
}


/* ---------------------------------------------------------
   NUTS FOR A GIVEN BOARD

   This is the expensive part.

   We calculate the theoretically best High/Low that ANY
   Omaha hand can make on this board.

   Opponent is allowed to have any 2 cards from the
   remaining deck.

   Important:
     exactly 2 hole + exactly 3 board.
--------------------------------------------------------- */

function getAbsoluteNuts(board, deadCards = []) {
    const dead = new Uint8Array(52);

    for (const c of board) dead[c] = 1;
    for (const c of deadCards) dead[c] = 1;

    const available = [];

    for (let c = 0; c < 52; c++) {
        if (!dead[c]) available.push(c);
    }

    let nutsHigh = -1;
    let nutsLow = 0;

    // Any possible opponent hole pair.
    for (let i = 0; i < available.length - 1; i++) {
        const h1 = available[i];

        for (let j = i + 1; j < available.length; j++) {
            const h2 = available[j];

            forEachTriple(board, (b1, b2, b3) => {
                const high = evaluate5High(h1, h2, b1, b2, b3);

                if (high > nutsHigh) {
                    nutsHigh = high;
                }

                const low = evaluate5Low(h1, h2, b1, b2, b3);

                if (low !== 0 && (nutsLow === 0 || low < nutsLow)) {
                    nutsLow = low;
                }
            });
        }
    }

    return {
        high: nutsHigh,
        low: nutsLow,
    };
}


/* ---------------------------------------------------------
   NUT OUTS

   Returns cards which, on the NEXT street, give Hero:

     - absolute nut high
     - absolute nut low
     - both

   deadCards can contain known opponent cards etc.
--------------------------------------------------------- */

function getNutOuts(hole, board, deadCards = []) {
    const dead = new Uint8Array(52);

    for (const c of hole) dead[c] = 1;
    for (const c of board) dead[c] = 1;
    for (const c of deadCards) dead[c] = 1;

    const remaining = [];

    for (let c = 0; c < 52; c++) {
        if (!dead[c]) remaining.push(c);
    }

    const current = evaluateOmaha(hole, board);

    const nutHigh = [];
    const nutLow = [];
    const scoop = [];
    let keepHigh = 0;
    const keepHighCards = [];
    let keepLow = 0;
    const keepLowCards = [];

    for (const out of remaining) {
        const newBoard = board.concat(out);

        // Can't evaluate nuts beyond river.
        if (newBoard.length > 5) {
            throw new Error("Nut outs only makes sense before river");
        }

        const hero = evaluateOmaha(hole, newBoard);

        /*
          Important:
          'out' itself cannot be in opponent's hole cards,
          so it belongs in deadCards when calculating nuts.
        */
        const nuts = getAbsoluteNuts(
            newBoard,
            deadCards.concat(out)
        );

        /*
          An out must IMPROVE the hand (better than the current one)
          and make it at least as good as the best opponent hand.
        */
        const isHigh = hero.high > current.high && hero.high >= nuts.high;

        const isLow =
            hero.low !== 0 &&
            (current.low === 0 || hero.low < current.low) &&
            (nuts.low === 0 || hero.low <= nuts.low);

        /*
          A card KEEPS the nuts when the hand is still at least as good
          as the best opponent hand after it.
        */
        const keepsHigh = hero.high >= nuts.high;
        const keepsLow =
            hero.low !== 0 &&
            (nuts.low === 0 || hero.low <= nuts.low);

        if (isHigh) nutHigh.push(out);
        if (isLow) nutLow.push(out);

        if (isHigh && isLow) {
            scoop.push(out);
        }

        if (keepsHigh) {
            keepHigh++;
            keepHighCards.push(out);
        }
        if (keepsLow) {
            keepLow++;
            keepLowCards.push(out);
        }
    }

    return {
        nutHigh,
        nutLow,
        scoop,
        keepHigh,
        keepHighCards,
        keepLow,
        keepLowCards,
        counts: {
            nutHigh: nutHigh.length,
            nutLow: nutLow.length,
            scoop: scoop.length,
            keepHigh,
            keepLow,
        },
    };
}


/* ---------------------------------------------------------
   HELPERS FOR DISPLAY
--------------------------------------------------------- */

function cardsToString(cards) {
    return cards.map(cardToString).join(" ");
}


/* ---------------------------------------------------------
   APP CARD CONVERSION ({ rank: "A", suit: "s" } <-> code)
--------------------------------------------------------- */

function appCardToCode(cardObj) {
    const r = RANKS.indexOf(cardObj.rank);
    const s = SUITS.indexOf(cardObj.suit);

    if (r < 0 || s < 0) {
        throw new Error(`Invalid card: ${cardObj.rank}${cardObj.suit}`);
    }

    return card(r, s);
}


export {
    card,
    rankOf,
    suitOf,
    parseCard,
    cardToString,
    cardsToString,
    appCardToCode,
    evaluate5High,
    evaluate5Low,
    evaluateOmaha,
    fullDeck,
    getAbsoluteNuts,
    getNutOuts,
};
