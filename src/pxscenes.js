'use strict';
// ============================================================================
// Pixel cutscenes — low-res (320 wide) arcade scenes rendered to a canvas and
// scaled up with hard pixels: dithered skies, parallax layers, a crowd that
// claps or groans, a huge hero bust sliding in, and slammed banded lettering.
// ============================================================================

const SCN_W = 320;
function scnCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
function scnRand(seed) { let s = seed >>> 0 || 1; return ()=> ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// dithered vertical gradient through a list of colours
function scnSky(x, w, h, cols)
{
    for (let y = 0; y < h; y++)
    {
        const f = y / h * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(f)), t = f - i;
        for (let px = 0; px < w; px++) { x.fillStyle = bayer(px, y) < t ? cols[i + 1] : cols[i]; x.fillRect(px, y, 1, 1); }
    }
}
function scnCloud(s)
{
    const key = 'cloud' + s;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const r = scnRand(s * 77), b = new PxBuf(70, 30), ramp = ['#9fb4d8', '#c8d8ee', '#e8f0fb', '#ffffff', '#ffffff'];
    for (let i = 0; i < 5; i++) b.ellipse(12 + i * 11 + r() * 4, 18 - Math.sin(i / 4 * Math.PI) * 6 + r() * 3, 9 + r() * 5, 7 + r() * 4, ramp, 1);
    b.outline('#5a6a92', false);
    const c = b.toCanvas(); PX_CACHE.set(key, c); return c;
}
function scnSkyline(x, w, base, ramp, seed, lit)
{
    const r = scnRand(seed);
    let px = -r() * 20;
    while (px < w)
    {
        const bw = 18 + Math.floor(r() * 30), bh = 26 + Math.floor(r() * 70);
        for (let yy = base - bh; yy < base; yy++) for (let xx = Math.max(0, Math.floor(px)); xx < Math.min(w, px + bw); xx++)
        {
            const edge = xx - px < 2 ? 3 : px + bw - xx < 3 ? 0 : 1 + (bayer(xx, yy) < .3 ? 1 : 0);
            x.fillStyle = ramp[edge]; x.fillRect(xx, yy, 1, 1);
        }
        x.fillStyle = PX_OUT; x.fillRect(Math.floor(px), base - bh, bw, 1);
        if (lit) for (let wy = base - bh + 4; wy < base - 4; wy += 6) for (let wx = px + 3; wx < px + bw - 4; wx += 5) if (r() > .35) { x.fillStyle = r() > .2 ? lit : ramp[3]; x.fillRect(Math.floor(wx), wy, 2, 3); }
        px += bw + 1 + Math.floor(r() * 4);
    }
}
function scnFoliage(x, w, base, ramp, seed, height = 70)
{
    const r = scnRand(seed);
    const b = new PxBuf(w, base + 4);
    for (let i = 0; i < w / 9; i++) b.ellipse(i * 9 + r() * 6, base - height * (.45 + r() * .55), 12 + r() * 10, 12 + r() * 8, ramp, 1, { bias:-.05 });
    b.rect(0, base - height * .45, w, height * .45 + 4, ramp[1], 1);
    for (let y = 0; y < base + 4; y++) for (let px = 0; px < w; px++) if (b.get(px, y) && bayer(px, y) > .92 && y < base - 20) b.set(px, y, ramp[4], 1);
    x.drawImage(b.toCanvas(), 0, 0);
}
function scnWarehouse(name, hex, w = 150, grey = false)
{
    const key = `wh|${name}|${hex}|${w}|${grey}`;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const h = Math.round(w * .45), b = new PxBuf(w + 4, h + 18);
    const wall = pxRamp(grey ? '#9aa1ad' : '#efe0c4'), roof = pxRamp(grey ? '#6b7280' : hex), door = pxRamp(grey ? '#7c8596' : '#a9bad6');
    b.poly([[2, 18], [w + 2, 18], [w + 2, h + 18], [2, h + 18]], wall, 1, (px, y)=> b.level(.8 - px / w * .5, px, y));
    b.poly([[0, 20], [w / 2 + 2, 2], [w + 4, 20]], roof, 2, (px, y)=> b.level(.9 - px / w * .6, px, y));
    const dw = Math.floor((w - 20) / 4);
    for (let i = 0; i < 4; i++)
    {
        const dx = 8 + i * (dw + 2);
        b.poly([[dx, h - 6], [dx + dw - 2, h - 6], [dx + dw - 2, h + 18], [dx, h + 18]], door, 3 + i, (px, y)=> (y - (h - 6)) % 4 === 0 ? 0 : 2);
    }
    b.outline();
    const c = b.toCanvas(), x = c.getContext('2d');
    const sw = Math.min(w - 16, bmWidth(name.slice(0, 22)) + 10);
    x.fillStyle = PX_OUT; x.fillRect((w + 4) / 2 - sw / 2 - 1, 23, sw + 2, 13);
    x.fillStyle = '#fffdf2'; x.fillRect((w + 4) / 2 - sw / 2, 24, sw, 11);
    bmText(x, name.slice(0, 22), (w + 4) / 2, 26, grey ? '#4b5563' : hex, 1, null, 'center');
    PX_CACHE.set(key, c);
    return c;
}
function scnTruck(hex)
{
    const key = 'truck' + hex;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const b = new PxBuf(58, 26), body = pxRamp(hex), cab = pxRamp('#3ec1ff');
    b.poly([[1, 2], [40, 2], [40, 20], [1, 20]], pxRamp('#f4f4f4'), 1, (x, y)=> b.level(.9 - y / 26, x, y));
    b.poly([[4, 5], [37, 5], [37, 17], [4, 17]], body, 2, (x, y)=> b.level(.8 - y / 20, x, y));
    b.poly([[41, 7], [52, 7], [56, 13], [56, 20], [41, 20]], cab, 3, (x, y)=> b.level(.8 - y / 22, x, y));
    b.rect(44, 9, 7, 4, '#d8f3ff', 4);
    for (const wx of [9, 30, 48]) b.ellipse(wx, 21, 4, 4, ['#1b1b24', '#2b2b38', '#3b3b4a', '#55556a', '#77778a'], 5);
    b.outline();
    const c = b.toCanvas(); PX_CACHE.set(key, c); return c;
}

// ---------------------------------------------------------------------------
// engine
let wmScn = null;
function playPixelScene(spec, onDone)
{
    let cv = document.getElementById('pxscene');
    if (!cv) { cv = document.createElement('canvas'); cv.id = 'pxscene'; document.getElementById('ui').appendChild(cv); }
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    const W = portrait ? 200 : SCN_W, H = Math.max(180, Math.min(460, Math.round(W * window.innerHeight / window.innerWidth)));
    cv.width = W; cv.height = H;
    cv.className = 'show';
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const st = { W, H, t:0, shake:0, flash:0 };
    spec.build && spec.build(st);
    if (wmScn) cancelAnimationFrame(wmScn.raf);
    const me = { spec, st, onDone, done:false };
    wmScn = me;
    let last = performance.now();
    const frame = (now)=>
    {
        if (wmScn !== me) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        st.t += dt;
        st.shake = Math.max(0, st.shake - dt * 3);
        st.flash = Math.max(0, st.flash - dt * 2.2);
        ctx.save();
        if (st.shake) ctx.translate(Math.round((Math.random() - .5) * st.shake * 10), Math.round((Math.random() - .5) * st.shake * 10));
        ctx.fillStyle = '#000'; ctx.fillRect(-10, -10, W + 20, H + 20);
        spec.draw(ctx, st);
        ctx.restore();
        if (st.flash) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, st.flash)})`; ctx.fillRect(0, 0, W, H); }
        if (st.t > (spec.minTime || .5) && Math.floor(st.t * 2.5) % 2) bmText(ctx, spec.tapLabel || 'TAP TO SKIP', W - 5, 4, '#fff', 1, '#000', 'right');
        // events on a timeline
        for (const ev of spec.events || []) if (!ev.fired && st.t >= ev.t) { ev.fired = true; ev.fn(st); }
        if (!spec.waitForTap && st.t >= spec.duration) finish();
        else me.raf = requestAnimationFrame(frame);
    };
    const finish = ()=>
    {
        if (me.done) return;
        me.done = true;
        cv.className = 'show out';
        setTimeout(()=> { if (wmScn !== me) return; cv.className = ''; wmScn = null; onDone && onDone(); }, 260);
    };
    cv.onclick = ()=> { if (st.t >= (spec.minTime || .5)) finish(); };
    me.raf = requestAnimationFrame(frame);
}
// slam-in big lettering: returns a draw function
function scnSlam(ctx, st, img, t0, cx, cy, maxW, hold = 99)
{
    const t = st.t - t0;
    if (t < 0 || t > hold + .4) return;
    const k = img.width > maxW ? maxW / img.width : Math.max(1, Math.min(3, Math.floor(maxW / img.width)));
    let s = k;
    if (t < .18) s = k * (3.2 - 2.2 * (t / .18));
    else if (t < .3) s = k * (.9 + (t - .18) / .12 * .1);
    const a = t > hold ? 1 - (t - hold) / .4 : 1;
    ctx.globalAlpha = Math.max(0, a);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
    ctx.globalAlpha = 1;
}
function scnPanel(ctx, x, y, w, h, border = '#ffd23f')
{
    ctx.fillStyle = PX_OUT; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = border; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(14,18,48,.92)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, w, 2);
}
function scnCrowd(ctx, st, baseY, mood, seed = 7, count = 12)
{
    st.crowd ??= (()=> { const r = scnRand(seed), out = []; const shirts = ['#f2f2f2', '#d94b4b', '#ffd23f', '#3e9e57', '#4b6bd9', '#9a5bd3', '#e8742a', '#7ac7c4']; for (let i = 0; i < count; i++) out.push({ look:{ skin:Math.floor(r() * 6), hair:Math.floor(r() * 6), style:Math.floor(r() * 6), hat:Math.floor(r() * 8), acc:r() < .5 ? 0 : Math.floor(r() * 4) }, shirt:shirts[Math.floor(r() * shirts.length)], pants:['#2e3a5c', '#c9b48a', '#4a4a52', '#6a8fbf'][Math.floor(r() * 4)], ph:r() * 6, x:i }); return out; })();
    const n = st.crowd.length, gap = st.W / n;
    st.crowd.forEach((p, i)=>
    {
        let frame = 'idle', hop = 0;
        if (mood === 'cheer') { frame = Math.sin(st.t * 9 + p.ph) > 0 ? 'cheer' : 'clap1'; hop = Math.max(0, Math.sin(st.t * 9 + p.ph)) * 4; }
        else if (mood === 'clap') frame = Math.sin(st.t * 16 + p.ph) > 0 ? 'clap1' : 'clap2';
        else if (mood === 'groan') frame = i % 3 ? 'cross' : 'idle';
        const img = tinyFigure({ look:p.look, shirt:p.shirt, pants:p.pants, hat:false, frame, mood: mood === 'groan' || mood === 'mourn' ? 'sad' : mood === 'idle' ? 'neutral' : 'happy' });
        const x = Math.round(i * gap + gap / 2 - 16 + (i % 2 ? 3 : -3)), y = Math.round(baseY - 48 - hop - (i % 2) * 6);
        ctx.drawImage(img, x, y, 32, 48);
    });
}

// ---------------------------------------------------------------------------
// Scene recipes
function sceneShiftIntro(sim, onDone)
{
    const c = career, f = sim.forecast, risk = crewRisk();
    const shiftNo = c.records.shiftsPlayed + 1;
    const pool = isPeakWeek() ? BARRY.introPeak : risk.level >= 2 ? BARRY.introRisky : hasHomegrownBond(c.lineup) ? BARRY.introHg : BARRY.intro;
    const line = fillBarry(pickOne(pool));
    playPixelScene({
        duration:4.9, minTime:.6,
        build(st)
        {
            const { W, H } = st, ground = H - 34;
            [st.sky, st.skyX] = scnCanvas(W, H); scnSky(st.skyX, W, H, ['#3d7fe0', '#78b8ff', '#ffc4a8', '#ffe7a3']);
            st.skyX.fillStyle = '#fff3b0'; st.skyX.beginPath(); st.skyX.arc(W * .78, H * .3, 16, 0, 7); st.skyX.fill();
            [st.far, st.farX] = scnCanvas(W * 2, H); scnSkyline(st.farX, W * 2, ground - 6, pxRamp('#9fb2e0'), 11, '#eef3ff');
            [st.mid, st.midX] = scnCanvas(W * 3, H); scnSkyline(st.midX, W * 2.2, ground, pxRamp('#6f86c9'), 23, '#ffe39a');
            const wh = scnWarehouse(c.company, c.companyHex, 170);
            st.midX.drawImage(wh, W * 3 - W * .62 - wh.width / 2, ground - wh.height + 1);
            [st.near, st.nearX] = scnCanvas(W * 4, H);
            const nx = st.nearX;
            nx.fillStyle = '#58b24a'; nx.fillRect(0, ground, W * 4, 6); nx.fillStyle = '#5b6578'; nx.fillRect(0, ground + 6, W * 4, 18);
            nx.fillStyle = '#ffffff'; for (let i = 0; i < W * 4; i += 40) nx.fillRect(i, ground + 14, 18, 2);
            nx.fillStyle = '#3f8f36'; nx.fillRect(0, ground + 24, W * 4, H - ground - 24);
            for (const [tx, col] of [[60, '#ff5d8f'], [380, '#7ed957'], [760, c.companyHex], [1080, '#ffd23f']]) nx.drawImage(scnTruck(col), tx, ground - 6);
            st.title = pixelText(`SHIFT ${shiftNo}`, 'gold', 26);
            st.ready = pixelText('READY?', 'blue', 34);
            st.go = pixelText('SHIP IT!', 'gold', 40);
        },
        events:[{ t:.1, fn:()=> playSfx('horn', .5, .9) }, { t:3.0, fn:(st)=> { playSfx('tick', 1, 1.5); } }, { t:3.75, fn:(st)=> { st.shake = 1; st.flash = .9; playSfx('flowUp', .9, 1.2); playSfx('crash', .4, 1.6); } }],
        draw(ctx, st)
        {
            const { W, H, t } = st, e = 1 - Math.pow(1 - Math.min(1, t / 3), 3);
            ctx.drawImage(st.sky, 0, 0);
            for (let i = 0; i < 4; i++) ctx.drawImage(scnCloud(i + 1), Math.round(((i * 110 - t * 8) % (W + 80) + W + 80) % (W + 80) - 70), 10 + i * 13);
            ctx.drawImage(st.far, -Math.round(e * (st.far.width - W) * .5), 0);
            ctx.drawImage(st.mid, -Math.round(e * (st.mid.width - W)), 0);
            ctx.drawImage(st.near, -Math.round(e * (st.near.width - W) * .9 + t * 10), 0);
            // course card
            const slide = Math.min(1, Math.max(0, (t - .4) / .35)), px = Math.round(-180 + slide * 188);
            const pw = Math.min(176, W - 16), ph = 78, py = H > 260 ? 52 : 40;
            scnPanel(ctx, px, py, pw, ph);
            ctx.drawImage(st.title, px - 4, py - st.title.height + 8);
            const row = (i, k, v, col = '#fff')=> { bmText(ctx, k, px + 6, py + 6 + i * 11, '#ffd23f', 1, '#000'); bmText(ctx, v, px + pw - 6, py + 6 + i * 11, col, 1, '#000', 'right'); };
            row(0, 'TARGET', fmtUnits(f.target) + ' UNITS');
            row(1, 'FORECAST', fmtUnits(f.volume));
            row(2, 'CREW RISK', risk.label.toUpperCase(), ['#7ee36b', '#ffd23f', '#ff6b6b'][risk.level]);
            row(3, 'DAYS SAFE', String(c.records.daysSinceAccident));
            row(4, 'WAVES', sim.waves ? sim.waves.length + ' TO CUT-OFF' : LINE_SPEEDS[sim.lineSpeed].label.toUpperCase());
            const cond = f.notes.map(n => n.replace(/[^\x20-\x7E]/g, '').trim()).filter(Boolean)[0];
            if (cond) bmText(ctx, cond.slice(0, 27), px + 6, py + 64, '#7ec8ff', 1, '#000');
            // Barry ticker
            const tick = 'BARRY: ' + line + '      ';
            ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, H - 13, W, 13);
            bmText(ctx, tick, W - ((t * 70) % (bmWidth(tick) + W)), H - 10, '#ffffff', 1, null);
            scnSlam(ctx, st, st.ready, 2.95, W / 2, H * .62, W * .8, .7);
            scnSlam(ctx, st, st.go, 3.75, W / 2, H * .62, W * .95);
        },
    }, onDone);
}

const GRADE_WORDS = { S:['PERFECT!', 'rainbow'], A:['EXCELLENT!', 'gold'], B:['NICE SHIFT!', 'green'], C:['SCRAPED IT', 'blue'], D:['SLOPPY...', 'purple'], F:['DISASTER!', 'red'] };
function sceneShiftEnd(r, onDone)
{
    const grade = shiftGrade(r), fatal = r.injuries.some(i => i.fatal);
    const good = ['S', 'A', 'B'].includes(grade) && !fatal;
    const mvp = r.workerOfShift ? career.staff.find(s => s.id === r.workerOfShift.id) : null;
    const hero = good && mvp ? { look:mvp.look, shirt:ZONE_DEFS[bestZone(mvp)].hex, name:displayName(mvp), hat:true } : { look:career.manager.look, shirt:career.companyHex, name:career.manager.name, hat:false };
    const expr = fatal ? 'sad' : grade === 'S' || grade === 'A' ? 'shout' : grade === 'B' ? 'grin' : grade === 'C' ? 'neutral' : 'shout';
    const pose = fatal || grade === 'C' ? '' : 'fist';
    const [word, style] = fatal ? ['TRAGEDY', 'silver'] : GRADE_WORDS[grade];
    const line = fatal ? BARRY.fatal[0] : fillBarry(pickOne(BARRY.end[grade]));
    playPixelScene({
        waitForTap:true, minTime:1.4, tapLabel:'TAP FOR REPORT',
        build(st)
        {
            const { W, H } = st, ground = H - 40;
            [st.sky, st.skyX] = scnCanvas(W, H);
            scnSky(st.skyX, W, H, fatal ? ['#0b0d22', '#1d2148', '#2d2f5c'] : good ? ['#4f9cff', '#9fd2ff', '#e7f6ff'] : ['#6b78a0', '#a3acc4', '#cfd5e2']);
            [st.trees, st.treesX] = scnCanvas(W, H);
            scnFoliage(st.treesX, W, ground - 6, pxRamp(fatal ? '#1f3a2e' : '#2f7a3a'), 5, Math.min(110, H * .5));
            st.hero = pixelPortrait(hero.look, { expr, shirt:hero.shirt, hat:hero.hat, pose, k:2 });
            st.word = pixelText(word, style, 34);
            st.grade = fatal ? null : pixelText(grade, grade === 'S' ? 'rainbow' : style, 40);
            st.groundY = ground;
        },
        events:[{ t:.35, fn:(st)=> playSfx('whoosh', 1, .6) }, { t:.85, fn:(st)=> { st.shake = good ? 1.1 : .8; st.flash = .5; playSfx(fatal ? 'ominous' : good ? 'fanfare' : 'flowDown', 1, fatal ? .6 : 1); } }, { t:1.45, fn:(st)=> { if (!fatal) { st.shake = .5; playSfx('crash', .5, 1.4); } } }],
        draw(ctx, st)
        {
            const { W, H, t, groundY } = st;
            ctx.drawImage(st.sky, 0, 0);
            ctx.drawImage(st.trees, 0, 0);
            ctx.fillStyle = fatal ? '#25402c' : '#4caf45'; ctx.fillRect(0, groundY, W, H - groundY);
            for (let x = 0; x < W; x += 3) { ctx.fillStyle = fatal ? '#1c3322' : '#3d9638'; ctx.fillRect(x, groundY + ((x * 7) % 5), 1, 2); }
            scnCrowd(ctx, st, groundY + 6, fatal ? 'mourn' : good ? (grade === 'S' ? 'cheer' : 'clap') : 'groan', 9, 11);
            // hero slides in from the right with an overshoot
            const hs = Math.min(1, Math.max(0, (t - .25) / .45)), over = hs < 1 ? Math.sin(hs * Math.PI) * 14 : 0;
            const hx = Math.round(W - st.hero.width * (H > 260 ? 1.2 : 1.05) + (1 - hs) * 220 - over), hy = H - st.hero.height - (H > 260 ? 60 : 30) + Math.round(Math.sin(t * 6) * (good ? 1.5 : 0));
            ctx.drawImage(st.hero, hx, hy);
            scnSlam(ctx, st, st.word, .85, W * (W < 250 ? .5 : .4), H * .24, W * (W < 250 ? .95 : .76));
            if (st.grade) scnSlam(ctx, st, st.grade, 1.45, 46, H - 92 - (H > 260 ? 40 : 0), 60);
            if (fatal) { const fl = Math.sin(t * 12) > 0 ? '#ffd23f' : '#ff9a3d'; ctx.fillStyle = '#f2efe6'; ctx.fillRect(28, H * .5, 8, 18); ctx.fillStyle = fl; ctx.fillRect(30, H * .5 - 6, 4, 6); }
            // stats panel
            if (t > 1.7)
            {
                const pw = W - 16, ph = 44, py = H - ph - 18;
                scnPanel(ctx, 8, py, pw, ph, fatal ? '#9ca3af' : '#ffd23f');
                bmText(ctx, `SHIPPED ${fmtUnits(r.shipped)}/${fmtUnits(r.target)}`, 14, py + 5, r.shipped >= r.target ? '#7ee36b' : '#ff8a8a');
                bmText(ctx, `UPH ${r.uph}`, W - 14, py + 5, '#fff', 1, '#000', 'right');
                bmText(ctx, `INJURIES ${r.injuries.length}`, 14, py + 16, r.injuries.length ? '#ff8a8a' : '#7ee36b');
                bmText(ctx, `PROFIT ${wmMoney(r.profit)}`, W - 14, py + 16, r.profit >= 0 ? '#7ee36b' : '#ff8a8a', 1, '#000', 'right');
                if (good && mvp) bmText(ctx, `MVP ${hero.name} ${r.workerOfShift.rating.toFixed(1)}`.slice(0, 48), 14, py + 28, '#ffd23f');
                else bmText(ctx, ('BARRY: ' + line).slice(0, 48), 14, py + 28, '#cfe3ff');
            }
        },
    }, onDone);
}

function sceneTrophy(kind, data, onDone)
{
    const c = career, champ = kind === 'champion';
    playPixelScene({
        waitForTap:true, minTime:1.6, tapLabel:'TAP TO CONTINUE',
        build(st)
        {
            const { W, H } = st, ground = H - 30;
            [st.sky, st.skyX] = scnCanvas(W, H); scnSky(st.skyX, W, H, ['#060818', '#141a44', '#2c2a6b']);
            const r = scnRand(3); st.skyX.fillStyle = '#fff'; for (let i = 0; i < 70; i++) st.skyX.fillRect(Math.floor(r() * W), Math.floor(r() * H * .6), 1, 1);
            [st.city, st.cityX] = scnCanvas(W, H); scnSkyline(st.cityX, W, ground, pxRamp('#3d4280'), 4, '#ffe28a');
            st.wh = scnWarehouse(c.company, c.companyHex, 190);
            st.hero = pixelPortrait(c.manager.look, { expr:'shout', shirt:c.companyHex, hat:false, pose:'fist', k:2 });
            st.word = pixelText(champ ? 'DEPOT OF THE YEAR!' : 'STEPPING UP!', champ ? 'rainbow' : 'gold', 38);
            st.ground = ground; st.sparks = [];
        },
        events:[{ t:.1, fn:()=> playSfx('fanfare', 1) }, { t:.9, fn:(st)=> { st.shake = 1.2; st.flash = .7; playSfx('flowUp', 1, 1.3); } }],
        draw(ctx, st)
        {
            const { W, H, t, ground } = st;
            ctx.drawImage(st.sky, 0, 0);
            // fireworks
            if (Math.random() < .08) { const fx = 30 + Math.random() * (W - 60), fy = 20 + Math.random() * H * .35, col = pickOne(['#ffd23f', '#ff5d8f', '#7ed957', '#5fd1ff', '#c38bff']); for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; st.sparks.push({ x:fx, y:fy, vx:Math.cos(a) * (30 + Math.random() * 20), vy:Math.sin(a) * (30 + Math.random() * 20), life:1, col }); } playSfx('ship', .3, 2); }
            for (const s of st.sparks) { s.x += s.vx / 60; s.y += s.vy / 60; s.vy += .6; s.life -= 1 / 70; if (s.life > 0) { ctx.fillStyle = s.life > .3 ? s.col : '#fff'; ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2); } }
            st.sparks = st.sparks.filter(s => s.life > 0);
            ctx.drawImage(st.city, 0, 0);
            const rise = Math.min(1, t / .9), wh = st.wh;
            const vis = Math.round(wh.height * (.2 + .8 * (1 - Math.pow(1 - rise, 3))));
            ctx.drawImage(wh, 0, wh.height - vis, wh.width, vis, Math.round(W / 2 - wh.width / 2), ground - vis, wh.width, vis);
            ctx.fillStyle = '#2f5a2c'; ctx.fillRect(0, ground, W, H - ground);
            scnCrowd(ctx, st, H - 2, 'cheer', 21, 10);
            const hs = Math.min(1, Math.max(0, (t - .5) / .5));
            ctx.drawImage(st.hero, Math.round(W / 2 - st.hero.width / 2), Math.round(H - st.hero.height * hs - 4));
            scnSlam(ctx, st, st.word, .9, W / 2, H * .2, W * .9);
            if (t > 1.5) bmText(ctx, champ ? `${c.company} ARE DEPOT OF THE YEAR` : `${c.company} > ${tierDef().name}`, W / 2, H * .2 + 30, '#ffffff', 1, '#000', 'center');
        },
    }, onDone);
}

function sceneNewChapter(onDone)
{
    const c = career, own = c.manager.owner;
    const followers = c.staff.filter(s => s.morale >= 70 || s.homegrown).slice(0, 4);
    playPixelScene({
        waitForTap:true, minTime:1.6, tapLabel:'TAP TO START',
        build(st)
        {
            const { W, H } = st, ground = H - 34;
            [st.sky, st.skyX] = scnCanvas(W, H); scnSky(st.skyX, W, H, ['#3a8bff', '#86c5ff', '#d9efff']);
            [st.far, st.farX] = scnCanvas(W * 2, H); scnSkyline(st.farX, W * 2, ground - 4, pxRamp('#a8bde8'), 31, '#f2f6ff');
            st.wh = scnWarehouse(c.company, c.companyHex, 190);
            st.hero = pixelPortrait(c.manager.look, { expr:'grin', shirt:c.companyHex, hat:false, pose:'fist', k:2 });
            st.word = pixelText(own ? 'OPEN FOR BUSINESS!' : 'NEW CHAPTER', 'gold', 32);
            st.ground = ground;
        },
        events:[{ t:.2, fn:()=> playSfx('horn', .6) }, { t:1.6, fn:(st)=> { st.shake = .8; st.flash = .5; playSfx('fanfare', .9, 1.1); } }],
        draw(ctx, st)
        {
            const { W, H, t, ground } = st, e = 1 - Math.pow(1 - Math.min(1, t / 1.6), 3);
            ctx.drawImage(st.sky, 0, 0);
            for (let i = 0; i < 3; i++) ctx.drawImage(scnCloud(i + 5), Math.round(((i * 130 - t * 10) % (W + 80) + W + 80) % (W + 80) - 70), 14 + i * 16);
            ctx.drawImage(st.far, -Math.round(e * W * .6), 0);
            const whx = Math.round(W + 40 - e * (W * .5 + 40 + st.wh.width / 2 - W * .32));
            ctx.drawImage(st.wh, W - st.wh.width - 10 + Math.round((1 - e) * 200), ground - st.wh.height + 1);
            ctx.fillStyle = '#58b24a'; ctx.fillRect(0, ground, W, H - ground);
            followers.forEach((s, i)=>
            {
                const x = Math.round(-30 + Math.min(1, t / 3) * (W - 120 - i * 22));
                ctx.drawImage(tinyFigure({ look:s.look, shirt:c.companyHex, pants:'#2e3a5c', hat:true, hivis:true, frame: t < 3 && Math.floor(t * 8) % 2 ? 'walk1' : t < 3 ? 'walk2' : 'cheer', mood:'happy' }), x, ground - 44, 32, 48);
            });
            const hs = Math.min(1, Math.max(0, (t - .6) / .5));
            ctx.drawImage(st.hero, Math.round(-st.hero.width + hs * (st.hero.width + 4)), H - st.hero.height);
            scnSlam(ctx, st, st.word, 1.6, W / 2, H * .22, W * .92);
            if (t > 2) bmText(ctx, `${c.company} · ${tierDef().name}`, W / 2, H * .22 + 26, '#ffffff', 1, '#000', 'center');
        },
    }, onDone);
}

function sceneSacked(onDone)
{
    const c = career, bankrupt = c.flags.bankrupt;
    playPixelScene({
        waitForTap:true, minTime:1.6, tapLabel:'TAP TO CONTINUE',
        build(st)
        {
            const { W, H } = st, ground = H - 30;
            [st.sky, st.skyX] = scnCanvas(W, H); scnSky(st.skyX, W, H, ['#3f4659', '#6b7387', '#9aa1b3']);
            [st.city, st.cityX] = scnCanvas(W, H); scnSkyline(st.cityX, W, ground, pxRamp('#59617a'), 8, '#a7b0c6');
            st.wh = scnWarehouse(c.company, '#64748b', 180, true);
            st.hero = pixelPortrait(c.manager.look, { expr:'sad', shirt:'#6b7280', hat:false, k:2 });
            st.word = pixelText(bankrupt ? 'BANKRUPT.' : "YOU'RE FIRED.", 'red', 36);
            st.ground = ground;
            st.drops = Array.from({ length:90 }, ()=> ({ x:Math.random() * W, y:Math.random() * H, v:160 + Math.random() * 80 }));
        },
        events:[{ t:.2, fn:()=> playSfx('ominous', 1, .5) }, { t:1, fn:(st)=> { st.shake = .7; playSfx('crash', .6, .6); } }],
        draw(ctx, st)
        {
            const { W, H, t, ground } = st;
            ctx.drawImage(st.sky, 0, 0); ctx.drawImage(st.city, 0, 0);
            ctx.drawImage(st.wh, Math.round(W - st.wh.width - 6), ground - st.wh.height + 1);
            ctx.fillStyle = '#45503f'; ctx.fillRect(0, ground, W, H - ground);
            const hx = Math.round(W * .45 - st.hero.width / 2 - t * 9);
            ctx.drawImage(st.hero, hx, H - st.hero.height + Math.round(Math.abs(Math.sin(t * 5)) * 2));
            const box = scnBox(); ctx.drawImage(box, hx + st.hero.width - 54, H - 40);
            ctx.fillStyle = 'rgba(200,215,255,.55)';
            for (const d of st.drops) { d.y += d.v / 60; d.x -= d.v / 300; if (d.y > H) { d.y = -6; d.x = Math.random() * (W + 30); } ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 5); }
            scnSlam(ctx, st, st.word, 1, W / 2, H * .22, W * .92);
            if (t > 1.6) bmText(ctx, bankrupt ? 'THE BANK HAS LOCKED THE GATES.' : 'SECURITY WALKS YOU OUT.', W / 2, H * .22 + 26, '#ffffff', 1, '#000', 'center');
        },
    }, onDone);
}
function scnBox()
{
    if (PX_CACHE.has('box')) return PX_CACHE.get('box');
    const b = new PxBuf(40, 30), r = pxRamp('#c98d4f');
    b.poly([[2, 6], [38, 6], [36, 29], [4, 29]], r, 1, (x, y)=> b.level(.85 - x / 40 * .5, x, y));
    b.poly([[0, 2], [20, 6], [2, 8]], r, 2, 3); b.poly([[40, 2], [20, 6], [38, 8]], r, 3, 1);
    b.rect(17, 6, 6, 23, '#e8d2a8', 4);
    b.outline();
    const c = b.toCanvas(); PX_CACHE.set('box', c); return c;
}

// Static pixel backdrops for story cutscenes
function pxBackdrop(kind)
{
    const key = 'bd|' + kind;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const W = 320, H = 200, [cv, x] = scnCanvas(W, H), ground = H - 40;
    const skies = { dawn:['#3d7fe0', '#ffc4a8', '#ffe7a3'], office:['#8fb8ff', '#d4e4ff', '#eef3ff'], floor:['#c9a86b', '#e8cf9a', '#f3e2bd'], breakroom:['#ff9fbf', '#ffd0e1', '#ffeef4'],
        press:['#2d3a6b', '#5a6db0', '#9fb0e8'], dusk:['#3a2d7a', '#b0507e', '#ff9a6b'], night:['#070917', '#14193d', '#262c5c'], party:['#4a1f8a', '#c2398f', '#ff9a3d'] };
    scnSky(x, W, H, skies[kind] || skies.office);
    if (kind === 'floor')
    {
        // racking full of boxes
        for (let rx = 6; rx < W; rx += 70)
        {
            x.fillStyle = '#ff8a1f'; x.fillRect(rx, 20, 4, ground - 20); x.fillRect(rx + 56, 20, 4, ground - 20);
            for (let sy = 40; sy < ground; sy += 34) { x.fillStyle = '#3b6fd6'; x.fillRect(rx, sy, 60, 3); for (let bx = rx + 6; bx < rx + 52; bx += 14) x.drawImage(scnBox(), bx, sy - 13, 13, 13); }
        }
        x.fillStyle = '#9a8a6a'; x.fillRect(0, ground, W, H - ground);
    }
    else if (kind === 'breakroom')
    {
        x.fillStyle = '#ffe1a8'; x.fillRect(0, ground, W, H - ground);
        x.fillStyle = '#d23d6a'; x.fillRect(220, ground - 90, 46, 90); x.fillStyle = '#5fd1ff'; x.fillRect(226, ground - 82, 34, 46);
        bmText(x, 'SNACKS', 243, ground - 22, '#fff', 1, '#000', 'center');
        x.fillStyle = '#ff7b9c'; x.fillRect(30, ground - 24, 120, 24); x.fillStyle = '#c94a72'; x.fillRect(30, ground - 34, 120, 10);
    }
    else if (kind === 'office')
    {
        x.fillStyle = '#c7d3ea'; x.fillRect(0, 0, W, H);
        x.fillStyle = PX_OUT; x.fillRect(38, 18, 244, 104);
        const [win, wx] = scnCanvas(240, 100); scnSky(wx, 240, 100, ['#5aa0ff', '#cfe6ff']); scnSkyline(wx, 240, 100, pxRamp('#8197cf'), 17, '#fff4c2'); x.drawImage(win, 40, 20);
        x.fillStyle = '#8a5a3b'; x.fillRect(0, ground, W, H - ground); x.fillStyle = '#6b4329'; x.fillRect(0, ground, W, 4);
    }
    else
    {
        scnSkyline(x, W, ground, pxRamp(kind === 'night' ? '#2a3060' : kind === 'dusk' ? '#5a3a7a' : '#6f86c9'), kind.length * 7, kind === 'night' || kind === 'dusk' ? '#ffe28a' : '#eef3ff');
        x.fillStyle = kind === 'night' ? '#1f3324' : '#4caf45'; x.fillRect(0, ground, W, H - ground);
        if (kind === 'press') for (let i = 0; i < 9; i++) { x.fillStyle = '#ffffff'; const fx = 20 + i * 34, fy = 30 + (i * 37) % 60; x.fillRect(fx, fy, 3, 3); x.fillRect(fx - 3, fy + 1, 9, 1); x.fillRect(fx + 1, fy - 3, 1, 9); }
        if (kind === 'party') for (let i = 0; i < 120; i++) { x.fillStyle = pickOne(['#ffd23f', '#ff5d8f', '#7ed957', '#5fd1ff']); x.fillRect((i * 53) % W, (i * 29) % ground, 2, 3); }
    }
    const url = cv.toDataURL();
    PX_CACHE.set(key, url);
    return url;
}
