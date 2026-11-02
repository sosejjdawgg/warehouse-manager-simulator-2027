'use strict';
// ============================================================================
// Legacy UI: homegrown academy & creator, staff customiser, manager career
// (job offers, founding your own warehouse, hall of fame, memorial) and the
// "days without accident" board.
// ============================================================================

const WM_ACTIONS = {};   // extra click handlers: data-act -> fn(el, event)
const WM_CHANGE = {};    // extra change/input handlers: element id prefix -> fn(el)
let wmDraft = null;      // recruit being created
let wmTitleLook = null;  // manager look on the title screen
let wmTitleHex = '#38bdf8';
const COMPANY_HEXES = ['#38bdf8', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#eab308', '#0d9488', '#1e293b'];

function staffAva(s, size = 44, mood = 'neutral')
{
    const z = career?.lineup?.[s.id];
    const vest = z && z !== 'bench' ? ZONE_DEFS[z].hex : ZONE_DEFS[bestZone(s)].hex;
    return `<span class="avaWrap${s.homegrown ? ' hg' : ''}">${avatarSvg(s.look, { size, mood: s.injury ? 'sad' : mood, vest })}${s.homegrown ? '<i class="hgBadge" title="Homegrown">🌱</i>' : ''}</span>`;
}

// ---------------------------------------------------------------------------
// Days-without-accident board
function safetyBoardHtml(days, best, small = false)
{
    const digits = String(days).padStart(2, '0').split('');
    return `<div class="safeBoard${small ? ' small' : ''}" id="${small ? 'hubSafe' : 'hudSafeBoard'}">
        <div class="sbTitle">⛑️ DAYS WITHOUT<br>AN ACCIDENT</div>
        <div class="sbDigits">${digits.map(d => `<span>${d}</span>`).join('')}</div>
        ${small ? `<div class="sbBest">best ${best}</div>` : ''}
    </div>`;
}
function hudAccident()
{
    const el = document.getElementById('hudSafeBoard');
    if (!el) return;
    el.querySelector('.sbDigits').innerHTML = '<span>0</span><span>0</span>';
    el.classList.remove('reset'); void el.offsetWidth; el.classList.add('reset');
}

// ---------------------------------------------------------------------------
// Look picker (shared by the recruit creator, staff customiser, title screen)
function lookPickerHtml(look, prefix)
{
    const row = (label, key, list, swatch)=> `<div class="lpRow"><span>${label}</span><div class="lpOpts">${list.map((v, i)=> `<button class="lpOpt${look[key] === i ? ' on' : ''}" data-act="lookSet" data-p="${prefix}" data-k="${key}" data-v="${i}" ${swatch ? `style="background:${v}"` : ''}>${swatch ? '' : esc(v)}</button>`).join('')}</div></div>`;
    return `<div class="lookPicker">
        ${row('Skin', 'skin', LOOK_SKIN, true)}
        ${row('Hair', 'hair', LOOK_HAIR, true)}
        ${row('Style', 'style', LOOK_STYLES, false)}
        ${row('Hard hat', 'hat', LOOK_HAT, true)}
        ${row('Extra', 'acc', LOOK_ACCS, false)}
    </div>`;
}
function lookTarget(prefix)
{
    if (prefix === 'title') return wmTitleLook;
    if (prefix === 'draft') return wmDraft?.look;
    if (prefix === 'mgr') return career.manager.look;
    const s = findAnyStaff(+prefix.slice(2));
    return s?.look;
}
WM_ACTIONS.lookSet = (a)=>
{
    const look = lookTarget(a.dataset.p);
    if (!look) return;
    look[a.dataset.k] = +a.dataset.v;
    a.parentElement.querySelectorAll('.lpOpt').forEach(b => b.classList.toggle('on', b === a));
    refreshPreview(a.dataset.p);
};
WM_ACTIONS.lookRandom = (a)=>
{
    const look = lookTarget(a.dataset.p);
    Object.assign(look, randomLook());
    if (a.dataset.p === 'title') showTitle();
    else if (a.dataset.p === 'draft') recruitCreator(true);
    else if (a.dataset.p === 'mgr') customiseManager();
    else customiseDialog(findAnyStaff(+a.dataset.p.slice(2)));
};
function refreshPreview(prefix)
{
    const el = document.getElementById('preview_' + prefix);
    const look = lookTarget(prefix);
    if (!el || !look) return;
    const vest = prefix === 'draft' ? ZONE_DEFS[ARCHETYPES[wmDraft.archetype].zone].hex : prefix === 'title' || prefix === 'mgr' ? '#38bdf8' : '#ff8a1f';
    el.innerHTML = avatarSvg(look, { size:150, mood:'happy', vest });
    el.classList.remove('boing'); void el.offsetWidth; el.classList.add('boing');
    playSfx('pick', .8, 1 + Math.random() * .3);
}

// ---------------------------------------------------------------------------
// Title screen manager customisation
function titleExtrasHtml()
{
    wmTitleLook ??= randomLook();
    return `
        <div class="titleMgr">
            <div class="preview" id="preview_title">${avatarSvg(wmTitleLook, { size:150, mood:'happy', vest:'#38bdf8' })}</div>
            <div>
                <div class="lpRow"><span>Company colour</span><div class="lpOpts">${COMPANY_HEXES.map(h => `<button class="lpOpt${wmTitleHex === h ? ' on' : ''}" style="background:${h}" data-act="titleHex" data-h="${h}"></button>`).join('')}</div></div>
                <details><summary>🎨 Customise your manager</summary>${lookPickerHtml(wmTitleLook, 'title')}<button class="ghost" data-act="lookRandom" data-p="title">🎲 Randomise</button></details>
            </div>
        </div>`;
}
WM_ACTIONS.titleHex = (a)=> { wmTitleHex = a.dataset.h; a.parentElement.querySelectorAll('.lpOpt').forEach(b => b.classList.toggle('on', b === a)); };

// ---------------------------------------------------------------------------
// Academy
function renderAcademy()
{
    const c = career;
    const kids = c.staff.filter(s => s.homegrown);
    const alumni = c.hallOfFame.filter(h => h.kind === 'hero');
    const share = homegrownShare();
    const free = c.flags.freeRecruit;
    return `<div class="grid">
        <section class="card hero academyHero">
            <h3>🌱 The Academy</h3>
            <p>Hire raw recruits off the street, name them, style them, and train them into legends. Homegrown staff develop <b>35% faster</b>, stay loyal, and follow you to new jobs.</p>
            <div class="mini4">
                <div><small>Places</small><b>${academyCount()}/${academySlots()}</b></div>
                <div><small>Homegrown on floor</small><b class="${share >= HOMEGROWN_BOND_SHARE ? 'pos' : ''}">${Math.round(share * 100)}%</b></div>
                <div><small>Debuts</small><b>${c.records.homegrownDebuts}</b></div>
                <div><small>Legends</small><b>${alumni.length}</b></div>
            </div>
            <p class="small">${share >= HOMEGROWN_BOND_SHARE ? '🤝 <b class="pos">Homegrown Bond ACTIVE</b>: +4% speed and −10% accident risk while half the floor is academy-raised.' : `🤝 Field ${Math.round(HOMEGROWN_BOND_SHARE * 100)}%+ homegrown staff to unlock the <b>Homegrown Bond</b> (+4% speed, −10% risk).`}</p>
            <div class="btnrow"><button class="primary big" data-act="recruitNew" ${academyCount() >= academySlots() ? 'disabled' : ''}>✚ Recruit new talent · ${free ? 'FREE' : wmMoney(recruitCost())}</button></div>
            <p class="tiny muted">More places with each Training Centre level. Better Training Centre = higher ceilings.</p>
        </section>
        <section class="card"><h3>Your academy class</h3>
            ${kids.length ? `<div class="kidGrid">${kids.map(s =>
            {
                const bz = bestZone(s), pot = s.hidden.potential, ab = staffAbility(s);
                return `<button class="kid" data-act="staff" data-id="${s.id}">
                    ${staffAva(s, 64, 'happy')}
                    <b>${esc(displayName(s))}</b>
                    <small>${s.age} · ${ARCHETYPES[s.archetype]?.icon || '🌱'} ${ARCHETYPES[s.archetype]?.label || 'Homegrown'}</small>
                    <span>${zonePill(bz)}</span>${starsHtml(zoneRating(s, bz))}
                    <i class="growth"><i style="width:${clamp(ab / pot, 0, 1) * 100}%"></i></i>
                    <small class="muted">${ab >= pot - .3 ? 'Fully developed' : 'Growing… potential ' + '★'.repeat(Math.round(starsFor(pot + 2)))}</small>
                </button>`;
            }).join('')}</div>` : '<p class="muted">No recruits yet. Every legend starts somewhere.</p>'}
        </section>
        ${c.hallOfFame.length ? `<section class="card"><h3>🏛️ Hall of Fame</h3><div class="kidGrid">${c.hallOfFame.map(h => `<div class="kid">${avatarSvg(h.look, { size:56, mood:'happy', vest:'#ffd23f' })}<b>${esc(h.name)}</b><small>${esc(h.note)}</small></div>`).join('')}</div></section>` : ''}
    </div>`;
}
WM_ACTIONS.recruitNew = ()=> { wmDraft = draftRecruit('speedster'); wmDraft.name = wmPick(FIRST_NAMES) + ' ' + wmPick(LAST_NAMES); recruitCreator(); };
function recruitCreator(keep = false)
{
    const d = wmDraft;
    const [first, ...rest] = d.name.split(' ');
    const free = career.flags.freeRecruit;
    openModal(`
        <h2>🌱 Create a recruit</h2>
        <div class="creator">
            <div class="preview big" id="preview_draft">${avatarSvg(d.look, { size:150, mood:'happy', vest:ZONE_DEFS[ARCHETYPES[d.archetype].zone].hex })}</div>
            <div>
                <div class="nameRow"><label>First name<input id="dFirst" maxlength="14" value="${esc(first)}"></label><label>Surname<input id="dLast" maxlength="16" value="${esc(rest.join(' '))}"></label></div>
                <label>Nickname (optional)<input id="dNick" maxlength="14" value="${esc(d.nickname || '')}" placeholder="e.g. Rocket"></label>
                <label>Age <input type="range" id="dAge" min="16" max="22" value="${d.age}"><b id="dAgeV">${d.age}</b></label>
            </div>
        </div>
        <h4>Archetype</h4>
        <div class="archGrid">${Object.entries(ARCHETYPES).map(([k, a]) => `<button class="arch${d.archetype === k ? ' on' : ''}" data-act="archSet" data-k="${k}"><span>${a.icon}</span><b>${a.label}</b><small>${a.desc}</small></button>`).join('')}</div>
        <h4>Look</h4>
        ${lookPickerHtml(d.look, 'draft')}
        <div class="btnrow"><button class="ghost" data-act="lookRandom" data-p="draft">🎲 Random look</button></div>
        <p class="small muted">Starts raw (≈${staffAbility(d).toFixed(0)}/20) on ${wmMoney(d.wage)}/wk. Hidden potential is revealed as they grow — a good Training Centre raises the ceiling.</p>
        <div class="btnrow"><button class="primary big" data-act="recruitSign">✍️ Sign ${free ? '(free!)' : '· ' + wmMoney(recruitCost())}</button><button data-act="closeModal">Cancel</button></div>
        <div id="sdMsg"></div>`);
}
WM_ACTIONS.archSet = (a)=>
{
    const look = wmDraft.look, name = wmDraft.name, nick = wmDraft.nickname, age = wmDraft.age;
    const n = draftRecruit(a.dataset.k);
    n.look = look; n.name = name; n.nickname = nick; n.age = age;
    wmDraft = n;
    recruitCreator();
};
WM_ACTIONS.recruitSign = ()=>
{
    const d = wmDraft;
    d.name = (($('#dFirst').value.trim() || 'Sam') + ' ' + ($('#dLast').value.trim() || 'Rookie')).trim();
    d.nickname = $('#dNick').value.trim();
    d.age = +$('#dAge').value;
    let err;
    if (career.flags.freeRecruit) { career.cash += recruitCost(); career.weekLedger.other -= recruitCost(); career.flags.freeRecruit = false; }
    err = signRecruit(d);
    if (err) { flash(err, false); return; }
    playSfx('fanfare', .9);
    saveCareer();
    closeModal();
    showHub('academy');
    showCinematicOnce({ key:'homegrownDebut', detail:`${displayName(d)} signs for the academy!` }, '✍️', 'Welcome to the crew!');
};
WM_CHANGE.dAge = (el)=> { const v = document.getElementById('dAgeV'); if (v) v.textContent = el.value; };

function showCinematicOnce(m, icon, title)
{
    const el = $('#cine');
    el.innerHTML = `<div class="cineBox" data-act="cineClose"><div class="cineIcon">${icon}</div><h1>${esc(title)}</h1><p>${esc(m.detail)}</p><small>tap to continue</small></div>`;
    el.classList.remove('hidden', 'play'); void el.offsetWidth; el.classList.add('play');
    particleEffect('confetti', cameraPos.add(vec2(0, 6)), { scale:3 });
}
WM_ACTIONS.cineClose = ()=> $('#cine').classList.add('hidden');

// ---------------------------------------------------------------------------
// Customise any of your own staff
function customiseDialog(s)
{
    if (!s) return;
    openModal(`
        <h2>🎨 Customise ${esc(s.name)}</h2>
        <div class="creator">
            <div class="preview big" id="preview_s_${s.id}">${avatarSvg(s.look, { size:150, mood:'happy' })}</div>
            <div>
                <label>Nickname<input id="cNick" data-sid="${s.id}" maxlength="14" value="${esc(s.nickname || '')}" placeholder="e.g. The Wall"></label>
                <p class="small muted">Nicknames show above their head on the floor.</p>
            </div>
        </div>
        ${lookPickerHtml(s.look, 's_' + s.id)}
        <div class="btnrow"><button class="ghost" data-act="lookRandom" data-p="s_${s.id}">🎲 Random</button><button class="primary" data-act="custDone" data-id="${s.id}">Done</button></div>`);
}
WM_ACTIONS.customise = (a)=> customiseDialog(findAnyStaff(+a.dataset.id));
WM_ACTIONS.custDone = (a)=>
{
    const s = findAnyStaff(+a.dataset.id);
    const n = document.getElementById('cNick');
    if (s && n) s.nickname = n.value.trim();
    saveCareer();
    closeModal();
    refreshHubKeepModal();
};
function customiseManager()
{
    openModal(`<h2>🎨 Your look</h2>
        <div class="creator"><div class="preview big" id="preview_mgr">${avatarSvg(career.manager.look, { size:150, mood:'happy', vest:'#38bdf8' })}</div></div>
        ${lookPickerHtml(career.manager.look, 'mgr')}
        <div class="btnrow"><button class="ghost" data-act="lookRandom" data-p="mgr">🎲 Random</button><button class="primary" data-act="custMgrDone">Done</button></div>`);
}
WM_ACTIONS.custMgr = ()=> customiseManager();
WM_ACTIONS.custMgrDone = ()=> { saveCareer(); closeModal(); showHub('career'); };

// ---------------------------------------------------------------------------
// Manager career screen
function renderCareer()
{
    const c = career, m = c.manager;
    const offers = c.offers || [];
    return `<div class="grid">
        <section class="card hero mgrCard">
            <div class="mgrTop">
                <button class="preview linkish" data-act="custMgr" title="Customise">${avatarSvg(m.look, { size:110, mood:'happy', vest:c.companyHex })}</button>
                <div>
                    <h2>${esc(m.name)}</h2>
                    <p>${m.owner ? '👑 Owner & Manager' : 'Warehouse Manager'} of <b style="color:${c.companyHex}">${esc(c.company)}</b> · ${tierDef().name}</p>
                    <div class="repBar"><small>Reputation</small><i class="bar big"><i style="width:${m.rep}%;background:linear-gradient(90deg,#ffd23f,#ff7b39)"></i></i><b>${m.rep}/100</b></div>
                </div>
            </div>
            <div class="mini4">
                <div><small>Your wallet</small><b>${wmMoney(m.wallet)}</b></div>
                <div><small>${m.owner ? 'Income' : 'Salary'}</small><b>${m.owner ? 'Dividends' : wmMoney(managerSalary()) + '/wk'}</b></div>
                <div><small>Seasons</small><b>${c.season}</b></div>
                <div><small>Trophies</small><b>${m.trophies.length}</b></div>
            </div>
            <p class="small muted">Excel and the industry notices: high reputation brings job offers from bigger companies at the end of each season. Save ${wmMoney(OWN_COMPANY_COST)} and you can found your own warehouse.</p>
            ${!m.owner ? `<div class="btnrow"><button class="${canFoundCompany() ? 'primary big' : ''}" data-act="foundDlg" ${canFoundCompany() ? '' : 'disabled'}>🏗️ Found your own warehouse ${canFoundCompany() ? '' : `(${wmMoney(OWN_COMPANY_COST - m.wallet)} to go)`}</button></div>` : ''}
        </section>
        ${offers.length ? `<section class="card warnCard"><h3>💼 Job offers on the table</h3>${offers.map(offerCard).join('')}</section>` : ''}
        <section class="card"><h3>🏆 Trophy cabinet</h3>${m.trophies.length ? m.trophies.map(t => `<p class="trophy">🏆 ${esc(t)}</p>`).join('') : '<p class="muted">Empty… for now.</p>'}</section>
        <section class="card"><h3>📜 Career history</h3>
            ${[...m.history, { company:c.company, tier:c.tier, seasons:(c.flags.stintSeasons || 0) + 1, owner:m.owner, current:true }].map(h => `<p>${h.owner ? '👑' : '💼'} <b>${esc(h.company)}</b> · ${TIER_DEFS[h.tier].name} · ${h.seasons} season${h.seasons > 1 ? 's' : ''}${h.current ? ' <em class="pos">(current)</em>' : ''}</p>`).join('')}
        </section>
        <section class="card memorial"><h3>🕯️ Memorial wall</h3>
            ${c.memorial.length ? c.memorial.map(x => `<div class="mem">${avatarSvg(x.look, { size:48, mood:'neutral', vest:'#64748b' })}<div><b>${esc(x.name)}</b><small>${x.age} · ${esc(x.company)} · S${x.season} W${x.week}${x.homegrown ? ' · 🌱 academy' : ''}</small><small>${esc(x.cause)}</small></div></div>`).join('') : '<p class="muted">No one has died under your management. Keep it that way.</p>'}
            <p class="small">Fatalities: <b>${c.records.fatalities}</b> · Best accident-free run: <b>${c.records.bestSafeRun}</b> shifts</p>
        </section>
    </div>`;
}
function offerCard(o)
{
    return `<div class="offer" style="--oc:${o.hex}">
        <div><b>${esc(o.name)}</b><small>${TIER_DEFS[o.tier].name} · ${esc(o.pitch)}</small></div>
        <div class="small">Salary <b>${wmMoney(o.salary)}/wk</b> · Budget ${wmMoney(o.budget)} · Facilities L${o.facLevel}</div>
        <button class="primary" data-act="offerTake" data-o="${o.id}">Accept</button>
    </div>`;
}
WM_ACTIONS.offerTake = (a)=> followersDialog('offer', +a.dataset.o);
WM_ACTIONS.foundDlg = ()=>
{
    openModal(`<h2>🏗️ Found your own warehouse</h2>
        <p>You'll invest your entire wallet (<b>${wmMoney(career.manager.wallet)}</b>) and start again at the bottom with a Regional Depot — but it's <b>yours</b>. No board can sack you; only the bank can shut you down. Profits pay you dividends.</p>
        <label>Company name<input id="fName" maxlength="28" value="${esc(career.manager.name.split(' ')[0])}'s Logistics"></label>
        <div class="lpRow"><span>Colours</span><div class="lpOpts">${COMPANY_HEXES.map(h => `<button class="lpOpt${wmTitleHex === h ? ' on' : ''}" style="background:${h}" data-act="titleHex" data-h="${h}"></button>`).join('')}</div></div>
        <div class="btnrow"><button class="primary" data-act="foundNext">Choose who comes with you ▶</button></div>`);
};
WM_ACTIONS.foundNext = ()=> { const n = $('#fName').value.trim() || 'My Logistics'; followersDialog('found', 0, n); };
function followersDialog(kind, offerId, name = '')
{
    const cands = followerCandidates();
    const max = maxFollowers();
    openModal(`<h2>🚚 Who's coming with you?</h2>
        <p>Homegrown, loyal or happy staff will follow you. Pick up to <b>${max}</b>. Everyone else stays behind.</p>
        <div class="kidGrid">${cands.map(s => `<label class="kid pick"><input type="checkbox" class="fol" value="${s.id}" ${s.homegrown ? 'checked' : ''}>${staffAva(s, 52, 'happy')}<b>${esc(displayName(s))}</b><small>${ZONE_DEFS[bestZone(s)].icon} ${'★'.repeat(Math.round(starsFor(zoneRating(s, bestZone(s)))))}</small></label>`).join('') || '<p class="muted">Nobody is close enough to follow you.</p>'}</div>
        <div class="btnrow"><button class="primary big" data-act="moveGo" data-kind="${kind}" data-o="${offerId}" data-name="${esc(name)}">Let's go!</button><button data-act="closeModal">Cancel</button></div>
        <div id="sdMsg"></div>`);
}
WM_ACTIONS.moveGo = (a)=>
{
    const ids = [...document.querySelectorAll('.fol:checked')].map(x => +x.value);
    if (ids.length > maxFollowers()) { flash(`Pick at most ${maxFollowers()}.`, false); return; }
    const newSeason = !!career.board.sacked;
    if (a.dataset.kind === 'found') foundCompany(a.dataset.name, wmTitleHex, ids);
    else
    {
        const o = career.offers.find(x => x.id === +a.dataset.o);
        if (!o) return;
        acceptOffer(o, ids, newSeason);
    }
    career.board.sacked = false;
    saveCareer();
    closeModal();
    wmPendingFlow = career.pendingMilestones.map(m => ({ kind:'cine', m }));
    career.pendingMilestones = [];
    continueFlow();
};
WM_ACTIONS.offersDecline = ()=> { career.offers = []; career.manager.rep = clamp(career.manager.rep + 1, 0, 100); if (!career.manager.owner) career.board.confidence = clamp(career.board.confidence + 6, 0, 100); saveCareer(); continueFlow(); };

function showOffersModal(reason)
{
    const offers = career.offers || [];
    if (!offers.length) return continueFlow();
    openModal(`
        <div class="offerHead">${avatarSvg(castLook('holt'), { size:90, mood:'happy', vest:CAST.holt.vest, hat:false })}
        <div><h2>💼 ${reason === 'sacked' ? 'Down, but not out' : 'Your phone is ringing'}</h2>
        <p>${reason === 'sacked' ? `Dana Holt, head-hunter: "Bad luck at ${esc(career.company)}. But I've still got people who want you."` : `Dana Holt, head-hunter: "Your season didn't go unnoticed. These companies want you."`}</p></div></div>
        ${offers.map(offerCard).join('')}
        <div class="btnrow">${reason === 'sacked' ? '<button class="danger" data-act="restart">Retire (new career)</button>' : `<button data-act="offersDecline">Stay loyal to ${esc(career.company)} (board +6)</button>`}</div>`, true);
    playSfx('perfect', .8);
}
