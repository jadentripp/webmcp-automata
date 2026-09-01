'use strict';
const assert = require('node:assert');
const A = require('../src/engine.js');
const { Grid, PATTERNS, parseRuleString, analyze, classifyComponent, normalize } = A;

const key = (cells) => normalize(cells).map((c) => c[0] + ',' + c[1]).sort().join(';');
let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok -', name); }

t('parseRuleString parses B3/S23', () => {
  const r = parseRuleString('B3/S23');
  assert.deepStrictEqual([...r.birth], [3]);
  assert.deepStrictEqual([...r.survive], [2, 3]);
});
t('parseRuleString rejects garbage', () => {
  assert.throws(() => parseRuleString('conway'));
  assert.throws(() => parseRuleString('B9/S23'));
});
t('glider translates (1,1) after 4 generations', () => {
  const g = new Grid(30, 30, { wrap: false });
  g.spawnCells(PATTERNS.glider.cells, 5, 5);
  const before = key(g.liveCells());
  g.run(4);
  const after = key(g.liveCells().map(([x, y]) => [x - 1, y - 1]));
  assert.strictEqual(after, before);
});
t('block is a still life', () => {
  const g = new Grid(20, 20, { wrap: false });
  g.spawnCells(PATTERNS.block.cells, 5, 5);
  const before = key(g.liveCells());
  g.run(10);
  assert.strictEqual(key(g.liveCells()), before);
});
t('blinker oscillates with period 2', () => {
  const g = new Grid(20, 20, { wrap: false });
  g.spawnCells(PATTERNS.blinker.cells, 5, 5);
  const s0 = key(g.liveCells());
  g.step();
  assert.notStrictEqual(key(g.liveCells()), s0);
  g.step();
  assert.strictEqual(key(g.liveCells()), s0);
});
t('classifier names common objects', () => {
  assert.strictEqual(classifyComponent(PATTERNS.block.cells, 'B3/S23').name, 'block');
  assert.strictEqual(classifyComponent(PATTERNS.pulsar.cells, 'B3/S23').period, 3);
  const gl = classifyComponent(PATTERNS.glider.cells, 'B3/S23');
  assert.strictEqual(gl.type, 'spaceship');
  assert.deepStrictEqual(gl.translation, [1, 1]);
});
t('gosper gun fires a glider every 30 gens', () => {
  const g = new Grid(80, 60, { wrap: false });
  g.spawnCells(PATTERNS.gosper_gun.cells, 4, 4);
  assert.strictEqual(g.population, 36);
  g.run(30);
  assert.strictEqual(g.population, 41);
  g.run(30);
  assert.strictEqual(g.population, 46);
});
t('diehard goes extinct at generation 130', () => {
  const g = new Grid(60, 60, { wrap: false });
  g.spawnCells(PATTERNS.diehard.cells, 10, 10);
  g.run(130);
  assert.strictEqual(g.population, 0);
});
t('analyze reports stabilized R-pentomino with objects', () => {
  const g = new Grid(120, 120, { wrap: false });
  g.spawnCells(PATTERNS.rpentomino.cells, 60, 60);
  const res = analyze(g, 1400);
  assert.strictEqual(res.verdict.type, 'stabilized');
  assert.ok(res.verdict.settledAfterSteps > 900, 'rpentomino takes >900 gens');
  assert.ok(res.objectCounts.block >= 1, 'has blocks');
  assert.ok(res.componentCount >= 5);
});
t('analyze reports extinction', () => {
  const g = new Grid(60, 60, { wrap: false });
  g.spawnCells(PATTERNS.diehard.cells, 10, 10);
  const res = analyze(g, 300);
  assert.strictEqual(res.verdict.type, 'extinct');
  assert.strictEqual(res.verdict.afterSteps, 130);
});
t('RLE round-trips', () => {
  const g = new Grid(60, 60, { wrap: false });
  g.spawnCells(PATTERNS.pulsar.cells, 10, 10);
  const rle = g.toRLE();
  const g2 = new Grid(60, 60, { wrap: false });
  g2.loadRLE(rle, 25, 25);
  const shifted = key(g.liveCells().map(([x, y]) => [x + 15, y + 15]));
  assert.strictEqual(key(g2.liveCells()), shifted);
});
t('seeds rule kills isolated cells', () => {
  const g = new Grid(20, 20, { rule: 'B2/S', wrap: false });
  g.set(10, 10, 1);
  g.step();
  assert.strictEqual(g.population, 0);
});
t('toroidal wrap lets gliders cross edges', () => {
  const g = new Grid(20, 20, { wrap: true });
  g.spawnCells(PATTERNS.glider.cells, 17, 17);
  g.run(8); // would clip off a bounded grid; on torus population stays 5
  assert.strictEqual(g.population, 5);
});
t('analyze counts mixed objects', () => {
  const g = new Grid(80, 80, { wrap: false });
  g.spawnCells(PATTERNS.block.cells, 5, 5);
  g.spawnCells(PATTERNS.block.cells, 20, 5);
  g.spawnCells(PATTERNS.blinker.cells, 5, 20);
  g.spawnCells(PATTERNS.beehive.cells, 30, 30);
  const res = analyze(g, 50);
  assert.strictEqual(res.objectCounts.block, 2);
  assert.strictEqual(res.objectCounts.blinker, 1);
  assert.strictEqual(res.objectCounts.beehive, 1);
  assert.strictEqual(res.verdict.type, 'stabilized');
  assert.strictEqual(res.verdict.period, 2);
});
t('highlife replicator rule parses and runs', () => {
  const g = new Grid(40, 40, { rule: 'B36/S23', wrap: false });
  g.spawnCells(PATTERNS.glider.cells, 10, 10);
  g.run(20);
  assert.ok(g.population >= 0);
});
t('spawnCells rotation works', () => {
  const g = new Grid(30, 30, { wrap: false });
  g.spawnCells([[0, 0], [1, 0], [2, 0]], 10, 10, 90, false);
  // 90 deg in screen coords (y down): (1,0)->(0,1), i.e. horizontal becomes vertical downward
  assert.strictEqual(g.get(10, 10), 1);
  assert.strictEqual(g.get(10, 11), 1);
  assert.strictEqual(g.get(10, 12), 1);
  assert.strictEqual(g.get(11, 10), 0);
});

console.log('\nAll ' + passed + ' engine tests passed.');
