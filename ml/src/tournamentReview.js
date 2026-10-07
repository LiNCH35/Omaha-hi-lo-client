#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { in: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    const val = eq === -1 ? true : a.slice(eq + 1);
    if (key === 'in') args.in.push(val);
    else args[key] = val;
  }
  return args;
}

function pct(x) { return (100 * x).toFixed(1) + '%'; }

function analyzeFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const hands = new Map();
  const sessions = new Map();
  const actionsByHand = new Map();
  let decisions = 0;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.t === 'd') {
      decisions++;
      const k = r.ses + ':' + r.h;
      if (!actionsByHand.has(k)) actionsByHand.set(k, []);
      actionsByHand.get(k).push(r);
    } else if (r.t === 'h') {
      const k = r.ses + ':' + r.h;
      if (!hands.has(k)) hands.set(k, r);
    } else if (r.t === 'ses') {
      sessions.set(r.ses, r);
    }
  }
  const modelSeat = 0;
  const tournaments = sessions.size;
  const verdicts = { pass: 0, loss: 0, cap: 0, preflop_allin: 0, error: 0 };
  const warHands = [];
  const cleanLossSessions = [];
  const actionCounts = { preflop: { fold: 0, call: 0, raise: 0 }, flop: {}, turn: {}, river: {} };
  for (const s of ['flop', 'turn', 'river']) {
    actionCounts[s] = { fold: 0, call: 0, raise: 0 };
  }
  let playedPreflopScore = [];
  let foldedPreflopScore = [];
  const warSequences = new Map();
  let warModelNet = 0;
  let warModelWins = 0;
  let cleanLossHands = 0;
  let cleanLossNet = 0;
  let cleanLossShowdown = 0;
  let cleanLossHiWins = 0;
  let cleanLossLoWins = 0;
  for (const [sesId, ses] of sessions) {
    const sesHandKeys = [...hands.keys()].filter((k) => hands.get(k).ses === sesId);
    const hadWar = sesHandKeys.some((k) => hands.get(k).preflopWar);
    const winner = ses.winner;
    let verdict;
    if (hadWar) verdict = 'preflop_allin';
    else if (winner === modelSeat) verdict = 'pass';
    else if (ses.reason === 'cap') verdict = 'cap';
    else verdict = 'loss';
    verdicts[verdict]++;
    for (const k of sesHandKeys) {
      const h = hands.get(k);
      const ds = (actionsByHand.get(k) || []).filter((d) => d.seat === modelSeat);
      for (const d of ds) {
        const a = d.a;
        if (d.s === 'preflop') {
          actionCounts.preflop[a] = (actionCounts.preflop[a] || 0) + 1;
          const score = d.f ? d.f[8] : null;
          if (score != null) {
            if (a === 'fold') foldedPreflopScore.push(score);
            else playedPreflopScore.push(score);
          }
        } else if (actionCounts[d.s]) {
          actionCounts[d.s][a] = (actionCounts[d.s][a] || 0) + 1;
        }
      }
      const modelRes = (h.results || []).find((p) => p.seat === modelSeat);
      const modelNet = modelRes ? modelRes.net : 0;
      if (h.preflopWar) {
        warHands.push({
          ses: h.ses,
          hand: h.h,
          allInSeats: h.allInSeats,
          seq: (actionsByHand.get(k) || [])
            .filter((d) => d.s === 'preflop')
            .map((d) => d.seat + ':' + d.a)
            .join('->'),
          modelNet,
          hole: (actionsByHand.get(k) || []).find((d) => d.seat === modelSeat)?.hole,
          score: (actionsByHand.get(k) || []).find((d) => d.seat === modelSeat)?.f?.[8],
          won: modelNet > 0,
        });
        warModelNet += modelNet;
        if (modelNet > 0) warModelWins++;
        const seqKey = warHands[warHands.length - 1].seq;
        warSequences.set(seqKey, (warSequences.get(seqKey) || 0) + 1);
      } else if (verdict === 'loss') {
        cleanLossHands++;
        cleanLossNet += modelNet;
        if (modelRes && modelRes.showdown) cleanLossShowdown++;
        if (modelRes && modelRes.hiWinner) cleanLossHiWins++;
        if (modelRes && modelRes.loWinner) cleanLossLoWins++;
      }
    }
    if (verdict === 'loss') {
      cleanLossSessions.push({
        ses: sesId,
        hands: ses.hands,
        winner,
      });
    }
  }
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const openerCounts = new Map();
  let modelOpensWars = 0;
  let botOpensWars = 0;
  let modelFirstAggroWars = 0;
  for (const w of warHands) {
    const parts = w.seq.split('->').filter(Boolean);
    const firstAggro = parts.find((p) => p.endsWith(':raise'));
    if (firstAggro) {
      const seat = firstAggro.split(':')[0];
      openerCounts.set(firstAggro, (openerCounts.get(firstAggro) || 0) + 1);
      if (seat === String(modelSeat)) modelFirstAggroWars++;
      else botOpensWars++;
    }
    if (parts.some((p) => p === modelSeat + ':raise')) modelOpensWars++;
  }
  return {
    file: path.basename(file),
    tournaments,
    decisions,
    verdicts,
    wars: {
      count: warHands.length,
      modelFirstAggro: modelFirstAggroWars,
      botFirstAggro: botOpensWars,
      modelInvolvedRaise: modelOpensWars,
      warWinRate: warHands.length ? warModelWins / warHands.length : null,
      modelNetTotal: warModelNet,
      avgModelPreflopScore: avg(warHands.map((w) => w.score).filter((x) => x != null)),
      sequences: [...warSequences.entries()].sort((a, b) => b[1] - a[1]),
    },
    cleanLosses: {
      tournaments: cleanLossSessions.length,
      avgSessionHands: avg(cleanLossSessions.map((s) => s.hands)),
      hands: cleanLossHands,
      modelNetTotal: cleanLossNet,
      showdownShare: cleanLossHands ? cleanLossShowdown / cleanLossHands : null,
      hiWinShare: cleanLossHands ? cleanLossHiWins / cleanLossHands : null,
      loWinShare: cleanLossHands ? cleanLossLoWins / cleanLossHands : null,
    },
    modelActions: actionCounts,
    handQuality: {
      avgScorePlayed: avg(playedPreflopScore),
      avgScoreFolded: avg(foldedPreflopScore),
      playedCount: playedPreflopScore.length,
      foldedCount: foldedPreflopScore.length,
    },
    warSample: warHands.slice(0, 25).map((w) => ({
      ses: w.ses,
      hand: w.hand,
      seq: w.seq,
      score: w.score == null ? null : Number(w.score.toFixed(3)),
      hole: w.hole,
      net: w.modelNet,
    })),
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.in.length) {
    console.error('usage: node tournamentReview.cjs --in=<file.jsonl> [--in=<file2.jsonl> ...]');
    process.exit(1);
  }
  const reports = args.in.map((f) => analyzeFile(f));
  const totals = reports.reduce(
    (acc, r) => {
      acc.tournaments += r.tournaments;
      acc.decisions += r.decisions;
      for (const k of Object.keys(r.verdicts)) acc.verdicts[k] += r.verdicts[k];
      acc.wars.count += r.wars.count;
      acc.wars.modelNetTotal += r.wars.modelNetTotal;
      acc.cleanLosses.tournaments += r.cleanLosses.tournaments;
      acc.cleanLosses.modelNetTotal += r.cleanLosses.modelNetTotal;
      return acc;
    },
    {
      tournaments: 0,
      decisions: 0,
      verdicts: { pass: 0, loss: 0, cap: 0, preflop_allin: 0, error: 0 },
      wars: { count: 0, modelNetTotal: 0 },
      cleanLosses: { tournaments: 0, modelNetTotal: 0 },
    },
  );
  totals.passRate = totals.tournaments ? totals.verdicts.pass / totals.tournaments : null;
  console.log(JSON.stringify({ totals, reports }, null, 2));
}

main();
