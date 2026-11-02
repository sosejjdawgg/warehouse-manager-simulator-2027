# Warehouse Manager

A deep logistics management sim with a real-time shift you play like Dinner Dash. You run a warehouse against rival companies: Football Manager-style staff, contracts, training, transfers, facilities, finances and board pressure, plus a hands-on shift where you move workers between coloured zones and stop accidents before they happen.

Built on the [LittleJS](https://github.com/KilledByAPixel/LittleJS) engine (vendored in `dist/`). No build step needed to play.

## Play

Open `index.html` in a browser. It also works offline from `file://`. To test on a phone, serve the folder (`python3 -m http.server`) and open it on your local network.

Single-file build: `npm install && npm run build` → `build/index.html` (one self-contained file) and `warehouseManager.zip`.

## The shift (the "match")

8 hours compressed into 8 minutes at 1x (2x and 4x available). Parcels flow **Dock → Inbound → Stow → Pick → Pack → Outbound → Bay**.

| Zone | Colour | Notes |
|---|---|---|
| Inbound / Receiving | 🔵 Blue | Trucks dock in waves. Watch the queue |
| Stow / Storage | 🟢 Green | Forklift-certified staff are safer |
| Pick | 🟡 Yellow | Productivity & accuracy |
| Pack | 🟠 Orange | Errors here ship to customers unless QA catches them |
| Outbound / Load | 🔴 Red | Strength & safety, forklift cert |
| Hazmat | 🟣 Purple | Hazmat parcels detour here. Uncertified = 2.5× risk |
| Quality / Returns | ⚪ Grey | Catches mis-picks, processes returns |
| Maintenance | ⚫ Black | Auto-dispatched to breakdowns |
| Break Room | ☕ | Drag tired staff here to recover energy |

**The floor map.** The zones are buildings around a one-way forklift loop. Inbound, Stow, Pick and Pack sit north of the main forklift road. Hazmat, Quality, Maintenance and Outbound sit south of it. The Break Room is across a second forklift road. Doors open onto green walkways, corridors run between the buildings, and overhead conveyors carry parcels over the roads.

- **Forklifts** (4 + one per warehouse tier, plus extras when trucks dock) circulate constantly. They stop to load, queue behind each other, and get faster on *Push*.
- Staff **walk** between zones and to the break room, and **wait at zebra crossings** until the road is clear. Every worker also takes a staggered **meal break** mid-shift, so the roads are always busy.
- **Patience** comes from Safety Awareness, Concentration, traits (Steady/Professional are patient; Speed Demon, Accident-Prone and Ambitious are not), line speed and Safety Systems. When it runs out, staff **jaywalk**. Usually the forklift slams on its brakes. If they misjudge the gap, a **forklift collision** warning appears with a very short timer: tap it to emergency-stop the forklift.
- Moving staff now costs real time (walk plus crossing waits), so plan your rotations.

**Controls**
- **Drag** a worker to another zone. Stars show how well they fit it, and you get a warning if they lack a required certification.
- **Tap a worker** to see their card, send them on a break, or move them back to their best zone.
- **Tap a ⚠️ warning** before its countdown runs out to prevent the accident. If you ignore it, it may be a near miss, a minor injury, or a serious incident with a fine.
- **Tap a breakdown** to call a paid contractor when there's no maintenance cover.
- **Tap a zone** to toggle rush-first or first-in-first-out ordering.
- **Line speed**: Careful / Normal / Push trades throughput against risk and fatigue.
- **Overtime** adds up to +2h at 1.5× wages and tires the crew.
- **🤖 Auto** hands the floor to your assistant manager. **⏩ Finish** simulates the rest of the shift.
- **Pinch / mouse wheel** zooms the map. Drag empty floor to pan when zoomed.
- Keyboard: `Space` pauses, `1` `2` `4` set the speed.

Smooth hand-offs build a **Flow multiplier** (up to ×2.0) for faster work and bonus revenue. Bottlenecks break it.

**Simulate** runs the same model with your assistant in charge. If your crew is weak, tired or demoralised, the assistant advises against it: they catch fewer warnings than you and accident rates rise.

## Management (between shifts)

- **Staff**: 10 attributes on a 1–20 scale (Productivity, Accuracy, Safety Awareness, Stamina, Strength, Teamwork, Leadership, Adaptability, Work Rate, Concentration). Each worker also has hidden potential, consistency and injury-proneness, personality traits (Professional, Lazy, Accident-Prone, Mentor, Clumsy, Disruptive…), certifications, morale, condition and form ratings. Praise or criticise staff, renew contracts, or release them.
- **Training**: weekly focus per worker, plus certification courses (Forklift, Hazmat, Maintenance, Multi-Zone, First Aid…). Mentors speed up youngsters.
- **Transfers**: free agents, trainees, and rival companies' staff. Unscouted attributes show as ranges. Rivals charge fees and try to poach your best people.
- **Facilities**: scanners, conveyors, break room, safety systems, training centre, racking, and robots.
- **League**: 8 warehouses scored weekly on Volume, Safety, Cost per Unit and Customer Satisfaction. The top 2 are promoted to a bigger site (4 tiers). Peak weeks 7–8 bring +30% volume.
- **Board**: confidence moves weekly with volume, safety, profit, morale and league position. If it runs out, you're sacked.

## Code layout

| File | Role |
|---|---|
| `src/data.js` | All content as data: zones, traits, certs, incidents, facilities, tiers, rivals |
| `src/warehouseMap.js` | Physical floor map: buildings, forklift roads, walkways, zebra crossings, walking graph |
| `src/model.js` | Career rules: staff generation, lineup, contracts, training, transfers, league, board, save/load |
| `src/shiftSim.js` | `ShiftSim`, the shift engine, shared by live play and full simulation, plus the assistant AI |
| `src/floor.js` | LittleJS rendering of the floor, drag-to-assign input, stat bubbles, particles, ZzFX sounds |
| `src/ui.js` | HTML management screens, HUD, post-shift report, cinematics |
| `game.js` | LittleJS entry point |

The shift model has no dependency on rendering, so it can be balance-tested headlessly in Node.

## Claude Code plugin

`.claude/settings.json` registers the [LittleJS-AI](https://github.com/KilledByAPixel/LittleJS-AI) marketplace and enables the `littlejs@littlejs-ai` plugin. Claude Code sessions in this repo will offer to install it. You can also install it by hand:

```
/plugin marketplace add KilledByAPixel/LittleJS-AI
/plugin install littlejs@littlejs-ai
```

All companies and people in the game are fictional.
