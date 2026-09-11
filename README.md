# Apex Kart Club — Apex Tour

A single-player 3D kart racing game: **you against seven bots**, racing three laps on one of four original circuits or competing in a three-race championship. The current game runs entirely in the browser. It does not need a lobby, an account, or a running backend.

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

## Adventure expansion: wheels, wings and water

Choose **Comet Kart**, **Vector Bike**, **Dune Buggy** or **Atlas Truck** in the paddock. Each has different acceleration, steering, grip and collision mass. Bikes turn and accelerate faster; buggies lose less speed on rough terrain; trucks resist bumps. All four can transform into planes. The course footprints are now 50% larger, with the same three-lap race format and championship scoring.

Every course has a marked **WINGS OUT** zone. Enter it on the road to deploy wings, pilot through the aerial corridor, then descend into the landing zone to return to wheels. **A/D or arrows steer, W accelerates, S slows, Q climbs and F dives.** Flight has altitude assistance and bounded climb/dive adjustment; it is arcade corridor flight, not unrestricted free flight. Gold rings mark required aerial checkpoints. Leaving the corridor triggers recovery. Bots use the same flight physics. Touch controls include CLIMB and DIVE.

| Course | New adventure sections | Active hazards |
| --- | --- | --- |
| Sunset Sands | Twin Tide cave with left/right lanes around a central rock spine, palm ruins, Seabird Canyon flight, tidal-inlet hovercraft transformation | Timed surf crossings and cave rocks |
| Cloudburst Causeway | Storm Cloud Run flight and Crystal Mountain tunnel | Timed crosswind hazards |
| Neon Night Market | Rooftop Express flight and After Hours Arcade tunnel | Crossing delivery vehicles |
| Stormwater Foundry | Turbine Airway flight and Furnace Hall tunnel | Steam vents |

Yellow floor rings warn before hazards turn active/red. The danger occupies a lane, leaving room to steer around it. Shields, a hop, or armored Rocket Rush can help. The same hazard clock is shared by all racers. Bots avoid active hazards and choose cave lanes; if a bot stops earning checkpoints, it recovers to its last earned gate.

The inlet deploys hovercraft floats automatically and removes the shallow-water speed penalty along its marked water surface. Other scenery is decorative; this is a stylized procedural world, not a destructible environment.

New adventure records use `apex.<course>.records.adventure-v2` and corresponding ghost keys. Old `v1` records and ghosts remain in browser storage, but are not mixed with the longer layouts. Records show the vehicle used; ghosts record plane/hover transformations. There is still one fastest ghost per course.

## Track selection and championship

Choose a course card to see its layout preview, length, layout difficulty, and full 3D scene. The course difficulty indicator describes the road; Cruise / Sport / Expert separately controls opponent pace.

| Course | Character | Layout difficulty |
| --- | --- | --- |
| Cloudburst Causeway | Elevated harbor, observatory shortcut, crystal canyon | Balanced · 2/5 |
| Neon Night Market | Tight street bends, food stalls, neon storefronts, lantern arches, rain | Technical · 4/5 |
| Stormwater Foundry | Wider industrial roads, turbine landmark, spillway structures, jump | Fast · 3/5 |
| Sunset Sands | Open drivable beach, dunes, boardwalk and marked checkpoint route | Open beach · 2/5 |

**Single race** runs the selected course. **Three-race championship** always runs Cloudburst → Neon → Foundry with the same eight racers and chosen AI difficulty. Finishing places earn **15, 12, 10, 8, 6, 4, 2, 1** points; DNFs score zero. The round settles when everyone finishes or 40 seconds after the player finishes. The results screen shows cumulative standings and unlocks the next race. After Foundry it announces the champion. Ties use wins, then last-round placing, then racer ID for deterministic ordering.

Championship progress lasts for the current session; returning to the paddock or reloading abandons the cup. Completed individual race records remain saved. A course cannot be scored twice, and rounds must be completed in order.

Each layout owns its centerline, road width, item rows, boost/jump zones, racing-line anchors, corner-speed tuning, and overtaking lane spread. Neon keeps bots tighter through the market turns; Foundry allows a faster pace. The old Cloudburst shortcut and jump positions do not leak into other maps.

**Records and ghosts are separate per course.** The My records dialog has four course tabs. The ghost toggle refers to the selected track; adventure saves are versioned separately from pre-expansion races.

## Sunset Sands — open beach race

Select **Sunset Sands** in **Single race** mode. The existing Apex Tour still contains its original three courses. Sunset Sands has its own records tab and personal-best ghost.

The sand is a continuous terrain surface with dunes, a low boardwalk, palm groves, surf shacks, umbrellas and animated shore foam. You can drive far outside the flagged racing corridor without being pulled back or losing support. Shallow water slows unboosted karts; deep water triggers the timed checkpoint-safe rescue. Golden pads boost or launch a hop.

Three laps still require all sixteen gates in sequence, crossed forward inside their marked width. Roaming or cutting to a later stretch does not grant checkpoints. The HUD and minimap identify the next required gate so you can rejoin correctly. Seven bots follow beach-specific racing lines and collect the shared item boxes. Cave rocks and timed hazards affect racing; the rest of the scenery is decorative. Sand and water determine the driving surface.

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
| Triple Turbo | Three separately activated 1.5-second boosts; each use spends one charge |
| Comet rocket | Homes toward the closest racer ahead; flies forward if no target exists; lasts up to six seconds |
| Bubble shield | Blocks one attack or trap, or expires after six seconds |
| Jelly slick | Drops a trap behind the kart; lasts up to eighteen seconds or until hit |
| Rocket Rush | Five seconds of armored autopilot; HUD warns before returning control |
| Shockwave | Hits opponents within 16 meters and clears projectiles within 20 meters |
| Pickup Magnet | Eight seconds of extended pickup range and acceleration when following a nearby racer |
| Glider Burst | Protected hop on land; boost and altitude gain during flight |
| Decoy Crate | Pink fake item box dropped behind the vehicle; hits opponents like a trap |

Hits cause a short spin and speed loss, then brief immunity so a racer cannot be continuously stun-locked. Shields block a hit. Bots use the same item functions and inventory restrictions as the player.

Golden arrow pads grant a boost. Marked flight corridors deploy wings; Glider Burst launches a hop elsewhere. Braking still works during a boost. Drift boosts, item turbos, and boost pads increase the kart's speed cap from 40 m/s (144 km/h) to 55 m/s (198 km/h).

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

Leaving the road removes support: the kart preserves its horizontal momentum, falls under gravity, and has limited air steering. It can land on a road only by crossing a supported surface from above; nearby roads at other elevations do not pull it up or down. Reaching island level, falling 14 meters, or remaining airborne for 2.5 seconds triggers a 1.4-second rescue arc to the last earned checkpoint, with a protective bubble during rescue and two seconds of attack immunity afterward. Race time keeps running, and rescues cannot grant checkpoint credit. Plane sections score their marked aerial gates. There is no invisible force pulling racers toward the road.

The chase camera follows elevation and holds higher during falls so it does not dive underground. The alternative overview camera and minimap show the course and racer locations. The frame loop uses a monotonic clock, clamps elapsed frame time, and advances gameplay at a fixed 60 Hz. Hidden tabs suspend gameplay; returning resumes it. Audio, WebGL resources, physics bodies, observers, and input listeners are cleaned up when appropriate.

## Handling

Steering input ramps in smoothly, with faster recentering and direction changes. Above 72 km/h, normal steering sensitivity gradually reduces by up to 22% at boost speed; drifting retains more turning authority. Boost thrust builds progressively, adds a little lateral grip outside a drift, and stops pushing when you release the accelerator or brake. Excess speed decays after a boost instead of instantly dropping to the normal speed cap.

When leaving the road, steering authority eases toward limited air control over roughly 0.3 seconds. Momentum and gravity remain active, and holding the brake provides modest horizontal air braking. Landing eases steering authority back toward ground handling. Keyboard, touch input, and bots all use the same handling rules.

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

For each course, the best ten completed race times are saved in `localStorage`, with name, difficulty, finish position, lap times, and date. A complete trajectory of the fastest race on that course is saved as a translucent personal-best ghost. Finish a race to unlock the ghost toggle, then race it from the starting grid. Ghosts do not collide or use items.

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
│   ├── tests/                        # Gameplay, handling, beach and championship simulations
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                  # Single-player setup, pause, results, records and sound controls
│       ├── styles.css
│       ├── components/
│       │   ├── GameCanvas.tsx        # Renderer, fixed-step loop, animation and audio integration
│       │   ├── TrackSelect.tsx       # Course cards, previews, difficulty indicators
│       │   └── HUD.tsx               # Place, laps, inventory, minimap, speed and drift UI
│       ├── hooks/
│       │   ├── useKartControls.ts    # Keyboard/touch input; item and pause commands
│       │   └── useMultiplayer.ts     # Retained legacy online hook; unused by the current game
│       └── game/
│           ├── adventure.ts          # Vehicles, flight corridors and timed hazard definitions
│           ├── adventureScene.ts     # Cave shells, flight rings, skyline and active hazard visuals
│           ├── course.ts             # Four course definitions and per-course track projection
│           ├── beach.ts              # Shared sand height and deep-water boundary
│           ├── beachScene.ts         # Beach terrain, flags, boardwalk and seaside scenery
│           ├── championship.ts       # Round points, order protection and cup tie-breaks
│           ├── race.ts               # Bots, kart physics, item combat, checkpoints and placing
│           ├── raceScene.ts          # Course scenery, road, landmarks and item meshes
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

`npm test` runs the local gameplay tests and the existing backend suite. The gameplay tests cover course closure/elevation, shortcut length, actual item effects, shield consumption, stun behavior, recovery, checkpoint protection, item respawn, unsupported edge falls, height-aware support, descending landings, ballistic jumps, timed checkpoint-safe rescues, and deterministic complete races on all four layouts with all eight racers using steering, combat and collisions. Beach tests verify off-route sand support, shallow water, deep-water rescue, and forward-only checkpoint crossings, including jumps. Handling tests verify steering ramp/recentering, high-speed correction sensitivity, boost ramp/coasting/expiration, and airborne steering, momentum, gravity, and braking. Tour tests also verify championship scoring, duplicate-round protection, tie-breaks, course-isolated records/ghosts, and legacy Cloudburst saves. Tests need no browser or external services; the backend integration tests open temporary localhost ports.

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

### Expansion verification

The adventure suite covers climb/dive and steering, item charges and effects, hover mode, hazard warnings, and complete races for every vehicle on all four courses. The earlier `finish.test.ts` diagnostic cases remain marked TODO because changes to lap-completion behavior were explicitly deferred. Ground lap-counting and championship settlement rules are unchanged by this expansion.
