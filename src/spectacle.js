'use strict';
// ============================================================================
// Spectacle — the arcade showbiz layer.
//  - Announcer callouts: huge slammed lettering for big moments ("MAX FLOW!!")
//  - Big Barry: the tannoy announcer with an opinion on everything
//  - Worker barks: speech bubbles with personality (traits shape the voice)
//  - Parallax flyover cutscenes: shift intro "course card", shift-end grade,
//    promotion fireworks, new-chapter drive-in, rainy sacking
//  - Coach tips: Gus helps you through your first shifts
// ============================================================================

const pickOne = (a)=> a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------------------
// Big Barry, voice of the tannoy
const BARRY =
{
    intro:     ['Good morning, {co}! Coffee down, hard hats ON!', 'Rise and shine, legends! The trucks are already queuing!', 'Another day, another {target} units. Let\'s make it look easy!', 'Right then, people. Same rules as always: nobody dies, everything ships.'],
    introPeak: ['IT\'S PEAK SEASON! I can SEE the trucks from my window and they do NOT stop!', 'Peak week, people! Stretch those hamstrings!'],
    introRisky:['Crew looks a bit ropey today… eyes open, please. I mean it.', 'Safety first today, yeah? I don\'t want to fill in another form.'],
    introHg:   ['Half the floor came through the academy. Proud dad moment, this.', 'Homegrown heroes on the floor today! Show \'em how it\'s done!'],
    end: { S:['UNBELIEVABLE! Somebody frame that shift!', 'PERFECT! I\'m not crying, you\'re crying!'], A:['Cracking shift, everyone. Cracking!', 'That\'s how we do it at {co}!'],
           B:['Solid stuff. Not spectacular. But solid.', 'Job done. Go home, hug your sofa.'], C:['We got there… mostly.', 'Bit of a scrappy one, that.'],
           D:['Well. Tomorrow\'s another day.', 'I\'ve seen better shifts from a vending machine.'], F:['Let\'s… never speak of this shift again.', 'Oh dear. Oh dear oh dear.'] },
    fatal:     ['…Everyone, please. Gather by the dock.'],
};
const fillBarry = (s)=> s.replace('{co}', career.company).replace('{target}', fmtUnits(shiftForecast().target));

// ---------------------------------------------------------------------------
// Worker barks — trait-flavoured voices
const BARKS =
{
    moved:    ['On it!', 'Where to, boss?', 'Righto!', 'Moving!', 'Say no more!'],
    tired:    ['I need a brew…', 'My feet…', 'So… tired…', 'Is it home time?'],
    jaywalk:  ['I\'ll be quick!', 'YOLO!', 'Forklift schmorklift!', 'Gap! GO GO GO!'],
    wait:     ['C\'mon, c\'mon…', 'Any day now…', 'Beep beep, yourself!', 'Stupid forklifts…'],
    nearMiss: ['WHOA!', 'That was close!', 'My life flashed!', 'Nope nope nope!'],
    saved:    ['Thanks boss!', 'Phew!', 'You\'re a lifesaver!', 'Owe you one!'],
    perfect:  ['Smooth!', 'Nailed it!', 'Like butter!', 'Chef\'s kiss!', 'Easy peasy!'],
    breakTime:['Lunch!', 'Sandwich time!', 'Back in 15!', 'Brew o\'clock!'],
    jam:      ['It\'s piling up!', 'Help over here!', 'Too many boxes!', 'SOS!'],
    target:   ['WE DID IT!', 'Woohoo!', 'GET IN!', 'Champions!'],
    idle:     ['Anyone seen my scanner?', 'Who stacked this?', 'Smells like toast…', 'Did you see the match?', 'Box. Box. Box. Box.', 'I love tape.'],
    injury:   ['MEDIC!', 'Someone help!', 'Oh no!'],
    // trait overrides (key:trait)
    'moved:Speed Demon':   ['Out of my way!', 'ZOOM!', 'Already there!'],
    'moved:Professional':  ['Consider it done.', 'Understood.', 'On my way.'],
    'moved:Lazy':          ['Ugh… fine.', 'Do I have to?', 'Five more minutes…'],
    'moved:Disruptive':    ['Why me AGAIN?', 'This is a stitch-up.'],
    'idle:Lazy':           ['Is it break yet?', 'I\'m resting my eyes.', 'Lean on the racking, it\'s fine.'],
    'idle:Team Player':    ['Together we lift!', 'Need a hand?', 'Go team!'],
    'idle:Mentor':         ['Bend the knees, kid.', 'Label side out, always.'],
    'idle:Ambitious':      ['I\'ll be manager one day.', 'Watch and learn.'],
    'idle:Moody':          ['Leave me alone.', 'Everything is cardboard.'],
    'idle:Perfectionist':  ['That label is 2mm off.', 'Neat. Very neat.'],
    'idle:homegrown':      ['For the academy!', 'Learned that from the best!', 'Proud to be here!'],
    'jaywalk:Steady':      ['…I\'ll wait. Patience.'],
};
function barkLine(kind, s)
{
    for (const t of s.traits) if (BARKS[kind + ':' + t] && Math.random() < .7) return pickOne(BARKS[kind + ':' + t]);
    if (s.homegrown && BARKS[kind + ':homegrown'] && Math.random() < .5) return pickOne(BARKS[kind + ':homegrown']);
    return BARKS[kind] ? pickOne(BARKS[kind]) : null;
}

// ---------------------------------------------------------------------------
// Callouts (drawn on the canvas in screen space by shiftView.renderPost)
const CALLOUT_STYLES =
{
    gold:   { top:'#fff7b0', mid:'#ffd23f', bot:'#ff8a1f', stroke:'#2b2d42' },
    blue:   { top:'#e7fbff', mid:'#5fd1ff', bot:'#1e6fe0', stroke:'#1b1f3a' },
    green:  { top:'#f0ffd9', mid:'#7ee36b', bot:'#1f9e3a', stroke:'#123018' },
    red:    { top:'#ffe1e1', mid:'#ff5a5a', bot:'#b3121b', stroke:'#2a0a0e' },
    purple: { top:'#f6e8ff', mid:'#c38bff', bot:'#7a2fe0', stroke:'#22113d' },
    rainbow:{ rainbow:true, stroke:'#2b2d42' },
};
const wmCallouts = { queue:[], cur:null };
function callout(text, style = 'gold', opts = {})
{
    if (wmCallouts.queue.length > 3) wmCallouts.queue.shift();
    wmCallouts.queue.push({ text, style, sub:opts.sub || '', size:opts.size || 1, hold:opts.hold || 1.1, t:0 });
    if (opts.sting !== false) playSfx(style === 'red' ? 'ominous' : 'flowUp', style === 'red' ? .9 : .7, style === 'rainbow' ? 1.3 : 1.05);
}
function calloutUpdate(dt)
{
    if (!wmCallouts.cur && wmCallouts.queue.length) wmCallouts.cur = wmCallouts.queue.shift();
    const c = wmCallouts.cur;
    if (!c) return;
    c.t += dt;
    if (c.t > c.hold + .65) wmCallouts.cur = null;
}
function calloutDraw()
{
    const c = wmCallouts.cur;
    if (!c) return;
    const ctx = mainContext, S = mainCanvasSize, st = CALLOUT_STYLES[c.style];
    const tin = .28, tout = .3, t = c.t;
    let scale, alpha = 1, dx = 0;
    if (t < tin) { const p = t / tin; scale = 2.6 - 1.75 * p + Math.sin(p * Math.PI) * .25; alpha = Math.min(1, p * 2); }
    else if (t < tin + .12) scale = .85 + (t - tin) / .12 * .15;
    else if (t < c.hold + .35) scale = 1 + Math.sin((t - tin) * 6) * .012;
    else { const p = clamp((t - c.hold - .35) / tout, 0, 1); scale = 1 + p * .2; alpha = 1 - p; dx = p * S.x * .6; }
    const fs = Math.min(S.x * .13, 110) * c.size;
    ctx.save();
    ctx.translate(S.x / 2 + dx, S.y * .42);
    ctx.scale(scale, scale);
    ctx.transform(1, 0, -.18, 1, 0, 0); // arcade italic
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${fs}px Fredoka, "Arial Black", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillText(c.text, fs * .06, fs * .1);
    ctx.lineWidth = fs * .22; ctx.strokeStyle = st.stroke; ctx.strokeText(c.text, 0, 0);
    ctx.lineWidth = fs * .08; ctx.strokeStyle = '#ffffff'; ctx.strokeText(c.text, 0, 0);
    let g = ctx.createLinearGradient(0, -fs * .5, 0, fs * .5);
    if (st.rainbow) { const h = (timeReal * 220) % 360; for (let i = 0; i <= 5; i++) g.addColorStop(i / 5, `hsl(${(h + i * 60) % 360},95%,62%)`); g = (()=> { const gg = ctx.createLinearGradient(-fs * 3, 0, fs * 3, 0); for (let i = 0; i <= 6; i++) gg.addColorStop(i / 6, `hsl(${(h + i * 55) % 360},95%,60%)`); return gg; })(); }
    else { g.addColorStop(0, st.top); g.addColorStop(.48, st.mid); g.addColorStop(1, st.bot); }
    ctx.fillStyle = g; ctx.fillText(c.text, 0, 0);
    // shine sweep
    const w = ctx.measureText(c.text).width;
    const sx = -w / 2 + ((t * 1.6) % 1.6) / 1.6 * (w * 1.6) - w * .3;
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    const sg = ctx.createLinearGradient(sx - fs * .4, 0, sx + fs * .4, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,.7)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillText(c.text, 0, 0); ctx.restore();
    if (c.sub)
    {
        ctx.font = `700 ${fs * .3}px Fredoka, sans-serif`;
        ctx.lineWidth = fs * .07; ctx.strokeStyle = st.stroke; ctx.strokeText(c.sub, 0, fs * .72);
        ctx.fillStyle = '#ffffff'; ctx.fillText(c.sub, 0, fs * .72);
    }
    ctx.restore();
}

// ---------------------------------------------------------------------------
// Shift grade
function shiftGrade(r)
{
    let score = clamp(r.shipped / Math.max(1, r.target), 0, 1.3) * 60 + r.csat * 25;
    if (!r.injuries.length) score += 15; else if (!r.injuries.some(i => i.serious)) score += 6;
    if (r.injuries.some(i => i.fatal)) score -= 40;
    // S means flawless: target hit with nobody hurt. Any serious injury caps the grade at B.
    if (r.injuries.length) score = Math.min(score, r.injuries.some(i => i.serious) ? 84 : 94);
    if (r.shipped < r.target) score = Math.min(score, 94);
    return score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : score >= 45 ? 'D' : 'F';
}
const GRADE_COLORS = { S:'rainbow', A:'gold', B:'green', C:'blue', D:'purple', F:'red' };

// ---------------------------------------------------------------------------
// Coach tips (first season only, once each)
const COACH_TIPS =
{
    start:     'Drag workers between zones to clear queues. Tap a zone to switch rush orders on or off.',
    bottleneck:'A queue is FULL! Drag someone from a quiet zone onto the jam — fix the furthest-downstream one first.',
    incident:  'Warning! TAP the yellow sign before the timer runs out to stop the accident.',
    tired:     'That worker is running on fumes. Drag them to the Break Room and swap someone fresh in.',
    jaywalk:   'Impatient staff jaywalk. "Careful" line speed makes everyone wait for forklifts properly.',
    breakdown: 'Breakdown! Maintenance crew fixes it — no crew? Tap the gear to call a paid contractor.',
};
function coachTip(key)
{
    if (!career || career.season > 1 || career.flags['tip_' + key] || wmSim?.assistantOn) return;
    career.flags['tip_' + key] = true;
    let el = document.getElementById('coach');
    if (!el) { el = document.createElement('div'); el.id = 'coach'; document.getElementById('ui').appendChild(el); }
    el.innerHTML = `${avatarSvg(CAST.gus.look, { size:64, mood:'happy', vest:CAST.gus.vest })}<div><b>Gus says:</b><p>${COACH_TIPS[key]}</p></div>`;
    el.className = 'show';
    el.onclick = ()=> el.className = '';
    clearTimeout(el._t);
    el._t = setTimeout(()=> el.className = '', 7000);
    playSfx('perfect', .5, 1.3);
}

// ---------------------------------------------------------------------------
// Parallax flyover cutscenes (DOM layers moving at different speeds)
function pxClouds(n, w, h, seed)
{
    let out = '';
    for (let i = 0; i < n; i++)
    {
        const x = (i * 337 + seed * 91) % w, y = 20 + ((i * 53 + seed * 17) % (h * .45)), s = .6 + ((i * 7) % 5) / 6;
        out += `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="18" rx="70" ry="22" fill="#fff" stroke="#2b2d42" stroke-width="4"/><circle cx="-28" cy="8" r="24" fill="#fff" stroke="#2b2d42" stroke-width="4"/><circle cx="12" cy="0" r="32" fill="#fff" stroke="#2b2d42" stroke-width="4"/><ellipse cx="0" cy="22" rx="66" ry="16" fill="#fff"/></g>`;
    }
    return out;
}
function pxSkyline(w, h, color, seed, windows)
{
    let out = '', x = 0, i = 0;
    while (x < w)
    {
        const bw = 60 + ((i * 47 + seed) % 90), bh = 80 + ((i * 71 + seed * 3) % 200);
        out += `<rect x="${x}" y="${h - bh}" width="${bw}" height="${bh}" rx="6" fill="${color}" stroke="#2b2d42" stroke-width="4"/>`;
        if (windows) for (let wy = h - bh + 16; wy < h - 20; wy += 26) for (let wx = x + 12; wx < x + bw - 16; wx += 22)
            if ((wx * 13 + wy * 7 + seed) % 5 > 1) out += `<rect x="${wx}" y="${wy}" width="10" height="12" rx="2" fill="${windows}"/>`;
        x += bw + 8 + ((i * 13) % 20); i++;
    }
    return out;
}
function pxWarehouse(x, groundY, name, hex, scale = 1)
{
    const W = 520 * scale, H = 210 * scale;
    return `<g transform="translate(${x} ${groundY - H})">
        <rect x="0" y="40" width="${W}" height="${H - 40}" rx="14" fill="#f3e9d6" stroke="#2b2d42" stroke-width="6"/>
        <path d="M-12 46 L${W / 2} 0 L${W + 12} 46 Z" fill="${hex}" stroke="#2b2d42" stroke-width="6" stroke-linejoin="round"/>
        ${[0, 1, 2, 3].map(i => `<rect x="${30 + i * (W - 60) / 4}" y="${H - 110 * scale}" width="${(W - 60) / 4 - 20}" height="${110 * scale}" rx="8" fill="#9fb0cc" stroke="#2b2d42" stroke-width="5"/><path d="M${34 + i * (W - 60) / 4} ${H - 80 * scale} h${(W - 60) / 4 - 28}" stroke="#2b2d42" stroke-width="3"/>`).join('')}
        <rect x="${W / 2 - 150}" y="58" width="300" height="46" rx="12" fill="#fff" stroke="#2b2d42" stroke-width="5"/>
        <text x="${W / 2}" y="91" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="26" fill="${hex}" stroke="#2b2d42" stroke-width="1">${esc(name).slice(0, 22)}</text>
    </g>`;
}
function pxTruck(x, y, hex)
{
    return `<g transform="translate(${x} ${y})"><rect x="0" y="-70" width="150" height="70" rx="10" fill="#fff" stroke="#2b2d42" stroke-width="5"/><rect x="10" y="-60" width="130" height="50" rx="6" fill="${hex}"/>
        <rect x="150" y="-52" width="58" height="52" rx="12" fill="#3ec1ff" stroke="#2b2d42" stroke-width="5"/><rect x="172" y="-44" width="28" height="18" rx="4" fill="#d8f3ff" stroke="#2b2d42" stroke-width="3"/>
        <circle cx="38" cy="2" r="15" fill="#2b2d42"/><circle cx="118" cy="2" r="15" fill="#2b2d42"/><circle cx="182" cy="2" r="15" fill="#2b2d42"/></g>`;
}
function pxFence(w, y)
{
    let out = `<rect x="0" y="${y}" width="${w}" height="10" fill="#ffd23f" stroke="#2b2d42" stroke-width="4"/>`;
    for (let x = 0; x < w; x += 70) out += `<rect x="${x}" y="${y - 50}" width="16" height="70" rx="5" fill="#ff8a1f" stroke="#2b2d42" stroke-width="4"/>`;
    return out;
}

// Viewport-aware parallax geometry: each layer is scaled to the screen height
// and pans by ratio * (its width - screen width), so it never runs out.
const PXW = 3200;
function pxGeom()
{
    const vw = window.innerWidth, vh = window.innerHeight, k = vh / 720;
    const travel = (r)=> -r * (PXW * k - vw);
    // svg x so that an object of width w ends centred at screen fraction f on a layer with ratio r
    const at = (r, f, w)=> (vw * f - travel(r)) / k - w / 2;
    return { vw, vh, k, travel, at, narrow: vw < 640 };
}
// scene: { sky, layers:[{svg, ratio}], card html, duration, onDone }
let wmPx = null;
function playParallax(opts, onDone)
{
    let el = document.getElementById('parallax');
    if (!el) { el = document.createElement('div'); el.id = 'parallax'; document.getElementById('ui').appendChild(el); }
    const g = pxGeom();
    const dur = opts.duration || 4.2;
    const layer = (svg, ratio, cls = '')=> `<div class="pxl ${cls}" style="--travel:${g.travel(ratio)}px;--dur:${dur}s;width:${PXW * g.k}px"><svg viewBox="0 0 ${PXW} 720" preserveAspectRatio="none" width="100%" height="100%">${svg}</svg></div>`;
    el.className = 'sky-' + (opts.sky || 'day') + (opts.rain ? ' rain' : '') + (opts.fireworks ? ' fireworks' : '');
    el.innerHTML = `
        <div class="pxSun"></div>
        ${opts.layers.map(l => layer(l.svg, l.ratio, l.cls)).join('')}
        ${opts.fireworks ? '<div class="fw f1"></div><div class="fw f2"></div><div class="fw f3"></div><div class="fw f4"></div>' : ''}
        ${opts.rain ? '<div class="rainfx"></div>' : ''}
        <div class="pxFlash"></div>
        <div class="pxCard ${opts.cardPos || ''}">${opts.card || ''}</div>
        <div class="pxSkip">tap to ${opts.tapLabel || 'skip'} ▶</div>`;
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('run');
    if (wmPx?.timer) clearTimeout(wmPx.timer);
    wmPx = { onDone, done:false };
    const finish = ()=>
    {
        if (!wmPx || wmPx.done) return;
        wmPx.done = true;
        el.classList.add('out');
        const me = wmPx;
        setTimeout(()=> { if (wmPx !== me) return; el.className = 'hidden'; el.innerHTML = ''; wmPx = null; me.onDone && me.onDone(); }, 320);
    };
    el.onclick = ()=> { if (opts.minTime && wmPx && performance.now() - wmPx.start < opts.minTime * 1000) return; finish(); };
    wmPx.start = performance.now();
    if (!opts.waitForTap) wmPx.timer = setTimeout(finish, dur * 1000 + 600);
    (opts.sfx || []).forEach(([t, name, vol, pitch])=> setTimeout(()=> wmPx && playSfx(name, vol, pitch), t * 1000));
}

// ---------------------------------------------------------------------------
// Scene recipes
function sceneShiftIntro(sim, onDone)
{
    const c = career, f = sim.forecast, risk = crewRisk();
    const shiftNo = c.records.shiftsPlayed + 1;
    const pool = isPeakWeek() ? BARRY.introPeak : risk.level >= 2 ? BARRY.introRisky : hasHomegrownBond(c.lineup) ? BARRY.introHg : BARRY.intro;
    const line = fillBarry(pickOne(pool));
    const conditions = [...f.notes, ...(c.mods || []).map(m => m.label)].slice(0, 3);
    const W = PXW, ground = 600, G = pxGeom();
    const card = `
        <div class="holeCard">
            <div class="hcTop"><span class="hcNo">SHIFT ${shiftNo}</span><span class="hcDay">${wmDayName(c.day).toUpperCase()} · WEEK ${c.week} · SEASON ${c.season}</span></div>
            <div class="hcBig"><small>TARGET</small><b>${fmtUnits(f.target)}</b><small>units</small></div>
            <div class="hcRows">
                <div><span>Forecast</span><b>${fmtUnits(f.volume)}</b></div>
                <div><span>Crew risk</span><b class="risk r${risk.level}">${risk.label}</b></div>
                <div><span>Days safe</span><b>${c.records.daysSinceAccident}</b></div>
                <div><span>Line speed</span><b>${LINE_SPEEDS[sim.lineSpeed].label}</b></div>
            </div>
            ${conditions.length ? `<div class="hcCond">${conditions.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
            <div class="barry">📢 <b>BARRY:</b> ${esc(line)}</div>
        </div>
        <div class="pxReady"><span class="r1">READY?</span><span class="r2">SHIP IT!</span></div>`;
    playParallax({
        sky:'dawn', duration:4.6, card, minTime:.6, cardPos:'left',
        layers:[
            { svg: pxClouds(9, W, 720, 1), ratio:.12, cls:'clouds' },
            { svg: pxSkyline(W, ground - 60, '#b7c4e8', 3, '#e8eeff'), ratio:.3 },
            { svg: pxSkyline(W * .7, ground - 10, '#8fa3d6', 7, '#ffe9a6') + pxWarehouse(G.at(.65, G.narrow ? .5 : .74, 598), ground, c.company, c.companyHex, 1.15), ratio:.65 },
            { svg: `<rect x="0" y="${ground}" width="${W}" height="200" fill="#8fd17a" stroke="#2b2d42" stroke-width="5"/><rect x="0" y="${ground + 40}" width="${W}" height="70" fill="#5d6b82"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${i * 480 + 60}" y="${ground + 72}" width="120" height="8" rx="4" fill="#fff"/>`).join('')}${pxTruck(500, ground + 92, '#ff5d8f')}${pxTruck(1500, ground + 92, '#7ed957')}${pxTruck(2600, ground + 92, c.companyHex)}`, ratio:.85 },
            { svg: pxFence(W, ground + 170), ratio:1 },
        ],
        sfx:[[.1, 'horn', .5, .9], [2.9, 'tick', 1, 1.5], [3.6, 'flowUp', .9, 1.2]],
    }, onDone);
}

function sceneShiftEnd(r, onDone)
{
    const grade = shiftGrade(r);
    const hit = r.shipped >= r.target;
    const fatal = r.injuries.some(i => i.fatal);
    const title = fatal ? 'A DARK DAY' : grade === 'S' ? 'PERFECT SHIFT!' : hit ? 'TARGET SMASHED!' : r.shipped >= r.target * .9 ? 'SO CLOSE!' : 'SHIFT OVER';
    const line = fatal ? BARRY.fatal[0] : fillBarry(pickOne(BARRY.end[grade]));
    const mvp = r.workerOfShift ? career.staff.find(s => s.id === r.workerOfShift.id) : null;
    const W = PXW, ground = 600, G = pxGeom();
    const card = `
        <div class="endCard ${fatal ? 'dark' : ''}">
            ${fatal ? '<div class="grade candle">🕯️</div>' : `<div class="grade g${grade}">${grade}</div>`}
            <div class="endTitle">${title}</div>
            <div class="endStats"><span>📦 ${fmtUnits(r.shipped)} / ${fmtUnits(r.target)}</span><span>⚡ ${r.uph} UPH</span><span>${r.injuries.length ? '🚑 ' + r.injuries.length : '🛡️ 0 injuries'}</span><span>💰 ${wmMoney(r.profit)}</span></div>
            ${mvp && !fatal ? `<div class="mvp"><div class="mvpAva">${avatarSvg(mvp.look, { size:96, mood:'happy', vest:ZONE_DEFS[bestZone(mvp)].hex })}</div><div><small>WORKER OF THE SHIFT</small><b>${esc(displayName(mvp))}</b><span class="rt ${ratingClass(r.workerOfShift.rating)}">${r.workerOfShift.rating.toFixed(1)}</span>${mvp.homegrown ? ' <em>🌱 academy</em>' : ''}</div></div>` : ''}
            <div class="barry">📢 <b>BARRY:</b> ${esc(line)}</div>
        </div>`;
    playParallax({
        sky: fatal ? 'night' : 'sunset', duration:5, card, waitForTap:true, minTime:1.2, tapLabel:'see the report',
        layers:[
            { svg: pxClouds(7, W, 720, 4), ratio:.1, cls:'clouds' },
            { svg: pxSkyline(W, ground - 40, fatal ? '#3a3f5c' : '#e69a8d', 5, fatal ? '#8090c0' : '#ffd88a'), ratio:.25 },
            { svg: pxWarehouse(G.at(.45, .12, 572), ground, career.company, career.companyHex, 1.1), ratio:.45 },
            { svg: `<rect x="0" y="${ground}" width="${W}" height="200" fill="${fatal ? '#4c5a44' : '#7cc46a'}" stroke="#2b2d42" stroke-width="5"/><rect x="0" y="${ground + 40}" width="${W}" height="70" fill="#5d6b82"/>${hit && !fatal ? pxTruck(900, ground + 92, career.companyHex) + pxTruck(1300, ground + 92, '#ffd23f') + pxTruck(1700, ground + 92, '#ff5d8f') : pxTruck(1100, ground + 92, '#94a3b8')}`, ratio:.8, cls:'trucks' },
        ],
        sfx: fatal ? [[.2, 'ominous', 1, .6]] : [[.3, 'fanfare', .8, grade === 'S' ? 1.2 : 1], [.9, ['S','A','B'].includes(grade) ? 'flowUp' : 'flowDown', .7, 1]],
    }, onDone);
}

function sceneTrophy(kind, data, onDone)
{
    const W = PXW, ground = 600, G = pxGeom(), c = career;
    const crew = [...c.staff].sort((a, b)=> staffAbility(b) - staffAbility(a)).slice(0, 5);
    const title = kind === 'champion' ? 'CHAMPIONS!' : 'PROMOTED!';
    const sub = kind === 'champion' ? `${c.company} win the league!` : `${c.company} → ${tierDef().name}`;
    const card = `<div class="trophyCard"><div class="bigTrophy">🏆</div><div class="endTitle">${title}</div><p>${esc(sub)}</p>
        <div class="crewRow">${crew.map((s, i)=> `<div class="crewMember" style="animation-delay:${i * .12}s">${avatarSvg(s.look, { size:84, mood:'happy', vest:ZONE_DEFS[bestZone(s)].hex })}<small>${esc(displayName(s))}</small></div>`).join('')}</div>
        <div class="barry">📢 <b>BARRY:</b> ${kind === 'champion' ? 'CHAMPIONS! CHAMPIONS! Somebody get me a bigger microphone!' : 'We\'re going UP! Bigger site, bigger trucks, bigger everything!'}</div></div>`;
    playParallax({
        sky:'night', fireworks:true, duration:5, card, waitForTap:true, minTime:1.5, tapLabel:'continue', cardPos:'ctop',
        layers:[
            { svg: pxSkyline(W, ground - 40, '#3d3f6b', 2, '#ffe28a'), ratio:.08 },
            { svg: pxWarehouse(G.at(.15, .5, 780), ground, c.company, c.companyHex, 1.5), ratio:.15, cls:'grow' },
            { svg: `<rect x="0" y="${ground}" width="${W}" height="200" fill="#3f6e3a" stroke="#2b2d42" stroke-width="5"/>`, ratio:.2 },
        ],
        sfx:[[.1, 'fanfare', 1, 1], [.8, 'flowUp', .9, 1.3], [1.6, 'fanfare', .8, 1.5]],
    }, onDone);
}

function sceneNewChapter(onDone)
{
    const c = career, W = PXW, ground = 600, G = pxGeom();
    const own = c.manager.owner;
    const prev = c.manager.history[c.manager.history.length - 1];
    const card = `<div class="trophyCard"><div class="endTitle">${own ? 'YOUR OWN WAREHOUSE' : 'NEW CHAPTER'}</div>
        <p><b style="color:${c.companyHex}">${esc(c.company)}</b> · ${tierDef().name}</p>
        <div class="crewRow">${[{ look:c.manager.look, name:c.manager.name }, ...c.staff.filter(s => s.morale >= 70 || s.homegrown).slice(0, 4).map(s => ({ look:s.look, name:displayName(s) }))].map((p, i)=> `<div class="crewMember" style="animation-delay:${i * .12}s">${avatarSvg(p.look, { size:78, mood:'happy', vest:c.companyHex })}<small>${esc(p.name)}</small></div>`).join('')}</div>
        <div class="barry">📢 <b>BARRY:</b> ${own ? 'Your name on the gate, boss. No board. No excuses. Let\'s GO!' : `Fresh site, fresh start. ${prev ? esc(prev.company) + ' is in the rear-view mirror!' : ''}`}</div></div>`;
    playParallax({
        sky:'day', duration:5, card, waitForTap:true, minTime:1.5, tapLabel:'start', cardPos:'left',
        layers:[
            { svg: pxClouds(8, W, 720, 6), ratio:.12, cls:'clouds' },
            { svg: pxSkyline(W, ground - 50, '#c1d3f5', 9, '#eef3ff'), ratio:.3 },
            { svg: (prev ? pxWarehouse(150, ground, prev.company, '#94a3b8', .8) : '') + pxWarehouse(G.at(.7, G.narrow ? .5 : .73, 676), ground, c.company, c.companyHex, 1.3), ratio:.7 },
            { svg: `<rect x="0" y="${ground}" width="${W}" height="200" fill="#8fd17a" stroke="#2b2d42" stroke-width="5"/><rect x="0" y="${ground + 40}" width="${W}" height="70" fill="#5d6b82"/>${pxTruck(G.at(.88, .55, 210), ground + 92, c.companyHex)}`, ratio:.88 },
            { svg: pxFence(W, ground + 170), ratio:1 },
        ],
        sfx:[[.2, 'horn', .6, 1], [3.8, 'fanfare', .9, 1.1]],
    }, onDone);
}

function sceneSacked(onDone)
{
    const c = career, W = PXW, ground = 600, G = pxGeom();
    const bankrupt = c.flags.bankrupt;
    const card = `<div class="trophyCard dark"><div class="sadMgr">${avatarSvg(c.manager.look, { size:120, mood:'sad', vest:'#64748b' })}<div class="boxOfStuff">📦</div></div>
        <div class="endTitle red">${bankrupt ? 'BANKRUPT.' : 'YOU\'RE FIRED.'}</div>
        <p>${bankrupt ? `The bank has padlocked the gates of ${esc(c.company)}.` : `Security walks you out of ${esc(c.company)}, a cardboard box of belongings in your arms.`}</p>
        <div class="barry">📢 <b>BARRY:</b> ${bankrupt ? '…Lights off on your way out, yeah?' : 'Er… the manager has left the building. Back to work, everyone.'}</div></div>`;
    playParallax({
        sky:'rain', rain:true, duration:5, card, waitForTap:true, minTime:1.5, tapLabel:'continue', cardPos:'left',
        layers:[
            { svg: pxSkyline(W, ground - 40, '#5b6478', 13, '#9aa6bf'), ratio:.04 },
            { svg: pxWarehouse(G.at(.08, G.narrow ? .5 : .74, 624), ground, c.company, '#64748b', 1.2), ratio:.08 },
            { svg: `<rect x="0" y="${ground}" width="${W}" height="200" fill="#56634f" stroke="#2b2d42" stroke-width="5"/>`, ratio:.12 },
        ],
        sfx:[[.2, 'ominous', 1, .5], [1.2, 'flowDown', .7, .7]],
    }, onDone);
}
