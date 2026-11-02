'use strict';
// ============================================================================
// ShiftSim — the "match engine". Pure simulation of one shift.
// The live floor (floor.js) renders it and feeds player input; the "Simulate"
// button runs the very same model at high speed with the assistant in charge.
// ============================================================================

const LINE_SPEEDS =
{
    slow:   { label:'Careful', speed:.85, risk:.55, fatigue:.85 },
    normal: { label:'Normal',  speed:1,   risk:1,   fatigue:1 },
    push:   { label:'Push',    speed:1.18,risk:1.8, fatigue:1.3 },
};

class ShiftSim
{
    constructor(c, opts = {})
    {
        this.c = c;
        this.simulated = !!opts.simulated;
        this.assistantOn = this.simulated || !!opts.assistant;
        this.assistantQ = c.assistant.quality * (this.simulated ? .8 : 1);
        this.forecast = shiftForecast();
        this.fac = { ...c.facilities };
        this.lineSpeed = c.defaultLineSpeed || 'normal';
        this.t = 0;
        this.duration = SHIFT_SECONDS;
        this.overtimeHours = 0;
        this.done = false;
        this.listeners = [];
        this.nextPkgId = 1;
        this.nextIncId = 1;
        this.cap = 16 + this.fac.racking * 4;

        this.zones = {};
        for (const z of ZONE_KEYS) this.zones[z] = { key:z, queue:[], broken:null, pausedUntil:0, rushFirst:true, processed:0, lastBottleneck:-99, contractor:false };
        this.zones.bench = { key:'bench', queue:[] };

        this.workers = [];
        for (const s of c.staff)
        {
            const z = c.lineup[s.id];
            if (!z || s.injury) continue;
            this.workers.push({
                id:s.id, s, zone:z, at:z, benchK:1, state: z === 'bench' ? 'break' : 'idle',
                energy: s.condition, pkg:null, progress:0, walkFrom:z, path:null, pathI:0, pos:null,
                crossing:null, crossWait:0, jaywalks:0, jay:false,
                breakAt: 140 + Math.random() * 220, breakDone: z === 'bench', selfBreak:false, breakLeft:0,
                patience: (1 + s.attrs.safety * .15 + s.attrs.concentration * .1) * traitMod(s, 'patience') * (1 + this.fac.safety * .08),
                processed:0, errors:0, repairs:0, smooth:0, nearMisses:0, incident:null, injured:false,
                activeTime:0, zoneTime:{}, anim:Math.random()*10, tiredWarned:false, speedCache:1,
            });
        }

        // arrivals: 40% steady trickle, 60% in truck drops
        this.arrivalAcc = 0;
        this.returnAcc = 0;
        this.dock = Math.min(c.backlog || 0, 60); // parcels waiting at the dock doors
        const nTrucks = Math.max(4, Math.round(this.forecast.volume * .6 / 26));
        this.truckSize = Math.round(this.forecast.volume * .6 / nTrucks);
        this.truckTimes = [];
        for (let i = 0; i < nTrucks; i++) this.truckTimes.push(5 + (i + .15 + Math.random()*.7) * (SHIFT_SECONDS - 60) / nTrucks);
        this.steadyRate = this.forecast.volume * .4 / SHIFT_SECONDS;
        this.returnRate = this.forecast.returns / SHIFT_SECONDS;

        // forklift traffic on the road loop
        this.cwUsers = WH_MAP.crosswalks.map(()=> 0);
        this.forklifts = [];
        this.nextForkliftId = 1;
        const nF = 4 + c.tier;
        for (let i = 0; i < nF; i++) this.addForklift(i * WH_MAP.loopLen / nF);

        this.incidents = [];
        this.stats =
        {
            arrived:0, shipped:0, lateRush:0, rushShipped:0, defects:0, damaged:0, caught:0, returns:0,
            nearMisses:0, avoided:0, injuries:[], combo:0, flow:1, peakFlow:1, flowTimeSum:0,
            contractorCost:0, bottlenecks:0, breakdowns:0, hourly:[], interventions:0,
            jaywalks:0, crossings:0, crossWait:0, forkliftBrakes:0,
        };
        this.lastHour = 0;
        this.aiTimer = 1;
        this.riskMult = crewRisk().mult;
    }

    on(fn) { this.listeners.push(fn); }
    emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

    get hour() { return SHIFT_START_HOUR + this.t / 60; }
    clock()
    {
        const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
        return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    }
    worker(id) { return this.workers.find(w => w.id === id); }
    isWalking(w) { return w.state === 'walk' || w.state === 'waitCross'; }
    zoneWorkers(z) { return this.workers.filter(w => w.zone === z && !w.injured && !this.isWalking(w) && w.at === z); }
    crewCount(z) { return this.workers.filter(w => w.zone === z && !w.injured).length; }

    // ----------------------------------------------------------------- packages
    spawnPackage(intoZone = 'blue', forcedType = null)
    {
        let type = forcedType;
        if (!type)
        {
            let r = Math.random(), acc = 0;
            const weights = { ...Object.fromEntries(Object.entries(PACKAGE_TYPES).map(([k,v])=>[k,v.weight])) };
            weights.hazmat = this.forecast.hazmatShare;
            const total = Object.values(weights).reduce((a,b)=>a+b,0);
            r *= total;
            for (const k in weights) { acc += weights[k]; if (r <= acc) { type = k; break; } }
            type = type || 'standard';
        }
        const route = intoZone === 'grey' ? FLOW_RETURN : type === 'hazmat' ? FLOW_HAZMAT : FLOW_STANDARD;
        const p = { id:this.nextPkgId++, type, route, qa:false, enterQ:this.t, born:this.t, error:false, damaged:false,
            due: type === 'rush' ? this.t + 140 : 1e9, isReturn: intoZone === 'grey' };
        this.zones[route[0]].queue.push(p);
        this.stats.arrived++;
        return p;
    }

    // ----------------------------------------------------------------- worker model
    workerSpeed(w)
    {
        const s = w.s;
        const def = ZONE_DEFS[w.zone];
        let r = zoneRating(s, w.zone);
        let sp = .55 + r * .045;
        sp *= .75 + .25 * clamp(w.energy / 100, 0, 1);
        let moraleF = .9 + .2 * s.morale / 100;
        if (hasTrait(s, 'Moody')) moraleF = 1 + (moraleF - 1) * 2;
        sp *= moraleF;
        sp *= traitMod(s, 'speed');
        sp *= 1 + this.fac.scanners * .04 + this.fac.conveyors * .03;
        sp *= LINE_SPEEDS[this.lineSpeed].speed;
        sp *= 1 + (this.stats.flow - 1) * .04;
        // teammates' aura
        let aura = 0;
        for (const o of this.workers) if (o !== w && o.zone === w.zone && !o.injured) aura += traitMod(o.s, 'aura', 0) + (o.s.attrs.teamwork - 10) * .004;
        sp *= 1 + clamp(aura, -.15, .15);
        if (hasTrait(s, 'Lazy') && this.crewCount(w.zone) === 1) sp *= .9;
        // consistency wobble
        sp *= 1 + (Math.sin(this.t * .07 + w.id) * (20 - s.hidden.consistency) * .006);
        // zone-specific requirements
        if (def.cert === 'hazmat' && !s.certs.includes('hazmat')) sp *= .75;
        if (w.pkg && PACKAGE_TYPES[w.pkg.type].heavy) sp *= .75 + s.attrs.strength * .02;
        const z = this.zones[w.zone];
        if (z.broken) sp *= .25;
        return Math.max(.15, sp);
    }

    hazard(w)
    {
        const s = w.s;
        const def = ZONE_DEFS[w.zone] || { risk:.2 };
        let h = .00014 * def.risk;
        h *= 2 - s.attrs.safety / 20 * 1.5;
        h *= 1 + (1 - clamp(w.energy/100, 0, 1)) * 1.6;
        h *= traitMod(s, 'risk');
        h *= LINE_SPEEDS[this.lineSpeed].risk;
        h *= 1 - this.fac.safety * .08;
        if (def.cert && def.cert !== 'maintenance' && !s.certs.includes(def.cert)) h *= def.cert === 'hazmat' ? 2.5 : 1.5;
        if (w.pkg && PACKAGE_TYPES[w.pkg.type].heavy) h *= 1.5 - s.attrs.strength/40;
        if (this.simulated) h *= 1.25;
        return h;
    }

    // ----------------------------------------------------------------- player / AI commands
    moveWorker(id, zone)
    {
        const w = this.worker(id);
        if (!w || w.injured || w.zone === zone) return false;
        if (w.incident && w.incident.type === 'strike') return false; // frozen in the forklift lane
        if (w.pkg && !this.isWalking(w)) { this.zones[w.at]?.queue?.unshift(w.pkg); w.pkg = null; w.progress = 0; }
        if (w.incident) this.intervene(w.incident.id, true); // walking away from a hazard defuses it
        const from = w.zone;
        w.walkFrom = from;
        w.movedAt = this.t;
        w.zone = zone;
        w.selfBreak = false;
        w.repairTarget = null;
        w.tiredWarned = false;
        if (!this.isWalking(w)) this.startWalk(w, zone); // otherwise re-routes on arrival
        this.emit('move', { w, from, to:zone });
        return true;
    }

    // ----------------------------------------------------------------- walking & road crossings
    startWalk(w, dest)
    {
        w.path = WH_MAP.path(w.at, dest, w.benchK);
        w.pathI = 1;
        w.pos = { x:w.path[0].x, y:w.path[0].y };
        w.walkDest = dest;
        w.state = 'walk';
        w.crossWait = 0;
        if (w.path.length <= 1) this.arriveWalk(w);
    }
    arriveWalk(w)
    {
        const last = w.path[w.path.length - 1];
        w.at = w.walkDest;
        if (w.at === 'bench') w.benchK = +last.node.slice(5) || 1;
        w.path = null;
        if (w.selfBreak && w.at === 'bench') { w.state = 'break'; this.emit('arrive', { w }); return; }
        if (w.zone !== w.at && !(w.zone === 'black' && w.repairTarget === w.at)) { this.startWalk(w, w.zone); return; }
        w.state = w.zone === 'bench' ? 'break' : (w.zone === 'black' && w.repairTarget) ? 'repair' : 'idle';
        this.emit('arrive', { w });
    }
    crossCheck(cw)
    {
        const L = WH_MAP.loopLen;
        let clear = true, f = null, d = 1e9;
        for (const fl of this.forklifts)
        {
            const ahead = ((cw.s - fl.s) % L + L) % L;
            const past = ((fl.s - cw.s) % L + L) % L;
            if (past < 1.7) { clear = false; f = fl; d = 0; continue; }
            if (ahead < d) { d = ahead; f = fl; }
            if (ahead < 3 + fl.speed * 1.4) clear = false;
        }
        return { clear, f, d };
    }
    patienceOf(w) { return w.patience * (this.lineSpeed === 'push' ? .65 : this.lineSpeed === 'slow' ? 1.3 : 1); }
    updateWalker(w, dt)
    {
        if (w.incident && w.incident.type === 'strike') return; // frozen, forklift bearing down
        w.energy = Math.max(0, w.energy - .03 * dt);
        const wp = w.path[w.pathI];
        if (wp.cw && !w.crossing)
        {
            const chk = this.crossCheck(wp.cw);
            if (chk.clear)
            {
                w.crossing = wp.cw; w.jay = false;
                this.cwUsers[wp.cw.id]++;
                this.stats.crossings++;
                if (w.state === 'waitCross') this.emit('crossClear', { w });
                w.state = 'walk';
            }
            else
            {
                if (w.state !== 'waitCross') { w.state = 'waitCross'; w.crossWait = 0; this.emit('waitCross', { w }); }
                w.crossWait += dt;
                this.stats.crossWait += dt;
                if (w.crossWait > this.patienceOf(w) && chk.d > 1 && Math.random() < .7 * dt)
                {
                    // most impatient staff wait for a gap that *looks* big enough; some misjudge it badly
                    const misjudge = Math.random() < .3 * traitMod(w.s, 'risk') * (1.3 - w.s.attrs.concentration / 30);
                    if (misjudge || chk.d > 4.8 || (chk.f && chk.f.speed < .5)) this.jaywalk(w, wp.cw, chk);
                }
                return;
            }
        }
        const speed = 3.6 * (.85 + w.s.attrs.adaptability / 40) * (.75 + .25 * w.energy / 100) * (w.jay ? 1.35 : 1);
        const dx = wp.x - w.pos.x, dy = wp.y - w.pos.y, dist = Math.hypot(dx, dy), step = speed * dt;
        if (dist <= step)
        {
            w.pos.x = wp.x; w.pos.y = wp.y;
            if (w.crossing) { this.cwUsers[w.crossing.id]--; w.crossing = null; w.jay = false; }
            w.pathI++;
            if (w.pathI >= w.path.length) this.arriveWalk(w);
        }
        else { w.pos.x += dx / dist * step; w.pos.y += dy / dist * step; }
    }
    jaywalk(w, cw, chk)
    {
        w.crossing = cw; w.jay = true; w.state = 'walk';
        w.jaywalks++;
        this.cwUsers[cw.id]++;
        this.stats.jaywalks++;
        this.emit('jaywalk', { w, cw });
        const f = chk.f;
        if (f && f.speed > 1 && chk.d < 1.2 + f.speed * .9)
        {
            this.raiseIncident(w, 'strike');
            f.hold = w.incident;
        }
        else if (f && f.speed > .3 && chk.d < 9)
        {
            f.speed *= .35;
            this.stats.forkliftBrakes++;
            this.emit('brake', { f, w });
        }
    }

    // ----------------------------------------------------------------- forklifts
    addForklift(s, temp = false)
    {
        const loads = ['standard','heavy','fragile','hazmat',null];
        this.forklifts.push({ id:this.nextForkliftId++, s, speed:0, max: 3.1 + Math.random() * .7, stopT:0, dwellT:0, hold:null,
            braking:false, temp, life: temp ? 75 : 1e9, load: loads[Math.floor(Math.random() * loads.length)] });
    }
    updateForklifts(dt)
    {
        const L = WH_MAP.loopLen;
        const mod = (v)=> ((v % L) + L) % L;
        for (const f of this.forklifts)
        {
            let target = f.max * LINE_SPEEDS[this.lineSpeed].speed * (1 - this.fac.safety * .04);
            if (f.stopT > 0) { f.stopT -= dt; target = 0; f.speed = Math.min(f.speed, .2); }
            if (f.hold) { if (f.hold.done) f.hold = null; else target = 0; }
            if (f.dwellT > 0) { f.dwellT -= dt; target = 0; }
            else if (Math.random() < .025 * dt) { f.dwellT = 1 + Math.random() * 2.5; f.load = f.load ? null : 'standard'; }
            // people on a crossing ahead
            WH_MAP.crosswalks.forEach((cw, i)=>
            {
                if (!this.cwUsers[i]) return;
                const ahead = mod(cw.s - f.s);
                if (ahead > .2 && ahead < 2.6) target = 0;
                else if (ahead < 7) target = Math.min(target, 1.1);
            });
            // traffic ahead
            for (const o of this.forklifts)
            {
                if (o === f) continue;
                const gap = mod(o.s - f.s);
                if (gap < 2.8) target = 0;
                else if (gap < 5.5) target = Math.min(target, o.speed);
            }
            f.braking = target < f.speed - .15;
            const acc = target > f.speed ? 2.5 : 9;
            f.speed += clamp(target - f.speed, -acc * dt, acc * dt);
            f.s = mod(f.s + f.speed * dt);
            f.life -= dt;
        }
        this.forklifts = this.forklifts.filter(f => f.life > 0 || f.hold);
    }

    setLineSpeed(k) { this.lineSpeed = k; this.emit('lineSpeed', { k }); }
    toggleRush(z) { this.zones[z].rushFirst = !this.zones[z].rushFirst; return this.zones[z].rushFirst; }
    callOvertime()
    {
        if (this.overtimeHours >= 2) return false;
        this.overtimeHours++;
        this.duration += OVERTIME_SECONDS;
        this.emit('overtime', { hours:this.overtimeHours });
        return true;
    }
    callContractor(z)
    {
        const zone = this.zones[z];
        if (!zone.broken || zone.contractor) return false;
        zone.contractor = true;
        const cost = 350 + this.c.tier * 100;
        this.stats.contractorCost += cost;
        this.emit('contractor', { z, cost });
        return true;
    }
    intervene(incId, quiet = false)
    {
        const inc = this.incidents.find(i => i.id === incId && !i.done);
        if (!inc) return false;
        inc.done = true;
        const w = this.worker(inc.workerId);
        if (w) w.incident = null;
        this.stats.avoided++;
        this.stats.interventions++;
        if (inc.type === 'strike')
        {
            const f = this.forklifts.find(fl => fl.hold === inc);
            if (f) { f.hold = null; f.stopT = 2.5; f.speed = 0; }
        }
        else if (!quiet) this.zones[inc.zone].pausedUntil = Math.max(this.zones[inc.zone].pausedUntil, this.t + 3);
        this.emit('avoided', { inc, w });
        return true;
    }

    // ----------------------------------------------------------------- main step
    step(dt)
    {
        if (this.done) return;
        this.t += dt;

        // hourly ticks
        const hr = Math.floor(this.t / 60);
        if (hr > this.lastHour)
        {
            this.lastHour = hr;
            this.stats.hourly.push(this.stats.shipped);
            this.emit('hour', { hour: SHIFT_START_HOUR + hr });
        }

        this.updateArrivals(dt);
        this.updateForklifts(dt);
        this.updateBreakdowns(dt);
        for (const w of this.workers) this.updateWorker(w, dt);
        this.updateIncidents(dt);
        this.updateFlow(dt);
        if (this.assistantOn) this.updateAssistant(dt);

        if (this.t >= this.duration) this.finish();
    }

    updateArrivals(dt)
    {
        if (this.t < SHIFT_SECONDS - 20)
        {
            this.arrivalAcc += this.steadyRate * dt;
            this.returnAcc += this.returnRate * dt;
            if (this.truckTimes.length && this.t >= this.truckTimes[0])
            {
                this.truckTimes.shift();
                const n = Math.round(this.truckSize * (.8 + Math.random()*.4));
                this.dock += n;
                this.emit('truck', { n });
                if (this.forklifts.length < 8) this.addForklift(0, true);
            }
        }
        while (this.arrivalAcc >= 1) { this.arrivalAcc--; this.dock++; }
        while (this.returnAcc >= 1)
        {
            this.returnAcc--;
            if (this.zones.grey.queue.length < this.cap) this.spawnPackage('grey', 'standard');
            else this.dock++;
        }
        // dock feeds Blue when there's room
        const blue = this.zones.blue;
        while (this.dock > 0 && blue.queue.length < this.cap)
        {
            this.dock--;
            this.spawnPackage('blue');
        }
    }

    updateBreakdowns(dt)
    {
        for (const z of ZONE_KEYS)
        {
            if (z === 'black') continue;
            const zone = this.zones[z];
            if (zone.broken)
            {
                // repair progress
                let rate = 0;
                for (const w of this.workers)
                    if (w.zone === 'black' && w.state === 'repair' && w.repairTarget === z)
                        rate += zoneRating(w.s, 'black') / 10 * (w.s.certs.includes('maintenance') ? 1.4 : 1);
                if (!rate) for (const w of this.zoneWorkers(z)) rate += .12;
                if (zone.contractor) rate += 1.6;
                zone.broken.progress += rate * dt;
                if (zone.broken.progress >= zone.broken.work)
                {
                    this.emit('repaired', { z, def:zone.broken.def });
                    for (const w of this.workers) if (w.repairTarget === z) { w.repairTarget = null; if (w.zone === 'black' && !this.isWalking(w)) w.state = 'idle'; w.repairs++; }
                    zone.broken = null;
                    zone.contractor = false;
                }
                continue;
            }
            const busy = this.zoneWorkers(z).length > 0 ? 1 : .3;
            const p = .0005 * busy * (1 - this.fac.conveyors * .12) * (this.lineSpeed === 'push' ? 1.5 : 1);
            if (Math.random() < p * dt)
            {
                const def = wmPick(BREAKDOWN_DEFS);
                zone.broken = { def, progress:0, work:def.work, t0:this.t };
                this.stats.breakdowns++;
                this.emit('breakdown', { z, def });
            }
        }
    }

    updateWorker(w, dt)
    {
        if (w.injured) return;
        w.anim += dt;
        const s = w.s;
        if (this.isWalking(w)) { this.updateWalker(w, dt); return; }
        if (w.at === 'bench')
        {
            w.state = 'break';
            w.energy = Math.min(100, w.energy + dt * (.9 + this.fac.breakroom * .25));
            if (w.selfBreak && (w.breakLeft -= dt) <= 0)
            {
                w.selfBreak = false;
                this.startWalk(w, w.zone);
                this.emit('breakOver', { w });
            }
            return;
        }
        // scheduled meal break (staggered) — everyone has to cross the floor
        if (!w.breakDone && this.t >= w.breakAt && !w.pkg && this.t < SHIFT_SECONDS - 60 && !w.incident)
        {
            w.breakDone = true;
            w.selfBreak = true;
            w.breakLeft = 16;
            this.startWalk(w, 'bench');
            this.emit('breakTime', { w });
            return;
        }
        w.activeTime += dt;
        if (w.state === 'work') w.workTime = (w.workTime || 0) + dt;
        w.zoneTime[w.zone] = (w.zoneTime[w.zone] || 0) + dt;

        // fatigue
        const drain = .1 * (1.3 - s.attrs.stamina / 20 * .6) * LINE_SPEEDS[this.lineSpeed].fatigue * traitMod(s, 'fatigue') * (s.attrs.workRate > 14 ? 1.08 : 1);
        const working = w.state === 'work' || w.state === 'repair';
        w.energy = Math.max(0, w.energy - drain * dt * (working ? 1 : .35));
        if (w.energy < 25 && !w.tiredWarned) { w.tiredWarned = true; this.emit('tired', { w }); }

        // incident hazard
        if (!w.incident && working && Math.random() < this.hazard(w) * dt * (this.riskMult > 1 ? 1 : 1))
            this.raiseIncident(w);
        // medical event (low energy, any zone)
        if (!w.incident && Math.random() < .00003 * (1 + (1 - w.energy/100) * 4) * dt)
            this.raiseIncident(w, 'medical');

        const zone = this.zones[w.zone];
        if (this.t < zone.pausedUntil) { w.state = 'idle'; return; }

        // maintenance crew
        if (w.zone === 'black')
        {
            if (w.repairTarget && !this.zones[w.repairTarget].broken) w.repairTarget = null;
            if (!w.repairTarget)
            {
                // pick the broken zone with least repair cover
                let target = null, best = 1e9;
                for (const z of ZONE_KEYS)
                {
                    const b = this.zones[z].broken;
                    if (!b) continue;
                    const cover = this.workers.filter(o => o.repairTarget === z).length;
                    const score = cover * 100 + b.t0;
                    if (score < best) { best = score; target = z; }
                }
                if (target) { w.repairTarget = target; this.emit('dispatch', { w, z:target }); }
            }
            if (w.repairTarget)
            {
                if (w.at === w.repairTarget) w.state = 'repair';
                else this.startWalk(w, w.repairTarget);
                return;
            }
            if (w.at !== 'black') { this.startWalk(w, 'black'); return; }
            w.state = 'idle'; w.energy = Math.min(100, w.energy + dt * .2);
            return;
        }

        // blocked holding a finished parcel
        if (w.state === 'blocked' && w.pkg)
        {
            if (this.tryHandoff(w, w.pkg)) { w.pkg = null; w.state = 'idle'; }
            return;
        }
        if (!w.pkg)
        {
            const q = zone.queue;
            if (!q.length) { w.state = 'idle'; return; }
            let idx = 0;
            if (zone.rushFirst) { const r = q.findIndex(p => p.type === 'rush'); if (r > 0) idx = r; }
            w.pkg = q.splice(idx, 1)[0];
            w.progress = 0;
            w.waited = this.t - w.pkg.enterQ;
            w.speedCache = this.workerSpeed(w);
        }
        w.state = 'work';
        if ((w.anim * 4 | 0) % 4 === 0) w.speedCache = this.workerSpeed(w);
        const def = ZONE_DEFS[w.zone];
        const pt = PACKAGE_TYPES[w.pkg.type];
        w.progress += dt * w.speedCache / (def.baseTime * pt.timeMul);
        if (w.progress >= 1) this.completeTask(w);
    }

    completeTask(w)
    {
        const p = w.pkg, s = w.s, z = w.zone;
        const pt = PACKAGE_TYPES[p.type];
        w.processed++;
        this.zones[z].processed++;
        // accuracy roll — mistakes get caught in QA or ship as defects
        if (z === 'grey')
        {
            if (p.error) { p.error = false; this.stats.caught++; this.emit('caught', { w, p }); }
        }
        else
        {
            let errP = .018 * (1.6 - s.attrs.accuracy / 20 * 1.2) * (1 + (1 - w.energy/100)) / traitMod(s, 'accuracy') / (1 + this.fac.scanners * .1);
            errP *= 1.2 - s.attrs.concentration / 50;
            if (Math.random() < errP) { p.error = true; w.errors++; }
            if (pt.fragile && Math.random() < .03 * traitMod(s, 'damage') * (this.lineSpeed === 'push' ? 1.8 : 1) * (1.4 - s.attrs.accuracy/25)) { p.damaged = true; w.errors++; this.emit('damage', { w, p }); }
        }
        const smooth = (w.waited ?? 0) < 10;
        if (smooth) { w.smooth++; this.stats.combo++; }
        else this.stats.combo = Math.max(0, this.stats.combo - 3);
        this.emit('complete', { w, p, z, smooth });
        if (this.tryHandoff(w, p)) { w.pkg = null; w.state = 'idle'; }
        else { w.state = 'blocked'; }
        w.progress = 0;
    }

    tryHandoff(w, p)
    {
        const from = w.zone;
        let next;
        // QA diversion: errored parcels leaving Pack go to Quality if it's staffed
        if (from === 'orange' && p.error && !p.qa && this.crewCount('grey') > 0 && this.zones.grey.queue.length < this.cap - 2 && Math.random() < .35 + this.avgZoneRating('grey') * .03)
            next = 'grey';
        else if (from === 'grey' && p.qa)
            next = 'red';
        else
            next = p.route[p.route.indexOf(from) + 1];
        if (!next) { this.ship(p, w); return true; }
        const nz = this.zones[next];
        if (nz.queue.length >= this.cap)
        {
            if (this.t - nz.lastBottleneck > 6)
            {
                nz.lastBottleneck = this.t;
                this.stats.bottlenecks++;
                this.stats.combo = Math.floor(this.stats.combo / 2);
                this.emit('bottleneck', { z:next });
            }
            return false; // hold it and retry
        }
        if (next === 'grey' && from === 'orange') p.qa = true;
        else if (from === 'grey') p.qa = false;
        p.enterQ = this.t;
        nz.queue.push(p);
        this.emit('handoff', { from, to:next, p, w });
        return true;
    }

    ship(p, w)
    {
        if (p.isReturn) { this.stats.returns++; this.emit('restock', { p, w }); return; }
        this.stats.shipped++;
        if (p.type === 'rush') { this.stats.rushShipped++; if (this.t > p.due) { this.stats.lateRush++; this.emit('rushLate', { p }); } }
        if (p.error) { this.stats.defects++; this.emit('defect', { p }); }
        if (p.damaged) this.stats.damaged++;
        this.emit('ship', { p, w });
    }

    avgZoneRating(z)
    {
        const ws = this.zoneWorkers(z);
        return ws.length ? ws.reduce((a, w)=> a + zoneRating(w.s, z), 0) / ws.length : 0;
    }

    // ----------------------------------------------------------------- incidents
    raiseIncident(w, forced = null)
    {
        const def = ZONE_DEFS[w.zone] || ZONE_DEFS.black;
        const type = forced || wmPick(def.incidents);
        const window = type === 'strike' ? 2.6 + w.s.attrs.concentration * .05 : 5 + w.s.attrs.concentration * .1 + (hasTrait(w.s, 'Steady') ? 1.5 : 0);
        const inc = { id:this.nextIncId++, workerId:w.id, zone:w.zone, type, t0:this.t, window, done:false, aiRolled:false };
        w.incident = inc;
        this.incidents.push(inc);
        this.emit('incident', { inc, w });
    }

    updateIncidents()
    {
        for (const inc of this.incidents)
        {
            if (inc.done) continue;
            if (this.t - inc.t0 < inc.window) continue;
            inc.done = true;
            const w = this.worker(inc.workerId);
            if (!w || w.injured) continue;
            w.incident = null;
            const d = INCIDENT_DEFS[inc.type];
            const s = w.s;
            let pInj = .22 * d.sevMul * (1.5 - s.attrs.concentration / 20) * (1 - this.fac.safety * .08) * Math.sqrt(traitMod(s, 'risk'));
            if (this.simulated) pInj *= 1.15;
            const firstAider = this.workers.some(o => o.zone === w.zone && o.s.certs.includes('firstaid') && !o.injured);
            if (Math.random() < pInj)
            {
                let pSerious = .14 * d.sevMul * (s.hidden.injuryProne / 10) * (1 - this.fac.safety * .1) * (firstAider ? .6 : 1);
                const serious = Math.random() < pSerious;
                const pool = INJURY_TABLE.filter(r => r[3] === serious);
                const row = wmPick(pool);
                let days = wmRI(row[1], row[2]);
                if (firstAider) days = Math.max(1, Math.round(days * .75));
                const fine = serious ? Math.round((1500 + Math.random()*4500) * (1 - this.fac.safety * .1) / 100) * 100 : 0;
                const inj = { id:s.id, name:s.name, label:row[0], days, serious, fine, cause:d.label, zone:w.zone };
                this.stats.injuries.push(inj);
                w.injured = true;
                if (w.crossing) { this.cwUsers[w.crossing.id]--; w.crossing = null; }
                if (w.pkg) { this.zones[w.at]?.queue?.unshift(w.pkg); w.pkg = null; }
                w.state = 'injured';
                if (this.zones[w.at]?.pausedUntil !== undefined) this.zones[w.at].pausedUntil = this.t + (serious ? 15 : 6);
                this.stats.combo = 0;
                this.emit('injury', { inc, w, inj });
            }
            else
            {
                this.stats.nearMisses++;
                w.nearMisses++;
                this.emit('nearMiss', { inc, w });
            }
        }
    }

    // ----------------------------------------------------------------- flow
    updateFlow(dt)
    {
        const lvl = Math.min(5, 1 + Math.floor(this.stats.combo / 35));
        if (lvl > this.stats.flow) this.emit('flowUp', { level:lvl });
        else if (lvl < this.stats.flow) this.emit('flowDown', { level:lvl });
        this.stats.flow = lvl;
        this.stats.peakFlow = Math.max(this.stats.peakFlow, lvl);
        this.stats.flowTimeSum += lvl * dt;
    }

    // ----------------------------------------------------------------- assistant manager AI
    updateAssistant(dt)
    {
        const q = this.assistantQ;
        // incidents: one roll each, after a short reaction delay
        for (const inc of this.incidents)
        {
            if (inc.done || inc.aiRolled || this.t - inc.t0 < 1.2) continue;
            inc.aiRolled = true;
            if (Math.random() < q) this.intervene(inc.id);
        }
        this.aiTimer -= dt;
        if (this.aiTimer > 0) return;
        this.aiTimer = 8 - q * 4;

        // breakdowns with no maintenance cover
        for (const z of ZONE_KEYS)
        {
            const zone = this.zones[z];
            if (zone.broken && !zone.contractor && this.crewCount('black') === 0 && this.t - zone.broken.t0 > 5 && Math.random() < q)
                this.callContractor(z);
        }
        const main = ['blue','green','yellow','orange','red','purple','grey'];
        const pressure = (z)=> this.zones[z].queue.length / (this.crewCount(z) + .5) + (this.zones[z].broken ? 3 : 0);
        // nobody covering a zone with work waiting
        const empty = main.find(z => this.crewCount(z) === 0 && this.zones[z].queue.length > (FLOW_STANDARD.includes(z) ? 0 : 5));
        if (empty)
        {
            const pool = this.workers.filter(w => !w.injured && !this.isWalking(w) && (w.zone === 'bench' || this.crewCount(w.zone) >= 2))
                .sort((a,b)=> (b.zone === 'bench') - (a.zone === 'bench') || zoneRating(b.s, empty) - zoneRating(a.s, empty));
            if (pool[0]) { this.moveWorker(pool[0].id, empty); return; }
        }
        // fatigue rotation
        const bench = this.workers.filter(w => w.zone === 'bench' && !w.injured && w.state === 'break');
        const tired = this.workers.filter(w => w.zone !== 'bench' && !w.injured && !this.isWalking(w) && w.energy < 22).sort((a,b)=> a.energy - b.energy)[0];
        if (tired)
        {
            const fresh = bench.filter(w => w.energy > 55).sort((a,b)=> zoneRating(b.s, tired.zone) - zoneRating(a.s, tired.zone))[0];
            if (fresh) { const z = tired.zone; this.moveWorker(tired.id, 'bench'); this.moveWorker(fresh.id, z); return; }
        }
        // bring rested bench players back
        const rested = bench.find(w => w.energy > 85);
        // rebalance: the real bottleneck is the most downstream backed-up zone
        // (anything upstream of it is just blocked behind it)
        if (this.t < 25) return;
        const flow = FLOW_STANDARD;
        let hot = null;
        for (let i = flow.length - 1; i >= 0; i--)
            if (this.zones[flow[i]].queue.length >= 14) { hot = flow[i]; break; }
        if (!hot && this.zones.grey.queue.length >= 10) hot = 'grey';
        if (!hot && this.zones.purple.queue.length >= 8) hot = 'purple';
        if (!hot) return;
        if (rested) { this.moveWorker(rested.id, hot); return; }
        const upstreamQ = (z)=> { const i = flow.indexOf(z); return i > 0 ? this.zones[flow[i-1]].queue.length : this.dock; };
        // never strip a zone downstream of the jam: the work is about to reach it
        const hotIdx = flow.indexOf(hot);
        const donors = main.filter(z => z !== hot && this.zones[z].queue.length <= 1 && upstreamQ(z) <= 2 &&
                (!flow.includes(z) || hotIdx < 0 || flow.indexOf(z) < hotIdx || this.crewCount(hot) <= 1) &&
                (this.crewCount(z) >= 2 || (z === 'grey' && this.crewCount(z) >= 1 && this.t > 60)))
            .sort((a,b)=> pressure(a) - pressure(b));
        const donor = donors[0];
        if (!donor) return;
        const cand = this.workers.filter(w => w.zone === donor && !w.injured && !this.isWalking(w) && this.t - (w.movedAt ?? -99) > 45)
            .sort((a,b)=> zoneRating(b.s, hot) - zoneRating(a.s, hot))[0];
        if (cand && Math.random() < .5 + q * .5) this.moveWorker(cand.id, hot);
    }

    // ----------------------------------------------------------------- end of shift
    finish()
    {
        if (this.done) return;
        this.done = true;
        // unresolved incidents fizzle out
        for (const inc of this.incidents) inc.done = true;
        this.emit('finish', {});
    }

    unitsPerHour()
    {
        const hrs = Math.max(.25, this.t / 60);
        return Math.round(this.stats.shipped * UNITS_PER_PARCEL / hrs);
    }

    result()
    {
        const st = this.stats;
        const c = this.c;
        const t = TIER_DEFS[c.tier];
        let backlog = this.dock;
        for (const z of ZONE_KEYS) backlog += this.zones[z].queue.filter(p => !p.isReturn).length;
        for (const w of this.workers) if (w.pkg && !w.pkg.isReturn) backlog++;
        const avgFlow = st.flowTimeSum / Math.max(1, this.t);
        const units = st.shipped * UNITS_PER_PARCEL;
        const revenue = Math.round(units * t.rate * (1 + (avgFlow - 1) * .03));
        const penalties = st.lateRush * 25 + st.defects * 12 + st.damaged * 15 + backlog * 2;
        const fines = st.injuries.reduce((a, i)=> a + i.fine, 0);
        const energyCost = 180 + c.tier * 60 + this.overtimeHours * 40;
        const crewWage = this.workers.reduce((a, w)=> a + w.s.wage, 0);
        const overtimeCost = Math.round(crewWage / 40 * 1.5 * this.overtimeHours);
        const dailyWages = Math.round(c.staff.reduce((a, s)=> a + s.wage, 0) / WEEK_SHIFTS);
        const totalCost = penalties + fines + energyCost + overtimeCost + st.contractorCost + dailyWages;
        const onTime = clamp((st.shipped - st.lateRush) / Math.max(1, st.shipped + backlog), 0, 1);
        const csat = clamp(onTime * (1 - (st.defects + st.damaged) / Math.max(1, st.shipped)), 0, 1);

        // individual ratings (FM style 1-10)
        const workers = this.workers.map(w =>
        {
            let rating = 0;
            const active = w.activeTime;
            if (active > 30 || w.injured)
            {
                if (w.zone === 'black' || (w.zoneTime.black || 0) > active * .5)
                    rating = 6.4 + w.repairs * .5 - (st.breakdowns > w.repairs * 2 + 2 ? .4 : 0);
                else
                {
                    // efficiency while busy (attributes, fatigue) + utilisation (did they keep busy) + flow + mistakes
                    let expected = 0;
                    for (const z in w.zoneTime) if (ZONE_DEFS[z] && ZONE_DEFS[z].baseTime) expected += w.zoneTime[z] / ZONE_DEFS[z].baseTime;
                    const workT = w.workTime || 0;
                    const eff = expected ? w.processed / (expected * Math.max(.05, workT / active)) : 0;
                    const util = workT / active;
                    rating = 6.3 + (eff - .9) * 3.5 + (util > .75 ? .3 : util < .3 ? -.2 : 0)
                        + (w.smooth / Math.max(1, w.processed) - .5) * .8 - w.errors * .15 - w.nearMisses * .15 - w.jaywalks * .25;
                }
                if (w.injured) rating -= .8;
                rating = wmRound1(clamp(rating, 3, 10));
            }
            return { id:w.id, name:w.s.name, zone:w.zone, rating, processed:w.processed, errors:w.errors, repairs:w.repairs,
                energy:Math.round(w.energy), injured:w.injured, nearMisses:w.nearMisses, jaywalks:w.jaywalks, moraleDelta:0 };
        });
        const rated = workers.filter(w => w.rating);
        const workerOfShift = rated.sort((a, b)=> b.rating - a.rating)[0] || null;
        workers.sort((a, b)=> b.rating - a.rating);

        const profit = revenue - totalCost;
        return {
            shipped: st.shipped, units, target: this.forecast.target, forecast:this.forecast.volume, arrived: st.arrived,
            backlog, revenue, penalties, fines, energyCost, overtimeCost, contractorCost: st.contractorCost, dailyWages, totalCost, profit,
            cpu: units ? totalCost / units : 0,
            onTime, csat, defects: st.defects, damaged: st.damaged, caught: st.caught, lateRush: st.lateRush, rushShipped: st.rushShipped,
            returns: st.returns, nearMisses: st.nearMisses, avoided: st.avoided, injuries: st.injuries,
            jaywalks: st.jaywalks, crossings: st.crossings, crossWait: st.crossWait, forkliftBrakes: st.forkliftBrakes,
            peakFlow: st.peakFlow, avgFlow, bottlenecks: st.bottlenecks, breakdowns: st.breakdowns,
            uph: this.unitsPerHour(), overtimeHours: this.overtimeHours, simulated: this.simulated,
            hourly: [...st.hourly, st.shipped], workers, workerOfShift,
            zoneProcessed: Object.fromEntries(ZONE_KEYS.map(z => [z, this.zones[z].processed])),
        };
    }

    // run to completion instantly (full simulation)
    runToEnd(dt = .25)
    {
        let guard = 0;
        while (!this.done && guard++ < 100000) this.step(dt);
    }
}
