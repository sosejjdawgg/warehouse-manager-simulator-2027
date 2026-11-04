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
    introPeak: ['IT\'S PEAK! I can SEE the trucks from my window and they do NOT stop!', 'Peak week, people! Stretch those hamstrings!'],
    introRisky:['Crew looks a bit ropey today… eyes open, please. I mean it.', 'Safety first today, yeah? I don\'t want to fill in another form.'],
    introHg:   ['Half the floor came through the apprentice scheme. Proud dad moment, this.', 'Homegrown heroes on the floor today! Show \'em how it\'s done!'],
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
    target:   ['WE DID IT!', 'Woohoo!', 'GET IN!', 'Smashed it!'],
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
    'idle:homegrown':      ['For the apprentice scheme!', 'Learned that from the best!', 'Proud to be here!'],
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
    const ctx = mainContext, S = mainCanvasSize;
    const img = pixelText(c.text, c.style, 32);
    const base = Math.max(1, Math.min(5, Math.floor(S.x * .9 * c.size / img.width)));
    const tin = .2, t = c.t;
    let k = base, alpha = 1, dx = 0;
    if (t < tin) k = base * (3 - 2 * (t / tin));
    else if (t < tin + .1) k = base * (.88 + (t - tin) / .1 * .12);
    else if (t > c.hold + .35) { const p = clamp((t - c.hold - .35) / .3, 0, 1); alpha = 1 - p; dx = -p * S.x * .7; }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha;
    const w = img.width * k, h = img.height * k, y = S.y * .4;
    // flash bar behind the word, arcade style
    if (t < .5) { ctx.fillStyle = `rgba(255,255,255,${.35 * (1 - t / .5)})`; ctx.fillRect(0, y - h * .4, S.x, h * .8); }
    ctx.drawImage(img, Math.round(S.x / 2 - w / 2 + dx), Math.round(y - h / 2), Math.round(w), Math.round(h));
    if (c.sub)
    {
        const s = Math.max(2, Math.min(3, Math.floor(S.x / 330)));
        const lines = bmWrap(c.sub, S.x * .9 / s, s);
        lines.forEach((ln, i)=> bmText(ctx, ln, S.x / 2 + dx, y + h / 2 + 4 + i * 9 * s, '#ffffff', s, '#140a2a', 'center'));
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
    el._t = setTimeout(()=> el.className = '', typeof waveView !== 'undefined' && waveView.active ? 5000 : 7000);
    playSfx('perfect', .5, 1.3);
}

