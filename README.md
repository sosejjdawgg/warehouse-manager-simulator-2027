# Warehouse Manager

A deep logistics management sim with a real-time shift that mashes up Mini Metro and Diner Dash. You run a warehouse against rival companies: Football Manager-style staff, contracts, training, recruitment, facilities, finances and head-office pressure. On top of that is a hands-on shift where you lay out the floor, draw routes that get every colour-coded box through the right teams to the right door, direct your crew and stop accidents before they happen. All of it uses UK warehouse language.

Bright, chunky, toy-like visuals (Canvas2D in a world transform: rounded outlined shapes, chibi workers with moods, toy forklifts). Built on the [LittleJS](https://github.com/KilledByAPixel/LittleJS) engine (vendored in `dist/`). No build step needed to play.

## Play

Open `index.html` in a browser. It also works offline from `file://`. To test on a phone, serve the folder (`python3 -m http.server`) and open it on your local network.

Single-file build: `npm install && npm run build` → `build/index.html` (one self-contained file) and `warehouseManager.zip`.

## The shift: waves of goods (Mini Metro × Diner Dash, with Football Manager underneath)

Boxes come in at **Goods In** and have to visit the right teams before they go out of the right door. Every box is **colour-coded to a client**, and each client has a job ticket. Parkway DIY is just *Booking-in → Despatch*. Harbour & Co is *Booking-in → Pack → Despatch*. Bigger sites add QC, Putaway, Pick and the DG cage.

**Set-up (once a shift).**
- Drag your team **zones** anywhere on the floor. They're fixed once the doors open.
- Seat specialists in zones, and put a licensed driver on each **forklift**. Everyone else is a general **operative**.
- 🪄 *Suggest* lays out a starting point.

**Routes (Mini Metro).**
- Draw **one route per client**: from Goods In, through the zones its goods need in order, to that client's door. Chevrons show the flow.
- Skip a zone, or get the order wrong, and boxes go out unprocessed. That's a **mis-send**: a chargeback and a star hit.
- Where two routes cross, walkers and forklifts meet. Forklifts brake, or you get a ⚠️ warning to tap.
- Routes can be redrawn at any time.

**Waves (tower defence).**
- Trailers back on in **waves** (4–6, depending on the site) until **despatch cut-off**. Between waves the floor keeps ticking over with vans.
- A preview shows the next wave's mix and heavy pallets. *Bring it on* brings the next wave forward for a cash bonus.
- Inbound hauliers want tipping and going. Keep them waiting and they kick off and charge **demurrage**.

**The work.**
- Specialists stay in their zone all shift, and their speed comes from their ratings, mood and energy.
- Operatives walk the routes carrying light boxes. **Forklifts** are fast and carry heavy 🪵 pallets, but they're dangerous.
- Staff nobody has directed run on **autopilot** (grey dot). They wander between routes, slack off and skive.
  - A good team leader on shift makes autopilot less bad.
  - Drag people onto a route to get them grafting.

**Pile-ups.**
- Boxes stack into **pyramids** at every station. Past 10 they **wobble**: tap to restack.
- Ignore it and it **topples**. Boxes scatter across the floor and block routes, some get damaged, and anyone nearby can be hurt.
- Tap a spill to send the nearest operative to clear it.

**Moods (Diner Dash).**
- **Staff:** *Buzzing → Grafting → Cheesed off → Fuming → Walked out*.
  - Specialists get cheesed off when their zone is rammed and nothing is moving.
  - Pay, morale and the staff room set their baseline.
  - ☕ A **brew round** lifts everyone (with a cooldown). 📞 **Agency** temps cost £90 each and aren't much good.
- **Trailer drivers:** *Sound → Checking the clock → Leaning on the horn → Kicking off*.
  - Fill an outbound trailer before its timer runs out for a **full load**. Otherwise it leaves short.

**Events.**
- Forklift breakdowns: tap to call the engineer, or pay a contractor.
- DG leaks.
- HSE spot checks: you're fined if there are boxes on the floor.
- Sickies, late trailers, a broken tea urn and fire alarms.

**Clock-off.**
- At cut-off every trailer leaves. Whatever's left is your call: **overtime** (an hour at time-and-a-half, with late collections) or **carry it over** to tomorrow.
- Well-paid crews grumble and graft. Underpaid ones refuse, or get fuming.

**Stars and money.** The live ★ rating comes from OTIF (on time, in full), mis-sends, damage, topples, injuries and walk-outs. Revenue is per unit despatched. Costs:
- wages
- utilities
- agency
- overtime
- demurrage
- short loads
- damages
- fines

**Site sizes.**

| Tier | Site | Clients | Docks | Zones | Forklifts | Rota | Waves |
|---|---|---|---|---|---|---|---|
| 1 | Regional Depot | 2 | 1 | Booking-in, Pack, Despatch | 1 | 6 | 4 |
| 2 | Sort Centre | 3 | 2 | + QC | 2 | 10 | 4 |
| 3+ | Fulfilment Centre and up | 5–6 | 2–4 | + Putaway, Pick, DG cage, then doubles | 3–6 | 16–27 | 5–6 |

**⏩ Let the assistant run it** plays the same shift with your assistant in charge. How good they are depends on their reliability and how risky your crew is.
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
- **End-of-shift grade**: sunset flyover with trucks rolling out, a stamped S–F grade, the Grafter of the Shift card, and a verdict from **Big Barry**, the tannoy announcer. A fatal shift gets a candle and a darker scene.
- **Big Barry** has opinions on peak weeks, ropey crews, your homegrown kids and head office.
- **Crew voices**: workers bark in speech bubbles ("On it!", "Forklift schmorklift!", "I need a brew…"), flavoured by their traits (Speed Demons, Lazy, Professional, Mentors, homegrown kids…).
- **Award, new-chapter and P45 cutscenes**: fireworks over your warehouse when you're crowned Depot of the Year or step up to a bigger site, a drive-in to your new site with your followers, and a rainy walk-out with a box of belongings.
- **Coach Gus** pops up with one-time tips during your first year.
- **Final-hour tension**: the clock throbs and the ambient rumble rises.

## Danger

Accidents are brutal. Teetering box stacks crush people, forklifts send jaywalkers flying, and serious incidents can be **fatal**. A fatality freezes the floor, removes the worker for good, and brings a £20k–50k fine. The crew is devastated, head office loses faith, your reputation takes a hit, and their name goes on the **Memorial wall**. A **DAYS WITHOUT AN ACCIDENT** board sits on the shift HUD and the hub header. It flips back to 00 the moment someone gets hurt.

## Your career: excel, move up, or go it alone

- **Manager profile** (Career tab): reputation, a personal wallet (weekly salary plus bonuses for stepping up and Depot of the Year), an awards cabinet and your career history.
- **Job offers**: a strong reputation brings offers at the end of each year from bigger companies (6 warehouse tiers, up to a *Global Mega-Port*). Accept one and you pick which loyal or homegrown staff **follow you**. If you're handed your P45, a head-hunter may still find you a lower-tier job.
- **Found your own warehouse**: save £60,000 and you can start your own company with your name and colours, plus your followers. No head office can sack you, but the bank will foreclose if you go too far into the red. Profits pay you dividends.

## Apprentice scheme

- **Create recruits** (Apprentices tab): choose a first name, surname, nickname, age, archetype (Speedster, Safety Guardian, Powerhouse, Brainbox, Future Team Leader) and their whole look (skin, hair, style, hard hat, glasses, beard, headphones…).
- Homegrown staff develop **35% faster**, have hidden potential that grows with your Training Centre, follow you between jobs, and earn reputation as they hit 3★, 4★ and 5★. Legends enter the **Hall of Fame**.
- **Homegrown Bond**: when half the floor came through your apprentice scheme, you get +4% speed and −10% accident risk.
- You can **customise** any staff member (look and nickname). Nicknames appear above their heads on the floor.

## Story & choices

Cutscenes with characters and branching choices change the game: cash, morale, head-office confidence, reputation, wages, facilities and temporary modifiers to speed, risk, volume and revenue. Examples include the outgoing manager's handover, a head-office promise you must keep, a surprise safety inspection (come clean, cover up, or invest), a union drive that can turn into a strike, a big-client peak contract, rival press taunts, a viral jaywalking video, the MD's useless nephew, a cover-up scandal coming back to haunt you, peak pep talks, contract-win parties, the banker who suggests going solo, and a tragedy scene after a fatality.

## Management (between shifts)

- **Staff**: 10 attributes on a 1–20 scale (Productivity, Accuracy, Safety Awareness, Stamina, Strength, Teamwork, Leadership, Adaptability, Work Rate, Concentration). Each worker also has hidden potential, consistency and injury-proneness, personality traits (Professional, Lazy, Accident-Prone, Mentor, Clumsy, Disruptive…), certifications, morale, condition and track-record ratings. Praise or criticise staff, renew contracts, or release them.
- **Training**: weekly focus per worker, plus certification courses (Forklift, Hazmat, Maintenance, Multi-Zone, First Aid…). Mentors speed up youngsters.
- **Recruitment**: people looking for work, trainees, and rival 3PLs' staff. Unvetted attributes show as ranges. Rivals charge poaching fees and try to poach your best people.
- **Facilities**: scanners, conveyors, break room, safety systems, training centre, racking, and robots.
- **Network rankings**: 8 warehouses scored weekly on Volume, Safety, Cost per Unit and Customer Satisfaction. The top 2 step up to a bigger site. Top spot is *Depot of the Year*. Peak weeks 7–8 bring +30% volume.
- **Head office**: confidence moves weekly with volume, safety, profit, morale and rankings position. If it runs out, you're handed your P45.

## Code layout

| File | Role |
|---|---|
| `src/data.js` | All content as data: zones, traits, certs, incidents, facilities, tiers, rivals |
| `src/warehouseMap.js` | Physical floor map: buildings, forklift roads, walkways, zebra crossings, walking graph |
| `src/legacy.js` | Manager career, job offers, own company, apprentice scheme, fatalities, story modifiers |
| `src/pixel.js` | Pixel portraits, sprites, banded lettering, bitmap font |
| `src/pxscenes.js` | Pixel cutscene engine and scenes, story backdrops |
| `src/select.js` | Title screen, manager select, About & legal |
| `src/spectacle.js` | Callouts, Big Barry, worker barks, grades, coach tips, parallax cutscenes |
| `src/story.js` | Cutscene engine, cast, scenes and choices, SVG chibi portraits |
| `src/uiLegacy.js` | Apprentice creator, customiser, career screen, offers, safety board |
| `src/model.js` | Career rules: staff generation, rota, contracts, training, recruitment, rankings, head office, save/load |
| `src/wave.js` | `WaveSim`, the shift: sites, clients and job tickets, waves, routes, operatives and forklifts, pyramids and topples, moods, events, overtime, the assistant |
| `src/waveview.js` | The shift floor: set-up drag and drop, route drawing, directing crew, taps, HUD, cut-off and help |
| `src/shiftSim.js` | `ShiftSim`, the legacy map-based engine (kept for reference) |
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
