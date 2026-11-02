'use strict';
// ============================================================================
// Warehouse floor map — the physical layout shared by the simulation and the
// renderer. Logical coordinates, landscape orientation, Y up, plain {x,y}.
//
//      DOCK  [Inbound] | [Stow] | [Pick] | [Pack]
//            ===== north walkway (doors open here) ======
//   ║  >>>>>>>>>>>>>> MAIN FORKLIFT ROAD (eastbound) >>>>>>>>>  ║
//   ║        ===== south walkway (doors open here) =====        ║
//   ║        [Hazmat] | [QA] | [Maint.] | [Outbound]      BAY   ║
//   ║               corridors run down between zones            ║
//   ║  <<<<<<<<<<<<< LOWER FORKLIFT ROAD (westbound) <<<<<<<<  ║
//                     [        BREAK ROOM        ]
//
// Forklifts circulate one way round the loop. Walkers cross the roads only at
// zebra crossings in line with the corridors — or anywhere they like if they
// get impatient.
// ============================================================================

const WH_MAP = (()=>
{
    const W = 7.4, H = 5.6, G = 1.8, RW = 2.2, SW = .9;
    const colX = (c)=> (c - 1.5) * (W + G);
    const yN = RW/2 + SW/2;                 // north walkway centre
    const yS = -yN;                         // south walkway centre
    const yTopEdge = RW/2 + SW;             // lower edge of the top row
    const yTop = yTopEdge + H/2;
    const yBot = -yTop;
    const yBotEdge = -yTopEdge - H;         // lower edge of the bottom row
    const yL = yBotEdge - .5 - RW/2;        // lower road centre
    const yLN = yL + RW/2, yLS = yL - RW/2;
    const benchH = 2.8;
    const yBench = yLS - .6 - benchH/2;
    const xL = colX(0) - W/2 - .7 - RW/2;   // west road centre
    const xR = colX(3) + W/2 + .7 + RW/2;   // east road centre
    const corridors = [0, 1, 2].map(k => (colX(k) + colX(k + 1)) / 2);

    const grid = { blue:[0,1], green:[1,1], yellow:[2,1], orange:[3,1], purple:[0,0], grey:[1,0], black:[2,0], red:[3,0] };
    const rects = {};
    for (const z in grid)
    {
        const [c, top] = grid[z];
        rects[z] = { pos:{ x:colX(c), y: top ? yTop : yBot }, size:{ x:W, y:H }, top:!!top };
    }
    rects.bench = { pos:{ x:0, y:yBench }, size:{ x: xR - xL - RW - 1, y:benchH } };
    rects.dock  = { pos:{ x: xL - RW/2 - 1.5, y:yTop }, size:{ x:2.2, y:H } };
    rects.bay   = { pos:{ x: xR + RW/2 + 1.5, y:yBot }, size:{ x:2.2, y:H } };

    const roads =
    [
        { key:'main',  pos:{ x:(xL + xR)/2, y:0 },  size:{ x: xR - xL + RW, y:RW }, horiz:true,  dir:{ x:1,  y:0 } },
        { key:'lower', pos:{ x:(xL + xR)/2, y:yL }, size:{ x: xR - xL + RW, y:RW }, horiz:true,  dir:{ x:-1, y:0 } },
        { key:'west',  pos:{ x:xL, y:yL/2 },        size:{ x:RW, y: -yL + RW },     horiz:false, dir:{ x:0,  y:1 } },
        { key:'east',  pos:{ x:xR, y:yL/2 },        size:{ x:RW, y: -yL + RW },     horiz:false, dir:{ x:0,  y:-1 } },
    ];
    const walkways =
    [
        { pos:{ x:(colX(0) + colX(3))/2, y:yN }, size:{ x: colX(3) - colX(0) + W, y:SW - .1 } },
        { pos:{ x:(colX(0) + colX(3))/2, y:yS }, size:{ x: colX(3) - colX(0) + W, y:SW - .1 } },
        ...corridors.map(x => ({ pos:{ x, y:(yS + yLN)/2 }, size:{ x:G - .5, y: yS - yLN } })),
    ];

    // forklift loop (clockwise): east along main, south, west along lower, north
    const loopPts = [{ x:xL, y:0 }, { x:xR, y:0 }, { x:xR, y:yL }, { x:xL, y:yL }];
    const segLen = loopPts.map((p, i)=> { const q = loopPts[(i + 1) % 4]; return Math.abs(q.x - p.x) + Math.abs(q.y - p.y); });
    const loopLen = segLen.reduce((a, b)=> a + b, 0);
    function loopPos(s)
    {
        s = ((s % loopLen) + loopLen) % loopLen;
        for (let i = 0; i < 4; i++)
        {
            if (s <= segLen[i])
            {
                const p = loopPts[i], q = loopPts[(i + 1) % 4], t = s / segLen[i];
                return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, dx: Math.sign(q.x - p.x), dy: Math.sign(q.y - p.y) };
            }
            s -= segLen[i];
        }
        return { x:xL, y:0, dx:1, dy:0 };
    }

    // zebra crossings
    const crosswalks = [];
    corridors.forEach((x, k)=>
    {
        crosswalks.push({ id:crosswalks.length, road:'main',  x, y:0,  s: x - xL, a:{ x, y:yN }, b:{ x, y:yS }, users:0 });
        crosswalks.push({ id:crosswalks.length, road:'lower', x, y:yL, s: segLen[0] + segLen[1] + (xR - x), a:{ x, y:yLN + .35 }, b:{ x, y:yLS - .35 }, users:0 });
    });

    // ------------------------------------------------------------- walking graph
    const nodes = {};
    const edges = {};
    const addNode = (id, x, y)=> { nodes[id] = { id, x, y }; edges[id] = []; };
    const link = (a, b, cw = null)=>
    {
        const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) + (cw ? 2.5 : 0);
        edges[a].push({ to:b, d, cw });
        edges[b].push({ to:a, d, cw });
    };
    for (const z in grid)
    {
        const r = rects[z];
        addNode('door_' + z, r.pos.x, r.top ? yTopEdge : -yTopEdge);
        addNode('walk_' + z, r.pos.x, r.top ? yN : yS);
        link('door_' + z, 'walk_' + z);
    }
    corridors.forEach((x, k)=>
    {
        addNode('N' + k, x, yN);
        addNode('S' + k, x, yS);
        addNode('C' + k, x, yLN + .35);
        addNode('B' + k, x, yLS - .35);
        addNode('bench' + k, x, yLS - .9);
        link('N' + k, 'S' + k, crosswalks[k * 2]);
        link('S' + k, 'C' + k);
        link('C' + k, 'B' + k, crosswalks[k * 2 + 1]);
        link('B' + k, 'bench' + k);
    });
    // chain each walkway in x order
    for (const [pref, top] of [['N', true], ['S', false]])
    {
        const ids = [...Object.keys(grid).filter(z => rects[z].top === top).map(z => 'walk_' + z), ...corridors.map((x, k)=> pref + k)];
        ids.sort((a, b)=> nodes[a].x - nodes[b].x);
        for (let i = 0; i < ids.length - 1; i++) link(ids[i], ids[i + 1]);
    }
    // bench nodes connect inside the break room
    link('bench0', 'bench1'); link('bench1', 'bench2');

    const nodeFor = (key, benchK)=> key === 'bench' ? 'bench' + (benchK ?? 1) : 'door_' + key;

    // shortest path between two locations -> [{x, y, cw}] (cw = crossing needed to reach this point)
    function path(fromKey, toKey, fromBenchK)
    {
        const start = nodeFor(fromKey, fromBenchK);
        const targets = toKey === 'bench' ? ['bench0', 'bench1', 'bench2'] : ['door_' + toKey];
        const dist = { [start]:0 }, prev = {}, done = new Set();
        let end = null;
        while (true)
        {
            let u = null, best = Infinity;
            for (const id in dist) if (!done.has(id) && dist[id] < best) { best = dist[id]; u = id; }
            if (!u) break;
            if (targets.includes(u)) { end = u; break; }
            done.add(u);
            for (const e of edges[u])
            {
                const nd = dist[u] + e.d;
                if (nd < (dist[e.to] ?? Infinity)) { dist[e.to] = nd; prev[e.to] = { from:u, cw:e.cw }; }
            }
        }
        const out = [];
        for (let id = end; id && id !== start; id = prev[id]?.from)
            out.unshift({ x:nodes[id].x, y:nodes[id].y, cw:prev[id]?.cw || null, node:id });
        out.unshift({ x:nodes[start].x, y:nodes[start].y, cw:null, node:start });
        return out;
    }

    const xs = [rects.dock.pos.x - 1.2, rects.bay.pos.x + 1.2];
    const bounds = { minX: xs[0], maxX: xs[1], minY: yBench - benchH/2 - .3, maxY: yTop + H/2 + .3 };

    return { rects, roads, walkways, crosswalks, loopPos, loopLen, path, bounds, corridors, nodes, yN, yS, xL, xR, yL, RW };
})();
