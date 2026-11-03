'use strict';
// ============================================================================
// Story — cutscenes with choices that change the game.
// Scenes are data: who's on stage, what they say, and choices whose effects
// touch cash, morale, the board, reputation, flags and temporary modifiers.
// ============================================================================

// ---------------------------------------------------------------------------
// Cast
const CAST =
{
    gus:     { name:'Gus Pemberton',   role:'Outgoing manager',     look:{ skin:1, hair:7, style:5, hat:0, acc:2 }, vest:'#3ec1ff' },
    vale:    { name:'Margaret Vale',   role:'Chair of the Board',   look:{ skin:0, hair:7, style:3, hat:5, acc:1 }, vest:'#7c3aed', hat:false },
    dunn:    { name:'Inspector Dunn',  role:'Health & Safety Exec', look:{ skin:3, hair:0, style:2, hat:5, acc:1 }, vest:'#ffd23f' },
    tasha:   { name:'Tasha Grant',     role:'Union rep',            look:{ skin:4, hair:5, style:1, hat:3, acc:5 }, vest:'#ef4444' },
    priya:   { name:'Priya Shah',      role:'MegaCart account lead',look:{ skin:2, hair:0, style:4, hat:6, acc:0 }, vest:'#ec4899', hat:false },
    vince:   { name:'Vince Kowalczyk', role:'Rival manager',        look:{ skin:1, hair:2, style:1, hat:7, acc:4 }, vest:'#0ea5e9' },
    rupert:  { name:'Rupert Vale',     role:"The Chair's nephew",   look:{ skin:0, hair:3, style:1, hat:4, acc:0 }, vest:'#a3e635' },
    holt:    { name:'Dana Holt',       role:'Head-hunter',          look:{ skin:2, hair:1, style:2, hat:5, acc:1 }, vest:'#334155', hat:false },
    ivo:     { name:'Ivo Marsh',       role:'Business banker',      look:{ skin:1, hair:4, style:0, hat:5, acc:3 }, vest:'#0f766e', hat:false },
    kat:     { name:'Kat Byrne',       role:'Logistics Weekly',     look:{ skin:3, hair:3, style:3, hat:2, acc:0 }, vest:'#f97316', hat:false },
    asst:    { name:()=> career.assistant.name, role:'Assistant manager', look:{ skin:4, hair:0, style:0, hat:2, acc:0 }, vest:'#22c55e' },
    you:     { name:()=> career.manager.name, role:()=> career.manager.owner ? 'Owner' : 'Warehouse Manager', look:()=> career.manager.look, vest:'#38bdf8' },
};
const castName = (k)=> { const c = CAST[k]; return typeof c.name === 'function' ? c.name() : c.name; };
const castRole = (k)=> { const c = CAST[k]; return typeof c.role === 'function' ? c.role() : c.role; };
const castLook = (k)=> { const c = CAST[k]; return typeof c.look === 'function' ? c.look() : c.look; };

// ---------------------------------------------------------------------------
// Effect helpers (return a list of chips describing what happened)
const FX =
{
    cash(v) { career.cash += v; if (v < 0) career.weekLedger.other -= v; else career.weekLedger.revenue += v; return [`${v >= 0 ? '+' : ''}${wmMoney(v)}`, v >= 0]; },
    morale(v, filter = ()=> true) { for (const s of career.staff.filter(filter)) s.morale = clamp(s.morale + v, 0, 100); return [`Morale ${v >= 0 ? '+' : ''}${v}`, v >= 0]; },
    board(v) { if (career.manager.owner) return null; career.board.confidence = clamp(career.board.confidence + v, 0, 100); return [`Board ${v >= 0 ? '+' : ''}${v}`, v >= 0]; },
    rep(v) { career.manager.rep = clamp(career.manager.rep + v, 0, 100); return [`Reputation ${v >= 0 ? '+' : ''}${v}`, v >= 0]; },
    wallet(v) { career.manager.wallet += v; return [`Your wallet ${v >= 0 ? '+' : ''}${wmMoney(v)}`, v >= 0]; },
    mod(key, value, shifts, label) { addMod(key, value, shifts, label); const good = key === 'risk' ? value < 1 : value > 1; return [`${label} (${shifts} shifts)`, good]; },
    wages(pct) { for (const s of career.staff) s.wage = Math.round(s.wage * (1 + pct) / 10) * 10; return [`Wages ${pct >= 0 ? '+' : ''}${Math.round(pct * 100)}%`, pct <= 0]; },
    facility(k) { if (career.facilities[k] < FACILITY_DEFS[k].max) career.facilities[k]++; return [`${FACILITY_DEFS[k].label} → L${career.facilities[k]}`, true]; },
    flag(k, v = true) { career.flags[k] = v; return null; },
};

// ---------------------------------------------------------------------------
// Scenes
const avgMoraleNow = ()=> career.staff.reduce((a, s)=> a + s.morale, 0) / Math.max(1, career.staff.length);
const STORY =
{
    intro:
    {
        point:'start', bg:'dawn', cast:['gus', 'you'],
        lines:()=> [
            ['gus', 'happy', `So you're the new boss of ${career.company}? Thirty-one years I ran this floor. Thirty-one!`],
            ['gus', 'neutral', `The board wants volume. The crew wants respect. The forklifts want blood. You can't give everyone everything.`],
            ['gus', 'sad', `We haven't gone a full month without someone getting hurt in years. Old Harry still limps from the racking collapse.`],
            ['you', 'neutral', `What would you do differently, Gus?`],
            ['gus', 'neutral', `Doesn't matter what I'd do. What kind of manager are YOU going to be?`],
        ],
        choices:[
            { label:'⚡ "Speed is king."', desc:'Faster crew for 15 shifts, but riskier. The board likes ambition.',
              fx:()=> [FX.mod('speed', 1.06, 15, 'Hustle culture: +6% speed'), FX.mod('risk', 1.15, 15, 'Cutting corners: +15% risk'), FX.board(5), FX.flag('philosophy', 'speed')],
              result:`Gus whistles. "Ambitious. Just make sure you still know everyone's name by Christmas."` },
            { label:'🦺 "Nobody gets hurt on my watch."', desc:'Safer floor for 15 shifts. The crew trusts you.',
              fx:()=> [FX.mod('risk', .8, 15, 'Safety culture: −20% risk'), FX.morale(5), FX.board(-3), FX.flag('philosophy', 'safety')],
              result:`Gus smiles for the first time. "Harry would've liked you."` },
            { label:'🤝 "My people come first."', desc:'Big morale boost and a homegrown academy place on the house.',
              fx:()=> [FX.morale(10), FX.cash(-1500), FX.flag('philosophy', 'people'), FX.flag('freeRecruit')],
              result:`"Then start by building your own crew. Kids off the street, trained your way. That's how legends are made."` },
        ],
    },
    firstShift:
    {
        point:'postShift', when:()=> career.season === 1 && career.records.shiftsPlayed === 1, bg:'office', cast:['vale', 'you'],
        lines:()=> [
            ['vale', 'neutral', `First shift done. ${fmtUnits(career.lastReport.shipped)} units. I've seen better. I've also seen worse.`],
            ['vale', 'angry', `I need a number to take to the shareholders. Can you promise me 10% above target by week 4?`],
        ],
        choices:[
            { label:'"You\'ll have it."', desc:'Board +8 now. Miss it by week 4 and they will remember.', fx:()=> [FX.board(8), FX.flag('promiseVolume', true)], result:`"Good. I'll hold you to that."` },
            { label:'"Let me find my feet first."', desc:'Board −3, no pressure.', fx:()=> [FX.board(-3)], result:`"Hmm. Cautious. We'll see if that's wisdom or weakness."` },
        ],
    },
    promiseCheck:
    {
        point:'postShift', when:()=> career.flags.promiseVolume === true && career.week >= 5, bg:'office', cast:['vale', 'you'],
        lines:()=> {
            const hist = career.history.filter(h => h.season === career.season);
            const avg = hist.reduce((a, h)=> a + h.shipped, 0) / Math.max(1, hist.length);
            career.flags.promiseKept = avg >= tierDef().boardVol * 1.1;
            return career.flags.promiseKept
                ? [['vale', 'happy', `You promised 10% above target and you delivered. The shareholders are purring.`]]
                : [['vale', 'angry', `You promised me 10% above target. You're averaging ${fmtUnits(avg)} units. I don't like being made a fool of.`]];
        },
        choices:[
            { label:'Continue', desc:'', fx:()=> [FX.flag('promiseVolume', 'done'), career.flags.promiseKept ? FX.board(10) : FX.board(-15), career.flags.promiseKept ? FX.rep(4) : FX.rep(-3)], result:'' },
        ],
    },
    inspector:
    {
        point:'postShift', when:()=> (career.week >= 3 && career.season === 1) || career.flags.firstSerious, bg:'floor', cast:['dunn', 'you'],
        lines:()=> [
            ['dunn', 'neutral', `Health and Safety Executive. Unannounced inspection. Don't look so worried — unless you should be.`],
            ['dunn', 'angry', `Your incident log has gaps. Forklift routes cross three walkways. And somebody's stacked pallets six high above Inbound.`],
            ['asst', 'shocked', `(whispering) Boss, we could tidy the logs before she reads them properly...`],
        ],
        choices:[
            { label:'📋 Full transparency', desc:'Pay a $2,500 fine. Safer floor for 20 shifts, reputation up.',
              fx:()=> [FX.cash(-2500), FX.mod('risk', .88, 20, 'Inspection fixes: −12% risk'), FX.rep(4), FX.flag('clean')], result:`Dunn nods slowly. "Honesty. Rare in this industry. Fix it and I won't need to come back."` },
            { label:'🧹 "Tidy" the logs', desc:'No fine today... but cover-ups have a way of surfacing.',
              fx:()=> [FX.flag('coverup'), FX.board(3)], result:`The inspector leaves satisfied. Your assistant won't meet your eye for the rest of the day.` },
            { label:'🏗️ Commission a safety overhaul', desc:'$8,000: Safety Systems +1 level, morale up.',
              fx:()=> [FX.cash(-8000), FX.facility('safety'), FX.morale(4), FX.rep(2)], result:`Contractors arrive by lunch. New guard rails, new signage, new beacons on every forklift.` },
        ],
    },
    union:
    {
        point:'postShift', when:()=> career.week >= 4 && (avgMoraleNow() < 58 || career.season >= 2) && !career.flags.unionDone, bg:'breakroom', cast:['tasha', 'you'],
        lines:()=> [
            ['tasha', 'angry', `Two of my members went home bruised this month. Breaks are short, targets go up and up, and wages don't.`],
            ['tasha', 'neutral', `We want recognition. A seat at the table. Or we walk.`],
        ],
        choices:[
            { label:'✊ Recognise the union', desc:'Wages +8%, morale +12, crew waits more patiently at crossings.',
              fx:()=> [FX.wages(.08), FX.morale(12), FX.mod('risk', .9, 25, 'Union safety reps: −10% risk'), FX.flag('unionDone'), FX.board(-4)], result:`Cheers echo through the break room. Tasha shakes your hand: "You won't regret this."` },
            { label:'🤝 Negotiate', desc:'Wages +4%, morale +5.', fx:()=> [FX.wages(.04), FX.morale(5), FX.flag('unionDone')], result:`A compromise. Nobody's thrilled, nobody's marching.` },
            { label:'🚫 Refuse', desc:'Board loves it. The crew does not. Expect trouble.', fx:()=> [FX.morale(-10), FX.board(6), FX.flag('unionDone'), FX.flag('strikeThreat', career.week)], result:`Tasha's jaw tightens. "Then we'll see how your parcels move without us."` },
        ],
    },
    strike:
    {
        point:'postShift', when:()=> career.flags.strikeThreat && career.week !== career.flags.strikeThreat, bg:'dusk', cast:['tasha', 'you'],
        lines:()=> [['tasha', 'angry', `The ballot's in. 84% for strike action. From tomorrow, the floor is empty — unless you change your mind.`]],
        choices:[
            { label:'Concede: wages +10%', desc:'Crisis over. Morale +15. The board sighs.', fx:()=> [FX.wages(.1), FX.morale(15), FX.board(-6), FX.flag('strikeThreat', false)], result:`The crew returns singing. Tasha winks at you on the way past.` },
            { label:'Bring in agency temps', desc:'Volume −30% and risk ×1.6 for 4 shifts. Morale −15.',
              fx:()=> [FX.mod('speed', .7, 4, 'Strike: agency temps −30% speed'), FX.mod('risk', 1.6, 4, 'Untrained temps: +60% risk'), FX.morale(-15), FX.rep(-5), FX.flag('strikeThreat', false)], result:`Coaches of bewildered temps arrive at 5am. Nobody knows where anything is.` },
        ],
    },
    bigClient:
    {
        point:'postShift', when:()=> career.week === 6 && !career.flags['client' + career.season], bg:'office', cast:['priya', 'you'],
        lines:()=> [
            ['priya', 'happy', `MegaCart's peak season is coming and our usual partner just collapsed. We need a warehouse that can take a beating.`],
            ['priya', 'neutral', `25% more volume, every shift, through peak. We pay well. We also penalise late parcels... aggressively.`],
        ],
        choices:[
            { label:'📦 Sign the deal', desc:'+25% volume and +15% revenue for 12 shifts.', fx:()=> [FX.mod('volume', 1.25, 12, 'MegaCart contract: +25% volume'), FX.mod('revenue', 1.15, 12, 'MegaCart rates: +15% revenue'), FX.flag('client' + career.season)], result:`Priya beams. "The trucks start rolling on Monday. Don't let me down."` },
            { label:'💰 Demand premium rates', desc:'40% chance they walk. Otherwise +15% volume, +30% revenue.',
              fx:()=> Math.random() < .4 ? [FX.flag('client' + career.season), FX.rep(-1)] : [FX.mod('volume', 1.15, 12, 'MegaCart contract: +15% volume'), FX.mod('revenue', 1.3, 12, 'Premium rates: +30% revenue'), FX.flag('client' + career.season), FX.rep(2)],
              result:()=> career.mods.some(m => m.label.startsWith('Premium')) ? `"...Fine. You drive a hard bargain."` : `Priya stands up. "We'll find someone more reasonable." The door clicks shut.` },
            { label:'🙅 Decline', desc:'Protect your crew during peak.', fx:()=> [FX.flag('client' + career.season), FX.morale(3)], result:`Your crew hears about it. They appreciate not being thrown to the wolves.` },
        ],
    },
    rivalTaunt:
    {
        point:'postShift', when:()=> career.week >= 3 && leaguePosition() >= 5 && !career.flags['taunt' + career.season] && Math.random() < .25, bg:'press', cast:['vince', 'you'],
        lines:()=> [
            ['vince', 'happy', `Heard ${career.company} is "building something special". Special needs, maybe! My crew ships more before lunch than yours does all day.`],
            ['kat', 'neutral', `Logistics Weekly here. Any response for our readers?`],
        ],
        choices:[
            { label:'🔥 Fire back', desc:'Crew fired up (+6 morale, +5% speed for 5 shifts). Rep −2.', fx:()=> [FX.morale(6), FX.mod('speed', 1.05, 5, 'Fired up: +5% speed'), FX.rep(-2), FX.flag('taunt' + career.season)], result:`"Tell Vince to check the table in May." The quote goes viral on the shop floor.` },
            { label:'😌 Stay classy', desc:'Reputation +3.', fx:()=> [FX.rep(3), FX.flag('taunt' + career.season)], result:`"We let our parcels do the talking." Kat scribbles approvingly.` },
        ],
    },
    viral:
    {
        point:'postShift', when:()=> career.flags.pendingViral, repeat:true, bg:'press', cast:['kat', 'you'],
        lines:()=> [
            ['kat', 'shocked', `Someone filmed ${career.flags.pendingViral} dodging a forklift at your site. Two million views and climbing. Comment?`],
        ],
        choices:[
            { label:'🙇 Apologise & retrain everyone', desc:'$3,000. Risk −15% for 12 shifts. Rep +2.', fx:()=> [FX.cash(-3000), FX.mod('risk', .85, 12, 'Crossing retraining: −15% risk'), FX.rep(2), FX.flag('pendingViral', false)], result:`Every worker spends an hour watching the clip with a trainer. Nobody jaywalks for a while.` },
            { label:'🤷 "Fake news."', desc:'Free. Rep −5.', fx:()=> [FX.rep(-5), FX.flag('pendingViral', false)], result:`The comments section is brutal.` },
        ],
    },
    tragedy:
    {
        point:'postShift', when:()=> career.flags.pendingTragedy, repeat:true, bg:'night', cast:['asst', 'you'],
        lines:()=> {
            const t = career.flags.pendingTragedy;
            return [
                ['asst', 'sad', `...The paramedics did everything they could. ${t.name} was ${t.cause}.`],
                ['asst', 'sad', t.homegrown ? `${t.name.split(' ')[0]} came up through our academy. Some of the kids trained alongside them. They're... not okay.` : `The crew is outside. Nobody wants to go back in.`],
                ['you', 'sad', `...`],
                ['asst', 'neutral', `The board is on line one. The press is on line two. What do we do?`],
            ];
        },
        choices:[
            { label:'🕯️ Close for a day of mourning', desc:'Lose a shift of revenue. Morale recovers. Reputation +3.', fx:()=> [FX.cash(-Math.round(tierDef().volume * UNITS_PER_PARCEL * tierDef().rate * .9)), FX.morale(12), FX.rep(3), FX.board(-4), FX.flag('pendingTragedy', false)], result:`The gates stay shut. Flowers pile up against the fence by the dock.` },
            { label:'🏭 Keep the line moving', desc:'Board +4. The crew will never forget this. Morale −12, rep −6.', fx:()=> [FX.board(4), FX.morale(-12), FX.rep(-6), FX.flag('pendingTragedy', false)], result:`The conveyors restart at 6am. Nobody speaks all shift.` },
            { label:'🛡️ Fund a memorial safety programme', desc:'$15,000: Safety Systems +1, −20% risk for 30 shifts, morale +6.', fx:()=> [FX.cash(-15000), FX.facility('safety'), FX.mod('risk', .8, 30, 'Memorial safety programme: −20% risk'), FX.morale(6), FX.rep(5), FX.flag('pendingTragedy', false)], result:`A plaque goes up by the break room. Below the name: "Never again."` },
        ],
    },
    debut:
    {
        point:'postShift', when:()=> career.flags.pendingDebut, bg:'floor', cast:['you', 'gus'],
        lines:()=> {
            const s = career.staff.find(x => x.id === career.flags.pendingDebut);
            career.flags.debutName = s ? displayName(s) : 'the kid';
            return [
                ['gus', 'happy', `Popped in to see the academy kid's first shift. ${career.flags.debutName}! Reminds me of me, forty years and two knees ago.`],
                ['gus', 'neutral', `How you treat them now decides who they become. Spotlight, or graft?`],
            ];
        },
        choices:[
            { label:'🌟 Give them the spotlight', desc:'Huge confidence boost: morale +15, potential +1.', fx:()=> { const s = career.staff.find(x => x.id === career.flags.pendingDebut); if (s) { s.morale = clamp(s.morale + 15, 0, 100); s.hidden.potential = Math.min(20, s.hidden.potential + 1); } return [FX.flag('pendingDebut', false), ['Recruit morale +15, potential +1', true]]; }, result:`You announce their name over the tannoy. The whole floor applauds.` },
            { label:'🔨 Keep them grounded', desc:'Professionalism up: they will train harder for life.', fx:()=> { const s = career.staff.find(x => x.id === career.flags.pendingDebut); if (s) { s.hidden.professionalism = Math.min(20, s.hidden.professionalism + 4); if (!s.traits.includes('Professional')) s.traits.push('Professional'); } return [FX.flag('pendingDebut', false), ['Recruit becomes Professional', true]]; }, result:`"Good shift. Again tomorrow, better." They nod, hungry for more.` },
        ],
    },
    nephew:
    {
        point:'postShift', when:()=> career.season >= 2 && career.week >= 2 && !career.flags.nephewDone && !career.manager.owner, bg:'office', cast:['vale', 'rupert'],
        lines:()=> [
            ['vale', 'neutral', `This is Rupert, my nephew. He's... between opportunities. I'd consider it a personal favour if you found him a role.`],
            ['rupert', 'happy', `I've driven a golf buggy. How different can a forklift be?`],
        ],
        choices:[
            { label:'✅ Hire Rupert', desc:'Board +10. Rupert is accident-prone and bad at everything.', fx:()=> { const s = makeStaff({ quality:4, age:24, zone:'green', scouted:true, name:'Rupert Vale' }); s.traits = ['Accident-Prone', 'Lazy']; s.look = castLook('rupert'); s.wage = 600; s.contractWeeks = 52; career.staff.push(s); career.lineup[s.id] = 'bench'; return [FX.board(10), FX.flag('nephewDone'), ['Rupert joins the crew', false]]; }, result:`Rupert immediately reverses into a pallet of toilet roll. "Totally fine!"` },
            { label:'❌ Politely decline', desc:'Board −6.', fx:()=> [FX.board(-6), FX.flag('nephewDone')], result:`Margaret's smile doesn't reach her eyes. "Of course. I understand."` },
        ],
    },
    scandal:
    {
        point:'postShift', when:()=> career.flags.coverup && career.season >= 2 && Math.random() < .12, bg:'press', cast:['kat', 'dunn'],
        lines:()=> [
            ['kat', 'shocked', `EXCLUSIVE: Logistics Weekly has obtained internal documents showing ${career.company} doctored its incident logs before an HSE inspection.`],
            ['dunn', 'angry', `I trusted you. Now I'm back — with a warrant.`],
        ],
        choices:[
            { label:'Take responsibility', desc:'Fine $12,000. Board −15, rep −8.', fx:()=> [FX.cash(-12000), FX.board(-15), FX.rep(-8), FX.flag('coverup', false)], result:`You face the cameras. It's the worst day of your career, but it's over.` },
            { label:'Blame your assistant', desc:'Fine $6,000. Rep −12. Your assistant gets less reliable.', fx:()=> { career.assistant.quality = Math.max(.25, career.assistant.quality - .15); return [FX.cash(-6000), FX.rep(-12), FX.flag('coverup', false), ['Assistant reliability −15%', false]]; }, result:`Your assistant clears their desk in silence. The crew noticed.` },
        ],
    },
    peakPep:
    {
        point:'preShift', when:()=> career.week === PEAK_WEEKS[0] && (career.day - 1) % WEEK_SHIFTS === 0 && !career.flags['peak' + career.season], bg:'floor', cast:['you', 'asst'],
        lines:()=> [
            ['asst', 'shocked', `Peak season starts NOW. The trucks are queuing round the block. The crew's looking at you, boss.`],
            ['you', 'neutral', `(Everyone gathers by the dock. Time for a speech.)`],
        ],
        choices:[
            { label:'🍕 "Pizza\'s on me!"', desc:'$700. Morale +8.', fx:()=> [FX.cash(-700), FX.morale(8), FX.flag('peak' + career.season)], result:`Forty pizzas. The crew demolishes them in four minutes flat.` },
            { label:'💷 "Double-time bonus if we hit target!"', desc:'Speed +8% for 10 shifts. Wages +3%.', fx:()=> [FX.mod('speed', 1.08, 10, 'Bonus fever: +8% speed'), FX.wages(.03), FX.flag('peak' + career.season)], result:`"DOUBLE TIME! DOUBLE TIME!" The chant echoes off the racking.` },
            { label:'😤 "Just get it done."', desc:'Speed +5% but risk +10% for 10 shifts.', fx:()=> [FX.mod('speed', 1.05, 10, 'Pressure: +5% speed'), FX.mod('risk', 1.1, 10, 'Pressure: +10% risk'), FX.flag('peak' + career.season)], result:`Grim nods. The crew turns to face the trucks.` },
        ],
    },
    promotionParty:
    {
        point:'seasonEnd', when:(ctx)=> ctx?.promoted, bg:'party', cast:['vale', 'you'],
        lines:()=> career.manager.owner
            ? [['you', 'happy', `We did it! ${career.company} is moving up to a ${tierDef().name}. Our own company, our own crew!`]]
            : [['vale', 'happy', `Promotion! ${career.company} becomes a ${tierDef().name}. The shareholders want to buy you a boat.`],
               ['vale', 'neutral', `How shall we celebrate?`]],
        choices:[
            { label:'🎉 Bonuses for the whole crew', desc:'$250 each. Morale +12.', fx:()=> [FX.cash(-250 * career.staff.length), FX.morale(12)], result:`Confetti cannons. Somebody drives a forklift through a balloon arch.` },
            { label:'🏗️ Reinvest everything', desc:'Free upgrade: Racking & Capacity +1.', fx:()=> [FX.facility('racking'), FX.board(4)], result:`New racking goes up over the summer, higher than ever before.` },
            { label:'💼 Negotiate my own bonus', desc:'Your wallet +$12,000. Board −4.', fx:()=> [FX.wallet(12000), FX.board(-4)], result:`Margaret raises an eyebrow, then signs the cheque.` },
        ],
    },
    foundIdea:
    {
        point:'seasonEnd', when:(ctx)=> ctx?.canFound && !career.flags.foundPitched, bg:'office', cast:['ivo', 'you'],
        lines:()=> [
            ['ivo', 'happy', `Ivo Marsh, business banking. I've been watching your career. You've saved ${wmMoney(career.manager.wallet)}.`],
            ['ivo', 'neutral', `Ever thought about building your own warehouse? Your name on the gate. Your crew. No board breathing down your neck.`],
            ['ivo', 'neutral', `Visit your Career screen when you're ready. The bank will be waiting.`],
        ],
        choices:[{ label:'"I\'ll think about it."', desc:'', fx:()=> [FX.flag('foundPitched')], result:'' }],
    },
};

// ---------------------------------------------------------------------------
// Which scene (if any) should play at this point?
function storyNext(point, ctx = null)
{
    if (!career) return null;
    const order = ['tragedy', 'viral', 'debut', 'promiseCheck', 'firstShift', 'scandal', 'strike', 'inspector', 'union', 'bigClient', 'nephew', 'rivalTaunt', 'peakPep', 'intro', 'promotionParty', 'foundIdea'];
    for (const id of order)
    {
        const sc = STORY[id];
        if (sc.point !== point) continue;
        if (!sc.repeat && career.storySeen[id]) continue;
        if (sc.when && !sc.when(ctx)) continue;
        return id;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Player (DOM)
let wmStory = null;
function playStory(id, onDone, ctx = null)
{
    const sc = STORY[id];
    if (!sc) { onDone && onDone(); return; }
    career.storySeen[id] = career.season;
    const lines = typeof sc.lines === 'function' ? sc.lines(ctx) : sc.lines;
    wmStory = { id, sc, lines, i:0, onDone, typing:null, chosen:false };
    let el = document.getElementById('story');
    if (!el) { el = document.createElement('div'); el.id = 'story'; document.getElementById('ui').appendChild(el); }
    el.className = 'bg-' + (sc.bg || 'floor');
    el.style.backgroundImage = `url(${pxBackdrop(sc.bg || 'floor')})`;
    const castHtml = sc.cast.map((k, i)=> `<div class="actor ${i ? 'right' : 'left'}" data-cast="${k}">${avatarSvg(castLook(k), { size:256, mood:'neutral', vest:CAST[k].vest, hat:CAST[k].hat !== false })}</div>`).join('');
    el.innerHTML = `
        <div class="lb top"></div>
        <div class="stage"><div class="set"></div>${castHtml}</div>
        <div class="dlg">
            <div class="plate"><b id="stName"></b><small id="stRole"></small></div>
            <div class="txt" id="stTxt"></div>
            <div class="choices" id="stChoices"></div>
            <div class="next" id="stNext">▼</div>
        </div>
        <div class="lb bot"></div>`;
    el.classList.remove('hidden');
    el.onclick = (e)=> { if (!e.target.closest('button')) storyAdvance(); };
    requestAnimationFrame(()=> el.classList.add('in'));
    playSfx('perfect', .6, .7);
    storyShowLine();
}
function storyShowLine()
{
    const st = wmStory, el = document.getElementById('story');
    const [who, mood, text] = st.lines[st.i];
    const name = castName(who), role = castRole(who);
    document.getElementById('stName').textContent = name;
    document.getElementById('stRole').textContent = role;
    el.querySelectorAll('.actor').forEach(a =>
    {
        const k = a.dataset.cast;
        const speaking = k === who;
        a.classList.toggle('speaking', speaking);
        if (speaking) a.innerHTML = avatarSvg(castLook(k), { size:256, mood, vest:CAST[k].vest, hat:CAST[k].hat !== false, pose: mood === 'angry' || mood === 'happy' ? 'fist' : '' });
    });
    storyType(text);
    document.getElementById('stChoices').innerHTML = '';
    document.getElementById('stNext').style.visibility = 'visible';
}
function storyType(text, after)
{
    const st = wmStory, box = document.getElementById('stTxt');
    clearInterval(st.typing);
    let n = 0;
    st.full = text;
    box.textContent = '';
    st.typing = setInterval(()=>
    {
        n += 2;
        box.textContent = text.slice(0, n);
        if (n % 6 === 0) playSfx('tick', .5, 1.4 + Math.random() * .3);
        if (n >= text.length) { clearInterval(st.typing); st.typing = null; after && after(); }
    }, 22);
}
function storyAdvance()
{
    const st = wmStory;
    if (!st) return;
    if (st.typing) { clearInterval(st.typing); st.typing = null; document.getElementById('stTxt').textContent = st.full; if (st.afterType) { const f = st.afterType; st.afterType = null; f(); } return; }
    if (st.done) return storyClose();
    if (st.chosen) return;
    if (st.i < st.lines.length - 1) { st.i++; storyShowLine(); return; }
    storyShowChoices();
}
function storyShowChoices()
{
    const st = wmStory;
    document.getElementById('stNext').style.visibility = 'hidden';
    const box = document.getElementById('stChoices');
    box.innerHTML = st.sc.choices.map((c, i)=> `<button class="choice" data-choice="${i}"><b>${esc(c.label)}</b>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}</button>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = (e)=> { e.stopPropagation(); storyChoose(+b.dataset.choice); });
}
function storyChoose(i)
{
    const st = wmStory;
    st.chosen = true;
    const c = st.sc.choices[i];
    const chips = (c.fx() || []).filter(Boolean);
    playSfx('saved', .8);
    const result = typeof c.result === 'function' ? c.result() : c.result;
    document.getElementById('stChoices').innerHTML = `<div class="chips">${chips.map(([t, good]) => `<span class="chip ${good ? 'good' : 'bad'}">${esc(t)}</span>`).join('')}</div>`;
    st.done = true;
    if (result)
    {
        document.getElementById('stName').textContent = '';
        document.getElementById('stRole').textContent = '';
        storyType(result);
    }
    document.getElementById('stNext').style.visibility = 'visible';
    saveCareer();
}
function storyClose()
{
    const st = wmStory;
    clearInterval(st?.typing);
    const el = document.getElementById('story');
    el.classList.remove('in');
    setTimeout(()=> { el.classList.add('hidden'); el.innerHTML = ''; }, 250);
    wmStory = null;
    st?.onDone && st.onDone();
}
