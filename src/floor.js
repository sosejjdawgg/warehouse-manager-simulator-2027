'use strict';
// ============================================================================
// Shift floor — renders a live ShiftSim with LittleJS and turns taps/drags into
// commands. All the "juice" lives here: stat bubbles, particles, sounds, shake.
// ============================================================================

const wmHex = (h, a = 1)=> new Color().setHex(h).setAlpha(a);
const WM_ZONE_COLORS = Object.fromEntries(ZONE_KEYS.map(z => [z, wmHex(ZONE_DEFS[z].hex)]));
const WM_PKG_COLORS = Object.fromEntries(Object.keys(PACKAGE_TYPES).map(k => [k, PACKAGE_TYPES[k].color]));
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
        wmText(this.text, this.pos, this.size * pop, this.color.withAlpha(a), .2 * this.size, new Color(.17, .18, .26, a));
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
    draw(ctx)
    {
        const p = smoothStep(this.t / this.dur);
        const pos = this.from.lerp(this.to, p).add(vec2(0, Math.sin(p * Math.PI) * this.arc));
        NX.box(ctx, pos.x, pos.y, .42, this.color, 0, p * 2);
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
        this.bodies = [];
        this.drops = [];
        this.drama = null;
        this.barks = [];
        this.lastBark = 0;
        this.slowmo = 0;
        this.stepAcc = 0;
        this.targetHit = false;
        this.finalHour = false;
        this.flowAnnounced = 1;
        this.calloutGate = {};
        this.chatterT = 8;
        wmCallouts.queue = []; wmCallouts.cur = null;
        this.iconQueue = [];
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
                    if (Math.random() < .35) this.bark(d.w, 'perfect');
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
                if (!this.targetHit && sh >= this.sim.forecast.target)
                {
                    this.targetHit = true;
                    this.slowmo = 1.4;
                    callout('TARGET SMASHED!', 'rainbow', { sub:`${fmtUnits(sh)} units — and the clock is still running!`, hold:1.6, size:1.05 });
                    playSfx('fanfare', 1, 1.1);
                    for (const z of ['blue', 'yellow', 'red']) particleEffect('confetti', R[z].pos.add(vec2(0, 2)), { scale:2 });
                    for (const w of this.sim.workers) { const v = this.vis[w.id]; if (v) v.hop = .25; }
                    this.lastBark = 0; this.bark(pickOne(this.sim.workers.filter(w => !w.injured)), 'target');
                }
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
                if (this.gate('jam', 25)) callout('JAMMED!', 'blue', { sub:`${ZONE_DEFS[d.z].name} is full — send help!`, size:.8, hold:.8 });
                coachTip('bottleneck');
                this.bark(pickOne(this.sim.zoneWorkers(d.z)) || null, 'jam');
                this.zoneGlow[d.z] = { t:1.2, c:'#f97316' };
                playSfx('buzz', .7, 1, .4);
                break;
            }
            case 'flowUp':
            {
                const c = this.bounds.center;
                particleEffect('confetti', c.add(vec2(0, 3)), { scale: 1 + d.level * .3 });
                if (d.level > this.flowAnnounced)
                {
                    this.flowAnnounced = d.level;
                    const calls = { 2:['NICE FLOW!', 'blue'], 3:['GREAT FLOW!', 'green'], 4:['SUPER FLOW!!', 'gold'], 5:['MAX FLOW!!!', 'rainbow'] };
                    const [txt, st] = calls[d.level] || calls[2];
                    callout(txt, st, { sub:`Speed x${(1 + (d.level - 1) * .04).toFixed(2)} · keep the hand-offs smooth`, size: d.level >= 5 ? 1.1 : .9 });
                }
                else playSfx('flowUp', .5, 1 + d.level * .06);
                break;
            }
            case 'flowDown':
                playSfx('flowDown', .5, 1, .8);
                if (d.level <= 1) this.flowAnnounced = 1;
                break;
            case 'incident':
            {
                const p = this.workerPos(d.w);
                const def = INCIDENT_DEFS[d.inc.type];
                this.bubble(def.warn, p.add(vec2(0, 2)), '#fde047', .4, 2.2);
                playSfx('warn', .9);
                if (d.inc.type === 'strike') { playSfx('horn', 1, 1.6); addScreenShake(.15, .3); this.vignette = Math.max(this.vignette, .5); }
                playSfx('ominous', .6);
                coachTip('incident');
                if (!this.sim.assistantOn) hudToast(d.inc.type === 'strike' ? `🚜 ${d.w.s.name} is in the forklift lane — TAP to stop the forklift!` : `⚠️ ${def.label} — ${ZONE_DEFS[d.inc.zone].name}! Tap the warning!`, d.inc.type === 'strike' ? '#ef4444' : '#facc15');
                break;
            }
            case 'avoided':
            {
                const p = d.w ? this.workerPos(d.w) : R[d.inc.zone].pos;
                this.bubble(d.inc.type === 'falling' ? 'Stack secured!' : d.inc.type === 'strike' ? 'EMERGENCY STOP!' : 'Near Miss Avoided', p.add(vec2(0, 1.6)), '#4ade80', .5, 1.6);
                this.bubble('Safety Risk -8', p.add(vec2(0, 1)), '#86efac', .38, 1.4);
                wmBurst('heal', p.add(vec2(0, .6)), { scale:.8 });
                playSfx('saved', .9);
                if (!this.sim.assistantOn && this.gate('save', 5)) callout(d.inc.type === 'strike' ? 'EMERGENCY STOP!' : pickOne(['NICE SAVE!', 'GREAT CATCH!', 'NOT TODAY!']), 'green', { size:.85, hold:.7 });
                if (d.w) { this.lastBark = 0; this.bark(d.w, 'saved'); }
                break;
            }
            case 'nearMiss':
            {
                const p = this.workerPos(d.w);
                if (d.inc.type === 'falling') this.drops.push({ kind:'box', from:p.add(vec2(.9, 4)), to:p.add(vec2(1, -.1)), t:0, dur:.45, spin:1, hit:false, onLand:()=> { particleEffect('dust', p.add(vec2(1, 0)), { scale:.8 }); playSfx('crash', .5, 1.4); addScreenShake(.12, .2); } });
                this.bubble('Near miss… lucky', p.add(vec2(0, 1.5)), '#fde68a', .45, 1.5);
                this.lastBark = 0; this.bark(d.w, 'nearMiss');
                playSfx('glass', .4, .8);
                break;
            }
            case 'injury':
            {
                const p = this.workerPos(d.w);
                const inj = d.inj;
                this.injuryAnim(d.w, inj, d.inc, p);
                this.bubble(inj.serious ? 'SERIOUS INCIDENT' : 'Injury', p.add(vec2(0, 1.8)), '#ef4444', inj.serious ? .8 : .6, 2.5);
                this.bubble(`${d.w.s.name.split(' ')[0]}: ${inj.label}`, p.add(vec2(0, 1)), '#fecaca', .4, 2.5);
                this.bubble('Morale -5', p.add(vec2(0, .3)), '#fca5a5', .35, 2);
                particleEffect(inj.serious ? 'debris' : 'hit', p.add(vec2(0, .5)), { scale: inj.serious ? 1.4 : .9 });
                addScreenShake(inj.serious ? .5 : .25, inj.serious ? .7 : .35);
                this.vignette = inj.serious ? 1.6 : .9;
                playSfx('crash', inj.serious ? 1 : .6);
                playSfx('glass', .8);
                playSfx('ominous', 1);
                if (!inj.fatal) hudToast(`🚑 ${d.w.s.name} injured (${inj.label})`, '#ef4444');
                if (inj.serious && !inj.fatal) { callout('MAN DOWN!', 'red', { sub:`${d.w.s.name} — ${inj.label}`, hold:1.2 }); this.slowmo = .8; }
                { const mate = this.sim.workers.find(o => o !== d.w && !o.injured && o.zone === d.w.zone); this.lastBark = 0; this.bark(mate, 'injury'); }
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
                coachTip('breakdown');
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
                this.bark(d.w, 'tired'); coachTip('tired');
                if (!this.sim.assistantOn) hudToast(`😩 ${d.w.s.name} is exhausted — drag them to the Break Room`, '#fcd34d');
                break;
            case 'move':
                if (!this.sim.assistantOn) this.bark(d.w, 'moved');
                break;
            case 'waitCross':
                if (!fast && Math.random() < .3) this.bark(d.w, 'wait', true);
                break;
            case 'jaywalk':
                this.bubble('JAYWALKING! 🏃', this.workerPos(d.w).add(vec2(0, 1.7)), '#f87171', .5, 1.6);
                this.lastBark = 0; this.bark(d.w, 'jaywalk'); coachTip('jaywalk');
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
                if (!fast && Math.random() < .4) this.bark(d.w, 'breakTime', true);
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
                playSfx('tick', 1);
                if (d.hour === SHIFT_START_HOUR + 7 && !this.finalHour)
                {
                    this.finalHour = true;
                    const need = Math.max(0, this.sim.forecast.target - this.sim.stats.shipped);
                    callout('FINAL HOUR!', 'gold', { sub: need ? `${fmtUnits(need)} units to target — dig deep!` : 'Target in the bag. Bring it home clean!' });
                    document.body.classList.add('finalHour');
                }
                break;
            }
            case 'overtime':
                callout('OVERTIME!', 'purple', { sub:`+${d.hours}h · 1.5x wages · tired crew`, size:.85 });
                playSfx('horn', .5, 1.5);
                break;
            case 'finish':
                playSfx('fanfare', .8, .8);
                break;
        }
    },

    bark(w, kind, quiet = false)
    {
        if (!w || w.injured) return;
        const now = timeReal;
        if (now - this.lastBark < (quiet ? 2.5 : .9) || this.barks.some(b => b.id === w.id)) return;
        const text = barkLine(kind, w.s);
        if (!text) return;
        this.lastBark = now;
        this.barks.push({ id:w.id, text, t:0, life:2.2 });
        if (!quiet) playSfx('tick', .6, 1.6 + Math.random() * .4);
    },
    gate(key, secs) { const now = timeReal; if (now - (this.calloutGate[key] || -99) < secs) return false; this.calloutGate[key] = now; return true; },

    injuryAnim(w, inj, inc, p)
    {
        const look = w.s.look, vest = ZONE_DEFS[w.zone]?.hex || '#94a3b8';
        const fall = ()=> this.bodies.push({ pos:p.copy(), look, vest, fatal:!!inj.fatal, life:1, side: Math.random() < .5 ? 1 : -1 });
        if (inc?.type === 'falling')
            this.drops.push({ kind:'box', from:p.add(vec2(0, 4.5)), to:p.add(vec2(0, .3)), t:0, dur:.4, spin:.4, hit:true,
                onLand:()=> { fall(); particleEffect('debris', p.add(vec2(0, .4)), { scale:1.3 }); playSfx('crash', 1); addScreenShake(.4, .4); } });
        else if (inc?.type === 'strike' || inc?.type === 'forklift')
        {
            const to = p.add(vec2(rand(-1.6, 1.6), 1.2));
            this.drops.push({ kind:'body', look, vest, from:p.copy(), to, t:0, dur:.55, spin:randSign(),
                onLand:()=> { p.x = to.x; p.y = to.y - 1; fall(); particleEffect('dust', to, { scale:1 }); } });
            playSfx('horn', 1, 1.7); playSfx('crash', 1);
        }
        else fall();
        if (inj.fatal)
        {
            this.drama = { t:0, left:3.4, title:'FATALITY', sub:`${w.s.name} was ${inj.cause}` };
            playSfx('ominous', 1, .6); playSfx('crash', 1, .5);
            addScreenShake(.8, 1);
            hudToast(`🕯️ ${w.s.name} has died.`, '#ef4444');
        }
        hudAccident();
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

        // a fatality freezes the floor for a moment
        if (this.drama) { this.drama.t += dtReal; this.drama.left -= dtReal; if (this.drama.left <= 0) this.drama = null; }
        for (const d of this.drops) { d.t += dtReal; if (d.t >= d.dur && !d.landed) { d.landed = true; d.onLand && d.onLand(); } }
        this.drops = this.drops.filter(d => d.t < d.dur + (d.kind === 'box' && !d.hit ? 1.2 : 0));
        for (const bd of this.bodies) if (!bd.fatal) bd.life -= dtReal / 4;
        this.bodies = this.bodies.filter(bd => bd.fatal || bd.life > 0);
        // simulate
        calloutUpdate(dtReal);
        if (this.slowmo > 0) this.slowmo -= dtReal;
        if (!this.paused && !this.sim.done && !this.drama)
        {
            this.stepAcc += this.speed * (this.slowmo > 0 ? .25 : 1);
            while (this.stepAcc >= 1 && !this.sim.done) { this.stepAcc--; this.sim.step(dtReal); }
            // idle chatter gives the crew a voice
            if ((this.chatterT -= dtReal) <= 0)
            {
                this.chatterT = 7 + Math.random() * 9;
                const ws = this.sim.workers.filter(w => !w.injured && !this.sim.isWalking(w));
                if (ws.length) this.bark(pickOne(ws), 'idle', true);
            }
        }
        this.barks = this.barks.filter(b => (b.t += dtReal) < b.life);
        if (this.sim.done && !this.finishing) { this.finishing = true; callout('SHIFT OVER!', this.targetHit ? 'gold' : 'blue', { sub:`${fmtUnits(this.sim.stats.shipped)} units shipped` }); hudShiftFinished(); }

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
            playSfx('rumble', .05 + pressure * .35 + (this.finalHour ? .12 : 0), .9 + pressure * .3 + (this.finalHour ? .15 : 0));
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
                const p = this.workerPos(w).add(vec2(0, inc.type === 'falling' ? 3.6 : 1.7));
                if (mp.distance(p) < 1.6) { sim.intervene(inc.id); return; }
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
    // Everything is drawn with Canvas2D in a world-space transform so we get
    // chunky rounded shapes, thick outlines and drop shadows.
    render()
    {
        if (!this.active || !this.sim) return;
        const sim = this.sim, R = this.rects, T = timeReal;
        const ctx = NX.world();
        // outdoor ground + building floor with tiles
        const b = this.bounds;
        NX.rr(ctx, b.center.x, b.center.y - .2, b.size.x + 1.6, b.size.y + 1.6, 1.2, '#6c7a96', null, 0);
        NX.rr(ctx, b.center.x, b.center.y, b.size.x + 1.6, b.size.y + 1.6, 1.2, '#f3e9d6', NX.O, .22);
        ctx.strokeStyle = 'rgba(160,130,90,.13)'; ctx.lineWidth = .05;
        ctx.beginPath();
        for (let x = Math.floor(b.center.x - b.size.x/2); x < b.center.x + b.size.x/2; x += 2) { ctx.moveTo(x, b.center.y - b.size.y/2); ctx.lineTo(x, b.center.y + b.size.y/2); }
        for (let y = Math.floor(b.center.y - b.size.y/2); y < b.center.y + b.size.y/2; y += 2) { ctx.moveTo(b.center.x - b.size.x/2, y); ctx.lineTo(b.center.x + b.size.x/2, y); }
        ctx.stroke();
        this.drawRoads(ctx);
        this.drawConveyors(ctx);
        this.drawDock(ctx);
        for (const z of ZONE_KEYS) this.drawZone(ctx, z);
        this.drawBench(ctx);
        // bodies & memorial sheets stay where people fell
        for (const bd of this.bodies) this.drawBody(ctx, bd);
        for (const f of this.flyers) f.draw(ctx);
        for (const f of sim.forklifts) this.drawForklift(ctx, f);
        const order = sim.workers.filter(w => !w.injured).sort((a, c)=> (this.drag?.id === a.id) - (this.drag?.id === c.id) || this.workerPos(c).y - this.workerPos(a).y);
        for (const w of order) this.drawWorker(ctx, w);
        for (const d of this.drops) this.drawDrop(ctx, d);
        for (const b of this.barks)
        {
            const w = sim.worker(b.id); if (!w || w.injured) continue;
            const p = this.workerPos(w), pop = Math.min(1, b.t * 6);
            if (!b.w || b.scale !== cameraScale)
            {
                const px = Math.max(.34, 10.5 / cameraScale) * cameraScale;
                mainContext.save(); mainContext.font = `${px}px ${fontDefault}`; b.w = mainContext.measureText(b.text).width / cameraScale + .55; mainContext.restore();
                b.scale = cameraScale;
            }
            const wdt = b.w, hgt = Math.max(.82, 18 / cameraScale);
            ctx.globalAlpha = b.t > b.life - .3 ? (b.life - b.t) / .3 : 1;
            const bx = p.x + .3, by = p.y + 1.75 + pop * .1;
            ctx.save(); ctx.translate(bx, by); ctx.scale(pop, pop);
            NX.poly(ctx, [{ x:-.5, y:-.35 }, { x:-.75, y:-.75 }, { x:-.05, y:-.35 }], NX.O);
            NX.rr(ctx, 0, 0, wdt + .1, hgt, hgt / 2, NX.O, null, 0);
            NX.rr(ctx, 0, .02, wdt - .06, hgt - .16, (hgt - .16) / 2, '#ffffff', null, 0);
            NX.poly(ctx, [{ x:-.45, y:-.3 }, { x:-.66, y:-.62 }, { x:-.12, y:-.3 }], '#ffffff');
            ctx.restore(); ctx.globalAlpha = 1;
        }
        for (const inc of sim.incidents) if (!inc.done) this.drawIncident(ctx, inc);
        if (this.drag?.moved && this.hoverZone)
        {
            const r = R[this.hoverZone];
            const pulse = .5 + .5 * Math.sin(T * 10);
            NX.rr(ctx, r.pos.x, r.pos.y, r.size.x + .5, r.size.y + .5, .8, `rgba(255,255,255,${.25 + pulse * .2})`, '#fff', .18);
        }
        NX.done(ctx);
        // labels on top (text is drawn unflipped)
        this.drawLabels();
        if (this.drag?.moved && this.hoverZone && this.hoverZone !== 'bench')
        {
            const r = R[this.hoverZone], w = sim.worker(this.drag.id);
            if (w)
            {
                const st = Math.round(starsFor(zoneRating(w.s, this.hoverZone)));
                wmText(`${'★'.repeat(st)}${'☆'.repeat(5 - st)}`, r.pos.add(vec2(0, -r.size.y/2 + .7)), .7, wmHex(st >= 3 ? '#ffd23f' : '#ffffff'), .16, wmHex(NX.O));
            }
        }
    },

    drawLabels()
    {
        const R = this.rects, sim = this.sim, O = wmHex(NX.O);
        for (const z of ZONE_KEYS)
        {
            const r = R[z], def = ZONE_DEFS[z], zone = sim.zones[z];
            const hy = r.pos.y + r.size.y/2 - .5;
            wmText(r.size.x * cameraScale < 170 ? def.icon : `${def.icon} ${def.name.toUpperCase()}`, vec2(r.pos.x - r.size.x/2 + .35, hy), .44, WHITE, .14, O, 'left', undefined, undefined, r.size.x - 2.4);
            const q = zone.queue.length;
            wmText(`${q}/${sim.cap}`, vec2(r.pos.x + r.size.x/2 - .35, hy), .4, q >= sim.cap ? wmHex('#ffe066') : WHITE, .14, O, 'right');
            if (!zone.rushFirst && z !== 'black') wmText('FIFO', vec2(r.pos.x + r.size.x/2 - 1.9, hy), .3, wmHex('#e2e8f0'), .1, O);
            if (q >= sim.cap) wmText('FULL!', r.pos.add(vec2(-r.size.x/2 + 1.75, -r.size.y/2 + 2.9)), .5, wmHex('#ff4d4d'), .14, WHITE);
            const crew = sim.zoneWorkers(z);
            if (!crew.length && z !== 'black' && q > 0) wmText('NO CREW!', r.pos.add(vec2(1.3, 0)), .5, wmHex('#ff4d4d'), .14, WHITE);
            if (zone.broken && !zone.contractor && !sim.crewCount('black')) wmText('tap: call contractor', r.pos.add(vec2(r.size.x/2 - 1.3, r.size.y/2 - 2.4)), .26, wmHex('#c2410c'), .08, WHITE);
        }
        const bn = R.bench;
        wmText(bn.size.x >= bn.size.y ? `☕ BREAK ROOM  ·  lvl ${sim.fac.breakroom}  ·  drag tired staff here` : '☕ BREAK ROOM', bn.size.x >= bn.size.y ? vec2(bn.pos.x - bn.size.x/2 + .45, bn.pos.y + bn.size.y/2 - .42) : bn.pos.add(vec2(0, bn.size.y/2 - .45)), .36, WHITE, .12, O, bn.size.x >= bn.size.y ? 'left' : 'center');
        const d = R.dock, long = d.size.y >= d.size.x;
        wmText('DOCK', d.pos.add(long ? vec2(0, d.size.y/2 - .4) : vec2(-d.size.x/2 + .9, 0)), .36, WHITE, .12, O);
        wmText(`🚛${sim.dock}`, d.pos.add(long ? vec2(0, -d.size.y/2 + .5) : vec2(d.size.x/2 - .9, 0)), .42, sim.dock > 40 ? wmHex('#ff4d4d') : WHITE, .12, O);
        const by = R.bay, bl = by.size.y >= by.size.x;
        wmText('BAY', by.pos.add(bl ? vec2(0, by.size.y/2 - .4) : vec2(-by.size.x/2 + .7, 0)), .36, WHITE, .12, O);
        wmText(`${sim.stats.shipped * UNITS_PER_PARCEL}`, by.pos.add(bl ? vec2(0, -by.size.y/2 + .5) : vec2(by.size.x/2 - .9, 0)), .4, wmHex('#7ed957'), .12, O);
        for (const w of sim.workers)
        {
            if (w.injured) continue;
            const p = this.workerPos(w);
            wmText(w.s.nickname || w.s.name.split(' ')[0], p.add(vec2(0, -1.02)), .28, w.s.homegrown ? wmHex('#b8f28c') : WHITE, .1, O);
        }
        for (const b of this.barks)
        {
            const w = sim.worker(b.id); if (!w || w.injured) continue;
            const a = b.t > b.life - .3 ? (b.life - b.t) / .3 : 1;
            wmText(b.text, this.workerPos(w).add(vec2(.3, 1.77)), .34 * Math.min(1, b.t * 6), new Color(.17, .18, .26, a));
        }
        for (const inc of sim.incidents) if (!inc.done)
        {
            const w = sim.worker(inc.workerId); if (!w) continue;
            const p = this.workerPos(w).add(vec2(0, inc.type === 'falling' ? 3.6 : 1.7));
            wmText('TAP!', p.add(vec2(0, -1.15)), .42, wmHex('#fff3a0'), .14, O);
        }
    },

    renderPost()
    {
        if (!this.active || !this.sim) return;
        for (const b of this.bubbles) b.draw();
        calloutDraw();
        const s = mainCanvasSize, ctx = mainContext;
        if (this.vignette > 0)
        {
            const a = Math.min(.5, this.vignette * .3);
            const g = ctx.createRadialGradient(s.x/2, s.y/2, Math.min(s.x, s.y) * .25, s.x/2, s.y/2, Math.max(s.x, s.y) * .7);
            g.addColorStop(0, 'rgba(220,30,30,0)');
            g.addColorStop(1, `rgba(220,30,30,${a})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s.x, s.y);
        }
        if (this.drama)
        {
            // fatality: the world drains of colour, everything stops
            const a = Math.min(1, this.drama.t * 2) * Math.min(1, this.drama.left);
            ctx.fillStyle = `rgba(10,10,20,${.72 * a})`;
            ctx.fillRect(0, 0, s.x, s.y);
            const fs = Math.min(64, s.x * .09);
            drawTextScreen('🕯️', vec2(s.x/2, s.y/2 - fs * 1.4), fs * 1.2, new Color(1,1,1,a));
            drawTextScreen(this.drama.title, vec2(s.x/2, s.y/2), fs, new Color(1, .3, .3, a), fs * .08, new Color(0,0,0,a));
            drawTextScreen(this.drama.sub, vec2(s.x/2, s.y/2 + fs * .95), fs * .38, new Color(1,1,1,a), fs * .03, new Color(0,0,0,a));
        }
        if (this.paused && !this.sim.done && !this.drama)
            drawTextScreen('PAUSED', s.scale(.5), Math.min(80, s.x * .12), WHITE, 10, wmHex(NX.O));
    },

    drawDock(ctx)
    {
        const R = this.rects, sim = this.sim, T = timeReal;
        for (const key of ['dock', 'bay'])
        {
            const d = R[key];
            NX.rr(ctx, d.pos.x, d.pos.y - .15, d.size.x, d.size.y, .5, NX.SHADOW, null, 0);
            NX.rr(ctx, d.pos.x, d.pos.y, d.size.x, d.size.y, .5, '#4b5875', NX.O, .14);
            const long = d.size.y >= d.size.x;
            // roller doors
            for (let i = -1; i <= 1; i++)
            {
                const dx = long ? 0 : i * d.size.x * .28, dy = long ? i * d.size.y * .26 : 0;
                NX.rr(ctx, d.pos.x + dx, d.pos.y + dy, long ? d.size.x * .7 : d.size.x * .22, long ? d.size.y * .2 : d.size.y * .6, .15, '#9fb0cc', NX.O, .08);
            }
            if (key === 'dock')
                for (let i = 0; i < Math.min(sim.dock, 12); i++)
                {
                    const p = long ? { x: d.pos.x - .4 + (i % 2) * .8, y: d.pos.y + d.size.y/2 - 1.1 - Math.floor(i / 2) * .5 } : { x: d.pos.x - d.size.x/2 + 1 + Math.floor(i / 2) * .5, y: d.pos.y - .4 + (i % 2) * .8 };
                    NX.box(ctx, p.x, p.y, .42, '#d9a066');
                }
            else NX.truck(ctx, d.pos.x, d.pos.y, long, T);
        }
    },

    drawRoads(ctx)
    {
        const T = this.sim.t, RW = WH_MAP.RW;
        const rect = (pos, size, fill, stroke, lw, r = 0)=> { const p = this.T(pos), sz = this.TS(size); NX.rr(ctx, p.x, p.y, sz.x, sz.y, r, fill, stroke, lw); };
        for (const wk of WH_MAP.walkways)
        {
            rect(wk.pos, wk.size, '#9be8b4', null, 0, .25);
            const horiz = wk.size.x > wk.size.y;
            // footprints
            for (let t = -((horiz ? wk.size.x : wk.size.y) / 2) + .8; t < (horiz ? wk.size.x : wk.size.y) / 2; t += 2.2)
            {
                const p = horiz ? { x:wk.pos.x + t, y:wk.pos.y } : { x:wk.pos.x, y:wk.pos.y + t };
                const q = this.T(p);
                NX.ell(ctx, q.x - .12, q.y + .08, .09, .14, 'rgba(46,140,80,.35)');
                NX.ell(ctx, q.x + .12, q.y - .08, .09, .14, 'rgba(46,140,80,.35)');
            }
        }
        for (const r of WH_MAP.roads)
        {
            rect(r.pos, r.size, '#5d6b82', NX.O, .1, .3);
            const len = r.horiz ? r.size.x : r.size.y;
            for (const sgn of [-1, 1])
                rect(r.horiz ? { x:r.pos.x, y:r.pos.y + sgn * (RW/2 - .16) } : { x:r.pos.x + sgn * (RW/2 - .16), y:r.pos.y }, r.horiz ? { x:r.size.x - .4, y:.11 } : { x:.11, y:r.size.y - .4 }, '#ffd23f', null, 0, .05);
            for (let t = -len/2 + .6; t < len/2; t += 1.6)
                rect(r.horiz ? { x:r.pos.x + t, y:r.pos.y } : { x:r.pos.x, y:r.pos.y + t }, r.horiz ? { x:.75, y:.09 } : { x:.09, y:.75 }, 'rgba(255,255,255,.55)', null, 0, .04);
            const off = (T * 1.5) % 6;
            for (let t = -len/2 + 1.5 + off; t < len/2 - 1; t += 6)
            {
                const c = { x:r.pos.x + r.dir.x * t, y:r.pos.y + r.dir.y * t }, d = r.dir, n = { x:-d.y, y:d.x };
                const pts = [{ x:c.x + d.x * .45, y:c.y + d.y * .45 }, { x:c.x - d.x * .3 + n.x * .4, y:c.y - d.y * .3 + n.y * .4 }, { x:c.x - d.x * .1, y:c.y - d.y * .1 }, { x:c.x - d.x * .3 - n.x * .4, y:c.y - d.y * .3 - n.y * .4 }].map(p => this.T(p));
                NX.poly(ctx, pts, 'rgba(255,255,255,.22)');
            }
        }
        WH_MAP.crosswalks.forEach((cw, i)=>
        {
            const users = this.sim.cwUsers[i];
            const waiting = this.sim.workers.some(w => w.state === 'waitCross' && w.path && w.path[w.pathI]?.cw === cw);
            const pulse = .5 + .5 * Math.sin(timeReal * 8);
            const c = users ? '#ffd23f' : waiting ? `rgba(255,255,255,${.6 + .4 * pulse})` : '#ffffff';
            for (let k = -2; k <= 2; k++) rect({ x:cw.x, y:cw.y + k * .42 }, { x:1.35, y:.24 }, c, null, 0, .06);
            rect({ x:cw.x + (cw.road === 'main' ? -1.05 : 1.05), y:cw.y }, { x:.12, y:RW - .35 }, '#ff4d4d', null, 0, .05);
        });
    },

    drawConveyors(ctx)
    {
        const R = this.rects, T = this.sim.t;
        const link = (a, b, color, w = .34)=>
        {
            const pa = R[a].pos, pb = R[b].pos;
            const dir = pb.subtract(pa), len = dir.length(), n = dir.normalize();
            NX.line(ctx, pa.x, pa.y - .12, pb.x, pb.y - .12, w + .12, NX.SHADOW);
            NX.line(ctx, pa.x, pa.y, pb.x, pb.y, w + .14, NX.O);
            NX.line(ctx, pa.x, pa.y, pb.x, pb.y, w, color);
            const off = (T * 2) % 1.1;
            for (let d = off; d < len; d += 1.1) { const p = pa.add(n.scale(d)); NX.circ(ctx, p.x, p.y, w * .22, 'rgba(255,255,255,.7)'); }
        };
        for (let i = 0; i < FLOW_STANDARD.length - 1; i++) link(FLOW_STANDARD[i], FLOW_STANDARD[i+1], '#b6c2d6');
        link('blue', 'purple', '#c8a6ff', .24);
        link('purple', 'orange', '#c8a6ff', .24);
        link('dock', 'blue', '#b6c2d6');
        link('red', 'bay', '#b6c2d6');
    },

    drawZone(ctx, z)
    {
        const sim = this.sim, zone = sim.zones[z], r = this.rects[z], def = ZONE_DEFS[z];
        const T = timeReal;
        const crew = sim.zoneWorkers(z);
        const busy = crew.filter(w => w.state === 'work' || w.state === 'repair').length;
        const flowing = busy > 0 && zone.queue.length < sim.cap * .6 && !zone.broken;
        const wob = this.zoneGlow[z] ? Math.sin(T * 40) * .06 * this.zoneGlow[z].t : 0;
        const x = r.pos.x + wob, y = r.pos.y;
        // glow when flowing
        if (flowing && sim.stats.flow >= 2)
            NX.rr(ctx, x, y, r.size.x + .7, r.size.y + .7, 1, NX.alpha(def.hex, .25 + .1 * Math.sin(T * 4 + z.length)), null, 0);
        if (this.zoneGlow[z]) NX.rr(ctx, x, y, r.size.x + .8, r.size.y + .8, 1, NX.alpha(this.zoneGlow[z].c, .5 * this.zoneGlow[z].t), null, 0);
        // building
        NX.rr(ctx, x, y - .22, r.size.x, r.size.y, .7, NX.SHADOW, null, 0);
        NX.rr(ctx, x, y, r.size.x, r.size.y, .7, NX.mix(def.hex, '#ffffff', .78), NX.O, .16);
        NX.rr(ctx, x, y - .45, r.size.x - .5, r.size.y - 1.4, .45, '#fffaf0', NX.alpha(NX.O, .25), .06);
        // header pill
        NX.rr(ctx, x, y + r.size.y/2 - .5, r.size.x - .3, .78, .39, def.hex, NX.O, .1);
        NX.rr(ctx, x, y + r.size.y/2 - .38, r.size.x - .7, .18, .09, 'rgba(255,255,255,.3)', null, 0);
        // queue: cute cardboard boxes
        const q = zone.queue.length, shown = Math.min(q, 24);
        for (let i = 0; i < shown; i++)
        {
            const p = zone.queue[i], pos = this.queueSlot(z, i);
            NX.box(ctx, pos.x + wob, pos.y, .44, PACKAGE_TYPES[p.type].color, p.type === 'rush' ? .5 + .5 * Math.sin(T * 8 + i) : 0);
        }
        // breakdown badge
        if (zone.broken)
        {
            const b = zone.broken, p = r.pos.add(vec2(r.size.x/2 - 1.2, r.size.y/2 - 1.6));
            const pulse = .5 + .5 * Math.sin(T * 7);
            NX.circ(ctx, p.x, p.y, .85 + pulse * .1, '#ff8a3d', NX.O, .12);
            NX.gear(ctx, p.x, p.y, .45, T * (zone.contractor ? 6 : 1.5));
            const pr = clamp(b.progress / b.work, 0, 1);
            NX.rr(ctx, p.x, p.y - 1.15, 1.6, .26, .13, '#ffffff', NX.O, .07);
            if (pr > 0) NX.rr(ctx, p.x - .8 + pr * .8, p.y - 1.15, 1.6 * pr, .26, .13, '#7ed957', null, 0);
        }
    },

    drawBench(ctx)
    {
        const r = this.rects.bench;
        NX.rr(ctx, r.pos.x, r.pos.y - .2, r.size.x, r.size.y, .7, NX.SHADOW, null, 0);
        NX.rr(ctx, r.pos.x, r.pos.y, r.size.x, r.size.y, .7, '#ffe1a8', NX.O, .16);
        // sofas & coffee
        const long = r.size.x >= r.size.y;
        for (let i = -3; i <= 3; i += 2)
        {
            const p = long ? { x:r.pos.x + i * r.size.x * .13, y:r.pos.y - .65 } : { x:r.pos.x - .65, y:r.pos.y + i * r.size.y * .13 };
            NX.rr(ctx, p.x, p.y, long ? 2.2 : .7, long ? .7 : 2.2, .3, '#ff7b9c', NX.O, .08);
        }
    },

    // ---------------------------------------------------------------- characters
    workerMood(w)
    {
        if (w.incident) return 'shocked';
        if (w.jay) return 'angry';
        if (w.state === 'waitCross' && w.crossWait > this.sim.patienceOf(w) * .7) return 'angry';
        if (w.energy < 25) return 'sad';
        if ((w.state === 'work' && this.sim.stats.flow >= 3) || (this.vis[w.id]?.hop || 0) > 0 || w.zone === 'bench') return 'happy';
        return 'neutral';
    },
    drawWorker(ctx, w)
    {
        const v = this.vis[w.id]; if (!v) return;
        const T = timeReal, s = w.s;
        const dragging = this.drag?.id === w.id && this.drag.moved;
        let p = v.pos.copy();
        const working = w.state === 'work' || w.state === 'repair';
        const walking = this.sim.isWalking(w) && w.state === 'walk';
        let squash = 1, bob = 0;
        if (working && !this.paused) { const ph = Math.sin(w.anim * (9 + (s.attrs.workRate - 10) * .3)); bob = Math.abs(ph) * .1; squash = 1 - Math.max(0, -ph) * .06; }
        if (walking) bob = Math.abs(Math.sin(T * (w.jay ? 22 : 14))) * .14;
        if (v.hop) bob += Math.sin(v.hop / .25 * Math.PI) * .3;
        if (dragging) { bob = .35 + Math.sin(T * 12) * .06; }
        const sel = this.selected === w.id || dragging;
        if (sel) NX.circ(ctx, p.x, p.y + .2, .85 + .05 * Math.sin(T * 8), 'rgba(255,255,255,.35)', '#ffffff', .08);
        if (w.jay) NX.circ(ctx, p.x, p.y + .2, 1 + .1 * Math.sin(T * 16), 'rgba(255,60,60,.3)', '#ff4d4d', .08);
        const vest = w.zone === 'bench' ? '#94a3b8' : ZONE_DEFS[w.zone].hex;
        NX.chibi(ctx, p.x, p.y + bob, { look:s.look, vest, mood:this.workerMood(w), face:v.face, squash, step: walking ? Math.sin(T * (w.jay ? 22 : 14)) : 0, blink:(T + w.id * .37) % 4 < .12, homegrown:!!s.homegrown, sleepy:w.zone === 'bench' && w.state === 'break' });
        // carried parcel
        if (w.pkg && !this.sim.isWalking(w))
        {
            NX.box(ctx, p.x + .42 * v.face, p.y + bob - .05, .36, PACKAGE_TYPES[w.pkg.type].color);
            if (w.state === 'work')
            {
                const pr = clamp(w.progress, 0, 1);
                NX.rr(ctx, p.x, p.y - .66, .9, .14, .07, '#ffffff', NX.O, .05);
                if (pr > 0) NX.rr(ctx, p.x - .45 + pr * .45, p.y - .66, .9 * pr, .14, .07, '#3ec1ff', null, 0);
            }
        }
        // energy pip bar
        const e = clamp(w.energy / 100, 0, 1);
        NX.rr(ctx, p.x, p.y - .84, .8, .12, .06, '#ffffff', NX.O, .04);
        if (e > 0) NX.rr(ctx, p.x - .4 + e * .4, p.y - .84, .8 * e, .12, .06, e > .5 ? '#7ed957' : e > .25 ? '#ffd23f' : '#ff4d4d', null, 0);
        // crossing patience
        if (w.state === 'waitCross')
        {
            const pt = clamp(w.crossWait / this.sim.patienceOf(w), 0, 1);
            NX.pie(ctx, p.x + .6, p.y + 1.25, .32, pt, pt < .6 ? '#ffd23f' : '#ff4d4d');
        }
        // state icon bubble
        let icon = '';
        if (w.state === 'waitCross') icon = '⏳';
        else if (w.jay) icon = '💨';
        else if (this.sim.isWalking(w) && w.selfBreak) icon = '🍔';
        else if (w.state === 'blocked') icon = '⛔';
        else if (w.state === 'repair') icon = '🔧';
        else if (w.zone === 'bench') icon = '💤';
        else if (w.energy < 25) icon = '💦';
        if (icon) this.iconQueue.push([icon, p.add(vec2(-.55, 1.15 + bob))]);
    },

    drawBody(ctx, bd)
    {
        const T = timeReal;
        const a = bd.fatal ? 1 : clamp(bd.life, 0, 1);
        ctx.globalAlpha = a;
        if (bd.fatal)
        {
            NX.ell(ctx, bd.pos.x, bd.pos.y - .1, 1.1, .45, 'rgba(120,0,0,.35)');
            NX.rr(ctx, bd.pos.x, bd.pos.y, 1.8, .7, .35, '#f8fafc', NX.O, .1);
            NX.circ(ctx, bd.pos.x - .7, bd.pos.y, .32, '#f8fafc', NX.O, .08);
            this.iconQueue.push(['🌷', bd.pos.add(vec2(.9, .45))]);
        }
        else
        {
            NX.chibi(ctx, bd.pos.x, bd.pos.y, { look:bd.look, vest:bd.vest, mood:'dizzy', angle:-Math.PI / 2 * bd.side, face:1 });
            for (let i = 0; i < 3; i++) { const an = T * 4 + i * 2.1; this.iconQueue.push(['⭐', bd.pos.add(vec2(Math.cos(an) * .55, .9 + Math.sin(an) * .2))]); }
        }
        ctx.globalAlpha = 1;
    },

    drawDrop(ctx, d)
    {
        const t = clamp(d.t / d.dur, 0, 1);
        const e = t * t;
        const y = d.from.y + (d.to.y - d.from.y) * e, x = d.from.x + (d.to.x - d.from.x) * e;
        NX.ell(ctx, d.to.x, d.to.y - .4, .3 + .5 * t, .12 + .15 * t, 'rgba(0,0,0,.3)');
        if (d.kind === 'box') NX.box(ctx, x, y, .9, '#d9a066', 0, d.spin * t * 3);
        else NX.chibi(ctx, x, y, { look:d.look, vest:d.vest, mood:'shocked', angle:d.spin * t * 8, face:1 });
    },

    drawForklift(ctx, f)
    {
        const lp = WH_MAP.loopPos(f.s);
        const pos = this.T(lp);
        const h = this.T({ x:lp.dx, y:lp.dy });
        const ang = Math.atan2(h.y, h.x);
        const T = timeReal;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        // blue pedestrian-warning spot
        const g = ctx.createRadialGradient(h.x * 2.3, h.y * 2.3, 0, h.x * 2.3, h.y * 2.3, .9);
        g.addColorStop(0, `rgba(60,140,255,${f.speed > .3 ? .6 : .25})`); g.addColorStop(1, 'rgba(60,140,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x * 2.3, h.y * 2.3, .9, 0, 7); ctx.fill();
        ctx.rotate(ang);
        const bounce = f.speed > .3 ? Math.abs(Math.sin(T * 12 + f.id)) * .04 : 0;
        NX.ell(ctx, 0, -.12, 1.15, .65, NX.SHADOW);
        // wheels
        for (const [wx, wy] of [[-.5, .52], [-.5, -.52], [.45, .52], [.45, -.52]]) NX.rr(ctx, wx, wy, .42, .22, .1, '#2b2d42', null, 0);
        // forks + load
        NX.rr(ctx, 1.05, .26, .8, .12, .05, '#c7ced9', NX.O, .05);
        NX.rr(ctx, 1.05, -.26, .8, .12, .05, '#c7ced9', NX.O, .05);
        if (f.load) NX.box(ctx, 1.05, 0, .72, PACKAGE_TYPES[f.load]?.color || '#d9a066', 0, -ang);
        NX.rr(ctx, .62, 0, .16, 1.0, .06, '#3b3f55', NX.O, .06);   // mast
        NX.rr(ctx, -.1, bounce, 1.35, 1.02, .32, '#ffc83d', NX.O, .12);  // body
        NX.rr(ctx, -.72, bounce, .3, .96, .14, '#ff8a3d', NX.O, .08);   // counterweight
        NX.rr(ctx, -.2, bounce, .62, .7, .22, 'rgba(255,255,255,.35)', NX.O, .07); // cab glass
        NX.circ(ctx, -.2, bounce, .24, '#ffe0c2', NX.O, .06);            // driver
        NX.circ(ctx, -.24, bounce, .2, '#ffd23f', NX.O, .05);            // driver's hat
        const brake = f.braking || f.stopT > 0 || f.hold;
        for (const sy of [-.36, .36]) NX.rr(ctx, -.86, sy, .1, .18, .04, brake ? '#ff2d2d' : '#7f1d1d', null, 0);
        const blink = Math.sin(T * 9 + f.id) > 0;
        NX.circ(ctx, -.45, bounce, .14, blink ? '#ffae00' : '#a14d00', NX.O, .04);
        ctx.restore();
        if (f.hold)
        {
            const w = this.sim.worker(f.hold.workerId);
            if (w) { const wp = this.workerPos(w); NX.line(ctx, pos.x, pos.y, wp.x, wp.y, .14, `rgba(255,40,40,${.5 + .5 * Math.sin(T * 14)})`); }
            this.iconQueue.push(['‼️', pos.add(vec2(0, 1.1))]);
        }
    },

    drawIncident(ctx, inc)
    {
        const w = this.sim.worker(inc.workerId);
        if (!w) return;
        const T = timeReal;
        const wp = this.workerPos(w);
        const left = clamp(1 - (this.sim.t - inc.t0) / inc.window, 0, 1);
        if (inc.type === 'falling')
        {
            // a teetering stack of boxes looms overhead, its shadow growing on the worker
            NX.ell(ctx, wp.x, wp.y - .45, .5 + (1 - left) * .6, .18 + (1 - left) * .14, `rgba(0,0,0,${.2 + (1 - left) * .35})`);
            const lean = Math.sin(T * 6) * (.12 + (1 - left) * .25);
            for (let i = 0; i < 3; i++) NX.box(ctx, wp.x + Math.sin(lean) * i * .9, wp.y + 1.7 + i * .78, .8, '#d9a066', 0, lean * (i + 1) * .5);
        }
        const p = wp.add(vec2(0, inc.type === 'falling' ? 3.6 : 1.7));
        const pulse = .5 + .5 * Math.sin(T * 12);
        NX.circ(ctx, p.x, p.y, 1.1 + pulse * .15, `rgba(255,60,40,${.25 + pulse * .2})`, null, 0);
        NX.circ(ctx, p.x, p.y, .78, '#ffd23f', NX.O, .12);
        NX.pie(ctx, p.x, p.y, .78, 1 - left, left < .35 ? 'rgba(255,40,40,.55)' : 'rgba(43,45,66,.25)');
        NX.rr(ctx, p.x, p.y + .12, .16, .55, .08, NX.O, null, 0);
        NX.circ(ctx, p.x, p.y - .34, .1, NX.O, null, 0);
    },
};

// ===========================================================================
// NX — chunky "toy" drawing kit (Canvas2D in world units, y up)
// ===========================================================================
const NX =
{
    O: '#2b2d42',
    SHADOW: 'rgba(43,45,66,.28)',
    world()
    {
        const ctx = mainContext;
        const o = worldToScreen(vec2(0, 0));
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(cameraScale, -cameraScale);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        shiftView.iconQueue = [];
        return ctx;
    },
    done(ctx)
    {
        ctx.restore();
        for (const [icon, p] of shiftView.iconQueue) wmText(icon, p, .42);
        shiftView.iconQueue = [];
    },
    mix(a, b, t)
    {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const r = (pa >> 16) + ((pb >> 16) - (pa >> 16)) * t, g = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t, bl = (pa & 255) + ((pb & 255) - (pa & 255)) * t;
        return `rgb(${r | 0},${g | 0},${bl | 0})`;
    },
    alpha(hex, a) { const p = parseInt(hex.slice(1), 16); return `rgba(${p >> 16},${(p >> 8) & 255},${p & 255},${a})`; },
    rr(ctx, x, y, w, h, r, fill, stroke, lw)
    {
        r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x - w/2, y - h/2, w, h, r) : ctx.rect(x - w/2, y - h/2, w, h);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke && lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    },
    circ(ctx, x, y, r, fill, stroke, lw)
    {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke && lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    },
    ell(ctx, x, y, rx, ry, fill, stroke, lw, rot = 0)
    {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke && lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    },
    line(ctx, x1, y1, x2, y2, w, color) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); },
    poly(ctx, pts, fill) { ctx.beginPath(); pts.forEach((p, i)=> i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); },
    pie(ctx, x, y, r, t, fill)
    {
        if (t <= 0) return;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, Math.PI / 2, Math.PI / 2 - t * Math.PI * 2, true); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
    },
    gear(ctx, x, y, r, a)
    {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); NX.rr(ctx, 0, r * .9, r * .45, r * .5, .05, '#ffffff', NX.O, .05); }
        NX.circ(ctx, 0, 0, r * .8, '#ffffff', NX.O, .07);
        NX.circ(ctx, 0, 0, r * .3, '#ff8a3d', NX.O, .05);
        ctx.restore();
    },
    box(ctx, x, y, s, color, glow = 0, rot = 0)
    {
        ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
        if (glow) NX.rr(ctx, 0, 0, s * 1.45, s * 1.45, s * .4, `rgba(255,220,40,${.35 * glow})`, null, 0);
        NX.rr(ctx, 0, -s * .1, s, s, s * .18, 'rgba(0,0,0,.18)', null, 0);
        NX.rr(ctx, 0, 0, s, s, s * .18, color, NX.O, s * .12);
        NX.rr(ctx, 0, 0, s * .22, s * .92, 0, 'rgba(255,255,255,.45)', null, 0);
        NX.rr(ctx, -s * .22, s * .24, s * .3, s * .1, s * .05, 'rgba(255,255,255,.4)', null, 0);
        ctx.restore();
    },
    truck(ctx, x, y, long, T)
    {
        ctx.save(); ctx.translate(x, y); if (!long) ctx.rotate(Math.PI / 2);
        const b = Math.sin(T * 3) * .03;
        NX.rr(ctx, 0, .6 + b, 1.5, 2.6, .25, '#ffffff', NX.O, .1);
        NX.rr(ctx, 0, .6 + b, 1.1, 2.1, .12, '#ff5d8f', null, 0);
        NX.rr(ctx, 0, -1.25 + b, 1.5, 1.1, .35, '#3ec1ff', NX.O, .1);
        NX.rr(ctx, 0, -1.45 + b, 1.1, .4, .15, '#d8f3ff', NX.O, .06);
        ctx.restore();
    },
    // the star of the show: a chibi warehouse worker
    chibi(ctx, x, y, o)
    {
        const look = o.look || { skin:1, hair:0, style:0, hat:0, acc:0 };
        const skin = LOOK_SKIN[look.skin] || LOOK_SKIN[1], hair = LOOK_HAIR[look.hair] || LOOK_HAIR[0], hat = LOOK_HAT[look.hat] || LOOK_HAT[0];
        const O = NX.O, sq = o.squash || 1, face = o.face || 1;
        ctx.save(); ctx.translate(x, y); if (o.angle) ctx.rotate(o.angle); ctx.scale(1, sq);
        if (!o.angle) NX.ell(ctx, 0, -.5, .45, .14, NX.SHADOW);
        // feet
        const st = o.step || 0;
        NX.ell(ctx, -.17, -.44 + Math.max(0, st) * .1, .13, .09, '#3b3f55', O, .05);
        NX.ell(ctx, .17, -.44 + Math.max(0, -st) * .1, .13, .09, '#3b3f55', O, .05);
        // body + hi-vis
        NX.rr(ctx, 0, -.12, .66, .62, .22, o.vest, O, .08);
        NX.rr(ctx, 0, -.08, .62, .1, 0, '#ffe066', null, 0);
        NX.circ(ctx, -.37, -.1 + st * .04, .1, skin, O, .05);
        NX.circ(ctx, .37, -.1 - st * .04, .1, skin, O, .05);
        if (o.homegrown) { NX.circ(ctx, .18 * face, .04, .08, '#7ed957', O, .03); }
        // hair behind
        if (look.style === 2 || look.style === 4) NX.rr(ctx, 0, .48, .9, look.style === 4 ? 1.05 : .75, .35, hair, O, .07);
        if (look.style === 3) NX.circ(ctx, 0, .98, .17, hair, O, .06);
        // head
        NX.circ(ctx, 0, .5, .42, skin, O, .08);
        NX.ell(ctx, -.25, .4, .08, .05, 'rgba(255,120,150,.6)');
        NX.ell(ctx, .25, .4, .08, .05, 'rgba(255,120,150,.6)');
        // eyes
        const ex = .06 * face, mood = o.mood;
        if (mood === 'dizzy') { for (const sx of [-.14, .14]) { NX.line(ctx, sx - .07 + ex, .5, sx + .07 + ex, .58, .05, O); NX.line(ctx, sx - .07 + ex, .58, sx + .07 + ex, .5, .05, O); } }
        else if (o.blink || o.sleepy) { for (const sx of [-.14, .14]) NX.line(ctx, sx - .06 + ex, .52, sx + .06 + ex, .52, .05, O); }
        else if (mood === 'happy') { for (const sx of [-.14, .14]) { ctx.beginPath(); ctx.arc(sx + ex, .5, .06, 0, Math.PI); ctx.strokeStyle = O; ctx.lineWidth = .05; ctx.stroke(); } }
        else if (mood === 'shocked') { for (const sx of [-.14, .14]) { NX.circ(ctx, sx + ex, .53, .085, '#ffffff', O, .035); NX.circ(ctx, sx + ex, .53, .035, O); } }
        else
        {
            for (const sx of [-.14, .14]) { NX.ell(ctx, sx + ex, .53, .045, .065, O); NX.circ(ctx, sx + ex + .015, .555, .017, '#ffffff'); }
            if (mood === 'angry') { NX.line(ctx, -.22 + ex, .66, -.08 + ex, .61, .045, O); NX.line(ctx, .22 + ex, .66, .08 + ex, .61, .045, O); }
            if (mood === 'sad') { NX.line(ctx, -.22 + ex, .61, -.08 + ex, .66, .04, O); NX.line(ctx, .22 + ex, .61, .08 + ex, .66, .04, O); NX.ell(ctx, .3, .62, .04, .07, '#7cc8ff'); }
        }
        // mouth
        if (mood === 'happy') { ctx.beginPath(); ctx.arc(ex, .38, .09, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#c2410c'; ctx.fill(); ctx.strokeStyle = O; ctx.lineWidth = .035; ctx.stroke(); }
        else if (mood === 'shocked' || mood === 'dizzy') NX.ell(ctx, ex, .34, .05, .065, '#7c2d12', O, .03);
        else if (mood === 'sad' || mood === 'angry') { ctx.beginPath(); ctx.arc(ex, .3, .07, .2 * Math.PI, .8 * Math.PI); ctx.strokeStyle = O; ctx.lineWidth = .04; ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(ex, .4, .06, 1.2 * Math.PI, 1.8 * Math.PI); ctx.strokeStyle = O; ctx.lineWidth = .04; ctx.stroke(); }
        // accessories
        if (look.acc === 1) for (const sx of [-.14, .14]) NX.circ(ctx, sx + ex, .53, .1, 'rgba(255,255,255,.2)', O, .035);
        if (look.acc === 2) { ctx.beginPath(); ctx.arc(0, .42, .36, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(.2, .28); ctx.lineTo(-.2, .28); ctx.closePath(); ctx.fillStyle = hair; ctx.fill(); ctx.strokeStyle = O; ctx.lineWidth = .04; ctx.stroke(); }
        if (look.acc === 3) NX.ell(ctx, ex, .43, .12, .035, hair, O, .025);
        if (look.acc === 4) { NX.rr(ctx, -.43, .52, .1, .22, .05, '#ff4d4d', O, .03); NX.rr(ctx, .43, .52, .1, .22, .05, '#ff4d4d', O, .03); }
        // hard hat
        ctx.beginPath(); ctx.arc(0, .66, .38, 0, Math.PI); ctx.closePath(); ctx.fillStyle = hat; ctx.fill(); ctx.strokeStyle = O; ctx.lineWidth = .07; ctx.stroke();
        NX.rr(ctx, 0, .67, .9, .1, .05, hat, O, .06);
        ctx.beginPath(); ctx.arc(-.08, .74, .22, Math.PI * .6, Math.PI * .9); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = .06; ctx.stroke();
        if (look.acc === 5) NX.rr(ctx, 0, .7, .78, .08, .03, '#e11d48', null, 0);
        ctx.restore();
    },
};
