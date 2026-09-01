/**
 * engine.js - pure cellular automata logic for the WebMCP Automata Playground.
 * No DOM access: runs in the browser and in Node (for unit tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Automata = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- Rules ---------------- */

  const RULE_PRESETS = {
    conway: {
      name: "Conway's Game of Life",
      rule: 'B3/S23',
      blurb: 'The classic. Rich balance of still lifes, oscillators and spaceships.',
    },
    highlife: {
      name: 'HighLife',
      rule: 'B36/S23',
      blurb: 'Conway plus birth on 6 neighbors. Famous for its self-replicating pattern.',
    },
    seeds: {
      name: 'Seeds',
      rule: 'B2/S',
      blurb: 'Every live cell dies each step; birth on exactly 2. Explosive chaos.',
    },
    daynight: {
      name: 'Day & Night',
      rule: 'B3678/S34678',
      blurb: 'Symmetric: dead and live cells mirror each other. Blobby, ink-like structures.',
    },
    morley: {
      name: 'Morley (Move)',
      rule: 'B368/S245',
      blurb: 'Slow, crawl-like spaceships and long-lived methuselahs.',
    },
  };

  function parseRuleString(s) {
    if (typeof s !== 'string') throw new Error('Rule must be a string like "B3/S23"');
    const m = s.trim().toUpperCase().match(/^B([0-8]*)\/?S([0-8]*)$/);
    if (!m) throw new Error('Invalid rule string "' + s + '". Expected format B<digits>/S<digits>, e.g. B3/S23');
    const toSet = (d) => new Set(d.split('').filter((c) => c !== '').map(Number));
    return { birth: toSet(m[1]), survive: toSet(m[2]), rule: 'B' + m[1] + '/S' + m[2] };
  }

  /* ---------------- Grid ---------------- */

  class Grid {
    constructor(cols, rows, opts) {
      opts = opts || {};
      this.cols = cols;
      this.rows = rows;
      this.wrap = opts.wrap !== undefined ? !!opts.wrap : true;
      this.setRule(opts.rule || 'B3/S23');
      this.cells = new Uint8Array(cols * rows);
      this._next = new Uint8Array(cols * rows);
      this.generation = 0;
      this.population = 0;
    }

    setRule(ruleString) {
      const r = parseRuleString(ruleString);
      this.rule = r.rule;
      this._birth = r.birth;
      this._survive = r.survive;
    }

    idx(x, y) { return y * this.cols + x; }

    normX(x) { const c = this.cols; return ((x % c) + c) % c; }
    normY(y) { const r = this.rows; return ((y % r) + r) % r; }

    get(x, y) {
      if (this.wrap) return this.cells[this.idx(this.normX(x), this.normY(y))];
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return 0;
      return this.cells[this.idx(x, y)];
    }

    set(x, y, v) {
      if (this.wrap) { x = this.normX(x); y = this.normY(y); }
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
      const i = this.idx(x, y);
      const old = this.cells[i];
      const nv = v ? 1 : 0;
      if (old !== nv) { this.cells[i] = nv; this.population += nv - old; }
    }

    toggle(x, y) { this.set(x, y, !this.get(x, y)); }

    clear() {
      this.cells.fill(0);
      this.population = 0;
      this.generation = 0;
    }

    clone() {
      const g = new Grid(this.cols, this.rows, { rule: this.rule, wrap: this.wrap });
      g.cells.set(this.cells);
      g.population = this.population;
      g.generation = this.generation;
      return g;
    }

    /** Advance one generation. Returns the new population. */
    step() {
      const { cols, rows, cells, _next, _birth, _survive } = this;
      let pop = 0;
      if (this.wrap) {
        for (let y = 0; y < rows; y++) {
          const yu = ((y - 1 + rows) % rows) * cols, yc = y * cols, yd = ((y + 1) % rows) * cols;
          for (let x = 0; x < cols; x++) {
            const xl = (x - 1 + cols) % cols, xr = (x + 1) % cols;
            const n =
              cells[yu + xl] + cells[yu + x] + cells[yu + xr] +
              cells[yc + xl] + cells[yc + xr] +
              cells[yd + xl] + cells[yd + x] + cells[yd + xr];
            const alive = cells[yc + x];
            const nv = alive ? (_survive.has(n) ? 1 : 0) : (_birth.has(n) ? 1 : 0);
            _next[yc + x] = nv;
            pop += nv;
          }
        }
      } else {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              const yy = y + dy;
              if (yy < 0 || yy >= rows) continue;
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const xx = x + dx;
                if (xx < 0 || xx >= cols) continue;
                n += cells[yy * cols + xx];
              }
            }
            const alive = cells[y * cols + x];
            const nv = alive ? (_survive.has(n) ? 1 : 0) : (_birth.has(n) ? 1 : 0);
            _next[y * cols + x] = nv;
            pop += nv;
          }
        }
      }
      this.cells.set(_next);
      this.population = pop;
      this.generation++;
      return pop;
    }

    run(n) {
      let last = this.population;
      for (let i = 0; i < n; i++) last = this.step();
      return last;
    }

    boundingBox() {
      let minX = this.cols, minY = this.rows, maxX = -1, maxY = -1;
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          if (this.cells[y * this.cols + x]) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    liveCells() {
      const out = [];
      for (let y = 0; y < this.rows; y++)
        for (let x = 0; x < this.cols; x++)
          if (this.cells[y * this.cols + x]) out.push([x, y]);
      return out;
    }

    /** Deterministic string hash of the current state (for cycle detection). */
    hash() {
      // FNV-1a over the byte array, plus population to shorten collisions.
      let h = 0x811c9dc5;
      const c = this.cells;
      for (let i = 0; i < c.length; i++) {
        h ^= c[i];
        h = (h * 0x01000193) >>> 0;
      }
      return h.toString(36) + ':' + this.population;
    }

    /** Spawn a list of [x,y] cells with rotation (0/90/180/270) and optional x-flip. */
    spawnCells(cells, ox, oy, rotation, flipX) {
      rotation = ((rotation || 0) % 360 + 360) % 360;
      let placed = 0;
      for (const [cx, cy] of cells) {
        let x = flipX ? -cx : cx, y = cy;
        if (rotation === 90) { const t = x; x = -y; y = t; }
        else if (rotation === 180) { x = -x; y = -y; }
        else if (rotation === 270) { const t = x; x = y; y = -t; }
        this.set(ox + x, oy + y, 1);
        placed++;
      }
      return placed;
    }

    addNoise(density, region) {
      const r = region || { x: 0, y: 0, w: this.cols, h: this.rows };
      let added = 0;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (Math.random() < density) {
            if (!this.get(x, y)) { this.set(x, y, 1); added++; }
          }
        }
      }
      return added;
    }

    /** Run-length encode live cells: e.g. "2b2o$..." with ! terminator. */
    toRLE() {
      const bb = this.boundingBox();
      if (!bb) return '!';
      let out = '';
      for (let y = bb.y; y < bb.y + bb.h; y++) {
        let run = 0, runVal = 0, row = '';
        for (let x = bb.x; x < bb.x + bb.w; x++) {
          const v = this.get(x, y);
          if (x === bb.x) { runVal = v; run = 1; continue; }
          if (v === runVal) run++;
          else {
            row += (run > 1 ? run : '') + (runVal ? 'o' : 'b');
            runVal = v; run = 1;
          }
        }
        if (runVal) row += (run > 1 ? run : '') + 'o'; // trailing dead cells dropped
        out += row;
        if (y < bb.y + bb.h - 1) out += '$';
      }
      return out + '!';
    }

    /** Load RLE at offset. Returns cell count placed. */
    loadRLE(rle, ox, oy) {
      const body = rle.includes('$') || rle.includes('!') ? rle.split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('x')).join('') : rle;
      let x = 0, y = 0, num = '', placed = 0;
      for (const ch of body.replace(/\s+/g, '')) {
        if (ch >= '0' && ch <= '9') { num += ch; continue; }
        const n = num === '' ? 1 : parseInt(num, 10);
        num = '';
        if (ch === 'b' || ch === 'B') x += n;
        else if (ch === 'o' || ch === 'O' || ch === 'A') {
          for (let i = 0; i < n; i++) { this.set(ox + x + i, oy + y, 1); placed++; }
          x += n;
        } else if (ch === '$') { y += n; x = 0; }
        else if (ch === '!') break;
      }
      return placed;
    }
  }

  /* ---------------- Pattern catalog ---------------- */

  /** Decode RLE body ("bo$2bo$3o!") into [[x,y], ...]. */
  function decodeRLE(rle) {
    const cells = [];
    let x = 0, y = 0, num = '';
    for (const ch of rle.replace(/\s+/g, '')) {
      if (ch >= '0' && ch <= '9') { num += ch; continue; }
      const n = num === '' ? 1 : parseInt(num, 10);
      num = '';
      if (ch === 'b' || ch === 'B') x += n;
      else if (ch === 'o' || ch === 'O' || ch === 'A') {
        for (let i = 0; i < n; i++) cells.push([x + i, y]);
        x += n;
      } else if (ch === '$') { y += n; x = 0; }
      else if (ch === '!') break;
    }
    return cells;
  }

  const PATTERNS = {
    glider: { name: 'Glider', blurb: 'The iconic c/4 diagonal spaceship.', rle: 'bob$2bo$3o!' },
    lwss: { name: 'Lightweight spaceship', blurb: 'c/2 orthogonal spaceship.', rle: 'bo2bo$o$o3bo$4o!' },
    blinker: { name: 'Blinker', blurb: 'Period-2 oscillator.', rle: '3o!' },
    toad: { name: 'Toad', blurb: 'Period-2 oscillator.', rle: 'b3o$3o!' },
    beacon: { name: 'Beacon', blurb: 'Period-2 oscillator.', rle: '2o$2o$2b2o$2b2o!' },
    pulsar: {
      name: 'Pulsar', blurb: 'Beautiful period-3 oscillator.',
      rle: '2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!',
    },
    pentadecathlon: { name: 'Pentadecathlon', blurb: 'Period-15 oscillator.', rle: '2bo4bo$2ob4ob2o$2bo4bo!' },
    block: { name: 'Block', blurb: 'The most common still life.', rle: '2o$2o!' },
    beehive: { name: 'Beehive', blurb: 'Common still life.', rle: 'b2o$o2bo$b2o!' },
    loaf: { name: 'Loaf', blurb: 'Common still life.', rle: 'b2o$o2bo$bobo$2bo!' },
    boat: { name: 'Boat', blurb: 'Common still life.', rle: '2o$obo$bo!' },
    rpentomino: { name: 'R-pentomino', blurb: 'Tiny methuselah: 5 cells that boil for ~1100 generations.', rle: 'b2o$2o$bo!' },
    acorn: { name: 'Acorn', blurb: 'Methuselah: 7 cells, runs for ~5200 generations.', rle: 'bo$3bo$2o2b3o!' },
    diehard: { name: 'Diehard', blurb: 'Methuselah that fully vanishes after 130 generations.', rle: '6bo$2o$bo3b3o!' },
    gosper_gun: {
      name: 'Gosper glider gun', blurb: 'Fires a new glider every 30 generations. Forever.',
      rle: '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!',
    },
  };
  for (const p of Object.values(PATTERNS)) p.cells = decodeRLE(p.rle);

  /* ---------------- Analysis ---------------- */

  function key(cells) {
    return cells.map((c) => c[0] + ',' + c[1]).sort().join(';');
  }

  function normalize(cells) {
    let minX = Infinity, minY = Infinity;
    for (const [x, y] of cells) { if (x < minX) minX = x; if (y < minY) minY = y; }
    return cells.map(([x, y]) => [x - minX, y - minY]);
  }

  // Known named objects for recognition, keyed by normalized cell signature.
  const NAMED_OBJECTS = (function () {
    const map = new Map();
    const add = (label, cells) => map.set(key(normalize(cells)), label);
    const rotate90 = (cells) => cells.map(([x, y]) => [-y, x]);
    // register a shape in all 4 rotations
    const addRotations = (label, cells) => {
      let cur = cells;
      for (let i = 0; i < 4; i++) { add(label, cur); cur = rotate90(cur); }
    };
    // register a moving pattern in every phase x rotation
    const addSpaceship = (label, cells) => {
      const g = new Grid(30, 30, { rule: 'B3/S23', wrap: false });
      g.spawnCells(cells, 12, 12);
      for (let phase = 0; phase < 4; phase++) {
        addRotations(label, g.liveCells());
        g.step();
      }
    };
    add('block', PATTERNS.block.cells);
    add('beehive', PATTERNS.beehive.cells);
    addRotations('beehive', PATTERNS.beehive.cells);
    addRotations('loaf', PATTERNS.loaf.cells);
    addRotations('boat', PATTERNS.boat.cells);
    add('tub', [[1, 0], [0, 1], [2, 1], [1, 2]]);
    add('blinker', PATTERNS.blinker.cells);
    add('blinker', [[0, 0], [0, 1], [0, 2]]);
    addRotations('toad', PATTERNS.toad.cells);
    addRotations('beacon', PATTERNS.beacon.cells);
    add('pulsar', PATTERNS.pulsar.cells);
    add('pentadecathlon', PATTERNS.pentadecathlon.cells);
    add('pentadecathlon', rotate90(PATTERNS.pentadecathlon.cells));
    add('gosper glider gun', PATTERNS.gosper_gun.cells);
    addSpaceship('glider', PATTERNS.glider.cells);
    addSpaceship('lwss', PATTERNS.lwss.cells);
    return map;
  })();

  /** Connected components of live cells (8-connectivity). Returns arrays of [x,y]. */
  function components(grid) {
    const seen = new Uint8Array(grid.cols * grid.rows);
    const out = [];
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const i = y * grid.cols + x;
        if (!grid.cells[i] || seen[i]) continue;
        const comp = [];
        const stack = [[x, y]];
        seen[i] = 1;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          comp.push([cx, cy]);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
              const ni = ny * grid.cols + nx;
              if (grid.cells[ni] && !seen[ni]) { seen[ni] = 1; stack.push([nx, ny]); }
            }
          }
        }
        out.push(comp);
      }
    }
    return out;
  }

  /**
   * Classify one component by simulating it in isolation (bounded local box)
   * for up to `maxGen` generations. Detects extinction, still lifes,
   * oscillators (period) and spaceships (period + translation).
   */
  function classifyComponent(cells, rule, maxGen) {
    maxGen = maxGen || 60;
    const pad = 16;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of cells) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const w = maxX - minX + 1 + pad * 2, h = maxY - minY + 1 + pad * 2;
    const g = new Grid(w, h, { rule, wrap: false });
    g.spawnCells(cells.map(([x, y]) => [x - minX + pad, y - minY + pad]), 0, 0, 0, false);

    const snaps = [{ gen: 0, norm: key(normalize(g.liveCells())), c: centroid(g.liveCells()) }];
    for (let i = 1; i <= maxGen; i++) {
      if (g.step() === 0) return { type: 'vanished' };
      const bb = g.boundingBox();
      if (bb && (bb.x === 0 || bb.y === 0 || bb.x + bb.w >= w || bb.y + bb.h >= h)) {
        return { type: 'unstable', note: 'grew beyond analysis bounds' };
      }
      const norm = key(normalize(g.liveCells()));
      for (const snap of snaps) {
        if (snap.norm === norm) {
          const period = i - snap.gen;
          const c = centroid(g.liveCells());
          const dx = Math.round((c.x - snap.c.x) * 100) / 100;
          const dy = Math.round((c.y - snap.c.y) * 100) / 100;
          const name = NAMED_OBJECTS.get(norm) || null;
          if (dx === 0 && dy === 0) {
            return period === 1
              ? { type: 'still-life', period: 1, name }
              : { type: 'oscillator', period, name };
          }
          return { type: 'spaceship', period, translation: [dx, dy], name };
        }
      }
      snaps.push({ gen: i, norm, c: centroid(g.liveCells()) });
    }
    return { type: 'unstable', note: 'still evolving after ' + maxGen + ' generations' };
  }

  function centroid(cells) {
    let sx = 0, sy = 0;
    for (const [x, y] of cells) { sx += x; sy += y; }
    return { x: sx / cells.length, y: sy / cells.length };
  }

  /**
   * Non-destructive analysis: clones the grid, fast-forwards up to maxGen,
   * detects extinction / stabilization (whole-grid cycle) / ongoing activity,
   * then classifies the objects present in the final state.
   */
  function analyze(grid, maxGen) {
    maxGen = maxGen || 500;
    const g = grid.clone();
    const seen = new Map();
    const popSeries = [];
    let verdict = null;

    for (let i = 0; i <= maxGen; i++) {
      popSeries.push(g.population);
      if (g.population === 0) {
        verdict = { type: 'extinct', atGeneration: g.generation, afterSteps: i };
        break;
      }
      const h = g.hash();
      const prev = seen.get(h);
      if (prev !== undefined) {
        verdict = {
          type: 'stabilized',
          period: i - prev,
          settledAfterSteps: prev,
          periodType: i - prev === 1 ? 'static' : 'oscillating',
        };
        break;
      }
      seen.set(h, i);
      g.step();
    }
    if (!verdict) verdict = { type: 'active', note: 'still evolving after ' + maxGen + ' generations' };

    const comps = components(g);
    const objects = [];
    const counts = {};
    const cap = 60; // classify at most 60 components
    for (const comp of comps.slice(0, cap)) {
      const info = classifyComponent(comp, g.rule);
      let label;
      if (info.name) label = info.name;
      else if (info.type === 'still-life') label = 'unnamed still life';
      else if (info.type === 'oscillator') label = 'period-' + info.period + ' oscillator';
      else if (info.type === 'spaceship') label = 'period-' + info.period + ' spaceship';
      else label = info.type;
      counts[label] = (counts[label] || 0) + 1;
      objects.push({ cells: comp.length, type: info.type, period: info.period || null, label });
    }

    const min = Math.min.apply(null, popSeries), max = Math.max.apply(null, popSeries);
    return {
      verdict,
      stepsSimulated: popSeries.length - 1,
      population: { start: popSeries[0], end: popSeries[popSeries.length - 1], min, max },
      objectCounts: counts,
      componentCount: comps.length,
      componentsTruncated: comps.length > cap,
      boundingBox: g.boundingBox(),
    };
  }

  return {
    Grid,
    RULE_PRESETS,
    PATTERNS,
    parseRuleString,
    analyze,
    components,
    classifyComponent,
    normalize,
  };
});
