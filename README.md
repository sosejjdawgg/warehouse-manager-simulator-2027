# Warehouse Manager

A deep logistics management sim with a real-time shift you play like Dinner Dash. You run a warehouse against rival companies: Football Manager-style staff, contracts, training, transfers, facilities, finances and board pressure, plus a hands-on shift where you move workers between coloured zones and stop accidents before they happen.

Bright, chunky, toy-like visuals (Canvas2D in a world transform: rounded outlined shapes, chibi workers with moods, toy forklifts). Built on the [LittleJS](https://github.com/KilledByAPixel/LittleJS) engine (vendored in `dist/`). No build step needed to play.

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

## Pixel art

All the characters and cutscenes are original pixel art, generated in code (`src/pixel.js`) and styled after mid-90s arcade sports games:
- **Portraits**: hand-shaded busts with dithered lighting, hue-shifted colour ramps and crisp outlines. Expressions include smile, grin, roar, grit, sad and neutral, plus a fist-pump pose. They are built from each person's look, so every crew member, rival and cast member has one.
- **Floor sprites**: workers are 16×24 sprites with walk, work and cheer frames, hard hats and hi-vis vests.
- **Cutscenes** (`src/pxscenes.js`): low-res scenes with dithered parallax skies, foliage and skylines, a crowd that claps, cheers or groans, a huge hero bust sliding in, and slammed banded lettering. Scenes include the pre-shift card, the end-of-shift reaction, champions/promotion fireworks, new chapter, and getting fired in the rain.
- **Lettering**: banded metallic letters with a thick outline and a 5×7 bitmap font for captions.
- **Manager select**: pick from six default managers, each with stats and perks, or design your own. **Phil Barton** is the bald, smiling Jack of All Trades.

## Android

`android/` holds a minimal full-screen WebView wrapper (no Gradle needed). `android/build-apk.sh` bundles `build/index.html` into a signed APK using the Android SDK build tools. Saves live in the WebView's local storage, the game works fully offline, and the back button sends the app to the background instead of quitting mid-shift. Keep your signing keystore safe and out of the repo: Android will only accept updates signed with the same key.

## Legal

© 2026 James Scott. All rights reserved. See `LICENSE`, `NOTICE` (third-party MIT licences) and `privacy.html`. The in-game About & legal screen covers the same ground.

## Arcade showbiz (inspired by Neo Turf Masters)

- **Pre-shift flyover**: a layered side-scrolling pan across the city to your warehouse, with a "course card" showing the shift number, target, forecast, crew risk, days safe and conditions. Then *READY? … SHIP IT!*
- **Announcer callouts**: big slammed italic lettering with a shine sweep for the moments that matter. NICE / GREAT / SUPER / MAX FLOW, **TARGET SMASHED!** (with slow-mo and confetti), FINAL HOUR!, NICE SAVE!, EMERGENCY STOP!, MAN DOWN!, JAMMED!, OVERTIME!, SHIFT OVER!
- **End-of-shift grade**: sunset flyover with trucks rolling out, a stamped S–F grade, the Worker of the Shift card, and a verdict from **Big Barry**, the tannoy announcer. A fatal shift gets a candle and a darker scene.
- **Big Barry** has opinions on peak weeks, ropey crews, your homegrown kids and the board.
- **Crew voices**: workers bark in speech bubbles ("On it!", "Forklift schmorklift!", "I need a brew…"), flavoured by their traits (Speed Demons, Lazy, Professional, Mentors, homegrown kids…).
- **Trophy, new-chapter and sacking cutscenes**: fireworks over your warehouse when you're crowned champions or promoted, a drive-in to your new site with your followers, and a rainy walk-out with a box of belongings.
- **Coach Gus** pops up with one-time tips during your first season.
- **Final-hour tension**: the clock throbs and the ambient rumble rises.

## Danger

Accidents are brutal. Teetering box stacks crush people, forklifts send jaywalkers flying, and serious incidents can be **fatal**. A fatality freezes the floor, removes the worker for good, and brings a $20k–50k fine. The crew is devastated, the board loses faith, your reputation takes a hit, and their name goes on the **Memorial wall**. A **DAYS WITHOUT AN ACCIDENT** board sits on the shift HUD and the hub header. It flips back to 00 the moment someone gets hurt.

## Your career: excel, move up, or go it alone

- **Manager profile** (Career tab): reputation, a personal wallet (weekly salary plus bonuses for promotions and titles), a trophy cabinet and your career history.
- **Job offers**: a strong reputation brings offers at the end of each season from bigger companies (6 warehouse tiers, up to a *Global Mega-Port*). Accept one and you pick which loyal or homegrown staff **follow you**. If you get sacked, a head-hunter may still find you a lower-tier job.
- **Found your own warehouse**: save $60,000 and you can start your own company with your name and colours, plus your followers. No board can sack you, but the bank will foreclose if you go too far into the red. Profits pay you dividends.

## Homegrown academy

- **Create recruits** (Academy tab): choose a first name, surname, nickname, age, archetype (Speedster, Safety Guardian, Powerhouse, Brainbox, Future Captain) and their whole look (skin, hair, style, hard hat, glasses, beard, headphones…).
- Homegrown staff develop **35% faster**, have hidden potential that grows with your Training Centre, follow you between jobs, and earn reputation as they hit 3★, 4★ and 5★. Legends enter the **Hall of Fame**.
- **Homegrown Bond**: when half the floor came through your academy, you get +4% speed and −10% accident risk.
- You can **customise** any staff member (look and nickname). Nicknames appear above their heads on the floor.

## Story & choices

Cutscenes with characters and branching choices change the game: cash, morale, board confidence, reputation, wages, facilities and temporary modifiers to speed, risk, volume and revenue. Examples include the outgoing manager's handover, a board promise you must keep, a surprise safety inspection (come clean, cover up, or invest), a union drive that can turn into a strike, a big-client peak contract, rival press taunts, a viral jaywalking video, the Chair's useless nephew, a cover-up scandal coming back to haunt you, peak-season pep talks, promotion parties, the banker who suggests going solo, and a tragedy scene after a fatality.

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
| `src/legacy.js` | Manager career, job offers, own company, homegrown academy, fatalities, story modifiers |
| `src/pixel.js` | Pixel portraits, sprites, banded lettering, bitmap font |
| `src/pxscenes.js` | Pixel cutscene engine and scenes, story backdrops |
| `src/select.js` | Title screen, manager select, About & legal |
| `src/spectacle.js` | Callouts, Big Barry, worker barks, grades, coach tips, parallax cutscenes |
| `src/story.js` | Cutscene engine, cast, scenes and choices, SVG chibi portraits |
| `src/uiLegacy.js` | Academy creator, customiser, career screen, offers, safety board |
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
