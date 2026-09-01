# AUTOMATA - a WebMCP co-creation playground

A cellular automata playground where a **human and an AI agent build, run, and study
Game-of-Life universes together**. The human draws and stamps patterns on an interactive
canvas; the agent drives the same universe through [WebMCP](https://developer.chrome.com/docs/ai/webmcp)
tools: spawning patterns, inventing new ones from RLE, switching rules, fast-forwarding
thousands of generations, and reporting back what emerged.

Built for the [WebMCP Challenge](https://webmcp.devpost.com/).

## Why this is better with an agent

Cellular automata are a perfect fit for human + agent collaboration:

- **The human sketches curiosity.** Draw a squiggle, stamp a pulsar, splash some random soup.
- **The agent runs the experiment.** `run_steps` 500 generations in a blink, then `analyze`
  reports what the chaos settled into: "12 blocks, 5 blinkers, a beehive, 3 escaped gliders,
  stable since generation 212."
- **The agent knows the catalog.** It can place a Gosper glider gun at exact coordinates,
  rotate it, mirror it, or invent brand-new patterns with `load_rle`.
- **The agent is a rule sommelier.** `set_rules` flips between Conway, HighLife, Seeds,
  Day & Night, or any custom `B../S..` rulestring, and `analyze` tells you what your
  pattern does under the new physics.
- **Every agent action is visible.** Tool calls light up the canvas and land in the
  on-screen activity feed, so the human always sees what their collaborator did.

The interesting moment: ask your agent "make something cool and tell me what happens."
It will seed soup, fast-forward, classify the wreckage, tweak the rules, and iterate -
while you watch it all happen live on the canvas.

## WebMCP tools

Registered via the WebMCP **Imperative API** (`document.modelContext.registerTool`).

| Tool | What it does |
| --- | --- |
| `list_patterns` | Lists the pattern catalog (glider, LWSS, pulsar, pentadecathlon, Gosper gun, methuselahs, still lifes). Read-only. |
| `spawn_pattern` | Stamps a catalog pattern at optional coordinates, with rotation and mirroring. |
| `load_rle` | Places a custom pattern from RLE text - how the agent invents things. |
| `set_rules` | Switches rule presets or any custom `B../S..` rulestring; toggles toroidal wrap. |
| `set_running` | Starts or pauses the live simulation. |
| `run_steps` | Fast-forwards up to 5000 generations and reports population change. |
| `analyze` | Non-destructive forecast: clones the universe, simulates ahead, detects extinction / stabilization (with period) / ongoing activity, and returns a named census of the objects that emerge. Read-only. |
| `add_noise` | Sprinkles random soup over the grid or a region. |
| `clear` | Resets the universe. |
| `get_state` | Reads generation, population, rule, bounding box, density, and RLE of the live cells. Read-only. |

Tool results are JSON (returned as a JSON string by Chrome's `executeTool`).

## Run it

Any static file server works. This repo includes a tiny dev server that also sets the
cross-origin isolation headers WebMCP prefers:

```sh
python3 serve-dev.py        # http://127.0.0.1:8899
# or: npx serve .  /  python3 -m http.server
```

Open the URL in Chrome.

### Enabling real WebMCP

WebMCP ships behind a flag (Chrome 149+, tested on Chrome 151):

1. Go to `chrome://flags/#enable-webmcp-testing`
2. Set it to **Enabled** and relaunch Chrome.
3. The header pill turns green: `WebMCP: 10 tools live (native)`.

Pair it with the
[Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector)
extension or any WebMCP-aware agent to drive the page with natural language.

Without the flag, the app falls back to a built-in shim with the same
`registerTool` / `getTools` / `executeTool` surface, and the in-page **Agent console**
(sidebar) lets you call every tool by hand - handy for development and demos.

## Tests

The automata engine is pure JS with no DOM dependencies:

```sh
node test/engine.test.js
```

16 tests cover rules parsing, pattern correctness (glider translation, gun period,
diehard extinction at gen 130, R-pentomino stabilization), RLE round-trips, cycle
detection, and object classification.

## Project layout

```
index.html        page shell
styles.css        dark neon UI
src/engine.js     pure CA engine: grid, rules, patterns, RLE, analysis (browser + Node)
src/app.js        canvas rendering, input, simulation loop, activity feed
src/webmcp.js     WebMCP tool registration, fallback shim, agent console
test/engine.test.js
serve-dev.py      static dev server with COOP/COEP headers
```

## Demo video outline (< 3 min)

1. 0:00 - Empty grid. Human draws a squiggle by hand, hits Run.
2. 0:20 - Ask the agent: "add a glider gun and some chaos, run 400 generations, tell me what emerges."
   Tools fire visibly; the feed shows each action; analysis returns a named census.
3. 1:10 - Agent flips the rules to HighLife and re-analyzes the same world under new physics.
4. 1:50 - Human stamps a pulsar into the agent's world; agent weaves gliders around it with `load_rle`.
5. 2:30 - Wrap up: this page is a shared universe - every capability the human has is a tool the agent can call.

## License

MIT - see [LICENSE](LICENSE).
