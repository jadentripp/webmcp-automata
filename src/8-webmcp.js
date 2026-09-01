/**
 * webmcp.js - registers the playground's WebMCP tools.
 *
 * Uses the native WebMCP Imperative API (document.modelContext) when the
 * browser provides it (Chrome 149+ with #enable-webmcp-testing, or an origin
 * trial token). Otherwise falls back to a tiny in-page shim with the same
 * registerTool/getTools/executeTool surface, so the app - and its built-in
 * agent console - still works everywhere for development and demos.
 */
(function () {
  'use strict';

  /* ---------------- fallback shim ---------------- */

  function createShim() {
    const tools = new Map();
    const listeners = new Set();
    const shim = {
      __isShim: true,
      async registerTool(tool) {
        if (!tool || !/^[a-zA-Z0-9_.-]{1,128}$/.test(tool.name || '')) {
          throw new Error('Invalid tool name');
        }
        if (tools.has(tool.name)) throw new Error('Tool "' + tool.name + '" is already registered');
        tools.set(tool.name, {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations || {},
          _execute: tool.execute,
        });
        listeners.forEach((fn) => fn());
      },
      async getTools() {
        return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
      },
      async executeTool(tool, argsJson) {
        const t = typeof tool === 'string' ? tools.get(tool) : tools.get(tool.name);
        if (!t) throw new Error('Tool not found: ' + (tool.name || tool));
        const args = typeof argsJson === 'string' ? JSON.parse(argsJson || '{}') : argsJson;
        return t._execute(args, {});
      },
      addEventListener(_type, fn) { listeners.add(fn); },
    };
    return shim;
  }

  const mc = document.modelContext || createShim();
  const NATIVE = !!document.modelContext;

  /* ---------------- tool definitions ---------------- */

  function buildTools(app) {
    const patternEnum = Object.keys(Automata.PATTERNS);
    const ruleEnum = Object.keys(Automata.RULE_PRESETS);

    return [
      {
        name: 'list_patterns',
        description: 'List the known Game of Life patterns that can be stamped onto the grid, with descriptions. Read-only.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => ({
          patterns: Object.entries(Automata.PATTERNS).map(([id, p]) => ({
            id, name: p.name, blurb: p.blurb, cells: p.cells.length,
          })),
        }),
      },
      {
        name: 'spawn_pattern',
        description: 'Stamp a known pattern (glider, pulsar, gosper_gun, ...) onto the grid. Coordinates are optional; by default the pattern is centered. The grid is ' + 120 + 'x' + 90 + ' cells, origin top-left.',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', enum: patternEnum, description: 'Pattern id from list_patterns' },
            x: { type: 'integer', description: 'Left edge of the pattern (cells), default: centered' },
            y: { type: 'integer', description: 'Top edge of the pattern (cells), default: centered' },
            rotation: { type: 'integer', enum: [0, 90, 180, 270], description: 'Clockwise rotation in degrees' },
            flip_x: { type: 'boolean', description: 'Mirror horizontally before placing' },
          },
          required: ['pattern'],
        },
        execute: async ({ pattern, x, y, rotation, flip_x }) => {
          const r = app.spawnPattern(pattern, x, y, rotation, flip_x, 'agent');
          return { ok: true, pattern, placed: r.placed, at: r.at, population: app.grid.population };
        },
      },
      {
        name: 'load_rle',
        description: 'Place a custom pattern from RLE (run-length encoded) text, e.g. "bob$2bo$3o!" for a glider. Use this to invent patterns not in the catalog.',
        inputSchema: {
          type: 'object',
          properties: {
            rle: { type: 'string', description: 'RLE body: b=dead, o=live, $=new row, !=end, numbers=run lengths' },
            x: { type: 'integer' },
            y: { type: 'integer' },
          },
          required: ['rle'],
        },
        execute: async ({ rle, x, y }) => {
          const r = app.loadRLE(rle, x, y, 'agent');
          return { ok: true, placed: r.placed, at: r.at, population: app.grid.population };
        },
      },
      {
        name: 'set_rules',
        description: 'Change the rule of the universe, either to a named preset or a custom rulestring in B../S.. notation (birth/survival neighbor counts). Optionally toggle toroidal wrap. Does not clear the grid.',
        inputSchema: {
          type: 'object',
          properties: {
            preset: { type: 'string', enum: ruleEnum, description: 'Named ruleset' },
            rulestring: { type: 'string', description: 'Custom rule like "B3/S23". Overrides preset.' },
            wrap: { type: 'boolean', description: 'Whether grid edges wrap around (torus)' },
          },
        },
        execute: async ({ preset, rulestring, wrap }) => {
          const rule = rulestring || (preset && Automata.RULE_PRESETS[preset].rule);
          if (!rule) throw new Error('Provide a preset or a rulestring.');
          const applied = app.setRules(rule, wrap, 'agent');
          return { ok: true, rule: applied, wrap: app.grid.wrap };
        },
      },
      {
        name: 'set_running',
        description: 'Start or pause the live animated simulation.',
        inputSchema: {
          type: 'object',
          properties: { running: { type: 'boolean' } },
          required: ['running'],
        },
        execute: async ({ running }) => ({ ok: true, running: app.setRunning(running, 'agent') }),
      },
      {
        name: 'run_steps',
        description: 'Fast-forward the simulation by N generations instantly (max 5000) and report how the population changed. Use analyze for a non-destructive forecast instead.',
        inputSchema: {
          type: 'object',
          properties: { generations: { type: 'integer', description: '1..5000' } },
          required: ['generations'],
        },
        execute: async ({ generations }) => {
          const r = app.runSteps(generations, 'agent');
          return { ok: true, ...r, boundingBox: app.grid.boundingBox() };
        },
      },
      {
        name: 'analyze',
        description: 'Non-destructively simulate a clone of the current universe up to N generations ahead and report its fate: extinction, stabilization (with period), or ongoing activity - plus a census of the objects that emerge (still lifes, oscillators, spaceships) with names where known (block, blinker, pulsar, glider, ...). Read-only: does not change the live grid.',
        inputSchema: {
          type: 'object',
          properties: { generations: { type: 'integer', description: 'How far ahead to look, 10..2000, default 300' } },
        },
        annotations: { readOnlyHint: true },
        execute: async ({ generations }) => app.analyze(generations, 'agent'),
      },
      {
        name: 'add_noise',
        description: 'Sprinkle random live cells ("soup") over the grid or a region. Great for co-creating: seed chaos, then run and analyze what emerges.',
        inputSchema: {
          type: 'object',
          properties: {
            density: { type: 'number', description: '0..1, fraction of cells set alive, default 0.15' },
            region: {
              type: 'object',
              properties: {
                x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' },
              },
              description: 'Optional rectangle; default is the whole grid',
            },
          },
        },
        execute: async ({ density, region }) => {
          const added = app.addNoise(density, region, 'agent');
          return { ok: true, added, population: app.grid.population };
        },
      },
      {
        name: 'clear',
        description: 'Remove all live cells and reset the generation counter to 0.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => { app.clear('agent'); return { ok: true, population: 0, generation: 0 }; },
      },
      {
        name: 'get_state',
        description: 'Read the current universe: generation, population, rule, wrap, bounding box, density, and an RLE encoding of the live cells (when the population is small enough). Read-only.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const g = app.grid;
          const state = {
            generation: g.generation,
            population: g.population,
            rule: g.rule,
            wrap: g.wrap,
            running: app.running,
            grid: { cols: g.cols, rows: g.rows },
            density: +(g.population / (g.cols * g.rows)).toFixed(4),
            boundingBox: g.boundingBox(),
          };
          if (g.population > 0 && g.population <= 2500) state.rle = g.toRLE();
          else if (g.population > 2500) state.rleNote = 'population too large for RLE export';
          return state;
        },
      },
    ];
  }

  /* ---------------- agent console UI ---------------- */

  function setupConsole(mc) {
    const $ = (id) => document.getElementById(id);
    const toggle = $('console-toggle');
    const body = $('console-body');
    toggle.addEventListener('click', async () => {
      const opening = body.classList.contains('hidden');
      body.classList.toggle('hidden');
      toggle.textContent = opening ? 'close' : 'open';
      if (opening) await refreshTools();
    });

    async function refreshTools() {
      const tools = await mc.getTools();
      const sel = $('console-tool');
      sel.innerHTML = '';
      for (const t of tools) {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
        sel.appendChild(opt);
      }
      showSchema();
    }

    async function showSchema() {
      const tools = await mc.getTools();
      const t = tools.find((x) => x.name === $('console-tool').value);
      $('console-schema').textContent = t
        ? t.description + '\n\n' + JSON.stringify(t.inputSchema, null, 2)
        : '(no tools)';
    }

    $('console-tool').addEventListener('change', showSchema);

    $('console-run').addEventListener('click', async () => {
      const out = $('console-result');
      out.textContent = 'running...';
      try {
        const tools = await mc.getTools();
        const t = tools.find((x) => x.name === $('console-tool').value);
        const args = $('console-args').value.trim() || '{}';
        const result = await mc.executeTool(t, args);
        out.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (err) {
        out.textContent = 'error: ' + (err && err.message ? err.message : String(err));
      }
    });
  }

  /* ---------------- registration ---------------- */

  window.addEventListener('DOMContentLoaded', async () => {
    const pill = document.getElementById('webmcp-status');
    const app = window.__app;
    try {
      for (const tool of buildTools(app)) {
        await mc.registerTool(tool);
      }
      const tools = await mc.getTools();
      window.__TOOLS = tools.map((t) => t.name).sort();
      if (NATIVE) {
        pill.textContent = 'WebMCP: ' + tools.length + ' tools live (native)';
        pill.className = 'pill pill-ok';
      } else {
        pill.textContent = 'WebMCP: ' + tools.length + ' tools (shim - enable #enable-webmcp-testing)';
        pill.className = 'pill pill-warn';
      }
      app.log('system', tools.length + ' WebMCP tools registered' + (NATIVE ? ' (native API)' : ' (shim; native API not detected)'));
    } catch (err) {
      pill.textContent = 'WebMCP: registration failed';
      pill.className = 'pill pill-warn';
      app.log('system', 'tool registration failed: ' + err.message);
      console.error(err);
    }
    setupConsole(mc);
    window.__WEBMCP_NATIVE = NATIVE;
    window.__WEBMCP_READY = true;
  });
})();
