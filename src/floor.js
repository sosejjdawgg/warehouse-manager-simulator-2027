'use strict';
// ============================================================================
// Shift floor — renders a live ShiftSim with LittleJS and turns taps/drags into
// commands. All the "juice" lives here: stat bubbles, particles, sounds, shake.
// ============================================================================

const wmHex = (h, a = 1)=> new Color().setHex(h).setAlpha(a);
const WM_ZONE_COLORS = Object.fromEntries(ZONE_KEYS.map(z => [z, wmHex(ZONE_DEFS[z].hex)]));
const WM_PKG_COLORS = Object.fromEntries(Object.keys(PACKAGE_TYPES).map(k => [k, wmHex(PACKAGE_TYPES[k].color)]));
const WM_SKIN = ['#f1c27d','#e0ac69','#c68642','#8d5524','#ffdbac','#a0662f'].map(h => wmHex(h));
const WM_FLOOR = wmHex('#1b2230');
const WM_PANEL = wmHex('#0f141d');

// ---------------------------------------------------------------------------
// Sounds (ZzFX via the plugin's SoundGenerator)
const sfx =
{
    scan:     new SoundGenerator({ frequency:1500, volume:.1, attack:.005, release:.04, randomness:.02 }),
    ship:     new SoundGenerator({ frequency:170, volume:.22, release:.09, noise:.6, bitCrush:.2 }),
    whoosh:   new SoundGenerator({ frequency:420, volume:.06, attack:.03, release:.12, slide:-2, noise:2 }),
    perfect:  new SoundGenerator({ frequency:880, volume:.22, release:.25, pitchJump:440, pitchJumpTime:.06 }),
    flowUp:   new SoundGenerator({ frequency:523, volume:.28, release:.4, pitchJump:262, pitchJumpTime:.05, repeatTime:.1 }),
    flowDown: new SoundGenerator({ frequency:330, volume:.18, release:.3, slide:-.6 }),
    warn:     new SoundGenerator({ frequency:330, volume:.3, release:.45, repeatTime:.12, pitchJump:-110, pitchJumpTime:.06, shapeCurve:0 }),
    ominous:  new SoundGenerator({ frequency:65, volume:.4, attack:.05, release:.9, slide:-.05 }),
    crash:    new SoundGenerator({ frequency:90, volume:.6, release:.6, noise:8, bitCrush:.6, shape:4 }),
    glass:    new SoundGenerator({ frequency:1900, volume:.25, release:.3, noise:4, slide:-4 }),
    saved:    new SoundGenerator({ frequency:660, volume:.25, release:.2, pitchJump:330, pitchJumpTime:.08 }),
    clank:    new SoundGenerator({ frequency:600, volume:.2, release:.08, noise:1, delay:.03 }),
    repaired: new SoundGenerator({ frequency:392, volume:.25, release:.3, pitchJump:196, pitchJumpTime:.08, repeatTime:.16 }),
    horn:     new SoundGenerator({ frequency:110, volume:.28, attack:.03, release:.4, shapeCurve:0, pitchJump:30, pitchJumpTime:.15 }),
    buzz:     new SoundGenerator({ frequency:120, volume:.22, release:.25, shapeCurve:0, slide:-.2 }),
    fanfare:  new SoundGenerator({ frequency:523, volume:.32, release:.7, pitchJump:262, pitchJumpTime:.12, repeatTime:.24 }),
    pick:     new SoundGenerator({ frequency:660, volume:.14, release:.05 }),
    drop:     new SoundGenerator({ frequency:440, volume:.16, release:.08, slide:.6 }),
    rumble:   new SoundGenerator({ frequency:60, volume:.5, attack:.3, release:.7, noise:3, randomness:.1 }),
    tick:     new SoundGenerator({ frequency:900, volume:.06, release:.02 }),
};
const wmSfxLast = {};
function playSfx(name, vol = 1, pitch = 1, minGap = 0)
{
    if (!wmSettings.sound) return;
    const now = timeReal;
    if (minGap && now - (wmSfxLast[name] || -99) < minGap) return;
    wmSfxLast[name] = now;
    sfx[name].play(undefined, vol, pitch);
}

// one-shot particle burst (continuous effects get a short emit time)
const WM_CONTINUOUS_FX = ['sparkle','heal','sparks','magic','smoke','fire'];
function wmBurst(name, pos, opts = {})
{
    if (WM_CONTINUOUS_FX.includes(name) && opts.emitTime === undefined) opts = { ...opts, emitTime:.35 };
    return particleEffect(name, pos, opts);
}

// world-space text that never shrinks below a readable pixel size
function wmText(text, pos, size, ...rest) { drawText(text, pos, Math.max(size, 10.5 / cameraScale), ...rest); }

// ---------------------------------------------------------------------------
// Floating stat bubbles
class WmBubble
{
    constructor(text, pos, color = '#fff', size = .55, life = 1.3, rise = 1.4)
    {
        this.text = text; this.pos = pos.copy(); this.color = wmHex(color); this.size = size;
        this.life = life; this.t = 0; this.rise = rise;
    }
    update(dt) { this.t += dt; this.pos.y += this.rise * dt * (1 - this.t / this.life); return this.t < this.life; }
    draw()
    {
        const p = this.t / this.life;
        const pop = p < .15 ? .6 + p / .15 * .5 : p < .25 ? 1.1 - (p - .15) : 1;
        const a = p > .7 ? 1 - (p - .7) / .3 : 1;
        wmText(this.text, this.pos, this.size * pop, this.color.withAlpha(a), .12 * this.size, new Color(0,0,0,a*.85));
    }
}

// Parcel flying between zones
class WmFlyer
{
    constructor(from, to, color, dur = .45, arc = 1.2)
    {
        this.from = from.copy(); this.to = to.copy(); this.color = color; this.dur = dur; this.arc = arc; this.t = 0;
    }
    update(dt) { this.t += dt; return this.t < this.dur; }
    draw()
    {
        const p = smoothStep(this.t / this.dur);
        const pos = this.from.lerp(this.to, p).add(vec2(0, Math.sin(p * Math.PI) * this.arc));
        drawRect(pos, vec2(.42), this.color, p * 2);
    }
}

// ---------------------------------------------------------------------------
const shiftView =
{
    sim: null,
    active: false,
    paused: false,
    speed: 1,
    rects: {},
    bounds: null,
    portrait: false,
    bubbles: [],
    flyers: [],
    vis: {},        // worker id -> {pos, hop}
    drag: null,     // {id, start, moved}
    selected: null,
    hoverZone: null,
    shake: 0,
    vignette: 0,
    flash: 0,
    lastToast: 0,
    zoneGlow: {},
    sparks: {},
    rumbleT: 0,
    lastEnergyBucket: {},

    start(sim)
    {
        this.sim = sim;
        this.active = true;
        this.finishing = false;
        this.paused = false;
        this.speed = 1;
        this.bubbles = [];
        this.flyers = [];
        this.vis = {};
        this.drag = null;
        this.selected = null;
        this.vignette = 0;
        this.zoneGlow = {};
        for (const k in this.sparks) this.sparks[k]?.destroy();
        this.sparks = {};
        clearParticles();
        this.layout(true);
        sim.on((type, d)=> this.onEvent(type, d));
        for (const w of sim.workers) this.vis[w.id] = { pos: this.slotPos(w), hop:0, face:1 };
    },
    stop()
    {
        this.active = false;
        for (const k in this.sparks) this.sparks[k]?.destroy();
        this.sparks = {};
        clearParticles();
    },

    // ---------------------------------------------------------------- layout
    // The physical map lives in WH_MAP (shared with the sim). In portrait the
    // whole warehouse is rotated a quarter turn so it fills a phone screen.
    T(p) { return this.portrait ? vec2(p.y, -p.x) : vec2(p.x, p.y); },
    TS(sz) { return this.portrait ? vec2(sz.y, sz.x) : vec2(sz.x, sz.y); },
    TD(d) { return this.T(d); }, // directions rotate the same way
    layout(force = false)
    {
        const portrait = mainCanvasSize.y > mainCanvasSize.x * 1.05;
        if (!force && portrait === this.portrait && this.bounds) return;
        this.portrait = portrait;
        const R = {};
        for (const k in WH_MAP.rects) { const r = WH_MAP.rects[k]; R[k] = { pos:this.T(r.pos), size:this.TS(r.size), top:r.top }; }
        this.rects = R;
        const b = WH_MAP.bounds;
        const c = this.T({ x:(b.minX + b.maxX)/2, y:(b.minY + b.maxY)/2 });
        this.bounds = { center:c, size:this.TS({ x:b.maxX - b.minX, y:b.maxY - b.minY }) };
        this.zoom = 1; this.pan = vec2();
    },

    zoneAt(pos, magnet = 0)
    {
        for (const k of [...ZONE_KEYS, 'bench'])
        {
            const r = this.rects[k];
            if (Math.abs(pos.x - r.pos.x) <= r.size.x/2 + magnet && Math.abs(pos.y - r.pos.y) <= r.size.y/2 + magnet) return k;
        }
        return null;
    },

    // where a worker stands inside the zone they're physically in
    slotPos(w)
    {
        const at = w.at || w.zone;
        const r = this.rects[at];
        if (!r) return vec2();
        if (at === 'bench')
        {
            const mates = this.sim.workers.filter(o => o.at === 'bench' && !o.injured && !this.sim.isWalking(o));
            const i = Math.max(0, mates.indexOf(w)), n = Math.max(1, mates.length);
            const long = r.size.x >= r.size.y;
            const span = (long ? r.size.x : r.size.y) - 3;
            const t = n === 1 ? 0 : i / (n - 1) - .5;
            return long ? vec2(r.pos.x + t * span, r.pos.y - .25) : vec2(r.pos.x, r.pos.y + t * span);
        }
        if (w.zone === 'black' && at !== 'black')
        {
            const i = this.sim.workers.filter(o => o.zone === 'black' && o.at === at).indexOf(w);
            return vec2(r.pos.x + r.size.x/2 - .9 - Math.max(0, i) * .8, r.pos.y + r.size.y/2 - 1.7);
        }
        const mates = this.sim.workers.filter(o => o.zone === at && o.at === at && !o.injured);
        const i = Math.max(0, mates.indexOf(w));
        const cols = 2;
        const cx = r.pos.x + r.size.x * .2 + (i % cols) * 1.45 - .1;
        const cy = r.pos.y + .55 - Math.floor(i / cols) * 1.55;
        return vec2(cx, cy);
    },
    queueSlot(z, i)
    {
        const r = this.rects[z];
        const cols = 6;
        const x0 = r.pos.x - r.size.x/2 + .55;
        const y0 = r.pos.y - r.size.y/2 + .5;
        return vec2(x0 + (i % cols) * .52, y0 + Math.floor(i / cols) * .52);
    },

    // ---------------------------------------------------------------- events -> juice
    bubble(text, pos, color, size, life) { if (this.bubbles.length < 60) this.bubbles.push(new WmBubble(text, pos, color, size, life)); },
    workerPos(w) { return this.vis[w.id]?.pos || this.slotPos(w); },

    onEvent(type, d)
    {
        const fast = this.speed > 2 || this.sim.simulated;
        const R = this.rects;
        switch (type)
        {
            case 'complete':
            {
                const p = this.workerPos(d.w);
                if (!fast) playSfx('scan', 1, 1 + (d.w.id % 5) * .03, .07);
                if (d.smooth && this.sim.stats.combo % 11 === 0 && this.sim.stats.combo > 0)
                {
                    this.bubble('Perfect hand-off!', p.add(vec2(0, 1.3)), '#7dd3fc', .45);
                    playSfx('perfect', .8, 1, .3);
                    wmBurst('sparkle', p.add(vec2(0, .5)), { scale:.6 });
                }
                const v = this.vis[d.w.id]; if (v) v.hop = .25;
                break;
            }
            case 'handoff':
            {
                const from = this.workerPos(d.w);
                const nz = this.sim.zones[d.to];
                const to = this.queueSlot(d.to, Math.min(nz.queue.length - 1, 23));
                if (this.flyers.length < 40) this.flyers.push(new WmFlyer(from, to, WM_PKG_COLORS[d.p.type], .4 / Math.min(2, this.speed)));
                if (!fast) playSfx('whoosh', .7, 1, .12);
                break;
            }
            case 'ship':
            {
                const p = this.workerPos(d.w);
                if (this.flyers.length < 40) this.flyers.push(new WmFlyer(p, R.bay.pos.add(vec2(0, rand(-1.5, 1.5))), WM_PKG_COLORS[d.p.type], .35, .6));
                playSfx('ship', fast ? .4 : .8, 1, .09);
                if (d.p.type === 'rush') this.bubble(this.sim.t > d.p.due ? 'Rush LATE' : 'Rush on time! +$', p.add(vec2(0, 1.2)), this.sim.t > d.p.due ? '#f87171' : '#facc15', .45);
                else if (this.sim.stats.shipped % 5 === 0) this.bubble('+' + (5 * UNITS_PER_PARCEL), R.bay.pos.add(vec2(0, 2.2)), '#86efac', .5, 1);
                const sh = this.sim.stats.shipped;
                if (sh > 0 && sh % 100 === 0)
                {
                    this.bubble(`${sh * UNITS_PER_PARCEL} units shipped!`, R.red.pos.add(vec2(0, 1.5)), '#fde047', .7, 2);
                    particleEffect('confetti', R.red.pos.add(vec2(0, 2)), { scale:1.4 });
                    playSfx('fanfare', .8);
                }
                break;
            }
            case 'restock':
                if (!fast && Math.random() < .3) this.bubble('Restocked', this.workerPos(d.w).add(vec2(0, 1)), '#cbd5e1', .35);
                break;
            case 'caught':
                this.bubble('Error caught! QA', this.workerPos(d.w).add(vec2(0, 1.2)), '#a7f3d0', .45);
                playSfx('saved', .6, 1.2, .2);
                break;
            case 'damage':
                this.bubble('Damaged!', this.workerPos(d.w).add(vec2(0, 1.2)), '#fb7185', .45);
                playSfx('glass', .5, 1, .2);
                break;
            case 'defect':
                if (Math.random() < .5) this.bubble('Mis-pick shipped', R.bay.pos.add(vec2(0, -1.5)), '#fca5a5', .35);
                break;
            case 'rushLate':
                break;
            case 'bottleneck':
            {
                const r = R[d.z];
                this.bubble('BOTTLENECK!', r.pos.add(vec2(0, r.size.y/2 - .9)), '#f97316', .6, 1.5);
                this.zoneGlow[d.z] = { t:1.2, c:'#f97316' };
                playSfx('buzz', .7, 1, .4);
                break;
            }
            case 'flowUp':
            {
                const c = this.bounds.center;
                this.bubble(`FLOW x${(1 + (d.level - 1) * .25).toFixed(2)}`, c.add(vec2(0, 2)), '#38bdf8', .9, 1.8);
                particleEffect('confetti', c.add(vec2(0, 3)), { scale: 1 + d.level * .3 });
                playSfx('flowUp', .8, 1 + d.level * .06);
                hudToast(`🌊 Flow level ${d.level}!`, '#38bdf8');
                break;
            }
            case 'flowDown':
                playSfx('flowDown', .5, 1, .8);
                break;
            case 'incident':
            {
                const p = this.workerPos(d.w);
                const def = INCIDENT_DEFS[d.inc.type];
                this.bubble(def.warn, p.add(vec2(0, 2)), '#fde047', .4, 2.2);
                playSfx('warn', .9);
                if (d.inc.type === 'strike') { playSfx('horn', 1, 1.6); addScreenShake(.15, .3); this.vignette = Math.max(this.vignette, .5); }
                playSfx('ominous', .6);
                if (!this.sim.assistantOn) hudToast(d.inc.type === 'strike' ? `🚜 ${d.w.s.name} is in the forklift lane — TAP to stop the forklift!` : `⚠️ ${def.label} — ${ZONE_DEFS[d.inc.zone].name}! Tap the warning!`, d.inc.type === 'strike' ? '#ef4444' : '#facc15');
                break;
            }
            case 'avoided':
            {
                const p = d.w ? this.workerPos(d.w) : R[d.inc.zone].pos;
                this.bubble('Near Miss Avoided', p.add(vec2(0, 1.6)), '#4ade80', .5, 1.6);
                this.bubble('Safety Risk -8', p.add(vec2(0, 1)), '#86efac', .38, 1.4);
                wmBurst('heal', p.add(vec2(0, .6)), { scale:.8 });
                playSfx('saved', .9);
                break;
            }
            case 'nearMiss':
            {
                const p = this.workerPos(d.w);
                this.bubble('Near miss… lucky', p.add(vec2(0, 1.5)), '#fde68a', .45, 1.5);
                playSfx('glass', .4, .8);
                break;
            }
            case 'injury':
            {
                const p = this.workerPos(d.w);
                const inj = d.inj;
                this.bubble(inj.serious ? 'SERIOUS INCIDENT' : 'Injury', p.add(vec2(0, 1.8)), '#ef4444', inj.serious ? .8 : .6, 2.5);
                this.bubble(`${d.w.s.name.split(' ')[0]}: ${inj.label}`, p.add(vec2(0, 1)), '#fecaca', .4, 2.5);
                this.bubble('Morale -5', p.add(vec2(0, .3)), '#fca5a5', .35, 2);
                particleEffect(inj.serious ? 'debris' : 'hit', p.add(vec2(0, .5)), { scale: inj.serious ? 1.4 : .9 });
                addScreenShake(inj.serious ? .5 : .25, inj.serious ? .7 : .35);
                this.vignette = inj.serious ? 1.6 : .9;
                playSfx('crash', inj.serious ? 1 : .6);
                playSfx('glass', .8);
                playSfx('ominous', 1);
                hudToast(`🚑 ${d.w.s.name} injured (${inj.label})`, '#ef4444');
                if (this.selected === d.w.id) this.select(null);
                break;
            }
            case 'breakdown':
            {
                const r = R[d.z];
                this.bubble(`${d.def.icon} ${d.def.label}!`, r.pos.add(vec2(0, 1)), '#fb923c', .5, 2);
                this.sparks[d.z]?.destroy();
                this.sparks[d.z] = particleEffect('sparks', r.pos.add(vec2(r.size.x/2 - 1.2, r.size.y/2 - 1)), { scale:.5 });
                playSfx('clank', .9); playSfx('buzz', .6);
                hudToast(`${d.def.icon} ${d.def.label} in ${ZONE_DEFS[d.z].name}` + (this.sim.crewCount('black') ? ' — maintenance dispatched' : ' — tap it to call a contractor'), '#fb923c');
                break;
            }
            case 'repaired':
            {
                const r = R[d.z];
                this.sparks[d.z]?.destroy(); delete this.sparks[d.z];
                this.bubble('Fixed!', r.pos.add(vec2(0, 1)), '#a3e635', .55);
                wmBurst('sparkle', r.pos.add(vec2(0, 1)), { scale:1 });
                playSfx('repaired', .8);
                break;
            }
            case 'contractor':
                this.bubble(`Contractor called -${wmMoney(d.cost)}`, R[d.z].pos.add(vec2(0, .3)), '#fdba74', .4, 1.6);
                playSfx('pick');
                break;
            case 'truck':
                this.bubble(`🚛 +${d.n} parcels`, R.dock.pos.add(vec2(this.portrait ? 0 : 1.2, this.portrait ? -.2 : 2)), '#93c5fd', .55, 1.8);
                particleEffect('dust', R.dock.pos, { scale:1.2 });
                playSfx('horn', .7);
                break;
            case 'tired':
                this.bubble('Exhausted 😩', this.workerPos(d.w).add(vec2(0, 1.4)), '#fcd34d', .38, 1.6);
                if (!this.sim.assistantOn) hudToast(`😩 ${d.w.s.name} is exhausted — drag them to the Break Room`, '#fcd34d');
                break;
            case 'move':
                break;
            case 'waitCross':
                if (!fast && Math.random() < .35) this.bubble('Waiting for forklift…', this.workerPos(d.w).add(vec2(0, 1.6)), '#fde68a', .32, 1.2);
                break;
            case 'jaywalk':
                this.bubble('JAYWALKING! 🏃', this.workerPos(d.w).add(vec2(0, 1.7)), '#f87171', .5, 1.6);
                playSfx('buzz', .8, 1.4);
                if (!this.sim.assistantOn) hudToast(`🏃 ${d.w.s.name} got impatient and ran across the forklift road!`, '#f87171');
                break;
            case 'brake':
            {
                const lp = WH_MAP.loopPos(d.f.s);
                this.bubble('SCREEECH!', this.T(lp).add(vec2(0, 1)), '#fb923c', .5, 1.2);
                playSfx('horn', .9, 1.3);
                playSfx('glass', .3, .5);
                addScreenShake(.12, .2);
                break;
            }
            case 'breakTime':
                if (!fast && Math.random() < .5) this.bubble('Meal break 🍔', this.workerPos(d.w).add(vec2(0, 1.4)), '#e2e8f0', .32, 1.2);
                break;
            case 'arrive':
            {
                const p = this.workerPos(d.w);
                if (d.w.zone === 'bench') this.bubble('Break ☕', p.add(vec2(0, 1.2)), '#e2e8f0', .35, 1);
                else
                {
                    const r = zoneRating(d.w.s, d.w.zone);
                    this.bubble(`${'★'.repeat(Math.round(starsFor(r)))}`, p.add(vec2(0, 1.2)), r >= 12 ? '#fde047' : r >= 9 ? '#e2e8f0' : '#fca5a5', .38, 1);
                }
                break;
            }
            case 'hour':
            {
                const uph = this.sim.unitsPerHour();
                hudToast(`🕐 ${String(d.hour).padStart(2,'0')}:00 — ${uph} UPH`, '#cbd5e1');
                playSfx('tick', 1);
                break;
            }
            case 'overtime':
                hudToast(`⏱️ Overtime called (+${d.hours}h) — 1.5x wages, tired crew`, '#c084fc');
                playSfx('horn', .5, 1.5);
                break;
            case 'finish':
                playSfx('fanfare', .8, .8);
                break;
        }
    },

    select(id)
    {
        this.selected = id;
        hudWorkerCard(id ? this.sim.worker(id) : null);
    },

    // ---------------------------------------------------------------- update
    update()
    {
        if (!this.active || !this.sim) return;
        this.layout();
        const dtReal = 1/60;

        // camera
        const top = Math.min(110, mainCanvasSize.y * .17), bottom = Math.min(96, mainCanvasSize.y * .15);
        cameraFit(this.bounds.center, this.bounds.size, .4, { top, bottom, left:6, right:6 });
        if (mouseWheel && wmMode === 'shift') this.zoom = clamp(this.zoom * (1 - mouseWheel * .12), 1, 3.2);
        const maxPan = this.bounds.size.scale(.5 * (1 - 1 / this.zoom));
        this.pan = vec2(clamp(this.pan.x, -maxPan.x, maxPan.x), clamp(this.pan.y, -maxPan.y, maxPan.y));
        setCameraScale(cameraScale * this.zoom);
        cameraPos = cameraPos.add(this.pan);

        // input
        this.handleInput();

        // simulate
        if (!this.paused && !this.sim.done)
        {
            const steps = this.speed;
            for (let i = 0; i < steps && !this.sim.done; i++) this.sim.step(dtReal);
        }
        if (this.sim.done && !this.finishing) { this.finishing = true; hudShiftFinished(); }

        // visuals
        const simDt = this.paused ? 0 : dtReal * this.speed;
        for (const w of this.sim.workers)
        {
            const v = this.vis[w.id] || (this.vis[w.id] = { pos:this.slotPos(w), hop:0, face:1 });
            if (this.drag && this.drag.id === w.id && this.drag.moved) continue;
            const walking = this.sim.isWalking(w) && w.pos;
            const target = w.injured ? this.rects.bay.pos.add(vec2(0, -8)) : walking ? this.T(w.pos).add(vec2(0, .3)) : this.slotPos(w);
            const k = walking ? .35 : .2;
            const before = v.pos.x;
            v.pos = v.pos.lerp(target, Math.min(1, k * (this.paused ? 1 : Math.max(1, this.speed * .7))));
            if (Math.abs(v.pos.x - before) > .01) v.face = v.pos.x > before ? 1 : -1;
            v.hop = Math.max(0, v.hop - dtReal * 2);
        }
        this.bubbles = this.bubbles.filter(b => b.update(dtReal));
        this.flyers = this.flyers.filter(f => f.update(dtReal));
        for (const z in this.zoneGlow) { this.zoneGlow[z].t -= dtReal; if (this.zoneGlow[z].t <= 0) delete this.zoneGlow[z]; }
        this.vignette = Math.max(0, this.vignette - dtReal);

        // ambient soundscape intensifies with pressure
        this.rumbleT -= dtReal;
        if (this.rumbleT <= 0 && !this.paused)
        {
            this.rumbleT = 1.1;
            let qTotal = 0;
            for (const z of ZONE_KEYS) qTotal += this.sim.zones[z].queue.length;
            const pressure = clamp(qTotal / (this.sim.cap * 4), 0, 1);
            playSfx('rumble', .05 + pressure * .35, .9 + pressure * .3);
        }
        hudUpdate();
    },

    handleInput()
    {
        const sim = this.sim;
        const pressed = mouseWasPressed(0) && wmPointerOnCanvas;
        const mp = mousePos;
        if (pressed)
        {
            // 1. incidents (biggest priority, generous hit area)
            for (const inc of sim.incidents)
            {
                if (inc.done) continue;
                const w = sim.worker(inc.workerId);
                if (!w) continue;
                const p = this.workerPos(w).add(vec2(0, 1.6));
                if (mp.distance(p) < 1.5) { sim.intervene(inc.id); return; }
            }
            // 2. breakdown badges
            for (const z of ZONE_KEYS)
            {
                const zone = sim.zones[z];
                if (!zone.broken) continue;
                const r = this.rects[z];
                const p = r.pos.add(vec2(r.size.x/2 - 1.2, r.size.y/2 - 1));
                if (mp.distance(p) < 1.3)
                {
                    if (!zone.contractor && sim.callContractor(z)) {} else this.bubble('Repair in progress…', p, '#fdba74', .4);
                    return;
                }
            }
            // 3. workers
            let hit = null, best = .95;
            for (const w of sim.workers)
            {
                if (w.injured) continue;
                const d = mp.distance(this.workerPos(w).add(vec2(0, .35)));
                if (d < best) { best = d; hit = w; }
            }
            if (hit) { this.drag = { id:hit.id, start:mousePosScreen.copy(), moved:false }; playSfx('pick'); return; }
            // 4. empty floor: drag to pan, tap a zone to toggle rush priority
            this.panDrag = { start:mousePosScreen.copy(), pan:this.pan.copy(), moved:false, world:mp.copy() };
            return;
        }
        if (this.panDrag)
        {
            const pd = this.panDrag;
            if (!pd.moved && mousePosScreen.distance(pd.start) > 10 && this.zoom > 1.01) pd.moved = true;
            if (pd.moved)
            {
                const d = mousePosScreen.subtract(pd.start).scale(1 / cameraScale);
                this.pan = pd.pan.add(vec2(-d.x, d.y));
            }
            if (!mouseIsDown(0))
            {
                this.panDrag = null;
                if (!pd.moved) this.tapFloor(pd.world);
            }
        }
        if (this.drag)
        {
            const v = this.vis[this.drag.id];
            if (!this.drag.moved && mousePosScreen.distance(this.drag.start) > 10) this.drag.moved = true;
            if (this.drag.moved && v)
            {
                v.pos = mp.add(vec2(0, -.3));
                this.hoverZone = this.zoneAt(mp, .6);
            }
            if (!mouseIsDown(0))
            {
                const w = sim.worker(this.drag.id);
                if (this.drag.moved && w)
                {
                    const target = this.zoneAt(mp, .6);
                    if (target && target !== w.zone)
                    {
                        sim.moveWorker(w.id, target);
                        playSfx('drop');
                        const r = target === 'bench' ? null : zoneRating(w.s, target);
                        this.bubble(target === 'bench' ? 'To break room' : `→ ${ZONE_DEFS[target].name}`, mp.add(vec2(0, .8)), target === 'bench' ? '#e2e8f0' : ZONE_DEFS[target].hex, .45);
                        if (r !== null && ZONE_DEFS[target].cert && ZONE_DEFS[target].cert !== 'maintenance' && !w.s.certs.includes(ZONE_DEFS[target].cert))
                            this.bubble(`⚠️ Not ${CERT_DEFS[ZONE_DEFS[target].cert].short} certified: risk up`, mp.add(vec2(0, 1.5)), '#fca5a5', .38, 2);
                        if (this.selected === w.id) hudWorkerCard(w);
                    }
                    else playSfx('tick');
                }
                else if (w) this.select(this.selected === w.id ? null : w.id);
                this.drag = null;
                this.hoverZone = null;
            }
        }
    },

    tapFloor(mp)
    {
        const z = this.zoneAt(mp);
        if (z && z !== 'bench')
        {
            const on = this.sim.toggleRush(z);
            this.bubble(on ? 'Rush orders first ⚡' : 'First-in, first-out', mp, on ? '#facc15' : '#cbd5e1', .45);
            playSfx('tick', 2);
        }
        this.select(null);
    },

    // ---------------------------------------------------------------- render
    render()
    {
        if (!this.active || !this.sim) return;
        const sim = this.sim;
        const R = this.rects;
        const T = timeReal;
        // floor
        drawRect(this.bounds.center, this.bounds.size.add(vec2(2)), WM_FLOOR);
        // roads, walkways and zebra crossings
        this.drawRoads();
        // overhead conveyors bridge the roads (buildings hide the rest)
        this.drawConveyors();
        // dock + bay
        this.drawDock();
        // zones
        for (const z of ZONE_KEYS) this.drawZone(z);
        this.drawBench();
        // parcels in flight
        for (const f of this.flyers) f.draw();
        // forklift traffic
        for (const f of sim.forklifts) this.drawForklift(f);
        // workers (dragged one last)
        const order = sim.workers.filter(w => !w.injured).sort((a, b)=> (this.drag?.id === a.id) - (this.drag?.id === b.id));
        for (const w of order) this.drawWorker(w);
        // incident warnings on top
        for (const inc of sim.incidents) if (!inc.done) this.drawIncident(inc);
        // drop target highlight
        if (this.drag?.moved && this.hoverZone)
        {
            const r = R[this.hoverZone];
            const pulse = .5 + .5 * Math.sin(T * 10);
            drawRect(r.pos, r.size.add(vec2(.3)), new Color(1, 1, 1, .12 + pulse * .1));
            const w = sim.worker(this.drag.id);
            if (w && this.hoverZone !== 'bench')
            {
                const rt = zoneRating(w.s, this.hoverZone);
                wmText(`${'★'.repeat(Math.round(starsFor(rt)))}${'☆'.repeat(5 - Math.round(starsFor(rt)))}  fit`, r.pos.add(vec2(0, -r.size.y/2 + .6)), .5, rt >= 12 ? wmHex('#fde047') : WHITE, .08, BLACK);
            }
        }
    },

    renderPost()
    {
        if (!this.active || !this.sim) return;
        for (const b of this.bubbles) b.draw();
        // red vignette on serious incidents
        if (this.vignette > 0)
        {
            const a = Math.min(.45, this.vignette * .3);
            const s = mainCanvasSize;
            const ctx = mainContext;
            const g = ctx.createRadialGradient(s.x/2, s.y/2, Math.min(s.x, s.y) * .25, s.x/2, s.y/2, Math.max(s.x, s.y) * .7);
            g.addColorStop(0, 'rgba(220,30,30,0)');
            g.addColorStop(1, `rgba(220,30,30,${a})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s.x, s.y);
        }
        if (this.paused && !this.sim.done)
            drawTextScreen('PAUSED', mainCanvasSize.scale(.5), Math.min(80, mainCanvasSize.x * .12), new Color(1,1,1,.85), 6, BLACK);
    },

    drawDock()
    {
        const R = this.rects, sim = this.sim;
        const d = R.dock;
        drawRect(d.pos, d.size, wmHex('#111827'));
        const long = d.size.y >= d.size.x;
        for (let i = -2; i <= 2; i++)
            long ? drawRect(d.pos.add(vec2(0, i * 1.1)), vec2(d.size.x, .07), wmHex('#fbbf24', .35))
                 : drawRect(d.pos.add(vec2(i * 1.1, 0)), vec2(.07, d.size.y), wmHex('#fbbf24', .35));
        wmText('DOCK', d.pos.add(long ? vec2(0, d.size.y/2 - .35) : vec2(-d.size.x/2 + .8, 0)), .38, wmHex('#93c5fd'));
        const n = sim.dock;
        wmText(`🚛 ${n}`, d.pos.add(long ? vec2(0, .9) : vec2(1.2, 0)), .5, n > 40 ? wmHex('#f87171') : n > 15 ? wmHex('#fbbf24') : WHITE, .08, BLACK);
        for (let i = 0; i < Math.min(n, 12); i++)
        {
            const p = long ? d.pos.add(vec2(-.35 + (i % 2) * .7, -.3 - Math.floor(i / 2) * .45)) : d.pos.add(vec2(-1.6 + Math.floor(i / 2) * .45, -.35 + (i % 2) * .7));
            drawRect(p, vec2(.38), wmHex('#c8a165', .9));
        }
        const b = R.bay;
        drawRect(b.pos, b.size, wmHex('#111827'));
        const blong = b.size.y >= b.size.x;
        wmText('BAY', b.pos.add(blong ? vec2(0, b.size.y/2 - .35) : vec2(-b.size.x/2 + .7, 0)), .36, wmHex('#fca5a5'));
        wmText('🚚', b.pos, .9);
        wmText(`${sim.stats.shipped * UNITS_PER_PARCEL}`, b.pos.add(blong ? vec2(0, -1.1) : vec2(1.4, 0)), .4, wmHex('#86efac'), .06, BLACK);
    },

    drawRoads()
    {
        const T = this.sim.t;
        const asphalt = wmHex('#262a31'), edge = wmHex('#facc15', .85), dash = new Color(1, 1, 1, .35);
        const rect = (pos, size, color)=> drawRect(this.T(pos), this.TS(size), color);
        // walkways (green, hatched edges)
        for (const wk of WH_MAP.walkways)
        {
            rect(wk.pos, wk.size, wmHex('#14532d', .55));
            const horiz = wk.size.x > wk.size.y;
            for (const sgn of [-1, 1])
                horiz ? rect({ x:wk.pos.x, y:wk.pos.y + sgn * (wk.size.y/2 - .04) }, { x:wk.size.x, y:.06 }, wmHex('#4ade80', .5))
                      : rect({ x:wk.pos.x + sgn * (wk.size.x/2 - .04), y:wk.pos.y }, { x:.06, y:wk.size.y }, wmHex('#4ade80', .5));
        }
        // roads
        for (const r of WH_MAP.roads)
        {
            rect(r.pos, r.size, asphalt);
            const RW = WH_MAP.RW;
            if (r.horiz)
            {
                for (const sgn of [-1, 1]) rect({ x:r.pos.x, y:r.pos.y + sgn * (RW/2 - .07) }, { x:r.size.x, y:.09 }, edge);
                for (let x = r.pos.x - r.size.x/2 + .6; x < r.pos.x + r.size.x/2; x += 1.6) rect({ x, y:r.pos.y }, { x:.7, y:.07 }, dash);
            }
            else
            {
                for (const sgn of [-1, 1]) rect({ x:r.pos.x + sgn * (RW/2 - .07), y:r.pos.y }, { x:.09, y:r.size.y }, edge);
                for (let y = r.pos.y - r.size.y/2 + .6; y < r.pos.y + r.size.y/2; y += 1.6) rect({ x:r.pos.x, y }, { x:.07, y:.7 }, dash);
            }
            // one-way arrows drifting with the traffic
            const len = r.horiz ? r.size.x : r.size.y;
            const off = (T * 1.5) % 6;
            for (let t = -len/2 + 1.5 + off; t < len/2 - 1; t += 6)
            {
                const c = { x:r.pos.x + r.dir.x * t, y:r.pos.y + r.dir.y * t };
                const d = r.dir, n = { x:-d.y, y:d.x };
                const pts = [{ x:c.x + d.x * .45, y:c.y + d.y * .45 }, { x:c.x - d.x * .3 + n.x * .38, y:c.y - d.y * .3 + n.y * .38 }, { x:c.x - d.x * .3 - n.x * .38, y:c.y - d.y * .3 - n.y * .38 }]
                    .map(p => this.T(p));
                drawPoly(pts, new Color(1, 1, 1, .12));
            }
            wmText(r.horiz ? 'FORKLIFTS ONLY' : '', this.T({ x:r.pos.x + (r.key === 'main' ? -4.6 : 4.6), y:r.pos.y }), .3, new Color(1, .85, .2, .35), 0, BLACK, 'center', undefined, undefined, undefined, this.portrait ? -Math.PI/2 : 0);
        }
        // zebra crossings
        WH_MAP.crosswalks.forEach((cw, i)=>
        {
            const users = this.sim.cwUsers[i];
            const waiting = this.sim.workers.some(w => w.state === 'waitCross' && w.path && w.path[w.pathI]?.cw === cw);
            const pulse = .5 + .5 * Math.sin(timeReal * 8);
            const c = users ? wmHex('#fde047', .9) : waiting ? new Color(1, 1, 1, .55 + .35 * pulse) : new Color(1, 1, 1, .7);
            for (let k = -2; k <= 2; k++) rect({ x:cw.x, y:cw.y + k * .42 }, { x:1.3, y:.22 }, c);
            // stop lines for forklifts
            rect({ x:cw.x + (cw.road === 'main' ? -1.05 : 1.05), y:cw.y }, { x:.1, y:WH_MAP.RW - .2 }, wmHex('#ef4444', .7));
        });
    },

    drawForklift(f)
    {
        const lp = WH_MAP.loopPos(f.s);
        const pos = this.T(lp);
        const h = this.T({ x:lp.dx, y:lp.dy });
        const n = vec2(-h.y, h.x);
        const ang = Math.atan2(-h.y, h.x);
        const o = (a, b)=> pos.add(h.scale(a)).add(n.scale(b));
        const T = timeReal;
        // blue pedestrian-warning spot projected ahead
        drawCircleGradient(o(2.3, 0), 1.7, new Color(.2, .5, 1, f.speed > .3 ? .45 : .2), new Color(.2, .5, 1, 0));
        drawEllipse(o(0, -.05), vec2(1.9, 1.3), new Color(0, 0, 0, .35), ang);
        drawRect(o(-.15, 0), vec2(1.35, 1.0), wmHex('#f59e0b'), ang);          // body
        drawRect(o(-.78, 0), vec2(.22, .98), wmHex('#374151'), ang);           // counterweight
        drawRect(o(-.3, 0), vec2(.62, .72), wmHex('#1f2937'), ang);            // cab
        drawRect(o(.58, 0), vec2(.14, .92), wmHex('#111827'), ang);            // mast
        drawRect(o(1.0, .26), vec2(.78, .1), wmHex('#9ca3af'), ang);           // forks
        drawRect(o(1.0, -.26), vec2(.78, .1), wmHex('#9ca3af'), ang);
        if (f.load) { drawRect(o(1.02, 0), vec2(.7, .8), WM_PKG_COLORS[f.load] || WM_PKG_COLORS.standard, ang); drawRect(o(1.02, 0), vec2(.7, .08), new Color(0,0,0,.25), ang); }
        const brake = f.braking || f.stopT > 0 || f.hold;
        for (const sgn of [-1, 1]) drawRect(o(-.88, sgn * .36), vec2(.08, .18), brake ? wmHex('#ff2d2d') : wmHex('#7f1d1d'), ang);
        const blink = Math.sin(T * 9 + f.id) > 0;
        drawCircle(o(-.3, 0), .3, blink ? wmHex('#fb923c') : wmHex('#9a3412'));
        if (f.hold)
        {
            const w = this.sim.worker(f.hold.workerId);
            if (w) drawLine(pos, this.workerPos(w), .12, new Color(1, .15, .1, .5 + .5 * Math.sin(T * 14)));
            wmText('‼️', o(0, 0).add(vec2(0, 1)), .7);
        }
    },

    drawConveyors()
    {
        const R = this.rects, T = this.sim.t;
        const link = (a, b, color, w = .3)=>
        {
            const pa = R[a].pos, pb = R[b].pos;
            const dir = pb.subtract(pa), len = dir.length(), n = dir.normalize();
            // only the exposed overhead span between the two buildings is visible
            drawLine(pa, pb, w + .12, new Color(0, 0, 0, .35));
            drawLine(pa, pb, w, color);
            const step = 1.2, off = (T * 2) % step;
            for (let d = off; d < len; d += step) drawRect(pa.add(n.scale(d)), vec2(.14), new Color(1, 1, 1, .3), Math.atan2(n.x, n.y));
        };
        const belt = wmHex('#475569', .85);
        for (let i = 0; i < FLOW_STANDARD.length - 1; i++) link(FLOW_STANDARD[i], FLOW_STANDARD[i+1], belt);
        link('blue', 'purple', wmHex('#6d28d9', .8), .2);
        link('purple', 'orange', wmHex('#6d28d9', .8), .2);
        link('dock', 'blue', belt);
        link('red', 'bay', belt);
    },

    drawZone(z)
    {
        const sim = this.sim, zone = sim.zones[z], r = this.rects[z], def = ZONE_DEFS[z];
        const col = WM_ZONE_COLORS[z];
        const T = timeReal;
        const crew = sim.zoneWorkers(z);
        const busy = crew.filter(w => w.state === 'work' || w.state === 'repair').length;
        const flowing = busy > 0 && zone.queue.length < sim.cap * .6 && !zone.broken;
        // glow when flowing well
        if (flowing && sim.stats.flow >= 2)
        {
            const g = .08 + .05 * sim.stats.flow + .04 * Math.sin(T * 4 + z.length);
            drawRect(r.pos, r.size.add(vec2(.5)), col.withAlpha(g));
        }
        const glow = this.zoneGlow[z];
        if (glow) drawRect(r.pos, r.size.add(vec2(.6)), wmHex(glow.c, .35 * glow.t));
        // body
        drawRect(r.pos, r.size, col.withAlpha(.9));
        drawRect(r.pos, r.size.subtract(vec2(.22)), WM_PANEL);
        drawRect(r.pos.add(vec2(0, -.1)), r.size.subtract(vec2(.3, 1.1)), col.withAlpha(.07));
        // header
        const hy = r.pos.y + r.size.y/2 - .45;
        drawRect(vec2(r.pos.x, hy), vec2(r.size.x - .22, .7), col.withAlpha(.35));
        wmText(`${def.icon} ${def.name.toUpperCase()}`, vec2(r.pos.x - r.size.x/2 + .3, hy), .42, WHITE, .05, BLACK, 'left', undefined, undefined, r.size.x - 2.2);
        const q = zone.queue.length;
        const qc = q >= sim.cap ? '#f87171' : q > sim.cap * .6 ? '#fbbf24' : '#e2e8f0';
        wmText(`${q}/${sim.cap}`, vec2(r.pos.x + r.size.x/2 - .3, hy), .38, wmHex(qc), .05, BLACK, 'right');
        if (!zone.rushFirst && z !== 'black') wmText('FIFO', vec2(r.pos.x + r.size.x/2 - 1.9, hy), .3, wmHex('#94a3b8'));
        // queue stack
        const shown = Math.min(q, 24);
        for (let i = 0; i < shown; i++)
        {
            const p = zone.queue[i];
            const pos = this.queueSlot(z, i);
            const c = WM_PKG_COLORS[p.type];
            drawRect(pos, vec2(.44), c);
            drawRect(pos.add(vec2(0, .08)), vec2(.44, .06), new Color(0,0,0,.25));
            if (p.type === 'rush') drawRect(pos, vec2(.56), new Color(1, .85, .1, .25 + .2 * Math.sin(T * 8 + i)));
        }
        if (q > 24) wmText(`+${q - 24}`, this.queueSlot(z, 23).add(vec2(.6, 0)), .32, WHITE);
        // overflow warning
        if (q >= sim.cap) wmText('FULL', r.pos.add(vec2(-r.size.x/2 + 1.7, -r.size.y/2 + .5 + 2.3)), .45, wmHex('#f87171', .6 + .4 * Math.sin(T * 9)), .06, BLACK);
        // breakdown badge
        if (zone.broken)
        {
            const b = zone.broken;
            const p = r.pos.add(vec2(r.size.x/2 - 1.2, r.size.y/2 - 1));
            const pulse = .5 + .5 * Math.sin(T * 7);
            drawCircle(p, 1.6 + pulse * .2, wmHex('#f97316', .25 + pulse * .2));
            wmText(b.def.icon, p, .7);
            const pr = clamp(b.progress / b.work, 0, 1);
            drawRect(p.add(vec2(0, -.85)), vec2(1.4, .18), new Color(0,0,0,.6));
            drawRect(p.add(vec2(-.7 + pr * .7, -.85)), vec2(1.4 * pr, .18), wmHex('#a3e635'));
            if (!zone.contractor && !sim.crewCount('black')) wmText('tap: contractor', p.add(vec2(0, -1.2)), .26, wmHex('#fdba74'));
        }
        // empty zone hint
        if (!crew.length && z !== 'black' && q > 0) wmText('NO CREW', r.pos.add(vec2(1.4, 0)), .5, wmHex('#f87171', .6 + .4 * Math.sin(T * 6)), .06, BLACK);
        if (z === 'black' && !crew.length) wmText('no maintenance cover', r.pos.add(vec2(0, -.3)), .32, wmHex('#94a3b8'));
    },

    drawBench()
    {
        const r = this.rects.bench;
        drawRect(r.pos, r.size, wmHex('#475569'));
        drawRect(r.pos, r.size.subtract(vec2(.2)), wmHex('#1e293b'));
        if (r.size.x >= r.size.y) wmText(`☕ BREAK ROOM  (lvl ${this.sim.fac.breakroom})  — drag staff here to rest · scheduled meal breaks cross the forklift roads`, vec2(r.pos.x - r.size.x/2 + .3, r.pos.y + r.size.y/2 - .35), .34, wmHex('#cbd5e1'), 0, BLACK, 'left');
        else wmText('☕ BREAK ROOM', r.pos.add(vec2(0, r.size.y/2 - .4)), .34, wmHex('#cbd5e1'), 0, BLACK);
    },

    drawWorker(w)
    {
        const v = this.vis[w.id]; if (!v) return;
        const T = timeReal;
        const s = w.s;
        const dragging = this.drag?.id === w.id && this.drag.moved;
        let p = v.pos.copy();
        const working = w.state === 'work' || w.state === 'repair';
        const tired = w.energy < 25;
        if (working && !this.paused) p.y += Math.abs(Math.sin(w.anim * (8 + (s.attrs.workRate - 10) * .3))) * .08;
        if (w.jay) drawCircle(p.add(vec2(0, .2)), 1.3, new Color(1, .1, .1, .25 + .2 * Math.sin(T * 16)));
        if (v.hop) p.y += Math.sin(v.hop / .25 * Math.PI) * .25;
        if (w.state === 'walk') p.y += Math.abs(Math.sin(T * (w.jay ? 22 : 14))) * .12;
        const scaleY = tired ? .88 : 1;
        const zc = w.zone === 'bench' ? wmHex('#64748b') : WM_ZONE_COLORS[w.zone];
        const sel = this.selected === w.id;
        if (sel || dragging) drawCircle(p.add(vec2(0, .35)), 1.5, new Color(1, 1, 1, .18 + .08 * Math.sin(T * 8)));
        // shadow
        drawEllipse(p.add(vec2(0, -.42)), vec2(.8, .25), new Color(0,0,0,.35));
        // body + hi-vis
        drawRect(p.add(vec2(0, -.05 * scaleY)), vec2(.62, .66 * scaleY), zc);
        drawRect(p.add(vec2(0, -.02)), vec2(.62, .1), wmHex('#fde047', .9));
        // head
        const headY = .48 * scaleY - (tired ? .08 : 0);
        drawCircle(p.add(vec2(tired ? .06 * v.face : 0, headY)), .46, WM_SKIN[s.id % WM_SKIN.length]);
        // hard hat
        drawEllipse(p.add(vec2(0, headY + .14)), vec2(.5, .22), w.zone === 'black' ? wmHex('#f8fafc') : wmHex('#facc15'));
        // carried parcel
        if (w.pkg)
        {
            drawRect(p.add(vec2(.36 * v.face, -.02)), vec2(.36), WM_PKG_COLORS[w.pkg.type]);
            if (w.state === 'work')
            {
                const pr = clamp(w.progress, 0, 1);
                drawRect(p.add(vec2(0, -.62)), vec2(.8, .1), new Color(0,0,0,.6));
                drawRect(p.add(vec2(-.4 + pr * .4, -.62)), vec2(.8 * pr, .1), wmHex('#7dd3fc'));
            }
        }
        // energy bar
        const e = clamp(w.energy / 100, 0, 1);
        drawRect(p.add(vec2(0, -.76)), vec2(.8, .09), new Color(0,0,0,.6));
        drawRect(p.add(vec2(-.4 + e * .4, -.76)), vec2(.8 * e, .09), e > .5 ? wmHex('#4ade80') : e > .25 ? wmHex('#facc15') : wmHex('#ef4444'));
        // name + state icon
        wmText(s.name.split(' ')[0], p.add(vec2(0, -1.02)), .3, WHITE, .05, BLACK);
        let icon = '';
        if (w.state === 'waitCross')
        {
            const pt = clamp(w.crossWait / this.sim.patienceOf(w), 0, 1);
            drawRect(p.add(vec2(0, 1.25)), vec2(.9, .12), new Color(0,0,0,.6));
            drawRect(p.add(vec2(-.45 + pt * .45, 1.25)), vec2(.9 * pt, .12), pt < .6 ? wmHex('#facc15') : wmHex('#ef4444'));
            icon = pt >= 1 ? '😤' : '⏳';
        }
        else if (w.jay) icon = '🏃';
        else if (this.sim.isWalking(w) && w.selfBreak) icon = '🍔';
        else if (w.state === 'blocked') icon = '⛔';
        else if (w.state === 'repair') icon = '🔧';
        else if (w.zone === 'bench') icon = '☕';
        else if (tired) icon = '😩';
        else if (w.state === 'idle' && w.zone !== 'black') icon = '…';
        if (icon) wmText(icon, p.add(vec2(.45, .85)), .34);
    },

    drawIncident(inc)
    {
        const w = this.sim.worker(inc.workerId);
        if (!w) return;
        const T = timeReal;
        const p = this.workerPos(w).add(vec2(0, 1.6));
        const left = clamp(1 - (this.sim.t - inc.t0) / inc.window, 0, 1);
        const pulse = .5 + .5 * Math.sin(T * 12);
        drawCircle(p, 2.2 + pulse * .3, new Color(1, .2, .1, .18 + pulse * .15));
        drawCircle(p, 1.35, wmHex('#facc15'), .1, BLACK);
        // countdown ring
        const segs = 28, rad = .82;
        for (let i = 0; i < segs * left; i++)
        {
            const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
            drawLine(p.add(vec2(Math.sin(a0) * rad, Math.cos(a0) * rad)), p.add(vec2(Math.sin(a1) * rad, Math.cos(a1) * rad)), .14, left < .35 ? wmHex('#dc2626') : wmHex('#111827'));
        }
        wmText(INCIDENT_DEFS[inc.type].icon, p, .62);
        wmText('TAP!', p.add(vec2(0, -1.05)), .36, wmHex('#fef08a', .7 + .3 * pulse), .06, BLACK);
    },
};
