'use strict';
// ============================================================================
// Title screen, SELECT YOUR MANAGER, and About & Legal.
// ============================================================================

function bmURL(text, color = '#ffd23f', s = 2, shadow = '#140a2a')
{
    const key = `BM|${text}|${color}|${s}|${shadow}`;
    if (PX_CACHE.has(key)) return PX_CACHE.get(key);
    const [cv, x] = scnCanvas(bmWidth(text, s) + s * 2, 8 * s);
    bmText(x, text, 0, 0, color, s, shadow);
    const url = cv.toDataURL(); PX_CACHE.set(key, url); return url;
}
const pxImg = (url, cls = '', alt = '')=> `<img class="pix ${cls}" src="${url}" alt="${esc(alt)}">`;
const LEGAL_LINE = ()=> `© ${GAME_LEGAL.year} ${GAME_LEGAL.author.toUpperCase()}. ALL RIGHTS RESERVED.`;

// ---------------------------------------------------------------------------
// Title
function showTitle()
{
    setMode('title');
    const cont = hasSave();
    $('#screen').innerHTML = `
    <div class="title arcade">
        <div class="logoPx">
            ${pxImg(pixelTextURL('WAREHOUSE', 'gold', 44), 'l1', 'Warehouse')}
            ${pxImg(pixelTextURL('MANAGER', 'blue', 44), 'l2', 'Manager')}
            <div class="logoPhil">${avatarSvg(MANAGER_PRESETS[0].look, { size:128, mood:'happy', vest:'#e8742a', hat:false, pose:'fist' })}</div>
        </div>
        ${pxImg(bmURL('RUN THE FLOOR · RAISE YOUR CREW · BUILD AN EMPIRE', '#ffffff', 2), 'tag', 'Run the floor, raise your crew, build an empire')}
        <div class="pressStart">${pxImg(bmURL('PRESS START', '#ffd23f', 3), '', 'Press start')}</div>
        <div class="titleBtns">
            ${cont ? `<button class="big primary" data-act="continue">▶ CONTINUE</button>` : ''}
            <button class="big ${cont ? '' : 'primary'}" data-act="selectMgr">✚ NEW CAREER</button>
            <button class="ghost" data-act="legal">About &amp; legal</button>
            <label class="row soundRow"><input type="checkbox" id="optSound" ${wmSettings.sound ? 'checked' : ''}> Sound</label>
        </div>
        <div class="copyright">${pxImg(bmURL(LEGAL_LINE(), '#ffffff', 1, '#000'), '', LEGAL_LINE())}<br><span>${GAME_LEGAL.title} (${GAME_LEGAL.version}) · Built with LittleJS · All companies and people are fictional</span></div>
    </div>`;
}

// ---------------------------------------------------------------------------
// SELECT YOUR MANAGER
let wmMgrPick = 'phil';
let wmCustomLook = null;
function showManagerSelect()
{
    setMode('title');
    const p = MANAGER_PRESETS.find(m => m.id === wmMgrPick) || MANAGER_PRESETS[0];
    wmCustomLook ??= randomLook();
    const lookOf = (m)=> m.look || wmCustomLook;
    const bar = (label, v, col)=> `<div class="sbar"><span>${label}</span><i>${[1, 2, 3, 4, 5].map(i => `<b style="background:${i <= v ? col : 'transparent'}"></b>`).join('')}</i></div>`;
    $('#screen').innerHTML = `
    <div class="select arcade">
        <div class="selTitle">${pxImg(pixelTextURL('SELECT YOUR MANAGER', 'gold', 34), '', 'Select your manager')}</div>
        <div class="mgrGrid">${MANAGER_PRESETS.map(m => `
            <button class="mcard ${m.id === wmMgrPick ? 'on' : ''}" data-act="pickMgr" data-id="${m.id}" style="--panel:${m.panel}">
                ${m.id === wmMgrPick ? `<span class="p1">${pxImg(bmURL('P1', '#140a2a', 2, null))}<i></i></span>` : ''}
                <span class="mframe">${avatarSvg(lookOf(m), { size:128, mood: m.expr === 'grit' ? 'angry' : m.expr === 'smile' ? 'happy' : m.expr === 'grin' ? 'happy' : 'neutral', vest:m.shirt, hat:false, pose: m.id === wmMgrPick ? 'fist' : '' })}</span>
                ${pxImg(bmURL(m.title, '#ffd23f', 2), 'mlabel', m.title)}
            </button>`).join('')}</div>
        <div class="selInfo card">
            <div class="selHead">
                <div>${pxImg(bmURL(p.id === 'custom' ? 'YOUR MANAGER' : p.name.toUpperCase(), '#ffffff', 3), '', p.name)}
                ${pxImg(bmURL(p.title, '#ffd23f', 2), '', p.title)}</div>
            </div>
            <div class="sbars">${bar('SPEED', p.stats.speed, '#ff4d4d')}${bar('SAFETY', p.stats.safety, '#ffd23f')}${bar('MONEY', p.stats.money, '#7ed957')}${bar('PEOPLE', p.stats.people, '#5fd1ff')}${bar('YOUTH', p.stats.youth, '#4b6bd9')}</div>
            <p>${esc(p.blurb)}</p>
            ${perkText(p)}
            ${p.id === 'custom' ? `<details open><summary>🎨 Design your manager</summary>${lookPickerHtml(wmCustomLook, 'custom')}<button class="ghost" data-act="lookRandom" data-p="custom">🎲 Randomise</button></details>` : ''}
            <label>Your name<input id="inName" maxlength="24" value="${esc(p.id === 'custom' ? 'Alex Morgan' : p.name)}"></label>
            <label>Company name<input id="inCo" maxlength="28" value="Northbridge Logistics"></label>
            <div class="lpRow"><span>Company colour</span><div class="lpOpts">${COMPANY_HEXES.map(h => `<button class="lpOpt${wmTitleHex === h ? ' on' : ''}" style="background:${h}" data-act="titleHex" data-h="${h}"></button>`).join('')}</div></div>
            <div class="btnrow"><button class="big primary" data-act="startCareer">▶ START CAREER</button><button class="ghost" data-act="toTitle">Back</button></div>
        </div>
    </div>`;
}
function perkText(p)
{
    const k = p.perks || {}, out = [];
    if (k.speed) out.push(`${k.speed > 1 ? '+' : ''}${Math.round((k.speed - 1) * 100)}% crew speed`);
    if (k.risk) out.push(`${k.risk < 1 ? '' : '+'}${Math.round((k.risk - 1) * 100)}% accident risk`);
    if (k.revenue) out.push(`+${Math.round((k.revenue - 1) * 100)}% revenue`);
    if (k.wages) out.push(`${Math.round((k.wages - 1) * 100)}% wage bill`);
    if (k.morale) out.push(`+${k.morale} crew morale`);
    if (k.recruit) out.push(`${Math.round((k.recruit - 1) * 100)}% apprentice recruit cost`);
    if (k.train) out.push(`+${Math.round((k.train - 1) * 100)}% apprentice development`);
    return out.length ? `<div class="notes mods">${out.map(t => `<span class="${/^-|^\+\d+% crew|revenue|morale|development/.test(t) && !/risk/.test(t) || /^-\d+% accident/.test(t) ? 'good' : 'bad'}">${t}</span>`).join('')}</div>` : '';
}
WM_ACTIONS.selectMgr = ()=> { playSfx('perfect', .8); showManagerSelect(); };
WM_ACTIONS.toTitle = ()=> showTitle();
WM_ACTIONS.pickMgr = (a)=> { wmMgrPick = a.dataset.id; playSfx('pick', 1, 1.2); showManagerSelect(); };
WM_ACTIONS.startCareer = ()=>
{
    const p = MANAGER_PRESETS.find(m => m.id === wmMgrPick) || MANAGER_PRESETS[0];
    const n = $('#inName').value.trim() || p.name, co = $('#inCo').value.trim() || 'Northbridge Logistics';
    newCareer(n, co, { ...(p.look || wmCustomLook) }, wmTitleHex);
    career.manager.preset = p.id;
    career.manager.title = p.title;
    career.manager.perks = { ...p.perks };
    if (p.perks.morale) for (const s of career.staff) s.morale = clamp(s.morale + p.perks.morale, 0, 100);
    saveCareer();
    showHub('overview');
    playStory('intro', ()=> { saveCareer(); showHub('overview'); hudToast(`Welcome, ${n}! Plan your first shift.`, '#38bdf8'); });
};
// custom look picker hooks into the shared look system
const _lookTargetPrev = lookTarget;
lookTarget = function (prefix) { return prefix === 'custom' ? wmCustomLook : _lookTargetPrev(prefix); };
const _refreshPrev = refreshPreview;
refreshPreview = function (prefix) { if (prefix === 'custom') { showManagerSelect(); playSfx('pick', .8); return; } _refreshPrev(prefix); };
const _lookRandomPrev = WM_ACTIONS.lookRandom;
WM_ACTIONS.lookRandom = (a)=> { if (a.dataset.p === 'custom') { wmCustomLook = randomLook(); showManagerSelect(); return; } _lookRandomPrev(a); };

// ---------------------------------------------------------------------------
// About & legal
function legalHtml()
{
    const L = GAME_LEGAL, mail = `<a href="mailto:${L.email}">${L.email}</a>`;
    return `
    <div class="legal">
        <h2>About &amp; legal</h2>
        <p><b>${L.title} (${L.version})</b><br>© ${L.year} ${L.author}. All rights reserved.<br>Contact: ${mail}</p>
        <p>All companies, people and events in the game are fictional. Any resemblance to real companies or persons is coincidental. The game depicts workplace accidents for dramatic effect; it is not health and safety training or advice.</p>

        <h3>Privacy policy</h3>
        <p class="small muted">Last updated: ${L.updated}</p>
        <p>This policy explains how ${L.title} ("the Game") handles information. The Game is made by ${L.author} ("we", "us"), who is responsible for it under UK data protection law (UK GDPR and the Data Protection Act 2018). Contact: ${mail}</p>
        <h4>The short version</h4>
        <p>We run no servers and do not collect, receive or sell personal information. The Game has no accounts, no ads, no analytics and no online features. It makes no network requests of its own.</p>
        <h4>What is stored, and where</h4>
        <p>To work, the Game saves a few things <b>on your own device only</b>, in your browser's local storage:</p>
        <ul><li>your career save (company, staff, the names and looks you create, results and settings in the game);</li><li>your sound setting.</li></ul>
        <p>This information stays on your device and we cannot see it. Please don't type your real full name, or anyone else's, into the game.</p>
        <h4>Playing in a web browser</h4>
        <p>If you play on a website, the host serving the Game (for example itch.io) may automatically log technical information such as your IP address and browser type, as all websites do. That is covered by the host's own privacy policy. The Game itself sends nothing to us.</p>
        <h4>Children</h4>
        <p>Because the Game depicts serious workplace accidents, including deaths, it is intended for players aged 13 and over.</p>
        <h4>Deleting your data</h4>
        <p>Use <b>Abandon career</b> in Settings, or clear the site data for the Game in your browser (or uninstall the app). This removes everything the Game has saved.</p>
        <h4>Your rights</h4>
        <p>You have rights under UK data protection law, including to ask what information we hold about you. As we hold none, there is nothing for us to give or delete, but you can contact us at ${mail} with any question. You can also complain to the Information Commissioner's Office (ico.org.uk).</p>
        <h4>Changes</h4>
        <p>If a future version adds online features, ads or purchases, we will update this policy before that version is released, and the Game will ask you to review it.</p>

        <h3>Terms</h3>
        <p>The Game is provided "as is", for personal entertainment, without warranties of any kind. To the extent permitted by law, we are not liable for any loss arising from its use. You may not copy, redistribute, modify or sell the Game or its artwork without written permission from ${L.author}.</p>

        <h3>Third-party software</h3>
        <p><b>LittleJS</b> game engine © 2021 Frank Force, MIT License. <b>ZzFX</b> sound synthesiser © 2019 Frank Force, MIT License. <b>LittleJS-AI</b> helper modules (gameFx) © Frank Force, MIT License.</p>
        <p class="small muted">Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p>
        <div class="btnrow"><button class="primary" data-act="closeModal">Close</button></div>
    </div>`;
}
WM_ACTIONS.legal = ()=> openModal(legalHtml());
