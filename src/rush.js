'use strict';
// ============================================================================
// RUSH — the live shift, rebuilt as "Mini Metro meets Diner Dash".
//
// Network (Mini Metro): drag conveyor LINES between nodes. Every parcel carries
// a colour+shape destination code and must ride the network to the outbound
// DOOR with the same colour/shape. Loose items must be PACKED on the way;
// hazmat ☣ goes through the HAZMAT CAGE. Lines, tote runners and bridges over
// the forklift road are limited; each hour you pick one upgrade. New doors and
// stations open as the shift goes on. A node left overflowing gridlocks the
// warehouse.
//
// Crew (Diner Dash): drag your people onto pack benches, the hazmat cage and
// door loading bays. A worker on a station of their own specialist colour gets
// a COLOUR MATCH bonus. Trucks lose patience; full trucks chain combos.
// Tap jams and accident warnings before it's too late.
// ============================================================================

const RUSH_SCALE = 3;          // one rush parcel = 3 sim parcels (30 units)
const RUSH_HOUR = 60;          // seconds per in-game hour
const RUSH_LINE_COLORS = ['#3b4a6b', '#c2417a', '#2f8f83', '#8a5a3c', '#6d4bc2', '#5c6e2e', '#d97706'];
const RUSH_DOORS =
[
    { key:'red',    hex:'#e5383b', shape:'tri',     name:'NORTH' },
    { key:'blue',   hex:'#2f7fe8', shape:'circle',  name:'CITY' },
    { key:'green',  hex:'#2fb344', shape:'square',  name:'AIR' },
    { key:'yellow', hex:'#f2b705', shape:'star',    name:'EXPRESS' },
    { key:'orange', hex:'#ff7a1a', shape:'diamond', name:'COAST' },
];
const RUSH_ROAD_X = 2, RUSH_ROAD_W = 2.6;
const RUSH_SLOTS =
{
    dock:   [[-16, 5], [-16, -5], [-16, 0]],
    bench:  [[-9.5, 6], [-9.5, -6], [-5, 1.5], [-9.5, 0]],
    cage:   [[-4.5, -6.5]],
    sorter: [[6.5, 4.5], [6.5, -4.5]],
    door:   [[11.5, 7.5], [15.5, 3.8], [11.5, 0.2], [15.5, -3.4], [11.5, -7]],
};
const RUSH_UPGRADES =
{
    line:   { icon:'〰️', title:'New conveyor line', desc:'+1 line to draw' },
    runner: { icon:'🛒', title:'Tote runner',       desc:'+1 runner to put on any line' },
    bridge: { icon:'🌉', title:'2 road bridges',     desc:'Cross the forklift road twice more' },
    bench:  { icon:'📦', title:'Extra pack bench',   desc:'A new bench opens on the floor' },
    tote:   { icon:'🧺', title:'Bigger totes',       desc:'Runners carry +2 parcels' },
    turbo:  { icon:'⚡', title:'Turbo rollers',      desc:'Runners move 15% faster' },
    temp:   { icon:'🧑‍🔧', title:'Agency temp',     desc:'A temporary worker joins the crew' },
};

// ---------------------------------------------------------------------------
class RushSim
{
    constructor(c)
    {
        this.c = c;
        this.forecast = shiftForecast();
        this.lineSpeed = 'normal';
        this.fac = { ...c.facilities };
        this.t = 0;
        this.duration = SHIFT_SECONDS;
        this.done = false;
        this.listeners = [];
        this.nodes = [];
        this.lines = [];
        this.parcels = [];
        this.incidents = [];
        this.nextId = 1;
        this.res = { lines: 3 + Math.floor(this.fac.conveyors / 2), runners: 4 + Math.floor(this.fac.conveyors / 2), bridges: 3, tote: 6, speed: 3.8 * (1 + this.fac.conveyors * .05) * modMul('speed') };
        this.hourShown = 0;
        this.pendingUpgrade = null;
        this.stats = { delivered:0, spawned:0, lateRush:0, rushShipped:0, trucks:0, fullTrucks:0, halfEmpty:0, combo:0, bestCombo:0, comboT:0, avoided:0, nearMisses:0, injuries:[], jams:0, overflows:0, hourly:[], matchBonus:0, collapse:false, fineHalf:0 };
        this.spawnAcc = 0;
        this.total = Math.max(60, Math.round(this.forecast.volume / RUSH_SCALE));
        this.unlocks = [{ t: 75, k:'door' }, { t: 150, k:'cage' }, { t: 225, k:'door' }, { t: 300, k:'dock' }, { t: 330, k:'door' }].map(u => ({ ...u, done:false }));

        // starting floor
        this.addNode('dock'); this.addNode('dock');
        this.addNode('bench'); this.addNode('bench');
        this.addNode('sorter'); this.addNode('sorter');
        this.addNode('door'); this.addNode('door'); this.addNode('door');
        this.hazmatOn = false;
        // the first trucks are already backed up to the docks
        for (const d of this.nodes.filter(n => n.type === 'dock')) for (let i = 0; i < 3; i++) this.spawn(d);

        // crew: every fit staff member
        this.workers = c.staff.filter(s => !s.injury).map(s => ({ id:s.id, s, slot:null, energy:s.condition, processed:0, errors:0, nearMisses:0, injured:false, incident:null, matchTime:0, workTime:0, active:0, walk:0, crossed:false }));
        this.autoCrew();
        this.recompute();
    }
    on(fn) { this.listeners.push(fn); }
    emit(type, d = {}) { for (const fn of this.listeners) fn(type, d); }
    clock() { const h = SHIFT_START_HOUR + Math.floor(this.t / 60), m = Math.floor(this.t % 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
    get hour() { return Math.floor(this.t / RUSH_HOUR); }

    // ----------------------------------------------------------------- nodes
    addNode(type)
    {
        const used = this.nodes.filter(n => n.type === type).length;
        const slot = RUSH_SLOTS[type][used];
        if (!slot) return null;
        const n = { id:this.nextId++, type, x:slot[0], y:slot[1], pile:[], queue:[], over:0, slots:[], label:'' };
        if (type === 'door')
        {
            const d = RUSH_DOORS[this.nodes.filter(m => m.type === 'door').length];
            Object.assign(n, { door:d, truck:{ load:0, cap:8, patience:105, left:105, away:0 }, slots:[null] });
        }
        if (type === 'bench') n.slots = [null, null];
        if (type === 'cage') n.slots = [null];
        if (type === 'dock') n.spawnW = 1;
        this.nodes.push(n);
        this.emit('nodeOpen', { n });
        return n;
    }
    node(id) { return this.nodes.find(n => n.id === id); }
    doors() { return this.nodes.filter(n => n.type === 'door'); }
    zoneOf(n) { return n.type === 'bench' ? 'orange' : n.type === 'cage' ? 'purple' : n.type === 'door' ? 'red' : null; }
    capOf(n) { return n.type === 'dock' ? 14 : n.type === 'door' ? 12 : 10; }

    // ----------------------------------------------------------------- crew
    autoCrew()
    {
        const free = ()=> this.workers.filter(w => !w.slot && !w.injured);
        const place = (n, zone)=>
        {
            for (let i = 0; i < n.slots.length; i++)
            {
                if (n.slots[i]) continue;
                const w = free().sort((a, b)=> zoneRating(b.s, zone) - zoneRating(a.s, zone))[0];
                if (!w) return;
                this.assign(w, n, i, true);
            }
        };
        for (const n of this.nodes.filter(n => n.type === 'bench')) place(n, 'orange');
        for (const n of this.nodes.filter(n => n.type === 'cage')) place(n, 'purple');
        for (const n of this.doors()) place(n, 'red');
    }
    assign(w, n, i, quiet = false)
    {
        if (w.injured) return false;
        if (w.slot) { const o = this.node(w.slot.node); if (o) o.slots[w.slot.i] = null; }
        if (!n) { w.slot = null; if (!quiet) this.emit('toBreak', { w }); return true; }
        if (i == null) i = n.slots.findIndex(x => !x);
        if (i < 0) return false;
        const prevX = w.slot ? this.node(w.slot.node)?.x : -20;
        if (n.slots[i]) { const other = this.workers.find(o => o.id === n.slots[i]); if (other) other.slot = null; }
        n.slots[i] = w.id;
        w.slot = { node:n.id, i };
        w.walk = quiet ? 0 : 1.2;
        // crossing the forklift road on foot is risky
        const cross = (prevX ?? -20) < RUSH_ROAD_X && n.x > RUSH_ROAD_X || (prevX ?? -20) > RUSH_ROAD_X && n.x < RUSH_ROAD_X;
        if (cross && !quiet && Math.random() < .12 * (1.6 - w.s.attrs.safety / 20) * modMul('risk')) this.raise(w, 'strike');
        if (!quiet) this.emit('assign', { w, n, match: bestZone(w.s) === this.zoneOf(n) });
        return true;
    }
    workerSpeed(w, n)
    {
        const zone = this.zoneOf(n);
        let sp = .55 + zoneRating(w.s, zone) * .045;
        sp *= .7 + .3 * clamp(w.energy / 100, 0, 1);
        sp *= .9 + .2 * w.s.morale / 100;
        if (bestZone(w.s) === zone) sp *= 1.25;                     // COLOUR MATCH
        if (n.type === 'cage' && !w.s.certs.includes('hazmat')) sp *= .6;
        return sp * modMul('speed');
    }

    // ----------------------------------------------------------------- lines
    lineFree() { return this.res.lines - this.lines.length; }
    runnersFree() { return this.res.runners - this.lines.reduce((a, l)=> a + l.runners.length, 0); }
    segCrosses(a, b) { const L = RUSH_ROAD_X - RUSH_ROAD_W / 2, R = RUSH_ROAD_X + RUSH_ROAD_W / 2; return (a.x < L && b.x > R) || (a.x > R && b.x < L); }
    bridgesUsed(except) { let n = 0; for (const l of this.lines) if (l !== except) for (let i = 0; i < l.path.length - 1; i++) if (this.segCrosses(this.node(l.path[i]), this.node(l.path[i + 1]))) n++; return n; }
    bridgesFree(except) { return this.res.bridges - this.bridgesUsed(except); }
    commitLine(line)
    {
        // line: { id?, path:[nodeIds], color }
        if (line.path.length < 2) return false;
        let crosses = 0;
        for (let i = 0; i < line.path.length - 1; i++) if (this.segCrosses(this.node(line.path[i]), this.node(line.path[i + 1]))) crosses++;
        const existing = this.lines.find(l => l.id === line.id);
        if (crosses > this.bridgesFree(existing)) { this.emit('noBridge', {}); return false; }
        if (existing) { existing.path = line.path; for (const r of existing.runners) { r.seg = Math.min(r.seg, existing.path.length - 2); r.t = Math.min(r.t, 1); } }
        else
        {
            if (this.lineFree() <= 0) return false;
            const used = this.lines.map(l => l.color);
            const l = { id:this.nextId++, path:line.path, color: RUSH_LINE_COLORS.find(c => !used.includes(c)) || '#444', runners:[] };
            this.lines.push(l);
            if (this.runnersFree() > 0) this.addRunner(l);
            this.emit('lineNew', { l });
        }
        this.recompute();
        return true;
    }
    removeLine(l)
    {
        for (const r of l.runners) for (const p of r.load) { const n = this.node(l.path[Math.min(l.path.length - 1, r.t > .5 ? r.seg + 1 : r.seg)]); p.at = n.id; n.pile.push(p); }
        this.lines = this.lines.filter(x => x !== l);
        this.recompute();
    }
    addRunner(l) { if (this.runnersFree() <= 0) return false; l.runners.push({ id:this.nextId++, seg:0, t:Math.random() * .5, dir:1, load:[], dwell:0, jam:0 }); return true; }
    removeRunner(l)
    {
        const r = l.runners.pop(); if (!r) return false;
        const n = this.node(l.path[r.t > .5 ? r.seg + 1 : r.seg]);
        for (const p of r.load) { p.at = n.id; n.pile.push(p); }
        return true;
    }

    // routing: distances from every node to each goal set
    recompute()
    {
        const adj = {};
        for (const n of this.nodes) adj[n.id] = new Set();
        for (const l of this.lines) for (let i = 0; i < l.path.length - 1; i++) { adj[l.path[i]].add(l.path[i + 1]); adj[l.path[i + 1]].add(l.path[i]); }
        this.adj = adj;
        const bfs = (targets)=>
        {
            const d = {}; const q = [];
            for (const t of targets) { d[t] = 0; q.push(t); }
            while (q.length) { const u = q.shift(); for (const v of adj[u] || []) if (d[v] === undefined) { d[v] = d[u] + 1; q.push(v); } }
            return d;
        };
        this.dist = { pack: bfs(this.nodes.filter(n => n.type === 'bench').map(n => n.id)), haz: bfs(this.nodes.filter(n => n.type === 'cage').map(n => n.id)) };
        for (const n of this.doors()) this.dist['door:' + n.door.key] = bfs([n.id]);
    }
    goal(p) { return !p.packed ? (p.hazmat ? 'haz' : 'pack') : 'door:' + p.dest; }
    d(nodeId, goal) { const v = this.dist[goal]?.[nodeId]; return v === undefined ? Infinity : v; }
    nextOnLine(l, seg, dir)
    {
        // node index the runner heads to after arriving at node index (seg) in direction dir
        let idx = seg + dir;
        if (idx < 0 || idx >= l.path.length) idx = seg - dir;
        return l.path[idx];
    }

    // ----------------------------------------------------------------- spawning
    spawn(n)
    {
        const doors = this.doors();
        const door = doors[Math.floor(Math.random() * doors.length)];
        const hazmat = this.hazmatOn && Math.random() < .12;
        const p = { id:this.nextId++, dest:door.door.key, packed:false, hazmat, rush: Math.random() < .07, born:this.t, at:n.id };
        if (p.rush) p.due = this.t + 70;
        n.pile.push(p);
        this.stats.spawned++;
    }

    // ----------------------------------------------------------------- step
    step(dt)
    {
        if (this.done || this.pendingUpgrade) return;
        this.t += dt;
        // hour ticks: Mini Metro style upgrade choice
        if (this.hour > this.hourShown && this.t < this.duration - 5)
        {
            this.hourShown = this.hour;
            this.stats.hourly.push(this.stats.delivered * RUSH_SCALE);
            const pool = Object.keys(RUSH_UPGRADES).filter(k => k !== 'bench' || this.nodes.filter(n => n.type === 'bench').length < RUSH_SLOTS.bench.length);
            const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0], b = pool[Math.floor(Math.random() * pool.length)];
            this.pendingUpgrade = [a, b];
            this.emit('upgrade', { choices:[a, b], hour:SHIFT_START_HOUR + this.hour });
            return;
        }
        for (const u of this.unlocks) if (!u.done && this.t >= u.t)
        {
            u.done = true;
            if (u.k === 'cage') { const n = this.addNode('cage'); this.hazmatOn = true; if (n) this.autoPlace(n); }
            else { const n = this.addNode(u.k); if (n && n.type === 'door') this.autoPlace(n); }
            this.recompute();
        }
        // arrivals ramp up through the shift, with truck waves
        const prog = this.t / SHIFT_SECONDS;
        const rate = this.total / SHIFT_SECONDS / 1.39 * (.8 + .8 * prog) * (1 + .5 * Math.max(0, Math.sin(this.t / 22)));
        this.spawnAcc += rate * dt * (this.t < SHIFT_SECONDS - 15 ? 1 : 0);
        const docks = this.nodes.filter(n => n.type === 'dock');
        while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawn(docks[Math.floor(Math.random() * docks.length)]); }

        this.updateRunners(dt);
        this.updateStations(dt);
        this.updateTrucks(dt);
        this.updateIncidents(dt);
        this.updateOverflow(dt);
        if (this.stats.comboT > 0) { this.stats.comboT -= dt; if (this.stats.comboT <= 0) this.stats.combo = 0; }
        if (this.t >= this.duration) this.finish();
    }
    autoPlace(n)
    {
        const zone = this.zoneOf(n);
        const w = this.workers.filter(w => !w.slot && !w.injured).sort((a, b)=> zoneRating(b.s, zone) - zoneRating(a.s, zone))[0];
        if (w) this.assign(w, n, 0, true);
    }

    updateRunners(dt)
    {
        for (const l of this.lines)
        {
            const n = l.path.length;
            for (const r of l.runners)
            {
                if (r.jam > 0) continue;
                if (Math.random() < .0016 * dt * (1 - this.fac.conveyors * .1)) { r.jam = 1; this.stats.jams++; this.emit('jam', { l, r }); continue; }
                if (r.dwell > 0) { r.dwell -= dt; continue; }
                const a = this.node(l.path[r.seg]), b = this.node(l.path[r.seg + 1]);
                if (!a || !b) { r.seg = 0; r.t = 0; continue; }
                const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                r.t += dt * this.res.speed / len * r.dir;
                if (r.t >= 1 || r.t <= 0)
                {
                    // arrived at a node
                    const idx = r.t >= 1 ? r.seg + 1 : r.seg;
                    r.t = r.t >= 1 ? 1 : 0;
                    let dir = r.dir;
                    if (idx === n - 1 && dir > 0) dir = -1; else if (idx === 0 && dir < 0) dir = 1;
                    this.arrive(l, r, idx, dir);
                    r.dir = dir;
                    if (dir > 0) { r.seg = idx; r.t = 0; } else { r.seg = idx - 1; r.t = 1; }
                    if (r.seg < 0) { r.seg = 0; r.t = 0; r.dir = 1; }
                    if (r.seg > n - 2) { r.seg = n - 2; r.t = 1; r.dir = -1; }
                    r.dwell = .35;
                }
            }
        }
    }
    arrive(l, r, idx, dir)
    {
        const node = this.node(l.path[idx]);
        const next = l.path[idx + dir];
        // unload: arrived, or this line no longer helps
        const keep = [];
        for (const p of r.load)
        {
            const g = this.goal(p);
            if (this.d(node.id, g) === 0) { this.deliver(p, node); continue; }
            if (next != null && this.d(next, g) < this.d(node.id, g)) keep.push(p);
            else { p.at = node.id; node.pile.push(p); }
        }
        r.load = keep;
        // load: rush first, then oldest, only if heading closer to their goal
        if (next == null) return;
        node.pile.sort((a, b)=> (b.rush ? 1 : 0) - (a.rush ? 1 : 0) || a.born - b.born);
        for (let i = 0; i < node.pile.length && r.load.length < this.res.tote; i++)
        {
            const p = node.pile[i], g = this.goal(p);
            if (this.d(next, g) < this.d(node.id, g)) { r.load.push(p); node.pile.splice(i, 1); i--; }
        }
        if (r.load.length) this.emit('load', { node });
    }
    deliver(p, node)
    {
        if (node.type === 'bench' || node.type === 'cage') { node.queue.push(p); return; }
        if (node.type === 'door') { node.pile.push(p); p.atDoor = true; return; }
        node.pile.push(p);
    }
    updateStations(dt)
    {
        for (const n of this.nodes)
        {
            if (n.type !== 'bench' && n.type !== 'cage') continue;
            for (const id of n.slots)
            {
                const w = id && this.workers.find(x => x.id === id);
                if (!w || w.injured) continue;
                w.active += dt;
                if (w.walk > 0) { w.walk -= dt; continue; }
                if (!w.job && n.queue.length) { n.queue.sort((a, b)=> (b.rush ? 1 : 0) - (a.rush ? 1 : 0)); w.job = n.queue.shift(); w.prog = 0; }
                if (!w.job) { w.energy = Math.min(100, w.energy + dt * .1); continue; }
                w.workTime += dt;
                w.energy = Math.max(0, w.energy - dt * .11 * (1.3 - w.s.attrs.stamina / 33));
                if (bestZone(w.s) === this.zoneOf(n)) w.matchTime += dt;
                w.prog += dt * this.workerSpeed(w, n) / (n.type === 'cage' ? 3.2 : 2.4);
                if (!w.incident && Math.random() < .0022 * dt * (2 - w.s.attrs.safety / 14) * (1.5 - w.energy / 200) * traitMod(w.s, 'risk') * modMul('risk') * (1 - this.fac.safety * .08)) this.raise(w, 'falling');
                if (w.prog >= 1)
                {
                    const p = w.job; w.job = null; w.processed++;
                    p.packed = true; p.at = n.id;
                    n.pile.push(p);
                    this.emit('packed', { w, n, p });
                }
            }
        }
        // break room recovery
        for (const w of this.workers) if (!w.slot && !w.injured) w.energy = Math.min(100, w.energy + dt * (.8 + this.fac.breakroom * .2));
    }
    updateTrucks(dt)
    {
        for (const n of this.doors())
        {
            const tr = n.truck;
            if (tr.away > 0) { tr.away -= dt; if (tr.away <= 0) { tr.load = 0; tr.left = tr.patience; this.emit('truckIn', { n }); } continue; }
            tr.left -= dt;
            // loading: slow gate staff, much faster with a loader worker
            let rate = .45;
            const w = n.slots[0] && this.workers.find(x => x.id === n.slots[0]);
            if (w && !w.injured && w.walk <= 0) { rate += 1.4 * this.workerSpeed(w, n); w.active += dt; if (n.pile.length) { w.workTime += dt; w.energy = Math.max(0, w.energy - dt * .09); if (bestZone(w.s) === 'red') w.matchTime += dt; } }
            else if (w) { w.walk -= dt; }
            tr.acc = (tr.acc || 0) + (n.pile.length ? rate * dt : 0);
            while (tr.acc >= 1 && n.pile.length && tr.load < tr.cap)
            {
                tr.acc--;
                const p = n.pile.shift();
                tr.load++;
                this.stats.delivered++;
                if (w) w.processed++;
                if (p.rush) { this.stats.rushShipped++; if (this.t > p.due) this.stats.lateRush++; }
                this.stats.combo++; this.stats.comboT = 2.5;
                this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
                this.emit('loaded', { n, p, combo:this.stats.combo });
            }
            if (!n.pile.length) tr.acc = 0;
            if (tr.load >= tr.cap || tr.left <= 0)
            {
                const full = tr.load >= tr.cap;
                this.stats.trucks++;
                if (full) this.stats.fullTrucks++;
                else if (tr.load < tr.cap * .4) { this.stats.halfEmpty++; }
                this.emit('truckOut', { n, full, load:tr.load });
                tr.away = 3.5;
            }
        }
    }
    updateOverflow(dt)
    {
        // parcels that can't reach their goal on the current network (Mini Metro: link your lines!)
        this.routeT = (this.routeT || 0) - dt;
        if (this.routeT <= 0)
        {
            this.routeT = .5;
            for (const n of this.nodes)
            {
                const stuck = new Set();
                if (!this.lines.some(l => l.path.includes(n.id))) { n.noRoute = []; continue; }   // unlinked: the overflow ring says enough
                for (const p of n.pile) { const g = this.goal(p); if (!(n.type === 'door' && p.atDoor) && this.d(n.id, g) === Infinity) stuck.add(p.hazmat && !p.packed ? 'haz' : p.packed ? p.dest : 'pack'); }
                n.noRoute = [...stuck];
                n.warned = (n.warned || []).filter(k => stuck.has(k));
                for (const k of stuck) if (!n.warned.includes(k) && n.pile.length >= 2) { n.warned.push(k); this.emit('noRoute', { n, k }); }
            }
        }
        for (const n of this.nodes)
        {
            const count = n.pile.length + n.queue.length;
            const over = count >= this.capOf(n);
            const before = n.over;
            n.over = over ? n.over + dt / 34 : Math.max(0, n.over - dt / 12);
            if (over && before === 0) { this.stats.overflows++; this.emit('overflow', { n }); }
            if (n.over >= 1) { this.stats.collapse = true; this.emit('gridlock', { n }); this.finish(); return; }
        }
    }

    // ----------------------------------------------------------------- incidents (tap to save)
    raise(w, type)
    {
        if (w.incident || w.injured) return;
        const inc = { id:this.nextId++, w, type, t0:this.t, window: type === 'strike' ? 2.8 + w.s.attrs.concentration * .05 : 4.5 + w.s.attrs.concentration * .1, done:false };
        w.incident = inc;
        this.incidents.push(inc);
        this.emit('incident', { inc, w });
    }
    intervene(inc)
    {
        if (inc.done) return;
        inc.done = true; inc.w.incident = null;
        this.stats.avoided++;
        this.emit('avoided', { inc, w:inc.w });
    }
    clearJam(r) { if (r.jam) { r.jam = 0; this.emit('jamCleared', { r }); } }
    updateIncidents()
    {
        for (const inc of this.incidents)
        {
            if (inc.done || this.t - inc.t0 < inc.window) continue;
            inc.done = true;
            const w = inc.w; w.incident = null;
            if (w.injured) continue;
            const d = INCIDENT_DEFS[inc.type];
            const pInj = .45 * d.sevMul * (1.5 - w.s.attrs.concentration / 20) * (1 - this.fac.safety * .08);
            if (Math.random() < pInj)
            {
                const serious = Math.random() < .14 * d.sevMul * (w.s.hidden.injuryProne / 10) * (1 - this.fac.safety * .1);
                const row = wmPick(INJURY_TABLE.filter(r => r[3] === serious));
                const inj = { id:w.s.id, name:w.s.name, label:row[0], days:wmRI(row[1], row[2]), serious, fine: serious ? Math.round((1500 + Math.random() * 4500) * (1 - this.fac.safety * .1) / 100) * 100 : 0, cause:d.label, zone: w.slot ? this.zoneOf(this.node(w.slot.node)) || 'bench' : 'bench', type:inc.type };
                if (serious && Math.random() < .1 * d.sevMul * (1 - this.fac.safety * .12)) { inj.fatal = true; inj.label = 'Fatal accident'; inj.days = 999; inj.cause = inc.type === 'falling' ? FATAL_CAUSES[0] : FATAL_CAUSES[1]; }
                this.stats.injuries.push(inj);
                w.injured = true;
                if (w.job) { const n = this.node(w.slot.node); n.queue.unshift(w.job); w.job = null; }
                if (w.slot) { const n = this.node(w.slot.node); if (n) n.slots[w.slot.i] = null; }
                this.emit('injury', { inc, w, inj });
            }
            else { this.stats.nearMisses++; w.nearMisses++; this.emit('nearMiss', { inc, w }); }
        }
    }

    // ----------------------------------------------------------------- upgrades
    applyUpgrade(k)
    {
        if (k === 'line') this.res.lines++;
        if (k === 'runner') this.res.runners++;
        if (k === 'bridge') this.res.bridges += 2;
        if (k === 'tote') this.res.tote += 2;
        if (k === 'turbo') this.res.speed *= 1.15;
        if (k === 'bench') { const n = this.addNode('bench'); if (n) { this.autoPlace(n); this.recompute(); } }
        if (k === 'temp')
        {
            const s = makeStaff({ quality: 7, zone:'orange', scouted:true });
            s.name = 'Temp ' + s.name.split(' ')[0]; s.temp = true;
            this.workers.push({ id:s.id, s, slot:null, energy:100, processed:0, errors:0, nearMisses:0, injured:false, incident:null, matchTime:0, workTime:0, active:0, walk:0, temp:true });
        }
        this.pendingUpgrade = null;
        this.emit('upgraded', { k });
    }

    finish() { if (this.done) return; this.done = true; for (const i of this.incidents) i.done = true; this.emit('finish', {}); }
    unitsPerHour() { return Math.round(this.stats.delivered * RUSH_SCALE * UNITS_PER_PARCEL / Math.max(.25, this.t / 60)); }
    waiting() { let n = 0; for (const x of this.nodes) n += x.pile.length + x.queue.length; for (const l of this.lines) for (const r of l.runners) n += r.load.length; return n; }

    // same shape as ShiftSim.result() so the whole career layer just works
    result()
    {
        const st = this.stats, c = this.c, t = TIER_DEFS[c.tier];
        const shipped = st.delivered * RUSH_SCALE;
        const remaining = Math.max(0, this.total - st.spawned) * (st.collapse ? 1 : 0);
        const backlog = (this.waiting() + remaining) * RUSH_SCALE;
        const units = shipped * UNITS_PER_PARCEL;
        const comboBonus = 1 + Math.min(.15, st.bestCombo * .004) + st.fullTrucks * .004;
        const revenue = Math.round(units * t.rate * comboBonus * modMul('revenue'));
        const penalties = st.lateRush * 25 * RUSH_SCALE + st.halfEmpty * 50 + backlog * 2 + (st.collapse ? 900 : 0);
        const fines = st.injuries.reduce((a, i)=> a + i.fine, 0);
        const energyCost = 180 + c.tier * 60;
        const dailyWages = Math.round(c.staff.reduce((a, s)=> a + s.wage, 0) / WEEK_SHIFTS * (c.manager.perks?.wages ?? 1));
        const temps = this.workers.filter(w => w.temp).length * 90;
        const totalCost = penalties + fines + energyCost + dailyWages + temps;
        const onTime = clamp((shipped - st.lateRush * RUSH_SCALE) / Math.max(1, shipped + backlog), 0, 1);
        const csat = clamp(onTime * (1 - st.halfEmpty * .02), 0, 1);
        const workers = this.workers.filter(w => !w.temp).map(w =>
        {
            let rating = 0;
            if (w.active > 30 || w.injured)
            {
                const util = w.workTime / Math.max(1, w.active);
                rating = 6 + Math.min(2.5, w.processed / 14) + (util > .6 ? .4 : 0) + w.matchTime / Math.max(1, w.active) * .6 - w.nearMisses * .2 - (w.injured ? .8 : 0);
                rating = wmRound1(clamp(rating, 3, 10));
            }
            const n = w.slot && this.node(w.slot.node);
            return { id:w.id, name:w.s.name, zone: n ? this.zoneOf(n) : 'bench', rating, processed:w.processed, errors:0, repairs:0, energy:Math.round(w.energy), injured:w.injured, nearMisses:w.nearMisses, jaywalks:0, moraleDelta:0 };
        });
        const workerOfShift = [...workers].filter(w => w.rating).sort((a, b)=> b.rating - a.rating)[0] || null;
        workers.sort((a, b)=> b.rating - a.rating);
        return {
            shipped, units, target:this.forecast.target, forecast:this.forecast.volume, arrived: st.spawned * RUSH_SCALE,
            backlog, revenue, penalties, fines, energyCost, overtimeCost:temps, contractorCost:0, dailyWages, totalCost, profit: revenue - totalCost,
            cpu: units ? totalCost / units : 0, onTime, csat, defects:0, damaged:0, caught:0, lateRush:st.lateRush * RUSH_SCALE, rushShipped:st.rushShipped * RUSH_SCALE,
            returns:0, nearMisses:st.nearMisses, avoided:st.avoided, injuries:st.injuries, peakFlow: Math.min(5, 1 + Math.floor(st.bestCombo / 8)), avgFlow:1 + st.fullTrucks * .05,
            bottlenecks:st.overflows, breakdowns:st.jams, uph:this.unitsPerHour(), overtimeHours:0, simulated:false, hourly:[...st.hourly, shipped],
            workers, workerOfShift, zoneProcessed:{}, jaywalks:0, crossings:0, crossWait:0, forkliftBrakes:0,
            rush:{ trucks:st.trucks, fullTrucks:st.fullTrucks, halfEmpty:st.halfEmpty, bestCombo:st.bestCombo, collapse:st.collapse, lines:this.lines.length, jams:st.jams },
        };
    }
}
