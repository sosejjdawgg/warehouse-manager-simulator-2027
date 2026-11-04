'use strict';
// ============================================================================
// WaveView — the shift floor. Set-up (place zones, seat specialists, draw
// routes), then waves: drag operatives and forklifts onto routes, tap wobbling
// stacks, spills, broken forklifts and crossing warnings. Portrait screens
// rotate the floor 90°; people, piles and labels stay upright.
// ============================================================================

const waveView =
{
    sim:null, active:false, paused:false, speed:1, portrait:false,
    bubbles:[], vis:{}, drag:null, draw:null, vignette:0, finishing:false, barks:[],

    start(sim)
    {
        this.sim = sim; this.active = true; this.paused = false; this.speed = 1; this.finishing = false;
        this.bubbles = []; this.vis = {}; this.drag = null; this.draw = null; this.vignette = 0; this.barks = []; this.icons = [];
        clearParticles();
        sim.on((t, d)=> this.onEvent(t, d));
        this.layout(true);
        document.body.classList.add('rushOn');
    },
    stop() { this.active = false; clearParticles(); document.body.classList.remove('rushOn'); },

    // ---------------------------------------------------------------- geometry
    T(p) { return this.portrait ? vec2(p.y, -p.x) : vec2(p.x, p.y); },
    Ti(p) { return this.portrait ? vec2(-p.y, p.x) : vec2(p.x, p.y); },
    layout(force)
    {
        const portrait = mainCanvasSize.y > mainCanvasSize.x * 1.05;
        if (!force && portrait === this.portrait) return;
        this.portrait = portrait;
        const b = WV_BOUNDS, c = this.T({ x:(b.minX + b.maxX) / 2, y:(b.minY + b.maxY) / 2 });
        const sz = vec2(b.maxX - b.minX, b.maxY - b.minY);
        this.bounds = { center:c, size: portrait ? vec2(sz.y, sz.x) : sz };
    },
    seatPos(n, i) { const k = n.seats.length; return { x:n.x + (i - (k - 1) / 2) * 1.15, y:n.y - 1.95 }; },
    pileAt(n) { return n.type === 'dock' ? { x:n.x + 2.7, y:n.y - .9 } : n.type === 'door' ? { x:n.x - 2.6, y:n.y - .9 } : { x:n.x + 2.75, y:n.y - 1.1 }; },
    bayPos(i) { const n = this.sim.forklifts.length; return { x:WV_BAY.x - WV_BAY.w / 2 + 1.6 + i * Math.min(2.6, (WV_BAY.w - 3.2) / Math.max(1, n - 1)), y:WV_BAY.y + .1 }; },
    restPos(w)
    {
        const idle = this.sim.workers.filter(o => !o.injured && !o.gone && o.role === 'op' && (!o.carrier || (!o.carrier.line && !o.carrier.task)));
        const i = Math.max(0, idle.indexOf(w)), n = Math.max(1, idle.length);
        return { x:WV_BREAK.x - WV_BREAK.w / 2 + 1.3 + (n === 1 ? 0 : i * Math.min(1.5, (WV_BREAK.w - 2.6) / (n - 1))), y:WV_BREAK.y - .35 };
    },
    lineOff(l, a, b)
    {
        // parallel routes on the same corridor sit side by side (Mini Metro)
        const L = this.sim.lines.length, li = this.sim.lines.indexOf(l);
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, o = (li - (L - 1) / 2) * .34;
        return { ox:-dy / len * o, oy:dx / len * o };
    },
    workerSpot(w)
    {
        const sim = this.sim;
        if (w.role === 'spec' && w.node) { const n = sim.node(w.node); return n ? this.seatPos(n, w.seat) : this.restPos(w); }
        const c = w.carrier;
        if (c && c.kind === 'flt') return null;                       // drawn as the forklift
        if (c && c.task) return { x:c.x, y:c.y };
        if (c && c.line && !w.resting)
        {
            const p = sim.carrierPos(c), a = sim.node(c.line.path[c.seg]), b = sim.node(c.line.path[c.seg + 1]);
            const o = a && b ? this.lineOff(c.line, a, b) : { ox:0, oy:0 };
            return { x:p.x + o.ox, y:p.y + o.oy };
        }
        return this.restPos(w);
    },
    forkSpot(f, i)
    {
        const sim = this.sim, c = f.driver?.carrier;
        if (c && c.line && !c.task)
        {
            const p = sim.carrierPos(c), a = sim.node(c.line.path[c.seg]), b = sim.node(c.line.path[c.seg + 1]);
            const o = a && b ? this.lineOff(c.line, a, b) : { ox:0, oy:0 };
            return { x:p.x + o.ox, y:p.y + o.oy, ang: a && b ? Math.atan2(b.y - a.y, b.x - a.x) + (c.dir < 0 ? Math.PI : 0) : 0, c };
        }
        return { ...this.bayPos(i), ang:Math.PI / 2, c };
    },
    nodeAt(p, r = 1.7, types) { let best = null, bd = r; for (const n of this.sim.nodes) { if (types && !types.includes(n.type)) continue; const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = n; } } return best; },
    lineAt(p, r = 1.3)
    {
        let best = null, bd = r;
        for (const l of this.sim.lines) for (let i = 0; i < l.path.length - 1; i++)
        {
            const a = this.sim.node(l.path[i]), b = this.sim.node(l.path[i + 1]);
            const d = wvSegDist(p, a, b);
            if (d < bd) { bd = d; best = l; }
        }
        return best;
    },
    bubble(text, lp, color = '#fff', size = .55, life = 1.3) { if (this.bubbles.length < 50) this.bubbles.push(new WmBubble(text, this.T(lp), color, size, life)); },
    bark(w, kind) { if (!w || this.barks.length > 3 || this.barks.some(b => b.id === w.id)) return; const text = barkLine(kind, w.s); if (text) this.barks.push({ id:w.id, text, t:0 }); },

    // ---------------------------------------------------------------- events
    onEvent(type, d)
    {
        const sim = this.sim;
        const wpos = (w)=> this.vis[w.id]?.pos || this.workerSpot(w) || { x:0, y:0 };
        switch (type)
        {
            case 'open': callout('DOORS OPEN!', 'gold', { sub:`${sim.waves.length} waves until despatch cut-off`, size:.9 }); playSfx('horn', .9); break;
            case 'wave':
            {
                const wv = d.wave;
                callout(`WAVE ${d.n}${d.n === d.of ? ' — LAST ONE' : ''}`, d.n === d.of ? 'red' : 'gold', { sub:`${wv.trailers.length} trailers · ${wv.boxes} boxes${wv.heavy ? ` · ${wv.heavy} heavy` : ''}`, size:.85 });
                playSfx('horn', 1, .9); addScreenShake(.15, .3);
                break;
            }
            case 'trailerIn': playSfx('horn', .35, .7); this.bubble(d.tr.van ? 'Van in' : 'Trailer on the dock', { x:d.dock.x + 1.5, y:d.dock.y + 2.2 }, '#bfe3ff', .42, 1.2); break;
            case 'demurrage': this.bubble('Driver kicking off! 💷', { x:d.dock.x + 1.8, y:d.dock.y + 2.4 }, '#ff6b6b', .5, 2); hudToast('🤬 A haulier has been kept waiting — demurrage is ticking. Clear Goods In!', '#ef4444'); playSfx('horn', .9, .6); break;
            case 'loaded': if (Math.random() < .5) this.bubble('+' + Math.round(sim.ppb * UNITS_PER_PARCEL), { x:d.d.x + 1.6, y:d.d.y + 1.4 }, '#7ed957', .42, .9); playSfx('ship', .45, 1.1, .05); break;
            case 'misSend': this.bubble('MIS-SEND!', { x:d.d.x - 1, y:d.d.y + 2 }, '#ff6b6b', .5, 1.6); playSfx('buzz', .5); coachTip('wvMisSend'); break;
            case 'trailerFull': this.bubble('FULL LOAD! ★', { x:d.d.x + 1.4, y:d.d.y + 2 }, '#ffd23f', .6, 1.5); playSfx('horn', .8, 1.25); particleEffect('confetti', this.T({ x:d.d.x + 1.8, y:d.d.y }), { scale:1 }); break;
            case 'trailerPart': if (d.short > 0) { this.bubble(`Left ${d.short} short`, { x:d.d.x + 1.4, y:d.d.y + 2 }, '#ff6b6b', .5, 1.6); playSfx('flowDown', .6); } break;
            case 'processed': playSfx('scan', .5, 1 + Math.random() * .2, .06); if (Math.random() < .05) this.bark(d.w, 'perfect'); break;
            case 'lineNew': playSfx('perfect', .7, 1.2); break;
            case 'routeGap':
            {
                const names = d.missing.map(z => WV_ZONES[z].name).join(' + ');
                hudToast(`⚠️ ${d.l.client.name}'s route skips ${names} — those boxes will go out wrong!`, '#f97316');
                coachTip('wvRoute');
                break;
            }
            case 'seat': if (d.match) { const p = this.seatPos(d.n, d.w.seat); this.bubble('RIGHT TEAM!', { x:p.x, y:p.y + 1.6 }, ZONE_DEFS[bestZone(d.w.s)].hex, .45, 1.2); } playSfx('drop'); break;
            case 'direct': this.bark(d.w, 'moved'); playSfx('drop'); break;
            case 'skive': if (Math.random() < .35) this.bubble(pickOne(['📱', '💤', '🚬', '☕?']), { ...wpos(d.w), y:wpos(d.w).y + 1.5 }, '#fff', .55, 1.4); coachTip('wvAuto'); break;
            case 'wobble': this.bubble('WOBBLING!', { ...this.pileAt(d.n), y:this.pileAt(d.n).y + 3 }, '#ffd23f', .5, 1.3); playSfx('warn', .5, 1.3); coachTip('wvWobble'); break;
            case 'shored': playSfx('saved', .6, 1.2); this.bubble('Restacked', { ...this.pileAt(d.n), y:this.pileAt(d.n).y + 3 }, '#7ed957', .45, 1); break;
            case 'topple':
            {
                const p = this.pileAt(d.n);
                callout('TIMBER!', 'red', { size:.7, hold:.5, sub:`${d.spilled.length} boxes all over the floor` });
                playSfx('crash', .9); addScreenShake(.4, .5);
                particleEffect('debris', this.T(p), { scale:1 });
                coachTip('wvSpill');
                break;
            }
            case 'blocked': if (Math.random() < .3) this.bark(d.c.w, 'jam'); break;
            case 'cleanSent': playSfx('pick'); this.bark(d.c.w, 'moved'); break;
            case 'cleared': playSfx('tick', .6, 1.3); break;
            case 'brake': playSfx('glass', .3, 1.6); this.bubble('Brakes!', { x:d.x.x, y:d.x.y + 1.4 }, '#fde68a', .42, .9); break;
            case 'incident':
                playSfx('warn', .9); playSfx('ominous', .5);
                if (d.inc.type === 'crossing') { playSfx('horn', 1, 1.6); hudToast(`🚜 Forklift heading for ${d.w.s.name} at a crossing — TAP!`, '#ef4444'); coachTip('incident'); }
                else hudToast(`☣️ DG leak in the cage — TAP to contain it!`, '#a855f7');
                break;
            case 'avoided':
            {
                const p = wpos(d.w);
                this.bubble(d.inc.type === 'crossing' ? 'EMERGENCY STOP!' : 'CONTAINED!', { x:p.x, y:p.y + 2 }, '#4ade80', .55, 1.4);
                playSfx('saved', .9);
                if (Math.random() < .5) callout(pickOne(['NICE SAVE!', 'NOT TODAY!', 'SHARP!']), 'green', { size:.65, hold:.45 });
                this.bark(d.w, 'saved');
                break;
            }
            case 'nearMiss': { const p = wpos(d.w); this.bubble('Near miss!', { x:p.x, y:p.y + 1.8 }, '#fde68a', .5); playSfx('glass', .5); this.bark(d.w, 'nearMiss'); break; }
            case 'injury':
            {
                const p = wpos(d.w);
                this.bubble(d.inj.fatal ? 'FATALITY' : d.inj.serious ? 'MAN DOWN!' : 'Injury', { x:p.x, y:p.y + 2 }, '#ef4444', .8, 2.4);
                particleEffect(d.inj.serious ? 'debris' : 'hit', this.T(p), { scale:1.2 });
                addScreenShake(d.inj.serious ? .5 : .25, .6); this.vignette = d.inj.serious ? 1.6 : .9;
                playSfx('crash', 1); playSfx('ominous', 1);
                if (d.inj.fatal) { callout('FATALITY', 'silver', { sub:`${d.w.s.name} was ${d.inj.cause}`, hold:2.2 }); this.paused = true; setTimeout(()=> { this.paused = false; }, 2600); hudToast(`🕯️ ${d.w.s.name} has died.`, '#ef4444'); }
                else if (d.inj.serious) callout('MAN DOWN!', 'red', { sub:`${d.w.s.name} — ${d.inj.label}` });
                else hudToast(`🚑 ${d.w.s.name} injured (${d.inj.label})`, '#ef4444');
                if (!d.w.temp && typeof hudAccident === 'function') hudAccident();
                break;
            }
            case 'walkOut': callout('WALKED OUT!', 'red', { size:.7, sub:`${d.w.s.name} has had enough and gone home` }); playSfx('flowDown', .8); hudToast(`🚪 ${d.w.s.name} walked out. Morale across the floor drops.`, '#ef4444'); coachTip('wvMood'); break;
            case 'brew': callout('BREW ROUND!', 'green', { size:.7, hold:.5, sub:'Everyone downs tools for a cuppa' }); playSfx('fanfare', .6, 1.3); break;
            case 'agency': hudToast('📞 Two agency temps are on their way in. Cheap they are not.', '#38bdf8'); playSfx('tick'); break;
            case 'breakdown': hudToast('🔧 A forklift has broken down — TAP it to get it fixed', '#f97316'); playSfx('clank', 1); coachTip('wvBreakdown'); break;
            case 'fixing': hudToast(d.eng ? `🔧 ${d.eng.s.name} is on it` : '📞 Contractor called out — that\'ll cost you', '#f97316'); break;
            case 'fixed': playSfx('repaired', .8); break;
            case 'sickie': hudToast(`🤒 ${d.w.s.name} has gone home "sick". Again.`, '#facc15'); break;
            case 'hse': callout('HSE SPOT CHECK!', 'purple', { size:.7, sub:'An inspector is on the floor — keep it tidy' }); playSfx('ominous', .8); break;
            case 'hseFine': hudToast(`📋 HSE found boxes all over the floor: ${wmMoney(d.fine)} fine`, '#ef4444'); playSfx('buzz', .8); break;
            case 'hseGone': if (d.clean) hudToast('📋 Inspector left happy. Clean floor, clean record.', '#4ade80'); break;
            case 'late': hudToast('🚛 The next wave\'s running late — they\'ll all land at once', '#facc15'); break;
            case 'brewless': hudToast('☕ The tea urn\'s broken. Moods are dropping.', '#facc15'); break;
            case 'fireAlarm': callout('FIRE ALARM!', 'red', { sub:'Everyone out to the muster point', hold:1.2 }); playSfx('warn', 1, .8); break;
            case 'alarmOver': hudToast('🔔 False alarm. Back to it.', '#e2e8f0'); break;
            case 'sentEarly': hudToast(`⏩ Wave brought forward: +${wmMoney(d.bonus)} bonus`, '#4ade80'); playSfx('flowUp', .7); break;
            case 'cutoff': this.paused = true; wvOvertimeModal(d.left, d.cost); break;
            case 'overtime': callout('OVERTIME', 'blue', { sub:'One more hour. Late collections are on their way.', size:.8 }); break;
            case 'refused': hudToast(`🙅 ${d.w.s.name} won't do overtime for that money`, '#facc15'); break;
            case 'finish': callout('CLOCK OFF!', 'gold', { sub:`${fmtUnits(sim.stats.despatched * sim.ppb)} units despatched · ${'★'.repeat(Math.round(sim.stars))}` }); break;
        }
        wvHudUpdate(true);
    },

    // ---------------------------------------------------------------- frame
    update()
    {
        if (!this.active || !this.sim) return;
        this.layout();
        const dtReal = 1 / 60, sim = this.sim;
        const top = Math.min(84, mainCanvasSize.y * .12), bottom = Math.min(124, mainCanvasSize.y * .19);
        cameraFit(this.bounds.center, this.bounds.size, .3, { top, bottom, left:4, right:4 });
        this.handleInput();
        calloutUpdate(dtReal);
        const live = sim.phase === 'live' || sim.phase === 'overtime';
        if (!this.paused && live && !sim.done) for (let i = 0; i < this.speed && !sim.done; i++) { sim.step(dtReal); if (sim.phase === 'cutoff') break; }
        if (sim.done && !this.finishing) { this.finishing = true; hudShiftFinished(); }
        for (const w of sim.workers)
        {
            const spot = this.workerSpot(w);
            const v = this.vis[w.id] || (this.vis[w.id] = { pos:spot || { x:0, y:0 }, face:1 });
            if (!spot || this.drag?.w === w) continue;
            const before = v.pos.x;
            const k = w.carrier?.line && !w.resting ? .45 : .14;
            v.pos = { x:v.pos.x + (spot.x - v.pos.x) * k, y:v.pos.y + (spot.y - v.pos.y) * k };
            v.moving = Math.abs(spot.x - v.pos.x) + Math.abs(spot.y - v.pos.y) > .03 || (w.carrier?.line && w.carrier.dwell <= 0 && w.carrier.stop <= 0 && !w.carrier.blocked && !w.carrier.skive);
            if (Math.abs(v.pos.x - before) > .005) v.face = v.pos.x > before ? 1 : -1;
        }
        this.bubbles = this.bubbles.filter(b => b.update(dtReal));
        this.vignette = Math.max(0, this.vignette - dtReal);
        for (const b of this.barks) b.t += dtReal;
        this.barks = this.barks.filter(b => b.t < 2);
        if (Math.random() < .002 && live) { const w = pickOne(sim.workers.filter(w => !w.injured && !w.gone)); if (w) this.bark(w, w.mood < 30 ? 'tired' : 'idle'); }
        wvHudUpdate();
    },

    handleInput()
    {
        const sim = this.sim, mp = this.Ti(mousePos), live = sim.phase === 'live' || sim.phase === 'overtime';
        if (sim.phase === 'cutoff' || sim.done) { this.drag = null; this.draw = null; return; }
        if (mouseWasPressed(0) && wmPointerOnCanvas)
        {
            if (live)
            {
                // 1. accident warnings (generous targets)
                for (const inc of sim.incidents)
                {
                    if (inc.done) continue;
                    const p = this.vis[inc.w.id]?.pos || this.workerSpot(inc.w) || { x:0, y:0 };
                    if (Math.hypot(mp.x - p.x, mp.y - (p.y + 2.3)) < 1.7 || Math.hypot(mp.x - p.x, mp.y - p.y) < 1.1) { sim.intervene(inc); return; }
                }
                // 2. wobbling stacks
                for (const n of sim.nodes) if (n.wobble > 0) { const p = this.pileAt(n); if (Math.hypot(mp.x - p.x, mp.y - (p.y + .9)) < 1.9) { sim.shoreUp(n); return; } }
                // 3. broken forklifts
                for (let i = 0; i < sim.forklifts.length; i++) { const f = sim.forklifts[i]; if (!f.broken) continue; const p = this.forkSpot(f, i); if (Math.hypot(mp.x - p.x, mp.y - p.y) < 1.5) { if (!sim.fixForklift(f)) playSfx('tick'); return; } }
            }
            // 4. people (and forklifts with their drivers)
            const w = this.personAt(mp);
            if (w)
            {
                if (live && w.role === 'spec') { hudToast('🔒 Specialists stay in their zone until clock-off', '#94a3b8'); playSfx('buzz', .4); }
                else { this.drag = { w, start:mousePosScreen.copy() }; playSfx('pick'); }
                return;
            }
            // 5. spills: send someone to clear it
            if (live) for (const s of sim.spills) if (Math.hypot(mp.x - s.x, mp.y - s.y) < 1.2) { if (!sim.sendCleaner(s)) hudToast('Nobody free to clear it — direct an operative first', '#facc15'); return; }
            // 6. set-up: pick up a zone
            if (sim.phase === 'setup') for (const n of sim.zones()) if (Math.abs(mp.x - n.x) < 1.8 && Math.abs(mp.y - n.y) < 1.3) { this.drag = { zone:n, off:{ x:n.x - mp.x, y:n.y - mp.y }, home:{ x:n.x, y:n.y } }; playSfx('pick', .8, .8); return; }
            // 7. start a route from a dock or a door
            const n = this.nodeAt(mp, 1.8, ['dock', 'door']);
            if (n) { this.draw = { path:[n.id] }; playSfx('pick', .8, 1.3); coachTip('wvDraw'); return; }
        }
        if (this.draw)
        {
            const d = this.draw, n = this.nodeAt(mp, 1.6);
            const endId = d.path[d.path.length - 1], prevId = d.path[d.path.length - 2];
            const first = sim.node(d.path[0]);
            if (n && n.id !== endId)
            {
                if (n.id === prevId) { d.path.pop(); playSfx('tick', .7); }
                else if (!d.path.includes(n.id) && sim.node(endId).type !== (first.type === 'dock' ? 'door' : 'dock'))
                {
                    const ok = n.type === 'zone' || (first.type === 'dock' && n.type === 'door') || (first.type === 'door' && n.type === 'dock');
                    if (ok) { d.path.push(n.id); playSfx('tick', 1, 1.5); }
                }
            }
            d.cursor = mp;
            if (!mouseIsDown(0))
            {
                if (d.path.length >= 2)
                {
                    const r = sim.commitLine(d.path);
                    if (!r.ok) { hudToast(r.why === 'ends' ? '〰️ A route runs from GOODS IN to a client\'s door' : 'That route doesn\'t work', '#f97316'); playSfx('buzz', .6); }
                }
                this.draw = null;
            }
        }
        if (this.drag?.zone)
        {
            const z = this.drag.zone;
            z.x = mp.x + this.drag.off.x; z.y = mp.y + this.drag.off.y;
            if (!mouseIsDown(0))
            {
                const want = { x:z.x, y:z.y }; z.x = this.drag.home.x; z.y = this.drag.home.y;
                if (!sim.moveZone(z, want.x, want.y)) { playSfx('buzz', .5); hudToast('No room there — zones need space around them', '#f97316'); }
                else playSfx('drop', .9, .8);
                this.drag = null;
            }
        }
        else if (this.drag?.w)
        {
            const w = this.drag.w, v = this.vis[w.id] || (this.vis[w.id] = { pos:{ ...mp }, face:1 });
            v.pos = { x:mp.x, y:mp.y - .4 };
            if (!mouseIsDown(0))
            {
                this.drag = null;
                this.dropPerson(w, mp);
            }
        }
    },
    personAt(p)
    {
        const sim = this.sim;
        // forklifts first (big targets), then people
        for (let i = 0; i < sim.forklifts.length; i++)
        {
            const f = sim.forklifts[i]; if (!f.driver) continue;
            const q = this.forkSpot(f, i);
            if (Math.hypot(p.x - q.x, p.y - q.y) < 1.1) return f.driver;
        }
        let best = null, bd = 1;
        for (const w of sim.workers)
        {
            if (w.injured || w.gone || w.role === 'flt') continue;
            const q = this.vis[w.id]?.pos; if (!q) continue;
            const d = Math.hypot(p.x - q.x, p.y - (q.y + .3));
            if (d < bd) { bd = d; best = w; }
        }
        return best;
    },
    dropPerson(w, p)
    {
        const sim = this.sim, live = sim.phase !== 'setup';
        // onto a forklift in the bay?
        for (let i = 0; i < sim.forklifts.length; i++)
        {
            const f = sim.forklifts[i], q = this.forkSpot(f, i);
            if (f.driver === w || Math.hypot(p.x - q.x, p.y - q.y) > 1.4 || (f.driver && live)) continue;
            if (!sim.setDriver(f, w)) { hudToast(`🪪 ${w.s.name} hasn't got a forklift licence`, '#f97316'); playSfx('buzz', .6); }
            else playSfx('drop');
            return;
        }
        // set-up: into a zone seat
        if (!live)
        {
            const z = sim.zones().find(n => Math.abs(p.x - n.x) < 2.3 && p.y > n.y - 3 && p.y < n.y + 1.6);
            if (z)
            {
                let i = z.seats.findIndex(x => !x);
                if (i < 0) i = z.seats.map((_, k)=> k).sort((a, b)=> Math.hypot(p.x - this.seatPos(z, a).x, p.y - this.seatPos(z, a).y) - Math.hypot(p.x - this.seatPos(z, b).x, p.y - this.seatPos(z, b).y))[0];
                const cert = WV_ZONES[z.ztype].cert;
                if (cert && !w.s.certs.includes(cert)) hudToast(`☣️ ${w.s.name} isn't DG trained — slow and risky in the cage`, '#a855f7');
                const f = sim.forkliftOf(w); if (f) sim.setDriver(f, null);
                sim.seat(w, z, i);
                return;
            }
        }
        // onto a route
        const l = sim.lines.length ? this.lineAt(p, 1.4) || (this.nodeAt(p, 1.8) && sim.lines.find(x => x.path.includes(this.nodeAt(p, 1.8).id))) : null;
        if (l && w.role !== 'spec') { sim.direct(w, l); this.bubble(l.client.name, { x:p.x, y:p.y + 1.6 }, l.client.hex, .45, 1); return; }
        if (l && w.role === 'spec' && !live) { sim.unseat(w); sim.direct(w, l); return; }
        // staff room
        const inBreak = Math.abs(p.x - WV_BREAK.x) < WV_BREAK.w / 2 + .5 && Math.abs(p.y - WV_BREAK.y) < WV_BREAK.h / 2 + 1;
        if (inBreak || !live)
        {
            if (!live) { if (w.role === 'spec') sim.unseat(w); const f = sim.forkliftOf(w); if (f) sim.setDriver(f, null); if (w.carrier) sim.dropCarrier(w); w.resting = false; playSfx('drop', .8, .8); return; }
            if (w.role === 'flt') { hudToast('Park the forklift by dragging it to the bay… or just put it on a route', '#94a3b8'); return; }
            sim.rest(w); this.bubble('Brew ☕', { x:p.x, y:p.y + 1 }, '#e2e8f0', .45); playSfx('drop', .8, .8); return;
        }
        playSfx('tick');
    },

    // ---------------------------------------------------------------- render
    render()
    {
        if (!this.active) return;
        const sim = this.sim, T = timeReal;
        const ctx = NX.world();
        if (this.portrait) ctx.rotate(-Math.PI / 2);
        const b = WV_BOUNDS, setup = sim.phase === 'setup';
        // shell: walls, floor, bays
        const cy = (b.minY + b.maxY) / 2, H = b.maxY - b.minY + .6, Wl = WV_WALL;
        // the yard outside (tarmac) where trailers back on
        NX.rr(ctx, 0, cy - .25, b.maxX - b.minX + .6, H, 1, '#4b5468', null, 0);
        NX.rr(ctx, 0, cy, b.maxX - b.minX + .6, H, 1, '#7a8399', NX.O, .2);
        for (const sx of [-1, 1]) for (let y = -9; y <= 8; y += 3.2) NX.rr(ctx, sx * (Wl + 2.3), y, 3.6, .1, 0, 'rgba(255,255,255,.45)', null, 0);
        // the shed
        NX.rr(ctx, 0, cy - .2, Wl * 2 + .4, H - .4, .8, NX.SHADOW, null, 0);
        NX.rr(ctx, 0, cy, Wl * 2 + .4, H - .4, .8, '#efe9dc', NX.O, .2);
        ctx.strokeStyle = 'rgba(140,120,90,.10)'; ctx.lineWidth = .05; ctx.beginPath();
        for (let x = -Wl + 1; x < Wl; x += 2) { ctx.moveTo(x, b.minY + .3); ctx.lineTo(x, b.maxY - .3); }
        for (let y = Math.ceil(b.minY) + 1; y < b.maxY - .3; y += 2) { ctx.moveTo(-Wl, y); ctx.lineTo(Wl, y); }
        ctx.stroke();
        NX.rr(ctx, -Wl + 1.1, -1.2, 1.4, 21, .4, 'rgba(62,193,255,.2)', null, 0);        // goods in apron
        NX.rr(ctx, Wl - 1.1, -1.2, 1.4, 21, .4, 'rgba(229,56,59,.14)', null, 0);          // goods out apron
        if (setup)
        {
            const a = WV_AREA, pulse = .5 + .5 * Math.sin(T * 3);
            ctx.setLineDash([.5, .35]);
            NX.rr(ctx, (a.minX + a.maxX) / 2, (a.minY + a.maxY) / 2, a.maxX - a.minX + 3.6, a.maxY - a.minY + 3, .6, `rgba(255,255,255,${.25 + pulse * .15})`, '#7aa2d8', .1);
            ctx.setLineDash([]);
        }
        // staff room + forklift bay
        for (const [r, col] of [[WV_BREAK, '#ffe1a8'], [WV_BAY, '#d7dee9']]) { NX.rr(ctx, r.x, r.y - .15, r.w, r.h, .6, NX.SHADOW, null, 0); NX.rr(ctx, r.x, r.y, r.w, r.h, .6, col, NX.O, .14); }
        for (let i = 0; i < sim.forklifts.length; i++) { const p = this.bayPos(i); ctx.setLineDash([.25, .2]); NX.rr(ctx, p.x, p.y, 2, 1.9, .2, null, 'rgba(43,45,66,.35)', .07); ctx.setLineDash([]); }

        // routes
        for (const l of sim.lines)
        {
            const pts = l.path.map(id => sim.node(id));
            for (let i = 0; i < pts.length - 1; i++)
            {
                const a = pts[i], c = pts[i + 1], { ox, oy } = this.lineOff(l, a, c);
                NX.line(ctx, a.x + ox, a.y + oy, c.x + ox, c.y + oy, .62, NX.O);
                NX.line(ctx, a.x + ox, a.y + oy, c.x + ox, c.y + oy, .46, l.client.hex);
                // direction chevrons: goods only flow towards the door
                const len = Math.hypot(c.x - a.x, c.y - a.y), ang = Math.atan2(c.y - a.y, c.x - a.x);
                for (let s = 1.6; s < len - 1.2; s += 2.4)
                {
                    const k = s / len, x = a.x + (c.x - a.x) * k + ox, y = a.y + (c.y - a.y) * k + oy;
                    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
                    NX.poly(ctx, [{ x:.16, y:0 }, { x:-.1, y:.15 }, { x:-.1, y:-.15 }], 'rgba(255,255,255,.75)');
                    ctx.restore();
                }
            }
        }
        // crossings: hazard where walkers meet forklifts
        for (const x of sim.crossings)
        {
            const flts = sim.carriers.some(c => c.kind === 'flt' && (c.line === x.la || c.line === x.lb));
            NX.circ(ctx, x.x, x.y, .62, flts ? '#ffd23f' : '#ffffff', NX.O, .1);
            NX.poly(ctx, [{ x:x.x, y:x.y + .38 }, { x:x.x - .36, y:x.y - .26 }, { x:x.x + .36, y:x.y - .26 }], flts ? NX.O : '#94a3b8');
        }
        // the route being drawn
        if (this.draw)
        {
            const d = this.draw, pts = d.path.map(id => sim.node(id));
            const doorN = pts.find(n => n.type === 'door');
            const col = doorN ? doorN.client.hex : '#7a8699';
            ctx.globalAlpha = .8;
            for (let i = 0; i < pts.length - 1; i++) NX.line(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, .5, col);
            const endN = pts[pts.length - 1];
            if (d.cursor) { ctx.setLineDash([.4, .3]); NX.line(ctx, endN.x, endN.y, d.cursor.x, d.cursor.y, .4, col); ctx.setLineDash([]); }
            ctx.globalAlpha = 1;
            for (const n of sim.nodes) if (!d.path.includes(n.id) && (n.type === 'zone' || n.type !== sim.node(d.path[0]).type)) NX.circ(ctx, n.x, n.y, 1.9, 'rgba(255,255,255,.18)', 'rgba(255,255,255,.7)', .08);
        }
        // buildings
        for (const n of sim.nodes) this.drawNode(ctx, n, T);
        // spilled boxes
        for (const s of sim.spills)
        {
            NX.circ(ctx, s.x, s.y, .8, 'rgba(255,210,63,.25)', '#ffd23f', .06);
            NX.box(ctx, s.x, s.y, .62, s.box.client.hex, 0, s.rot);
            if (s.claimed) NX.circ(ctx, s.x + .45, s.y + .45, .18, '#7ed957', NX.O, .05);
        }
        // forklifts
        sim.forklifts.forEach((f, i)=> this.drawForklift(ctx, f, i, T));

        // ---- upright pass: piles, people, warnings
        if (this.portrait) ctx.rotate(Math.PI / 2);
        const W = (p)=> this.T(p);
        for (const n of sim.nodes) this.drawPile(ctx, n, W(this.pileAt(n)), T);
        const people = sim.workers.filter(w => !w.injured && !w.gone && w.role !== 'flt').sort((a, c)=> (this.drag?.w === a) - (this.drag?.w === c) || (this.vis[c.id]?.pos.y || 0) - (this.vis[a.id]?.pos.y || 0));
        for (const w of people)
        {
            const v0 = this.vis[w.id]; if (!v0) continue;
            const p = W(v0.pos), c = w.carrier;
            const team = w.role === 'spec' ? WV_ZONES[sim.node(w.node).ztype].zone : null;
            const vest = w.temp ? '#cbd5e1' : team ? ZONE_DEFS[team].hex : '#ffd23f';
            const working = !!w.job || (c && c.line && !w.resting && c.dwell > 0);
            const mood = w.incident ? 'shocked' : w.mood < 30 ? 'sad' : w.mood > 70 || working ? 'happy' : 'neutral';
            const bob = working ? Math.abs(Math.sin(T * 9 + w.id)) * .07 : 0;
            if (this.drag?.w === w) NX.circ(ctx, p.x, p.y + .3, .95, 'rgba(255,255,255,.4)', '#fff', .08);
            if (team && bestZone(w.s) === team) NX.circ(ctx, p.x, p.y - .45, .5, NX.alpha(ZONE_DEFS[team].hex, .45));
            NX.chibi(ctx, p.x, p.y + bob, { look:w.s.look, vest, mood, face:v0.face, step: v0.moving ? Math.sin(T * 14 + w.id) : 0, squash: working ? (Math.sin(T * 9 + w.id) > 0 ? .98 : .995) : 1 });
            // boxes carried overhead
            if (c && c.load.length) c.load.slice(0, 4).forEach((bx, k)=> NX.box(ctx, p.x + (k % 2 ? .18 : -.18), p.y + .75 + Math.floor(k / 2) * .36 + (k % 2) * .05, .34, bx.client.hex));
            if (w.job) NX.pie(ctx, p.x + .55, p.y + 1.05, .26, clamp(w.prog, 0, 1), '#3ec1ff');
            if (c && c.auto && !w.resting && sim.phase !== 'setup') NX.circ(ctx, p.x - .5, p.y + .7, .17, '#e2e8f0', NX.O, .04);   // autopilot dot
        }
        // empty seats
        for (const n of sim.zones()) n.seats.forEach((id, i)=> { if (!id) { const p = W(this.seatPos(n, i)); ctx.setLineDash([.15, .12]); NX.circ(ctx, p.x, p.y - .1, .45, 'rgba(255,255,255,.4)', 'rgba(43,45,66,.5)', .06); ctx.setLineDash([]); } });
        // warnings
        for (const inc of sim.incidents)
        {
            if (inc.done) continue;
            const p0 = this.vis[inc.w.id]?.pos; if (!p0) continue;
            const p = W(p0), left = clamp(1 - (sim.t - inc.t0) / inc.window, 0, 1), pulse = .5 + .5 * Math.sin(T * 12);
            const q = { x:p.x, y:p.y + 2.3 };
            NX.circ(ctx, q.x, q.y, 1.05 + pulse * .15, `rgba(255,60,40,${.3 + pulse * .2})`);
            NX.circ(ctx, q.x, q.y, .75, inc.type === 'dg' ? '#c4a7ff' : '#ffd23f', NX.O, .12);
            NX.pie(ctx, q.x, q.y, .75, 1 - left, left < .35 ? 'rgba(255,40,40,.55)' : 'rgba(43,45,66,.25)');
            NX.rr(ctx, q.x, q.y + .12, .16, .52, .08, NX.O, null, 0); NX.circ(ctx, q.x, q.y - .33, .1, NX.O);
            if (inc.flt) { const fp = this.forkSpot(inc.flt.f, sim.forklifts.indexOf(inc.flt.f)); const fq = W(fp); NX.line(ctx, fq.x, fq.y, p.x, p.y, .12, `rgba(255,40,40,${.5 + .5 * Math.sin(T * 14)})`); }
        }
        NX.done(ctx);
        this.drawLabels();
    },
    drawNode(ctx, n, T)
    {
        const sim = this.sim;
        if (n.type === 'dock')
        {
            NX.rr(ctx, n.x - 1.7, n.y, .9, 3, .2, '#3ec1ff', NX.O, .1);                              // roller shutter
            for (let i = -1; i <= 1; i++) NX.rr(ctx, n.x - 1.7, n.y + i * .7, .7, .1, 0, 'rgba(255,255,255,.6)', null, 0);
            NX.rr(ctx, n.x, n.y - .1, 2.6, 2.6, .35, NX.SHADOW, null, 0);
            NX.rr(ctx, n.x, n.y, 2.6, 2.6, .35, '#4b5875', NX.O, .14);
            NX.rr(ctx, n.x, n.y, 2, 2, .2, '#dbe7f5', null, 0);
            // the trailer backed on outside the wall
            const tr = [...sim.waves.flatMap(w => w.trailers), ...sim.vans].find(o => o.arrived && !o.done && o.dock === n.id);
            if (tr)
            {
                const bounce = Math.sin(T * 3 + n.id) * .03;
                NX.rr(ctx, n.x - 3.4, n.y + bounce, 2.6, tr.van ? 1.4 : 2, .2, '#ffffff', NX.O, .1);
                NX.rr(ctx, n.x - 3.4, n.y + bounce, 2.2, tr.van ? 1 : 1.5, .1, NX.alpha(tr.client.hex, .55), null, 0);
                NX.rr(ctx, n.x - 4.9, n.y + bounce, .9, tr.van ? 1.3 : 1.7, .3, tr.client.hex, NX.O, .1);
            }
        }
        else if (n.type === 'door')
        {
            const cl = n.client, tr = n.trailers[0];
            NX.rr(ctx, n.x + 1.7, n.y, .9, 3, .2, cl.hex, NX.O, .1);
            for (let i = -1; i <= 1; i++) NX.rr(ctx, n.x + 1.7, n.y + i * .7, .7, .1, 0, 'rgba(255,255,255,.5)', null, 0);
            rushShape(ctx, cl.shape, n.x, n.y, 1.25, '#ffffff', cl.hex, .3);
            rushShape(ctx, cl.shape, n.x, n.y, .66, cl.hex, null, 0);
            if (tr)
            {
                const f = tr.left / tr.patience, tx = n.x + 3.6;
                NX.rr(ctx, tx, n.y, 2.6, 2, .2, '#ffffff', NX.O, .1);
                NX.rr(ctx, tx, n.y - .55, 2.2 * clamp(tr.load / tr.cap, 0, 1), .3, .08, cl.hex, null, 0);
                NX.rr(ctx, tx + 1.75, n.y, .9, 1.7, .3, tr.late ? '#94a3b8' : '#3ec1ff', NX.O, .1);
                NX.pie(ctx, tx, n.y + .35, .42, clamp(f, 0, 1), f < .25 ? '#ff4d4d' : f < .5 ? '#ffd23f' : '#7ed957');
                NX.circ(ctx, tx, n.y + .35, .42, null, NX.O, .07);
            }
        }
        else if (n.type === 'zone')
        {
            const def = WV_ZONES[n.ztype], team = ZONE_DEFS[def.zone].hex;
            const drag = this.drag?.zone === n, ok = !drag || sim.canPlace(n, Math.round(n.x * 2) / 2, Math.round(n.y * 2) / 2);
            NX.rr(ctx, n.x, n.y - .15, 3.6, 2.6, .45, NX.SHADOW, null, 0);
            NX.rr(ctx, n.x, n.y, 3.6, 2.6, .45, '#ffffff', drag ? (ok ? '#4ade80' : '#ef4444') : NX.O, drag ? .22 : .14);
            NX.rr(ctx, n.x, n.y + .95, 3.6, .7, .3, team, null, 0);
            NX.rr(ctx, n.x, n.y - .25, 2.9, 1.1, .2, NX.alpha(team, .16), null, 0);
            // in-tray: what's waiting to be worked
            for (let i = 0; i < Math.min(n.inq.length, 5); i++) NX.box(ctx, n.x - 1.1 + i * .55, n.y - .25, .38, n.inq[i].client.hex);
            if (sim.phase === 'setup' && !drag) { const pulse = .5 + .5 * Math.sin(T * 4 + n.id); NX.rr(ctx, n.x, n.y, 3.9, 2.9, .5, null, `rgba(122,162,216,${.3 + pulse * .4})`, .1); }
        }
    },
    drawPile(ctx, n, p, T)
    {
        // a pyramid of boxes, 4-3-2-1, then it gets silly
        const boxes = [...n.out, ...(n.inq && n.type !== 'zone' ? n.inq : [])];
        const count = n.type === 'zone' ? n.out.length + Math.max(0, n.inq.length - 5) : boxes.length;
        const list = n.type === 'zone' ? [...n.out, ...n.inq.slice(5)] : boxes;
        if (!count && !n.wobble) return;
        const s = .44, sway = n.wobble > 0 ? Math.sin(T * (8 + n.wobble * 10)) * n.wobble * .16 : 0;
        ctx.save(); ctx.translate(p.x, p.y);
        if (n.wobble > 0)
        {
            const pulse = .5 + .5 * Math.sin(T * 10);
            NX.circ(ctx, 0, .9, 1.7 + pulse * .1, `rgba(255,60,60,${.12 + pulse * .12})`);
            NX.pie(ctx, 0, .9, 1.55, n.wobble, 'rgba(229,56,59,.45)');
        }
        ctx.rotate(sway);
        NX.ell(ctx, 0, -.12, 1.1, .2, NX.SHADOW);
        let k = 0;
        const rows = [4, 3, 2, 1, 1, 1];
        for (let r = 0; r < rows.length && k < list.length; r++)
            for (let i = 0; i < rows[r] && k < list.length; i++, k++)
            {
                const bx = list[k];
                const x = (i - (rows[r] - 1) / 2) * s * 1.02 + (r >= 4 ? (r - 3) * .08 * (1 + n.wobble * 3) : 0), y = r * s * .96 + s / 2;
                if (bx.heavy) NX.rr(ctx, x, y - s * .45, s * 1.05, s * .14, .02, '#a0703c', null, 0);
                NX.box(ctx, x, y, s * (bx.heavy ? 1 : .92), bx.client.hex);
                if (bx.step >= bx.client.recipe.length || (n.type === 'zone' && n.out.includes(bx))) NX.rr(ctx, x, y, s * .9, s * .14, 0, 'rgba(255,255,255,.65)', null, 0);
            }
        ctx.restore();
        if (count > 16) this.icons.push(['+' + (count - 16), vec2(p.x + 1.4, p.y + 2.4)]);
    },
    drawForklift(ctx, f, i, T)
    {
        const q = this.forkSpot(f, i), c = q.c;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang);
        const moving = c && c.line && c.dwell <= 0 && c.stop <= 0 && !c.blocked;
        const bounce = moving ? Math.abs(Math.sin(T * 12 + f.id)) * .04 : 0;
        const k = 1.05;
        ctx.scale(k, k);
        if (moving) { const g = ctx.createRadialGradient(2.2, 0, 0, 2.2, 0, .9); g.addColorStop(0, 'rgba(60,140,255,.55)'); g.addColorStop(1, 'rgba(60,140,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(2.2, 0, .9, 0, 7); ctx.fill(); }
        NX.ell(ctx, 0, -.12, 1.15, .65, NX.SHADOW);
        for (const [wx, wy] of [[-.5, .52], [-.5, -.52], [.45, .52], [.45, -.52]]) NX.rr(ctx, wx, wy, .42, .22, .1, '#2b2d42', null, 0);
        NX.rr(ctx, 1.05, .26, .8, .12, .05, '#c7ced9', NX.O, .05);
        NX.rr(ctx, 1.05, -.26, .8, .12, .05, '#c7ced9', NX.O, .05);
        if (c && c.load.length) { NX.rr(ctx, 1.05, 0, .9, .9, .08, '#a0703c', NX.O, .05); c.load.slice(0, 4).forEach((bx, j)=> NX.box(ctx, .85 + (j % 2) * .4, (j < 2 ? -.2 : .2), .38, bx.client.hex)); }
        NX.rr(ctx, .62, 0, .16, 1.0, .06, '#3b3f55', NX.O, .06);
        NX.rr(ctx, -.1, bounce, 1.35, 1.02, .32, f.broken ? '#9ca3af' : '#ffc83d', NX.O, .12);
        NX.rr(ctx, -.72, bounce, .3, .96, .14, '#ff8a3d', NX.O, .08);
        NX.rr(ctx, -.2, bounce, .62, .7, .22, 'rgba(255,255,255,.35)', NX.O, .07);
        if (f.driver) { NX.circ(ctx, -.2, bounce, .24, LOOK_SKIN[f.driver.s.look?.skin] || '#ffe0c2', NX.O, .06); NX.circ(ctx, -.24, bounce, .2, '#ffd23f', NX.O, .05); }
        const blink = Math.sin(T * 9 + f.id) > 0;
        NX.circ(ctx, -.45, bounce, .14, moving && blink ? '#ffae00' : '#a14d00', NX.O, .04);
        ctx.restore();
        if (f.broken) { const pulse = .5 + .5 * Math.sin(T * 8); NX.circ(ctx, q.x, q.y, 1.25 + pulse * .1, `rgba(255,140,40,${.25 + pulse * .2})`, '#ff8a3d', .1); this.icons.push([f.fixing > 0 ? '🛠️' : '🔧', this.T({ x:q.x, y:q.y + 1.3 })]); }
        if (this.drag?.w && this.drag.w.s.certs.includes('forklift') && !f.driver) NX.circ(ctx, q.x, q.y, 1.4, 'rgba(126,217,87,.25)', '#7ed957', .1);
    },
    drawLabels()
    {
        const sim = this.sim, O = wmHex(NX.O);
        const sv = (p, dy)=> { const q = this.T(p); return vec2(q.x, q.y + dy); };
        for (const [icon, p] of this.icons) wmText(icon, p, .42, WHITE, .1, O);
        this.icons = [];
        for (const n of sim.nodes)
        {
            if (n.type === 'dock') wmText('GOODS IN', sv(n, -1.75), .32, WHITE, .12, O);
            if (n.type === 'door') wmText(n.client.name, sv(n, -1.7), .3, wmHex(n.client.hex), .12, WHITE);
            if (n.type === 'zone')
            {
                const def = WV_ZONES[n.ztype];
                const roof = this.T({ x:n.x, y:n.y + .95 });
                if (this.portrait) { const c = this.T(n); wmText(def.icon + ' ' + def.short, vec2(c.x, c.y + 2.05), .27, WHITE, .1, O); }
                else { wmText(def.icon, vec2(roof.x - 1.35, roof.y), .36); wmText(def.short, vec2(roof.x + .2, roof.y - .02), .27, WHITE, .1, O); }
            }
            if (n.type === 'door' && n.trailers[0])
            {
                const tr = n.trailers[0], m = wvDriver(tr.left / tr.patience);
                wmText(`${tr.load}/${tr.cap}`, sv({ x:n.x + 3.6, y:n.y }, -.65), .3, O, 0);
                wmText(m[2], sv({ x:n.x + 5.3, y:n.y }, .9), .42);
            }
            if (n.type === 'dock')
            {
                const tr = [...sim.waves.flatMap(w => w.trailers), ...sim.vans].find(o => o.arrived && !o.done && o.dock === n.id);
                if (tr && tr.wait > 12) wmText(wvDriver(tr.mood)[2], sv({ x:n.x - 4.9, y:n.y }, 1.2), .42);
            }
        }
        if (this.portrait) { wmText('☕', sv({ x:WV_BREAK.x + WV_BREAK.w / 2 - .7, y:WV_BREAK.y }, 0), .5); wmText('🚜', sv({ x:WV_BAY.x - WV_BAY.w / 2 + .7, y:WV_BAY.y }, 0), .5); }
        else { wmText('☕ STAFF ROOM — drag people here for a sit-down', sv({ x:WV_BREAK.x, y:WV_BREAK.y + 1.5 }, 0), .3, WHITE, .12, O); wmText('🚜 FLT BAY', sv({ x:WV_BAY.x, y:WV_BAY.y + 1.5 }, 0), .3, WHITE, .12, O); }
        for (const w of sim.workers)
        {
            if (w.injured || w.gone) continue;
            let p;
            if (w.role === 'flt') { const i = sim.forklifts.findIndex(f => f.driver === w); if (i < 0) continue; const q = this.forkSpot(sim.forklifts[i], i); p = { x:q.x, y:q.y - .5 }; }
            else p = this.vis[w.id]?.pos;
            if (!p) continue;
            const m = wvMood(w.mood);
            wmText(w.s.nickname || w.s.name.split(' ')[0], sv(p, -1.05), .25, w.temp ? wmHex('#cbd5e1') : WHITE, .1, O);
            if (sim.phase !== 'setup' && (w.mood < 50 || w.mood >= 75)) wmText(m[2], sv(p, 1.3 + (w.carrier?.load.length ? .7 : 0)), .36);
        }
        for (const b of this.barks)
        {
            const w = sim.workers.find(x => x.id === b.id), p = w && this.vis[w.id]?.pos; if (!p || w.role === 'flt') continue;
            wmText(b.text, sv(p, 1.9), .3, wmHex('#2b2d42'), .14, WHITE);
        }
        if (sim.hse) wmText('📋 HSE', sv({ x:0, y:9.1 }, 0), .4, wmHex('#a855f7'), .12, WHITE);
    },
    renderPost()
    {
        if (!this.active) return;
        for (const b of this.bubbles) b.draw();
        calloutDraw();
        const s = mainCanvasSize, ctx = mainContext;
        if (this.vignette > 0)
        {
            const g = ctx.createRadialGradient(s.x / 2, s.y / 2, Math.min(s.x, s.y) * .25, s.x / 2, s.y / 2, Math.max(s.x, s.y) * .7);
            g.addColorStop(0, 'rgba(220,30,30,0)'); g.addColorStop(1, `rgba(220,30,30,${Math.min(.5, this.vignette * .3)})`);
            ctx.fillStyle = g; ctx.fillRect(0, 0, s.x, s.y);
        }
        if (this.sim.alarm > 0) { ctx.fillStyle = `rgba(255,30,30,${.12 + .1 * Math.sin(timeReal * 12)})`; ctx.fillRect(0, 0, s.x, s.y); }
        if (this.paused && this.sim.phase !== 'cutoff' && !this.sim.done) drawTextScreen('PAUSED — redraw routes freely', s.scale(.5), Math.min(40, s.x * .055), WHITE, 6, wmHex(NX.O));
    },
};

function wvSegDist(p, a, b)
{
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
function rushShape(ctx, shape, x, y, s, fill, stroke, lw)
{
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, s * .55, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(x - s * .48, y - s * .48, s * .96, s * .96);
    else if (shape === 'tri') { ctx.moveTo(x, y + s * .62); ctx.lineTo(x - s * .6, y - s * .45); ctx.lineTo(x + s * .6, y - s * .45); ctx.closePath(); }
    else if (shape === 'diamond') { ctx.moveTo(x, y + s * .65); ctx.lineTo(x + s * .55, y); ctx.lineTo(x, y - s * .65); ctx.lineTo(x - s * .55, y); ctx.closePath(); }
    else if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * s * .58, y + Math.sin(a) * s * .58); } ctx.closePath(); }
    else if (shape === 'star') { for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? .28 : .66) * s; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// ============================================================================
// HUD
// ============================================================================
function buildWaveHud()
{
    $('#hud').innerHTML = `
    ${safetyBoardHtml(career.records.daysSinceAccident, career.records.bestSafeRun)}
    <div class="hudTop">
        <div class="clock"><b id="hClock">06:00</b><i class="bar"><i id="hProg"></i></i><span id="hWave" class="wvTag">SET-UP</span></div>
        <div class="chip"><small>Despatched</small><b id="hShip">0</b><span id="hTgt"></span></div>
        <div class="chip"><small>Rating</small><b id="hStars">★★★</b></div>
        <div class="chip"><small>Trailers</small><b id="hTrucks">0</b></div>
        <div class="chip"><small>Safety</small><b id="hSafe">✅</b></div>
    </div>
    <div class="hudBot rushBot" id="wvBot"></div>`;
    wvHudUpdate(true);
}
let wvHudKey = '';
function wvHudUpdate(force)
{
    const sim = waveView.sim; if (!sim || !waveView.active) return;
    const set = (id, v)=> { const e = document.getElementById(id); if (e && e.innerHTML !== String(v)) e.innerHTML = v; };
    set('hClock', sim.phase === 'setup' ? '06:00' : sim.clock());
    const pe = document.getElementById('hProg'); if (pe) pe.style.width = (Math.min(1, sim.t / SHIFT_SECONDS) * 100) + '%';
    const nw = sim.nextWave();
    set('hWave', sim.phase === 'setup' ? 'SET-UP' : sim.phase === 'overtime' ? 'OVERTIME' : sim.waveIdx < 0 ? `WAVE 1 in ${Math.ceil(nw.start - sim.t)}s` : `WAVE ${sim.waveIdx + 1}/${sim.waves.length}`);
    set('hShip', fmtUnits(sim.stats.despatched * sim.ppb)); set('hTgt', '/' + fmtUnits(sim.forecast.target));
    const se = document.getElementById('hShip'); if (se) se.className = sim.stats.despatched * sim.ppb >= sim.forecast.target ? 'pos' : '';
    const st = sim.stars; set('hStars', `<span class="stars">${'★'.repeat(Math.floor(st))}${st % 1 ? '½' : ''}<i>${'★'.repeat(5 - Math.ceil(st))}</i></span>`);
    set('hTrucks', `${sim.stats.fullTrailers}<small>/${sim.stats.fullTrailers + sim.stats.partTrailers}</small>`);
    set('hSafe', sim.stats.injuries.length ? `🚑${sim.stats.injuries.length}` : sim.stats.nearMisses ? `⚠️${sim.stats.nearMisses}` : '✅');
    // bottom bar rebuilds only when its state changes
    const lull = sim.phase === 'live' && nw && (sim.waveIdx < 0 || sim.t > sim.wave.end);
    const key = [sim.phase, waveView.paused, waveView.speed, sim.brewT > 0 ? Math.ceil(sim.brewT / 5) : 0, sim.agencyCalls, lull ? Math.ceil((nw.start - sim.t) / 2) : 0].join('|');
    if (!force && key === wvHudKey) return;
    wvHudKey = key;
    const bot = document.getElementById('wvBot'); if (!bot) return;
    if (sim.phase === 'setup')
    {
        const unrouted = sim.clients.filter(cl => !sim.lineOf(cl.key)).length;
        bot.innerHTML = `<div class="wvHint">${unrouted ? `Drag zones into place · drag people into seats · draw a route from <b>GOODS IN</b> through the zones to each client's door (${unrouted} to go)` : 'All clients routed. Put operatives on routes, then open up.'}</div>
            <div class="seg"><button data-act="wvAuto">🪄 Suggest</button><button class="primary" data-act="wvOpen">🚪 Open the doors</button><button data-act="wvHelp">❓</button></div>`;
        return;
    }
    const preview = lull ? `<div class="wvNext"><b>Next: wave ${sim.waveIdx + 2}</b> in ${Math.max(0, Math.ceil(nw.start - sim.t))}s · ${Object.entries(nw.byClient).map(([k, v])=> `<i style="--c:${WV_CLIENTS.find(c => c.key === k).hex}">${v}</i>`).join('')}${nw.heavy ? ` · 🪵${nw.heavy}` : ''}<button data-act="wvEarly">⏩ Bring it on</button></div>` : '';
    bot.innerHTML = `${preview}
        <div class="seg">
            <button data-act="wvPause">${waveView.paused ? '▶' : '❚❚'}</button>
            <button data-act="wvSpeed" data-s="1" class="${waveView.speed === 1 ? 'on' : ''}">1x</button>
            <button data-act="wvSpeed" data-s="2" class="${waveView.speed === 2 ? 'on' : ''}">2x</button>
            <button data-act="wvSpeed" data-s="3" class="${waveView.speed === 3 ? 'on' : ''}">3x</button>
            <button data-act="wvBrew" ${sim.brewT > 0 ? 'disabled' : ''} title="Brew round: everyone stops for a cuppa, moods up">☕${sim.brewT > 0 ? ' ' + Math.ceil(sim.brewT) : ''}</button>
            <button data-act="wvAgency" ${sim.agencyCalls >= 2 ? 'disabled' : ''} title="Call the agency: 2 temps, £90 each">📞${2 - sim.agencyCalls}</button>
            <button data-act="wvHelp">❓</button>
        </div>`;
}
function wvOvertimeModal(left, cost)
{
    const sim = waveView.sim;
    const pay = sim.workers.filter(w => !w.temp && !w.gone && !w.injured);
    const avgPay = pay.reduce((a, w)=> a + w.pay, 0) / Math.max(1, pay.length);
    const mood = avgPay >= 1.1 ? 'Well paid crew: they\'ll grumble, then graft.' : avgPay >= .95 ? 'Fair pay: expect some moaning.' : 'Underpaid crew: some will refuse, the rest will be fuming.';
    openModal(`<div class="upgr">
        <img class="pix" src="${pixelTextURL('DESPATCH CUT-OFF', 'red', 26)}" alt="Cut-off">
        <p><b>${left} boxes</b> are still on the floor and the trailers have gone.</p>
        <p class="small">${mood}</p>
        <div class="upCards">
            <button class="upCard" data-act="wvOT" data-y="1"><span>⏱️</span><b>Ask for overtime</b><small>1 hour at time-and-a-half (≈${wmMoney(cost)}). Late collections come for what's left.</small></button>
            <button class="upCard" data-act="wvOT" data-y="0"><span>🏠</span><b>Clock off</b><small>It carries over to tomorrow. Clients won't be happy.</small></button>
        </div></div>`, true);
    playSfx('horn', .9, .7);
}
function wvHelp()
{
    waveView.paused = true;
    openModal(`<div class="upgr"><img class="pix" src="${pixelTextURL('RUNNING THE SHIFT', 'blue', 24)}" alt="How to play">
        <ol class="howto">
            <li><b>Set-up.</b> Drag your team <b>zones</b> anywhere on the floor (they're fixed once the doors open). Drag specialists into zone seats and a licensed driver onto each <b>forklift</b>. Everyone else is a general <b>operative</b>.</li>
            <li><b>Routes.</b> Every box is colour-coded to a client. Drag one route per client from <b>GOODS IN</b> through the zones its goods need, in order, to that client's <b>door</b>. Skip a zone and the boxes go out wrong.</li>
            <li><b>Waves.</b> Trailers arrive in waves until despatch cut-off. Between waves it stays ticking over. Hit ⏩ to bring the next wave early for a bonus.</li>
            <li><b>Direct your people.</b> Operatives carry light boxes along routes, forklifts shift heavy pallets 🪵 fast. Left alone they're on autopilot (grey dot): slow, and they skive. Drag them onto a route to get them grafting. Where routes cross, forklifts and walkers meet: <b>tap ⚠️</b> to stop the truck.</li>
            <li><b>Stacks topple.</b> Piles build into pyramids. Tap a wobbling stack to restack it. If it goes over, tap the mess to send someone to clear it.</li>
            <li><b>Moods.</b> Staff and drivers have moods. Specialists hate a rammed zone going nowhere. ☕ a brew round helps. 📞 agency temps help (at a price). Fill trailers before their drivers lose patience.</li>
            <li><b>Cut-off.</b> Anything left is overtime or tomorrow's problem. Good pay makes overtime easier.</li>
        </ol>
        <div class="btnrow"><button class="primary big" data-act="wvHelpClose">Got it</button></div></div>`, true);
}
WM_ACTIONS.wvOpen = ()=>
{
    const sim = waveView.sim;
    const missing = sim.clients.filter(cl => !sim.lineOf(cl.key));
    if (missing.length && !waveView.confirmOpen) { waveView.confirmOpen = true; hudToast(`⚠️ No route yet for ${missing.map(c => c.name).join(', ')} — tap Open again to start anyway`, '#f97316'); return; }
    waveView.confirmOpen = false;
    sim.open(); wvHudUpdate(true);
};
WM_ACTIONS.wvAuto = ()=> { const sim = waveView.sim; sim.suggestLayout(); sim.autoCrew(); sim.recompute(); playSfx('perfect', .7); hudToast('🪄 Zones and crew set out. Now draw a route for each client.', '#38bdf8'); wvHudUpdate(true); };
WM_ACTIONS.wvPause = ()=> { waveView.paused = !waveView.paused; playSfx('tick'); wvHudUpdate(true); };
WM_ACTIONS.wvSpeed = (a)=> { waveView.speed = +a.dataset.s; waveView.paused = false; wvHudUpdate(true); };
WM_ACTIONS.wvBrew = ()=> { if (waveView.sim.brewRound()) wvHudUpdate(true); };
WM_ACTIONS.wvAgency = ()=> { if (waveView.sim.callAgency()) wvHudUpdate(true); };
WM_ACTIONS.wvEarly = ()=> { waveView.sim.sendEarly(); wvHudUpdate(true); };
WM_ACTIONS.wvHelp = ()=> wvHelp();
WM_ACTIONS.wvHelpClose = ()=> { closeModal(); waveView.paused = false; career.flags.waveHelpSeen = true; };
WM_ACTIONS.wvOT = (a)=> { closeModal(); waveView.paused = false; waveView.sim.overtime(a.dataset.y === '1'); wvHudUpdate(true); };

Object.assign(COACH_TIPS,
{
    wvDraw:      'Keep dragging through the zones this client needs, in order, and finish on their door. Drag back over the last stop to undo.',
    wvRoute:     'That route misses a zone the client needs. Check the job ticket: every box must visit each team on its list before its door.',
    wvMisSend:   'A box went out without all its processing. That\'s a mis-send: a chargeback and a hit to your star rating.',
    wvAuto:      'Grey dot = autopilot. Nobody\'s told them what to do, so they wander and skive. Drag them onto a route.',
    wvWobble:    'That stack is wobbling! Tap it to restack before it goes over. Better still, get more hands on that route.',
    wvSpill:     'Boxes everywhere and the route is blocked. Tap the mess to send the nearest operative to clear it.',
    wvBreakdown: 'Tap the broken forklift. An engineer fixes it fast; otherwise it\'s a contractor call-out.',
    wvMood:      'Moods matter. A rammed zone that isn\'t moving cheeses specialists off. Brew rounds, breaks and decent pay keep them grafting.',
});
