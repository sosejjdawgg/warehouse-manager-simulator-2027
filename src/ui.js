'use strict';
// ============================================================================
// Management UI — HTML overlay for the FM-style screens, the shift HUD,
// post-shift reports and milestone cinematics.
// ============================================================================

const wmSettings = { sound:true };
let wmMode = 'title';
let wmTab = 'overview';
let wmPointerOnCanvas = false;
let wmPendingFlow = [];      // queued post-shift steps (cinematics, week summary...)
let wmStaffSort = 'zone';
let wmMarketTab = 'free';

const $ = (sel)=> document.querySelector(sel);
const esc = (s)=> String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtUnits = (parcels)=> Math.round(parcels * UNITS_PER_PARCEL).toLocaleString();
const pct = (v)=> Math.round(v * 100) + '%';

function attrClass(v) { return v >= 16 ? 'a4' : v >= 11 ? 'a3' : v >= 6 ? 'a2' : 'a1'; }
function starsHtml(r, fuzzy = false)
{
    const st = starsFor(r);
    let h = '';
    for (let i = 1; i <= 5; i++) h += st >= i ? '★' : st >= i - .5 ? '⯪' : '☆';
    return `<span class="stars${fuzzy ? ' fuzzy' : ''}">${h}</span>`;
}
function zonePill(z, extra = '')
{
    if (z === 'bench') return `<span class="zpill bench">☕ Standby${extra}</span>`;
    if (z === 'op') return `<span class="zpill" style="--zc:#ffd23f">🚶 Operative${extra}</span>`;
    if (z === 'flt') return `<span class="zpill" style="--zc:#f59e0b">🚜 FLT driver${extra}</span>`;
    const d = ZONE_DEFS[z];
    return `<span class="zpill" style="--zc:${d.hex}">${d.icon} ${d.name}${extra}</span>`;
}
function moraleDot(m) { return `<span class="mdot" style="background:${moraleColor(m)}" title="${moraleLabel(m)}"></span>`; }
function formAvg(s) { return s.form.length ? (s.form.reduce((a,b)=>a+b,0)/s.form.length).toFixed(1) : '–'; }
function ratingClass(r) { return r >= 8 ? 'r4' : r >= 7 ? 'r3' : r >= 6 ? 'r2' : 'r1'; }

// ---------------------------------------------------------------------------
// bootstrap
function uiInit()
{
    const root = document.createElement('div');
    root.id = 'ui';
    root.innerHTML = `
        <div id="screen"></div>
        <div id="hud" class="hidden"></div>
        <div id="workerCard" class="hidden"></div>
        <div id="toasts"></div>
        <div id="modal" class="hidden"></div>
        <div id="cine" class="hidden"></div>`;
    document.body.appendChild(root);
    const markPointer = (e)=> { wmPointerOnCanvas = e.target && e.target.tagName === 'CANVAS'; };
    document.addEventListener('pointerdown', markPointer, true);
    document.addEventListener('mousedown', markPointer, true);
    document.addEventListener('touchstart', markPointer, { capture:true, passive:true });
    document.addEventListener('click', onUiClick);
    document.addEventListener('change', onUiChange);
    document.addEventListener('input', onUiInput);
    document.addEventListener('keydown', onUiKey);
    try { const s = localStorage.getItem('wmSettings'); if (s) Object.assign(wmSettings, JSON.parse(s)); } catch (e) {}
    showTitle();
}
function saveSettings() { try { localStorage.setItem('wmSettings', JSON.stringify(wmSettings)); } catch (e) {} }

function setMode(m)
{
    wmMode = m;
    $('#screen').classList.toggle('hidden', m === 'shift');
    $('#hud').classList.toggle('hidden', m !== 'shift');
    if (m !== 'shift') $('#workerCard').classList.add('hidden');
    $('#toasts').innerHTML = '';
    setInputPreventDefault(m === 'shift');
    if (m !== 'shift') document.body.classList.remove('finalHour');
    document.body.classList.toggle('inShift', m === 'shift');
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------
// Hub
function showHub(tab)
{
    if (tab) wmTab = tab;
    setMode('hub');
    if (career.board.sacked) return showGameOver();
    const c = career;
    const t = tierDef();
    const tabs = [
        ['overview','🏠','Overview'], ['staff','👷','Staff'], ['training','🎓','Training'], ['transfers','🤝','Recruitment'],
        ['academy','🌱','Apprentices'], ['facilities','🏗️','Facilities'], ['league','🏆','Rankings'], ['finances','💰','Finances'], ['career','💼','Career'], ['inbox','✉️','Inbox'],
    ];
    const unread = unreadCount();
    const pend = pendingDecisions().length;
    $('#screen').innerHTML = `
    <div class="hub">
        <header class="top">
            ${safetyBoardHtml(c.records.daysSinceAccident, c.records.bestSafeRun, true)}
            <div class="co"><b style="color:${c.companyHex}">${esc(c.company)}</b><span>${t.name} · Year ${c.season} · Week ${Math.min(c.week, SEASON_WEEKS)}/${SEASON_WEEKS} · ${wmDayName(c.day)}${isPeakWeek() ? ' · <em class="peak">PEAK</em>' : ''}</span></div>
            <div class="kpis">
                <div class="kpi"><small>Cash</small><b class="${c.cash < 0 ? 'neg' : ''}">${wmMoney(c.cash)}</b></div>
                ${c.manager.owner ? `<div class="kpi"><small>Owner</small><b>👑</b></div>` : `<div class="kpi"><small>Head office</small><b>${c.board.confidence}%</b><i class="bar"><i style="width:${c.board.confidence}%;background:${c.board.confidence > 55 ? '#22c55e' : c.board.confidence > 30 ? '#facc15' : '#ef4444'}"></i></i></div>`}
                <div class="kpi"><small>Rep</small><b>${c.manager.rep}</b></div>
                <div class="kpi"><small>Rankings</small><b>${ordinal(leaguePosition())}</b></div>
            </div>
            <button class="go" data-act="preshift">Next Shift ▶</button>
        </header>
        <nav class="tabs">${tabs.map(([k, i, l]) => `<button class="${wmTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${i}<span>${l}</span>${k === 'inbox' && (unread || pend) ? `<em>${pend || unread}</em>` : ''}</button>`).join('')}</nav>
        <main id="tabBody">${renderTab(wmTab)}</main>
    </div>`;
}
function renderTab(tab)
{
    switch (tab)
    {
        case 'overview': return renderOverview();
        case 'staff': return renderStaff();
        case 'training': return renderTraining();
        case 'transfers': return renderTransfers();
        case 'facilities': return renderFacilities();
        case 'league': return renderLeague();
        case 'finances': return renderFinances();
        case 'inbox': return renderInbox();
        case 'academy': return renderAcademy();
        case 'career': return renderCareer();
    }
    return '';
}

function renderOverview()
{
    const c = career;
    const f = shiftForecast();
    cleanLineup();
    const risk = crewRisk();
    const last = c.lastReport;
    const pend = pendingDecisions();
    const injured = c.staff.filter(s => s.injury);
    const expiring = c.staff.filter(s => s.contractWeeks <= 4);
    const news = c.inbox.filter(m => m.type === 'news').slice(0, 3);
    return `
    <div class="grid">
        <section class="card hero">
            <h3>Next shift — ${wmDayName(c.day)}, Week ${c.week}</h3>
            <div class="big3">
                <div><small>Forecast</small><b>${fmtUnits(f.volume)}</b><span>units</span></div>
                <div><small>Head office target</small><b>${fmtUnits(f.target)}</b><span>units shipped</span></div>
                <div><small>Crew risk</small><b class="risk r${risk.level}">${risk.label}</b><span>safety ${risk.avgSafety.toFixed(1)} · morale ${Math.round(risk.avgMorale)}</span></div>
            </div>
            ${f.notes.length ? `<div class="notes">${f.notes.map(n => `<span>${n}</span>`).join('')}</div>` : ''}
            ${modsHtml()}
            <div class="btnrow"><button class="primary" data-act="preshift">Pre-shift briefing ▶</button></div>
        </section>
        ${pend.length ? `<section class="card warnCard"><h3>⚖️ Decisions waiting (${pend.length})</h3>${pend.slice(0, 3).map(renderMsg).join('')}</section>` : ''}
        ${last ? `<section class="card"><h3>Last shift</h3>
            <div class="mini4">
                <div><small>Shipped</small><b class="${last.shipped >= last.target ? 'pos' : 'neg'}">${fmtUnits(last.shipped)}</b></div>
                <div><small>UPH</small><b>${last.uph}</b></div>
                <div><small>Incidents</small><b class="${last.injuries.length ? 'neg' : 'pos'}">${last.injuries.length}</b></div>
                <div><small>Profit</small><b class="${last.profit >= 0 ? 'pos' : 'neg'}">${wmMoney(last.profit)}</b></div>
            </div>
            ${last.workerOfShift ? `<p class="small">⭐ Worker of the shift: <b>${esc(last.workerOfShift.name)}</b> (${last.workerOfShift.rating.toFixed(1)})</p>` : ''}
            <button class="ghost" data-act="lastReport">Full report</button></section>` : ''}
        <section class="card"><h3>Crew status</h3>
            <p>${c.staff.length} staff · avg morale ${moraleDot(avgMorale())} ${moraleLabel(avgMorale())} · weekly wages ${wmMoney(c.staff.reduce((a,s)=>a+s.wage,0))}</p>
            ${injured.length ? `<p class="small">🚑 Injured: ${injured.map(s => `${esc(s.name)} (${s.injury.days}d)`).join(', ')}</p>` : '<p class="small pos">✅ Everyone fit</p>'}
            ${expiring.length ? `<p class="small warn">📝 Contracts expiring: ${expiring.map(s => `${esc(s.name)} (${s.contractWeeks}w)`).join(', ')}</p>` : ''}
            <p class="small">Assistant manager: <b>${esc(c.assistant.name)}</b> (${Math.round(c.assistant.quality * 100)}% reliable on incidents)</p>
        </section>
        <section class="card"><h3>Records</h3>
            <div class="mini4">
                <div><small>Total units</small><b>${c.records.totalUnits.toLocaleString()}</b></div>
                <div><small>Best shift</small><b>${fmtUnits(c.records.bestShipped)}</b></div>
                <div><small>Injury-free run</small><b>${c.records.injuryFreeStreak}</b></div>
                <div><small>Shifts</small><b>${c.records.shiftsPlayed}</b></div>
            </div>
        </section>
        ${news.length ? `<section class="card"><h3>📰 Around the rankings</h3>${news.map(m => `<p class="small"><b>${esc(m.title)}</b><br>${esc(m.body)}</p>`).join('')}</section>` : ''}
    </div>`;
}
function modsHtml()
{
    const mods = career.mods || [];
    const bond = hasHomegrownBond(career.lineup);
    if (!mods.length && !bond) return '';
    return `<div class="notes mods">${bond ? '<span class="good">🤝 Homegrown Bond: +4% speed, −10% risk</span>' : ''}${mods.map(m => `<span class="${(m.key === 'risk' ? m.value < 1 : m.value > 1) ? 'good' : 'bad'}">${esc(m.label)} · ${m.shifts} left</span>`).join('')}</div>`;
}
function avgMorale() { return career.staff.reduce((a,s)=> a + s.morale, 0) / Math.max(1, career.staff.length); }

function staffRow(s, opts = {})
{
    const bz = bestZone(s);
    const r = zoneRating(s, bz);
    const lz = career.lineup[s.id];
    const status = s.injury ? `<span class="tag bad">🚑 ${s.injury.days}d</span>` : s.course ? `<span class="tag">🎓 ${CERT_DEFS[s.course.cert].short}</span>` : '';
    return `<button class="srow" data-act="staff" data-id="${s.id}">
        <span class="nm withAva">${staffAva(s, 40)}<span><b>${esc(displayName(s))}</b><small>${s.age} · ${s.traits.join(', ')}</small></span></span>
        <span class="bz">${zonePill(bz)} ${starsHtml(r)}</span>
        <span class="cell">${moraleDot(s.morale)}<small>${Math.round(s.condition)}%</small></span>
        <span class="cell"><small>Form</small>${formAvg(s)}</span>
        <span class="cell"><small>${wmMoney(s.wage)}/wk</small><small class="${s.contractWeeks <= 4 ? 'warn' : 'muted'}">${s.contractWeeks}w</small></span>
        <span class="cell">${status}${s.certs.map(c => `<span class="cert">${CERT_DEFS[c].short}</span>`).join('')}</span>
    </button>`;
}
function renderStaff()
{
    const list = [...career.staff];
    const sorters = {
        zone: (a, b)=> ZONE_KEYS.indexOf(bestZone(a)) - ZONE_KEYS.indexOf(bestZone(b)) || zoneRating(b, bestZone(b)) - zoneRating(a, bestZone(a)),
        ability: (a, b)=> staffAbility(b) - staffAbility(a),
        morale: (a, b)=> a.morale - b.morale,
        wage: (a, b)=> b.wage - a.wage,
        contract: (a, b)=> a.contractWeeks - b.contractWeeks,
        form: (a, b)=> (parseFloat(formAvg(b)) || 0) - (parseFloat(formAvg(a)) || 0),
    };
    list.sort(sorters[wmStaffSort] || sorters.zone);
    return `<section class="card">
        <div class="hrow"><h3>Staff (${career.staff.length}/${tierDef().squad + 4})</h3>
        <label class="inline">Sort <select id="staffSort">${Object.keys(sorters).map(k => `<option ${k === wmStaffSort ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>
        <div class="slist">${list.map(s => staffRow(s)).join('')}</div>
    </section>`;
}

function renderTraining()
{
    const c = career;
    return `<section class="card"><h3>Training schedule</h3>
        <p class="small muted">Training Centre level ${c.facilities.training}. Young staff with headroom improve fastest; Mentors with high Leadership accelerate youngsters. Light duties restore condition and morale.</p>
        <div class="slist">${c.staff.map(s => `
            <div class="trow">
                <span class="nm"><b>${esc(s.name)}</b><small>${s.age} · pot ${s.hidden.potential > staffAbility(s) + 2 ? '📈' : s.hidden.potential > staffAbility(s) ? '↗' : '➖'}</small></span>
                <select data-train="${s.id}">${Object.entries(TRAINING_DEFS).map(([k, d]) => `<option value="${k}" ${s.training === k ? 'selected' : ''}>${d.label}</option>`).join('')}</select>
                <span class="cell">${s.course ? `🎓 ${CERT_DEFS[s.course.cert].label} (${s.course.weeksLeft}w)` : `<select data-course="${s.id}"><option value="">Certification…</option>${CERT_KEYS.filter(k => !s.certs.includes(k)).map(k => `<option value="${k}">${CERT_DEFS[k].label} · ${CERT_DEFS[k].weeks}w · ${wmMoney(CERT_DEFS[k].cost)}</option>`).join('')}</select>`}</span>
            </div>`).join('')}</div></section>`;
}

function marketRow(s)
{
    const known = s.scouted;
    const bz = bestZone(s);
    const r = known ? zoneRating(s, bz) : zoneRating({ ...s, attrs: Object.fromEntries(ATTR_KEYS.map(k => [k, attrView(s, k).v])) }, bz);
    const fee = transferFee(s);
    return `<button class="srow" data-act="market" data-id="${s.id}">
        <span class="nm withAva">${staffAva(s, 40)}<span><b>${esc(s.name)}</b><small>${s.age} · ${known ? s.traits.join(', ') : 'Unvetted'}</small></span></span>
        <span class="bz">${zonePill(bz)} ${starsHtml(r, !known)}</span>
        <span class="cell"><small>Wants</small>${wmMoney(Math.round(contractDemand(s) * (s.employer ? 1.12 : 1) / 10) * 10)}/wk</span>
        <span class="cell"><small>${fee ? 'Fee' : 'Free'}</small>${fee ? wmMoney(fee) : '—'}</span>
        <span class="cell">${s.certs.map(c => `<span class="cert">${CERT_DEFS[c].short}</span>`).join('')}</span>
    </button>`;
}
function renderTransfers()
{
    const c = career;
    let body = '';
    if (wmMarketTab === 'free') body = c.market.filter(s => s.age >= 21).map(marketRow).join('');
    else if (wmMarketTab === 'trainees') body = c.market.filter(s => s.age < 21).map(marketRow).join('');
    else body = c.rivals.map(r => `<h4 style="color:${r.hex}">${esc(r.name)} <small class="muted">${esc(r.style)}</small></h4>${r.staff.map(marketRow).join('')}`).join('');
    return `<section class="card">
        <div class="hrow"><h3>Jobs board</h3><span class="small">Crew ${c.staff.length}/${tierDef().squad + 4} · Vetting ${wmMoney(scoutCost())}</span></div>
        <div class="seg">${[['free','Free agents'],['trainees','Trainees'],['rivals','Rival staff']].map(([k, l]) => `<button class="${wmMarketTab === k ? 'on' : ''}" data-act="mtab" data-k="${k}">${l}</button>`).join('')}</div>
        <p class="small muted">Unvetted attributes are shown as ranges. Rival staff need a poaching fee — and may be loyal to their employer.</p>
        <div class="slist">${body}</div>
    </section>`;
}

function renderFacilities()
{
    const c = career;
    return `<div class="grid">${Object.entries(FACILITY_DEFS).map(([k, d]) =>
    {
        const lvl = c.facilities[k];
        const max = lvl >= d.max;
        const cost = max ? 0 : facilityCost(k);
        return `<section class="card fac">
            <h3>${d.icon} ${d.label}</h3>
            <div class="pips">${Array.from({length:d.max}, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
            <p class="small">${d.desc}</p>
            ${max ? '<b class="pos">MAX LEVEL</b>' : `<button class="${c.cash >= cost ? 'primary' : ''}" data-act="upgrade" data-k="${k}">Upgrade to ${lvl + 1} · ${wmMoney(cost)}</button>`}
            <p class="tiny muted">Upkeep ${wmMoney(lvl * (k === 'automation' ? 600 : 110))}/wk</p>
        </section>`;
    }).join('')}</div>`;
}

function renderLeague()
{
    const rows = leagueTable();
    const day = career.lastReport?.rivalDay;
    return `<section class="card"><h3>Network rankings — Year ${career.season}</h3>
        <p class="small muted">Points are awarded every week for rank in Volume, Safety, Cost per unit and Customer Satisfaction (8 for 1st … 1 for 8th). Top 2 step up to a bigger site.</p>
        <div class="tablewrap"><table class="league">
            <tr><th>#</th><th>Company</th><th>Pts</th><th>Units</th><th title="Weighted incidents per 10k units">Safety</th><th title="Cost per unit">CPU</th><th>CSAT</th></tr>
            ${rows.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td><i class="sw" style="background:${r.hex}"></i>${esc(r.name)}</td><td><b>${r.points}</b></td><td>${r.units.toLocaleString()}</td><td>${r.safety.toFixed(2)}</td><td>${r.cpu ? '£' + r.cpu.toFixed(3) : '–'}</td><td>${r.shifts ? r.csat.toFixed(1) + '%' : '–'}</td></tr>`).join('')}
        </table></div>
    </section>
    ${day ? `<section class="card"><h3>Yesterday's results</h3><div class="slist">${[{ name:career.company, hex:'#38bdf8', shipped:career.lastReport.shipped, incidents:career.lastReport.injuries.length, you:true }, ...day].sort((a,b)=> b.shipped - a.shipped).map(r => `<div class="trow ${r.you ? 'you' : ''}"><span class="nm"><i class="sw" style="background:${r.hex}"></i>${esc(r.name)}</span><span>${fmtUnits(r.shipped)} units</span><span>${r.incidents ? `⚠️ ${r.incidents}` : '✅'}</span></div>`).join('')}</div></section>` : ''}`;
}

function renderFinances()
{
    const c = career;
    const L = c.weekLedger;
    const wageBill = c.staff.reduce((a, s)=> a + s.wage, 0);
    const hist = c.history.slice(-20);
    const maxAbs = Math.max(1, ...hist.map(h => Math.abs(h.profit)));
    const line = (l, v, cls = '')=> `<div class="lline"><span>${l}</span><b class="${cls}">${wmMoney(v)}</b></div>`;
    return `<div class="grid">
        <section class="card"><h3>This week so far</h3>
            ${line('Revenue', L.revenue, 'pos')}${line('Late/defect penalties', -L.penalties, 'neg')}${line('Accident fines', -L.fines, 'neg')}
            ${line('Energy', -L.energy, 'neg')}${line('Overtime', -L.overtime, 'neg')}${line('Contractors / courses / vetting', -L.other, 'neg')}
            ${line('Recruitment', -L.transfers, L.transfers > 0 ? 'neg' : 'pos')}${line('Upgrades', -L.upgrades, 'neg')}
            <div class="lline muted"><span>Wages due Friday</span><b>${wmMoney(-wageBill)}</b></div>
            <div class="lline muted"><span>Facility upkeep due Friday</span><b>${wmMoney(-Object.entries(c.facilities).reduce((a,[k,v])=> a + v * (k === 'automation' ? 600 : 110), 0))}</b></div>
        </section>
        <section class="card"><h3>Shift profit history</h3>
            <div class="bars">${hist.map(h => `<i title="S${h.season} D${h.day}: ${wmMoney(h.profit)}" class="${h.profit >= 0 ? 'p' : 'n'}" style="height:${Math.abs(h.profit) / maxAbs * 100}%"></i>`).join('') || '<p class="muted small">No shifts yet</p>'}</div>
            <p class="small muted">Shift profit includes a fifth of the weekly wage bill. Revenue: ${wmMoney(tierDef().rate)}/unit.</p>
        </section>
    </div>`;
}

function renderMsg(m)
{
    return `<div class="msg ${m.read ? '' : 'unread'} t-${m.type}">
        <div class="mh"><b>${esc(m.title)}</b><small>S${m.season} W${m.week}</small></div>
        <p>${esc(m.body)}</p>
        ${m.actions && !m.resolved ? `<div class="btnrow">${m.actions.map(a => `<button data-act="decide" data-mid="${m.id}" data-aid="${a.id}">${esc(a.label)}</button>`).join('')}</div>` : ''}
        ${m.outcome ? `<p class="small pos">→ ${esc(m.outcome)}</p>` : ''}
    </div>`;
}
function renderInbox()
{
    const html = career.inbox.map(renderMsg).join('') || '<p class="muted">No messages.</p>';
    for (const m of career.inbox) if (!m.actions || m.resolved) m.read = true;
    return `<section class="card"><div class="hrow"><h3>Inbox</h3><button class="ghost" data-act="settings">⚙️ Settings</button></div>${html}</section>`;
}

// ---------------------------------------------------------------------------
// Staff detail modal
function staffDetail(s, market = false)
{
    const own = career.staff.includes(s);
    const attrs = ATTR_KEYS.map(k =>
    {
        const v = attrView(s, k);
        return `<div class="attr"><span>${ATTR_LABELS[k]}</span><b class="${v.exact ? attrClass(v.v) : 'fuzzy'}">${v.txt}</b><i class="ab"><i class="${attrClass(v.v)}" style="width:${v.v / 20 * 100}%"></i></i></div>`;
    }).join('');
    const zr = ZONE_KEYS.map(z =>
    {
        const view = own || s.scouted ? s : { ...s, attrs: Object.fromEntries(ATTR_KEYS.map(k => [k, attrView(s, k).v])) };
        return `<div class="zr">${zonePill(z)} ${starsHtml(zoneRating(view, z), !(own || s.scouted))}</div>`;
    }).join('');
    const potKnown = own || s.scouted;
    const pot = potKnown ? starsHtml(s.hidden.potential + 2) : '<span class="muted">?</span>';
    const st = s.stats;
    let actions = '';
    if (own)
    {
        const demand = contractDemand(s);
        actions = `
        <div class="btnrow wrap">
            <button data-act="customise" data-id="${s.id}">🎨 Customise</button>
            <button data-act="talk" data-id="${s.id}" data-k="praise">👍 Praise</button>
            <button data-act="talk" data-id="${s.id}" data-k="criticise">👎 Criticise</button>
            <button data-act="contractDlg" data-id="${s.id}">📝 New contract (wants ~${wmMoney(demand)})</button>
            <button class="danger" data-act="release" data-id="${s.id}">Release (${wmMoney(releaseCost(s))})</button>
        </div>`;
    }
    else
    {
        actions = `<div class="btnrow wrap">
            ${s.scouted ? '' : `<button data-act="scout" data-id="${s.id}">🔍 Vet (${wmMoney(scoutCost())})</button>`}
            <button class="primary" data-act="signDlg" data-id="${s.id}">✍️ ${s.employer ? 'Approach (fee ' + wmMoney(transferFee(s)) + ')' : 'Offer contract'}</button>
        </div>`;
    }
    openModal(`
        <div class="sd">
            <div class="sdh">
                <div class="sdAva">${staffAva(s, 96, 'happy')}</div>
                <div><h2>${esc(displayName(s))}</h2>${s.homegrown ? `<p class="pos">🌱 Apprentice graduate · class of Y${s.homegrown.season}${s.archetype ? ' · ' + ARCHETYPES[s.archetype].label : ''}</p>` : ''}<p>${s.age} yrs · ${s.employer ? esc(s.employer) : own ? esc(career.company) : 'Looking for work'} · value ${wmMoney(staffValue(s))}</p>
                <p>${(own || s.scouted) ? s.traits.map(t => `<span class="trait ${TRAIT_DEFS[t].good ? 'g' : 'b'}" title="${esc(TRAIT_DEFS[t].desc)}">${t}</span>`).join('') : '<span class="trait">Personality unknown</span>'}
                   ${s.certs.map(c => `<span class="cert" title="${CERT_DEFS[c].label}">${CERT_DEFS[c].label}</span>`).join('')}</p></div>
                <div class="sdk">
                    ${own ? `<div><small>Morale</small><b style="color:${moraleColor(s.morale)}">${moraleLabel(s.morale)}</b></div><div><small>Condition</small><b>${Math.round(s.condition)}%</b></div>` : ''}
                    <div><small>Wage</small><b>${wmMoney(own ? s.wage : contractDemand(s))}/wk</b></div>
                    ${own ? `<div><small>Contract</small><b>${s.contractWeeks} wks</b></div>` : ''}
                    <div><small>Potential</small>${pot}</div>
                    ${s.injury ? `<div><small>Injury</small><b class="neg">${esc(s.injury.label)} (${s.injury.days}d)</b></div>` : ''}
                </div>
            </div>
            <div class="sdcols">
                <div><h4>Attributes</h4><div class="attrs">${attrs}</div></div>
                <div><h4>Zone ratings</h4><div class="zrs">${zr}</div>
                    ${own ? `<h4>Form</h4><div class="form">${s.form.map(r => `<span class="rt ${ratingClass(r)}">${r.toFixed(1)}</span>`).join('') || '<span class="muted small">No shifts yet</span>'}</div>
                    <p class="small">Shifts ${st.shifts} · Avg ${st.shifts ? (st.ratingSum / st.shifts).toFixed(2) : '–'} · Units ${st.units.toLocaleString()} · Incidents ${st.incidents} · ⭐ ${st.potw}</p>` : ''}
                </div>
            </div>
            ${actions}
            <div id="sdMsg" class="small"></div>
        </div>`);
}

function contractDialog(s, signing)
{
    const demand = Math.round(contractDemand(s) * (signing && s.employer ? 1.12 : 1) / 10) * 10;
    const fee = signing ? transferFee(s) : 0;
    const start = Math.max(demand, signing ? 0 : s.wage);
    openModal(`
        <h2>${signing ? (s.employer ? 'Approach' : 'Sign') : 'Renew'}: ${esc(s.name)}</h2>
        ${fee ? `<p>Poaching fee to ${esc(s.employer)}: <b>${wmMoney(fee)}</b></p>` : ''}
        <label>Weekly wage: <b id="wageVal">${wmMoney(start)}</b>
            <input type="range" id="wageIn" min="${Math.round(demand * .6 / 10) * 10}" max="${Math.round(demand * 1.6 / 10) * 10}" step="10" value="${start}"></label>
        <div class="seg" id="lenSeg">${[26, 52, 104].map(w => `<button class="${w === 52 ? 'on' : ''}" data-act="len" data-w="${w}">${w} weeks</button>`).join('')}</div>
        <p>Likelihood: <b id="chanceVal"></b></p>
        <div class="btnrow"><button class="primary" data-act="${signing ? 'doSign' : 'doRenew'}" data-id="${s.id}">Make offer</button><button data-act="closeModal">Cancel</button></div>
        <div id="sdMsg"></div>`);
    $('#modal').dataset.len = 52;
    $('#modal').dataset.sid = s.id;
    $('#modal').dataset.signing = signing ? 1 : 0;
    updateChance();
}
function updateChance()
{
    const m = $('#modal');
    const s = findAnyStaff(+m.dataset.sid);
    const wage = +($('#wageIn')?.value || 0);
    if (!s) return;
    $('#wageVal').textContent = wmMoney(wage);
    const p = acceptChance(s, wage, +m.dataset.len, m.dataset.signing === '1');
    const el = $('#chanceVal');
    el.textContent = p > .75 ? 'Very likely' : p > .5 ? 'Likely' : p > .3 ? 'Unsure' : p > .12 ? 'Unlikely' : 'No chance';
    el.className = p > .5 ? 'pos' : p > .3 ? 'warn' : 'neg';
}
function findAnyStaff(id)
{
    return career.staff.find(s => s.id === id) || career.market.find(s => s.id === id) || career.rivals.flatMap(r => r.staff).find(s => s.id === id);
}

// ---------------------------------------------------------------------------
// Pre-shift briefing
function showPreshift()
{
    setMode('preshift');
    cleanLineup();
    const c = career;
    const f = shiftForecast();
    const risk = crewRisk();
    const site = wvSiteFor(c.tier);
    const clients = WV_CLIENTS.slice(0, site.clients);
    const teams = [...new Set(site.zones.map(z => WV_ZONES[z].zone))];
    const avail = c.staff.filter(s => !s.injury);
    const onRota = avail.filter(s => c.lineup[s.id] && c.lineup[s.id] !== 'bench');
    const warnings = [];
    if (onRota.length > site.crew) warnings.push(`${onRota.length} on the rota but the site only needs ${site.crew} — the extras will stand around`);
    if (onRota.length < site.crew) warnings.push(`Only ${onRota.length} of ${site.crew} on the rota — you'll be short-handed`);
    if (!onRota.some(s => s.certs.includes('forklift'))) warnings.push('Nobody on the rota has a forklift licence — heavy pallets won\'t move');
    if (clients.some(cl => cl.dg) && !onRota.some(s => s.certs.includes('hazmat'))) warnings.push('Nobody DG-trained on shift — the DG cage will be slow and risky');
    for (const t of teams) if (!onRota.some(s => c.lineup[s.id] === t)) warnings.push(`No ${ZONE_DEFS[t].name} specialist picked — the assistant will make do`);
    const tired = onRota.filter(s => s.condition < 60);
    if (tired.length) warnings.push(`${tired.length} on the rota below 60% condition`);
    const rivalLine = c.inbox.find(m => m.type === 'news');
    const opt = (k, label, sel)=> `<option value="${k}" ${sel ? 'selected' : ''}>${label}</option>`;
    $('#screen').innerHTML = `
    <div class="hub pre">
        <header class="top">
            <div class="co"><b>Pre-shift briefing</b><span>${wmDayName(c.day)} · Week ${c.week} · Year ${c.season}${isPeakWeek() ? ' · <em class="peak">PEAK</em>' : ''}</span></div>
            <button class="ghost" data-act="hub">✕ Back</button>
        </header>
        <div class="grid">
            <section class="card hero">
                <div class="big3">
                    <div><small>Inbound</small><b>${fmtUnits(f.volume)}</b><span>units in ${site.waves} waves</span></div>
                    <div><small>Head office target</small><b>${fmtUnits(f.target)}</b><span>units despatched</span></div>
                    <div><small>Crew risk</small><b class="risk r${risk.level}">${risk.label}</b><span>×${risk.mult.toFixed(2)} incident rate</span></div>
                </div>
                ${f.notes.length ? `<div class="notes">${f.notes.map(n => `<span>${n}</span>`).join('')}</div>` : ''}
                <h4>Today's clients</h4>
                <div class="clients">${clients.map(cl => `<div class="client"><i style="background:${cl.hex}"></i><b>${esc(cl.name)}</b><span>${cl.recipe.map(z => WV_ZONES[z].icon).join(' → ')} → 🚪</span>${cl.heavy > .2 ? '<small>🪵 heavy</small>' : ''}${cl.dg ? '<small>☣️ DG</small>' : ''}</div>`).join('')}</div>
                <p class="tiny muted">Site: ${site.docks} goods-in dock${site.docks > 1 ? 's' : ''} · ${site.zones.length} zones (${site.zones.map(z => WV_ZONES[z].icon).join(' ')}) · ${site.forklifts} forklift${site.forklifts > 1 ? 's' : ''} · ${site.seats} seats per zone</p>
                ${rivalLine ? `<p class="small muted">📰 ${esc(rivalLine.title)}</p>` : ''}
                ${modsHtml()}
            </section>
            <section class="card">
                <div class="hrow"><h3>Shift rota <span class="small muted">${onRota.length}/${site.crew}</span></h3><button data-act="autoLineup">✨ Auto-pick</button></div>
                ${warnings.length ? `<div class="warnlist">${warnings.map(w => `<p>⚠️ ${esc(w)}</p>`).join('')}</div>` : '<p class="pos small">✅ Rota looks solid</p>'}
                <div class="slist">${avail.sort((a, b)=> (c.lineup[a.id] === 'bench') - (c.lineup[b.id] === 'bench') || zoneRating(b, bestZone(b)) - zoneRating(a, bestZone(a))).map(s =>
                {
                    const z = c.lineup[s.id] || 'bench';
                    const col = z === 'bench' ? '#64748b' : z === 'op' ? '#ffd23f' : ZONE_DEFS[z]?.hex || '#64748b';
                    return `<div class="lrow" style="--zc:${col}">
                        <button class="nm linkish withAva" data-act="staff" data-id="${s.id}">${staffAva(s, 34)}<b>${esc(displayName(s))}</b><small>${moraleDot(s.morale)} ${Math.round(s.condition)}% · ${s.certs.map(x => CERT_DEFS[x].short).join(' ')}</small></button>
                        <span>${ZONE_DEFS[z] ? starsHtml(zoneRating(s, z)) : ''}</span>
                        <select data-lineup="${s.id}">${teams.map(k => opt(k, ZONE_DEFS[k].icon + ' ' + ZONE_DEFS[k].name + ' ' + '★'.repeat(Math.round(starsFor(zoneRating(s, k)))), k === z)).join('')}${opt('op', '🚶 General operative', z === 'op' || (z !== 'bench' && !teams.includes(z)))}${opt('bench', '☕ Standby (day off)', z === 'bench')}</select>
                    </div>`;
                }).join('')}</div>
                <p class="tiny muted">Specialists are a preference: you seat people yourself in set-up. Licensed drivers (FLT) can take a forklift.</p>
                ${c.staff.some(s => s.injury) ? `<p class="small muted">🚑 Unavailable: ${c.staff.filter(s => s.injury).map(s => esc(s.name)).join(', ')}</p>` : ''}
            </section>
            <section class="card">
                <h3>Kit check</h3>
                <div class="eqs">${Object.entries(FACILITY_DEFS).map(([k, d]) => `<span>${d.icon} ${d.label.split(' ')[0]} <b>L${c.facilities[k]}</b></span>`).join('')}</div>
            </section>
        </div>
        <footer class="startbar">
            <button class="ghost" data-act="simulate">⏩ Let the assistant run it</button>
            <button class="big primary" data-act="startShift">▶ Start shift</button>
        </footer>
    </div>`;
}

function trySimulate()
{
    const risk = crewRisk();
    if (risk.level >= 1)
    {
        openModal(`<h2>⚠️ ${esc(career.assistant.name)} advises against simulating</h2>
            <p>Crew risk is <b class="risk r${risk.level}">${risk.label}</b>: average zone competence ${risk.competence.toFixed(1)}, safety ${risk.avgSafety.toFixed(1)}, morale ${Math.round(risk.avgMorale)}${risk.missingCerts ? `, ${risk.missingCerts} uncertified in specialist zones` : ''}${risk.proneCount ? `, ${risk.proneCount} accident-prone` : ''}.</p>
            <p>Without you on the floor, warnings are caught only ~${Math.round(career.assistant.quality * 80)}% of the time and accident rates rise 25%.</p>
            <div class="btnrow"><button class="primary" data-act="startShift">▶ I'll run it myself</button><button class="danger" data-act="simulateNow">Simulate anyway</button></div>`);
    }
    else simulateShift();
}

// ---------------------------------------------------------------------------
// Shift lifecycle
let wmSim = null;
function startShift(skipStory = false)
{
    closeModal();
    const sid = !skipStory && storyNext('preShift');
    if (sid) return playStory(sid, ()=> startShift(true));
    wmSim = new WaveSim(career);
    sceneShiftIntro(wmSim, ()=>
    {
        setMode('shift');
        waveView.start(wmSim);
        buildWaveHud();
        if (!career.flags.waveHelpSeen) wvHelp();
    });
}
function simulateShift(skipStory = false)
{
    closeModal();
    const sid = !skipStory && storyNext('preShift');
    if (sid) return playStory(sid, ()=> simulateShift(true));
    wmSim = new WaveSim(career, { assistant:true });
    wmSim.runToEnd(clamp(career.assistant.quality * ([1.05, .9, .7][crewRisk().level] ?? .8), .15, .95));
    finishShift();
}
function hudShiftFinished()
{
    if (wmMode !== 'shift') return;
    setTimeout(finishShift, 1900);
}
function finishShift()
{
    if (!wmSim) return;
    const res = wmSim.result();
    if (waveView.active) waveView.stop(); else if (shiftView.active) shiftView.stop();
    const week = applyShiftResult(res);
    wmSim = null;
    saveCareer();
    wmPendingFlow = [{ kind:'story', point:'postShift' }];
    for (const m of career.pendingMilestones) wmPendingFlow.push({ kind:'cine', m });
    career.pendingMilestones = [];
    if (week) wmPendingFlow.push({ kind:'week', week });
    if (week?.seasonEnd)
    {
        const se = week.seasonEnd;
        wmPendingFlow.push({ kind:'season', season:se });
        if (!se.sacked)
        {
            wmPendingFlow.push({ kind:'story', point:'seasonEnd', ctx:se }, { kind:'story', point:'seasonEnd', ctx:se });
            if (se.offers?.length) wmPendingFlow.push({ kind:'offers', reason:'season' });
        }
    }
    sceneShiftEnd(res, ()=> showReport(res));
}
function continueFlow()
{
    closeModal();
    const step = wmPendingFlow.shift();
    if (!step) { saveCareer(); return career.board.sacked ? showGameOver() : showHub('overview'); }
    if (step.kind === 'cine') return showCinematic(step.m);
    if (step.kind === 'week') return showWeekSummary(step.week);
    if (step.kind === 'season') return showSeasonEnd(step.season);
    if (step.kind === 'story')
    {
        const id = storyNext(step.point, step.ctx);
        if (!id) return continueFlow();
        return playStory(id, ()=> continueFlow(), step.ctx);
    }
    if (step.kind === 'offers') return showOffersModal(step.reason);
}

// ---------------------------------------------------------------------------
// HUD
function buildHud()
{
    $('#hud').innerHTML = `
    ${safetyBoardHtml(career.records.daysSinceAccident, career.records.bestSafeRun)}
    <div class="hudTop">
        <div class="clock"><b id="hClock">06:00</b><i class="bar"><i id="hProg"></i></i></div>
        <div class="chip"><small>Shipped</small><b id="hShip">0</b><span id="hTgt"></span></div>
        <div class="chip"><small>UPH</small><b id="hUph">0</b></div>
        <div class="chip flow"><small>Flow</small><b id="hFlow">x1.00</b></div>
        <div class="chip"><small>Safety</small><b id="hSafe">✅</b></div>
        <div class="chip"><small>On-time</small><b id="hCsat">100%</b></div>
    </div>
    <div class="hudBot">
        <div class="seg">
            <button data-act="pause" id="bPause">⏸</button>
            <button data-act="speed" data-s="1" class="on">1x</button>
            <button data-act="speed" data-s="2">2x</button>
            <button data-act="speed" data-s="4">4x</button>
        </div>
        <div class="seg">${Object.entries(LINE_SPEEDS).map(([k, d]) => `<button data-act="line" data-k="${k}" class="${wmSim.lineSpeed === k ? 'on' : ''}">${d.label}</button>`).join('')}</div>
        <div class="seg">
            <button data-act="overtime" id="bOT">⏱️ Overtime</button>
            <button data-act="assistant" id="bAsst">🤖 Auto: off</button>
            <button data-act="simRest">⏩ Finish</button>
        </div>
    </div>`;
}
let wmHudLast = {};
function hudUpdate()
{
    const sim = wmSim;
    if (!sim || wmMode !== 'shift') return;
    const set = (id, v)=> { if (wmHudLast[id] !== v) { wmHudLast[id] = v; const e = document.getElementById(id); if (e) { e.innerHTML = v; e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); } } };
    set('hClock', sim.clock() + (sim.t > SHIFT_SECONDS ? ' OT' : ''));
    const prog = document.getElementById('hProg'); if (prog) prog.style.width = clamp(sim.t / sim.duration, 0, 1) * 100 + '%';
    set('hShip', fmtUnits(sim.stats.shipped));
    set('hTgt', '/' + fmtUnits(sim.forecast.target));
    const shipEl = document.getElementById('hShip'); if (shipEl) shipEl.className = sim.stats.shipped >= sim.forecast.target ? 'pos' : '';
    set('hUph', sim.unitsPerHour());
    set('hFlow', 'x' + (1 + (sim.stats.flow - 1) * .25).toFixed(2));
    const inj = sim.stats.injuries.length;
    set('hSafe', inj ? `🚑 ${inj}` : `✅ ${sim.stats.avoided ? '🛡️' + sim.stats.avoided : ''}`);
    const st = sim.stats;
    let pending = sim.dock; for (const z of ZONE_KEYS) pending += sim.zones[z].queue.length;
    const ot = st.shipped ? (st.shipped - st.lateRush) / st.shipped : 1;
    set('hCsat', pct(ot));
    const ob = document.getElementById('bOT'); if (ob) { ob.disabled = sim.overtimeHours >= 2; ob.textContent = sim.overtimeHours ? `⏱️ OT +${sim.overtimeHours}h` : '⏱️ Overtime'; }
    const ab = document.getElementById('bAsst'); if (ab) { ab.textContent = `🤖 Auto: ${sim.assistantOn ? 'ON' : 'off'}`; ab.classList.toggle('on', sim.assistantOn); }
    const pb = document.getElementById('bPause'); if (pb) pb.textContent = shiftView.paused ? '▶' : '⏸';
    if (shiftView.selected) hudWorkerCard(sim.worker(shiftView.selected), true);
}
function hudToast(text, color = '#e2e8f0')
{
    const box = $('#toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderColor = color;
    t.innerHTML = esc(text);
    box.prepend(t);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(()=> t.classList.add('out'), 2600);
    setTimeout(()=> t.remove(), 3200);
}
function hudWorkerCard(w, refresh = false)
{
    const el = $('#workerCard');
    if (!w || w.injured || wmMode !== 'shift') { el.classList.add('hidden'); el.dataset.wid = ''; return; }
    const s = w.s;
    const info = `⚡ ${Math.round(w.energy)}% · 📦 ${w.processed} · ❌ ${w.errors} · ${moraleDot(s.morale)} ${moraleLabel(s.morale)}`;
    const zone = `${zonePill(w.zone)} ${w.zone !== 'bench' ? starsHtml(zoneRating(s, w.zone)) : ''} <small>${w.state}</small>`;
    // rebuild the structure only when the worker or their zone changes, so buttons
    // aren't replaced under the player's finger
    if (el.dataset.wid != w.id || el.dataset.zone !== w.zone || el.classList.contains('hidden'))
    {
        el.innerHTML = `
        <div class="wc">
            <div class="hrow"><b>${esc(s.name)}</b><button class="x" data-act="deselect">✕</button></div>
            <div id="wcZone">${zone}</div>
            <div class="small" id="wcInfo">${info}</div>
            <div class="small muted">${s.traits.join(', ')} ${s.certs.map(c => CERT_DEFS[c].short).join(' ')}</div>
            <div class="btnrow">
                ${w.zone !== 'bench' ? `<button data-act="wBreak" data-id="${w.id}">☕ Break</button>` : ''}
                ${w.zone !== bestZone(s) ? `<button data-act="wBest" data-id="${w.id}">${ZONE_DEFS[bestZone(s)].icon} Best zone</button>` : ''}
            </div>
        </div>`;
        el.dataset.wid = w.id;
        el.dataset.zone = w.zone;
        el.classList.remove('hidden');
        return;
    }
    const zi = document.getElementById('wcZone'); if (zi && zi.innerHTML !== zone) zi.innerHTML = zone;
    const ii = document.getElementById('wcInfo'); if (ii && ii.innerHTML !== info) ii.innerHTML = info;
}

// ---------------------------------------------------------------------------
// Post-shift report
function showReport(res, replay = false)
{
    setMode('report');
    const r = res;
    const hit = r.shipped >= r.target;
    const maxH = Math.max(1, ...r.hourly.map((v, i)=> v - (r.hourly[i-1] || 0)));
    const quip = r.injuries.some(i => i.serious) ? 'Head office is alarmed by the serious incident.'
        : !hit ? 'Head office notes the shortfall against target.'
        : r.injuries.length ? 'Good output, but head office wants a cleaner safety record.'
        : r.csat > .95 ? 'Superb — customers and head office alike are delighted.' : 'A solid shift. Head office is satisfied.';
    $('#screen').innerHTML = `
    <div class="hub report">
        <header class="top"><div class="gradeBadge g${shiftGrade(r)}">${shiftGrade(r)}</div><div class="co"><b>Post-shift report</b><span>${r.simulated ? '⏩ Simulated · ' : ''}${r.overtimeHours ? `⏱️ ${r.overtimeHours}h overtime · ` : ''}${esc(quip)}</span></div></header>
        <div class="grid">
            <section class="card hero">
                <div class="big3">
                    <div><small>Units shipped</small><b class="${hit ? 'pos' : 'neg'} count" data-to="${r.units}">0</b><span>target ${fmtUnits(r.target)}</span></div>
                    <div><small>Profit</small><b class="${r.profit >= 0 ? 'pos' : 'neg'} count" data-to="${r.profit}" data-money="1">£0</b><span>rev ${wmMoney(r.revenue)}</span></div>
                    <div><small>On-time · CSAT</small><b class="count" data-to="${Math.round(r.csat * 100)}" data-suffix="%">0%</b><span>on-time ${pct(r.onTime)}</span></div>
                </div>
                <div class="mini4">
                    <div><small>UPH</small><b>${r.uph}</b></div>
                    ${r.wave ? `<div><small>Rating</small><b class="stars">${'★'.repeat(Math.floor(r.wave.stars))}${r.wave.stars % 1 ? '½' : ''}</b></div>` : `<div><small>Peak flow</small><b>x${(1 + (r.peakFlow - 1) * .25).toFixed(2)}</b></div>`}
                    <div><small>Backlog</small><b class="${r.backlog > 20 ? 'neg' : ''}">${fmtUnits(r.backlog)}</b></div>
                    <div><small>Cost/unit</small><b>£${r.cpu.toFixed(3)}</b></div>
                </div>
                <div class="hours">${r.hourly.map((v, i)=> { const d = v - (r.hourly[i-1] || 0); return `<i style="height:${d / maxH * 100}%" title="${fmtUnits(d)}"></i>`; }).join('')}</div>
            </section>
            <section class="card"><h3>Safety</h3>
                <div class="mini4">
                    <div><small>Warnings</small><b>${r.nearMisses + r.avoided + r.injuries.length}</b></div>
                    <div><small>Avoided</small><b class="pos">${r.avoided}</b></div>
                    <div><small>Near misses</small><b>${r.nearMisses}</b></div>
                    <div><small>Injuries</small><b class="${r.injuries.length ? 'neg' : 'pos'}">${r.injuries.length}</b></div>
                </div>
                ${r.injuries.map(i => `<p class="small ${i.serious ? 'neg' : 'warn'}">${i.fatal ? '🕯️ <b>FATAL</b>' : i.serious ? '🚨' : '🩹'} ${esc(i.name)} — ${esc(i.label)} (${esc(i.cause)}${ZONE_DEFS[i.zone] ? ', ' + ZONE_DEFS[i.zone].name : ''})${i.fatal ? '' : ` · out ${i.days} shift${i.days > 1 ? 's' : ''}`}${i.fine ? ` · fine ${wmMoney(i.fine)}` : ''}</p>`).join('') || '<p class="pos small">🛡️ No injuries this shift.</p>'}
                ${r.wave ? `<p class="small">🚜 Forklift/walker crossings ${r.crossings} · <span class="${r.wave.toppled ? 'neg' : 'pos'}">📦 stacks toppled ${r.wave.toppled}</span> · damaged ${r.damaged}${r.wave.walkOuts ? ` · <span class="neg">🚪 walk-outs ${r.wave.walkOuts}</span>` : ''}${r.wave.hseFine ? ` · <span class="neg">📋 HSE fine ${wmMoney(r.wave.hseFine)}</span>` : ''}</p>
                <p class="small muted">Breakdowns ${r.breakdowns} · Mis-sends ${r.wave.misSent} · Brew rounds ${r.wave.brews} · Agency temps ${r.wave.agency}</p>`
                : `<p class="small">🚜 Road crossings ${r.crossings} · waited ${Math.round(r.crossWait)} min for forklifts · <span class="${r.jaywalks ? 'neg' : 'pos'}">🏃 jaywalks ${r.jaywalks}</span>${r.forkliftBrakes ? ` · emergency brakings ${r.forkliftBrakes}` : ''}</p>
                <p class="small muted">Breakdowns ${r.breakdowns} · Bottlenecks ${r.bottlenecks} · Errors caught by QA ${r.caught} · Defects shipped ${r.defects} · Damaged ${r.damaged} · Rush orders late ${r.lateRush} of ${r.rushShipped}</p>`}
            </section>
            <section class="card"><h3>Ratings</h3>
                <div class="slist">${r.workers.filter(w => w.rating).map(w => `
                    <div class="trow"><span class="rt ${ratingClass(w.rating)}">${w.rating.toFixed(1)}</span>
                    <span class="nm"><b>${esc(w.name)}</b>${r.workerOfShift && r.workerOfShift.id === w.id ? ' ⭐' : ''}${w.injured ? ' 🚑' : ''}</span>
                    <span>${zonePill(w.role === 'op' || w.role === 'flt' ? w.role : w.zone)}</span><span class="small">📦 ${w.processed}${w.repairs ? ` 🔧 ${w.repairs}` : ''}${w.errors ? ` ❌ ${w.errors}` : ''}${w.jaywalks ? ` 🏃 ${w.jaywalks}` : ''}</span>
                    <span class="small ${w.moraleDelta > 0 ? 'pos' : w.moraleDelta < 0 ? 'neg' : 'muted'}">${w.moraleDelta > 0 ? '▲' : w.moraleDelta < 0 ? '▼' : '•'} morale</span></div>`).join('')}</div>
            </section>
            <section class="card"><h3>Finances</h3>
                ${[['Revenue', r.revenue, 'pos'], ['Penalties (short loads, mis-sends, demurrage, damage)', -r.penalties, 'neg'], ['Accident fines', -r.fines, 'neg'], ['Energy', -r.energyCost, 'neg'], ['Overtime', -r.overtimeCost, 'neg'], ['Contractors & agency', -r.contractorCost, 'neg'], ['Wages (daily share)', -r.dailyWages, 'neg']]
                    .filter(x => x[1]).map(([l, v, c]) => `<div class="lline"><span>${l}</span><b class="${c}">${wmMoney(v)}</b></div>`).join('')}
                <div class="lline total"><span>Shift profit</span><b class="${r.profit >= 0 ? 'pos' : 'neg'}">${wmMoney(r.profit)}</b></div>
            </section>
            ${r.rivalDay ? `<section class="card"><h3>Rivals today</h3><div class="slist">${[{ name:career.company, hex:'#38bdf8', shipped:r.shipped, incidents:r.injuries.length, you:true }, ...r.rivalDay].sort((a,b)=> b.shipped - a.shipped).map((x, i) => `<div class="trow ${x.you ? 'you' : ''}"><span>${i + 1}.</span><span class="nm"><i class="sw" style="background:${x.hex}"></i>${esc(x.name)}</span><span>${fmtUnits(x.shipped)}</span><span>${x.incidents ? '⚠️' + x.incidents : '✅'}</span></div>`).join('')}</div></section>` : ''}
        </div>
        <footer class="startbar"><button class="big primary" data-act="${replay ? 'hub' : 'continueFlow'}">Continue ▶</button></footer>
    </div>`;
    animateCounters();
    if (!replay)
    {
        playSfx(hit ? 'fanfare' : 'flowDown', .7);
        if (hit && !r.injuries.length) particleEffect('confetti', cameraPos.add(vec2(0, 6)), { scale:3 });
    }
}
function animateCounters()
{
    const els = [...document.querySelectorAll('.count')];
    const t0 = performance.now();
    const step = ()=>
    {
        const p = Math.min(1, (performance.now() - t0) / 1100);
        const e = 1 - Math.pow(1 - p, 3);
        for (const el of els)
        {
            const to = +el.dataset.to;
            const v = Math.round(to * e);
            el.textContent = el.dataset.money ? wmMoney(v) : v.toLocaleString() + (el.dataset.suffix || '');
        }
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function showWeekSummary(w)
{
    const b = w.board;
    const L = w.ledger;
    const part = (l, v)=> `<div class="lline"><span>${l}</span><b class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}</b></div>`;
    openModal(`
        <h2>📊 Week ${w.week} review</h2>
        <div class="barry">📢 <b>BARRY:</b> ${b.delta >= 4 ? 'The suits upstairs are SMILING. I didn\'t know they could do that.' : b.delta >= 0 ? 'Steady week. Head office nods approvingly. Probably.' : b.delta > -6 ? 'Head office\'s frowning. Let\'s give them something to smile about.' : 'Uh-oh. I heard the words "performance review" in the lift.'}</div>
        <div class="mini4">
            <div><small>Avg shipped</small><b>${fmtUnits(b.avgShipped)}</b></div>
            <div><small>Target</small><b>${fmtUnits(b.target)}</b></div>
            <div><small>Week profit</small><b class="${w.profit >= 0 ? 'pos' : 'neg'}">${wmMoney(w.profit)}</b></div>
            <div><small>Rankings</small><b>${ordinal(leaguePosition())}</b></div>
        </div>
        <p class="small muted">Wages ${wmMoney(L.wages)} · Upkeep ${wmMoney(L.maintenance)} · Incidents ${L.incidents} (${L.serious} serious)</p>
        <h4>Head office confidence ${b.delta >= 0 ? '▲' : '▼'} ${b.delta >= 0 ? '+' : ''}${b.delta} → <b>${b.confidence}%</b></h4>
        ${part('Volume vs target', b.volScore)}${part('Safety', b.safetyScore)}${part('Profit', b.profitScore)}${part('Staff morale', b.moraleScore)}${part('Rankings position', b.leagueScore)}
        <i class="bar big"><i style="width:${b.confidence}%;background:${b.confidence > 55 ? '#22c55e' : b.confidence > 30 ? '#facc15' : '#ef4444'}"></i></i>
        ${b.confidence < 25 ? '<p class="neg"><b>⚠️ Head office is considering your position.</b></p>' : ''}
        <div class="btnrow"><button class="primary" data-act="continueFlow">Continue ▶</button></div>`, true);
    playSfx(b.delta >= 0 ? 'saved' : 'flowDown', .7);
}

function showSeasonEnd(s, skipScene = false)
{
    if (s.sacked) { career.board.sacked = true; saveCareer(); return showGameOver(s); }
    if (!skipScene && (s.promoted || s.position === 1)) return sceneTrophy(s.position === 1 ? 'champion' : 'promotion', s, ()=> showSeasonEnd(s, true));
    openModal(`
        <h2>🏁 Year ${s.season} complete</h2>
        <p class="bigline">You finished <b>${ordinal(s.position)}</b> of 8.</p>
        ${s.promoted ? `<p class="pos"><b>🏆 STEPPING UP to ${esc(tierDef().name)}!</b> Bigger volumes, bigger contracts, tougher head office.</p>` : ''}
        <div class="tablewrap"><table class="league">${s.table.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td><i class="sw" style="background:${r.hex}"></i>${esc(r.name)}</td><td><b>${r.points}</b></td></tr>`).join('')}</table></div>
        <p class="small muted">Staff are a year older. The jobs board has refreshed for induction week.</p>
        <div class="btnrow"><button class="primary" data-act="continueFlow">Start year ${career.season} ▶</button></div>`, true);
    playSfx('fanfare', 1);
    particleEffect('confetti', cameraPos.add(vec2(0, 6)), { scale:4 });
}

function showGameOver(s)
{
    closeModal();
    if (!career.flags.sackScene) { career.flags.sackScene = true; setMode('gameover'); $('#screen').innerHTML = ''; return sceneSacked(()=> showGameOver(s)); }
    if (!career.flags.bankrupt && !career.flags.offeredAfterSack)
    {
        career.flags.offeredAfterSack = true;
        generateOffers('sacked');
        if (career.offers.length) { setMode('gameover'); $('#screen').innerHTML = ''; return showOffersModal('sacked'); }
    }
    setMode('gameover');
    $('#screen').innerHTML = `
    <div class="title">
        <div class="logo"><span>${career.flags.bankrupt ? '🏦' : '📉'}</span><h1>${career.flags.bankrupt ? 'BANKRUPT' : 'P45'}</h1><p>${career.flags.bankrupt ? `The bank has foreclosed on ${esc(career.company)}.` : `Head office of ${esc(career.company)} has relieved you of your duties.`}</p></div>
        <div class="card titleCard">
            <p>Year ${career.season}, week ${Math.min(career.week, SEASON_WEEKS)} · Head office confidence ${career.board.confidence}%</p>
            <p>Career totals: ${career.records.totalUnits.toLocaleString()} units over ${career.records.shiftsPlayed} shifts · ${career.manager.trophies.length} awards · ${career.records.fatalities} fatalities.</p>
            <button class="big primary" data-act="restart">Start a new career</button>
        </div>
    </div>`;
    playSfx('ominous', 1);
}

// ---------------------------------------------------------------------------
// Milestone cinematics
function showCinematic(m)
{
    const d = MILESTONE_DEFS[m.key];
    const el = $('#cine');
    el.innerHTML = `<div class="cineBox" data-act="continueFlow"><div class="cineIcon">${d.icon}</div><h1>${esc(d.title)}</h1>${m.detail ? `<p>${esc(m.detail)}</p>` : ''}<small>tap to continue</small></div>`;
    el.classList.remove('hidden');
    el.classList.remove('play'); void el.offsetWidth; el.classList.add('play');
    playSfx('fanfare', 1);
    setTimeout(()=> playSfx('flowUp', .7, 1.2), 350);
    particleEffect('confetti', cameraPos.add(vec2(-6, 6)), { scale:3 });
    particleEffect('confetti', cameraPos.add(vec2(6, 6)), { scale:3 });
}

// ---------------------------------------------------------------------------
// Modal
function openModal(html, blocking = false)
{
    const m = $('#modal');
    m.innerHTML = `<div class="mbox">${blocking ? '' : '<button class="x mclose" data-act="closeModal">✕</button>'}${html}</div>`;
    m.classList.remove('hidden');
    m.dataset.blocking = blocking ? 1 : 0;
}
function closeModal()
{
    const m = $('#modal');
    if (!m) return;
    m.classList.add('hidden');
    m.innerHTML = '';
    $('#cine').classList.add('hidden');
}
function flash(msg, ok = true)
{
    const el = document.getElementById('sdMsg');
    if (el) { el.innerHTML = esc(msg); el.className = 'small ' + (ok ? 'pos' : 'neg'); }
    else hudToast(msg, ok ? '#22c55e' : '#ef4444');
}

// ---------------------------------------------------------------------------
// Event handling
function refreshHubKeepModal() { if (wmMode === 'hub') { const b = document.getElementById('tabBody'); if (b) b.innerHTML = renderTab(wmTab); const top = document.querySelector('.top .kpis'); if (top) showHubHeaderOnly(); } }
function showHubHeaderOnly()
{
    const k = document.querySelector('.top .kpis b');
    if (k) { k.textContent = wmMoney(career.cash); k.className = career.cash < 0 ? 'neg' : ''; }
}

function onUiClick(e)
{
    const a = e.target.closest('[data-act]');
    if (!a) { if (e.target.id === 'modal' && $('#modal').dataset.blocking !== '1') closeModal(); return; }
    const act = a.dataset.act;
    const id = +a.dataset.id;
    if (act !== 'pause' && act !== 'speed') playSfx('tick', 1.5, 1, .03);
    switch (act)
    {
        case 'newCareer':
        {
            const n = $('#inName').value.trim(), co = $('#inCo').value.trim();
            newCareer(n, co, wmTitleLook, wmTitleHex); saveCareer(); showHub('overview');
            playStory('intro', ()=> { saveCareer(); showHub('overview'); hudToast(`Welcome, ${n || 'Manager'}! Plan your first shift.`, '#38bdf8'); });
            break;
        }
        case 'continue': if (loadCareer()) showHub('overview'); break;
        case 'restart': deleteSave(); career = null; showTitle(); break;
        case 'tab': showHub(a.dataset.tab); window.scrollTo(0, 0); $('#screen').scrollTop = 0; break;
        case 'hub': closeModal(); showHub(); break;
        case 'preshift': closeModal(); showPreshift(); break;
        case 'lastReport': if (career.lastReport) showReport(career.lastReport, true); break;
        case 'staff': { const s = findAnyStaff(id); if (s) staffDetail(s); break; }
        case 'market': { const s = findAnyStaff(id); if (s) staffDetail(s, true); break; }
        case 'mtab': wmMarketTab = a.dataset.k; showHub('transfers'); break;
        case 'talk': { const s = findAnyStaff(id); const r = staffTalk(s, a.dataset.k); flash(r.text, (r.dm ?? 0) >= 0); saveCareer(); break; }
        case 'release':
        {
            const s = findAnyStaff(id);
            if (a.dataset.confirm) { const err = releaseStaff(s); if (err) flash(err, false); else { closeModal(); saveCareer(); showHub(); } }
            else { a.dataset.confirm = 1; a.textContent = `Confirm release — pay ${wmMoney(releaseCost(s))}`; }
            break;
        }
        case 'contractDlg': contractDialog(findAnyStaff(id), false); break;
        case 'signDlg': contractDialog(findAnyStaff(id), true); break;
        case 'len': $('#modal').dataset.len = a.dataset.w; document.querySelectorAll('#lenSeg button').forEach(b => b.classList.toggle('on', b === a)); updateChance(); break;
        case 'doRenew':
        {
            const s = findAnyStaff(id); const r = offerContract(s, +$('#wageIn').value, +$('#modal').dataset.len);
            flash(r.text, r.ok); playSfx(r.ok ? 'saved' : 'buzz'); saveCareer();
            if (r.ok) { a.disabled = true; setTimeout(()=> { closeModal(); refreshHubKeepModal(); }, 900); }
            break;
        }
        case 'doSign':
        {
            const s = findAnyStaff(id); const r = signStaff(s, +$('#wageIn').value, +$('#modal').dataset.len);
            flash(r.text, r.ok); playSfx(r.ok ? 'fanfare' : 'buzz', .7); saveCareer();
            if (r.ok) { a.disabled = true; setTimeout(()=> { closeModal(); showHub('transfers'); }, 1000); }
            break;
        }
        case 'scout': { const s = findAnyStaff(id); const err = scoutStaff(s); if (err) flash(err, false); else { staffDetail(s, true); refreshHubKeepModal(); saveCareer(); } break; }
        case 'upgrade':
        {
            const err = buyFacility(a.dataset.k);
            if (err) hudToast(err, '#ef4444');
            else
            {
                saveCareer(); showHub('facilities');
                const m = career.pendingMilestones.pop();
                if (m) showCinematic(m);
            }
            break;
        }
        case 'decide':
        {
            const m = career.inbox.find(x => x.id === +a.dataset.mid);
            if (m) { const out = resolveDecision(m, a.dataset.aid); hudToast(out, '#38bdf8'); saveCareer(); showHub(); const pm = career.pendingMilestones.pop(); if (pm) showCinematic(pm); }
            break;
        }
        case 'settings':
            openModal(`<h2>⚙️ Settings</h2>
                <label class="row"><input type="checkbox" id="optSound" ${wmSettings.sound ? 'checked' : ''}> Sound effects</label>
                <p class="small muted">Your career saves automatically after every shift and decision.</p>
                <div class="btnrow"><button data-act="legal">About &amp; legal</button><button class="danger" data-act="abandon">Abandon career</button><button data-act="closeModal">Close</button></div>`);
            break;
        case 'abandon':
            if (a.dataset.confirm) { deleteSave(); career = null; closeModal(); showTitle(); }
            else { a.dataset.confirm = 1; a.textContent = 'Really delete your save?'; }
            break;
        case 'closeModal': closeModal(); break;
        case 'autoLineup': autoLineup(); saveCareer(); showPreshift(); break;
        case 'lineDefault': career.defaultLineSpeed = a.dataset.k; showPreshift(); break;
        case 'startShift': startShift(); break;
        case 'simulate': trySimulate(); break;
        case 'simulateNow': simulateShift(); break;
        case 'continueFlow': continueFlow(); break;
        // HUD
        case 'pause': shiftView.paused = !shiftView.paused; playSfx('tick'); break;
        case 'speed':
            shiftView.speed = +a.dataset.s; shiftView.paused = false;
            document.querySelectorAll('[data-act=speed]').forEach(b => b.classList.toggle('on', b === a));
            break;
        case 'line':
            wmSim.setLineSpeed(a.dataset.k);
            document.querySelectorAll('[data-act=line]').forEach(b => b.classList.toggle('on', b === a));
            shiftView.bubble(`Line: ${LINE_SPEEDS[a.dataset.k].label}`, shiftView.bounds.center, a.dataset.k === 'push' ? '#f97316' : a.dataset.k === 'slow' ? '#4ade80' : '#e2e8f0', .7, 1.4);
            break;
        case 'overtime': if (wmSim.callOvertime()) playSfx('horn'); break;
        case 'assistant':
            wmSim.assistantOn = !wmSim.assistantOn;
            hudToast(wmSim.assistantOn ? `🤖 ${career.assistant.name} is managing the floor` : '🧑‍💼 You have control', '#a5b4fc');
            break;
        case 'simRest':
            if (a.dataset.confirm) { wmSim.assistantOn = true; wmSim.simulated = true; wmSim.assistantQ = career.assistant.quality * .8; wmSim.runToEnd(); }
            else { a.dataset.confirm = 1; a.textContent = '⏩ Sure? Tap again'; setTimeout(()=> { a.dataset.confirm = ''; a.textContent = '⏩ Finish'; }, 2500); }
            break;
        case 'deselect': shiftView.select(null); break;
        case 'wBreak': wmSim.moveWorker(id, 'bench'); playSfx('drop'); hudWorkerCard(wmSim.worker(id)); break;
        case 'wBest': { const w = wmSim.worker(id); if (w) { wmSim.moveWorker(id, bestZone(w.s)); playSfx('drop'); hudWorkerCard(w); } break; }
        default: if (WM_ACTIONS[act]) WM_ACTIONS[act](a, e);
    }
}
function onUiChange(e)
{
    const t = e.target;
    if (t.id === 'optSound') { wmSettings.sound = t.checked; saveSettings(); return; }
    if (t.id === 'staffSort') { wmStaffSort = t.value; showHub('staff'); return; }
    if (t.dataset.lineup) { career.lineup[+t.dataset.lineup] = t.value; saveCareer(); showPreshift(); return; }
    if (t.dataset.train) { const s = findAnyStaff(+t.dataset.train); s.training = t.value; saveCareer(); return; }
    if (t.dataset.course && t.value)
    {
        const s = findAnyStaff(+t.dataset.course);
        const err = startCourse(s, t.value);
        if (err) { hudToast(err, '#ef4444'); t.value = ''; } else { hudToast(`${s.name} enrolled on ${CERT_DEFS[t.value].label}`, '#22c55e'); saveCareer(); showHub('training'); }
    }
}
function onUiInput(e) { if (e.target.id === 'wageIn') updateChance(); if (WM_CHANGE[e.target.id]) WM_CHANGE[e.target.id](e.target); }
function onUiKey(e)
{
    if (wmMode !== 'shift' || !wmSim) return;
    if (e.code === 'Space') { if (waveView.active) { waveView.paused = !waveView.paused; wvHudUpdate(true); } else shiftView.paused = !shiftView.paused; e.preventDefault(); }
    if (e.key === '1' || e.key === '2' || e.key === '4') { shiftView.speed = +e.key; document.querySelectorAll('[data-act=speed]').forEach(b => b.classList.toggle('on', b.dataset.s === e.key)); }
}
