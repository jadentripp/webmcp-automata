/**
 * app.js - canvas UI, simulation loop, and human interactions.
 * Exposes window.__app for the WebMCP layer (src/webmcp.js) and for tests.
 */
(function () {
  'use strict';

  const COLS = 120, ROWS = 90, CELL = 8;

  class App {
    constructor() {
      this.grid = new Automata.Grid(COLS, ROWS, { rule: 'B3/S23', wrap: true });
      this.running = false;
      this.speed = 12; // generations per second
      this._acc = 0;
      this._lastTs = 0;
      this.stampPattern = null; // pattern id armed for stamping
      this.flashRegions = [];   // {x,y,w,h,color,until}
      this.drawing = false;
      this.drawValue = 1;
      this._lastDrawCell = null;

      this.canvas = document.getElementById('grid');
      this.ctx = this.canvas.getContext('2d');
      this._bindUI();
      this._seed();
      this.render(true);
      this.updateStats();
      requestAnimationFrame((ts) => this._tick(ts));
    }

    /* ---------------- setup ---------------- */

    _seed() {
      this.grid.spawnCells(Automata.PATTERNS.gosper_gun.cells, 6, 30);
      this.grid.spawnCells(Automata.PATTERNS.pulsar.cells, 78, 18);
      this.grid.spawnCells(Automata.PATTERNS.rpentomino.cells, 60, 60);
      this.log('system', 'seeded: Gosper gun + pulsar + R-pentomino. Press Run, or ask your agent to take it from here.');
    }

    _bindUI() {
      const $ = (id) => document.getElementById(id);

      // playback
      $('btn-play').addEventListener('click', () => this.setRunning(!this.running, 'you'));
      $('btn-step').addEventListener('click', () => { this.stepOnce('you'); });
      $('btn-clear').addEventListener('click', () => this.clear('you'));
      $('btn-noise').addEventListener('click', () => this.addNoise(0.12, null, 'you'));
      $('speed').addEventListener('input', (e) => {
        this.speed = Number(e.target.value);
        $('speed-out').textContent = this.speed;
      });
      $('wrap').addEventListener('change', (e) => {
        this.grid.wrap = e.target.checked;
        this.log('you', 'toroidal wrap ' + (this.grid.wrap ? 'on' : 'off'));
      });

      // rules
      const preset = $('rule-preset');
      for (const [id, r] of Object.entries(Automata.RULE_PRESETS)) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = r.name + '  (' + r.rule + ')';
        preset.appendChild(opt);
      }
      preset.addEventListener('change', () => {
        const r = Automata.RULE_PRESETS[preset.value];
        $('rulestring').value = r.rule;
        $('rule-blurb').textContent = r.blurb;
        this.setRules(r.rule, undefined, 'you');
      });
      $('rule-blurb').textContent = Automata.RULE_PRESETS.conway.blurb;
      $('btn-apply-rule').addEventListener('click', () => {
        try {
          this.setRules($('rulestring').value, undefined, 'you');
        } catch (err) {
          this.log('system', 'rule rejected: ' + err.message);
        }
      });

      // pattern palette
      const list = $('pattern-list');
      for (const [id, p] of Object.entries(Automata.PATTERNS)) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = p.name;
        b.title = p.blurb;
        b.dataset.pattern = id;
        b.addEventListener('click', () => this._armStamp(id, b));
        list.appendChild(b);
      }

      // canvas drawing
      this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
      window.addEventListener('mouseup', () => { this.drawing = false; this._lastDrawCell = null; });
      this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // keyboard
      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.code === 'Space') { e.preventDefault(); this.setRunning(!this.running, 'you'); }
        else if (e.key === 's') this.stepOnce('you');
        else if (e.key === 'c') this.clear('you');
        else if (e.key === 'Escape') this._disarmStamp();
      });
    }

    /* ---------------- human canvas input ---------------- */

    _cellFromEvent(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.grid.cols);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.grid.rows);
      return [x, y];
    }

    _onMouseDown(e) {
      const [x, y] = this._cellFromEvent(e);
      if (this.stampPattern) {
        this.spawnPattern(this.stampPattern, x, y, 0, false, 'you');
        this._disarmStamp();
        return;
      }
      this.drawing = true;
      this.drawValue = (e.shiftKey || e.button === 2) ? 0 : 1;
      this._lastDrawCell = [x, y];
      this.grid.set(x, y, this.drawValue);
      this.render(true);
      this.updateStats();
    }

    _onMouseMove(e) {
      const [x, y] = this._cellFromEvent(e);
      this._hover = [x, y];
      if (!this.drawing) return;
      // interpolate between last cell and current for smooth strokes
      const [lx, ly] = this._lastDrawCell || [x, y];
      const steps = Math.max(Math.abs(x - lx), Math.abs(y - ly), 1);
      for (let i = 0; i <= steps; i++) {
        const ix = Math.round(lx + ((x - lx) * i) / steps);
        const iy = Math.round(ly + ((y - ly) * i) / steps);
        this.grid.set(ix, iy, this.drawValue);
      }
      this._lastDrawCell = [x, y];
      this.render(true);
      this.updateStats();
    }

    _armStamp(id, btn) {
      this._disarmStamp();
      this.stampPattern = id;
      btn.classList.add('armed');
      const hint = document.getElementById('stamp-hint');
      hint.textContent = 'click the grid to stamp: ' + Automata.PATTERNS[id].name + '  (esc to cancel)';
      hint.classList.remove('hidden');
    }

    _disarmStamp() {
      this.stampPattern = null;
      document.querySelectorAll('.pattern-list .btn.armed').forEach((b) => b.classList.remove('armed'));
      document.getElementById('stamp-hint').classList.add('hidden');
    }

    /* ---------------- core actions (shared by human + tools) ---------------- */

    setRunning(running, who) {
      this.running = !!running;
      document.getElementById('btn-play').innerHTML = this.running ? '&#10074;&#10074; Pause' : '&#9654; Run';
      if (who) this.log(who, this.running ? 'started the simulation' : 'paused the simulation');
      this.render(true);
      return this.running;
    }

    stepOnce(who) {
      this.grid.step();
      if (who) this.log(who, 'stepped to generation ' + this.grid.generation);
      this.render(true);
      this.updateStats();
    }

    clear(who) {
      this.grid.clear();
      if (who) this.log(who, 'cleared the universe');
      this.render(true);
      this.updateStats();
    }

    setRules(rule, wrap, who) {
      this.grid.setRule(rule);
      if (wrap !== undefined) {
        this.grid.wrap = !!wrap;
        document.getElementById('wrap').checked = this.grid.wrap;
      }
      document.getElementById('rulestring').value = this.grid.rule;
      const presetEntry = Object.entries(Automata.RULE_PRESETS).find(([, r]) => r.rule === this.grid.rule);
      document.getElementById('rule-preset').value = presetEntry ? presetEntry[0] : 'conway';
      document.getElementById('rule-blurb').textContent = presetEntry ? presetEntry[1].blurb : 'Custom rule.';
      if (who) this.log(who, 'set rules to ' + this.grid.rule + (wrap !== undefined ? ', wrap ' + (this.grid.wrap ? 'on' : 'off') : ''));
      this.render(true);
      this.updateStats();
      return this.grid.rule;
    }

    spawnPattern(patternId, x, y, rotation, flipX, who) {
      const p = Automata.PATTERNS[patternId];
      if (!p) throw new Error('Unknown pattern "' + patternId + '". Call list_patterns to see options.');
      // default: center the pattern on the canvas
      let w = 0, h = 0;
      for (const [cx, cy] of p.cells) { w = Math.max(w, cx); h = Math.max(h, cy); }
      const ox = x === undefined ? Math.floor((this.grid.cols - w) / 2) : x;
      const oy = y === undefined ? Math.floor((this.grid.rows - h) / 2) : y;
      const placed = this.grid.spawnCells(p.cells, ox, oy, rotation || 0, !!flipX);
      if (who) this.log(who, 'stamped ' + p.name + ' at (' + ox + ', ' + oy + ')');
      this.flash(ox, oy, w + 1, h + 1, '#35d3ff');
      this.render(true);
      this.updateStats();
      return { placed, at: [ox, oy] };
    }

    loadRLE(rle, x, y, who) {
      const ox = x === undefined ? Math.floor(this.grid.cols / 4) : x;
      const oy = y === undefined ? Math.floor(this.grid.rows / 4) : y;
      const placed = this.grid.loadRLE(rle, ox, oy);
      if (placed === 0) throw new Error('RLE produced no live cells - check the encoding.');
      if (who) this.log(who, 'loaded ' + placed + ' cells from RLE at (' + ox + ', ' + oy + ')');
      this.flash(ox, oy, 20, 10, '#35d3ff');
      this.render(true);
      this.updateStats();
      return { placed, at: [ox, oy] };
    }

    addNoise(density, region, who) {
      density = Math.min(1, Math.max(0, density === undefined ? 0.15 : density));
      const added = this.grid.addNoise(density, region);
      if (who) this.log(who, 'sprinkled ' + added + ' random cells (' + Math.round(density * 100) + '% soup)');
      if (region) this.flash(region.x, region.y, region.w, region.h, '#ff4d9d');
      this.render(true);
      this.updateStats();
      return added;
    }

    runSteps(n, who) {
      n = Math.max(1, Math.min(5000, Math.floor(n)));
      const before = this.grid.population;
      const g0 = this.grid.generation;
      this.grid.run(n);
      if (who) this.log(who, 'fast-forwarded ' + n + ' generations (gen ' + g0 + ' -> ' + this.grid.generation + ')');
      this.render(true);
      this.updateStats();
      return { from: g0, to: this.grid.generation, populationBefore: before, populationAfter: this.grid.population };
    }

    analyze(generations, who) {
      generations = Math.max(10, Math.min(2000, Math.floor(generations || 300)));
      if (who) this.log(who, 'analyzing the next ' + generations + ' generations...');
      const result = Automata.analyze(this.grid, generations);
      if (who) {
        const v = result.verdict;
        const summary =
          v.type === 'extinct' ? 'everything dies out after ' + v.afterSteps + ' generations' :
          v.type === 'stabilized' ? 'settles into ' + (v.period === 1 ? 'a static pattern' : 'a period-' + v.period + ' cycle') + ' after ' + v.settledAfterSteps + ' generations' :
          'still active after ' + result.stepsSimulated + ' generations';
        this.log('agent', 'analysis: ' + summary);
      }
      return result;
    }

    /* ---------------- render + stats ---------------- */

    flash(x, y, w, h, color) {
      this.flashRegions.push({ x, y, w, h, color, until: performance.now() + 1200 });
    }

    render(full) {
      const { ctx, canvas } = this;
      const now = performance.now();
      this.flashRegions = this.flashRegions.filter((f) => f.until > now);

      if (full) {
        ctx.fillStyle = '#04070a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // grid lines
        ctx.strokeStyle = 'rgba(61, 255, 139, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= this.grid.cols; x += 4) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, canvas.height); }
        for (let y = 0; y <= this.grid.rows; y += 4) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(canvas.width, y * CELL + 0.5); }
        ctx.stroke();
      } else {
        // motion trails while running
        ctx.fillStyle = 'rgba(4, 7, 10, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // cells
      ctx.fillStyle = full ? '#3dff8b' : 'rgba(61, 255, 139, 0.95)';
      const c = this.grid.cells, cols = this.grid.cols;
      for (let i = 0; i < c.length; i++) {
        if (c[i]) {
          const x = (i % cols) * CELL, y = Math.floor(i / cols) * CELL;
          ctx.fillRect(x, y, CELL - 1, CELL - 1);
        }
      }

      // flash regions (agent/human action feedback)
      for (const f of this.flashRegions) {
        const t = (f.until - now) / 1200;
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = t;
        ctx.lineWidth = 2;
        ctx.strokeRect(f.x * CELL - 2, f.y * CELL - 2, f.w * CELL + 4, f.h * CELL + 4);
        ctx.globalAlpha = 1;
      }

      // stamp ghost preview
      if (this.stampPattern && this._hover) {
        const p = Automata.PATTERNS[this.stampPattern];
        ctx.fillStyle = 'rgba(53, 211, 255, 0.4)';
        for (const [cx, cy] of p.cells) {
          const x = (this._hover[0] + cx) * CELL, y = (this._hover[1] + cy) * CELL;
          ctx.fillRect(x, y, CELL - 1, CELL - 1);
        }
      }
    }

    updateStats() {
      const g = this.grid;
      document.getElementById('stat-gen').textContent = g.generation;
      document.getElementById('stat-pop').textContent = g.population;
      document.getElementById('stat-density').textContent = ((g.population / (g.cols * g.rows)) * 100).toFixed(1) + '%';
      document.getElementById('stat-rule').textContent = g.rule;
    }

    _tick(ts) {
      if (this.running) {
        const dt = Math.min(0.25, (ts - this._lastTs) / 1000);
        this._acc += dt * this.speed;
        const steps = Math.floor(this._acc);
        if (steps > 0) {
          this._acc -= steps;
          for (let i = 0; i < steps; i++) this.grid.step();
          this.render(false);
          this.updateStats();
        } else if (this.flashRegions.length || this.stampPattern) {
          this.render(true);
        }
      } else if (this.flashRegions.length || this.stampPattern) {
        this.render(true);
      }
      this._lastTs = ts;
      requestAnimationFrame((t2) => this._tick(t2));
    }

    /* ---------------- activity log ---------------- */

    log(who, text) {
      const ul = document.getElementById('log');
      const li = document.createElement('li');
      li.className = who;
      const time = new Date().toTimeString().slice(0, 8);
      const whoLabel = who === 'agent' ? 'AGENT' : who === 'you' ? 'YOU' : 'SYS';
      li.innerHTML = '<time>' + time + '</time><span class="who">[' + whoLabel + ']</span> ';
      li.appendChild(document.createTextNode(text));
      ul.prepend(li);
      while (ul.children.length > 80) ul.removeChild(ul.lastChild);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.__app = new App();
    window.__APP_READY = true;
  });
})();
