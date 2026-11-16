// @ts-check
// Agent-based Monte Carlo of the hearth beside the haven (IV.2.2, IV.2.3.1): how
// much a yearly charge on holdings of hearth (demurrage) and other charges
// payable only in hearth can raise. Pure engine, no DOM: index.html loads it with a script tag; in Node it runs headless:
//   node workflows/moneysim/sim.js [preset] [--runs N] [--param value] [--sweep name=v1,v2]
// Money is in labour hours (an adult earns about 1,800 a year); a step is a year.
'use strict';
const Sim = (() => {
  const DEFAULTS = {
    seed: 1,
    years: 50,
    n: 1000, // adults
    rate: 0.03, // demurrage, a yearly share of every holding of hearth
    share0: 0.5, // share of sellers pricing in hearth at the start
    spread: 0.01, // cost of exchanging, as a share of the sum
    trip: 0.25, // hours each extra exchange takes
    havenInfl: 0.02, // yearly rise of prices in havens
    spend: 0.02, // Nearlaw's spending under 'target', share of income
    land: 0.005, // land charge, share of income, paid yearly by a fifth of adults
    sell: 0, // services Nearlaw sells at cost only for hearth, share of income
    rule: 'peg', // 'peg': fixed hearth wage for voluntary work, spending what holders absorb; 'target': spend regardless
    hold: 1, // months of spending held as cash when holding costs nothing
    savings: 0.25, // liquid savings, share of income
    elastic: 50, // savings' odds of hearth fall e-fold per 1/elastic of extra yearly holding cost
    sales: 0, // sales tax, share of declared turnover (a seller's turnover is their income)
    thresh: 0, // turnover below which sellers owe no sales tax, multiple of mean income
    detect: 0.25, // chance hidden turnover is found (back tax and an equal fine); half for haven sellers
    pollute: 0, // pollution charge, share of the value of polluting output
    dirty: 0.2, // share of sellers whose output pollutes
    abate: 2, // elasticity of polluting output to its charge
    poll: 0, // poll tax, hours per adult a year
  };
  // Trading partners per adult; share of ties rewired at random; share revising
  // their currency and savings yearly; noise in the currency choice, as a share
  // of income; share paying the land charge; cost of hiding all one's turnover,
  // as a share of it (rising with the square of the share hidden); share of
  // income above which the poll tax goes unpaid.
  const K = 8,
    REWIRE = 0.1,
    REVISE = 0.2,
    TEMP = 0.002,
    PAYERS = 0.2,
    CONCEAL = 1,
    CAP = 0.2;
  const PRESETS = {
    base: { name: 'Half of trade in hearth' },
    side: { name: 'Hearth a side currency (10% of trade)', share0: 0.1 },
    main: { name: 'Hearth the main currency (90% of trade)', share0: 0.9 },
    services: {
      name: 'Nearlaw sells services worth 5% of income for hearth',
      sell: 0.05,
    },
    digital: {
      name: 'Digital: exchanging takes a minute and costs 0.1%',
      trip: 0.02,
      spread: 0.001,
    },
    inflating: { name: 'Havens inflate at 8% a year', havenInfl: 0.08 },
    target: { name: 'Nearlaw spends 2% of income regardless', rule: 'target' },
  };
  /**
   * @typedef {Partial<typeof DEFAULTS> & { name?: string, runs?: number }} Opts
   * @typedef {ReturnType<typeof create>} State
   */
  const rng = (a) => () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** @param {Opts} opts */
  function create(opts = {}) {
    const P = { ...DEFAULTS, ...opts },
      R = rng(P.seed),
      n = P.n;
    // Lognormal incomes; a ring of neighbours, some ties rewired (small world);
    // hearth starts in one contiguous block, as in a region that takes it up.
    const inc = Float64Array.from(
      { length: n },
      () =>
        1800 *
        Math.exp(
          0.5 *
            Math.sqrt(-2 * Math.log(1 - R())) *
            Math.cos(2 * Math.PI * R()) -
            0.125,
        ),
    );
    const nb = Int32Array.from({ length: n * K }, (_, j) => {
      const o = (j % K) - K / 2;
      return R() < REWIRE
        ? Math.floor(R() * n)
        : (Math.floor(j / K) + o + +(o >= 0) + n) % n;
    });
    const s = {
      P,
      R,
      inc,
      nb,
      H: Uint8Array.from({ length: n }, (_, i) => +(i < P.share0 * n)),
      pay: Uint8Array.from({ length: n }, () => +(R() < PAYERS)),
      dirt: Uint8Array.from(
        { length: n },
        (_, i) => +((i * 0.618) % 1 < P.dirty),
      ),
      owe: new Float64Array(n), // each adult's sales tax, share of income
      Y: inc.reduce((a, b) => a + b),
      M: 0, // hearth in issue
      p: 1, // hours one hearth buys
      pe: 0, // expected yearly fall in hearth's value, from money growth
      keep: new Float64Array(n), // share of each adult's savings kept in hearth
      g: P.spend, // Nearlaw's real spending last year, share of income
      dues: 0, // charges due to Nearlaw last year, share of income
      year: 0,
      /** @type {Record<string, number>[]} */ hist: [],
    };
    const r = pass(s, false);
    s.M = r.D;
    s.dues = r.dues / s.Y;
    return s;
  }

  // One pass over adults: real hearth balances D, exchange and concealment
  // costs, the share pricing in hearth, charges due, and (if revise) currency
  // choices for next year.
  /** @param {State} s @param {boolean} revise */
  function pass(s, revise) {
    const { P, inc, H, nb, R } = s,
      own = P.rate + s.pe, // yearly cost of holding hearth
      r = own - P.havenInfl, // ... over havens
      n0 = 6 / P.hold, // payments a year from income when holding is free
      gR = s.g + P.sell, // income received from Nearlaw, in hearth
      T = (P.thresh * s.Y) / P.n / (1 - P.sales), // declaring less, a seller gains by staying under
      dirt = P.pollute * (1 + P.pollute) ** -P.abate,
      next = H.slice();
    let D = 0,
      fr = 0,
      sales = 0,
      pol = 0,
      poll = 0,
      dues = 0,
      unpaid = 0;
    for (let i = 0; i < P.n; i++) {
      let h = 0;
      for (let k = 0; k < K; k++) h += H[nb[i * K + k]] / K;
      // Sales tax per hour of income if pricing in hearth (1) or havens (0):
      // sellers hide turnover until its marginal cost meets the tax saved net
      // of expected fines; those declaring under the threshold owe nothing.
      const hide = (c) =>
          Math.max(0, P.sales * (1 - P.detect * (1 + c))) / CONCEAL,
        owe = (c) => ((1 - hide(c)) * inc[i] < T ? 0 : P.sales * (1 - hide(c))),
        tax = (c) => owe(c) && owe(c) + (CONCEAL * hide(c) ** 2) / 2,
        pl = P.poll <= CAP * inc[i] ? P.poll / inc[i] : 0;
      // Per hour of income: charges (lumpy, yearly) and smooth hearth spending.
      const L0 = (s.pay[i] * P.land) / PAYERS + s.dirt[i] * dirt + pl,
        L = L0 + owe(H[i]),
        X = P.sell + (1 - L - P.sell) * h;
      // Cost of pricing in hearth (1) or havens (0): exchanging what is
      // received in one but paid in the other, discounting to customers who use
      // the other, and holding receipts.
      const ex = (c) =>
          P.spread *
          (Math.abs(gR + c * (1 - gR) - X - L0 - owe(c)) +
            (1 - gR) * (c ? 1 - h : h)),
        cost = (c) =>
          ex(c) + tax(c) + ((c ? own : P.havenInfl) * (1 - gR) * P.hold) / 12;
      if (revise && R() < REVISE)
        next[i] = +(R() * (1 + Math.exp((cost(1) - cost(0)) / TEMP)) < 1);
      // Baumol-Tobin: replenish more often than income arrives once holding costs.
      const x = X * inc[i],
        m = Math.max(n0, Math.sqrt((Math.max(r, 1e-4) * x) / 2 / P.trip));
      // Savings go to the currency cheaper to hold, counting the exchange saved
      // by keeping them in the one they will be spent in, and move gradually.
      const want = 1 / (1 + Math.exp(P.elastic * (r - P.spread * (2 * X - 1))));
      s.keep[i] = revise ? s.keep[i] + REVISE * (want - s.keep[i]) : want;
      D += x / 2 / m + s.keep[i] * (P.savings + L / 2) * inc[i];
      fr += (ex(H[i]) + tax(H[i]) - owe(H[i])) * inc[i] + P.trip * (m - n0);
      s.owe[i] = owe(H[i]);
      sales += s.owe[i] * inc[i];
      pol += s.dirt[i] * dirt * inc[i];
      poll += pl * inc[i];
      dues += L * inc[i];
      unpaid += +(P.poll > 0 && !pl);
    }
    if (revise) s.H = next;
    const h = H.reduce((a, b) => a + b) / P.n;
    return { D, fr, h, sales, pol, poll, dues, unpaid };
  }

  /** @param {State} s */
  function step(s) {
    const { P, Y } = s;
    // Holders read the budget: under a target, hearth loses value as fast as
    // its stock grows; a fixed wage holds it.
    if (P.rule !== 'peg') s.pe = ((P.spend - s.dues) * Y) / s.p / s.M - P.rate;
    const r = pass(s, true),
      D = Math.max(r.D, 1e-9 * Y),
      M0 = s.M,
      due = r.dues / s.p, // hearth due, set at last year's value
      kept = M0 * (1 - P.rate) - due,
      spent = P.rule === 'peg' ? Math.max(0, D - kept) : (P.spend * Y) / s.p;
    s.M = Math.max(kept + spent, 1e-9 * Y);
    const p = D / s.M,
      infl = s.p / p - 1,
      k = p / s.p / Y; // real share of income per hour due
    s.hist.push({
      share: r.h,
      balances: D / Y,
      demurrage: (P.rate * M0 * p) / Y,
      sales: r.sales * k,
      pollution: r.pol * k,
      poll: r.poll * k,
      lost: P.sales && 1 - r.sales / P.sales / Y, // share of the sales tax base lost
      unpaid: r.unpaid / P.n, // share of adults not paying the poll tax
      revenue: ((P.rate * M0 + due) * p) / Y,
      perAdult: ((P.rate * M0 + due) * p) / P.n,
      spent: (spent * p) / Y,
      value: p,
      infl,
      friction: r.fr / Y,
    });
    s.dues = r.dues / Y;
    s.g = (spent * p) / Y;
    s.p = p;
    s.year++;
  }

  /** @param {Opts} opts */
  function run(opts) {
    const s = create(opts);
    while (s.year < s.P.years) step(s);
    return s;
  }

  // Sales and poll tax by income decile, shares of its income.
  /** @param {State} s */
  function deciles(s) {
    const { inc, owe, P } = s,
      o = [...inc.keys()].sort((a, b) => inc[a] - inc[b]),
      sum = (g, f) => g.reduce((a, i) => a + f(i), 0);
    return Array.from({ length: 10 }, (_, d) => {
      const g = o.slice((d * P.n) / 10, ((d + 1) * P.n) / 10),
        y = sum(g, (i) => inc[i]);
      return [
        sum(g, (i) => owe[i] * inc[i]) / y,
        sum(g, (i) => (P.poll <= CAP * inc[i] ? P.poll : 0)) / y,
      ];
    });
  }

  return { DEFAULTS, PRESETS, create, step, run, deciles };
})();

/** @type {any} Node's CommonJS module, if any. */
// @ts-ignore: no Node types without a package.json
const mod = typeof module !== 'undefined' && module;
if (mod) mod.exports = Sim;
/** @param {any} fs @param {any} path @param {any} proc */
function cli(fs, path, proc) {
  const args = proc.argv.slice(2),
    preset = args[0] && !args[0].startsWith('--') ? args.shift() : 'base';
  /** @type {Record<string, any>} */
  const opts = { ...Sim.PRESETS[preset] },
    parse = (v) => (isNaN(v) ? v : Number(v));
  for (let i = 0; i < args.length; i += 2)
    opts[args[i].slice(2)] = parse(args[i + 1]);
  const [sk, sv] = opts.sweep?.split('=') ?? [],
    batch = (o) =>
      Array.from({ length: opts.runs ?? 4 }, (_, r) =>
        Sim.run({ ...o, seed: (opts.seed ?? 1) + r }),
      );
  const pct = (x) => (100 * x).toFixed(0) + '%',
    p2 = (x) => (100 * x).toFixed(2) + '%',
    f1 = (x) => x.toFixed(1),
    f2 = (x) => x.toFixed(2);
  /** @type {[string, (x: number) => string][]} */
  const cols = [
    ['share', pct],
    ['balances', p2],
    ['demurrage', p2],
    ['sales', p2],
    ['pollution', p2],
    ['poll', p2],
    ['lost', pct],
    ['unpaid', pct],
    ['revenue', p2],
    ['perAdult', f1],
    ['spent', p2],
    ['infl', pct],
    ['value', f2],
    ['friction', p2],
  ];
  // Mean (min-max) over runs of each column's mean in the ten years to y.
  const row = (S, y) =>
    cols.map(([k, f]) => {
      const v = S.map(
        ({ hist: h }) =>
          h.slice(y - 9, y + 1).reduce((a, r) => a + r[k], 0) / 10,
      );
      return `${f(v.reduce((a, b) => a + b) / v.length)} (${f(Math.min(...v))}-${f(Math.max(...v))})`;
    });
  // Mean over runs of sales and poll tax by income decile, if either is set.
  const burden = (S, v) =>
    ['sales', 'poll'].forEach(
      (k, j) =>
        S[0].P[k] &&
        console.log(
          [
            `${v} ${k}`,
            ...S.map(Sim.deciles)
              .reduce(
                (a, d) => a.map((x, i) => x + d[i][j] / S.length),
                Array(10).fill(0),
              )
              .map(p2),
          ].join('\t'),
        ),
    );
  const out = {},
    head = (x) => console.log([x, ...cols.map((c) => c[0])].join('\t'));
  console.log(
    `${opts.name ?? preset}: ${opts.runs ?? 4} runs, mean (min-max); shares of income`,
  );
  if (sk) {
    head(sk);
    for (const v of sv.split(',')) {
      const S = (out[v] = batch({ ...opts, [sk]: parse(v) }));
      console.log([v, ...row(S, S[0].year - 1)].join('\t'));
      burden(S, v);
    }
  } else {
    const S = (out[preset] = batch(opts));
    head('year');
    for (let y = 9; y < S[0].year; y += 10)
      console.log([y + 1, ...row(S, y)].join('\t'));
    burden(S, 'decile');
  }
  const file = path.join(
    proc.argv[1],
    `../../runs/moneysim-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ preset, opts, runs: out }, (k, v) =>
      v?.hist ? v.hist : v,
    ),
  );
  console.log(`wrote ${file}`);
}
if (mod?.id === '.')
  cli(
    mod.require('node:fs'),
    mod.require('node:path'),
    /** @type {any} */ (globalThis).process,
  );
