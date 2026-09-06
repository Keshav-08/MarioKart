# Apex Kart Club — Cloudburst Cup

A single-player 3D kart racing game: **you against seven bots**, racing three laps of an original, elevated island circuit. The current game runs entirely in the browser. It does not need a lobby, an account, or a running backend.

## Run the game

Requires Node.js 22.12+ and npm.

```bash
cd /Users/keshav/Downloads/MarioKart
npm install
npm run dev:solo
```

Open **http://localhost:5173**. Pick your name, kart color, and difficulty, then click **Let’s cause a little chaos**. The eight-kart grid starts together after a three-second countdown.

To also run the original Express / Socket.IO backend:

```bash
npm run dev
```

Build and serve the production application:

```bash
npm run build
npm start
```

Production runs at **http://localhost:3001**. To inspect the frontend production build separately, use `npm run preview -w client` after building.

## What changed from the original scaffold

The default oval time trial and multiplayer lobby have been replaced with a local Grand Prix. The existing backend remains available for future online features; the new course does **not** send its combat-affected times or trajectories to the old oval-track validator.

### Cloudburst Causeway

The approximately 810-meter closed course is hand-shaped with bends and elevation, rather than an oval. It includes:

- **Sunset Harbor:** village rooftops, a striped lighthouse, palm trees, a start gantry, and an eight-kart grid.
- **Skybridge Summit:** an ascending road, bridge supports, switchbacks, boost pads, and a jump pad.
- **Observatory Bend:** a domed observatory with an orbital ring, a hairpin, and a narrower rough-surface shortcut. Save a turbo or charged drift to cross it quickly.
- **Crystal Canyon:** tall, faceted crystals and tighter turns before the seaside return.
- Animated hot-air balloons, floating item cubes, course signs, curbs, roadside rails, and a live minimap.

All scenery is procedural Three.js geometry. Static scenery is batched by material to reduce draw calls. This is an original course and cast, with no Nintendo assets or characters.

### Seven computer opponents

Mochi, Blaze, Orbit, Clover, Ziggy, Pixel, and Rumble drive with steering and throttle through the same arcade controller and Cannon collision world as the player. They look ahead, slow for bends, shift lanes around traffic, drift, collect and use items, and receive a timed rescue to their last earned checkpoint after falling or getting stuck. Bot difficulty changes their target cornering and straight-line speeds:

| Setting | Internal difficulty | Behavior |
| --- | --- | --- |
| Cruise | easy | Slower target pace for learning the course |
| Sport | normal | Moderate target pace and active combat |
| Expert | hard | Faster target pace with less room for mistakes |

Bots are local simulated racers, not remote players or decorative karts moving along a scripted animation. No rubber-band teleporting advances them through the race. Recovery can lose progress, but never grants a checkpoint.

### Items and combat

Drive through a floating cube to receive one inventory item. Cubes respawn after five seconds, with availability shared by all racers. Racers farther back have a higher chance of receiving a turbo or rocket.

| Item | Effect |
| --- | --- |
| Triple-charge turbo | A three-second boost, including through rough shortcut terrain |
| Comet rocket | Homes toward the closest racer ahead; flies forward if no target exists; lasts up to six seconds |
| Bubble shield | Blocks one attack or trap, or expires after six seconds |
| Jelly slick | Drops a trap behind the kart; lasts up to eighteen seconds or until hit |

Hits cause a short spin and speed loss, then brief immunity so a racer cannot be continuously stun-locked. Shields block a hit. Bots use the same item functions and inventory restrictions as the player.

Golden arrow pads grant a boost; the skybridge pad also launches a gravity-driven hop. Braking still works during a boost. Drift boosts, item turbos, and boost pads increase the kart's speed cap from 40 m/s (144 km/h) to 55 m/s (198 km/h).

### Race rules and results

- Three laps, eight racers, one shared start.
- Sixteen sequential timing gates per lap; the last gate is the finish line.
- Running order is based on earned race progress; finish order is based on actual finish times.
- Completed racers retain their finishing places while remaining bots keep racing.
- The results panel displays your placing, race time, best lap, and all three lap times.
- Forty seconds after the player finishes, any still-unfinished opponents are marked DNF.
- Reset abandons the current race. Pause freezes race time, movement, item timers, and opponents.

### Sound, effects, and camera

Synthesized Web Audio supplies the engine tone, countdown, item pickup, boost, hit, shield, lap, and finish sounds. Audio is unlocked by the race-start click and can be muted. There are no sound downloads. Drift sparks, turbo trails, impact bursts, shield bubbles, rotating item cubes, spinning wheels, hit shake, and speed-sensitive camera FOV communicate race events.

Leaving the road removes support: the kart preserves its horizontal momentum, falls under gravity, and has limited air steering. It can land on a road only by crossing a supported surface from above; nearby roads at other elevations do not pull it up or down. Reaching island level, falling 14 meters, or remaining airborne for 2.5 seconds triggers a 1.4-second rescue arc to the last earned checkpoint, with a protective bubble during rescue and two seconds of attack immunity afterward. Race time keeps running, and airborne/rescuing karts cannot collect checkpoint credit. There is no invisible force pulling racers toward the road.

The chase camera follows elevation and holds higher during falls so it does not dive underground. The alternative overview camera and minimap show the course and racer locations. The frame loop uses a monotonic clock, clamps elapsed frame time, and advances gameplay at a fixed 60 Hz. Hidden tabs suspend gameplay; returning resumes it. Audio, WebGL resources, physics bodies, observers, and input listeners are cleaned up when appropriate.

## Controls

| Input | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake, then reverse |
| A / D or Left / Right | Steer |
| Space + steering | Charge a drift while moving |
| Release Space | Mini-turbo after charging at least 40% |
| E / Shift | Use your held item |
| P / Escape | Pause or resume |
| C | Toggle chase / overview camera |
| R | Abandon race and return to paddock |

Touch devices show steering, throttle, brake, drift, and item buttons. The stage also has sound, pause, and fullscreen buttons. The help dialog pauses an active race; close it and use Resume to continue. Keyboard input in the name field does not drive the kart.

## Personal records and ghosts

The best ten completed race times are saved in `localStorage`, with name, difficulty, finish position, lap times, and date. A complete trajectory of the fastest race is saved as a translucent personal-best ghost. Finish a race to unlock the ghost toggle, then race it from the starting grid. Ghosts do not collide or use items.

Records are local to the browser and origin, persist across server restarts, and disappear if browser storage is cleared. Difficulty is recorded beside each time; the overall fastest ghost may be from another difficulty. Invalid stored JSON is ignored. If browser storage is full or unavailable, the race still completes and a message explains why it was not saved.

## Implementation layout

```text
MarioKart/
├── package.json                     # Workspace scripts; dev:solo, dev, build, test
├── package-lock.json
├── tsconfig.base.json
├── README.md
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts                 # Original backend event/track types and shared formatting
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/favicon.svg
│   ├── tests/race.test.ts            # Deterministic gameplay and full-race simulation tests
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                  # Single-player setup, pause, results, records and sound controls
│       ├── styles.css
│       ├── components/
│       │   ├── GameCanvas.tsx        # Renderer, fixed-step loop, animation and audio integration
│       │   └── HUD.tsx               # Place, laps, inventory, minimap, speed and drift UI
│       ├── hooks/
│       │   ├── useKartControls.ts    # Keyboard/touch input; item and pause commands
│       │   └── useMultiplayer.ts     # Retained legacy online hook; unused by the current game
│       └── game/
│           ├── course.ts             # Closed spline, elevation, shortcut and track projection
│           ├── race.ts               # Bots, kart physics, item combat, checkpoints and placing
│           ├── raceScene.ts          # Cloudburst scenery, road, landmarks and item meshes
│           ├── audio.ts              # Gesture-unlocked procedural audio
│           ├── storage.ts            # Local records and personal-best race ghost
│           └── scene.ts              # Reused kart builder/disposal; retained legacy oval builder
└── server/
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts                  # Production static serving plus retained Express/Socket.IO API
        ├── store.ts
        ├── validation.ts
        ├── validation.test.ts
        ├── integration.test.ts
        └── store.test.ts
```

## Verification

```bash
npm run check
npm test
npm run build
```

`npm test` runs the local gameplay tests and the existing backend suite. The gameplay tests cover course closure/elevation, shortcut length, actual item effects, shield consumption, stun behavior, recovery, checkpoint protection, item respawn, unsupported edge falls, height-aware support, descending landings, ballistic jumps, timed checkpoint-safe rescues, and a deterministic complete race with all eight racers using steering, combat and collisions. Tests need no browser or external services; the backend integration tests open temporary localhost ports.

The frontend stack remains Vite, React, TypeScript, Three.js, Cannon-es and Tailwind CSS. Kart bodies have Cannon horizontal collisions. Grounded elevation follows a height-checked road surface; airborne motion integrates gravity, and jump pads add an upward impulse. Recovery follows a timed rescue arc. This is an arcade road-following physics model, not a wheel-suspension or flight simulator.

## Retained backend

The original server still provides:

- `GET /api/health`
- `POST /api/times` — bearer session token, issued race ID, ordered checkpoint timestamps and optional ghost
- `GET /api/leaderboard?trackId=evergreen-circuit`
- `GET /api/ghosts/:id`
- Socket.IO `room:join`, `race:start`, `race:cancel`, `kart:update`, `room:state`, and `leaderboard:update`

Those endpoints describe the **legacy Evergreen Circuit**, use a bounded in-memory store, and are not used by Cloudburst Cup. Their timing plausibility checks are not authoritative anti-cheat. Keeping them separate prevents new course/combat records from being mixed with the old oval leaderboard.

`npm run dev` starts Vite at 5173 and Express at 3001. Vite proxies `/api` and `/socket.io` to the server. `PORT` and comma-separated `CLIENT_ORIGIN` environment variables configure the retained backend; `.env` files are not loaded automatically. `npm start` serves the built game and API together. `npm run dev:solo` starts only what the current single-player game needs.
