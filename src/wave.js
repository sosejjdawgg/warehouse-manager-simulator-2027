'use strict';
// ============================================================================
// THE SHIFT — waves of goods, Mini Metro routes, Diner Dash moods.
//
//  Trailers back on to GOODS IN in waves and get tipped onto the dock. Every
//  box is colour-coded by CLIENT and carries a job ticket: the teams it must
//  visit (Booking-in → Pack → Despatch…) before it can go out of that
//  client's door. You place the team ZONES once per shift (set-up), then draw
//  one ROUTE per client from Goods In, through zones, to the client's door.
//  General operatives walk the routes carrying light boxes; forklifts shift
//  heavy pallets fast but are dangerous where routes cross. Specialists stay
//  in their zone. Piles stack into pyramids, wobble and TOPPLE, blocking
//  routes. Staff and trailer drivers have moods. At despatch cut-off whatever
//  is left becomes the overtime question.
// ============================================================================

const WV_ZONES =
{
    bookin:   { zone:'blue',   name:'Booking-in', short:'BOOKING-IN', icon:'📋', time:1.8 },
    qc:       { zone:'grey',   name:'QC',         short:'QC',         icon:'🔍', time:2.9 },
    putaway:  { zone:'green',  name:'Putaway',    short:'PUTAWAY',    icon:'🗄️', time:2.5 },
    pick:     { zone:'yellow', name:'Pick',       short:'PICK',       icon:'🛒', time:2.5 },
    pack:     { zone:'orange', name:'Pack',       short:'PACK',       icon:'📦', time:2.7 },
    dg:       { zone:'purple', name:'DG Cage',    short:'DG CAGE',    icon:'☣️', time:3.4, cert:'hazmat' },
    despatch: { zone:'red',    name:'Despatch',   short:'DESPATCH',   icon:'🏷️', time:2.0 },
};
const WV_CLIENTS =
[
    { key:'red',    hex:'#e5383b', shape:'tri',     name:'Parkway DIY',       recipe:['bookin', 'despatch'],                          heavy:.35 },
    { key:'blue',   hex:'#2f7fe8', shape:'circle',  name:'Harbour & Co',      recipe:['bookin', 'pack', 'despatch'],                  heavy:.04 },
    { key:'green',  hex:'#2fb344', shape:'square',  name:'FreshFolk Home',    recipe:['bookin', 'qc', 'pack', 'despatch'],            heavy:.12 },
    { key:'yellow', hex:'#f2b705', shape:'star',    name:'Zoomly Online',     recipe:['bookin', 'putaway', 'pick', 'pack', 'despatch'], heavy:0 },
    { key:'purple', hex:'#9b5de5', shape:'diamond', name:'Vantage Chemicals', recipe:['bookin', 'dg', 'despatch'],                    heavy:.4, dg:true },
    { key:'teal',   hex:'#14b8a6', shape:'hex',     name:'Medix Pharma',      recipe:['bookin', 'qc', 'pick', 'pack', 'despatch'],    heavy:0 },
];
// per career tier: site size and kit
const WV_TIERS =
[
    { docks:1, clients:2, zones:['bookin', 'pack', 'despatch'],                                                       forklifts:1, waves:4, seats:2, crew:6,  ppb:3,   utilities:120 },
    { docks:2, clients:3, zones:['bookin', 'qc', 'pack', 'despatch'],                                                 forklifts:2, waves:4, seats:2, crew:10,  ppb:3.5, utilities:210 },
    { docks:2, clients:5, zones:['bookin', 'bookin', 'qc', 'putaway', 'pick', 'pack', 'dg', 'despatch'],              forklifts:3, waves:5, seats:2, crew:16, ppb:4,   utilities:340 },
    { docks:3, clients:6, zones:['bookin', 'bookin', 'qc', 'putaway', 'pick', 'pack', 'pack', 'dg', 'despatch'],      forklifts:4, waves:5, seats:3, crew:19, ppb:4.5, utilities:500 },
    { docks:3, clients:6, zones:['bookin', 'bookin', 'qc', 'putaway', 'pick', 'pack', 'pack', 'dg', 'despatch'],      forklifts:5, waves:6, seats:3, crew:23, ppb:5,   utilities:700 },
    { docks:4, clients:6, zones:['bookin', 'bookin', 'qc', 'putaway', 'pick', 'pack', 'pack', 'dg', 'despatch', 'despatch'], forklifts:6, waves:6, seats:3, crew:27, ppb:5.5, utilities:950 },
];
const WV_MOODS = [ [75, 'Buzzing', '😄'], [50, 'Grafting', '🙂'], [30, 'Cheesed off', '😒'], [10, 'Fuming', '😡'], [-1, 'Walked out', '🚪'] ];
const WV_DRIVER = [ [.6, 'Sound', '🙂'], [.35, 'Checking the clock', '😐'], [.12, 'Leaning on the horn', '😠'], [-1, 'Kicking off', '🤬'] ];
const WV_PILE_SAFE = 10;                 // pyramid rows 4-3-2-1
const WV_AREA = { minX:-10.8, maxX:10.8, minY:-7.6, maxY:7.8 };
const WV_BREAK = { x:6, y:-11, w:19.6, h:2.4 };   // staff room: rest, brews
const WV_BAY = { x:-10.4, y:-11, w:11, h:2.4 };     // forklift bay
const WV_BOUNDS = { minX:-20.8, maxX:20.8, minY:-12.4, maxY:9.8 };
const WV_WALL = 16.4;                              // building walls; trailers park outside
const wvMood = (m)=> WV_MOODS.find(r => m >= r[0]) || WV_MOODS[WV_MOODS.length - 1];
const wvDriver = (f)=> WV_DRIVER.find(r => f >= r[0]) || WV_DRIVER[WV_DRIVER.length - 1];
const wvSiteFor = (tier)=> WV_TIERS[Math.min(tier, WV_TIERS.length - 1)];

// ---------------------------------------------------------------------------
class WaveSim
{
    constructor(c, opts = {})
    {
        this.c = c;
        this.site = wvSiteFor(c.tier);
        this.forecast = shiftForecast();
        this.fac = { ...c.facilities };
        this.listeners = [];
        this.nextId = 1;
        this.t = 0;
        this.duration = SHIFT_SECONDS;
        this.phase = 'setup';            // setup → live → cutoff → overtime → done
        this.done = false;
        this.assistantOn = !!opts.assistant;
        this.clients = WV_CLIENTS.slice(0, this.site.clients);
        this.ppb = this.site.ppb;
        this.total = Math.max(30, Math.round(this.forecast.volume / this.ppb));
        this.nodes = []; this.lines = []; this.carriers = []; this.spills = []; this.incidents = []; this.inbound = []; this.vans = [];
        this.crossings = [];
        this.stats = { despatched:0, onTime:0, ordered:0, misSent:0, damaged:0, toppled:0, fullTrailers:0, partTrailers:0, shortBoxes:0, demurrage:0,
            avoided:0, nearMisses:0, injuries:[], walkOuts:0, brews:0, agency:0, contractor:0, hseFine:0, waveBonus:0, overtimeHours:0, overtimeCost:0,
            lateLoaded:0, hourly:[], crossings:0, breakdowns:0, carryOver:0 };
        this.brewT = 0; this.agencyCalls = 0; this.hse = null; this.alarm = 0; this.stars = 3;

        // fixed: goods-in docks on the west wall, client doors on the east wall
        for (let i = 0; i < this.site.docks; i++)
        {
            const y = this.site.docks === 1 ? 1 : 7 - i * 14 / (this.site.docks - 1);
            this.addNode({ type:'dock', x:-14.6, y });
        }
        this.clients.forEach((cl, i)=>
        {
            const n = this.clients.length, y = n === 1 ? 0 : 7.2 - i * 14.6 / (n - 1);
            const d = this.addNode({ type:'door', x:14.6, y, client:cl });
            d.trailers = [];
        });
        // zones start in a sensible suggested layout; drag them anywhere during set-up
        this.site.zones.forEach((zt, i)=> this.addNode({ type:'zone', ztype:zt, x:0, y:0, seats:Array(this.site.seats).fill(null), inq:[], busy:[] }));
        this.suggestLayout();

        // crew: the rota (lineup), capped to the site's crew size
        const rota = c.staff.filter(s => !s.injury && c.lineup[s.id] && c.lineup[s.id] !== 'bench');
        const pool = (rota.length ? rota : c.staff.filter(s => !s.injury)).slice(0, Math.max(this.site.crew, 3));
        this.workers = pool.map(s => this.makeWorker(s));
        this.forklifts = Array.from({ length:this.site.forklifts }, ()=> ({ id:this.nextId++, driver:null, broken:0, fixing:0 }));
        this.autoCrew();
        this.planWaves();
    }
    on(fn) { this.listeners.push(fn); }
    emit(type, d = {}) { for (const fn of this.listeners) fn(type, d); }
    makeWorker(s, temp = false)
    {
        const pay = s.wage / Math.max(100, fairWage(staffAbility(s)));
        const base = clamp(30 + s.morale * .45 + (pay - 1) * 70 + this.fac.breakroom * 2, 20, 96);
        return { id:s.id, s, temp, role:'op', node:null, seat:null, carrier:null, mood:base, base, pay, energy:s.condition,
            processed:0, carried:0, injured:false, gone:false, resting:false, job:null, prog:0, lastDone:0, nearMisses:0, active:0, workTime:0, incident:null };
    }
    addNode(o) { const n = { id:this.nextId++, out:[], wobble:0, shore:0, ...o }; this.nodes.push(n); return n; }
    node(id) { return this.nodes.find(n => n.id === id); }
    zones() { return this.nodes.filter(n => n.type === 'zone'); }
    docks() { return this.nodes.filter(n => n.type === 'dock'); }
    doors() { return this.nodes.filter(n => n.type === 'door'); }
    doorOf(key) { return this.doors().find(d => d.client.key === key); }
    clock() { const m = Math.floor(this.t), h = SHIFT_START_HOUR + Math.floor(m / 60); return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
    pile(n) { return n.out.length + (n.inq ? n.inq.length : 0); }

    // ----------------------------------------------------------------- set-up
    suggestLayout()
    {
        const col = { bookin:-8.6, qc:-4.3, putaway:-4.3, dg:0, pick:0, pack:4.3, despatch:8.6 };
        const used = {};
        const zs = this.zones();
        for (const n of zs)
        {
            const same = zs.filter(z => col[z.ztype] === col[n.ztype]);
            const k = used[col[n.ztype]] = (used[col[n.ztype]] || 0) + 1;
            const m = same.length;
            n.x = col[n.ztype] + (n.ztype === 'dg' ? 0 : 0);
            n.y = m === 1 ? (n.ztype === 'dg' ? -5 : 1) : 6 - (k - 1) * 12 / (m - 1);
        }
    }
    canPlace(n, x, y)
    {
        if (x < WV_AREA.minX || x > WV_AREA.maxX || y < WV_AREA.minY || y > WV_AREA.maxY) return false;
        return !this.zones().some(z => z !== n && Math.abs(z.x - x) < 4.2 && Math.abs(z.y - y) < 3.6);
    }
    moveZone(n, x, y)
    {
        if (this.phase !== 'setup') return false;
        x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2;
        if (!this.canPlace(n, x, y)) return false;
        n.x = x; n.y = y;
        this.recompute();
        return true;
    }
    autoCrew()
    {
        // specialists into their own team's zone, forklift drivers, the rest are general operatives
        for (const w of this.workers) this.unseat(w);
        const free = ()=> this.workers.filter(w => w.role === 'op' && !w.carrier?.flt && !w.temp);
        for (const f of this.forklifts)
        {
            const keen = (w)=> ['op', 'green'].includes(this.c.lineup[w.s.id]) ? 3 : 0;
            const d = free().filter(w => w.s.certs.includes('forklift')).sort((a, b)=> zoneRating(b.s, 'green') + keen(b) - zoneRating(a.s, 'green') - keen(a))[0];
            if (d) this.setDriver(f, d);
        }
        // first seat in every zone, then second seats, best fit first
        for (let pass = 0; pass < this.site.seats; pass++)
            for (const n of this.zones())
            {
                const team = WV_ZONES[n.ztype].zone;
                const cand = free().filter(w => this.forkliftOf(w) == null && this.c.lineup[w.s.id] !== 'op' && (!WV_ZONES[n.ztype].cert || w.s.certs.includes(WV_ZONES[n.ztype].cert)))
                    .sort((a, b)=> (this.c.lineup[b.s.id] === team) - (this.c.lineup[a.s.id] === team) || zoneRating(b.s, team) - zoneRating(a.s, team));
                const w = cand[0];
                if (!w) continue;
                // keep enough operatives on the floor to walk the routes
                if (pass > 0 && free().filter(o => this.forkliftOf(o) == null).length <= this.clients.length) continue;
                if (pass > 0 && zoneRating(w.s, team) < 9) continue;
                this.seat(w, n, n.seats.findIndex(x => !x));
            }
    }
    forkliftOf(w) { const f = this.forklifts.find(f => f.driver === w); return f ? f : null; }
    setDriver(f, w)
    {
        if (f.driver)
        {
            const d = f.driver; f.driver = null;
            this.dropCarrier(d); d.role = 'op';
            if (this.phase !== 'setup') this.makeCarrier({ kind:'op', w:d });
        }
        if (!w) return true;
        if (!w.s.certs.includes('forklift')) return false;
        const of = this.forkliftOf(w); if (of) of.driver = null;
        this.unseat(w); this.dropCarrier(w);
        w.role = 'flt'; w.resting = false;
        f.driver = w;
        this.makeCarrier({ kind:'flt', w, f });
        this.emit('driver', { w, f });
        return true;
    }
    seat(w, n, i)
    {
        if (this.phase !== 'setup' || i < 0 || i >= n.seats.length) return false;
        const cert = WV_ZONES[n.ztype].cert;
        const f = this.forkliftOf(w); if (f) { f.driver = null; this.dropCarrier(w); }
        this.unseat(w);
        const prev = n.seats[i] && this.workers.find(o => o.id === n.seats[i]);
        if (prev) { this.unseat(prev); }
        this.dropCarrier(w);
        n.seats[i] = w.id; w.node = n.id; w.seat = i; w.role = 'spec';
        w.certOk = !cert || w.s.certs.includes(cert);
        this.emit('seat', { w, n, match: bestZone(w.s) === WV_ZONES[n.ztype].zone });
        return true;
    }
    unseat(w)
    {
        if (w.role === 'spec') { const n = this.node(w.node); if (n) { n.seats[w.seat] = null; if (w.job) { n.inq.unshift(w.job); w.job = null; } } }
        if (w.role !== 'flt') w.role = 'op';
        w.node = null; w.seat = null;
    }

    // ----------------------------------------------------------------- waves
    planWaves()
    {
        const W = this.site.waves, D = this.duration;
        const spacing = (D - 75) / W;
        this.waves = [];
        const weights = Array.from({ length:W }, (_, i)=> 1 + i * .3);
        const sum = weights.reduce((a, b)=> a + b, 0);
        const trickleShare = .1;
        const mix = this.clients.map((cl, i)=> 1 + (i === 1 ? .2 : 0) - i * .08);
        const mixSum = mix.reduce((a, b)=> a + b, 0);
        const pickClient = ()=> { let r = Math.random() * mixSum; for (let i = 0; i < mix.length; i++) { r -= mix[i]; if (r <= 0) return this.clients[i]; } return this.clients[0]; };
        const box = (cl)=> ({ id:this.nextId++, client:cl, step:0, heavy: Math.random() < cl.heavy, skipped:false, born:0 });
        for (let i = 0; i < W; i++)
        {
            const start = 6 + i * spacing, n = Math.round(this.total * (1 - trickleShare) * weights[i] / sum);
            // each inbound trailer is one client's load, booked into a dock on arrival
            const per = 8 + this.c.tier, count = Math.max(this.clients.length, Math.round(n / per));
            const trailers = [];
            for (let k = 0; k < count; k++)
            {
                const cl = k < this.clients.length ? this.clients[(k + i) % this.clients.length] : pickClient();
                const boxes = Array.from({ length: Math.max(2, Math.round(n / count * (.8 + Math.random() * .4))) }, ()=> box(cl));
                trailers.push({ id:this.nextId++, client:cl, t: start + k * spacing * .55 / count + Math.random() * 3, dock:null, boxes, arrived:false, mood:1, wait:0 });
            }
            trailers.sort((a, b)=> a.t - b.t);
            const byClient = {};
            for (const tr of trailers) for (const b of tr.boxes) byClient[b.client.key] = (byClient[b.client.key] || 0) + 1;
            this.waves.push({ i, start, end: start + spacing * .62, next: i + 1 < W ? 6 + (i + 1) * spacing : D, trailers, byClient, heavy: trailers.reduce((a, tr)=> a + tr.boxes.filter(b => b.heavy).length, 0), boxes: trailers.reduce((a, tr)=> a + tr.boxes.length, 0), started:false, event:null });
        }
        // low-volume trickle between waves (vans)
        const trickle = Math.round(this.total * trickleShare);
        for (let k = 0; k < Math.ceil(trickle / 3); k++)
        {
            const wv = this.waves[k % W];
            const t = wv.end + (wv.next - wv.end) * ((k / W | 0) + .5) / Math.ceil(trickle / 3 / W);
            const cl = pickClient();
            this.vans.push({ id:this.nextId++, client:cl, t: Math.min(D - 30, t), dock:null, boxes: Array.from({ length:3 }, ()=> box(cl)), arrived:false, mood:1, wait:0, van:true });
        }
        // one event per wave from the second wave on
        const pool = ['breakdown', 'sickie', 'hse', 'late', 'brewless'];
        if (this.clients.some(cl => cl.dg)) pool.push('dgLeak', 'dgLeak');
        if (this.c.tier >= 1) pool.push('fireAlarm');
        for (let i = 1; i < W; i++) this.waves[i].event = wmPick(pool);
        this.waveIdx = -1;
    }
    get wave() { return this.waves[Math.max(0, this.waveIdx)]; }
    nextWave() { return this.waves[this.waveIdx + 1] || null; }
    sendEarly()
    {
        // tower-defence style: bring the next wave forward for a bonus
        const nw = this.nextWave(); if (!nw || this.phase !== 'live') return 0;
        const gain = Math.max(0, nw.start - this.t);
        if (gain < 4) return 0;
        const bonus = Math.round(gain * 2.5 * (1 + this.c.tier * .5));
        for (const tr of nw.trailers) tr.t -= gain;
        nw.start -= gain; nw.end -= gain;
        this.stats.waveBonus += bonus;
        this.emit('sentEarly', { bonus, wave:nw });
        return bonus;
    }

    // ----------------------------------------------------------------- routes (one per client)
    commitLine(path)
    {
        if (path.length < 2) return { ok:false, why:'short' };
        let p = [...path];
        const a = this.node(p[0]), b = this.node(p[p.length - 1]);
        if (a.type === 'door' && b.type === 'dock') p.reverse();
        const s = this.node(p[0]), e = this.node(p[p.length - 1]);
        if (s.type !== 'dock' || e.type !== 'door') return { ok:false, why:'ends' };
        if (p.slice(1, -1).some(id => this.node(id).type !== 'zone')) return { ok:false, why:'middle' };
        const client = e.client;
        let l = this.lines.find(x => x.client.key === client.key);
        if (l) { for (const c of this.carriers) if (c.line === l) this.dumpLoad(c); l.path = p; for (const c of this.carriers) if (c.line === l) this.placeOnLine(c, l); }
        else { l = { id:this.nextId++, client, path:p }; this.lines.push(l); }
        this.recompute();
        this.emit('lineNew', { l });
        // routing gaps: required stops the route never visits
        const missing = client.recipe.filter(zt => !p.some(id => this.node(id).ztype === zt));
        if (missing.length) this.emit('routeGap', { l, missing });
        return { ok:true, l, missing };
    }
    removeLine(l)
    {
        for (const c of this.carriers) if (c.line === l) { this.dumpLoad(c); c.line = null; }
        this.lines = this.lines.filter(x => x !== l);
        this.recompute();
    }
    lineOf(key) { return this.lines.find(l => l.client.key === key); }
    recompute()
    {
        // crossings between different routes: where walkers and forklifts meet
        this.crossings = [];
        const segs = [];
        for (const l of this.lines) for (let i = 0; i < l.path.length - 1; i++) segs.push({ l, a:this.node(l.path[i]), b:this.node(l.path[i + 1]) });
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++)
        {
            const s = segs[i], u = segs[j];
            if (s.l === u.l) continue;
            const p = wvIntersect(s.a, s.b, u.a, u.b);
            if (!p) continue;
            if (this.nodes.some(n => Math.hypot(n.x - p.x, n.y - p.y) < 1.6)) continue;
            this.crossings.push({ x:p.x, y:p.y, la:s.l, lb:u.l, cool:0 });
        }
    }
    // where does box b, sitting at path index idx of line l, go next?
    target(l, idx, b)
    {
        const r = b.client.recipe;
        for (let s = b.step; s < r.length; s++)
            for (let j = idx + 1; j < l.path.length; j++)
                if (this.node(l.path[j]).ztype === r[s]) return { j, s };
        const end = this.node(l.path[l.path.length - 1]);
        if (end.type === 'door' && end.client.key === b.client.key && idx < l.path.length - 1) return { j:l.path.length - 1, s:r.length };
        return null;
    }

    // ----------------------------------------------------------------- carriers (operatives & forklifts)
    makeCarrier(o)
    {
        const c = { id:this.nextId++, kind:o.kind, w:o.w, f:o.f || null, line:null, seg:0, t:0, dir:1, load:[], dwell:0, auto:true, skive:0, think:Math.random() * 3, stop:0, task:null, x:o.kind === 'flt' ? WV_BAY.x : WV_BREAK.x, y:WV_BREAK.y + .8 };
        o.w.carrier = c;
        this.carriers.push(c);
        return c;
    }
    dropCarrier(w)
    {
        const c = w.carrier; if (!c) return;
        this.dumpLoad(c);
        this.carriers = this.carriers.filter(x => x !== c);
        w.carrier = null;
    }
    dumpLoad(c)
    {
        if (!c.load.length) return;
        const n = c.line ? this.node(c.line.path[Math.min(c.line.path.length - 1, c.t > .5 ? c.seg + 1 : c.seg)]) : this.docks()[0];
        for (const b of c.load) this.drop(b, n);
        c.load = [];
    }
    placeOnLine(c, l)
    {
        // join the route at its nearest stop
        let best = 0, bd = 1e9;
        l.path.forEach((id, i)=> { const n = this.node(id); const d = Math.hypot(n.x - c.x, n.y - c.y); if (d < bd) { bd = d; best = i; } });
        c.seg = Math.min(best, l.path.length - 2); c.t = best === l.path.length - 1 ? 1 : 0; c.dir = best === l.path.length - 1 ? -1 : 1;
        c.line = l;
    }
    direct(w, l)
    {
        // the manager tells someone where to work: directed staff graft properly
        if (!w || w.injured || w.gone) return false;
        if (w.role === 'spec') return false;
        let c = w.carrier;
        if (!c && w.role === 'op') c = this.makeCarrier({ kind:'op', w });
        if (!c) return false;
        if (c.kind === 'flt' && c.f.broken > 0) return false;
        w.resting = false;
        this.dumpLoad(c);
        c.auto = false; c.skive = 0; c.task = null;
        if (l) this.placeOnLine(c, l); else c.line = null;
        this.emit('direct', { w, l });
        return true;
    }
    rest(w)
    {
        if (!w || w.role === 'spec' || w.injured) return false;
        const c = w.carrier; if (c) { this.dumpLoad(c); c.line = null; c.auto = false; c.task = null; }
        w.resting = true;
        this.emit('rest', { w });
        return true;
    }
    carrierPos(c)
    {
        if (!c.line) return { x:c.x, y:c.y };
        const a = this.node(c.line.path[c.seg]), b = this.node(c.line.path[c.seg + 1]);
        if (!a || !b) return { x:c.x, y:c.y };
        return { x:a.x + (b.x - a.x) * c.t, y:a.y + (b.y - a.y) * c.t };
    }
    capOf(c) { return c.kind === 'flt' ? 6 + this.fac.racking : 3 + (this.fac.conveyors >= 3 ? 1 : 0); }
    speedOf(c)
    {
        const w = c.w;
        let sp = c.kind === 'flt' ? 5.6 : 3.3 + w.s.attrs.workRate * .03;
        sp *= .65 + .55 * w.mood / 100;
        sp *= .75 + .25 * clamp(w.energy / 100, 0, 1);
        if (c.auto) sp *= this.teamLeader ? .8 : .6;
        return sp * (1 + this.fac.conveyors * .03) * modMul('speed');
    }
    get teamLeader() { return this.workers.some(w => !w.injured && !w.gone && w.s.attrs.leadership >= 14); }

    // ----------------------------------------------------------------- go
    open()
    {
        if (this.phase !== 'setup') return;
        this.phase = 'live';
        for (const w of this.workers) if (w.role === 'op' && !w.carrier) this.makeCarrier({ kind:'op', w });
        this.emit('open', {});
    }
    step(dt)
    {
        if (this.phase === 'setup' || this.phase === 'cutoff' || this.done) return;
        this.t += dt;
        this.brewT = Math.max(0, this.brewT - dt);
        if (this.alarm > 0) { this.alarm -= dt; if (this.alarm <= 0) this.emit('alarmOver', {}); }
        // waves
        const nw = this.nextWave();
        if (nw && this.t >= nw.start - .01 && this.phase === 'live')
        {
            this.waveIdx++;
            nw.started = true;
            this.outboundFor(nw);
            this.emit('wave', { wave:nw, n:this.waveIdx + 1, of:this.waves.length });
            if (nw.event) this.event(nw.event);
        }
        if (Math.floor(this.t / 60) > this.stats.hourly.length - 1 && this.t < this.duration) this.stats.hourly.push(this.stats.despatched * this.ppb);
        const quiet = this.alarm > 0;
        if (!quiet)
        {
            this.updateInbound(dt);
            this.updateCarriers(dt);
            this.updateZones(dt);
            this.updateDoors(dt);
        }
        this.updatePiles(dt);
        this.updateMoods(dt);
        this.updateIncidents(dt);
        this.updateStars();
        if (this.hse) { this.hse.t -= dt; if (this.spills.length && !this.hse.fined) { this.hse.fined = true; const fine = 300 + this.spills.length * 40 + this.c.tier * 150; this.stats.hseFine += fine; this.emit('hseFine', { fine }); } if (this.hse.t <= 0) { this.emit('hseGone', { clean:!this.hse.fined }); this.hse = null; } }
        if (this.t >= this.duration) this.cutoff();
    }

    // ----------------------------------------------------------------- goods in
    updateInbound(dt)
    {
        if (this.phase !== 'live' && this.phase !== 'overtime') return;
        for (const tr of [...this.waves.flatMap(w => w.trailers), ...this.vans])
        {
            if (tr.done || this.t < tr.t) continue;
            if (!tr.arrived) { tr.dock = this.bookDock(tr.client).id; tr.arrived = true; this.emit('trailerIn', { tr, dock:this.node(tr.dock) }); }
            const dock = this.node(tr.dock);
            // one trailer tips at a time per dock
            const ahead = [...this.waves.flatMap(w => w.trailers), ...this.vans].find(o => o.arrived && !o.done && o.dock === tr.dock);
            if (ahead !== tr) { tr.wait += dt; continue; }
            tr.acc = (tr.acc || 0) + dt;
            const room = this.pile(dock) < WV_PILE_SAFE + 2;
            if (!room) { tr.wait += dt; tr.acc = 0; }
            while (tr.acc >= .45 && tr.boxes.length && this.pile(dock) < WV_PILE_SAFE + 2) { tr.acc -= .45; const b = tr.boxes.shift(); b.born = this.t; dock.out.push(b); }
            // the haulier's patience: they want to be tipped and gone
            tr.mood = clamp(1 - Math.max(0, tr.wait - 12) / 45, 0, 1);
            if (tr.mood <= 0) { this.stats.demurrage += dt * (3 + this.c.tier); if (!tr.kicked) { tr.kicked = true; this.emit('demurrage', { tr, dock }); } }
            if (!tr.boxes.length) { tr.done = true; this.emit('trailerOut', { tr, dock }); }
        }
    }

    bookDock(cl)
    {
        // the gatehouse books a haulier onto the dock their client's route starts from
        const l = this.lineOf(cl.key);
        if (l) return this.node(l.path[0]);
        return [...this.docks()].sort((a, b)=> this.pile(a) - this.pile(b))[0];
    }

    // ----------------------------------------------------------------- outbound trailers
    outboundFor(wv)
    {
        for (const d of this.doors())
        {
            const want = wv.byClient[d.client.key] || 0;
            if (!want) continue;
            const patience = (wv.next - wv.start) + 25;
            d.trailers.push({ id:this.nextId++, cap:want, load:0, patience, left:patience, arrive: this.t + (d.trailers.length ? 0 : 0), wave:wv.i });
            this.stats.ordered += want;
        }
    }
    updateDoors(dt)
    {
        for (const d of this.doors())
        {
            const tr = d.trailers[0];
            if (!tr) continue;
            tr.left -= dt;
            tr.acc = (tr.acc || 0) + (d.out.length ? dt : 0);
            while (tr.acc >= .55 && d.out.length && tr.load < tr.cap)
            {
                tr.acc -= .55;
                const b = d.out.shift();
                tr.load++;
                this.stats.despatched++;
                if (this.phase === 'overtime') this.stats.lateLoaded++; else this.stats.onTime++;
                if (b.skipped || b.step < b.client.recipe.length) { this.stats.misSent++; this.emit('misSend', { b, d }); }
                this.emit('loaded', { b, d, tr });
            }
            if (!d.out.length) tr.acc = 0;
            if (tr.load >= tr.cap) { d.trailers.shift(); this.stats.fullTrailers++; this.emit('trailerFull', { d, tr }); }
            else if (tr.left <= 0) this.departPart(d, tr);
        }
    }
    departPart(d, tr)
    {
        d.trailers = d.trailers.filter(x => x !== tr);
        const short = tr.cap - tr.load;
        if (short > 0) { this.stats.partTrailers++; this.stats.shortBoxes += short; }
        this.emit('trailerPart', { d, tr, short });
    }

    // ----------------------------------------------------------------- carriers
    updateCarriers(dt)
    {
        for (const c of this.carriers)
        {
            const w = c.w;
            if (w.injured || w.gone) continue;
            if (w.resting) { w.energy = Math.min(100, w.energy + dt * (2 + this.fac.breakroom * .5)); w.mood = Math.min(100, w.mood + dt * 1.6); continue; }
            if (c.kind === 'flt' && c.f.broken > 0) { if (c.f.fixing > 0) { c.f.fixing -= dt; if (c.f.fixing <= 0) { c.f.broken = 0; this.emit('fixed', { f:c.f }); } } continue; }
            w.active += dt;
            if (c.stop > 0) { c.stop -= dt; continue; }
            if (c.task) { this.doTask(c, dt); continue; }
            // autopilot: wander to whatever looks busy, slack off now and then
            if (c.auto)
            {
                c.think -= dt;
                if (c.think <= 0)
                {
                    c.think = 14 + Math.random() * 10;
                    const best = this.lines.map(l => ({ l, v:this.lineWork(l) + Math.random() * 3 })).sort((a, b)=> b.v - a.v)[0];
                    if (best && best.l !== c.line && (!c.line || Math.random() < .5)) { this.dumpLoad(c); this.placeOnLine(c, best.l); }
                    if (!this.teamLeader && Math.random() < .3 || Math.random() < .12) { c.skive = 3 + Math.random() * 4; this.emit('skive', { w }); }
                }
                if (c.skive > 0) { c.skive -= dt; continue; }
            }
            if (!c.line) { this.idleClean(c, dt); continue; }
            if (c.dwell > 0) { c.dwell -= dt; continue; }
            const l = c.line, n = l.path.length;
            const a = this.node(l.path[c.seg]), b = this.node(l.path[c.seg + 1]);
            if (!a || !b) { c.seg = 0; c.t = 0; continue; }
            // a toppled pile across the route stops everyone
            const pos = this.carrierPos(c);
            const ahead = { x:pos.x + (b.x - a.x) * .08 * c.dir, y:pos.y + (b.y - a.y) * .08 * c.dir };
            if (this.spills.some(s => Math.hypot(s.x - ahead.x, s.y - ahead.y) < .9)) { if (!c.blocked) { c.blocked = true; this.emit('blocked', { c }); } if (c.auto) this.clearNearest(c); continue; }
            c.blocked = false;
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            c.t += dt * this.speedOf(c) / len * c.dir;
            if (w.role === 'op') { w.energy = Math.max(0, w.energy - dt * .05); w.workTime += c.load.length ? dt : 0; }
            if (c.t >= 1 || c.t <= 0)
            {
                const idx = c.t >= 1 ? c.seg + 1 : c.seg;
                c.t = c.t >= 1 ? 1 : 0;
                let dir = c.dir;
                if (idx === n - 1 && dir > 0) dir = -1; else if (idx === 0 && dir < 0) dir = 1;
                const moved = this.arrive(c, idx, dir);
                c.dir = dir;
                if (dir > 0) { c.seg = idx; c.t = 0; } else { c.seg = idx - 1; c.t = 1; }
                c.seg = clamp(c.seg, 0, n - 2);
                c.dwell = .3 + moved * (c.kind === 'flt' ? .25 : .35);
            }
            const p = this.carrierPos(c); c.x = p.x; c.y = p.y;
        }
        this.updateCrossings(dt);
    }
    lineWork(l) { let v = 0; l.path.forEach((id, i)=> { const n = this.node(id); for (const b of n.out) if (b.client === l.client && this.target(l, i, b)) v++; }); return v; }
    arrive(c, idx, dir)
    {
        const l = c.line, node = this.node(l.path[idx]);
        let moved = 0;
        const keep = [];
        for (const b of c.load)
        {
            if (b._j === idx) { this.deliver(b, node); moved++; c.w.carried++; }
            else keep.push(b);
        }
        c.load = keep;
        if (dir < 0) return moved;
        // load boxes for this route heading further along
        const cap = this.capOf(c);
        node.out.sort((x, y)=> x.born - y.born);
        for (let i = 0; i < node.out.length && c.load.length < cap; i++)
        {
            const b = node.out[i];
            if (b.client !== l.client) continue;
            if (b.heavy && c.kind !== 'flt') continue;
            const tg = this.target(l, idx, b);
            if (!tg) continue;
            b._j = tg.j; b._s = tg.s;
            c.load.push(b); node.out.splice(i, 1); i--; moved++;
        }
        if (moved) this.emit('load', { c, node });
        return moved;
    }
    deliver(b, node)
    {
        if (b._s > b.step) b.skipped = true;
        b.step = b._s;
        this.drop(b, node);
    }
    drop(b, node)
    {
        if (node.type === 'zone' && b.client.recipe[b.step] === node.ztype) node.inq.push(b);
        else node.out.push(b);
    }
    // spills: idle hands and directed clean-ups
    idleClean(c, dt) { if (this.spills.length && Math.random() < dt * .3) this.clearNearest(c); }
    clearNearest(c)
    {
        const p = this.carrierPos(c);
        const s = [...this.spills].filter(s => !s.claimed).sort((a, b)=> Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (!s) return false;
        this.assignClean(c, s);
        return true;
    }
    assignClean(c, s)
    {
        this.dumpLoad(c);
        const p = this.carrierPos(c);
        s.claimed = c.id;
        c.task = { kind:'clean', spill:s, from:{ x:p.x, y:p.y }, back:c.line, k:0 };
        c.line = null; c.x = p.x; c.y = p.y;
    }
    doTask(c, dt)
    {
        const t = c.task, s = t.spill;
        if (!this.spills.includes(s)) { this.finishTask(c); return; }
        const d = Math.hypot(s.x - c.x, s.y - c.y);
        if (d > .3) { const sp = 3.4 * dt; c.x += (s.x - c.x) / d * Math.min(sp, d); c.y += (s.y - c.y) / d * Math.min(sp, d); return; }
        t.k += dt;
        if (t.k >= .9)
        {
            const node = this.node(s.node);
            this.spills = this.spills.filter(x => x !== s);
            if (node) this.drop(s.box, node);
            this.emit('cleared', { s, c });
            const more = this.spills.filter(x => !x.claimed && x.node === s.node)[0];
            if (more) { more.claimed = c.id; t.spill = more; t.k = 0; return; }
            this.finishTask(c);
        }
    }
    finishTask(c) { const back = c.task?.back; c.task = null; if (back && this.lines.includes(back)) this.placeOnLine(c, back); }
    sendCleaner(spill)
    {
        // the manager points at a mess: the nearest operative drops what they're doing
        const cands = this.carriers.filter(c => c.kind === 'op' && !c.w.injured && !c.w.gone && !c.w.resting && !c.task);
        const c = cands.sort((a, b)=> { const pa = this.carrierPos(a), pb = this.carrierPos(b); return Math.hypot(pa.x - spill.x, pa.y - spill.y) - Math.hypot(pb.x - spill.x, pb.y - spill.y); })[0];
        if (!c) return false;
        const old = this.spills.find(s => s.claimed === c.id); if (old) old.claimed = null;
        this.assignClean(c, spill);
        this.emit('cleanSent', { c, spill });
        return true;
    }

    // ----------------------------------------------------------------- crossings: forklifts vs walkers
    updateCrossings(dt)
    {
        for (const x of this.crossings)
        {
            x.cool = Math.max(0, x.cool - dt);
            if (x.cool > 0) continue;
            const near = (c, r)=> { const p = this.carrierPos(c); return Math.hypot(p.x - x.x, p.y - x.y) < r && c.dwell <= 0 && c.stop <= 0; };
            const flt = this.carriers.find(c => c.kind === 'flt' && (c.line === x.la || c.line === x.lb) && !c.f.broken && near(c, 1.1));
            if (!flt) continue;
            const walker = this.carriers.find(c => c.kind === 'op' && c.line && c.line !== flt.line && (c.line === x.la || c.line === x.lb) && !c.w.incident && near(c, 1.8));
            if (!walker) continue;
            x.cool = 9;
            this.stats.crossings++;
            const risk = (1.4 - walker.w.s.attrs.safety / 25) * (1.3 - flt.w.s.attrs.concentration / 30) * traitMod(walker.w.s, 'risk') * modMul('risk') * (1 - this.fac.safety * .08);
            if (Math.random() < .55 * risk) this.raise(walker.w, 'crossing', { flt, x });
            else { flt.stop = .8; this.emit('brake', { flt, x }); }
        }
    }

    // ----------------------------------------------------------------- zones
    updateZones(dt)
    {
        for (const n of this.zones())
        {
            const def = WV_ZONES[n.ztype];
            for (const id of n.seats)
            {
                const w = id && this.workers.find(x => x.id === id);
                if (!w || w.injured || w.gone) continue;
                w.active += dt;
                if (!w.job && n.inq.length) { w.job = n.inq.shift(); w.prog = 0; }
                if (!w.job) { w.mood = Math.min(100, w.mood + dt * .25); continue; }
                w.workTime += dt;
                w.energy = Math.max(0, w.energy - dt * .08 * (1.3 - w.s.attrs.stamina / 33));
                let sp = .55 + zoneRating(w.s, def.zone) * .045;
                sp *= .65 + .55 * w.mood / 100;
                sp *= .8 + .2 * clamp(w.energy / 100, 0, 1);
                if (bestZone(w.s) === def.zone) sp *= 1.15;
                if (!w.certOk) sp *= .6;
                sp *= (1 + this.fac.scanners * .04) * modMul('speed');
                w.prog += dt * sp / (def.time * (w.job.heavy ? 1.35 : 1));
                if (w.prog >= 1)
                {
                    const b = w.job; w.job = null; w.processed++; w.lastDone = this.t;
                    b.step++;
                    n.out.push(b);
                    this.emit('processed', { w, n, b });
                }
            }
        }
    }

    // ----------------------------------------------------------------- pyramids, wobbles, topples
    updatePiles(dt)
    {
        for (const n of this.nodes)
        {
            const p = this.pile(n);
            if (p < WV_PILE_SAFE) { n.wobble = Math.max(0, n.wobble - dt / 6); if (p < WV_PILE_SAFE - 3) n.shore = 0; continue; }
            const before = n.wobble;
            n.wobble += dt * (1 + (p - WV_PILE_SAFE) * .15) / 16;
            if (before === 0) this.emit('wobble', { n });
            if (n.wobble >= 1) this.topple(n);
        }
    }
    shoreUp(n)
    {
        // tap a wobbling pile: someone restacks it and buys you time
        if (n.wobble <= 0) return false;
        n.wobble = Math.max(0, n.wobble - .7 / (1 + n.shore * .6));
        n.shore++;
        this.stats.avoided += n.shore === 1 ? 1 : 0;
        this.emit('shored', { n });
        return true;
    }
    topple(n)
    {
        n.wobble = 0; n.shore = 0;
        this.stats.toppled++;
        const total = this.pile(n), k = Math.ceil(total * .4);
        const spilled = [];
        for (let i = 0; i < k; i++)
        {
            const fromOut = n.out.length > 0;
            const b = fromOut ? n.out.pop() : n.inq.pop();
            if (!b) break;
            if (Math.random() < .2 + (b.heavy ? .15 : 0)) { this.stats.damaged++; continue; }   // written off
            const a = Math.random() * Math.PI * 2, r = 1.8 + Math.random() * 2.2;
            const s = { id:this.nextId++, box:b, node:n.id, inq:!fromOut, x:clamp(n.x + Math.cos(a) * r, -WV_WALL + 1, WV_WALL - 1), y:clamp(n.y + Math.sin(a) * r, -9.6, 9), rot:Math.random() * 6 };
            this.spills.push(s); spilled.push(s);
        }
        this.emit('topple', { n, spilled });
        // anyone working next to it might get hit
        const victims = n.type === 'zone' ? n.seats.map(id => id && this.workers.find(w => w.id === id)).filter(w => w && !w.injured) : [];
        const near = this.carriers.filter(c => !c.w.injured && Math.hypot(this.carrierPos(c).x - n.x, this.carrierPos(c).y - n.y) < 2.6).map(c => c.w);
        const v = wmPick([...victims, ...near]);
        if (v && Math.random() < .18 * (1.4 - v.s.attrs.safety / 25) * modMul('risk') * (1 - this.fac.safety * .08)) this.injure(v, 'falling', 'buried by a toppled stack');
    }

    // ----------------------------------------------------------------- moods
    updateMoods(dt)
    {
        for (const w of this.workers)
        {
            if (w.injured || w.gone) continue;
            // drift toward how they feel about the job (pay, morale, facilities)
            w.mood += (w.base - w.mood) * dt * .02;
            if (w.role === 'spec')
            {
                const n = this.node(w.node), p = this.pile(n);
                const stalled = this.t - w.lastDone > 9 && n.inq.length > 0;
                if (p >= 6) w.mood -= dt * (.5 + (p - 6) * .18) * (stalled ? 1.8 : 1) * (1.3 - w.s.attrs.teamwork / 40);
                else if (w.job) w.mood += dt * .35;
            }
            else if (w.carrier && !w.resting)
            {
                const c = w.carrier;
                if (c.blocked) w.mood -= dt * .5;
                if (c.auto && !c.line) w.mood -= dt * .05;
            }
            if (this.phase === 'overtime') w.mood -= dt * (w.pay < .95 ? .35 : w.pay < 1.1 ? .15 : .03);
            w.mood = clamp(w.mood, 0, 100);
            if (w.mood < 8 && !w.gone) this.walkOut(w);
        }
    }
    walkOut(w)
    {
        w.gone = true;
        this.stats.walkOuts++;
        if (w.role === 'spec') { const n = this.node(w.node); if (w.job) { n.inq.unshift(w.job); w.job = null; } n.seats[w.seat] = null; }
        if (w.carrier) { if (w.carrier.kind === 'flt') { w.carrier.f.driver = null; } this.dropCarrier(w); }
        this.emit('walkOut', { w });
        for (const o of this.workers) if (o !== w && !o.gone) o.mood -= 6;
    }
    brewRound()
    {
        if (this.brewT > 0 || this.phase === 'setup' || this.done) return false;
        this.brewT = 70;
        this.stats.brews++;
        for (const w of this.workers) if (!w.injured && !w.gone) { w.mood = Math.min(100, w.mood + 16); w.energy = Math.min(100, w.energy + 8); if (w.carrier) w.carrier.stop = Math.max(w.carrier.stop, 4); if (w.role === 'spec') w.lastDone = this.t; }
        this.emit('brew', {});
        return true;
    }
    callAgency()
    {
        if (this.agencyCalls >= 2 || this.phase === 'setup' || this.done) return false;
        this.agencyCalls++;
        for (let i = 0; i < 2; i++)
        {
            const s = makeStaff({ quality:wmRI(5, 8), zone:'blue' });
            s.name = 'Agency ' + s.name.split(' ')[0]; s.temp = true;
            const w = this.makeWorker(s, true);
            w.mood = 55; w.base = 50;
            this.workers.push(w);
            const c = this.makeCarrier({ kind:'op', w });
            c.stop = 6; c.x = -16; c.y = -9.5;
            this.stats.agency++;
        }
        this.emit('agency', {});
        return true;
    }

    // ----------------------------------------------------------------- events & incidents
    event(kind)
    {
        if (kind === 'breakdown')
        {
            const f = wmPick(this.forklifts.filter(f => f.driver && !f.broken));
            if (!f) return this.event('sickie');
            f.broken = 1; f.fixing = 0;
            this.stats.breakdowns++;
            this.emit('breakdown', { f });
        }
        else if (kind === 'sickie')
        {
            const w = wmPick(this.workers.filter(w => w.role === 'op' && !w.injured && !w.gone && !w.temp));
            if (!w) return;
            w.gone = true; this.dropCarrier(w);
            this.emit('sickie', { w });
        }
        else if (kind === 'hse') { this.hse = { t:25, fined:false }; this.emit('hse', {}); }
        else if (kind === 'late')
        {
            const wv = this.nextWave(); if (!wv) return;
            for (const tr of wv.trailers) tr.t += 18;
            this.emit('late', { wave:wv });
        }
        else if (kind === 'brewless') { for (const w of this.workers) w.mood -= 6; this.emit('brewless', {}); }
        else if (kind === 'dgLeak')
        {
            const n = this.zones().find(z => z.ztype === 'dg');
            const w = n && n.seats.map(id => id && this.workers.find(x => x.id === id)).find(w => w && !w.injured && !w.gone);
            if (!w) return this.event('breakdown');
            this.raise(w, 'dg', { n });
        }
        else if (kind === 'fireAlarm') { this.alarm = 10; this.emit('fireAlarm', {}); }
    }
    fixForklift(f)
    {
        if (!f.broken || f.fixing > 0) return false;
        const eng = this.workers.find(w => !w.injured && !w.gone && (w.s.certs.includes('maintenance') || this.c.lineup[w.s.id] === 'black'));
        f.fixing = eng ? 5 : 11;
        if (!eng) this.stats.contractor += 180 + this.c.tier * 60;
        this.emit('fixing', { f, eng });
        return true;
    }
    raise(w, type, extra = {})
    {
        if (w.incident || w.injured) return;
        const inc = { id:this.nextId++, w, type, t0:this.t, window: type === 'crossing' ? 2.4 + w.s.attrs.concentration * .04 : 5 + w.s.attrs.concentration * .08, done:false, ...extra };
        w.incident = inc;
        this.incidents.push(inc);
        if (type === 'crossing' && w.carrier) w.carrier.stop = Math.max(w.carrier.stop, inc.window + .3);
        if (extra.flt) extra.flt.stop = Math.max(extra.flt.stop, 0);
        this.emit('incident', { inc, w });
    }
    intervene(inc)
    {
        if (inc.done) return;
        inc.done = true; inc.w.incident = null;
        this.stats.avoided++;
        if (inc.flt) inc.flt.stop = 1.2;
        if (inc.w.carrier) inc.w.carrier.stop = .6;
        this.emit('avoided', { inc, w:inc.w });
    }
    updateIncidents()
    {
        for (const inc of this.incidents)
        {
            if (inc.done || this.t - inc.t0 < inc.window) continue;
            inc.done = true;
            const w = inc.w; w.incident = null;
            if (w.injured) continue;
            const sev = inc.type === 'crossing' ? 1.9 : 1.6;
            const pInj = .5 * (1.4 - w.s.attrs.concentration / 25) * (1 - this.fac.safety * .08);
            if (Math.random() < pInj) this.injure(w, inc.type === 'crossing' ? 'strike' : 'chemical', inc.type === 'crossing' ? 'hit by a forklift at a route crossing' : 'a DG leak in the cage', sev);
            else { this.stats.nearMisses++; w.nearMisses++; this.emit('nearMiss', { inc, w }); }
        }
    }
    injure(w, type, cause, sev = 1.2)
    {
        const serious = Math.random() < .16 * sev * (w.s.hidden.injuryProne / 10) * (1 - this.fac.safety * .1);
        const row = wmPick(INJURY_TABLE.filter(r => r[3] === serious));
        const inj = { id:w.s.id, name:w.s.name, label:row[0], days:wmRI(row[1], row[2]), serious, fine: serious ? Math.round((1500 + Math.random() * 4500) * (1 - this.fac.safety * .1) / 100) * 100 : 0, cause, zone: w.role === 'spec' ? WV_ZONES[this.node(w.node).ztype].zone : 'bench', type };
        if (serious && Math.random() < .1 * sev * (1 - this.fac.safety * .12)) { inj.fatal = true; inj.label = 'Fatal accident'; inj.days = 999; inj.cause = type === 'falling' ? FATAL_CAUSES[0] : type === 'chemical' ? FATAL_CAUSES[4] : FATAL_CAUSES[1]; }
        if (w.temp) inj.temp = true;
        if (!w.temp) this.stats.injuries.push(inj);
        w.injured = true;
        if (w.role === 'spec') { const n = this.node(w.node); if (w.job) { n.inq.unshift(w.job); w.job = null; } n.seats[w.seat] = null; }
        if (w.carrier) { if (w.carrier.kind === 'flt') w.carrier.f.driver = null; this.dropCarrier(w); }
        for (const o of this.workers) if (o !== w) o.mood -= inj.serious ? 12 : 4;
        this.emit('injury', { w, inj });
    }

    // ----------------------------------------------------------------- stars (live)
    updateStars()
    {
        const st = this.stats;
        const otif = st.ordered ? (st.onTime - st.misSent) / Math.max(1, st.onTime + st.shortBoxes) : 1;
        let s = 1 + 4 * clamp(otif, 0, 1);
        s -= st.damaged * .08 + st.toppled * .15 + st.injuries.length * .5 + st.walkOuts * .3 + (st.hseFine ? .5 : 0);
        this.stars = clamp(Math.round(s * 2) / 2, .5, 5);
    }

    // ----------------------------------------------------------------- clock-off
    leftover()
    {
        let n = 0;
        for (const x of this.nodes) n += this.pile(x);
        for (const c of this.carriers) n += c.load.length;
        for (const w of this.workers) if (w.job) n++;
        n += this.spills.length;
        for (const tr of [...this.waves.flatMap(w => w.trailers), ...this.vans]) if (!tr.done && tr.arrived) n += tr.boxes.length;
        return n;
    }
    cutoff()
    {
        if (this.phase === 'overtime') return this.finish();
        if (this.phase !== 'live') return;
        // despatch cut-off: every trailer goes, loaded or not
        for (const d of this.doors()) for (const tr of [...d.trailers]) this.departPart(d, tr);
        for (const tr of [...this.waves.flatMap(w => w.trailers), ...this.vans]) if (!tr.arrived && tr.t < this.t + 1) { tr.arrived = true; tr.dock = this.bookDock(tr.client).id; this.node(tr.dock).out.push(...tr.boxes); tr.boxes = []; tr.done = true; }
        const left = this.leftover();
        if (left <= 0) return this.finish();
        this.phase = 'cutoff';
        this.emit('cutoff', { left, cost:this.overtimeQuote() });
    }
    overtimeQuote()
    {
        const crew = this.workers.filter(w => !w.injured && !w.gone && !w.temp);
        return Math.round(crew.reduce((a, w)=> a + w.s.wage / 40 * 1.5, 0) + this.workers.filter(w => w.temp && !w.gone).length * 30);
    }
    overtime(yes)
    {
        if (this.phase !== 'cutoff') return;
        if (!yes) { this.stats.carryOver = this.leftover(); return this.finish(); }
        this.phase = 'overtime';
        this.stats.overtimeHours = 1;
        this.stats.overtimeCost = this.overtimeQuote();
        this.duration = this.t + 60;
        // well-paid crews shrug it off; underpaid ones grumble (or go home)
        for (const w of this.workers)
        {
            if (w.injured || w.gone) continue;
            if (!w.temp && w.pay < .92 && Math.random() < (.95 - w.pay) * 2.5) { w.gone = true; this.unseat(w); if (w.carrier) { if (w.carrier.kind === 'flt') w.carrier.f.driver = null; this.dropCarrier(w); } this.emit('refused', { w }); continue; }
            w.mood -= w.pay < .95 ? 18 : w.pay < 1.1 ? 9 : 3;
        }
        // late collections: one trailer per client for whatever's left
        for (const d of this.doors())
        {
            const want = this.boxesFor(d.client.key);
            if (want) d.trailers.push({ id:this.nextId++, cap:want, load:0, patience:62, left:62, late:true });
        }
        this.emit('overtime', {});
    }
    boxesFor(key)
    {
        let n = 0;
        for (const x of this.nodes) for (const b of [...x.out, ...(x.inq || [])]) if (b.client.key === key) n++;
        for (const c of this.carriers) for (const b of c.load) if (b.client.key === key) n++;
        for (const w of this.workers) if (w.job?.client.key === key) n++;
        for (const s of this.spills) if (s.box.client.key === key) n++;
        return n;
    }
    finish()
    {
        if (this.done) return;
        if (this.phase === 'overtime') this.stats.carryOver = this.leftover();
        this.done = true; this.phase = 'done';
        for (const i of this.incidents) i.done = true;
        this.emit('finish', {});
    }
    unitsPerHour() { return Math.round(this.stats.despatched * this.ppb * UNITS_PER_PARCEL / Math.max(.25, Math.min(this.t, SHIFT_SECONDS) / 60)); }

    // ----------------------------------------------------------------- the assistant (simulate)
    autoPlan()
    {
        this.suggestLayout(); this.autoCrew();
        this.clients.forEach((cl, ci)=>
        {
            const dock = [...this.docks()].sort((a, b)=> Math.abs(a.y - this.doorOf(cl.key).y) - Math.abs(b.y - this.doorOf(cl.key).y))[0];
            const path = [dock.id];
            let from = dock;
            for (const zt of cl.recipe)
            {
                const z = this.zones().filter(n => n.ztype === zt).sort((a, b)=> Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
                if (z) { path.push(z.id); from = z; }
            }
            path.push(this.doorOf(cl.key).id);
            this.commitLine(path);
        });
    }
    autoDirect(q = 1)
    {
        // forklifts to the heaviest client, operatives spread over the rest
        const lines = [...this.lines].sort((a, b)=> b.client.heavy - a.client.heavy);
        if (!lines.length) return;
        const load = new Map(lines.map(l => [l, 0]));
        const need = (l)=> (l.client.recipe.length + 1) * (1 + 2 * l.client.heavy);
        const order = [...this.carriers].sort((a, b)=> (b.kind === 'flt') - (a.kind === 'flt'));
        for (const c of order)
        {
            if (Math.random() > q) continue;            // left on autopilot
            // forklifts to the heaviest clients first, then everyone to whichever route is least covered
            const pool = c.kind === 'flt' ? lines.filter(l => l.client.heavy > .1) : lines;
            const l = (pool.length ? pool : lines).sort((a, b)=> load.get(a) / need(a) - load.get(b) / need(b))[0];
            load.set(l, load.get(l) + (c.kind === 'flt' ? 2 : 1));
            this.direct(c.w, l);
        }
    }
    assistantTick(q)
    {
        // a decent assistant: spreads carriers, taps some warnings, clears messes
        if (Math.random() < .02)
        {
            const lines = [...this.lines].sort((a, b)=> this.lineWork(b) - this.lineWork(a));
            const idle = this.carriers.find(c => c.kind === 'op' && !c.task && !c.w.resting && (!c.line || this.lineWork(c.line) === 0));
            if (idle && lines[0] && this.lineWork(lines[0]) > 2 && Math.random() < q) this.direct(idle.w, lines[0]);
        }
        for (const inc of this.incidents) if (!inc.done && Math.random() < q * .04) this.intervene(inc);
        for (const n of this.nodes) if (n.wobble > .5 && Math.random() < q * .05) this.shoreUp(n);
        for (const s of this.spills) if (!s.claimed && Math.random() < q * .02) this.sendCleaner(s);
        for (const f of this.forklifts) if (f.broken && !f.fixing && Math.random() < q * .03) this.fixForklift(f);
        if (this.workers.filter(w => !w.gone && !w.injured).some(w => w.mood < 30) && Math.random() < q * .01) this.brewRound();
    }
    runToEnd(q = .55)
    {
        if (this.phase === 'setup') { this.autoPlan(); this.open(); this.autoDirect(q); }
        let guard = 0;
        while (!this.done && guard++ < 100000)
        {
            this.step(1 / 20);
            this.assistantTick(q);
            if (this.phase === 'cutoff') this.overtime(this.leftover() > 6 && Math.random() < q);
        }
    }

    // ----------------------------------------------------------------- result (same shape as before, career layer unchanged)
    result()
    {
        const st = this.stats, c = this.c, t = TIER_DEFS[c.tier];
        const shipped = Math.round(st.despatched * this.ppb);
        const units = shipped * UNITS_PER_PARCEL;
        const boxValue = this.ppb * UNITS_PER_PARCEL * t.rate;
        const bonus = 1 + st.fullTrailers * .01 + (this.stars >= 4.5 ? .05 : 0);
        const revenue = Math.round((st.onTime * boxValue + st.lateLoaded * boxValue * .85) * bonus * modMul('revenue') + st.waveBonus);
        const backlog = Math.round(st.carryOver * this.ppb);
        const penalties = Math.round(st.misSent * boxValue * .9 + st.shortBoxes * boxValue * .35 + st.damaged * boxValue + st.demurrage + backlog * 1.5);
        const fines = st.injuries.reduce((a, i)=> a + i.fine, 0) + st.hseFine;
        const energyCost = this.site.utilities;
        const agencyCost = st.agency * 90;
        const dailyWages = Math.round(c.staff.reduce((a, s)=> a + s.wage, 0) / WEEK_SHIFTS * (c.manager.perks?.wages ?? 1));
        const totalCost = penalties + fines + energyCost + dailyWages + agencyCost + st.overtimeCost + st.contractor;
        const onTime = clamp((st.onTime - st.misSent) / Math.max(1, st.ordered), 0, 1);
        const csat = clamp(this.stars / 5, 0, 1);
        const workers = this.workers.filter(w => !w.temp).map(w =>
        {
            let rating = 0;
            if (w.active > 30 || w.injured)
            {
                const util = w.workTime / Math.max(1, w.active);
                const work = w.role === 'spec' ? w.processed / 8 : w.carried / 12;
                rating = 5.8 + Math.min(2.6, work) + (util > .55 ? .4 : 0) + (w.mood - 50) / 60 - w.nearMisses * .2 - (w.injured ? .8 : 0) - (w.gone ? 1.5 : 0);
                rating = wmRound1(clamp(rating, 3, 10));
            }
            const zone = w.role === 'spec' && w.node ? WV_ZONES[this.node(w.node).ztype].zone : w.role === 'flt' ? 'green' : 'bench';
            return { id:w.id, name:w.s.name, zone, role:w.role, rating, processed:w.processed + w.carried, errors:0, repairs:0, energy:Math.round(w.energy), injured:w.injured, walkedOut:w.gone, mood:Math.round(w.mood), nearMisses:w.nearMisses, jaywalks:0, moraleDelta:0 };
        });
        const workerOfShift = [...workers].filter(w => w.rating).sort((a, b)=> b.rating - a.rating)[0] || null;
        workers.sort((a, b)=> b.rating - a.rating);
        return {
            shipped, units, target:this.forecast.target, forecast:this.forecast.volume, arrived: Math.round(this.total * this.ppb),
            backlog, revenue, penalties, fines, energyCost, overtimeCost:st.overtimeCost, contractorCost:st.contractor + agencyCost, dailyWages, totalCost, profit: revenue - totalCost,
            cpu: units ? totalCost / units : 0, onTime, csat, defects:st.misSent, damaged:st.damaged, caught:0, lateRush:0, rushShipped:0,
            returns:0, nearMisses:st.nearMisses, avoided:st.avoided, injuries:st.injuries, peakFlow: Math.min(5, 1 + st.fullTrailers), avgFlow:1,
            bottlenecks:st.toppled, breakdowns:st.breakdowns, uph:this.unitsPerHour(), overtimeHours:st.overtimeHours, simulated:this.assistantOn, hourly:[...st.hourly, shipped],
            workers, workerOfShift, zoneProcessed:{}, jaywalks:0, crossings:st.crossings, crossWait:0, forkliftBrakes:0,
            wave:{ stars:this.stars, waves:this.waves.length, full:st.fullTrailers, part:st.partTrailers, short:st.shortBoxes, misSent:st.misSent, toppled:st.toppled, demurrage:Math.round(st.demurrage), walkOuts:st.walkOuts, agency:st.agency, brews:st.brews, hseFine:st.hseFine, carryOver:st.carryOver, waveBonus:st.waveBonus },
        };
    }
}

function wvIntersect(a, b, c, d)
{
    const r = { x:b.x - a.x, y:b.y - a.y }, s = { x:d.x - c.x, y:d.y - c.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-6) return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    if (t <= .02 || t >= .98 || u <= .02 || u >= .98) return null;
    return { x:a.x + r.x * t, y:a.y + r.y * t };
}
