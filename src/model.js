'use strict';
// ============================================================================
// Warehouse Manager — career model (the "Football Manager" layer).
// Pure game state + rules. No rendering here.
// ============================================================================

let career = null;       // the live save
let wmNextId = 1;

// ---------------------------------------------------------------------------
// small helpers (prefixed so they never shadow engine globals)
const wmPick = (a)=> a[Math.floor(Math.random()*a.length)];
const wmRI = (a, b)=> a + Math.floor(Math.random()*(b - a + 1)); // inclusive
const wmGauss = ()=> (Math.random()+Math.random()+Math.random()+Math.random()-2)/2; // ~[-1,1]
const wmMoney = (v)=> (v < 0 ? '-$' : '$') + Math.round(Math.abs(v)).toLocaleString();
const wmChance = (p)=> Math.random() < p;
const wmRound1 = (v)=> Math.round(v*10)/10;

function wmDayName(day) { return ['Mon','Tue','Wed','Thu','Fri'][(day-1) % WEEK_SHIFTS]; }

// ---------------------------------------------------------------------------
// Staff
function staffAbility(s)
{
    let t = 0;
    for (const k of ATTR_KEYS) t += s.attrs[k];
    return t / ATTR_KEYS.length;
}

// FM-style "position rating" for a zone, 1..22ish
function zoneRating(s, zone)
{
    const def = ZONE_DEFS[zone];
    let r = 0;
    for (const k in def.weights) r += s.attrs[k] * def.weights[k];
    if (def.cert && s.certs.includes(def.cert)) r += 2;
    if (s.certs.includes('multizone')) r += .5;
    return r;
}
function bestZone(s)
{
    let best = 'blue', bestR = -1;
    for (const z of ZONE_KEYS)
    {
        const r = zoneRating(s, z);
        if (r > bestR) { bestR = r; best = z; }
    }
    return best;
}
function starsFor(rating) { return clamp(Math.round((rating - 4) / 3 * 2) / 2, .5, 5); } // 7=>1★, 10=>2★, 13=>3★, 16=>4★, 19=>5★

function fairWage(ability) { return Math.round((150 + ability*ability*2.7)/10)*10; }
function staffValue(s)
{
    const a = staffAbility(s);
    const ageF = s.age < 23 ? 1.3 : s.age < 32 ? 1.15 : s.age < 45 ? 1 : .6;
    const potF = 1 + Math.max(0, s.hidden.potential - a) * .06;
    return Math.round(Math.pow(a, 2.6) * 6 * ageF * potF / 50) * 50;
}

function moraleLabel(m)
{
    return m >= 85 ? 'Superb' : m >= 70 ? 'Very Good' : m >= 55 ? 'Good' : m >= 40 ? 'Okay' : m >= 25 ? 'Poor' : 'Very Low';
}
function moraleColor(m)
{
    return m >= 70 ? '#22c55e' : m >= 50 ? '#a3e635' : m >= 35 ? '#facc15' : '#ef4444';
}

function makeStaff(opts = {})
{
    const quality = opts.quality ?? 10;
    const age = opts.age ?? (19 + Math.floor(Math.pow(Math.random(), 1.35) * 40));
    const prefZone = opts.zone ?? wmPick(ZONE_KEYS);
    const def = ZONE_DEFS[prefZone];
    const attrs = {};
    for (const k of ATTR_KEYS)
    {
        let v = quality + wmGauss()*4;
        if (def.weights[k]) v += def.weights[k] * 8;       // specialise toward their zone
        if (k === 'stamina' || k === 'strength') v -= Math.max(0, age - 45) * .15;
        if (k === 'safety' || k === 'concentration' || k === 'leadership') v += Math.max(0, age - 30) * .05;
        attrs[k] = Math.round(clamp(v, 1, 20));
    }
    const s =
    {
        id: wmNextId++,
        name: opts.name ?? (wmPick(FIRST_NAMES) + ' ' + wmPick(LAST_NAMES)),
        age, attrs,
        hidden:
        {
            potential: clamp(quality + (age < 24 ? wmRI(2, 7) : age < 32 ? wmRI(0, 3) : 0) + wmGauss()*1.5, 4, 20),
            consistency: wmRI(4, 19),
            injuryProne: wmRI(2, 18),
            ambition: wmRI(3, 20),
            professionalism: wmRI(3, 20),
        },
        traits: [],
        certs: [],
        morale: wmRI(50, 75),
        condition: 100,     // carried fatigue between shifts
        injury: null,       // {label, days, serious}
        form: [],           // last match ratings
        training: 'balanced',
        course: null,       // {cert, weeksLeft}
        contractWeeks: opts.contractWeeks ?? wmRI(10, 60),
        wage: 0,
        releaseClause: 0,
        stats: { shifts:0, units:0, incidents:0, ratingSum:0, errors:0, potw:0 },
        talkedWeek: -1,
        promisedRaise: false,
        bestStars: 0,
        scouted: !!opts.scouted,
        scoutOffset: {}, // stable fuzz for unscouted view
        employer: opts.employer ?? null,
    };
    // traits: 1-2
    const nTraits = wmChance(.45) ? 2 : 1;
    while (s.traits.length < nTraits)
    {
        const t = wmPick(TRAIT_KEYS);
        if (!s.traits.includes(t) && !(t === 'Loyal' && s.traits.includes('Ambitious')) && !(t === 'Ambitious' && s.traits.includes('Loyal')))
            s.traits.push(t);
    }
    if (s.traits.includes('Professional')) s.hidden.professionalism = Math.max(s.hidden.professionalism, 15);
    // certifications
    if (def.cert && wmChance(.6)) s.certs.push(def.cert);
    if (wmChance(.12)) s.certs.push(wmPick(['multizone','firstaid','nightshift']));
    s.certs = [...new Set(s.certs)];
    for (const k of ATTR_KEYS) s.scoutOffset[k] = wmRI(-3, 3);
    const a = staffAbility(s);
    s.wage = Math.round(fairWage(a) * (0.9 + Math.random()*.25) / 10) * 10;
    s.releaseClause = wmChance(.3) ? Math.round(staffValue(s) * 1.6 / 100) * 100 : 0;
    s.bestStars = starsFor(zoneRating(s, bestZone(s)));
    return s;
}

function traitMod(s, key, def = 1)
{
    let m = def;
    for (const t of s.traits)
    {
        const v = TRAIT_DEFS[t][key];
        if (v === undefined) continue;
        if (typeof v === 'number' && def === 1) m *= v; else if (typeof v === 'number') m += v; else m = v;
    }
    return m;
}
function hasTrait(s, t) { return s.traits.includes(t); }
function isAvailable(s) { return !s.injury; }

// ---------------------------------------------------------------------------
// Career creation
function newCareer(managerName, companyName)
{
    wmNextId = 1;
    const tier = 0;
    const staff = [];
    const plan = ['blue','blue','green','green','yellow','yellow','orange','orange','red','red','purple','grey','black','yellow'];
    for (const z of plan) staff.push(makeStaff({ quality: wmRI(7, 12), zone: z, scouted:true }));
    // guarantee a couple of key certs
    staff[2].certs.includes('forklift') || staff[2].certs.push('forklift');
    staff[8].certs.includes('forklift') || staff[8].certs.push('forklift');
    staff[10].certs.includes('hazmat') || staff[10].certs.push('hazmat');
    staff[12].certs.includes('maintenance') || staff[12].certs.push('maintenance');
    for (const s of staff) s.bestStars = starsFor(zoneRating(s, bestZone(s)));

    const rivals = RIVAL_DEFS.map(r => ({
        ...r,
        strength: r.strength + wmRI(-4, 4),
        staff: Array.from({length:5}, ()=> makeStaff({ quality: 8 + r.strength/12 + wmRI(-2, 3), employer: r.name })),
    }));

    career =
    {
        version: 1,
        managerName: managerName || 'Alex Morgan',
        company: companyName || 'Northbridge Logistics',
        tier,
        season: 1, week: 1, day: 1, // day = shift index within season (1..)
        cash: TIER_DEFS[tier].budget,
        reputation: 40,
        staff,
        market: [],
        rivals,
        facilities: { scanners:1, conveyors:1, breakroom:1, safety:1, training:1, racking:1, automation:0 },
        board: { confidence: 60, sacked:false },
        assistant: { name: wmPick(ASSISTANT_NAMES), quality: .55 },
        inbox: [],
        lastReport: null,
        backlog: 0,
        records: { bestShipped: 0, totalUnits: 0, injuryFreeStreak: 0, shiftsPlayed: 0 },
        milestones: {},
        seasonStats: null,
        weekLedger: null,
        lineup: {}, // staffId -> zone for the next shift
        defaultLineSpeed: 'normal',
        history: [],
        pendingMilestones: [],
        nextMsgId: 1,
    };
    resetSeasonStats();
    resetWeekLedger();
    refreshMarket(true);
    autoLineup();
    pushMsg('board', 'Welcome to ' + career.company,
        `The board has appointed you Warehouse Manager of our ${TIER_DEFS[tier].name}. ` +
        `We expect at least ${TIER_DEFS[tier].boardVol * UNITS_PER_PARCEL} units shipped per shift, a clean safety record and a profit. ` +
        `Your assistant manager, ${career.assistant.name}, can run shifts for you — but don't leave a weak crew unsupervised.`);
    pushMsg('news', 'League preview: 8 warehouses, one crown',
        'Primeway Fulfilment are favourites again. Brownline Ground boast the best safety record in the region. Kestrel Logistics have been accused of poaching staff aggressively.');
    return career;
}

function resetSeasonStats()
{
    const blank = ()=> ({ units:0, shifts:0, incidents:0, serious:0, cost:0, revenue:0, onTimeSum:0, csatSum:0, points:0 });
    career.seasonStats = { you: blank() };
    for (const r of career.rivals) career.seasonStats[r.name] = blank();
}
function resetWeekLedger()
{
    career.weekLedger = { revenue:0, wages:0, energy:0, penalties:0, fines:0, overtime:0, maintenance:0, transfers:0, upgrades:0, other:0,
        shipped:0, shifts:0, incidents:0, serious:0 };
}

function tierDef() { return TIER_DEFS[career.tier]; }
function isPeakWeek() { return PEAK_WEEKS.includes(career.week); }
function weekOfDay(day) { return Math.ceil(day / WEEK_SHIFTS); }

function pushMsg(type, title, body, actions = null, data = null)
{
    const m = { id: career.nextMsgId++, type, title, body, actions, data, read: !actions && (type === 'news' || type === 'training'), season:career.season, week:career.week, day:career.day, resolved:false };
    career.inbox.unshift(m);
    if (career.inbox.length > 80) career.inbox.length = 80;
    return m;
}
function unreadCount() { return career.inbox.filter(m => !m.read).length; }
function pendingDecisions() { return career.inbox.filter(m => m.actions && !m.resolved); }

function milestone(key, detail = '')
{
    if (!['pbShift','promotion','upgrade'].includes(key) && career.milestones[key]) return;
    career.milestones[key] = (career.milestones[key] || 0) + 1;
    career.pendingMilestones.push({ key, detail });
}

// ---------------------------------------------------------------------------
// Lineup
function autoLineup()
{
    // Fill slots in priority order: one per main-flow zone, then a second each,
    // then specialists, then extras where volume bites hardest.
    const avail = career.staff.filter(isAvailable);
    const main = ['blue','green','yellow','orange','red'];
    const slots = [...main, ...main, 'black', 'purple', 'grey', 'yellow', 'orange', 'green', 'blue', 'red', 'yellow', 'orange', 'green', 'blue', 'red'];
    const lineup = {};
    const taken = new Set();
    for (const z of slots)
    {
        if (taken.size >= avail.length) break;
        let best = null, bestR = -99;
        for (const s of avail)
        {
            if (taken.has(s.id)) continue;
            // prefer specialists in their own zone; don't waste a star on a weak fit
            const r = zoneRating(s, z) - (zoneRating(s, bestZone(s)) - zoneRating(s, z)) * .5 + (s.condition - 100) * .03;
            if (r > bestR) { bestR = r; best = s; }
        }
        if (best) { lineup[best.id] = z; taken.add(best.id); }
    }
    for (const s of avail) if (!taken.has(s.id)) lineup[s.id] = 'bench';
    career.lineup = lineup;
}
function cleanLineup()
{
    for (const s of career.staff)
        if (!s.injury && !career.lineup[s.id]) career.lineup[s.id] = 'bench';
    for (const id in career.lineup)
    {
        const s = career.staff.find(x => x.id == id);
        if (!s || s.injury) delete career.lineup[id];
    }
}

// Pre-shift risk assessment — drives the "don't simulate with this crew" warning
function crewRisk()
{
    const crew = career.staff.filter(s => career.lineup[s.id] && career.lineup[s.id] !== 'bench');
    if (!crew.length) return { level: 3, label:'No crew', avgSafety:0, avgMorale:0, avgCond:0, mult:3 };
    const avg = (f)=> crew.reduce((a,s)=> a + f(s), 0) / crew.length;
    const avgSafety = avg(s => s.attrs.safety);
    const avgMorale = avg(s => s.morale);
    const avgCond = avg(s => s.condition);
    const avgZone = avg(s => zoneRating(s, career.lineup[s.id]));
    const proneCount = crew.filter(s => hasTrait(s, 'Accident-Prone') || hasTrait(s, 'Clumsy')).length;
    const missingCerts = crew.filter(s => { const c = ZONE_DEFS[career.lineup[s.id]].cert; return c && c !== 'maintenance' && !s.certs.includes(c); }).length;
    let mult = 1 * (2 - avgSafety/20*1.5) / 1.25 * (1 + (100 - avgCond)/150) * (avgMorale < 40 ? 1.3 : 1) * (1 + proneCount*.08) * (1 + missingCerts*.12);
    mult *= (1 - career.facilities.safety*.08);
    const competence = avgZone;
    const level = mult > 1.35 || competence < 8.5 || avgMorale < 35 ? 2 : mult > 1.05 || competence < 10 ? 1 : 0;
    return { level, label:['Low','Elevated','HIGH'][level], avgSafety, avgMorale, avgCond, competence, mult, missingCerts, proneCount };
}

// ---------------------------------------------------------------------------
// Forecast for the next shift
function shiftForecast()
{
    const t = tierDef();
    const dayIdx = (career.day - 1) % WEEK_SHIFTS;
    const dayMul = [1.05, .95, 1.0, 1.02, 1.12][dayIdx];
    const peak = isPeakWeek() ? 1.3 : 1;
    const racking = 1 + career.facilities.racking * .03;
    const seed = (career.season * 997 + career.day * 131) % 100 / 100;
    const volume = Math.round(t.volume * dayMul * peak * racking * (0.94 + seed * .12));
    const hazmatShare = PACKAGE_TYPES.hazmat.weight * (seed > .7 ? 2 : 1);
    const returns = Math.round(volume * (dayIdx === 0 ? .1 : .06));
    const notes = [];
    if (isPeakWeek()) notes.push('🔥 PEAK WEEK — volume +30%');
    if (seed > .7) notes.push('☣️ Hazmat-heavy manifest');
    if (dayIdx === 0) notes.push('↩️ Monday returns spike');
    if (dayIdx === 4) notes.push('📈 Friday surge');
    if (career.backlog > 0) notes.push(`⏳ ${career.backlog} parcels carried over from last shift`);
    return { volume, hazmatShare, returns, notes, rate: t.rate, target: Math.round(t.boardVol * (isPeakWeek() ? 1.2 : 1)) };
}

// ---------------------------------------------------------------------------
// Applying a finished shift (from ShiftSim.result())
function applyShiftResult(res)
{
    const c = career;
    const L = c.weekLedger;
    const t = tierDef();
    // finances
    L.revenue += res.revenue;
    L.penalties += res.penalties;
    L.fines += res.fines;
    L.energy += res.energyCost;
    L.overtime += res.overtimeCost;
    L.other += res.contractorCost;
    L.shipped += res.shipped;
    L.shifts++;
    L.incidents += res.injuries.length;
    L.serious += res.injuries.filter(i => i.serious).length;
    c.cash += res.revenue - res.penalties - res.fines - res.energyCost - res.overtimeCost - res.contractorCost;
    c.backlog = Math.min(80, res.backlog);

    // staff
    const potw = res.workerOfShift;
    for (const w of res.workers)
    {
        const s = c.staff.find(x => x.id === w.id);
        if (!s) continue;
        if (w.rating)
        {
            s.form.push(w.rating);
            if (s.form.length > 5) s.form.shift();
            s.stats.shifts++;
            s.stats.ratingSum += w.rating;
            s.stats.units += w.processed * UNITS_PER_PARCEL;
            s.stats.errors += w.errors;
        }
        s.condition = clamp(75 + w.energy * .25 + c.facilities.breakroom * 2 - res.overtimeHours * 8, 30, 100);
        let dm = 0;
        if (w.rating >= 7.8) dm += 3; else if (w.rating && w.rating < 6) dm -= 3;
        if (w.rating && res.shipped >= res.target) dm += 1;
        dm += (60 - s.morale) * .05; // drift back toward neutral
        if (!w.rating && career.lineup[s.id] === 'bench') dm -= hasTrait(s, 'Ambitious') ? 2 : 1;
        if (res.overtimeHours) dm -= 2 * res.overtimeHours;
        if (potw && potw.id === s.id) { dm += 4; s.stats.potw++; }
        if (hasTrait(s, 'Moody')) dm *= 2;
        s.morale = clamp(s.morale + dm, 0, 100);
        w.moraleDelta = dm;
        // promotion milestone
        const stars = starsFor(zoneRating(s, bestZone(s)));
        if (stars > s.bestStars && stars >= 3) { s.bestStars = stars; milestone('promotion', `${s.name} promoted to Senior ${ZONE_DEFS[bestZone(s)].name} Associate (${stars}★)`); }
    }
    for (const inj of res.injuries)
    {
        const s = c.staff.find(x => x.id === inj.id);
        if (!s) continue;
        s.injury = { label: inj.label, days: inj.days, serious: inj.serious };
        s.stats.incidents++;
        s.morale = clamp(s.morale - (inj.serious ? 12 : 5), 0, 100);
        pushMsg('injury', `${inj.serious ? '🚨 Serious incident' : '🩹 Injury'}: ${s.name}`,
            `${s.name} suffered a ${inj.label.toLowerCase()} (${inj.cause}) and will be out for ${inj.days} shift${inj.days>1?'s':''}.` +
            (inj.serious ? ` An investigation has been opened and the warehouse was fined ${wmMoney(inj.fine)}. Team morale has taken a hit.` : ''));
        if (inj.serious) for (const o of c.staff) o.morale = clamp(o.morale - 3, 0, 100);
    }

    // records & milestones
    c.records.shiftsPlayed++;
    c.records.totalUnits += res.shipped * UNITS_PER_PARCEL;
    if (res.injuries.length === 0) c.records.injuryFreeStreak++; else c.records.injuryFreeStreak = 0;
    if (c.records.shiftsPlayed === 1) milestone('firstShift');
    if (res.injuries.length === 0 && res.nearMisses === 0) milestone('zeroIncident');
    if (res.shipped > c.records.bestShipped && c.records.shiftsPlayed > 1) milestone('pbShift', `${res.shipped * UNITS_PER_PARCEL} units shipped`);
    c.records.bestShipped = Math.max(c.records.bestShipped, res.shipped);
    if (c.records.totalUnits >= 10000) milestone('units10k');
    if (c.records.totalUnits >= 50000) milestone('units50k');
    if (c.records.totalUnits >= 100000) milestone('units100k');
    if (res.peakFlow >= 5) milestone('flowMax');
    if (c.records.injuryFreeStreak >= 5) milestone('streak5');

    // season stats (you)
    const ss = c.seasonStats.you;
    ss.units += res.shipped * UNITS_PER_PARCEL;
    ss.shifts++;
    ss.incidents += res.injuries.length;
    ss.serious += res.injuries.filter(i => i.serious).length;
    ss.cost += res.totalCost;
    ss.revenue += res.revenue;
    ss.onTimeSum += res.onTime;
    ss.csatSum += res.csat;

    // rivals play their shift too
    const dayResults = [];
    for (const r of c.rivals)
    {
        const vol = t.volume * (isPeakWeek() ? 1.3 : 1);
        const perf = clamp(.72 + r.strength/100*.32 + wmGauss()*.08, .5, 1.12);
        const shipped = Math.round(vol * perf);
        const riskStyle = r.style.includes('risk') ? 1.6 : r.style.includes('safe') ? .5 : 1;
        const inc = Math.random() < .35 * riskStyle * (1.2 - r.strength/100) ? (Math.random() < .2 ? 2 : 1) : 0;
        const serious = inc && Math.random() < .15 * riskStyle ? 1 : 0;
        const cpu = clamp(1.05 - r.strength/100*.35 + wmGauss()*.06, .55, 1.2) * t.rate;
        const onTime = clamp(.8 + r.strength/100*.17 + wmGauss()*.04, .6, 1);
        const st = c.seasonStats[r.name];
        st.units += shipped * UNITS_PER_PARCEL; st.shifts++; st.incidents += inc; st.serious += serious;
        st.cost += cpu * shipped * UNITS_PER_PARCEL; st.revenue += shipped * UNITS_PER_PARCEL * t.rate;
        st.onTimeSum += onTime; st.csatSum += onTime * (.97 + Math.random()*.03);
        dayResults.push({ name:r.name, short:r.short, hex:r.hex, shipped, incidents:inc, serious });
        if (serious && wmChance(.6)) pushMsg('news', `${r.name} hit by serious incident`, `Regulators are investigating a serious accident at ${r.name}. Their safety ranking will suffer.`);
    }
    res.rivalDay = dayResults;

    // injuries heal (by shift)
    for (const s of c.staff)
    {
        if (s.injury && !res.injuries.find(i => i.id === s.id))
        {
            s.injury.days--;
            if (s.injury.days <= 0)
            {
                pushMsg('injury', `✅ ${s.name} is fit again`, `${s.name} has recovered from ${s.injury.label.toLowerCase()} and is available for selection.`);
                s.injury = null;
            }
        }
    }

    c.lastReport = res;
    c.history.push({ season:c.season, day:c.day, shipped:res.shipped, target:res.target, injuries:res.injuries.length, profit:res.profit, csat:res.csat });
    if (c.history.length > 60) c.history.shift();

    // advance calendar
    const endOfWeek = c.day % WEEK_SHIFTS === 0;
    c.day++;
    let weekSummary = null;
    if (endOfWeek) weekSummary = endWeek();
    cleanLineup();
    return weekSummary;
}

// ---------------------------------------------------------------------------
// League
function leagueTable()
{
    const rows = [];
    const all = [{ name: career.company, short:'YOU', hex:'#38bdf8', you:true }, ...career.rivals];
    for (const r of all)
    {
        const st = career.seasonStats[r.you ? 'you' : r.name];
        const n = Math.max(1, st.shifts);
        rows.push({
            name: r.name, short:r.short, hex:r.hex, you: !!r.you,
            units: st.units,
            safety: st.units ? (st.incidents + st.serious*3) / (st.units/10000) : 0, // weighted incidents per 10k units
            cpu: st.units ? st.cost / st.units : 0,
            csat: st.csatSum / n * 100,
            points: st.points,
            shifts: st.shifts,
        });
    }
    rows.sort((a, b)=> b.points - a.points || b.units - a.units);
    return rows;
}
function awardWeeklyPoints()
{
    // Rank each category for the week (using season-to-date), award 8..1
    const rows = leagueTable();
    const award = (sorted)=> sorted.forEach((r, i)=> { const key = r.you ? 'you' : r.name; career.seasonStats[key].points += 8 - i; });
    award([...rows].sort((a,b)=> b.units - a.units));
    award([...rows].sort((a,b)=> a.safety - b.safety));
    award([...rows].sort((a,b)=> a.cpu - b.cpu));
    award([...rows].sort((a,b)=> b.csat - a.csat));
}
function leaguePosition() { return leagueTable().findIndex(r => r.you) + 1; }

// ---------------------------------------------------------------------------
// End of week: wages, training, contracts, board, events
function endWeek()
{
    const c = career;
    const L = c.weekLedger;
    const summary = { week: c.week, lines: [] };
    // wages & maintenance
    L.wages = c.staff.reduce((a, s)=> a + s.wage, 0);
    L.maintenance = Object.entries(c.facilities).reduce((a, [k, v])=> a + v * (k === 'automation' ? 600 : 110), 0);
    c.cash -= L.wages + L.maintenance;
    const profit = L.revenue - L.penalties - L.fines - L.energy - L.overtime - L.other - L.wages - L.maintenance;
    summary.profit = profit;
    summary.ledger = { ...L };

    awardWeeklyPoints();
    const pos = leaguePosition();

    // training & development
    const mentors = c.staff.filter(s => hasTrait(s, 'Mentor') && s.attrs.leadership >= 13 && !s.injury);
    for (const s of c.staff)
    {
        const focus = TRAINING_DEFS[s.training] || TRAINING_DEFS.balanced;
        const ageF = s.age < 24 ? 1.4 : s.age < 30 ? 1.1 : s.age < 40 ? .8 : s.age < 50 ? .5 : .25;
        let f = .55 * ageF * (1 + c.facilities.training * .12) * traitMod(s, 'train') * (s.hidden.professionalism / 14);
        if (mentors.length && s.age < 26 && !mentors.includes(s)) f *= 1.3;
        const gap = s.hidden.potential - staffAbility(s);
        if (gap <= 0) f *= .12;
        if (s.injury) f *= .2;
        const gains = [];
        if (s.training === 'rest')
        {
            s.condition = clamp(s.condition + 20, 0, 100);
            s.morale = clamp(s.morale + 1, 0, 100);
        }
        else for (const k of focus.attrs)
        {
            const p = f / Math.sqrt(focus.attrs.length) * .55;
            if (s.attrs[k] < 20 && wmChance(p)) { s.attrs[k]++; gains.push(k); }
        }
        // ageing decline
        if (s.age >= 48) for (const k of ['stamina','strength','productivity'])
            if (wmChance((s.age - 45) * .02)) s.attrs[k] = Math.max(1, s.attrs[k] - 1);
        if (gains.length >= 2) pushMsg('training', `📈 ${s.name} is developing well`, `Training report: ${gains.map(k=>ATTR_LABELS[k]).join(', ')} improved.`);
        // certification course
        if (s.course)
        {
            s.course.weeksLeft--;
            if (s.course.weeksLeft <= 0)
            {
                s.certs.push(s.course.cert);
                pushMsg('training', `🎓 ${s.name} certified`, `${s.name} has completed the ${CERT_DEFS[s.course.cert].label} course.`);
                s.course = null;
            }
        }
        // contract tick
        s.contractWeeks--;
        // weekend recovery
        s.condition = clamp(s.condition + 35 + c.facilities.breakroom * 3, 0, 100);
        // weekly morale baseline
        let dm = (c.facilities.breakroom - 2) * .8 + traitMod(s, 'morale', 0);
        if (s.wage < fairWage(staffAbility(s)) * .85) dm -= 2;
        if (pos <= 3) dm += 1; else if (pos >= 7) dm -= 1;
        if (s.promisedRaise && wmChance(.3)) { dm -= 6; s.promisedRaise = false; pushMsg('staff', `😠 ${s.name} feels let down`, `${s.name} says the promised pay rise never came.`); }
        s.morale = clamp(s.morale + dm, 0, 100);
    }
    // Disruptive aura
    for (const s of c.staff.filter(x => hasTrait(x, 'Disruptive')))
        if (wmChance(.35)) eventConflict(s);

    // contracts expiring
    for (const s of [...c.staff])
    {
        if (s.contractWeeks === 4) pushMsg('contract', `📝 ${s.name}: contract expiring`, `${s.name}'s contract runs out in 4 weeks. Offer a new deal from their profile or they will leave as a free agent.`);
        if (s.contractWeeks <= 0)
        {
            removeStaff(s);
            s.employer = null; s.contractWeeks = 0;
            c.market.push(s);
            pushMsg('contract', `👋 ${s.name} has left`, `${s.name}'s contract expired and they have left ${c.company}.`);
        }
    }

    // events
    weeklyEvents();

    // board review
    const target = tierDef().boardVol * (isPeakWeek() ? 1.2 : 1);
    const avgShipped = L.shifts ? L.shipped / L.shifts : 0;
    const volScore = clamp((avgShipped / target - 1) * 25, -8, 6);
    const safetyScore = L.serious ? -6 * L.serious - L.incidents : L.incidents ? -1.5 * L.incidents : 3;
    const profitScore = profit > 0 ? clamp(profit / 1500, 0, 4) : clamp(profit / 1000, -6, 0);
    const avgMorale = c.staff.reduce((a,s)=> a + s.morale, 0) / Math.max(1, c.staff.length);
    const moraleScore = avgMorale > 65 ? 1 : avgMorale < 40 ? -3 : 0;
    const leagueScore = pos <= 3 ? 2 : pos >= 7 ? -2 : 0;
    const delta = Math.round(volScore + safetyScore + profitScore + moraleScore + leagueScore);
    c.board.confidence = clamp(c.board.confidence + delta, 0, 100);
    summary.board = { delta, volScore, safetyScore, profitScore, moraleScore, leagueScore, confidence:c.board.confidence, avgShipped, target };
    pushMsg('board', `📊 Week ${c.week} board review (${delta >= 0 ? '+' : ''}${delta})`,
        `Average shipped ${Math.round(avgShipped*UNITS_PER_PARCEL)} units vs target ${Math.round(target*UNITS_PER_PARCEL)}. ` +
        `Incidents: ${L.incidents} (${L.serious} serious). Weekly profit ${wmMoney(profit)}. League position: ${ordinal(pos)}. ` +
        `Board confidence is now ${c.board.confidence}%.` + (c.board.confidence < 25 ? ' ⚠️ The board is losing patience.' : ''));

    if (c.board.confidence <= 5) c.board.sacked = true;

    // rival drift
    for (const r of c.rivals) r.strength = clamp(r.strength + wmGauss()*1.5, 25, 92);

    resetWeekLedger();
    c.week++;
    if (c.week > SEASON_WEEKS && !c.board.sacked) summary.seasonEnd = endSeason();
    else refreshMarket(false);
    if (leaguePosition() === 1) milestone('league1');
    return summary;
}

function ordinal(n) { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }

function endSeason()
{
    const c = career;
    const table = leagueTable();
    const pos = table.findIndex(r => r.you) + 1;
    const res = { season:c.season, position:pos, table, promoted:false, sacked:false };
    if (pos <= 2 && c.tier < TIER_DEFS.length - 1)
    {
        res.promoted = true;
        c.tier++;
        c.cash += 15000 * c.tier;
        c.board.confidence = clamp(c.board.confidence + 20, 0, 100);
        pushMsg('board', `🏆 Promotion to ${tierDef().name}!`, `Finishing ${ordinal(pos)} has earned ${c.company} a bigger site. Expect higher volume, bigger contracts — and tougher expectations.`);
    }
    else if (pos >= 7 && c.board.confidence < 35)
    {
        res.sacked = true;
        c.board.sacked = true;
    }
    else
    {
        c.board.confidence = clamp(c.board.confidence + (pos <= 4 ? 8 : -6), 0, 100);
        pushMsg('board', `Season ${c.season} complete — ${ordinal(pos)}`, pos <= 4 ? 'A solid season. The board renews its faith in you.' : 'A disappointing season. Improvement is expected next year.');
    }
    if (!res.sacked)
    {
        c.season++;
        c.week = 1;
        c.day = 1;
        for (const s of c.staff) { s.age++; s.hidden.potential = clamp(s.hidden.potential - (s.age > 40 ? .5 : 0), 3, 20); }
        for (const r of c.rivals) { r.strength = clamp(r.strength + (res.promoted ? 6 : 0) + wmGauss()*4, 30, 95); for (const s of r.staff) s.age++; }
        resetSeasonStats();
        refreshMarket(true);
        c.reputation = clamp(c.reputation + (6 - pos) * 3, 5, 100);
    }
    return res;
}

// ---------------------------------------------------------------------------
// Events & decisions
function weeklyEvents()
{
    const c = career;
    // poaching attempts
    for (const s of c.staff)
    {
        const a = staffAbility(s);
        const p = .02 + Math.max(0, a - 11) * .025 * traitMod(s, 'poach') * (s.morale < 45 ? 1.8 : 1);
        if (!s.injury && wmChance(p))
        {
            const r = wmPick(c.rivals);
            const offer = Math.round(s.wage * (1.25 + Math.random()*.3) / 10) * 10;
            const fee = Math.max(s.releaseClause || 0, Math.round(staffValue(s) * 1.1 / 100) * 100);
            pushMsg('poach', `🎯 ${r.name} want ${s.name}`,
                `${r.name} have offered ${s.name} ${wmMoney(offer)}/wk (currently ${wmMoney(s.wage)}) and will pay you ${wmMoney(fee)}. How do you respond?`,
                [{ label:`Match offer (${wmMoney(offer)}/wk)`, id:'match' }, { label:`Sell for ${wmMoney(fee)}`, id:'sell' }, { label:'Refuse', id:'refuse' }],
                { staffId:s.id, rival:r.name, offer, fee });
            break; // at most one a week
        }
    }
    // wage request
    const unhappy = c.staff.filter(s => s.wage < fairWage(staffAbility(s)) * .9 && s.morale < 60);
    if (unhappy.length && wmChance(.5))
    {
        const s = wmPick(unhappy);
        const ask = Math.round(fairWage(staffAbility(s)) / 10) * 10;
        pushMsg('staff', `💬 ${s.name} asks for a raise`, `${s.name} believes they are underpaid at ${wmMoney(s.wage)}/wk and asks for ${wmMoney(ask)}/wk.`,
            [{ label:`Accept (${wmMoney(ask)}/wk)`, id:'accept' }, { label:'Promise a raise later', id:'promise' }, { label:'Refuse', id:'refuse' }],
            { staffId:s.id, ask });
    }
    // supplier deal
    if (wmChance(.2))
    {
        const keys = Object.keys(FACILITY_DEFS).filter(k => c.facilities[k] < FACILITY_DEFS[k].max);
        if (keys.length)
        {
            const k = wmPick(keys);
            const cost = Math.round(facilityCost(k) * .7);
            pushMsg('deal', `🏷️ Supplier offer: ${FACILITY_DEFS[k].label}`, `A supplier offers a level ${c.facilities[k]+1} ${FACILITY_DEFS[k].label} upgrade for ${wmMoney(cost)} (30% off) this week only.`,
                [{ label:`Buy for ${wmMoney(cost)}`, id:'buy' }, { label:'Decline', id:'decline' }], { key:k, cost });
        }
    }
    // rival news flavour
    if (wmChance(.5))
    {
        const r = wmPick(c.rivals);
        const lines = [
            `${r.name} unveil a new automated sortation line.`,
            `${r.name}'s manager claims their crew "would walk all over" ${c.company}.`,
            `Rumours of a strike ballot at ${r.name}.`,
            `${r.name} sign a big e-commerce contract ahead of peak.`,
            `${r.name} fined after a forklift collision.`,
        ];
        pushMsg('news', `📰 Rival news: ${r.short}`, wmPick(lines));
    }
}
function eventConflict(s)
{
    const victim = wmPick(career.staff.filter(x => x !== s));
    if (!victim) return;
    pushMsg('staff', `⚡ Clash: ${s.name} vs ${victim.name}`, `${s.name} got into a heated argument with ${victim.name} on the floor. The team is watching how you respond.`,
        [{ label:`Discipline ${s.name.split(' ')[0]}`, id:'discipline' }, { label:'Let it go', id:'ignore' }], { staffId:s.id, victimId:victim.id });
}

function resolveDecision(msg, actionId)
{
    const c = career;
    const d = msg.data || {};
    const s = d.staffId ? c.staff.find(x => x.id === d.staffId) : null;
    let out = '';
    msg.resolved = true;
    msg.read = true;
    msg.choice = actionId;
    if (msg.type === 'poach')
    {
        if (!s) return 'They have already left.';
        if (actionId === 'match') { s.wage = d.offer; s.morale = clamp(s.morale + 8, 0, 100); s.contractWeeks = Math.max(s.contractWeeks, 52); out = `${s.name} stays on ${wmMoney(d.offer)}/wk with a 52-week deal.`; }
        else if (actionId === 'sell')
        {
            c.cash += d.fee; c.weekLedger.transfers -= d.fee;
            removeStaff(s);
            const r = c.rivals.find(x => x.name === d.rival); s.employer = d.rival; s.wage = d.offer; s.scouted = true;
            r && r.staff.push(s);
            out = `${s.name} joins ${d.rival}. ${wmMoney(d.fee)} received.`;
        }
        else
        {
            s.morale = clamp(s.morale - (hasTrait(s, 'Ambitious') ? 14 : 6), 0, 100);
            out = `${s.name} is unhappy at being denied the move.`;
        }
    }
    else if (msg.type === 'staff' && d.ask !== undefined)
    {
        if (!s) return 'They have already left.';
        if (actionId === 'accept') { s.wage = d.ask; s.morale = clamp(s.morale + 10, 0, 100); out = `${s.name} is delighted.`; }
        else if (actionId === 'promise') { s.promisedRaise = true; s.morale = clamp(s.morale + 3, 0, 100); out = `${s.name} will hold you to that.`; }
        else { s.morale = clamp(s.morale - 8, 0, 100); out = `${s.name} is disappointed.`; }
    }
    else if (msg.type === 'staff' && d.victimId)
    {
        if (!s) return 'They have already left.';
        if (actionId === 'discipline') { s.morale = clamp(s.morale - 6, 0, 100); for (const o of c.staff) if (o !== s) o.morale = clamp(o.morale + 1, 0, 100); out = `The team appreciates the firm hand.`; }
        else { for (const o of c.staff) o.morale = clamp(o.morale - 2, 0, 100); out = `Tension lingers on the floor.`; }
    }
    else if (msg.type === 'deal')
    {
        if (actionId === 'buy')
        {
            if (c.cash < d.cost) { msg.resolved = false; return 'Not enough cash.'; }
            if (c.facilities[d.key] >= FACILITY_DEFS[d.key].max) return 'Already at maximum level.';
            c.cash -= d.cost; c.facilities[d.key]++; c.weekLedger.upgrades += d.cost;
            milestone('upgrade', `${FACILITY_DEFS[d.key].label} → level ${c.facilities[d.key]}`);
            out = 'Upgrade installed.';
        }
        else out = 'Offer declined.';
    }
    msg.outcome = out;
    return out;
}

// ---------------------------------------------------------------------------
// Facilities
function facilityCost(key)
{
    const lvl = career.facilities[key];
    return Math.round(FACILITY_DEFS[key].base * Math.pow(1.7, lvl) / 100) * 100;
}
function buyFacility(key)
{
    const c = career;
    if (c.facilities[key] >= FACILITY_DEFS[key].max) return 'Already at maximum level.';
    const cost = facilityCost(key);
    if (c.cash < cost) return 'Not enough cash.';
    c.cash -= cost; c.facilities[key]++; c.weekLedger.upgrades += cost;
    milestone('upgrade', `${FACILITY_DEFS[key].label} → level ${c.facilities[key]}`);
    return null;
}

// ---------------------------------------------------------------------------
// Staff management actions
function removeStaff(s)
{
    career.staff = career.staff.filter(x => x !== s);
    delete career.lineup[s.id];
}
function releaseCost(s) { return Math.round(s.wage * Math.max(0, s.contractWeeks) * .5); }
function releaseStaff(s)
{
    const cost = releaseCost(s);
    if (career.cash < cost) return 'Not enough cash to pay off the contract.';
    if (career.staff.length <= 8) return 'You need at least 8 staff.';
    career.cash -= cost;
    removeStaff(s);
    s.employer = null; s.contractWeeks = 0;
    career.market.push(s);
    for (const o of career.staff) if (o.traits.includes('Loyal') || o.morale > 50) o.morale = clamp(o.morale - 1, 0, 100);
    pushMsg('contract', `${s.name} released`, `${s.name}'s contract was terminated. Settlement paid: ${wmMoney(cost)}.`);
    return null;
}
function contractDemand(s)
{
    const base = fairWage(staffAbility(s));
    const moraleF = 1.15 - s.morale / 100 * .3;
    return Math.round(base * moraleF * (hasTrait(s, 'Ambitious') ? 1.1 : 1) / 10) * 10;
}
function acceptChance(s, wage, weeks, isNewClub = false, fee = 0)
{
    const demand = contractDemand(s) * (isNewClub && s.employer ? 1.12 : 1);
    let p = clamp(.62 + (wage / demand - 1) * 3, 0, 1);
    if (weeks >= 104 && s.age > 40) p += .1;
    if (weeks <= 26 && s.age < 25) p += .05;
    if (isNewClub)
    {
        const rival = career.rivals.find(r => r.name === s.employer);
        if (rival) p -= (rival.strength - 45 - career.tier*8) / 200;
        if (hasTrait(s, 'Loyal') && s.employer) p -= .3;
        if (hasTrait(s, 'Ambitious')) p += .08;
        p += (career.reputation - 40) / 300;
    }
    return clamp(p, 0, .97);
}
function offerContract(s, wage, weeks)
{
    const p = acceptChance(s, wage, weeks);
    if (wmChance(p))
    {
        s.wage = wage; s.contractWeeks = weeks; s.morale = clamp(s.morale + 5, 0, 100);
        s.promisedRaise = false;
        return { ok:true, text:`${s.name} signs a ${weeks}-week contract at ${wmMoney(wage)}/wk.` };
    }
    s.morale = clamp(s.morale - 3, 0, 100);
    return { ok:false, text:`${s.name} rejects the offer.` };
}
function staffTalk(s, kind)
{
    if (s.talkedWeek === career.season*100 + career.week) return { text:`You've already spoken to ${s.name} this week.` };
    s.talkedWeek = career.season*100 + career.week;
    const form = s.form.length ? s.form.reduce((a,b)=>a+b,0)/s.form.length : 6.5;
    let dm = 0, text = '';
    if (kind === 'praise')
    {
        if (form >= 7) { dm = 5; text = `${s.name} beams: "Thanks boss!"`; }
        else if (form >= 6.3) { dm = 2; text = `${s.name} appreciates the kind words.`; }
        else { dm = -1; text = `${s.name} looks confused — they know they've been struggling.`; }
    }
    else
    {
        if (form < 6.5) { dm = s.hidden.professionalism >= 13 ? 3 : -4; text = dm > 0 ? `${s.name} accepts the criticism and vows to improve.` : `${s.name} reacts badly to being criticised.`; }
        else { dm = -7; text = `${s.name} is furious — their form has been good!`; }
    }
    s.morale = clamp(s.morale + dm, 0, 100);
    return { text, dm };
}
function startCourse(s, cert)
{
    const d = CERT_DEFS[cert];
    if (s.certs.includes(cert)) return 'Already certified.';
    if (s.course) return 'Already on a course.';
    if (career.cash < d.cost) return 'Not enough cash.';
    career.cash -= d.cost; career.weekLedger.other += d.cost;
    s.course = { cert, weeksLeft: d.weeks };
    return null;
}

// ---------------------------------------------------------------------------
// Transfer market
function refreshMarket(full)
{
    const c = career;
    if (full) c.market = [];
    c.market = c.market.filter(()=> wmChance(.75));
    const tq = 8 + c.tier * 1.5;
    while (c.market.filter(s => s.age >= 21).length < 12) c.market.push(makeStaff({ quality: tq + wmRI(-3, 3) }));
    while (c.market.filter(s => s.age < 21).length < 4) c.market.push(makeStaff({ quality: wmRI(5, 8), age: wmRI(17, 20), contractWeeks:0 }));
    for (const s of c.market) { s.employer = null; s.contractWeeks = 0; }
}
function scoutCost() { return 250 + career.tier * 100; }
function scoutStaff(s)
{
    if (s.scouted) return null;
    if (career.cash < scoutCost()) return 'Not enough cash.';
    career.cash -= scoutCost(); career.weekLedger.other += scoutCost();
    s.scouted = true;
    return null;
}
function transferFee(s) { return s.employer ? (s.releaseClause || Math.round(staffValue(s) * 1.2 / 100) * 100) : 0; }
function signStaff(s, wage, weeks)
{
    const c = career;
    if (c.staff.length >= tierDef().squad + 4) return { ok:false, text:'Your break room is full — release someone first.' };
    const fee = transferFee(s);
    if (c.cash < fee) return { ok:false, text:'Not enough cash for the transfer fee.' };
    const p = acceptChance(s, wage, weeks, true, fee);
    if (!wmChance(p))
    {
        return { ok:false, text:`${s.name} turns down your approach.` };
    }
    c.cash -= fee; c.weekLedger.transfers += fee;
    if (s.employer)
    {
        const r = c.rivals.find(x => x.name === s.employer);
        if (r) { r.staff = r.staff.filter(x => x !== s); r.staff.push(makeStaff({ quality: 8 + r.strength/12, employer:r.name })); }
    }
    else c.market = c.market.filter(x => x !== s);
    s.employer = null; s.wage = wage; s.contractWeeks = weeks; s.scouted = true;
    s.morale = clamp(65 + wmRI(0, 15), 0, 100);
    s.condition = 100;
    c.staff.push(s);
    c.lineup[s.id] = 'bench';
    pushMsg('contract', `✍️ ${s.name} signs!`, `${s.name} joins ${c.company} on ${wmMoney(wage)}/wk for ${weeks} weeks` + (fee ? ` (fee ${wmMoney(fee)}).` : '.'));
    return { ok:true, text:`${s.name} signs for ${c.company}!` };
}

// Attribute as the player sees it (fuzzy until scouted)
function attrView(s, k)
{
    if (s.scouted || career.staff.includes(s)) return { exact:true, v:s.attrs[k], txt:String(s.attrs[k]) };
    const mid = clamp(s.attrs[k] + s.scoutOffset[k], 1, 20);
    const lo = clamp(mid - 3, 1, 20), hi = clamp(mid + 3, 1, 20);
    return { exact:false, v:mid, txt:`${lo}-${hi}` };
}

// ---------------------------------------------------------------------------
// Save / load
const WM_SAVE_KEY = 'warehouseManagerSave';
function saveCareer()
{
    if (!career) return;
    try { writeSaveData(WM_SAVE_KEY, { career, nextId: wmNextId }); } catch (e) { console.warn('save failed', e); }
}
function loadCareer()
{
    try
    {
        const d = readSaveData(WM_SAVE_KEY, { career:null, nextId:1 });
        if (d && d.career && d.career.version === 1)
        {
            career = d.career;
            wmNextId = d.nextId || 1000;
            return true;
        }
    } catch (e) { console.warn('load failed', e); }
    return false;
}
function hasSave()
{
    try { const d = readSaveData(WM_SAVE_KEY, { career:null }); return !!(d && d.career); } catch (e) { return false; }
}
function deleteSave()
{
    try { writeSaveData(WM_SAVE_KEY, { career:null, nextId:1 }); } catch (e) {}
}
