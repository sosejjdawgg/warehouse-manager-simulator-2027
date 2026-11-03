/*
    Warehouse Manager
    A deep logistics management sim with a Dinner Dash-style real-time shift.
    - src/data.js      data-driven content (zones, traits, facilities, rivals...)
    - src/model.js     career / management rules (the "Football Manager" layer)
    - src/shiftSim.js  the shift simulation ("match engine"), shared by play + simulate
    - src/floor.js     LittleJS rendering, drag-to-assign input and game feel
    - src/ui.js        HTML management screens, HUD, reports, cinematics
*/

'use strict';
setDebugWatermark(false);
setGLEnable(false);   // everything is Canvas2D: rounded, outlined, toy-like shapes
setCanvasClearColor(new Color(.55, .82, .48)); // grass around the warehouse
setFontDefault('"Trebuchet MS", "Segoe UI", Roboto, system-ui, sans-serif');

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    uiInit();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (wmMode === 'shift') shiftView.update();
    else
    {
        // calm animated backdrop behind the management screens
        cameraPos = vec2();
        setCameraScale(Math.max(mainCanvasSize.x / 40, mainCanvasSize.y / 26));
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost() {}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    if (wmMode === 'shift') { shiftView.render(); return; }
    // backdrop: a sunny, bouncy parade of parcels on conveyor belts
    const ctx = NX.world();
    const lanes = 7;
    for (let i = 0; i < lanes; i++)
    {
        const y = (i - (lanes - 1) / 2) * 3.8;
        const dir = i % 2 ? -1 : 1;
        NX.rr(ctx, 0, y - .2, 64, 1.3, .6, NX.SHADOW, null, 0);
        NX.rr(ctx, 0, y, 64, 1.3, .6, '#b6c2d6', NX.O, .12);
        const speed = 1.4 + (i % 3) * .5;
        for (let k = 0; k < 14; k++)
        {
            const x = ((k * 4.6 + timeReal * speed * dir + i * 1.7) % 64 + 64) % 64 - 32;
            const t = Object.keys(PACKAGE_TYPES)[(k + i) % 5];
            NX.box(ctx, x, y + .75 + Math.abs(Math.sin(timeReal * 4 + k + i)) * .12, .95, PACKAGE_TYPES[t].color);
        }
    }
    NX.done(ctx);
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    if (wmMode === 'shift') shiftView.renderPost();
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
