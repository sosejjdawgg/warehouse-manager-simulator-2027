'use strict';
// ============================================================================
// RushView — renders a RushSim Mini-Metro-clean and lets you draw conveyors,
// drag crew, tap jams and warnings. Portrait screens rotate the floor 90°.
// ============================================================================

const RV_BOUNDS = { minX:-18.5, maxX:18.5, minY:-12.4, maxY:9.8 };
const RV_BREAK = { x:0, y:-11, w:32, h:2.4 };

const rushView =
{
    sim:null, active:false, paused:false, speed:1, portrait:false,
    bubbles:[], vis:{}, drag:null, draw:null, hover:null, vignette:0, finishing:false, shake:0,

    start(sim)
    {
        this.sim = sim; this.active = true; this.paused = false; this.speed = 1; this.finishing = false;
        this.bubbles = []; this.vis = {}; this.drag = null; this.draw = null; this.vignette = 0; this.lastCombo = 0;
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
        const b = RV_BOUNDS, c = this.T({ x:(b.minX + b.maxX) / 2, y:(b.minY + b.maxY) / 2 });
        const sz = vec2(b.maxX - b.minX, b.maxY - b.minY);
        this.bounds = { center:c, size: portrait ? vec2(sz.y, sz.x) : sz };
    },
    slotPos(n, i)
    {
        if (n.type === 'bench') return { x:n.x + (i ? 1.75 : -1.75), y:n.y + .1 };
        if (n.type === 'cage') return { x:n.x + 1.9, y:n.y };
        if (n.type === 'door') return { x:n.x - 1.9, y:n.y - .2 };
        return { x:n.x, y:n.y };
    },
    workerTarget(w)
    {
        if (w.slot) { const n = this.sim.node(w.slot.node); if (n) return this.slotPos(n, w.slot.i); }
        const idle = this.sim.workers.filter(o => !o.slot && !o.injured);
        const i = idle.indexOf(w), n = Math.max(1, idle.length);
        return { x: RV_BREAK.x - RV_BREAK.w / 2 + 1.5 + (n === 1 ? 0 : i * Math.min(1.6, (RV_BREAK.w - 3) / (n - 1))), y: RV_BREAK.y - .2 };
    },
    nodeAt(p, r = 1.5) { let best = null, bd = r; for (const n of this.sim.nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = n; } } return best; },

    bubble(text, lp, color = '#fff', size = .55, life = 1.3) { if (this.bubbles.length < 50) this.bubbles.push(new WmBubble(text, this.T(lp), color, size, life)); },

    // ---------------------------------------------------------------- events
    onEvent(type, d)
    {
        const sim = this.sim;
        switch (type)
        {
            case 'loaded':
            {
                if (Math.random() < .5) this.bubble('+' + RUSH_SCALE * UNITS_PER_PARCEL, { x:d.n.x + 2.4, y:d.n.y + 1.2 }, '#7ed957', .45, .9);
                playSfx('ship', .55, 1 + Math.min(.5, d.combo * .02), .05);
                if (d.combo >= 5 && d.combo % 5 === 0 && d.combo > this.lastCombo)
                {
                    this.lastCombo = d.combo;
                    callout(`COMBO x${d.combo}!`, d.combo >= 20 ? 'rainbow' : d.combo >= 10 ? 'gold' : 'blue', { size:.75, hold:.6, sub: d.combo >= 10 ? 'Keep the trucks rolling!' : '' });
                }
                break;
            }
            case 'truckOut':
                if (d.full) { this.bubble('FULL TRUCK!', { x:d.n.x + 2.4, y:d.n.y + 1.6 }, '#ffd23f', .6, 1.4); playSfx('horn', .8, 1.2); particleEffect('confetti', this.T({ x:d.n.x + 2.4, y:d.n.y }), { scale:1 }); }
                else if (d.load < 4) { this.bubble('HALF-EMPTY!', { x:d.n.x + 2.4, y:d.n.y + 1.6 }, '#ff6b6b', .55, 1.4); playSfx('flowDown', .6); }
                else { this.bubble('Departed', { x:d.n.x + 2.4, y:d.n.y + 1.6 }, '#e2e8f0', .45, 1); playSfx('horn', .4); }
                if (sim.stats.fullTrucks && sim.stats.fullTrucks % 5 === 0 && d.full) callout(`${sim.stats.fullTrucks} FULL TRUCKS!`, 'green', { size:.8, hold:.7 });
                break;
            case 'truckIn': playSfx('tick', .5, .8); break;
            case 'packed': playSfx('scan', .7, 1 + Math.random() * .2, .06); if (Math.random() < .08) shiftBark(d.w, 'perfect'); break;
            case 'nodeOpen':
                if (!this.active) break;
                if (d.n.type === 'door') callout(`NEW DOOR: ${d.n.door.name}`, 'gold', { size:.75, sub:`${d.n.door.key.toUpperCase()} parcels are coming — connect it!` });
                else if (d.n.type === 'cage') callout('HAZMAT CAGE OPEN', 'purple', { size:.75, sub:'☣ parcels must pass through the cage first' });
                else if (d.n.type === 'dock') callout('NEW DOCK!', 'blue', { size:.75, sub:'More trucks inbound — link it up' });
                else if (d.n.type === 'bench') callout('NEW PACK BENCH', 'green', { size:.7 });
                particleEffect('sparkle', this.T(d.n), { scale:1.4, emitTime:.4 });
                break;
            case 'overflow': this.bubble('OVERFLOWING!', { x:d.n.x, y:d.n.y + 2 }, '#ff6b6b', .55, 1.6); playSfx('buzz', .8); coachTip('rushOverflow'); break;
            case 'noRoute':
            {
                const d0 = RUSH_DOORS.find(x => x.key === d.k);
                const what = d0 ? `${d0.name} ${({ tri:'▲', circle:'●', square:'■', star:'★', diamond:'◆' })[d0.shape]}` : d.k === 'haz' ? 'the HAZMAT cage ☣' : 'a PACK bench';
                this.bubble(`NO ROUTE TO ${what}!`, { x:d.n.x, y:d.n.y + 2.4 }, '#ff6b6b', .5, 2.2);
                playSfx('buzz', .5, 1.4); coachTip('rushRoute');
                break;
            }
            case 'gridlock': callout('GRIDLOCK!', 'red', { sub:'The floor has seized up. Shift over.', hold:1.6 }); playSfx('crash', 1, .6); addScreenShake(.6, .8); break;
            case 'jam': this.bubble('JAM! tap it', this.runnerPos(d.l, d.r), '#ff8a3d', .5, 1.4); playSfx('clank', .9); coachTip('rushJam'); break;
            case 'jamCleared': playSfx('repaired', .7); break;
            case 'lineNew': playSfx('perfect', .7, 1.2); break;
            case 'noBridge': hudToast('🌉 No bridges left to cross the forklift road!', '#ef4444'); playSfx('buzz', .8); break;
            case 'assign':
            {
                const p = this.slotPos(d.n, d.w.slot.i);
                if (d.match) { this.bubble('COLOUR MATCH!', { x:p.x, y:p.y + 1.8 }, ZONE_DEFS[bestZone(d.w.s)].hex, .5, 1.3); playSfx('perfect', .6, 1.3); }
                shiftBark(d.w, 'moved');
                break;
            }
            case 'incident':
                playSfx('warn', .9); playSfx('ominous', .5);
                if (d.inc.type === 'strike') { playSfx('horn', 1, 1.6); hudToast(`🚜 ${d.w.s.name} is crossing the forklift road — TAP!`, '#ef4444'); }
                else hudToast(`⚠️ Stack wobbling over ${d.w.s.name} — TAP the warning!`, '#facc15');
                coachTip('incident');
                break;
            case 'avoided':
            {
                const p = this.workerTarget(d.w);
                this.bubble(d.inc.type === 'strike' ? 'EMERGENCY STOP!' : 'STACK SECURED!', { x:p.x, y:p.y + 2 }, '#4ade80', .55, 1.4);
                playSfx('saved', .9);
                if (Math.random() < .5) callout(pickOne(['NICE SAVE!', 'NOT TODAY!', 'GREAT CATCH!']), 'green', { size:.7, hold:.5 });
                shiftBark(d.w, 'saved');
                break;
            }
            case 'nearMiss': { const p = this.workerTarget(d.w); this.bubble('Near miss!', { x:p.x, y:p.y + 1.8 }, '#fde68a', .5); playSfx('glass', .5); break; }
            case 'injury':
            {
                const p = this.workerTarget(d.w);
                this.bubble(d.inj.fatal ? 'FATALITY' : d.inj.serious ? 'MAN DOWN!' : 'Injury', { x:p.x, y:p.y + 2 }, '#ef4444', .8, 2.4);
                particleEffect(d.inj.serious ? 'debris' : 'hit', this.T(p), { scale:1.2 });
                addScreenShake(d.inj.serious ? .5 : .25, .6); this.vignette = d.inj.serious ? 1.6 : .9;
                playSfx('crash', 1); playSfx('ominous', 1);
                if (d.inj.fatal) { callout('FATALITY', 'silver', { sub:`${d.w.s.name} was ${d.inj.cause}`, hold:2.2 }); this.paused = true; setTimeout(()=> { this.paused = false; }, 2600); hudToast(`🕯️ ${d.w.s.name} has died.`, '#ef4444'); }
                else if (d.inj.serious) callout('MAN DOWN!', 'red', { sub:`${d.w.s.name} — ${d.inj.label}` });
                else hudToast(`🚑 ${d.w.s.name} injured (${d.inj.label})`, '#ef4444');
                if (typeof hudAccident === 'function') hudAccident();
                break;
            }
            case 'upgrade': this.paused = true; rushUpgradeModal(d.choices, d.hour); break;
            case 'upgraded': this.paused = false; playSfx('fanfare', .7, 1.2); break;
            case 'finish': if (!sim.stats.collapse) callout('SHIFT OVER!', sim.stats.delivered * RUSH_SCALE >= sim.forecast.target ? 'gold' : 'blue', { sub:`${fmtUnits(sim.stats.delivered * RUSH_SCALE)} units shipped` }); break;
        }
    },
    runnerPos(l, r)
    {
        const a = this.sim.node(l.path[r.seg]), b = this.sim.node(l.path[r.seg + 1]);
        if (!a || !b) return { x:0, y:0 };
        return { x:a.x + (b.x - a.x) * r.t, y:a.y + (b.y - a.y) * r.t };
    },

    // ---------------------------------------------------------------- update
    update()
    {
        if (!this.active || !this.sim) return;
        this.layout();
        const dtReal = 1 / 60;
        const top = Math.min(84, mainCanvasSize.y * .12), bottom = Math.min(118, mainCanvasSize.y * .18);
        cameraFit(this.bounds.center, this.bounds.size, .3, { top, bottom, left:4, right:4 });
        this.handleInput();
        calloutUpdate(dtReal);
        if (!this.paused && !this.sim.pendingUpgrade && !this.sim.done)
            for (let i = 0; i < this.speed && !this.sim.done && !this.sim.pendingUpgrade; i++) this.sim.step(dtReal);
        if (this.sim.done && !this.finishing) { this.finishing = true; hudShiftFinished(); }
        for (const w of this.sim.workers)
        {
            const v = this.vis[w.id] || (this.vis[w.id] = { pos:this.workerTarget(w), face:1 });
            if (this.drag?.w === w) continue;
            const t = this.workerTarget(w);
            const before = v.pos.x;
            v.pos = { x: v.pos.x + (t.x - v.pos.x) * .14, y: v.pos.y + (t.y - v.pos.y) * .14 };
            v.moving = Math.abs(t.x - v.pos.x) + Math.abs(t.y - v.pos.y) > .08;
            if (Math.abs(v.pos.x - before) > .01) v.face = v.pos.x > before ? 1 : -1;
        }
        this.bubbles = this.bubbles.filter(b => b.update(dtReal));
        this.vignette = Math.max(0, this.vignette - dtReal);
        for (const b of wmShiftBarks) b.t += dtReal;
        wmShiftBarks.splice(0, wmShiftBarks.length, ...wmShiftBarks.filter(b => b.t < 2));
        rushHudUpdate();
    },

    handleInput()
    {
        const sim = this.sim, mp = this.Ti(mousePos);
        if (mouseWasPressed(0) && wmPointerOnCanvas)
        {
            // 1. incident warnings (generous targets)
            for (const inc of sim.incidents)
            {
                if (inc.done) continue;
                const p = this.vis[inc.w.id]?.pos || this.workerTarget(inc.w);
                if (Math.hypot(mp.x - p.x, mp.y - (p.y + 2.2)) < 1.7 || Math.hypot(mp.x - p.x, mp.y - p.y) < 1) { sim.intervene(inc); return; }
            }
            // 2. jammed runners
            for (const l of sim.lines) for (const r of l.runners) if (r.jam) { const p = this.runnerPos(l, r); if (Math.hypot(mp.x - p.x, mp.y - p.y) < 1.4) { sim.clearJam(r); return; } }
            // 3. crew
            for (const w of sim.workers)
            {
                if (w.injured) continue;
                const p = this.vis[w.id]?.pos; if (!p) continue;
                if (Math.hypot(mp.x - p.x, mp.y - (p.y + .3)) < .9) { this.drag = { w, start:mousePosScreen.copy() }; playSfx('pick'); return; }
            }
            // 4. nodes: start or extend a conveyor line
            const n = this.nodeAt(mp, 1.5);
            if (n)
            {
                const end = [...sim.lines].reverse().find(l => l.path[0] === n.id || l.path[l.path.length - 1] === n.id);
                if (end) this.draw = { line:end, path:[...end.path], atHead: end.path[0] === n.id && end.path[end.path.length - 1] !== n.id };
                else if (sim.lineFree() > 0) this.draw = { line:null, path:[n.id], atHead:false };
                else { hudToast('〰️ No free conveyor lines — remove one (✕) or wait for an upgrade', '#f97316'); playSfx('buzz', .6); }
                if (this.draw) { playSfx('pick', .8, 1.3); coachTip('rushDraw'); }
            }
        }
        if (this.draw)
        {
            const d = this.draw, n = this.nodeAt(mp, 1.25);
            const endId = d.atHead ? d.path[0] : d.path[d.path.length - 1];
            const prevId = d.atHead ? d.path[1] : d.path[d.path.length - 2];
            if (n && n.id !== endId)
            {
                if (n.id === prevId) { d.atHead ? d.path.shift() : d.path.pop(); playSfx('tick', .7); }
                else if (!d.path.includes(n.id)) { d.atHead ? d.path.unshift(n.id) : d.path.push(n.id); playSfx('tick', 1, 1.5); }
            }
            d.cursor = mp;
            if (!mouseIsDown(0))
            {
                if (d.path.length >= 2 && (!d.line || d.path.join() !== d.line.path.join())) sim.commitLine({ id:d.line?.id, path:d.path });
                this.draw = null;
                rushHudLines();
            }
        }
        if (this.drag)
        {
            const v = this.vis[this.drag.w.id];
            v.pos = { x:mp.x, y:mp.y - .4 };
            if (!mouseIsDown(0))
            {
                const w = this.drag.w; this.drag = null;
                const n = this.nodeAt(mp, 2.2);
                const inBreak = Math.abs(mp.x - RV_BREAK.x) < RV_BREAK.w / 2 && Math.abs(mp.y - RV_BREAK.y) < RV_BREAK.h / 2 + .6;
                if (n && n.slots.length)
                {
                    let i = n.slots.findIndex(x => !x);
                    if (i < 0) i = n.slots.length > 1 && Math.hypot(mp.x - this.slotPos(n, 1).x, mp.y - this.slotPos(n, 1).y) < Math.hypot(mp.x - this.slotPos(n, 0).x, mp.y - this.slotPos(n, 0).y) ? 1 : 0;
                    sim.assign(w, n, i); playSfx('drop');
                }
                else if (inBreak) { sim.assign(w, null); playSfx('drop', .8, .8); this.bubble('Break ☕', { x:mp.x, y:mp.y + 1 }, '#e2e8f0', .45); }
                else playSfx('tick');
            }
        }
    },

    // ---------------------------------------------------------------- render
    render()
    {
        if (!this.active) return;
        const sim = this.sim, T = timeReal;
        const ctx = NX.world();
        if (this.portrait) ctx.rotate(-Math.PI / 2); // draw in logical space; world = rotate(logical)
        const b = RV_BOUNDS;
        // floor
        NX.rr(ctx, 0, (b.minY + b.maxY) / 2 - .25, b.maxX - b.minX + .6, b.maxY - b.minY + .6, 1, '#6c7a96', null, 0);
        NX.rr(ctx, 0, (b.minY + b.maxY) / 2, b.maxX - b.minX + .6, b.maxY - b.minY + .6, 1, '#f6f1e6', NX.O, .2);
        ctx.strokeStyle = 'rgba(160,130,90,.10)'; ctx.lineWidth = .05; ctx.beginPath();
        for (let x = Math.ceil(b.minX); x < b.maxX; x += 2) { ctx.moveTo(x, b.minY); ctx.lineTo(x, b.maxY); }
        for (let y = Math.ceil(b.minY); y < b.maxY; y += 2) { ctx.moveTo(b.minX, y); ctx.lineTo(b.maxX, y); }
        ctx.stroke();
        // forklift road
        const rx = RUSH_ROAD_X, rw = RUSH_ROAD_W;
        NX.rr(ctx, rx, -1, rw, 19.4, .2, '#5d6b82', NX.O, .1);
        for (const sx of [-1, 1]) NX.rr(ctx, rx + sx * (rw / 2 - .15), -1, .1, 19, 0, '#ffd23f', null, 0);
        for (let y = -10; y < 8.5; y += 1.6) NX.rr(ctx, rx, y, .08, .7, 0, 'rgba(255,255,255,.5)', null, 0);
        for (let k = 0; k < 2; k++)
        {
            const y = ((T * 2.2 * (k ? -1 : 1) + k * 9) % 19 + 19) % 19 - 10.2;
            ctx.save(); ctx.translate(rx + (k ? .55 : -.55), y); ctx.rotate(k ? -Math.PI / 2 : Math.PI / 2);
            NX.rr(ctx, 0, 0, 1.2, .8, .25, '#ffc83d', NX.O, .09); NX.rr(ctx, .62, 0, .5, .14, .04, '#9ca3af', null, 0); NX.circ(ctx, -.25, 0, .14, Math.sin(T * 9 + k) > 0 ? '#ffae00' : '#a14d00');
            ctx.restore();
        }
        // break room
        NX.rr(ctx, RV_BREAK.x, RV_BREAK.y - .15, RV_BREAK.w, RV_BREAK.h, .6, NX.SHADOW, null, 0);
        NX.rr(ctx, RV_BREAK.x, RV_BREAK.y, RV_BREAK.w, RV_BREAK.h, .6, '#ffe1a8', NX.O, .14);
        // conveyor lines
        const L = sim.lines.length;
        const segOff = (li, a, c)=> { const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1, o = (li - (L - 1) / 2) * .3; return { ox:-dy / len * o, oy:dx / len * o }; };
        sim.lines.forEach((l, li)=>
        {
            const pts = l.path.map(id => sim.node(id));
            for (let i = 0; i < pts.length - 1; i++)
            {
                const a = pts[i], c = pts[i + 1], { ox, oy } = segOff(li, a, c);
                if (sim.segCrosses(a, c))
                {
                    const t0 = (rx - rw / 2 - .3 - a.x) / (c.x - a.x), t1 = (rx + rw / 2 + .3 - a.x) / (c.x - a.x);
                    const p0 = { x:a.x + (c.x - a.x) * t0, y:a.y + (c.y - a.y) * t0 }, p1 = { x:a.x + (c.x - a.x) * t1, y:a.y + (c.y - a.y) * t1 };
                    NX.line(ctx, p0.x + ox, p0.y + oy, p1.x + ox, p1.y + oy, .95, NX.O);
                    NX.line(ctx, p0.x + ox, p0.y + oy, p1.x + ox, p1.y + oy, .78, '#d6dbe6');
                }
                NX.line(ctx, a.x + ox, a.y + oy, c.x + ox, c.y + oy, .5, l.color);
            }
            // T-shaped end caps
            for (const [e, f] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]])
            {
                const dx = e.x - f.x, dy = e.y - f.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, { ox, oy } = segOff(li, f, e);
                const ex = e.x + ux * 1.1 + ox, ey = e.y + uy * 1.1 + oy;
                NX.line(ctx, e.x + ox, e.y + oy, ex, ey, .5, l.color);
                NX.line(ctx, ex - uy * .45, ey + ux * .45, ex + uy * .45, ey - ux * .45, .5, l.color);
            }
        });
        // line being drawn
        if (this.draw)
        {
            const d = this.draw, pts = d.path.map(id => sim.node(id));
            const col = d.line ? d.line.color : RUSH_LINE_COLORS.find(c => !sim.lines.map(l => l.color).includes(c)) || '#444';
            ctx.globalAlpha = .75;
            for (let i = 0; i < pts.length - 1; i++) NX.line(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, .5, col);
            const endN = d.atHead ? pts[0] : pts[pts.length - 1];
            if (d.cursor) { ctx.setLineDash([.4, .3]); NX.line(ctx, endN.x, endN.y, d.cursor.x, d.cursor.y, .4, col); ctx.setLineDash([]); }
            ctx.globalAlpha = 1;
        }
        // nodes
        for (const n of sim.nodes) this.drawNode(ctx, n, T);
        // runners
        sim.lines.forEach((l, li)=>
        {
            for (const r of l.runners)
            {
                const a = sim.node(l.path[r.seg]), c = sim.node(l.path[r.seg + 1]);
                if (!a || !c) continue;
                const p = this.runnerPos(l, r), { ox, oy } = segOff(li, a, c), ang = Math.atan2(c.y - a.y, c.x - a.x);
                ctx.save(); ctx.translate(p.x + ox, p.y + oy); ctx.rotate(ang);
                NX.rr(ctx, 0, 0, 1.5, .78, .2, l.color, NX.O, .09);
                NX.rr(ctx, 0, 0, 1.24, .52, .12, '#ffffff', null, 0);
                r.load.slice(0, 8).forEach((q, k)=> this.parcel(ctx, -.44 + (k % 4) * .29, k < 4 ? .12 : -.12, .22, q));
                ctx.restore();
                if (r.jam) { const pulse = .5 + .5 * Math.sin(T * 12); NX.circ(ctx, p.x, p.y + 1, .62 + pulse * .1, '#ff8a3d', NX.O, .1); NX.rr(ctx, p.x, p.y + 1.1, .14, .44, .07, NX.O, null, 0); NX.circ(ctx, p.x, p.y + .75, .08, NX.O); }
            }
        });
        // crew & warnings are drawn upright (unrotated) at their transformed spots
        if (this.portrait) ctx.rotate(Math.PI / 2);
        const W = (p)=> this.T(p);
        for (const w of [...sim.workers].sort((a, c)=> (this.drag?.w === a) - (this.drag?.w === c)))
        {
            if (w.injured) continue;
            const v0 = this.vis[w.id]; if (!v0) continue;
            const v = { pos:W(v0.pos), face:v0.face, moving:v0.moving };
            const vest = w.slot ? ZONE_DEFS[sim.zoneOf(sim.node(w.slot.node)) || 'orange'].hex : '#94a3b8';
            const working = !!w.job || (w.slot && sim.node(w.slot.node)?.type === 'door' && sim.node(w.slot.node).pile.length);
            const mood = w.incident ? 'shocked' : w.energy < 25 ? 'sad' : working ? 'happy' : 'neutral';
            const bob = working ? Math.abs(Math.sin(T * 9 + w.id)) * .08 : 0;
            if (this.drag?.w === w) NX.circ(ctx, v.pos.x, v.pos.y + .3, .95, 'rgba(255,255,255,.4)', '#fff', .08);
            if (w.slot && bestZone(w.s) === sim.zoneOf(sim.node(w.slot.node))) NX.circ(ctx, v.pos.x, v.pos.y - .45, .5, NX.alpha(ZONE_DEFS[bestZone(w.s)].hex, .45));
            NX.chibi(ctx, v.pos.x, v.pos.y + bob, { look:w.s.look, vest, mood, face:v.face, step: v.moving ? Math.sin(T * 14) : 0, squash: working ? (Math.sin(T * 9 + w.id) > 0 ? .98 : .995) : 1 });
            const e = clamp(w.energy / 100, 0, 1);
            NX.rr(ctx, v.pos.x, v.pos.y - .86, .8, .12, .06, '#ffffff', NX.O, .04);
            if (e > 0) NX.rr(ctx, v.pos.x - .4 + e * .4, v.pos.y - .86, .8 * e, .12, .06, e > .5 ? '#7ed957' : e > .25 ? '#ffd23f' : '#ff4d4d', null, 0);
            if (w.job) NX.pie(ctx, v.pos.x + .55, v.pos.y + 1.05, .26, clamp(w.prog, 0, 1), '#3ec1ff');
        }
        // warnings on top
        for (const inc of sim.incidents)
        {
            if (inc.done) continue;
            const p0 = this.vis[inc.w.id]?.pos; if (!p0) continue;
            const p = W(p0);
            const left = clamp(1 - (sim.t - inc.t0) / inc.window, 0, 1), pulse = .5 + .5 * Math.sin(T * 12);
            if (inc.type === 'falling') { const lean = Math.sin(T * 6) * (.15 + (1 - left) * .3); for (let i = 0; i < 3; i++) NX.box(ctx, p.x + Math.sin(lean) * i * .8, p.y + 1.3 + i * .7, .7, '#d9a066', 0, lean * (i + 1) * .5); }
            const q = { x:p.x, y:p.y + (inc.type === 'falling' ? 3.6 : 2.2) };
            NX.circ(ctx, q.x, q.y, 1.05 + pulse * .15, `rgba(255,60,40,${.3 + pulse * .2})`);
            NX.circ(ctx, q.x, q.y, .75, '#ffd23f', NX.O, .12);
            NX.pie(ctx, q.x, q.y, .75, 1 - left, left < .35 ? 'rgba(255,40,40,.55)' : 'rgba(43,45,66,.25)');
            NX.rr(ctx, q.x, q.y + .12, .16, .52, .08, NX.O, null, 0); NX.circ(ctx, q.x, q.y - .33, .1, NX.O);
        }
        NX.done(ctx);
        this.drawLabels();
    },
    parcel(ctx, x, y, s, p)
    {
        const d = RUSH_DOORS.find(d => d.key === p.dest);
        if (p.rush) NX.circ(ctx, x, y, s * 1.15, '#ffd23f');
        rushShape(ctx, d.shape, x, y, s, p.packed ? d.hex : '#ffffff', p.packed ? NX.O : d.hex, p.packed ? s * .22 : s * .34);
        if (p.hazmat && !p.packed) NX.circ(ctx, x + s * .6, y + s * .6, s * .32, '#a855f7', NX.O, s * .1);
    },
    drawNode(ctx, n, T)
    {
        const sim = this.sim;
        // overflow ring
        if (n.over > 0) { const pulse = .5 + .5 * Math.sin(T * 10); NX.circ(ctx, n.x, n.y, 2.1 + pulse * .15, `rgba(255,60,60,${.15 + pulse * .15})`); NX.pie(ctx, n.x, n.y, 2, n.over, 'rgba(229,56,59,.55)'); }
        if (this.draw && this.nodeAt(this.Ti(mousePos), 1.25) === n) NX.circ(ctx, n.x, n.y, 1.7, 'rgba(255,255,255,.6)', '#fff', .1);
        if (n.type === 'dock')
        {
            NX.rr(ctx, n.x - 1.6, n.y, 1.2, 2.6, .3, '#3ec1ff', NX.O, .1);
            NX.rr(ctx, n.x, n.y - .1, 2.2, 2.4, .35, NX.SHADOW, null, 0);
            NX.rr(ctx, n.x, n.y, 2.2, 2.4, .35, '#4b5875', NX.O, .14);
            for (let i = -1; i <= 1; i++) NX.rr(ctx, n.x, n.y + i * .62, 1.6, .38, .08, '#9fb0cc', NX.O, .05);
        }
        else if (n.type === 'bench')
        {
            NX.rr(ctx, n.x, n.y - .12, 2.6, 1.5, .4, NX.SHADOW, null, 0);
            NX.rr(ctx, n.x, n.y, 2.6, 1.5, .4, '#ff8a1f', NX.O, .14);
            NX.rr(ctx, n.x, n.y + .1, 2.1, .9, .2, '#ffd9a8', null, 0);
            for (let i = 0; i < Math.min(n.queue.length, 4); i++) this.parcel(ctx, n.x - .75 + i * .5, n.y + .1, .2, n.queue[i]);
        }
        else if (n.type === 'cage')
        {
            NX.rr(ctx, n.x, n.y, 2.6, 2, .3, '#efe2ff', '#a855f7', .16);
            for (let i = -1; i <= 1; i++) NX.line(ctx, n.x + i * .7, n.y - .95, n.x + i * .7, n.y + .95, .06, '#a855f7');
            for (let i = 0; i < Math.min(n.queue.length, 4); i++) this.parcel(ctx, n.x - .75 + i * .5, n.y, .2, n.queue[i]);
        }
        else if (n.type === 'sorter')
        {
            NX.circ(ctx, n.x, n.y, .95, '#ffffff', NX.O, .16);
            NX.circ(ctx, n.x, n.y, .45, '#cbd5e1', NX.O, .08);
        }
        else if (n.type === 'door')
        {
            const d = n.door, tr = n.truck;
            // truck outside the door
            const tx = n.x + 2.5;
            if (tr.away <= 0)
            {
                NX.rr(ctx, tx, n.y, 2.4, 1.5, .25, '#ffffff', NX.O, .1);
                NX.rr(ctx, tx - .1, n.y - .55, 2 * (tr.load / tr.cap), .22, .08, d.hex, null, 0);
                NX.pie(ctx, tx + 1.5, n.y + .95, .3, tr.left / tr.patience, tr.left / tr.patience < .3 ? '#ff4d4d' : '#7ed957');
                NX.circ(ctx, tx + 1.5, n.y + .95, .3, null, NX.O, .06);
            }
            rushShape(ctx, d.shape, n.x, n.y, 1.15, '#ffffff', d.hex, .3);
            rushShape(ctx, d.shape, n.x, n.y, .6, d.hex, null, 0);
        }
        // waiting pile (Mini Metro passengers)
        const pile = n.pile, max = 14;
        const ox = n.type === 'door' ? -1.3 : n.type === 'dock' ? .4 : -1.1, oy = n.type === 'door' ? 1.55 : 1.55;
        for (let i = 0; i < Math.min(pile.length, max); i++) this.parcel(ctx, n.x + ox + (i % 7) * .48, n.y + oy + Math.floor(i / 7) * .48, .2, pile[i]);
        // "no route" badges: the network can't carry these parcels anywhere useful
        if (n.noRoute?.length && n.pile.length)
        {
            const pulse = .5 + .5 * Math.sin(T * 8);
            n.noRoute.slice(0, 3).forEach((k, i)=>
            {
                const bx = n.x - 1.6 - i * 1, by = n.y - 1.5, d0 = RUSH_DOORS.find(x => x.key === k);
                NX.circ(ctx, bx, by, .5 + pulse * .05, '#ffffff', '#e5383b', .12);
                if (d0) rushShape(ctx, d0.shape, bx, by, .3, d0.hex, null, 0);
                else NX.rr(ctx, bx, by, .42, .42, .08, k === 'haz' ? '#a855f7' : '#ff8a1f', null, 0);
                NX.line(ctx, bx - .33, by - .33, bx + .33, by + .33, .1, '#e5383b');
            });
        }
    },
    drawLabels()
    {
        const sim = this.sim, O = wmHex(NX.O);
        const at = (p)=> this.T(p);
        // labels sit under/over things in SCREEN space, so they stay readable when the floor is rotated
        const sv = (p, dy)=> { const q = this.T(p); return vec2(q.x, q.y + dy); };
        for (const n of sim.nodes)
        {
            const cnt = n.pile.length + n.queue.length;
            if (cnt > 14) wmText('+' + (n.pile.length - 14), at({ x:n.x + 2.4, y:n.y + 1.8 }), .32, WHITE, .1, O);
            if (n.type === 'dock') wmText('IN', sv(n, -1.65), .36, WHITE, .12, O);
            if (n.type === 'bench') wmText('PACK', sv(n, -1.05), .32, WHITE, .12, O);
            if (n.type === 'cage') wmText('☣ HAZMAT', sv(n, -1.35), .32, wmHex('#7c3aed'), .1, WHITE);
            if (n.type === 'door') wmText(n.door.name, sv(n, -1.6), .32, wmHex(n.door.hex), .12, WHITE);
            if (n.type === 'door' && n.truck.away > 0) wmText('🚚💨', at({ x:n.x + 2.6, y:n.y }), .5);
        }
        if (this.portrait) wmText('☕ BREAK', at({ x:RV_BREAK.x - RV_BREAK.w / 2 - .5, y:RV_BREAK.y }), .32, WHITE, .12, O);
        else wmText('☕ BREAK ROOM — drag crew here to rest', at({ x:RV_BREAK.x - RV_BREAK.w / 2 + .4, y:RV_BREAK.y + .85 }), .32, WHITE, .12, O, 'left');
        wmText('FORKLIFT ROAD', at({ x:RUSH_ROAD_X, y:this.portrait ? 6.6 : 8.9 }), .28, wmHex('#ffd23f'), .08, O);
        for (const w of sim.workers)
        {
            if (w.injured) continue;
            const p = this.vis[w.id]?.pos; if (!p) continue;
            wmText(w.s.nickname || w.s.name.split(' ')[0], sv(p, -1.1), .26, w.temp ? wmHex('#cbd5e1') : WHITE, .1, O);
        }
        for (const b of wmShiftBarks)
        {
            const w = sim.workers.find(x => x.id === b.id), p = w && this.vis[w.id]?.pos; if (!p) continue;
            wmText(b.text, sv(p, 1.6), .3, wmHex('#2b2d42'), .14, WHITE);
        }
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
        if (this.paused && !this.sim.done && !this.sim.pendingUpgrade) drawTextScreen('PAUSED — draw lines freely', s.scale(.5), Math.min(44, s.x * .06), WHITE, 6, wmHex(NX.O));
    },
};

// shared bark list for the rush floor
const wmShiftBarks = [];
function shiftBark(w, kind)
{
    if (!w || wmShiftBarks.length > 3 || wmShiftBarks.some(b => b.id === w.id)) return;
    const text = barkLine(kind, w.s); if (text) wmShiftBarks.push({ id:w.id, text, t:0 });
}

// shapes: the destination codes
function rushShape(ctx, shape, x, y, s, fill, stroke, lw)
{
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, s, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(x - s * .88, y - s * .88, s * 1.76, s * 1.76);
    else if (shape === 'tri') { ctx.moveTo(x, y + s * 1.05); ctx.lineTo(x + s, y - s * .75); ctx.lineTo(x - s, y - s * .75); ctx.closePath(); }
    else if (shape === 'diamond') { ctx.moveTo(x, y + s * 1.1); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 1.1); ctx.lineTo(x - s, y); ctx.closePath(); }
    else if (shape === 'star') { for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * .48 : s * 1.1; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// ---------------------------------------------------------------------------
// HUD (DOM)
function buildRushHud()
{
    $('#hud').innerHTML = `
    ${safetyBoardHtml(career.records.daysSinceAccident, career.records.bestSafeRun)}
    <div class="hudTop">
        <div class="clock"><b id="hClock">06:00</b><i class="bar"><i id="hProg"></i></i></div>
        <div class="chip"><small>Shipped</small><b id="hShip">0</b><span id="hTgt"></span></div>
        <div class="chip flow"><small>Combo</small><b id="hCombo">0</b></div>
        <div class="chip"><small>Trucks</small><b id="hTrucks">0</b></div>
        <div class="chip"><small>Safety</small><b id="hSafe">✅</b></div>
    </div>
    <div class="hudBot rushBot">
        <div class="res" id="rRes"></div>
        <div class="lineChips" id="rLines"></div>
        <div class="seg">
            <button data-act="rushPause" id="bPause">⏸</button>
            <button data-act="rushSpeed" data-s="1" class="on">1x</button>
            <button data-act="rushSpeed" data-s="2">2x</button>
            <button data-act="rushSpeed" data-s="3">3x</button>
            <button data-act="rushHelp">❓</button>
        </div>
    </div>`;
    rushHudLines();
}
function rushHudLines()
{
    const sim = wmSim, el = document.getElementById('rLines');
    if (!sim || !el || !sim.lines) return;
    el.innerHTML = sim.lines.map(l => `<div class="lchip" style="--lc:${l.color}">
        <i></i><span>🛒${l.runners.length}</span>
        <button data-act="rushRunner" data-l="${l.id}" data-d="1" title="Add runner">+</button>
        <button data-act="rushRunner" data-l="${l.id}" data-d="-1" title="Remove runner">−</button>
        <button data-act="rushDelLine" data-l="${l.id}" title="Remove line">✕</button></div>`).join('') || '<span class="hint">Drag from a dock to a pack bench to a door to lay a conveyor</span>';
}
let wmRushHudLast = '';
function rushHudUpdate()
{
    const sim = wmSim;
    if (!sim || wmMode !== 'shift' || !(sim instanceof RushSim)) return;
    const set = (id, v)=> { const e = document.getElementById(id); if (e && e.innerHTML !== String(v)) { e.innerHTML = v; e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); } };
    set('hClock', sim.clock());
    const prog = document.getElementById('hProg'); if (prog) prog.style.width = clamp(sim.t / sim.duration, 0, 1) * 100 + '%';
    set('hShip', fmtUnits(sim.stats.delivered * RUSH_SCALE)); set('hTgt', '/' + fmtUnits(sim.forecast.target));
    const se = document.getElementById('hShip'); if (se) se.className = sim.stats.delivered * RUSH_SCALE >= sim.forecast.target ? 'pos' : '';
    set('hCombo', sim.stats.combo ? 'x' + sim.stats.combo : '–');
    set('hTrucks', `${sim.stats.fullTrucks}/${sim.stats.trucks}`);
    set('hSafe', sim.stats.injuries.length ? `🚑 ${sim.stats.injuries.length}` : `✅${sim.stats.avoided ? ' 🛡️' + sim.stats.avoided : ''}`);
    const res = `<span title="Free conveyor lines">〰️ ${sim.lineFree()}</span><span title="Spare tote runners">🛒 ${sim.runnersFree()}</span><span title="Road bridges left">🌉 ${Math.max(0, sim.bridgesFree())}</span>`;
    if (res !== wmRushHudLast) { wmRushHudLast = res; const r = document.getElementById('rRes'); if (r) r.innerHTML = res; }
    const key = sim.lines.map(l => l.id + ':' + l.runners.length).join();
    if (key !== rushHudUpdate.k) { rushHudUpdate.k = key; rushHudLines(); }
    const pb = document.getElementById('bPause'); if (pb) pb.textContent = rushView.paused ? '▶' : '⏸';
}
function rushUpgradeModal(choices, hour)
{
    openModal(`<div class="upgr">
        <img class="pix" src="${pixelTextURL(`${String(hour).padStart(2, '0')}:00 — NEW HOUR`, 'gold', 26)}" alt="New hour">
        <p>Pick one upgrade for the floor:</p>
        <div class="upCards">${choices.map(k => `<button class="upCard" data-act="rushPick" data-k="${k}"><span>${RUSH_UPGRADES[k].icon}</span><b>${RUSH_UPGRADES[k].title}</b><small>${RUSH_UPGRADES[k].desc}</small></button>`).join('')}</div>
    </div>`, true);
    playSfx('fanfare', .7);
}
function rushHelp()
{
    rushView.paused = true;
    openModal(`<div class="upgr"><img class="pix" src="${pixelTextURL('HOW TO RUN THE FLOOR', 'blue', 24)}" alt="How to play">
        <ol class="howto">
            <li><b>Draw conveyors.</b> Drag from a 🔵 <b>dock</b> → an 🟧 <b>PACK bench</b> → the coloured <b>doors</b>. Drag from a line's end to extend it. Lines over the forklift road use 🌉 bridges.</li>
            <li><b>Colour codes.</b> Every parcel shows its destination: <b style="color:#e5383b">▲ red</b>, <b style="color:#2f7fe8">● blue</b>, <b style="color:#2fb344">■ green</b>, <b style="color:#c99400">★ yellow</b>, <b style="color:#ff7a1a">◆ orange</b>. Hollow = still needs packing. Filled = packed. ☣ goes via the hazmat cage.</li>
            <li><b>Run the crew.</b> Drag people onto benches, the cage and door loading bays. Put a worker on their own colour for a <b>COLOUR MATCH</b> (+25% speed). Tired? Drag to the break room.</li>
            <li><b>Keep trucks happy.</b> Fill trucks before their timer runs out. Fast loads chain <b>COMBOS</b>.</li>
            <li><b>Tap</b> jammed runners and ⚠️ warnings. A node left overflowing <b>gridlocks</b> the warehouse.</li>
            <li>Every hour, choose an upgrade. New doors and stations open as the shift goes on. You can pause and redraw at any time.</li>
        </ol>
        <div class="btnrow"><button class="primary big" data-act="rushHelpClose">Let's go!</button></div></div>`, true);
}
WM_ACTIONS.rushPick = (a)=> { closeModal(); wmSim.applyUpgrade(a.dataset.k); rushHudLines(); };
WM_ACTIONS.rushPause = ()=> { rushView.paused = !rushView.paused; playSfx('tick'); };
WM_ACTIONS.rushSpeed = (a)=> { rushView.speed = +a.dataset.s; rushView.paused = false; document.querySelectorAll('[data-act=rushSpeed]').forEach(b => b.classList.toggle('on', b === a)); };
WM_ACTIONS.rushHelp = ()=> rushHelp();
WM_ACTIONS.rushHelpClose = ()=> { closeModal(); rushView.paused = false; career.flags.rushHelpSeen = true; };
WM_ACTIONS.rushRunner = (a)=>
{
    const l = wmSim.lines.find(x => x.id === +a.dataset.l); if (!l) return;
    const ok = +a.dataset.d > 0 ? wmSim.addRunner(l) : wmSim.removeRunner(l);
    if (!ok) { hudToast(+a.dataset.d > 0 ? '🛒 No spare runners — remove one from another line' : 'No runner to remove', '#f97316'); playSfx('buzz', .5); }
    else playSfx('pick');
    rushHudLines();
};
WM_ACTIONS.rushDelLine = (a)=> { const l = wmSim.lines.find(x => x.id === +a.dataset.l); if (l) { wmSim.removeLine(l); playSfx('drop', .8, .7); rushHudLines(); } };
Object.assign(COACH_TIPS,
{
    rushDraw:    'Keep dragging across stations to chain them into one line. Drag back over the last one to undo.',
    rushOverflow:'A station is overflowing! Give it its own line, more runners, or more crew — if the red ring fills, the floor gridlocks.',
    rushRoute:   'Those parcels have no way to their door! Join your lines at a shared station (a sorter is perfect) so totes can transfer between them.',
    rushJam:     'A tote runner jammed — tap it to clear the rollers.',
});
