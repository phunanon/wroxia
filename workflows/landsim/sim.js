// @ts-check
// Monte Carlo model of Part V (Land) and its land charge (V.8). Pure engine, no
// DOM: index.html loads it with a script tag; in Node it runs headless:
//   node workflows/landsim/sim.js [preset] [--runs N] [--years N] [--seed N] [--param value]
// Money is in labour hours. Each cell is one unit of area; a month is one step.
'use strict';
const Sim = (() => {
  // loc: share of income paid for top desirability, times locScale; k: cells
  // wanted; up: yearly chance of looking to move; savvy: chance of using
  // avoidance; wait: months landless before taking a starter plot; inc: income
  // multiplier.
  const TYPES = {
    slow: {
      name: 'Slow-lifers',
      loc: 0.06,
      k: 1,
      up: 0.02,
      savvy: 0.1,
      wait: 1,
      inc: 0.8,
    },
    family: {
      name: 'Families',
      loc: 0.12,
      k: 2,
      up: 0.05,
      savvy: 0.3,
      wait: 6,
      inc: 1,
    },
    pioneer: {
      name: 'Pioneers',
      loc: 0.03,
      k: 4,
      up: 0.03,
      savvy: 0.2,
      wait: 12,
      inc: 0.9,
    },
    town: {
      name: 'Town-keen',
      loc: 0.3,
      k: 1,
      up: 0.15,
      savvy: 0.3,
      wait: 12,
      inc: 1.3,
    },
    strategic: {
      name: 'Strategists',
      loc: 0.2,
      k: 2,
      up: 0.2,
      savvy: 1,
      wait: 12,
      inc: 1.2,
    },
  };
  /**
   * @typedef {keyof typeof TYPES} Type
   * @typedef {'found' | 'draw' | 'starter' | 'direction' | 'pool' | 'escape'} How
   * @typedef {{ id: number, type: Type, born: number, inc: number, loc: number, parent?: Person, kids: Person[], plot: Plot | null, alive: boolean, savvy: boolean, ban: number, seek: number, since: number, debt: number, paid: number, won?: number }} Person
   * @typedef {{ p: Person, part: number, stake: number, charge: number, owed: number, how: How, depth: number }} Part One holder's part of a title; several when pooled.
   * @typedef {{ id: number, cells: number[], d: number, holders: Part[], built: number }} Plot
   * @typedef {{ p: Person, w: number }} Reg A registration, weighted by the fraction of a quota.
   * @typedef {{ cells: number[], regs: Reg[], esc?: Person }} Lot Land registered for, and drawn, as one.
   * @typedef {{ charge: number, stake: number, how: How, depth: number }} Taking The terms on which land is taken.
   * @typedef {Partial<Omit<typeof DEFAULTS, 'mix'>> & { mix?: Partial<typeof DEFAULTS.mix>, name?: string, runs?: number }} Opts
   * @typedef {ReturnType<typeof create>} State
   */
  /** @type {How[]} */
  const HOWS = ['found', 'draw', 'starter', 'direction', 'pool', 'escape'];
  const GENS = ['Founders', 'Drawn', 'Heir 1', 'Heir 2', 'Heir 3+'];
  const DEFAULTS = {
    seed: 1,
    years: 100,
    size: 48,
    towns: 1,
    uniform: false,
    emerge: true,
    pop0: 300,
    // At 1 the average adult would pay about 15% of income for the best site.
    // Households spend 25-35% on housing, perhaps half of it on location, so
    // 2-3 is likely nearer reality, and more in a crowded city.
    locScale: 1,
    birth: 0.07,
    immig: 0.01,
    emig: 0.004,
    rate: 300,
    rateRise: 0,
    payCap: 0.3,
    bite: 0.1,
    prep: 300,
    upkeep: 10,
    mix: { slow: 0.25, family: 0.3, pioneer: 0.1, town: 0.3, strategic: 0.05 },
    shown: true,
    avoid: true,
    spread: true,
    partial: true,
    pool: true,
    escape: true,
    rings: false,
    rolling: true,
    move: true,
    arrears: 'bar',
    // 'district': takers by draw pay the going charge, not their own contest.
    take: 'own',
    // 'full': directions and joins in life pay the going charge, not halfway.
    life: 'half',
    // 'none': directions and joins keep the part's old charge, no going charge.
    rerate: 'going',
  };
  const PRESETS = {
    uniform: {
      name: 'Uniform desirability, counts shown',
      uniform: true,
      towns: 0,
    },
    'uniform-hidden': {
      name: 'Uniform desirability, counts hidden',
      uniform: true,
      towns: 0,
      shown: false,
    },
    'one-town': { name: 'One growing town', towns: 1 },
    'several-towns': { name: 'Several towns', towns: 4 },
    'counts-hidden': {
      name: 'Several towns, counts hidden',
      towns: 4,
      shown: false,
    },
    'rapid-immigration': { name: 'Rapid immigration', towns: 2, immig: 0.03 },
    'arrears-bar': {
      name: 'Arrears bar title with a charge',
      towns: 2,
      arrears: 'bar',
    },
    'arrears-carry': {
      name: 'Arrears carried to next land',
      towns: 2,
      arrears: 'carry',
    },
    'arrears-writeoff': {
      name: 'Arrears written off',
      towns: 2,
      arrears: 'writeoff',
    },
  };

  const rng = (a) => () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = (R, a) => {
    for (let i = a.length; i > 1;) {
      const j = (R() * i--) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** @type {(a: any[], f?: (x: any, i: number) => number) => number} */
  const sum = (a, f = (x) => x) => a.reduce((t, x, i) => t + f(x, i), 0);
  const mean = (a, f) => (a.length ? sum(a, f) / a.length : 0);
  const gini = (a) => {
    a = a.slice().sort((x, y) => x - y);
    const n = a.length,
      t = sum(a);
    return t ? sum(a, (x, i) => (2 * i - n + 1) * x) / (n * t) : 0;
  };

  /** @type {(s: State, p: Person) => number} */
  const age = (s, p) => s.year - p.born;
  const adult = (s, p) => p.alive && age(s, p) >= 18;
  /** @type {(pl: Plot, p: Person) => Part} */
  const holderOf = (pl, p) =>
    /** @type {Part} */ (pl.holders.find((h) => h.p === p));
  const meanDes = (s, cells) => mean(cells, (c) => s.des[c]);
  /** @type {(p: Person, des: number, area: number) => number} */
  const val = (p, des, area) =>
    p.inc * p.loc * des * Math.min(1, area / TYPES[p.type].k);
  /** @type {(s: State, p: Person, cells: number[]) => number} */
  const value = (s, p, cells) => val(p, meanDes(s, cells), cells.length);
  const rolls = (s, p) => s.P.rolling && p.type === 'strategic';
  // V.8.3: owing anything, net of the V.6.1 sum, bars title with a charge.
  const barred = (s, p) => {
    const h = p.plot && holderOf(p.plot, p);
    return (
      s.P.arrears === 'bar' &&
      p.debt + (h ? Math.max(0, h.owed - p.plot.built * h.part) : 0) > 1e-9
    );
  };
  // V.8.3: what is owed when title ends is paid first from the V.6.1 sum.
  /** @type {(s: State, pl: Plot, h: Part) => number} */
  const settle = (s, pl, h) => {
    const rec = Math.min(h.owed, pl.built * h.part);
    s.y.recovered += rec;
    s.y.revenue += rec;
    return h.owed - rec;
  };
  // Others expected to register, inferred from last year's draws in the district.
  const est = (s, c) => (s.cps[s.dist[c]] * s.des[c]) / s.desDrawn[s.dist[c]];
  // V.8.2: the going charge for an area in shares in district d.
  /** @type {(s: State, d: number, area: number) => number} */
  const going = (s, d, area) => (s.rate * area * s.cps[d]) / s.share;
  // V.8.1: the charge for cells drawn with this contest, or their going charge.
  /** @type {(s: State, cells: number[], contest: number) => number} */
  const toll = (s, cells, contest) =>
    s.P.take === 'district'
      ? going(s, s.dist[cells[0]], cells.length)
      : s.rate * contest;
  const seeking = (s, p) =>
    adult(s, p) && p.ban <= s.t && (!p.plot || p.seek > s.t);
  // What a person has now: their holding, or a starter plot if landless.
  /** @type {(s: State, p: Person) => number} */
  const alt = (s, p) => {
    if (!p.plot) return val(p, s.starterDes, 1);
    const h = holderOf(p.plot, p);
    return (
      val(p, meanDes(s, p.plot.cells), p.plot.cells.length * h.part) -
      (rolls(s, p) ? 0 : h.charge) +
      0.02 * p.inc
    );
  };
  const tally = () => ({
    revenue: 0,
    starterCost: 0,
    splits: 0,
    merges: 0,
    moves: 0,
    arrearsEnds: 0,
    recovered: 0,
    writtenOff: 0,
    declines: 0,
    draws: 0,
    escapes: 0,
    pools: 0,
    notices: 0,
    hands: 0,
  });

  /** @param {State} s @param {Type} type @param {number} years @param {Person} [parent] */
  function person(s, type, years, parent) {
    const R = s.R,
      z = Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
    /** @type {Person} */
    const p = {
      id: s.id++,
      type,
      born: s.year - years,
      inc: 1800 * TYPES[type].inc * Math.exp(0.4 * z - 0.08),
      loc: TYPES[type].loc * s.P.locScale,
      parent,
      kids: [],
      plot: null,
      alive: true,
      savvy: R() < TYPES[type].savvy,
      ban: 0,
      seek: 0,
      since: s.t,
      debt: 0,
      paid: 0,
    };
    parent?.kids.push(p);
    s.people.push(p);
    return p;
  }
  /** @param {State} s @returns {Type} */
  function pickType(s) {
    let x = s.R() * sum(Object.values(s.P.mix));
    for (const t in s.P.mix)
      if ((x -= s.P.mix[t]) <= 0) return /** @type {Type} */ (t);
    return 'slow';
  }

  /** @param {Opts} opts */
  function create(opts = {}) {
    const P = { ...DEFAULTS, ...opts, mix: { ...DEFAULTS.mix, ...opts.mix } },
      N = P.size,
      C = N * N,
      R = rng(P.seed);
    const s = {
      P,
      R,
      N,
      C,
      t: 0,
      year: 0,
      id: 1,
      rate: P.rate,
      people: /** @type {Person[]} */ ([]),
      plots: /** @type {Map<number, Plot>} */ (new Map()),
      escapes: /** @type {{ p: Person, cells: number[] }[]} */ ([]),
      hist: /** @type {Record<string, any>[]} */ ([]),
      y: tally(),
      res: /** @type {number[][]} */ ([]),
      starterDes: 0,
      share: 1,
      base: new Float32Array(C),
      des: new Float32Array(C),
      owner: new Int32Array(C),
      reserved: new Uint8Array(C),
      last: new Int32Array(C),
      ask: new Float32Array(C),
      dist: new Uint8Array(C),
      cps: new Float64Array(9),
      desDrawn: new Float64Array(9).fill(1),
      dc: new Float64Array(9),
      ds: new Float64Array(9),
      dd: new Float64Array(9),
    };
    const bump = (n, amp, r) => {
      for (let i = 0; i < n; i++) {
        const x0 = R() * N,
          y0 = R() * N;
        for (let c = 0; c < C; c++)
          s.base[c] +=
            amp *
            Math.exp(
              -(((c % N) - x0) ** 2 + (((c / N) | 0) - y0) ** 2) / (2 * r * r),
            );
      }
    };
    for (let c = 0; c < C; c++)
      s.dist[c] =
        (((3 * (c % N)) / N) | 0) + 3 * (((3 * ((c / N) | 0)) / N) | 0);
    if (P.uniform) s.base.fill(0.5);
    else (s.base.fill(0.1), bump(4, 0.25, N / 6), bump(P.towns, 0.6, 3));
    updateDes(s);
    for (let i = 0; i < P.pop0; i++)
      person(s, pickType(s), 18 + ((R() * 60) | 0));
    const founders = s.people.slice();
    for (let i = 0; i < P.pop0 * 0.4; i++) {
      const q = founders[(R() * P.pop0) | 0];
      if (age(s, q) > 20 && age(s, q) < 55)
        person(s, q.type, (R() * 18) | 0, q);
    }
    recount(s);
    // V.5.3: founding occupiers take first, as if directed, paying nothing.
    const vac = [...Array(C).keys()].sort((a, b) => s.des[b] - s.des[a]);
    for (const p of shuffle(R, founders)) {
      const [L] = choose(s, p, vac, new Float64Array(C), new Map());
      if (L)
        take(s, p, L.cells, {
          charge: 0,
          stake: L.cells.length / s.share,
          how: 'found',
          depth: 0,
        });
    }
    updateDes(s);
    return s;
  }

  function recount(s) {
    s.share =
      s.C / sum(s.people, (p) => (!p.alive ? 0 : age(s, p) >= 18 ? 1 : 0.5));
  }

  function updateDes(s) {
    const { N, C } = s;
    let a = new Float32Array(C);
    if (s.P.emerge && !s.P.uniform) {
      for (const pl of s.plots.values())
        for (const c of pl.cells)
          a[c] = Math.min(1, pl.holders.length / pl.cells.length);
      for (let k = 0; k < 2; k++) {
        const b = new Float32Array(C);
        for (let c = 0; c < C; c++) {
          const x = c % N,
            y = (c / N) | 0;
          let t = 0,
            n = 0;
          for (let j = Math.max(0, y - 2); j <= Math.min(N - 1, y + 2); j++)
            for (let i = Math.max(0, x - 2); i <= Math.min(N - 1, x + 2); i++)
              ((t += a[j * N + i]), n++);
          b[c] = t / n;
        }
        a = b;
      }
    }
    for (let c = 0; c < C; c++) s.des[c] = Math.min(1, s.base[c] + 0.4 * a[c]);
  }

  // A lot: up to k adjacent vacant cells grown greedily from c, best first.
  /** @param {State} s @param {number} c @param {number} k */
  function grow(s, c, k) {
    if (s.owner[c] || s.reserved[c]) return null;
    const { N, C } = s,
      L = [c];
    while (L.length < k) {
      let best = -1;
      for (const x of L)
        for (const y of [
          x - N,
          x + N,
          x % N ? x - 1 : -1,
          (x + 1) % N ? x + 1 : -1,
        ])
          if (
            y >= 0 &&
            y < C &&
            !s.owner[y] &&
            !s.reserved[y] &&
            !L.includes(y) &&
            (best < 0 || s.des[y] > s.des[best])
          )
            best = y;
      if (best < 0) break;
      L.push(best);
    }
    return L.sort((a, b) => a - b);
  }

  // The lots a seeker registers for: one, or three (each at a third) if spreading.
  // Half the candidates come from the most desirable tenth of vacant land.
  /** @param {State} s @param {Person} p @param {number[]} vac @param {Float64Array} D @param {Map<number, Set<number>>} rings */
  function choose(s, p, vac, D, rings) {
    const { P, R } = s,
      top = Math.max(1, vac.length / 10),
      T = TYPES[p.type],
      k = Math.max(1, Math.min(T.k, Math.floor(s.share)));
    const a0 = alt(s, p),
      roll = rolls(s, p),
      live = P.shown && P.avoid,
      seen = new Set(),
      out = [];
    for (let i = p.savvy ? 30 : 15; i--;) {
      const cells = grow(s, vac[(R() * (i % 2 ? top : vac.length)) | 0], k),
        key = cells?.join();
      if (!cells || seen.has(key)) continue;
      seen.add(key);
      const ring = P.rings && p.savvy && rings.get(s.dist[cells[0]]);
      if (ring && cells.some((c) => ring.has(c))) continue;
      const n = mean(cells, (c) => (live ? D[c] : est(s, c)));
      const net =
        value(s, p, cells) -
        (roll ? 0 : toll(s, cells, (n * cells.length) / s.share)) -
        sum(cells, (c) => s.ask[c]) / 20;
      if (net > a0) out.push({ cells, score: (net - a0) / (1 + n) });
    }
    out.sort((a, b) => b.score - a.score);
    const pick = [];
    for (const L of out)
      if (
        pick.length < (P.spread && p.savvy ? 3 : 1) &&
        !pick.some((q) => q.cells.some((c) => L.cells.includes(c)))
      )
        pick.push(L);
    return pick;
  }

  /** @param {State} s @param {Person} p @param {number[]} cells @param {Taking} h */
  function take(s, p, cells, h) {
    if (p.plot) (leave(s, p, 'move'), s.y.moves++);
    /** @type {Plot} */
    const pl = {
      id: s.id++,
      cells,
      d: s.dist[cells[0]],
      holders: [],
      built: sum(cells, (c) => s.ask[c]),
    };
    if (new Set(cells.map((c) => s.last[c])).size > 1) s.y.merges++;
    for (const c of cells)
      ((s.owner[c] = pl.id), (s.reserved[c] = 0), (s.ask[c] = 0));
    const owed = s.P.arrears === 'carry' && h.how !== 'starter' ? p.debt : 0;
    p.debt -= owed;
    pl.holders.push({
      p,
      part: 1,
      stake: h.stake,
      charge: h.charge,
      owed,
      how: h.how,
      depth: h.depth,
    });
    s.plots.set(pl.id, pl);
    p.plot = pl;
  }

  /** @param {State} s @param {Plot} pl @param {number[]} cells */
  function vacate(s, pl, cells) {
    if (!cells.length) return;
    const each = pl.built / pl.cells.length;
    for (const c of cells)
      ((s.owner[c] = 0), (s.last[c] = pl.id), (s.ask[c] = each));
    pl.built -= each * cells.length;
    pl.cells = pl.cells.filter((c) => s.owner[c] === pl.id);
    if (pl.cells.length) s.y.splits++;
    else s.plots.delete(pl.id);
  }

  // V.5: title ends. Arrears go first to the V.6.1 sum, then per the option.
  /** @param {State} s @param {Person} p @param {'move' | 'death' | 'emig' | 'arrears'} why */
  function leave(s, p, why) {
    const pl = p.plot;
    if (!pl) return;
    const h = holderOf(pl, p);
    p.plot = null;
    p.since = s.t;
    if (why !== 'arrears' && why !== 'death' && hand(s, p, pl, h)) return;
    pl.holders.splice(pl.holders.indexOf(h), 1);
    const rest = settle(s, pl, h);
    if (why === 'death' || why === 'emig' || s.P.arrears === 'writeoff')
      s.y.writtenOff += rest;
    else p.debt += rest;
    if (!pl.holders.length) return vacate(s, pl, pl.cells.slice());
    // V.5.2: the others choose a part, in proportion to what was pooled, to fall vacant.
    pl.holders.forEach((x) => (x.part /= 1 - h.part));
    const m = Math.min(
      pl.cells.length - 1,
      Math.round(pl.cells.length * h.part),
    );
    vacate(
      s,
      pl,
      pl.cells
        .slice()
        .sort((a, b) => s.des[a] - s.des[b])
        .slice(0, m),
    );
  }

  // V.4.2 in life: one in ten sole holders who leave, or half if it is cheaper
  // than a draw, direct a landless adult child or else a landless seeker.
  /** @param {State} s @param {Person} p @param {Plot} pl @param {Part} h */
  function hand(s, p, pl, h) {
    const draw = toll(s, pl.cells, sum(pl.cells, (c) => est(s, c)) / s.share);
    if (
      h.owed ||
      pl.holders.length > 1 ||
      s.R() >= (reset(s, pl, 1, h.charge, true) < draw ? 0.5 : 0.1)
    )
      return false;
    const buyers = s.people.filter((x) => x !== p && seeking(s, x) && !x.plot),
      q =
        p.kids.find((k) => adult(s, k) && !k.plot) ||
        buyers[(s.R() * buyers.length) | 0];
    if (!q || !inherit(s, pl, h, q, undefined, true)) return false;
    s.y.hands++;
    return true;
  }

  // Nearlaw keeps a starter plot for every landless adult, plus 1%, by district
  // in proportion to quotas staked there, choosing the least desirable cells.
  function topUp(s) {
    const staked = new Float64Array(9),
      cand = [...Array(9)].map(() => /** @type {number[]} */ ([])),
      res = cand.map(() => /** @type {number[]} */ ([]));
    for (const pl of s.plots.values())
      for (const h of pl.holders) staked[pl.d] += h.stake;
    for (let c = 0; c < s.C; c++)
      if (s.reserved[c]) res[s.dist[c]].push(c);
      else if (!s.owner[c]) cand[s.dist[c]].push(c);
    const ad = s.people.filter((p) => adult(s, p)),
      need = ad.filter((p) => !p.plot).length + Math.ceil(0.01 * ad.length),
      tot = sum([...staked]) || 1;
    for (let d = 0; d < 9; d++) {
      const want = Math.ceil((need * staked[d]) / tot);
      cand[d].sort((a, b) => s.des[a] - s.des[b]);
      for (let i = 0; res[d].length < want && i < cand[d].length; i++)
        ((s.reserved[cand[d][i]] = 1),
          res[d].push(cand[d][i]),
          (s.y.starterCost += s.P.prep));
      for (const c of res[d].splice(2 * want + 1)) s.reserved[c] = 0;
    }
    const all = res.flat();
    s.y.starterCost += (s.P.upkeep / 12) * all.length;
    s.res = res;
    s.starterDes = meanDes(s, all);
  }

  // V.3.4: at once, by lot, in the district with the best starter plots.
  function starter(s, p) {
    const d = s.res.reduce(
      (b, r, i) =>
        r.length && (b < 0 || meanDes(s, r) > meanDes(s, s.res[b])) ? i : b,
      -1,
    );
    if (d < 0) return;
    const c = s.res[d].splice((s.R() * s.res[d].length) | 0, 1)[0];
    take(s, p, [c], {
      charge: 0,
      stake: 1 / s.share,
      how: 'starter',
      depth: 0,
    });
  }

  function month(s) {
    const { P, R, C } = s,
      vac = [],
      D = new Float64Array(C),
      lots = new Map(),
      rings = new Map();
    topUp(s);
    for (let c = 0; c < C; c++) if (!s.owner[c] && !s.reserved[c]) vac.push(c);
    vac.sort((a, b) => s.des[b] - s.des[a]);
    const reg = (p, cells, w, esc) => {
      const key = cells.join();
      if (!lots.has(key)) lots.set(key, { cells, regs: [] });
      const L = lots.get(key);
      L.regs.push({ p, w });
      if (esc) L.esc = p;
      for (const c of cells) D[c] += w;
      if (P.rings && p.savvy) {
        const d = s.dist[cells[0]];
        if (!rings.has(d)) rings.set(d, new Set());
        cells.forEach((c) => rings.get(d).add(c));
      }
    };
    const esc = s.escapes.filter((e) => e.p.alive && !e.p.plot);
    s.escapes = [];
    esc.forEach((e) => reg(e.p, e.cells, 1, true));
    if (vac.length)
      for (const p of shuffle(
        R,
        s.people.filter((p) => seeking(s, p) && !esc.some((e) => e.p === p)),
      )) {
        const ls = choose(s, p, vac, D, rings);
        ls.forEach((L) => reg(p, L.cells, 1 / ls.length));
      }
    for (const L of shuffle(R, [...lots.values()])) draw(s, L, D);
    for (const p of s.people)
      if (adult(s, p) && !p.plot && s.t - p.since >= TYPES[p.type].wait)
        starter(s, p);
  }

  // V.3.2-3, V.1.5, V.8.1: draw by lot; stake and contest from the quotas registered.
  /** @param {State} s @param {Lot} L @param {Float64Array} D */
  function draw(s, L, D) {
    if (L.cells.some((c) => s.owner[c] || s.reserved[c])) return;
    const regs = L.regs.filter((r) => r.p.alive && r.p.won !== s.t);
    let x = s.R() * sum(regs, (r) => r.w);
    const win = regs.find((r) => (x -= r.w) <= 0) || regs[regs.length - 1];
    if (!win) return;
    const p = win.p,
      a = L.cells.length / s.share,
      n = mean(L.cells, (c) => D[c]);
    const contest = Math.max(0, sum(L.cells, (c) => D[c] - win.w) / s.share),
      charge = toll(s, L.cells, contest);
    if (charge && barred(s, p)) return;
    if (
      value(s, p, L.cells) -
        (rolls(s, p) ? 0 : charge) -
        sum(L.cells, (c) => s.ask[c]) / 20 <
      alt(s, p)
    ) {
      p.ban = s.t + 12;
      return s.y.declines++;
    }
    p.won = s.t;
    const d = s.dist[L.cells[0]];
    s.dc[d] += contest;
    s.ds[d] += a;
    s.dd[d] += a * meanDes(s, L.cells);
    s.y.draws++;
    take(s, p, L.cells, {
      charge,
      stake: Math.min(Math.max(1, a), a * Math.max(1, n)),
      how: L.esc === p ? 'escape' : 'draw',
      depth: 0,
    });
  }

  // V.8.2: the lower of the going charge and halfway between it and the old one,
  // or under life 'full', the going charge for a direction counting in life;
  // under rerate 'none', the old charge.
  /** @type {(s: State, pl: Plot, part: number, old: number, life?: boolean) => number} */
  const reset = (s, pl, part, old, life) => {
    if (s.P.rerate === 'none') return old;
    const G = going(s, pl.d, pl.cells.length * part);
    return life && s.P.life === 'full' ? G : Math.min(G, (G + old) / 2);
  };

  function die(s, p) {
    p.alive = false;
    const pl = p.plot;
    if (!pl) return;
    const h = holderOf(pl, p),
      mate = pl.holders.find((x) => x.p.parent === p && x.p.alive);
    const rank = (k) => (age(s, k) < 18 ? 2 : 0) + (k.plot ? 1 : 0);
    const heir =
      mate?.p ||
      p.kids.filter((k) => k.alive).sort((a, b) => rank(a) - rank(b))[0];
    if (!heir || !inherit(s, pl, h, heir, mate)) leave(s, p, 'death');
  }

  // V.4.3 on death: a pool member is directed first; otherwise a child.
  /** @param {State} s @param {Plot} pl @param {Part} h @param {Person} q @param {Part} [mate] @param {boolean} [life] */
  function inherit(s, pl, h, q, mate, life) {
    const c = reset(s, pl, h.part, h.charge, life),
      md = meanDes(s, pl.cells),
      area = pl.cells.length * h.part;
    const own = mate ? pl.cells.length * mate.part : 0,
      oc = mate ? mate.charge : 0;
    const keep = val(q, md, own + area) - (rolls(s, q) ? 0 : c + oc),
      other = mate ? val(q, md, own) - oc : alt(s, q);
    if (!mate && s.P.escape && q.savvy && pl.holders.length === 1) {
      const e = toll(s, pl.cells, sum(pl.cells, (x) => est(s, x)) / s.share);
      if (e < 0.8 * c && val(q, md, area) - e > other)
        return (
          s.escapes.push({ p: q, cells: pl.cells.slice() }),
          s.y.escapes++,
          false
        );
    }
    if (keep < other || (c && barred(s, q))) return false;
    s.y.writtenOff += settle(s, pl, h);
    if (mate) {
      mate.part += h.part;
      mate.charge += c;
      pl.holders.splice(pl.holders.indexOf(h), 1);
    } else {
      if (q.plot) leave(s, q, 'move');
      const owed = s.P.arrears === 'carry' ? q.debt : 0;
      q.debt -= owed;
      Object.assign(h, {
        p: q,
        charge: c,
        owed,
        how: 'direction',
        depth: h.depth + 1,
      });
      q.plot = pl;
    }
    return true;
  }

  // V.4.1: a family admits a child at 18 to pool, resetting the part they gain.
  function comeOfAge(s, p) {
    const q = p.parent,
      pl = q?.alive && q.plot;
    p.since = s.t;
    if (!pl || p.plot || !s.P.pool || !(q.type === 'family' || q.savvy)) return;
    const n = pl.holders.length,
      f = 1 / (n + 1),
      prev = sum(pl.holders, (h) => h.charge) * f;
    pl.holders.forEach((h) => ((h.part *= 1 - f), (h.charge *= 1 - f)));
    pl.holders.push({
      p,
      part: f,
      stake: sum(pl.holders, (h) => h.stake) / n,
      charge: reset(s, pl, f, prev, true),
      owed: 0,
      how: 'pool',
      depth: holderOf(pl, q).depth + 1,
    });
    p.plot = pl;
    s.y.pools++;
  }

  // Notice on the least desirable cell when its share of the charge (pro rata
  // by area) is worth more than the cell.
  function trim(s, pl) {
    const h = pl.holders[0],
      n = pl.cells.length;
    if (
      pl.holders.length !== 1 ||
      n < 2 ||
      !h.charge ||
      !h.p.savvy ||
      rolls(s, h.p)
    )
      return;
    const w = pl.cells.reduce((a, c) => (s.des[c] < s.des[a] ? c : a)),
      rest = pl.cells.filter((c) => c !== w);
    if (h.charge / n > value(s, h.p, pl.cells) - value(s, h.p, rest)) {
      vacate(s, pl, [w]);
      h.charge *= (n - 1) / n;
      s.y.notices++;
    }
  }

  function yearEnd(s) {
    const { P, R, y } = s;
    s.people.forEach((p) => (p.paid = 0));
    // V.8.3: title ends once more than five years' charges are unpaid.
    for (const pl of [...s.plots.values()])
      for (const h of [...pl.holders]) {
        const p = h.p,
          due = h.owed + h.charge,
          paid = rolls(s, p) ? 0 : Math.min(due, P.payCap * p.inc);
        h.owed = due - paid;
        p.paid += paid;
        y.revenue += paid;
        if (h.owed > 5 * h.charge + 1e-9)
          (y.arrearsEnds++, leave(s, p, 'arrears'));
      }
    if (P.arrears === 'bar')
      for (const p of s.people) {
        const x =
          p.alive && !rolls(s, p)
            ? Math.min(p.debt, P.payCap * p.inc - p.paid)
            : 0;
        if (x > 0) ((p.debt -= x), (p.paid += x), (y.revenue += x));
      }
    for (const pl of [...s.plots.values()]) {
      pl.built = 0.97 * pl.built + sum(pl.holders, (h) => 0.02 * h.p.inc);
      if (P.partial) trim(s, pl);
    }
    for (const p of s.people) {
      const h = p.alive && p.plot && holderOf(p.plot, p);
      if (
        h &&
        (R() < TYPES[p.type].up ||
          (P.move && !rolls(s, p) && h.charge > P.bite * p.inc) ||
          alt(s, p) - 0.02 * p.inc < 0.8 * val(p, s.starterDes, 1))
      )
        p.seek = s.t + 12;
    }
    s.hist.push(stats(s));
    s.year++;
    const nAdults = s.people.filter((p) => adult(s, p)).length,
      noStarter = !s.res.some((r) => r.length);
    for (const p of s.people.slice()) {
      if (!p.alive) continue;
      const g = age(s, p);
      if (R() < Math.exp(-10.5 + 0.1 * g)) die(s, p);
      else if (g >= 18 && R() < P.emig + (!p.plot && noStarter ? 0.3 : 0)) {
        leave(s, p, 'emig');
        p.alive = false;
        p.kids.forEach((k) => age(s, k) < 18 && !k.plot && (k.alive = false));
      } else {
        if (g >= 20 && g < 40 && R() < P.birth)
          person(s, R() < 0.7 ? p.type : pickType(s), 0, p);
        if (g === 18) comeOfAge(s, p);
      }
    }
    for (let i = P.immig * nAdults + R(); i >= 1; i--)
      person(s, pickType(s), 20 + ((R() * 20) | 0));
    s.people = s.people.filter((p) => p.alive);
    s.people.forEach((p) => (p.kids = p.kids.filter((k) => k.alive)));
    recount(s);
    for (let d = 0; d < 9; d++) {
      // V.8.2: or else the last year any was drawn.
      if (s.ds[d])
        ((s.cps[d] = s.dc[d] / s.ds[d]), (s.desDrawn[d] = s.dd[d] / s.ds[d]));
      s.dc[d] = s.ds[d] = s.dd[d] = 0;
    }
    updateDes(s);
    s.rate *= 1 + P.rateRise;
    s.y = tally();
  }

  /** @param {State} s */
  function stats(s) {
    const y = s.y,
      ad = s.people.filter((p) => adult(s, p)),
      n = ad.length || 1,
      plots = [...s.plots.values()];
    const hs = plots.flatMap((pl) => pl.holders.map((h) => ({ ...h, pl })));
    const by = (keys, key, f) =>
      Object.fromEntries(
        keys.map((k) => [k, f(hs.filter((h) => key(h) === k))]),
      );
    const goes = (h) => going(s, h.pl.d, h.pl.cells.length * h.part);
    const gen = (h) =>
      h.how === 'found'
        ? 'Founders'
        : h.depth
          ? GENS[Math.min(h.depth, 3) + 1]
          : 'Drawn';
    let vac = 0,
      res = 0;
    for (let c = 0; c < s.C; c++)
      s.reserved[c] ? res++ : s.owner[c] ? 0 : vac++;
    const income = sum(ad, (p) => p.inc);
    return {
      year: s.year + 1,
      adults: ad.length,
      share: s.share,
      rate: s.rate,
      revenue: y.revenue,
      perAdult: y.revenue / n,
      incShare: y.revenue / income,
      starterCost: y.starterCost,
      zero: ad.filter((p) => !p.paid).length / n,
      landless: ad.filter((p) => !p.plot).length / n,
      byType: Object.fromEntries(
        Object.keys(TYPES).map((t) => [
          t,
          mean(
            ad.filter((p) => p.type === t),
            (p) => p.paid,
          ),
        ]),
      ),
      byHow: by(
        HOWS,
        (h) => h.how,
        (g) => (g.length ? mean(g, (h) => h.charge) : null),
      ),
      holders: by(
        HOWS,
        (h) => h.how,
        (g) => g.length,
      ),
      entrench: by(GENS, gen, (g) =>
        sum(g, goes) ? sum(g, (h) => h.charge) / sum(g, goes) : null,
      ),
      giniPaid: gini(ad.map((p) => p.paid)),
      giniLand: gini(
        ad.map((p) =>
          p.plot
            ? meanDes(s, p.plot.cells) *
              p.plot.cells.length *
              holderOf(p.plot, p).part
            : 0,
        ),
      ),
      vacancy: vac / s.C,
      reserved: res / s.C,
      plotSize: mean(plots, (pl) => pl.cells.length),
      splits: y.splits,
      merges: y.merges,
      notices: y.notices,
      pools: y.pools,
      escapes: y.escapes,
      hands: y.hands,
      defaults: hs.filter((h) => h.owed > 0).length / (hs.length || 1),
      arrearsEnds: y.arrearsEnds,
      recovered: y.recovered,
      writtenOff: y.writtenOff,
      debtors: ad.filter((p) => p.debt > 0).length,
      mobility: y.moves / n,
      draws: y.draws,
      declines: y.declines,
      cps: mean([...s.cps], (x) => x),
    };
  }

  function step(s) {
    month(s);
    if (++s.t % 12 === 0) yearEnd(s);
  }

  // Per cell: desirability, or the yearly charge per cell of the plot (-1 vacant, -2 starter reserve).
  /** @param {State} s @param {'des' | 'charge'} mode */
  function cellMap(s, mode) {
    const m = Float32Array.from(s.des, (d, c) =>
      s.reserved[c] ? -2 : mode === 'des' ? d : -1,
    );
    if (mode !== 'des')
      for (const pl of s.plots.values()) {
        const v = sum(pl.holders, (h) => h.charge) / pl.cells.length;
        pl.cells.forEach((c) => (m[c] = v));
      }
    return m;
  }

  /** @param {Opts} opts */
  function run(opts) {
    const s = create(opts);
    while (s.year < s.P.years) step(s);
    return s;
  }

  return { TYPES, HOWS, GENS, DEFAULTS, PRESETS, create, step, run, cellMap };
})();

/** @type {any} Node's CommonJS module, if any. */
// @ts-ignore: no Node types without a package.json
const mod = typeof module !== 'undefined' && module;
if (mod) mod.exports = Sim;
/** @param {any} fs @param {any} path @param {any} proc */
function cli(fs, path, proc) {
  const args = proc.argv.slice(2),
    preset = args[0] && !args[0].startsWith('--') ? args.shift() : 'one-town';
  /** @type {Record<string, any>} */
  const opts = { ...Sim.PRESETS[preset] },
    parse = (v) =>
      v === 'true' ? true : v === 'false' ? false : isNaN(v) ? v : Number(v);
  for (let i = 0; i < args.length; i += 2)
    opts[args[i].slice(2)] = parse(args[i + 1]);
  const t0 = Date.now(),
    seed = opts.seed ?? 1,
    [sk, sv] = opts.sweep?.split('=') ?? [],
    batch = (o) =>
      Array.from(
        { length: opts.runs ?? 4 },
        (_, r) => Sim.run({ ...o, seed: seed + r }).hist,
      ),
    runs = sk ? [] : batch(opts);
  const pct = (x) => (100 * x).toFixed(0) + '%',
    f0 = (x) => x.toFixed(0),
    f1 = (x) => x.toFixed(1),
    p2 = (x) => (100 * x).toFixed(2) + '%';
  // Mean (min-max) over runs of a key's mean in the ten years to y; a/b divides.
  const cell =
    (runs, y) =>
    ([k, f]) => {
      const v = runs.map((h) =>
        k
          .split('/')
          .map((k) =>
            h
              .slice(Math.max(0, y - 9), y + 1)
              .reduce((a, r, _, d) => a + r[k] / d.length, 0),
          )
          .reduce((a, b) => a / b),
      );
      return `${f(v.reduce((a, b) => a + b) / v.length)} (${f(Math.min(...v))}-${f(Math.max(...v))})`;
    };
  if (sk) {
    /** @type {[string, (x: number) => string][]} */
    const sc = [
      ['incShare', p2],
      ['perAdult', f1],
      ['zero', pct],
      ['starterCost/revenue', f1],
      ['vacancy', pct],
    ];
    console.log(
      `${opts.name ?? preset}: ${opts.runs ?? 4} runs, last ten years, mean (min-max)`,
    );
    console.log([sk, ...sc.map((c) => c[0])].join('\t'));
    for (const v of sv.split(',')) {
      const r = batch({ ...opts, [sk]: parse(v) });
      console.log([v, ...sc.map(cell(r, r[0].length - 1))].join('\t'));
    }
    return console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  /** @type {[string, (x: number) => string][]} */
  const cols = [
    ['adults', f0],
    ['revenue', f0],
    ['perAdult', f1],
    ['incShare', p2],
    ['starterCost', f0],
    ['recovered', f0],
    ['zero', pct],
    ['vacancy', pct],
    ['plotSize', (x) => x.toFixed(2)],
    ['splits', f0],
    ['merges', f0],
    ['defaults', pct],
    ['mobility', pct],
  ];
  console.log(
    `${opts.name ?? preset}: ${runs.length} runs, decade mean (min-max)  [hours a year]`,
  );
  console.log(['year', ...cols.map((c) => c[0])].join('\t'));
  for (let y = 9; y < runs[0].length; y += 10)
    console.log([y + 1, ...cols.map(cell(runs, y))].join('\t'));
  const last = runs.map((h) => h[h.length - 1]),
    avg = (f) => last.reduce((a, h) => a + (f(h) ?? 0), 0) / last.length;
  console.log(
    'Final mean charge by how title was gained:',
    Sim.HOWS.map((k) => `${k} ${avg((h) => h.byHow[k]).toFixed(0)}`).join(', '),
  );
  console.log(
    'Final frozen/going charge ratio:',
    Sim.GENS.map((k) => `${k} ${avg((h) => h.entrench[k]).toFixed(2)}`).join(
      ', ',
    ),
  );
  console.log(
    'Final mean paid by type:',
    Object.keys(Sim.TYPES)
      .map((k) => `${k} ${avg((h) => h.byType[k]).toFixed(0)}`)
      .join(', '),
  );
  const out = path.join(
    proc.argv[1],
    `../../runs/landsim-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`,
  );
  fs.writeFileSync(out, JSON.stringify({ preset, opts, runs }));
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s; wrote ${out}`);
}
if (mod?.id === '.')
  cli(
    mod.require('node:fs'),
    mod.require('node:path'),
    /** @type {any} */ (globalThis).process,
  );
