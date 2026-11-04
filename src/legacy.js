'use strict';
// ============================================================================
// Legacy layer — the long game.
//  - Manager profile: reputation, personal wallet, salary, career history
//  - Homegrown academy: create, customise and develop your own recruits
//  - Fatalities, memorials and the "days without accident" board
//  - Story modifiers (temporary effects from cutscene choices)
//  - Job offers from bigger companies, and founding your own warehouse
// ============================================================================

const HOMEGROWN_TRAIN_MUL = 1.35;
const HOMEGROWN_BOND_SHARE = .5;

// ---------------------------------------------------------------------------
// Upgrade old saves / new careers with legacy fields
function ensureLegacy(c = career)
{
    if (!c) return;
    c.manager ??= { name:c.managerName, look:randomLook(), rep:c.reputation ?? 40, wallet:5000, history:[], trophies:[], owner:false, salaryBase:900 };
    c.manager.name ??= c.managerName;
    c.flags ??= {};
    c.mods ??= [];
    c.memorial ??= [];
    c.hallOfFame ??= [];
    c.storySeen ??= {};
    c.offers ??= [];
    c.academy ??= { intake:0 };
    c.records.daysSinceAccident ??= 0;
    c.records.bestSafeRun ??= 0;
    c.records.fatalities ??= 0;
    c.records.homegrownDebuts ??= 0;
    c.companyHex ??= '#38bdf8';
    for (const s of c.staff) s.look ??= randomLook();
    for (const s of c.market) s.look ??= randomLook();
    for (const r of c.rivals) for (const s of r.staff) s.look ??= randomLook();
}
function managerSalary() { return Math.round((900 + career.tier * 700 + career.manager.rep * 12) / 50) * 50; }

// ---------------------------------------------------------------------------
// Story modifiers: { key, value, shifts, label }
function addMod(key, value, shifts, label)
{
    career.mods.push({ key, value, shifts, label });
}
function modMul(key)
{
    let m = career?.manager?.perks?.[key] ?? 1;
    for (const x of career?.mods || []) if (x.key === key && x.shifts > 0) m *= x.value;
    return m;
}
function tickMods()
{
    for (const x of career.mods) x.shifts--;
    career.mods = career.mods.filter(x => x.shifts > 0);
}

// ---------------------------------------------------------------------------
// Homegrown academy
function academySlots() { return 2 + career.facilities.training; }
function academyCount() { return career.staff.filter(s => s.homegrown).length; }
function recruitCost() { return Math.round((600 + career.tier * 300) * (career.manager.perks?.recruit ?? 1) / 10) * 10; }

// Build a raw recruit (not yet signed) for the creator screen
function draftRecruit(arch = 'speedster')
{
    const a = ARCHETYPES[arch];
    const s = makeStaff({ quality: wmRI(5, 7), age: wmRI(17, 20), zone: a.zone, scouted:true, contractWeeks:104 });
    for (const k in a.bias) s.attrs[k] = Math.min(20, s.attrs[k] + a.bias[k]);
    // academy prospects: the better your training centre, the higher the ceiling
    s.hidden.potential = clamp(13 + career.facilities.training * .8 + Math.random() * 4 + wmGauss() * 1.5, 11, 20);
    s.hidden.professionalism = Math.max(s.hidden.professionalism, 11);
    s.traits = a.trait ? [a.trait] : [];
    if (Math.random() < .5) { const t = wmPick(['Professional','Ambitious','Loyal','Team Player','Steady','Speed Demon']); if (!s.traits.includes(t)) s.traits.push(t); }
    if (!s.traits.length) s.traits.push('Loyal');
    s.wage = 220 + career.tier * 40;
    s.archetype = arch;
    s.look = randomLook();
    s.nickname = '';
    return s;
}
function signRecruit(s)
{
    const c = career;
    if (academyCount() >= academySlots()) return 'The apprentice scheme is full — upgrade the Training Centre for more places.';
    if (c.staff.length >= tierDef().squad + 4) return 'Your break room is full — release someone first.';
    if (c.cash < recruitCost()) return 'Not enough cash for the recruitment drive.';
    c.cash -= recruitCost(); c.weekLedger.other += recruitCost();
    c.academy.intake++;
    s.homegrown = { season:c.season, intake:c.academy.intake, debut:false, company:c.company };
    s.employer = null;
    s.morale = 80;
    s.condition = 100;
    s.bestStars = starsFor(zoneRating(s, bestZone(s)));
    s.stats.joined = `S${c.season}`;
    c.staff.push(s);
    c.lineup[s.id] = 'bench';
    pushMsg('staff', `🌱 ${displayName(s)} joins the apprentice scheme`, `${s.name}${s.nickname ? ` "${s.nickname}"` : ''} (${s.age}, ${ARCHETYPES[s.archetype].label}) has signed their first contract. Develop them well and they'll stay loyal for life.`);
    return null;
}
function displayName(s) { return s.nickname ? `${s.name.split(' ')[0]} "${s.nickname}"` : s.name; }
function homegrownShare(lineup = career.lineup)
{
    const crew = career.staff.filter(s => lineup[s.id] && lineup[s.id] !== 'bench' && !s.injury);
    if (!crew.length) return 0;
    return crew.filter(s => s.homegrown).length / crew.length;
}
function hasHomegrownBond(lineup) { return homegrownShare(lineup) >= HOMEGROWN_BOND_SHARE; }

// Called after every shift: debuts, stars, hall of fame
function homegrownProgress(res)
{
    const c = career;
    for (const s of c.staff.filter(x => x.homegrown))
    {
        const w = res.workers.find(x => x.id === s.id);
        if (w && w.rating && !s.homegrown.debut)
        {
            s.homegrown.debut = true;
            c.records.homegrownDebuts++;
            milestone('homegrownDebut', `${displayName(s)} completes their first shift (${w.rating.toFixed(1)})`);
            if (!c.storySeen.debut) c.flags.pendingDebut = s.id;
        }
        const stars = starsFor(zoneRating(s, bestZone(s)));
        for (const goal of [3, 4, 5])
        {
            const key = 'hgStar' + goal;
            if (stars >= goal && !s.homegrown[key])
            {
                s.homegrown[key] = true;
                c.manager.rep = clamp(c.manager.rep + goal - 1, 0, 100);
                milestone('homegrownHero', `Apprentice graduate ${displayName(s)} reaches ${goal}★ — reputation +${goal - 1}`);
                if (goal >= 4 && !c.hallOfFame.find(h => h.id === s.id))
                    c.hallOfFame.push({ id:s.id, name:displayName(s), look:s.look, note:`Apprentice class of Y${s.homegrown.season} · ${goal}★ ${ZONE_DEFS[bestZone(s)].name}`, kind:'hero' });
            }
        }
    }
    if (hasHomegrownBond(c.lineup) && res.workers.filter(w => w.rating).length >= 8) milestone('homegrownBond', 'More than half the floor came through your apprentice scheme');
}

// ---------------------------------------------------------------------------
// Accidents: fatalities & the days-without-accident board
function recordAccidents(res)
{
    const c = career;
    if (res.injuries.length) { c.records.daysSinceAccident = 0; }
    else { c.records.daysSinceAccident++; c.records.bestSafeRun = Math.max(c.records.bestSafeRun, c.records.daysSinceAccident); }
    if (c.records.daysSinceAccident === 10) milestone('safe10');
    const strike = res.injuries.find(i => i.type === 'strike' || i.type === 'forklift');
    if (strike && !strike.fatal) c.flags.pendingViral = strike.name;
    if (res.injuries.some(i => i.serious) && !c.flags.firstSerious) c.flags.firstSerious = true;
    if (c.records.daysSinceAccident === 30) milestone('safe30');
    for (const inj of res.injuries.filter(i => i.fatal))
    {
        const s = c.staff.find(x => x.id === inj.id);
        if (!s) continue;
        c.records.fatalities++;
        const fine = Math.round((22000 + Math.random() * 30000) * (1 - c.facilities.safety * .08) / 500) * 500;
        c.cash -= fine;
        c.weekLedger.fines += fine;
        c.memorial.push({ id:s.id, name:displayName(s), look:s.look, age:s.age, cause:inj.cause, season:c.season, week:c.week, company:c.company, homegrown:!!s.homegrown });
        removeStaff(s);
        for (const o of c.staff) o.morale = clamp(o.morale - (o.homegrown && s.homegrown ? 22 : 15), 0, 100);
        if (!c.manager.owner) c.board.confidence = clamp(c.board.confidence - 22, 0, 100);
        c.manager.rep = clamp(c.manager.rep - 10, 0, 100);
        pushMsg('injury', `🕯️ ${s.name} has died`, `${s.name} (${s.age}) was ${inj.cause} on the floor. The regulator has fined ${c.company} ${wmMoney(fine)} and opened a criminal investigation. The whole site is in shock.`);
        c.flags.pendingTragedy = { name:s.name, cause:inj.cause, homegrown:!!s.homegrown };
    }
}

// ---------------------------------------------------------------------------
// Weekly legacy tick (salary, owner dividends, bankruptcy)
function legacyWeek(summary)
{
    const c = career, m = c.manager;
    if (m.owner)
    {
        const div = summary.profit > 0 ? Math.round(summary.profit * .25) : 0;
        if (div) { m.wallet += div; c.cash -= div; }
        summary.dividend = div;
        if (c.cash < -25000)
        {
            if (c.flags.bankWarning) { c.board.sacked = true; c.flags.bankrupt = true; }
            else { c.flags.bankWarning = true; pushMsg('board', '🏦 The bank is calling', 'Your company is deep in the red. Get back above -£25,000 by next week or the bank will foreclose.'); }
        }
        else c.flags.bankWarning = false;
    }
    else m.wallet += managerSalary();
}

// ---------------------------------------------------------------------------
// Job offers
function generateOffers(reason = 'season')
{
    const c = career, m = c.manager;
    const offers = [];
    const n = reason === 'sacked' ? (m.rep >= 15 ? 2 : 1) : m.rep >= 70 ? 3 : m.rep >= 50 ? 2 : m.rep >= 35 ? 1 : 0;
    const pool = [...OFFER_COMPANIES, ...RIVAL_DEFS.map(r => ({ name:r.name, hex:r.hex }))].filter(o => o.name !== c.company);
    for (let i = 0; i < n; i++)
    {
        const co = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        if (!co) break;
        let tier = reason === 'sacked' ? Math.max(0, c.tier - 1) : clamp(c.tier + (m.rep >= 65 ? wmRI(0, 2) : wmRI(0, 1)), 0, TIER_DEFS.length - 1);
        const salary = Math.round((900 + tier * 750 + m.rep * 14) * (1 + Math.random() * .25) / 50) * 50;
        const fac = Math.min(5, 1 + tier + wmRI(-1, 1));
        offers.push({ id:i + 1, name:co.name, hex:co.hex, tier, salary, facLevel:Math.max(1, fac),
            budget: Math.round(TIER_DEFS[tier].budget * (.8 + Math.random() * .5) / 1000) * 1000,
            squadQuality: 8 + tier * 1.4 + wmRI(-1, 1),
            pitch: wmPick(['wants a winner to lead their expansion', 'has a ruthless board but deep pockets', 'needs someone to fix a disastrous safety record', 'is famous for developing young talent', 'just lost their manager to a rival']) });
    }
    c.offers = offers;
    return offers;
}
function followerCandidates()
{
    return career.staff.filter(s => !s.injury && (s.homegrown || hasTrait(s, 'Loyal') || s.morale >= 70));
}
function maxFollowers() { return 3 + Math.floor(career.manager.rep / 25); }

function freshSite(opts)
{
    const c = career;
    const prevCompany = c.company;
    c.manager.history.push({ company:prevCompany, tier:c.tier, seasons:c.flags.stintSeasons || 1, owner:!!c.manager.owner, endSeason:c.season });
    c.flags = { stintSeasons:0 };
    c.company = opts.name;
    c.companyHex = opts.hex || '#38bdf8';
    c.tier = opts.tier;
    c.cash = opts.cash;
    c.facilities = { scanners:opts.fac, conveyors:opts.fac, breakroom:opts.fac, safety:opts.fac, training:opts.fac, racking:opts.fac, automation: opts.tier >= 3 ? 1 : 0 };
    // followers come along, everyone else stays behind
    const keep = c.staff.filter(s => opts.followers.includes(s.id));
    for (const s of keep) { s.morale = clamp(s.morale + 10, 0, 100); s.contractWeeks = Math.max(s.contractWeeks, 52); }
    const fresh = [];
    if (!opts.own)
    {
        const zones = ['blue','green','yellow','orange','red','purple','grey','black','yellow','orange','blue','green','red','yellow'];
        const need = Math.max(8, Math.min(tierDef().squad, 14 + opts.tier * 2) - keep.length);
        for (let i = 0; i < need; i++) fresh.push(makeStaff({ quality: opts.squadQuality + wmRI(-2, 2), zone: zones[i % zones.length], scouted:true }));
        fresh[0] && !fresh.some(s => s.certs.includes('forklift')) && fresh[0].certs.push('forklift');
    }
    else
    {
        // a start-up: your followers plus a handful of cheap temps
        const zones = ['blue','green','yellow','orange','red','grey','black','yellow'];
        const need = Math.max(0, 10 - keep.length);
        for (let i = 0; i < need; i++) fresh.push(makeStaff({ quality: wmRI(6, 9), zone: zones[i % zones.length], scouted:true, contractWeeks:26 }));
    }
    c.staff = [...keep, ...fresh];
    c.lineup = {};
    c.board = { confidence:60, sacked:false };
    c.manager.owner = !!opts.own;
    c.backlog = 0;
    c.mods = [];
    c.records.daysSinceAccident = 0;
    // rivals: your old employer becomes one of them
    const rivalDefs = RIVAL_DEFS.filter(r => r.name !== c.company).slice(0, 6);
    rivalDefs.push({ name:prevCompany, short:prevCompany.slice(0, 3).toUpperCase(), hex:'#94a3b8', strength:55, style:'Your former employer — they want revenge' });
    c.rivals = rivalDefs.map(r => ({ ...r, strength: clamp(r.strength + c.tier * 5 + wmRI(-4, 4), 25, 95),
        staff: Array.from({ length:5 }, ()=> makeStaff({ quality: 8 + c.tier + r.strength / 14 + wmRI(-2, 2), employer:r.name })) }));
    for (const r of c.rivals) for (const s of r.staff) s.look ??= randomLook();
    if (opts.newSeason) c.season++;
    c.week = 1; c.day = 1;
    resetSeasonStats();
    resetWeekLedger();
    refreshMarket(true);
    autoLineup();
    c.offers = [];
}
function acceptOffer(offer, followers, newSeason = false)
{
    const prev = career.company;
    freshSite({ name:offer.name, hex:offer.hex, tier:offer.tier, cash:offer.budget, fac:offer.facLevel, squadQuality:offer.squadQuality, followers, newSeason });
    career.manager.salaryBase = offer.salary;
    pushMsg('board', `🤝 Welcome to ${offer.name}`, `You leave ${prev} to take charge of ${offer.name}'s ${tierDef().name}. ${followers.length ? followers.length + ' loyal staff followed you.' : 'You arrive alone.'}`);
    milestone('newJob', `${offer.name} — ${tierDef().name}`);
}
const OWN_COMPANY_COST = 60000;
function canFoundCompany() { return career.manager.wallet >= OWN_COMPANY_COST; }
function foundCompany(name, hex, followers)
{
    const invest = career.manager.wallet;
    career.manager.wallet = 0;
    freshSite({ name, hex, tier:0, cash: invest + 15000, fac:1, squadQuality:8, followers, own:true });
    career.manager.owner = true;
    pushMsg('board', `🏗️ ${name} is open for business!`, `You've sunk ${wmMoney(invest)} of your own money into ${name}. No board to answer to now — just the bank, your customers and your crew. Every profit pays you a dividend.`);
    milestone('ownCompany', name);
}
