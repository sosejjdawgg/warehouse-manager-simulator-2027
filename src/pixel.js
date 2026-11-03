'use strict';
// ============================================================================
// Pixel — an original pixel-art engine in the spirit of mid-90s arcade golf
// games: punchy hand-shaded portraits, dithered lighting, crisp outlines,
// banded metallic lettering and a 5x7 bitmap font.
//  - pixelPortrait(look, opts)   big shaded bust (64-grid, k=1..3)
//  - tinyFigure(opts)            16x24 full-body sprite (floor, crowds)
//  - pixelText(text, style)      chunky banded arcade lettering
//  - bmText(...)                 5x7 bitmap font for HUD-style captions
// Everything is generated procedurally from a staff member's look and cached.
// ============================================================================

// ---------------------------------------------------------------------------
// colour helpers
function pxRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function pxHsl(r, g, b)
{
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
}
function pxFromHsl(h, s, l)
{
    h = ((h % 1) + 1) % 1;
    const f = (n)=> { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `rgb(${f(0)},${f(8)},${f(4)})`;
}
// 5-tone ramp, dark → light, with arcade hue shifting (cool shadows, warm lights)
const PX_RAMPS = {};
function pxRamp(hex)
{
    if (PX_RAMPS[hex]) return PX_RAMPS[hex];
    const [h, s, l] = pxHsl(...pxRgb(hex));
    const tones = [[-.045, 1.05, .4], [-.022, 1.05, .66], [0, 1, 1], [.018, .95, 1.1], [.035, .85, 1.19]];
    return PX_RAMPS[hex] = tones.map(([dh, ds, dl])=> pxFromHsl(h + dh, Math.min(1, s * ds), Math.min(.9, Math.max(.06, l * dl + (dl > 1 ? .025 : 0)))));
}
const PX_OUT = '#160f24';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const bayer = (x, y)=> BAYER[(y & 3) * 4 + (x & 3)];

// ---------------------------------------------------------------------------
// raster buffer with regions (for crisp inner outlines between materials)
class PxBuf
{
    constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); this.r = new Int16Array(w * h); }
    set(x, y, color, region = 1)
    {
        x |= 0; y |= 0;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h || !color) return;
        this.c[y * this.w + x] = color; this.r[y * this.w + x] = region;
    }
    get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.c[y * this.w + x]; }
    reg(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.r[y * this.w + x]; }
    // lit ellipse: normal-based shading with ordered dithering
    ellipse(cx, cy, rx, ry, ramp, region, o = {})
    {
        const L = [-.7, -.5, .51], bias = o.bias || 0, pTop = o.pTop || 2, pBot = o.pBot || 2;
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
            {
                const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry;
                const p = dy > 0 ? pBot : pTop;
                if (Math.abs(dx) ** p + Math.abs(dy) ** p > 1) continue;
                if (o.clip && !o.clip(x, y, dx, dy)) continue;
                const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
                const i = dx * L[0] + dy * L[1] + nz * L[2];
                const lv = this.level((i * .5) * 1.4 + .5 + bias, x, y, ramp.length);
                this.set(x, y, ramp[lv], region);
            }
    }
    level(v, x, y, n = 5) { return Math.max(0, Math.min(n - 1, Math.floor(v * (n + .2) - .35 + (bayer(x, y) - .5) * .9))); }
    poly(pts, ramp, region, levelFn)
    {
        let y0 = Infinity, y1 = -Infinity;
        for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
        for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
        {
            const xs = [];
            for (let i = 0; i < pts.length; i++)
            {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5))
                    xs.push(a[0] + (y + .5 - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
            }
            xs.sort((p, q)=> p - q);
            for (let i = 0; i + 1 < xs.length; i += 2)
                for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++)
                {
                    const lv = typeof levelFn === 'function' ? levelFn(x, y) : levelFn ?? 2;
                    this.set(x, y, typeof lv === 'number' ? ramp[Math.max(0, Math.min(ramp.length - 1, lv))] : lv, region);
                }
        }
    }
    rect(x0, y0, w, h, color, region) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, color, region); }
    line(x0, y0, x1, y1, color, region = 99, thick = 1)
    {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;)
        {
            for (let t = 0; t < thick; t++) this.set(x0, y0 + t, color, region);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
    // outer outline + darker seams between different materials
    outline(color = PX_OUT, seams = true)
    {
        const add = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
        {
            if (this.get(x, y)) continue;
            if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
        }
        if (seams)
            for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
            {
                const r = this.reg(x, y);
                if (!r || r >= 90) continue;
                const rd = this.reg(x, y + 1), rr = this.reg(x + 1, y);
                if ((rd && rd < 90 && rd !== r && r > rd) || (rr && rr < 90 && rr !== r && r > rr)) add.push([x, y, 'seam']);
            }
        for (const [x, y, s] of add) this.set(x, y, s ? '#2a1830' : color, 98);
    }
    toCanvas(scale = 1)
    {
        const cv = document.createElement('canvas');
        cv.width = this.w * scale; cv.height = this.h * scale;
        const ctx = cv.getContext('2d');
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
        {
            const c = this.c[y * this.w + x];
            if (c) { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, scale, scale); }
        }
        return cv;
    }
}

// ---------------------------------------------------------------------------
// Big portraits (64-grid design, rasterised at k x resolution)
const PX_CACHE = new Map();
const MOOD_EXPR = { happy:'smile', sad:'sad', angry:'grit', shocked:'shout', neutral:'neutral', dizzy:'sad' };
function pixelPortrait(look, o = {})
{
    look = look || { skin:1, hair:0, style:0, hat:0, acc:0 };
    const k = o.k || 1, expr = o.expr || MOOD_EXPR[o.mood] || 'neutral';
    const key = `P|${k}|${look.skin},${look.hair},${look.style},${look.hat},${look.acc}|${expr}|${o.shirt}|${o.hat !== false}|${o.pose || ''}|${o.hivis ? 1 : 0}`;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const S = 64 * k, b = new PxBuf(S, S);
    const g = (v)=> v * k; // grid → pixels
    const skin = pxRamp(LOOK_SKIN[look.skin] || LOOK_SKIN[1]);
    const hair = pxRamp(LOOK_HAIR[look.hair] || LOOK_HAIR[0]);
    const shirt = pxRamp(o.shirt || '#e8742a');
    const hatR = pxRamp(LOOK_HAT[look.hat] || LOOK_HAT[0]);
    const wantsHat = o.hat !== false;
    const R = { shirt:10, skin:20, hairBack:5, hair:30, hat:40, acc:50 };
    const feat = (x, y, w, h, c)=> b.rect(Math.round(g(x)), Math.round(g(y)), Math.max(1, Math.round(g(w))), Math.max(1, Math.round(g(h))), c, 99);
    const fline = (x0, y0, x1, y1, c, t = 1)=> b.line(g(x0), g(y0), g(x1), g(y1), c, 99, Math.max(1, Math.round(t * k)));

    // long hair / bob behind everything
    if (look.style === 4) b.ellipse(g(32), g(34), g(19), g(26), hair, R.hairBack, { pTop:2, pBot:3, clip:(x, y)=> y > g(12) });
    if (look.style === 2) b.ellipse(g(32), g(27), g(17.5), g(18), hair, R.hairBack);
    if (look.style === 3 && !wantsHat) b.ellipse(g(32), g(7), g(6.5), g(6), hair, R.hairBack);

    // torso: polo shirt, shaded from the left
    const torso = [[0, 64], [2, 56], [13, 50], [25, 47.5], [39, 47.5], [51, 50], [62, 56], [64, 64]].map(([x, y])=> [g(x), g(y)]);
    b.poly(torso, shirt, R.shirt, (x, y)=> b.level(.95 - x / S * .75 - (y - g(48)) / S * .5 + (Math.sin(x / g(6)) > .85 ? -.25 : 0), x, y));
    if (o.hivis)
    {
        b.poly([[g(4), g(57)], [g(60), g(57)], [g(61), g(61)], [g(3), g(61)]], pxRamp('#ffe23a'), R.shirt + 1, (x, y)=> b.level(.9 - x / S * .5, x, y));
        feat(4, 58.5, 56, 1, '#e8eef6');
    }
    // neck
    b.poly([[g(26.5), g(37)], [g(37.5), g(37)], [g(38.5), g(50)], [g(25.5), g(50)]], skin, R.skin, (x, y)=> y < g(43) ? 0 : b.level(.42 - x / S * .3, x, y));
    // collar
    const col = shirt;
    b.poly([[g(22), g(46.5)], [g(31.5), g(53)], [g(28.5), g(46)]], col, R.shirt + 2, 4);
    b.poly([[g(42), g(46.5)], [g(32.5), g(53)], [g(35.5), g(46)]], col, R.shirt + 2, 3);
    fline(32, 53, 32, 62, shirt[0]);
    feat(31.5, 56, 1, 1, shirt[4]); feat(31.5, 59, 1, 1, shirt[4]);

    // ears & head (squared jaw)
    b.ellipse(g(19.4), g(28.5), g(2.6), g(4), skin, R.skin, { bias:-.12 });
    b.ellipse(g(44.6), g(28.5), g(2.6), g(4), skin, R.skin, { bias:-.25 });
    b.ellipse(g(32), g(26), g(12.9), g(15.6), skin, R.skin, { pTop:2, pBot:3.1 });
    // cheekbone & temple shadows on the far side give the face its punch
    for (let y = g(27); y < g(36); y++) for (let x = g(40); x < g(44); x++) if (b.get(x, y) && bayer(x, y) < .55) b.set(x, y, skin[1], R.skin);
    // jaw shadow & cheekbone accent
    for (let x = g(22); x < g(42); x++) { const yy = g(40.2) + Math.abs(x - g(32)) / g(10) * -g(1.5); b.set(x, yy, skin[0], 99); }

    // hair on top of the head
    const inHead = (x, y)=> { const dx = (x + .5 - g(32)) / g(13.6), dy = (y + .5 - g(26.5)) / g(16.2); return dx * dx + dy * dy <= 1.05; };
    if (!wantsHat)
    {
        if (look.style === 0 || look.style === 3) b.ellipse(g(32), g(19), g(14.4), g(9), hair, R.hair, { clip:(x, y)=> y < g(19.5) + Math.abs(x - g(32)) / g(14) * g(4) });
        if (look.style === 1)
        {
            b.ellipse(g(32), g(18), g(15), g(8.5), hair, R.hair, { clip:(x, y)=> y < g(20.5) });
            for (const [tx, ty] of [[18, 7], [24, 3], [31, 1.5], [38, 3], [45, 7]])
                b.poly([[g(tx - 4), g(14)], [g(tx), g(ty)], [g(tx + 4), g(14)]], hair, R.hair, (x, y)=> b.level(.75 - (x - g(tx)) / g(10), x, y));
        }
        if (look.style === 2) b.ellipse(g(32), g(17), g(15.2), g(8), hair, R.hair, { clip:(x, y)=> y < g(19) + Math.sin(x / g(2.2)) * g(1) });
        if (look.style === 4) b.ellipse(g(32), g(17), g(15), g(8), hair, R.hair, { clip:(x, y)=> y < g(18.5) });
        if (look.style === 5) // bald: polished dome with a shine
        {
            feat(23, 13, 4, 1, skin[4]); feat(22, 14, 2, 2, skin[4]); feat(27, 12, 2, 1, skin[3]);
        }
        // sideburns
        if (look.style !== 5) { b.rect(g(18), g(21), g(2.5), g(7), hair[1], R.hair); b.rect(g(43.5), g(21), g(2.5), g(7), hair[0], R.hair); }
    }
    else
    {
        // hair peeking out under the hard hat
        if (look.style !== 5) { b.rect(g(18), g(18), g(3), g(8), hair[1], R.hair); b.rect(g(43), g(18), g(3), g(8), hair[0], R.hair); }
        if (look.style === 4 || look.style === 2) { b.rect(g(17), g(24), g(3), g(12), hair[1], R.hair); b.rect(g(44), g(24), g(3), g(12), hair[0], R.hair); }
    }

    // ---- face features
    const D = PX_OUT, brow = look.style === 5 ? skin[0] : hair[0];
    const ex = { neutral:0, smile:0, grin:0, shout:0, grit:0, sad:0 };
    // brows
    if (expr === 'grit' || expr === 'shout') { fline(22.5, 21, 29, 24, brow, 2); fline(41.5, 21, 35, 24, brow, 2); }
    else if (expr === 'sad') { fline(22.5, 23.5, 29, 21, brow, 2); fline(41.5, 23.5, 35, 21, brow, 2); }
    else { fline(22.5, 22.5, 29, 21.5, brow, 2); fline(35, 21.5, 41.5, 22.5, brow, 2); }
    // eyes
    const eye = (cx, dir)=>
    {
        if (expr === 'shout') { fline(cx - 3, 24.5, cx, 26.5, D); fline(cx, 26.5, cx + 3, 24.5 + (dir > 0 ? 0 : 0), D); fline(cx - 3, 27.5, cx + 3, 27.5, D); return; }
        if (expr === 'smile' || expr === 'grin') { fline(cx - 3, 27, cx - 1.5, 25.5, D); fline(cx - 1.5, 25.5, cx + 1.5, 25.5, D); fline(cx + 1.5, 25.5, cx + 3, 27, D); feat(cx - 2, 27.5, 4, 1, skin[1]); return; }
        const h = expr === 'grit' ? 1.6 : 2.4;
        feat(cx - 3, 25, 6, h, '#f4f2ee');
        feat(cx - 3, 24.5, 6, 1, D);
        const px = expr === 'sad' ? cx - .5 : cx - 1 + dir * .5;
        feat(px, expr === 'sad' ? 25.8 : 25, 2, h, '#2a2440');
        feat(px, 25, 1, 1, '#ffffff');
        if (expr === 'sad') feat(cx - 3, 27.5, 6, 1, skin[1]);
    };
    eye(25.5, 1); eye(38.5, -1);
    // nose
    fline(33.5, 26, 34.5, 31, skin[1]);
    feat(30, 32, 1.4, 1, skin[0]); feat(33.5, 32, 1.4, 1, skin[0]);
    feat(31, 29, 1, 2, skin[4]);
    // cheeks (subtle blush / definition)
    feat(21.5, 31, 3, 1, skin[1]); feat(39.5, 31, 3, 1, skin[1]);
    // mouth
    const lip = '#7a2a2a', mouthIn = '#3a0a14', teeth = '#fbf6ea', tongue = '#e0566a';
    if (expr === 'shout')
    {
        b.ellipse(g(32), g(36.6), g(5.4), g(4.6), [mouthIn, mouthIn, mouthIn, mouthIn, mouthIn], 99);
        feat(28, 32.5, 8, 1.6, teeth); feat(29.5, 38.4, 5, 1.6, tongue);
        fline(26.5, 35, 28, 32.5, lip); fline(37.5, 35, 36, 32.5, lip);
    }
    else if (expr === 'grin')
    {
        b.poly([[g(26.5), g(34)], [g(37.5), g(34)], [g(35), g(38.2)], [g(29), g(38.2)]], [mouthIn, mouthIn, mouthIn, mouthIn, mouthIn], 99, 2);
        feat(27.5, 34, 9, 1.8, teeth); fline(27, 34, 37, 34, lip); feat(25.5, 33, 1.5, 1, D); feat(37, 33, 1.5, 1, D);
    }
    else if (expr === 'smile')
    {
        fline(26.5, 34, 28.5, 36, D); fline(28.5, 36, 35.5, 36, D); fline(35.5, 36, 37.5, 34, D);
        feat(29, 35, 6, 1, teeth); feat(29, 37, 6, 1, skin[1]);
    }
    else if (expr === 'grit')
    {
        feat(27, 34.5, 10, 3, teeth);
        for (let x = 28.5; x < 37; x += 2) feat(x, 34.5, .7, 3, '#b9b2a6');
        fline(27, 34, 37, 34, D); fline(27, 37.5, 37, 37.5, D);
    }
    else if (expr === 'sad') { fline(27.5, 37, 29.5, 35.5, D); fline(29.5, 35.5, 34.5, 35.5, D); fline(34.5, 35.5, 36.5, 37, D); }
    else { fline(28, 35.5, 36, 35.5, D); feat(29, 36.5, 6, 1, skin[1]); }

    // accessories
    const a = look.acc;
    if (a === 1) { for (const cx of [25.5, 38.5]) { fline(cx - 4, 23.5, cx + 4, 23.5, D); fline(cx - 4, 28.5, cx + 4, 28.5, D); fline(cx - 4, 23.5, cx - 4, 28.5, D); fline(cx + 4, 23.5, cx + 4, 28.5, D); feat(cx - 3, 24.5, 1, 1, '#cfe8ff'); } fline(29.5, 25, 34.5, 25, D); }
    if (a === 2) b.ellipse(g(32), g(36.5), g(12.5), g(9.5), hair, R.acc, { clip:(x, y)=> y > g(31.5) && inHead(x, y) && !(Math.abs(x - g(32)) < g(5) && y > g(33) && y < g(38)) });
    if (a === 2 || a === 3) { b.poly([[g(26), g(34)], [g(32), g(32)], [g(38), g(34)], [g(37), g(35)], [g(32), g(33.5)], [g(27), g(35)]], hair, R.acc, 1); }
    if (a === 4 && !wantsHat) { b.ellipse(g(32), g(14), g(16), g(9), pxRamp('#3b3f55'), R.acc, { clip:(x, y, dx, dy)=> dy < 0 && dx * dx + dy * dy > .7 }); b.ellipse(g(17.5), g(29), g(3.4), g(5), pxRamp('#ef4444'), R.acc + 1); b.ellipse(g(46.5), g(29), g(3.4), g(5), pxRamp('#ef4444'), R.acc + 1); }
    if (a === 5 && !wantsHat) { b.poly([[g(17.5), g(17)], [g(46.5), g(17)], [g(46.5), g(20.5)], [g(17.5), g(20.5)]], pxRamp('#e11d48'), R.acc, (x, y)=> b.level(.85 - x / S * .6, x, y)); b.poly([[g(45), g(18)], [g(51), g(15)], [g(50), g(22)]], pxRamp('#e11d48'), R.acc, 1); }

    // hard hat
    if (wantsHat)
    {
        b.ellipse(g(32), g(17.5), g(15.5), g(10.5), hatR, R.hat, { clip:(x, y)=> y < g(17.5) });
        b.poly([[g(14), g(16)], [g(50), g(16)], [g(51), g(19)], [g(13), g(19)]], hatR, R.hat, (x, y)=> b.level(.7 - x / S * .5, x, y));
        b.rect(g(30.5), g(7.5), g(3), g(9), hatR[3], R.hat);
        feat(22, 11, 4, 1, hatR[4]); feat(20, 12.5, 2, 1, hatR[4]);
    }

    // celebratory / furious fist
    if (o.pose === 'fist')
    {
        b.poly([[g(45), g(54)], [g(57), g(50)], [g(60), g(38)], [g(52), g(36)], [g(49), g(46)]], shirt, R.shirt + 3, (x, y)=> b.level(.6 - x / S * .3, x, y));
        b.poly([[g(51), g(38)], [g(59), g(39)], [g(60), g(31)], [g(53), g(30)]], skin, R.skin + 1, (x, y)=> b.level(.7 - x / S * .4, x, y));
        b.ellipse(g(55.5), g(27), g(6), g(5.6), skin, R.skin + 2, { bias:.05 });
        for (const yy of [24.5, 27, 29.5]) fline(50, yy, 54, yy, skin[0]);
        fline(50, 23, 55, 21.5, skin[4]);
    }

    b.outline();
    const cv = b.toCanvas();
    PX_CACHE.set(key, cv);
    return cv;
}
function portraitURL(look, o = {})
{
    const key = 'U|' + JSON.stringify([look, o]);
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const url = pixelPortrait(look, o).toDataURL();
    PX_CACHE.set(key, url);
    return url;
}
// Drop-in replacement for the old SVG avatars: a crisp pixel portrait <img>
function avatarSvg(look, opts = {})
{
    const size = opts.size || 64;
    const url = portraitURL(look, { mood:opts.mood || 'neutral', shirt:opts.vest || '#e8742a', hat:opts.hat !== false, hivis:opts.hivis, pose:opts.pose, k:size > 120 ? 2 : 1 });
    return `<img class="ava pix" src="${url}" width="${size}" height="${size}" alt="">`;
}

// ---------------------------------------------------------------------------
// Tiny full-body sprite (16x24) for the floor and crowds
function tinyFigure(o)
{
    const look = o.look || { skin:1, hair:0, style:0, hat:0, acc:0 };
    const frame = o.frame || 'idle';
    const key = `T|${look.skin},${look.hair},${look.style},${look.hat},${look.acc}|${o.shirt}|${o.pants}|${o.hat ? 1 : 0}|${o.hivis ? 1 : 0}|${frame}|${o.mood || ''}`;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const b = new PxBuf(16, 24);
    const skin = pxRamp(LOOK_SKIN[look.skin] || LOOK_SKIN[1]), hair = pxRamp(LOOK_HAIR[look.hair] || LOOK_HAIR[0]);
    const shirt = pxRamp(o.shirt || '#e8742a'), pants = pxRamp(o.pants || '#34406a'), hat = pxRamp(LOOK_HAT[look.hat] || LOOK_HAT[0]);
    const D = PX_OUT;
    // legs
    const step = frame === 'walk1' ? 1 : frame === 'walk2' ? -1 : 0;
    b.rect(5 + (step > 0 ? -1 : 0), 18, 3, 4, pants[1], 10); b.rect(9 + (step < 0 ? 1 : 0), 18, 3, 4, pants[2], 10);
    b.rect(4 + (step > 0 ? -1 : 0), 22, 4, 2, '#2a2230', 11); b.rect(9 + (step < 0 ? 1 : 0), 22, 4, 2, '#2a2230', 11);
    // long hair behind
    if (look.style === 4) b.rect(3, 4, 10, 9, hair[1], 5);
    // torso
    for (let y = 11; y < 18; y++) for (let x = 4; x < 12; x++) b.set(x, y, shirt[b.level(.9 - x / 16 * .7, x, y)], 20);
    b.set(6, 11, shirt[4], 21); b.set(9, 11, shirt[4], 21);
    if (o.hivis) { for (let x = 4; x < 12; x++) { b.set(x, 15, '#ffe23a', 22); } b.set(7, 15, '#e8eef6', 22); b.set(8, 15, '#e8eef6', 22); }
    // arms
    const arm = (x, y0, y1, side)=> { for (let y = y0; y < y1; y++) b.set(x, y, shirt[side < 0 ? 3 : 1], 23); b.set(x, y1, skin[2], 24); };
    if (frame === 'cheer') { for (let y = 5; y < 12; y++) { b.set(2, y, shirt[3], 23); b.set(13, y, shirt[1], 23); } b.rect(1, 3, 2, 2, skin[3], 24); b.rect(13, 3, 2, 2, skin[2], 24); }
    else if (frame === 'clap1') { b.set(3, 12, shirt[3], 23); b.set(12, 12, shirt[1], 23); b.rect(7, 13, 2, 2, skin[3], 24); b.set(4, 13, shirt[3], 23); b.set(11, 13, shirt[1], 23); b.set(5, 13, skin[3], 24); b.set(10, 13, skin[2], 24); b.set(6, 13, skin[3], 24); b.set(9, 13, skin[2], 24); }
    else if (frame === 'clap2') { arm(3, 12, 15, -1); arm(12, 12, 15, 1); }
    else if (frame === 'cross') { b.rect(4, 13, 8, 2, shirt[3], 23); b.set(4, 13, skin[3], 24); b.set(11, 14, skin[2], 24); }
    else if (frame === 'work1' || frame === 'work2') { const up = frame === 'work1' ? 0 : 1; b.set(3, 12, shirt[3], 23); b.set(12, 12, shirt[1], 23); b.rect(3, 13 + up, 2, 1, skin[3], 24); b.rect(11, 13 + up, 2, 1, skin[2], 24); }
    else { arm(3, 12, 16 + (step > 0 ? -1 : 0), -1); arm(12, 12, 16 + (step < 0 ? -1 : 0), 1); }
    // neck & head
    b.rect(7, 10, 2, 1, skin[1], 30);
    b.ellipse(8, 6.6, 3.9, 4.1, skin, 31, { bias:.28 });
    // hair
    if (!o.hat)
    {
        if (look.style === 1) { b.rect(4, 2, 8, 2, hair[2], 32); b.set(5, 1, hair[3], 32); b.set(8, 0, hair[3], 32); b.set(10, 1, hair[2], 32); }
        else if (look.style !== 5) { b.rect(4, 2, 8, 2, hair[2], 32); b.set(5, 2, hair[3], 32); }
        if (look.style === 3) b.rect(7, 0, 3, 2, hair[2], 32);
        if (look.style === 5) b.set(6, 3, skin[4], 31);
    }
    if (look.style !== 5) { b.set(4, 5, hair[1], 32); b.set(11, 5, hair[0], 32); if (look.style === 2 || look.style === 4) { b.rect(3, 4, 1, 5, hair[1], 32); b.rect(12, 4, 1, 5, hair[0], 32); } }
    // hard hat
    if (o.hat) { b.rect(5, 1, 6, 1, hat[3], 33); b.rect(4, 2, 8, 2, hat[2], 33); b.rect(3, 4, 10, 1, hat[1], 33); b.set(5, 2, hat[4], 33); }
    // face
    const m = o.mood;
    if (m === 'happy') { b.set(6, 6, D, 99); b.set(9, 6, D, 99); b.set(6, 8, D, 99); b.set(7, 9, D, 99); b.set(8, 9, D, 99); b.set(9, 8, D, 99); }
    else if (m === 'shocked') { b.set(6, 6, D, 99); b.set(9, 6, D, 99); b.rect(7, 8, 2, 2, '#3a0a14', 99); }
    else if (m === 'sad' || m === 'dizzy') { b.set(6, 7, D, 99); b.set(9, 7, D, 99); b.set(7, 9, D, 99); b.set(8, 9, D, 99); b.set(6, 10, D, 99); b.set(9, 10, D, 99); }
    else if (m === 'angry') { b.set(6, 7, D, 99); b.set(9, 7, D, 99); b.set(5, 5, D, 99); b.set(10, 5, D, 99); b.set(7, 9, D, 99); b.set(8, 9, D, 99); }
    else { b.set(6, 6, D, 99); b.set(9, 6, D, 99); b.set(7, 9, skin[0], 99); b.set(8, 9, skin[0], 99); }
    if (look.acc === 2 || look.acc === 3) { b.set(7, 8, hair[1], 99); b.set(8, 8, hair[1], 99); if (look.acc === 2) { b.set(6, 9, hair[1], 99); b.set(9, 9, hair[1], 99); b.set(7, 10, hair[0], 99); b.set(8, 10, hair[0], 99); } }
    if (look.acc === 1) { b.set(5, 6, '#9fb3d1', 99); b.set(10, 6, '#9fb3d1', 99); b.set(7, 6, D, 99); b.set(8, 6, D, 99); }
    b.outline(PX_OUT, false);
    const cv = b.toCanvas();
    PX_CACHE.set(key, cv);
    return cv;
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font
const BM_GLYPHS =
{
    A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14], D:[28,18,17,17,17,18,28], E:[31,16,16,30,16,16,31],
    F:[31,16,16,30,16,16,16], G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17], I:[14,4,4,4,4,4,14], J:[7,2,2,2,2,18,12],
    K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31], M:[17,27,21,21,17,17,17], N:[17,17,25,21,19,17,17], O:[14,17,17,17,17,17,14],
    P:[30,17,17,30,16,16,16], Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17], S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4],
    U:[17,17,17,17,17,17,14], V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17], Y:[17,17,10,4,4,4,4],
    Z:[31,1,2,4,8,16,31], 0:[14,17,19,21,25,17,14], 1:[4,12,4,4,4,4,14], 2:[14,17,1,2,4,8,31], 3:[31,2,4,2,1,17,14],
    4:[2,6,10,18,31,2,2], 5:[31,16,30,1,1,17,14], 6:[6,8,16,30,17,17,14], 7:[31,1,2,4,8,8,8], 8:[14,17,17,14,17,17,14],
    9:[14,17,17,15,1,2,12], ' ':[0,0,0,0,0,0,0], '.':[0,0,0,0,0,12,12], ',':[0,0,0,0,12,4,8], '!':[4,4,4,4,4,0,4],
    '?':[14,17,1,2,4,0,4], "'":[4,4,8,0,0,0,0], '-':[0,0,0,31,0,0,0], ':':[0,12,12,0,12,12,0], '/':[1,1,2,4,8,16,16],
    '+':[0,4,4,31,4,4,0], '%':[24,25,2,4,8,19,3], '$':[4,15,20,14,5,30,4], '&':[12,18,20,8,21,18,13], '(':[2,4,8,8,8,4,2],
    ')':[8,4,2,2,2,4,8], '"':[10,10,0,0,0,0,0], '#':[10,10,31,10,31,10,10], '*':[0,4,21,14,21,4,0], '=':[0,0,31,0,31,0,0],
    '<':[2,4,8,16,8,4,2], '>':[8,4,2,1,2,4,8], '·':[0,0,0,4,0,0,0], '©':[14,17,22,20,22,17,14], '★':[4,4,31,14,14,27,17], '→':[0,4,2,31,2,4,0], '_':[0,0,0,0,0,0,31],
};
function bmWidth(text, s = 1) { return String(text).length * 6 * s - s; }
function bmText(ctx, text, x, y, color = '#fff', s = 1, shadow = '#000', align = 'left')
{
    text = String(text).toUpperCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/—|–/g, '-');
    if (align === 'center') x -= bmWidth(text, s) / 2; else if (align === 'right') x -= bmWidth(text, s);
    x = Math.round(x); y = Math.round(y);
    const draw = (ox, oy, c)=>
    {
        ctx.fillStyle = c;
        for (let i = 0; i < text.length; i++)
        {
            const gl = BM_GLYPHS[text[i]] || BM_GLYPHS['?'];
            for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (gl[r] & (16 >> col)) ctx.fillRect(ox + (i * 6 + col) * s, oy + r * s, s, s);
        }
    };
    if (shadow) draw(x + s, y + s, shadow);
    draw(x, y, color);
}
// wrap text into lines that fit a pixel width
function bmWrap(text, maxW, s = 1)
{
    const words = String(text).split(' '), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (bmWidth(t, s) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
}

// ---------------------------------------------------------------------------
// Banded arcade lettering
const PX_TEXT_STYLES =
{
    blue:   { bands:['#f2fbff','#a8e4ff','#5cbcff','#2a86f0','#1a58cc','#0e2f8a'], out:'#060a2e' },
    gold:   { bands:['#fffbe2','#ffe682','#ffc935','#ff9d1a','#e2620c','#9e3504'], out:'#2e0c02' },
    red:    { bands:['#ffe6e6','#ff9e9e','#ff5050','#e01e2b','#a3101b','#5c0610'], out:'#200206' },
    green:  { bands:['#f2ffe4','#bcf59e','#72dc4c','#30b32f','#1c7e22','#0d4a14'], out:'#041a06' },
    purple: { bands:['#f8ecff','#d8aaff','#b26cff','#8a3be8','#5f1fb0','#331066'], out:'#110424' },
    silver: { bands:['#ffffff','#eef2f7','#c9d1de','#9ca8bc','#6f7b94','#454e66'], out:'#0f1326' },
    rainbow:{ bands:['#ff5d8f','#ff9a3d','#ffe14d','#6ee66a','#4fb6ff','#a66bff'], out:'#140a2a' },
};
function pixelText(text, style = 'gold', px = 30)
{
    const key = `X|${text}|${style}|${px}`;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const st = PX_TEXT_STYLES[style] || PX_TEXT_STYLES.gold;
    const font = `italic 900 ${px}px "Arial Black", "Helvetica Neue", Impact, sans-serif`;
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    const tw = Math.ceil(m.measureText(text).width + px * .4);
    const W = tw + 12, H = Math.ceil(px * 1.35) + 12;
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    const tc = t.getContext('2d'); tc.font = font; tc.textBaseline = 'middle'; tc.fillStyle = '#fff';
    tc.fillText(text, 6, H / 2);
    const src = tc.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    let y0 = H, y1 = 0;
    for (let i = 0; i < W * H; i++) if (src[i * 4 + 3] > 120) { mask[i] = 1; const y = (i / W) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const has = (x, y)=> x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
    const out = document.createElement('canvas'); out.width = W + 4; out.height = H + 4;
    const o = out.getContext('2d');
    const plot = (x, y, c)=> { o.fillStyle = c; o.fillRect(x, y, 1, 1); };
    // shadow, thick outline, banded fill, top-edge highlight
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    {
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && has(x + dx, y + dy)) near = true;
        if (near) { plot(x + 3, y + 3, 'rgba(0,0,0,.55)'); }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    {
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && has(x + dx, y + dy)) near = true;
        if (near) plot(x, y, st.out);
    }
    const n = st.bands.length;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    {
        if (!has(x, y)) continue;
        const f = (y - y0) / Math.max(1, y1 - y0);
        let c = st.bands[Math.min(n - 1, Math.floor(f * n))];
        if (!has(x, y - 1) || !has(x, y - 2)) c = '#ffffff';
        else if (!has(x, y + 1)) c = st.bands[n - 1];
        else if (Math.abs(f - .5) < .04) c = st.bands[Math.max(0, Math.floor(n / 2) - 2)]; // horizon glint
        plot(x, y, c);
    }
    PX_CACHE.set(key, out);
    return out;
}
function pixelTextURL(text, style, px) { const k = `XU|${text}|${style}|${px}`; if (!PX_CACHE.has(k)) PX_CACHE.set(k, pixelText(text, style, px).toDataURL()); return PX_CACHE.get(k); }
