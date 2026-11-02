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
setCanvasClearColor(new Color(.043, .059, .09));

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
    // backdrop: conveyor lanes carrying parcels through the colour zones
    const lanes = 7;
    for (let i = 0; i < lanes; i++)
    {
        const y = (i - (lanes - 1) / 2) * 3.6;
        const dir = i % 2 ? -1 : 1;
        drawRect(vec2(0, y), vec2(60, 1.1), new Color(.12, .15, .2));
        const z = ZONE_KEYS[i % ZONE_KEYS.length];
        drawRect(vec2(0, y - .7), vec2(60, .12), WM_ZONE_COLORS[z].withAlpha(.5));
        const speed = 1.2 + (i % 3) * .5;
        for (let k = 0; k < 14; k++)
        {
            const x = ((k * 4.3 + timeReal * speed * dir + i * 1.7) % 60 + 60) % 60 - 30;
            const t = Object.keys(PACKAGE_TYPES)[(k + i) % 5];
            drawRect(vec2(x, y + .15), vec2(.9, .8), WM_PKG_COLORS[t].withAlpha(.75));
            drawRect(vec2(x, y + .2), vec2(.9, .1), new Color(0, 0, 0, .2));
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    if (wmMode === 'shift') shiftView.renderPost();
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
