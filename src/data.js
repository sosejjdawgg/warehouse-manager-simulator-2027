'use strict';
// ============================================================================
// Warehouse Manager — static, data-driven game content.
// Everything here is plain data so depth can be added without touching systems.
// ============================================================================

// One "shift" of 8 hours plays out over SHIFT_SECONDS of game time at 1x.
const SHIFT_SECONDS = 480;        // 8 game hours => 1 second == 1 shift minute
const SHIFT_START_HOUR = 6;       // 06:00 - 14:00
const OVERTIME_SECONDS = 60;      // one hour of overtime
const UNITS_PER_PARCEL = 10;    // each on-screen parcel is a tote of 10 units
const WEEK_SHIFTS = 5;            // shifts per week (Mon-Fri)
const SEASON_WEEKS = 8;           // weeks per season; the last two are peak
const PEAK_WEEKS = [7, 8];        // "Black Friday" / holiday rush

const ATTR_KEYS = ['productivity','accuracy','safety','stamina','strength','teamwork','leadership','adaptability','workRate','concentration'];
const ATTR_LABELS =
{
    productivity:'Productivity', accuracy:'Accuracy', safety:'Safety Awareness', stamina:'Stamina',
    strength:'Strength', teamwork:'Teamwork', leadership:'Leadership', adaptability:'Adaptability',
    workRate:'Work Rate', concentration:'Concentration',
};
const ATTR_SHORT =
{
    productivity:'PRD', accuracy:'ACC', safety:'SAF', stamina:'STA', strength:'STR',
    teamwork:'TMW', leadership:'LDR', adaptability:'ADP', workRate:'WRK', concentration:'CON',
};

// Zones: colour language, attribute weights (a zone "position rating"), base
// seconds per package, hazard level and what incidents can happen there.
const ZONE_DEFS =
{
    blue:   { name:'Inbound',     sub:'Receiving',         hex:'#3b82f6', icon:'📥', baseTime:2.1, risk:1.0,
              weights:{productivity:.3, accuracy:.15, strength:.2, workRate:.2, teamwork:.15},
              incidents:['falling','trip','strain'] },
    green:  { name:'Stow',        sub:'Storage',           hex:'#22c55e', icon:'🗄️', baseTime:2.4, risk:1.3, cert:'forklift',
              weights:{productivity:.25, strength:.25, safety:.2, concentration:.15, accuracy:.15},
              incidents:['forklift','falling','strain'] },
    yellow: { name:'Pick',        sub:'Order picking',     hex:'#eab308', icon:'🛒', baseTime:2.3, risk:.8,
              weights:{productivity:.35, accuracy:.3, concentration:.2, stamina:.15},
              incidents:['trip','strain','falling'] },
    orange: { name:'Pack',        sub:'Packing',           hex:'#f97316', icon:'📦', baseTime:2.2, risk:.7,
              weights:{accuracy:.35, productivity:.3, concentration:.2, teamwork:.15},
              incidents:['cut','spill','strain'] },
    red:    { name:'Outbound',    sub:'Load & dispatch',   hex:'#ef4444', icon:'🚚', baseTime:2.0, risk:1.4, cert:'forklift',
              weights:{strength:.3, safety:.25, productivity:.25, teamwork:.2},
              incidents:['forklift','strain','falling'] },
    purple: { name:'Hazmat',      sub:'Special handling',  hex:'#a855f7', icon:'☣️', baseTime:3.3, risk:1.8, cert:'hazmat',
              weights:{safety:.4, accuracy:.3, concentration:.3},
              incidents:['chemical','spill','cut'] },
    grey:   { name:'Quality',     sub:'QA & Returns',      hex:'#94a3b8', icon:'🔍', baseTime:2.6, risk:.5,
              weights:{accuracy:.4, concentration:.3, adaptability:.3},
              incidents:['cut','trip'] },
    black:  { name:'Maintenance', sub:'Breakdown response',hex:'#334155', icon:'🔧', baseTime:0,   risk:1.2, cert:'maintenance',
              weights:{adaptability:.3, concentration:.3, safety:.2, productivity:.2},
              incidents:['electrical','strain'] },
};
const ZONE_KEYS = Object.keys(ZONE_DEFS);
// Main conveyor order for standard parcels
const FLOW_STANDARD = ['blue','green','yellow','orange','red'];
const FLOW_HAZMAT   = ['blue','purple','orange','red'];
const FLOW_RETURN   = ['grey']; // inspected & restocked in place (no cycle back into Stow)

// Package types: share of the inbound mix, handling modifiers, value
const PACKAGE_TYPES =
{
    standard: { label:'Standard', weight:.70, timeMul:1.0, value:1.0,  color:'#c8a165' },
    heavy:    { label:'Heavy',    weight:.12, timeMul:1.5, value:1.4,  color:'#8b5e34', heavy:true },
    fragile:  { label:'Fragile',  weight:.08, timeMul:1.2, value:1.3,  color:'#f9a8d4', fragile:true },
    rush:     { label:'Rush',     weight:.06, timeMul:1.0, value:2.2,  color:'#facc15', rush:true },
    hazmat:   { label:'Hazmat',   weight:.04, timeMul:1.3, value:2.0,  color:'#c084fc', hazmat:true },
};

// Incidents: base severity and flavour. sevMul scales injury odds.
const INCIDENT_DEFS =
{
    forklift:  { label:'Forklift near-miss',  icon:'🚜', sevMul:1.8, warn:'Forklift reversing blind!' },
    falling:   { label:'Falling carton',      icon:'📦', sevMul:1.2, warn:'Unstable stack overhead!' },
    trip:      { label:'Trip hazard',         icon:'⚠️', sevMul:.8,  warn:'Shrink-wrap on the walkway!' },
    strain:    { label:'Lifting strain',      icon:'💢', sevMul:.9,  warn:'Bad lifting posture!' },
    cut:       { label:'Box-cutter slip',     icon:'🔪', sevMul:.9,  warn:'Blade out, attention drifting!' },
    spill:     { label:'Liquid spill',        icon:'💧', sevMul:1.0, warn:'Leaking parcel on the floor!' },
    chemical:  { label:'Chemical leak',       icon:'☣️', sevMul:2.0, warn:'Hazmat container leaking!' },
    electrical:{ label:'Electrical fault',    icon:'⚡', sevMul:1.6, warn:'Live panel exposed!' },
    medical:   { label:'Medical event',       icon:'🚑', sevMul:1.3, warn:'Worker feeling faint!' },
};
const INJURY_TABLE =
[
    // [label, minDays, maxDays, serious]
    ['Minor strain', 1, 2, false],
    ['Bruised hand', 1, 1, false],
    ['Twisted ankle', 2, 4, false],
    ['Pulled back muscle', 3, 6, false],
    ['Laceration (stitches)', 2, 5, false],
    ['Broken wrist', 10, 18, true],
    ['Crush injury', 12, 22, true],
    ['Chemical burn', 8, 15, true],
    ['Concussion', 5, 10, true],
];

// Breakdowns that the Black zone responds to
const BREAKDOWN_DEFS =
[
    { label:'Conveyor jam',       icon:'⛓️', work:8 },
    { label:'Scanner failure',    icon:'📡', work:5 },
    { label:'Label printer down', icon:'🖨️', work:4 },
    { label:'Dock door stuck',    icon:'🚪', work:9 },
    { label:'Sorter belt snapped',icon:'🧵', work:12 },
];

// Personalities / traits. Modifiers are multipliers or additive tweaks used
// by the shift simulation and the weekly management loop.
const TRAIT_DEFS =
{
    Professional:   { good:true,  desc:'Consistent, trains hard, rarely complains.', train:1.25, consistency:3, morale:+2 },
    Lazy:           { good:false, desc:'Slows down when unsupervised.', speed:.88, train:.7 },
    'Accident-Prone':{good:false, desc:'Somehow always near the incident.', risk:1.7 },
    Mentor:         { good:true,  desc:'Boosts training of young colleagues.', mentor:true },
    Perfectionist:  { good:true,  desc:'Very accurate, a bit slower.', accuracy:1.25, speed:.94 },
    Clumsy:         { good:false, desc:'Damages fragile items.', damage:1.8, risk:1.2 },
    'Team Player':  { good:true,  desc:'Lifts zone teammates.', aura:.04 },
    Disruptive:     { good:false, desc:'Drags down the mood of the zone.', aura:-.05, morale:-3 },
    'Night Owl':    { good:true,  desc:'Strong finisher — less fatigue late in shifts.', fatigue:.8 },
    Ambitious:      { good:true,  desc:'Wants to progress — prone to poaching.', train:1.15, poach:1.8 },
    Loyal:          { good:true,  desc:'Hard to poach; morale steady.', poach:.3, morale:+1 },
    'Speed Demon':  { good:true,  desc:'Fast, but cuts corners.', speed:1.12, risk:1.25, accuracy:.92 },
    Steady:         { good:true,  desc:'Calm under pressure.', panic:.6 },
    Moody:          { good:false, desc:'Performance swings with morale.', moodSwing:2 },
};
const TRAIT_KEYS = Object.keys(TRAIT_DEFS);

// Certifications (specialisation tags)
const CERT_DEFS =
{
    forklift:    { label:'Forklift Certified', short:'FLT', weeks:2, cost:1200 },
    hazmat:      { label:'Hazmat Handler',     short:'HAZ', weeks:3, cost:2000 },
    maintenance: { label:'Maintenance Tech',   short:'MNT', weeks:3, cost:1800 },
    multizone:   { label:'Multi-Zone',         short:'MLT', weeks:2, cost:900 },
    firstaid:    { label:'First Aider',        short:'AID', weeks:1, cost:600 },
    nightshift:  { label:'Night Shift',        short:'NGT', weeks:1, cost:300 },
};
const CERT_KEYS = Object.keys(CERT_DEFS);

// Training focuses
const TRAINING_DEFS =
{
    balanced:   { label:'Balanced',            attrs:ATTR_KEYS },
    speed:      { label:'Speed & Output',      attrs:['productivity','workRate','stamina'] },
    precision:  { label:'Precision',           attrs:['accuracy','concentration'] },
    safety:     { label:'Safety Drills',       attrs:['safety','concentration'] },
    physical:   { label:'Physical Conditioning',attrs:['strength','stamina'] },
    leadership: { label:'Leadership',          attrs:['leadership','teamwork'] },
    versatility:{ label:'Cross-Training',      attrs:['adaptability','teamwork'] },
    rest:       { label:'Light Duties (rest)', attrs:[] },
};

// Facilities — level 0..max, each upgrade costs more
const FACILITY_DEFS =
{
    scanners:   { label:'Scanners & Handhelds', icon:'📡', max:5, base:6000,  desc:'Faster, more accurate scanning (+speed, +accuracy).' },
    conveyors:  { label:'Conveyors & Sorters',  icon:'⛓️', max:5, base:9000,  desc:'Faster flow, fewer breakdowns.' },
    breakroom:  { label:'Break Room',           icon:'☕', max:5, base:4000,  desc:'Better recovery on breaks, higher morale.' },
    safety:     { label:'Safety Systems',       icon:'🦺', max:5, base:7000,  desc:'Guard rails, sensors, PPE: fewer & milder incidents.' },
    training:   { label:'Training Centre',      icon:'🎓', max:5, base:5000,  desc:'Faster staff development.' },
    racking:    { label:'Racking & Capacity',   icon:'🏗️', max:5, base:10000, desc:'Bigger buffers per zone and larger volume contracts.' },
    automation: { label:'Automation (Robots)',  icon:'🤖', max:3, base:40000, desc:'Robotic pickers add baseline throughput in Stow & Pick.' },
};

// Warehouse tiers (promotion ladder)
const TIER_DEFS =
[
    // volume = forecast parcels per shift, rate = revenue per unit, boardVol = board's shipped-parcel target
    { name:'Regional Depot',          volume:390, rate:.66, budget:30000,  boardVol:330, squad:14 },
    { name:'Sort Centre',             volume:470, rate:.70, budget:55000,  boardVol:400, squad:17 },
    { name:'Fulfilment Centre',       volume:550, rate:.75, budget:90000,  boardVol:470, squad:20 },
    { name:'National Mega Hub',       volume:650, rate:.80, budget:150000, boardVol:560, squad:24 },
];

// Rival companies (fictional) — strength 0..100, archetype flavour
const RIVAL_DEFS =
[
    { name:'Primeway Fulfilment', short:'PWF', hex:'#f59e0b', strength:72, style:'Volume machine, tolerates risk' },
    { name:'Brownline Ground',    short:'BLG', hex:'#a16207', strength:66, style:'Steady, union-strong, safe' },
    { name:'Vantage Parcel',      short:'VNP', hex:'#7c3aed', strength:61, style:'Premium on-time delivery' },
    { name:'Kestrel Logistics',   short:'KST', hex:'#0ea5e9', strength:55, style:'Lean, cheap, aggressive poachers' },
    { name:'BoxBridge Freight',   short:'BXB', hex:'#16a34a', strength:50, style:'Old-school, ageing workforce' },
    { name:'Meridian Distribution',short:'MRD',hex:'#e11d48', strength:46, style:'Chaotic but hungry' },
    { name:'RapidRoute Express',  short:'RRX', hex:'#64748b', strength:40, style:'Start-up, young talent' },
];

const FIRST_NAMES = ['Aisha','Ben','Carlos','Dana','Eli','Fatima','Gus','Hana','Ivan','Jade','Kofi','Lena','Marco','Nia','Omar','Priya','Quinn','Rosa','Sam','Tariq','Uma','Vic','Wes','Xin','Yara','Zane','Bea','Theo','Mo','Ines','Raj','Kat','Leo','Mia','Dev','Ola','Pete','Sofia','Tom','Ana','Jamal','Lucy','Nate','Rhea','Seb','Tia','Hugo','Ivy','Kai','Noor'];
const LAST_NAMES  = ['Okafor','Smith','Garcia','Nguyen','Kowalski','Patel','Murphy','Silva','Haddad','Jensen','Mensah','Rossi','Brown','Ali','Fischer','Novak','Tanaka','Walsh','Costa','Ibrahim','Larsen','Moreno','Chen','Doyle','Adeyemi','Petrov','Kaur','Hughes','Diaz','Becker','Osei','Reyes','Kim','Byrne','Lopez','Sato','Evans','Hansen','Nowak','Ward'];

const ASSISTANT_NAMES = ['Pat Reynolds','Dee Okonkwo','Morgan Hale','Sunny Varga'];

// Milestones (cinematic flourishes)
const MILESTONE_DEFS =
{
    firstShift:   { title:'First Shift Complete',  icon:'🎬' },
    zeroIncident: { title:'Zero Incident Day',     icon:'🛡️' },
    pbShift:      { title:'Personal Best Shift',   icon:'🏆' },
    units10k:     { title:'10,000 Units Processed',icon:'📦' },
    units50k:     { title:'50,000 Units Processed',icon:'📦' },
    units100k:    { title:'100,000 Units Processed',icon:'💯' },
    flowMax:      { title:'Max Flow Achieved',     icon:'🌊' },
    streak5:      { title:'5 Shifts Without Injury',icon:'⛑️' },
    promotion:    { title:'Staff Promotion',       icon:'⭐' },
    upgrade:      { title:'New Equipment Unveiled',icon:'🛠️' },
    league1:      { title:'Top of the League',     icon:'👑' },
};
