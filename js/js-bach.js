import { createToolkit, renderKrn }
    from './render.js';

import {
    transformKrnFiguredBass
}
    from './fb-transform.js';

let toolkit = null;
let tunes = [];
let currentKrn = '';
let currentKrnSentToVerovio = '';
let originalKeyTonic = '';
let originalKeyMode = '';
let currentTargetTonic = '';
let currentGenre = '';
let currentNumber = '';
let allowCadences = true;
let allowSequences = true;
let fbMode = 'historic';
let figuresAbove = false;

const SCORE_COLS = [

    'C', 'G', 'D', 'A',
    'E', 'B', 'F#', 'C#',

    'F', 'Bb', 'Eb', 'Ab',
    'Db', 'Gb', 'Cb',

    'a', 'e', 'b', 'f#',
    'c#', 'g#', 'd#', 'a#',

    'd', 'g', 'c',
    'f', 'bb', 'eb', 'ab'
];

const scoreState =
    new Map();

let enabledCounts =
    new Set([
        0, 1, 2, 3,
        4, 5, 6, 7
    ]);

let currentScale = 50;
let currentSpacing = 0.32;

let allowedTonicBases =
    new Set();

const MAJOR_BY_COUNT = {
    0: ['C'],
    1: ['G', 'F'],
    2: ['D', 'Bb'],
    3: ['A', 'Eb'],
    4: ['E', 'Ab'],
    5: ['B', 'Db'],
    6: ['F#', 'Gb'],
    7: ['C#', 'Cb']
};

const MINOR_BY_COUNT = {
    0: ['a'],
    1: ['e', 'd'],
    2: ['b', 'g'],
    3: ['f#', 'c'],
    4: ['c#', 'f'],
    5: ['g#', 'bb'],
    6: ['d#', 'eb'],
    7: ['a#', 'ab']
};

const INCLUDE_KEYS = [

    'C',
    'Cb',
    'C#',

    'D',
    'Db',
    'D#',

    'E',
    'Eb',

    'F',
    'F#',

    'G',
    'Gb',
    'G#',

    'A',
    'Ab',
    'A#',

    'B',
    'Bb'
];

function refreshKeyButtonsUI() {

    document
        .querySelectorAll('.key-btn')
        .forEach(btn => {
            const count =
                Number(
                    btn.dataset.count
                );
            btn.classList.toggle(
                'selected',
                enabledCounts.has(count)
            );
        });
}

function wireKeyButtons() {
    document
        .querySelectorAll('.key-btn')
        .forEach(btn => {
            btn.addEventListener(
                'click',
                () => {
                    const count =
                        Number(
                            btn.dataset.count
                        );
                    if (
                        enabledCounts.has(count)
                    ) {
                        enabledCounts.delete(
                            count
                        );
                    } else {
                        enabledCounts.add(
                            count
                        );
                    }
                    refreshKeyButtonsUI();
                }
            );
        });

    document
        .getElementById(
            'selectAllKeys'
        )
        .addEventListener(
            'click',
            () => {

                enabledCounts.clear();

                for (
                    let i = 0;
                    i <= 7;
                    i++
                ) {

                    enabledCounts.add(i);
                }

                refreshKeyButtonsUI();
            }
        );

    document
        .getElementById(
            'selectNoneKeys'
        )
        .addEventListener(
            'click',
            () => {

                enabledCounts.clear();

                refreshKeyButtonsUI();
            }
        );
}

function chooseRandomTargetKey() {
    const pool = [];
    const source =
        originalKeyMode === 'minor'
            ? MINOR_BY_COUNT
            : MAJOR_BY_COUNT;
    for (
        const count
        of enabledCounts
    ) {
        const keys =
            source[count] || [];
        pool.push(...keys);
    }

    const filteredPool =
        pool.filter(key => {
            if (
                allowedTonicBases.size === 0
            ) {
                return true;
            }
            return allowedTonicBases.has(
                key
            );
        });

    if (!filteredPool.length) {
        currentTargetTonic = '';
        return;
    }

    currentTargetTonic =
        filteredPool[
        Math.floor(
            Math.random() *
            filteredPool.length
        )
        ];

    currentTargetTonic =
        currentTargetTonic
            .replace(
                /^([a-g])/,
                m => m.toUpperCase()
            )
            .replace(/-/g, 'b');

    console.log(
        'Target key:',
        currentTargetTonic
    );
}

function computeVerovioTranspose() {

    const tonic =
        currentTargetTonic;

    const match =
        tonic.match(
            /^([A-Ga-g])([#b]?)$/
        );

    if (!match) {
        return '';
    }

    const pname =
        match[1].toLowerCase();

    const accidental =
        match[2] || '';

    const accid =
        accidental === '#'
            ? 's'
            : accidental === 'b'
                ? 'f'
                : '';

    return pname + accid;
}

function renderIncludeButtons() {

    const grid =
        document.getElementById(
            'includeGrid'
        );

    grid.innerHTML = '';
    INCLUDE_KEYS.forEach(key => {
        const btn =
            document.createElement(
                'button'
            );
        btn.type = 'button';
        btn.className =
            'include-btn';
        btn.textContent =
            key.replace(
                /#/g,
                '♯'
            );
        btn.dataset.key =
            key;
        btn.addEventListener(
            'click',
            () => {

                if (
                    allowedTonicBases.has(key)
                ) {
                    allowedTonicBases.delete(
                        key
                    );
                    btn.classList.remove(
                        'toggled'
                    );
                } else {
                    allowedTonicBases.add(
                        key
                    );
                    btn.classList.add(
                        'toggled'
                    );
                }
            }
        );

        grid.appendChild(btn);
    });
}

function selectAllIncludeKeys() {

    allowedTonicBases.clear();

    document
        .querySelectorAll(
            '#includeGrid .include-btn'
        )
        .forEach(btn => {

            const key =
                btn.dataset.key;

            allowedTonicBases.add(
                key
            );

            btn.classList.add(
                'toggled'
            );
        });
}

function clearAllIncludeKeys() {

    allowedTonicBases.clear();

    document
        .querySelectorAll(
            '#includeGrid .include-btn'
        )
        .forEach(btn => {

            btn.classList.remove(
                'toggled'
            );
        });
}

async function loadTunes() {

    const response =
        await fetch('./tunes.json');

    tunes =
        await response.json();

    console.log(
        'Tunes:',
        tunes
    );
}

async function loadKrn(path) {

    const response =
        await fetch(path);

    if (!response.ok) {

        throw new Error(
            `Failed loading ${path}`
        );
    }

    currentKrn =
        await response.text();

    const parsed =
        parseKeyFromKrn(
            currentKrn
        );

    originalKeyTonic =
        parsed.tonic;
    originalKeyMode =
        parsed.mode;

    updateKeyPill();

    const titleInfo =
        parseTitleInfo(
            currentKrn
        );

    currentGenre =
        titleInfo.genre;
    currentNumber =
        titleInfo.number;

    updateTitlePill();

    console.log(
        'Loaded:',
        path
    );
    await renderCurrent();
}

/* this is for the da capo markings at the end, this is only for JS Bach sequences */
function moveTextSpineToAbove(krnText) {

    const lines = krnText.split(/\r?\n/);

    let headerIdx = -1;
    let textIndex = -1;

    for (let i = 0; i < lines.length; i++) {

        if (!lines[i].includes('**'))
            continue;

        const toks =
            lines[i].split('\t');

        toks.forEach((t, idx) => {

            if (
                t.trim() === '**text'
            ) {
                textIndex = idx;
            }
        });

        if (textIndex >= 0) {

            headerIdx = i;
            break;
        }
    }

    if (
        headerIdx < 0 ||
        textIndex < 0
    ) {
        return krnText;
    }

    {
        const toks =
            lines[headerIdx]
                .split('\t');

        toks[textIndex] =
            '**cdata';

        lines[headerIdx] =
            toks.join('\t');
    }

    for (
        let i = headerIdx + 1;
        i < lines.length;
        i++
    ) {

        if (
            !lines[i].includes('\t')
        ) continue;

        const toks =
            lines[i].split('\t');

        const tok =
            (toks[textIndex] || '')
                .trim();

        if (
            tok.startsWith('*')
            &&
            tok !== '*-'
        ) {
            toks[textIndex] = '*';
        }

        if (tok === '*') {
            toks[textIndex] =
                '*above';
        }

        lines[i] =
            toks.join('\t');
    }

    return lines.join('\n');
}

function updateInstructionsBox() {

    const box =
        document.getElementById(
            'instructionsBox'
        );

    if (!box) {
        return;
    }

    const match =
        currentKrn.match(
            /^!!\s*Instructions:\s*(.*)$/mi
        );

    box.textContent =
        match
            ? match[1].trim()
            : '';
}

function applyFiguredBassPlacement(
    krnText,
    placeAbove
) {

    if (!krnText) {
        return krnText;
    }

    const lines =
        krnText.split(/\r?\n/);

    let headerLineIdx = -1;
    let fbIndex = -1;

    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line =
            lines[i];

        if (
            !/\*\*/.test(line)
        ) {
            continue;
        }

        const toks =
            line.split('\t');

        for (
            let c = 0;
            c < toks.length;
            c++
        ) {

            if (
                /^\*\*fb(?:a)?\b/
                    .test(toks[c])
            ) {

                fbIndex = c;
            }
        }

        headerLineIdx = i;
        break;
    }

    if (
        headerLineIdx < 0 ||
        fbIndex < 0
    ) {

        return krnText;
    }

    {
        const toks =
            lines[
                headerLineIdx
            ].split('\t');

        toks[fbIndex] =
            placeAbove
                ? '**fba'
                : '**fb';

        lines[
            headerLineIdx
        ] =
            toks.join('\t');
    }

    return lines.join('\n');
}

async function renderCurrent() {

    if (!toolkit) return;

    const result =
        transformKrnFiguredBass({

            krnText:
                currentKrn,

            fromTonic:
                originalKeyTonic,

            toTonic:
                currentTargetTonic,

            mode:
                originalKeyMode,

            fbMode:
                fbMode
        });

    currentKrnSentToVerovio =
        applyFiguredBassPlacement(
            moveTextSpineToAbove(
                result.transformedKrn
            ),
            figuresAbove
        );

    await renderKrn(
        toolkit,
        currentKrnSentToVerovio,
        document.getElementById('svg'),
        {
            scale: currentScale,
            spacing: currentSpacing
        },
        computeVerovioTranspose()
    );

    updateInstructionsBox();

    updateHumdrumPanel();
}

function randomTune() {

    const available =
        filteredTunes();

    if (!available.length) {
        return null;
    }

    return available[
        Math.floor(
            Math.random() * available.length
        )
    ];
}

function filteredTunes() {

    return tunes.filter(path => {

        const lower =
            path.toLowerCase();

        if (
            lower.includes('cadence') &&
            !allowCadences
        ) {
            return false;
        }

        if (
            lower.includes('sequence') &&
            !allowSequences
        ) {
            return false;
        }

        return true;
    });
}

function parseKeyFromKrn(krnText) {

    const match =
        krnText.match(
            /\*([A-Ga-g])([#-]?)\:/
        );

    if (!match) {

        return {
            tonic: 'C',
            mode: 'major'
        };
    }

    const letter =
        match[1];

    const accidental =
        match[2] || '';

    const tonic =
        letter.toUpperCase() +
        accidental;

    const mode =
        letter === letter.toLowerCase()
            ? 'minor'
            : 'major';

    return {
        tonic,
        mode
    };
}

function parseTitleInfo(krnText) {

    const titleMatch =
        krnText.match(
            /^!! Title\s+(.*)$/mi
        );

    const numberMatch =
        krnText.match(
            /^!! Number\s+(.*)$/mi
        );

    const title =
        titleMatch
            ? titleMatch[1].trim()
            : '';

    const number =
        numberMatch
            ? numberMatch[1].trim()
            : '';

    const genre =
        title ===
            'Most-Used Final Cadences'
            ? 'Cadences'
            : 'Sequences';

    return {
        genre,
        number
    };
}

function updateKeyPill() {

    const tonic =
        currentTargetTonic ||
        originalKeyTonic;

    const prettyKey =
        tonic
            .replace(/-/g, '♭')
            .replace(/#/g, '♯');

    document
        .getElementById(
            'keyPillValue'
        )
        .textContent =

        `${prettyKey} ${originalKeyMode}`;
}

function updateTitlePill() {
    document
        .getElementById(
            'titlePill'
        )
        .textContent =
        `${currentGenre} ${currentNumber}`;
}

function updateScaleSpacingDisplays() {
    document
        .getElementById(
            'scaleValue'
        )
        .textContent =
        currentScale;
    document
        .getElementById(
            'spacingValue'
        )
        .textContent =
        currentSpacing.toFixed(2);
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function updateHumdrumPanel() {

    const panel =
        document.getElementById(
            'humPanel'
        );
    const targetKey =
        currentTargetTonic ||
        originalKeyTonic;
    panel.innerHTML = `

<div style="
    margin-bottom:12px;
    font-weight:bold;
">
    TARGET KEY = ${targetKey} ${originalKeyMode}
    <br>
    HISTORIC = TRUE
</div>

<div style="
    display:flex;
    gap:16px;
">

    <div style="
        flex:1;
        min-width:0;
    ">

        <div style="
            font-weight:bold;
            margin-bottom:6px;
        ">
            ORIGINAL .KRN
        </div>

        <pre style="
            margin:0;
            white-space:pre;
            overflow:hidden;
            font-size:12px;
        ">${escapeHtml(currentKrn)}</pre>

    </div>

    <div style="
        flex:1;
        min-width:0;
    ">

        <div style="
            font-weight:bold;
            margin-bottom:6px;
        ">
            VEROVIO .KRN
        </div>

        <pre style="
            margin:0;
            white-space:pre;
            overflow:hidden;
            font-size:12px;
        ">${escapeHtml(currentKrnSentToVerovio)}</pre>

    </div>

</div>
`;
}

async function newBassLine() {

    const tune =
        randomTune();

    if (!tune) {
        return;
    }

    await loadKrn(
        tune
    );

    chooseRandomTargetKey();

    updateKeyPill();

    addScore();

    renderScoreboard();

    await renderCurrent();
}

function scoreColumnKey() {

    if (!currentTargetTonic) {
        return null;
    }

    let key =
        currentTargetTonic;

    if (
        originalKeyMode === 'minor'
    ) {

        key =
            key
                .charAt(0)
                .toLowerCase()
            + key.slice(1);
    }

    return key;
}

function scoreboardRowLabel() {

    const pill =
        document.getElementById(
            'titlePill'
        );

    return pill
        ? pill.textContent.trim()
        : `${currentGenre} ${currentNumber}`;
}

function addScore() {

    const row =
        scoreboardRowLabel();

    const col =
        scoreColumnKey();

    if (!col) {
        return;
    }

    if (
        !scoreState.has(row)
    ) {

        scoreState.set(
            row,
            new Map()
        );
    }

    const rowMap =
        scoreState.get(row);

    rowMap.set(
        col,
        (rowMap.get(col) || 0) + 1
    );
}

function prettyKeyLabel(key) {

    return key
        .replace(/#/g, '♯')
        .replace(/b/g, '♭');
}

function renderScoreboard() {

    const table =
        document.getElementById(
            'scoreTable'
        );

    if (!table) {
        return;
    }

    table.innerHTML = '';

    const thead =
        document.createElement(
            'thead'
        );

    const headRow =
        document.createElement(
            'tr'
        );

    const titleHead =
        document.createElement(
            'th'
        );

    titleHead.textContent =
        'Exercise';

    headRow.appendChild(
        titleHead
    );

    const totalsHead =
        document.createElement(
            'th'
        );

    totalsHead.textContent =
        'Totals';

    headRow.appendChild(
        totalsHead
    );

    SCORE_COLS.forEach(key => {

        const th =
            document.createElement(
                'th'
            );

        th.textContent =
            prettyKeyLabel(key);

        headRow.appendChild(
            th
        );
    });

    thead.appendChild(
        headRow
    );

    table.appendChild(
        thead
    );

    const tbody =
        document.createElement(
            'tbody'
        );

    const rows =
        Array.from(
            scoreState.keys()
        ).sort();

    const columnTotals =
        {};

    SCORE_COLS.forEach(key => {
        columnTotals[key] = 0;
    });

    let grandTotal = 0;

    rows.forEach(row => {

        const tr =
            document.createElement(
                'tr'
            );

        const labelCell =
            document.createElement(
                'td'
            );

        labelCell.textContent =
            row;

        tr.appendChild(
            labelCell
        );

        const rowMap =
            scoreState.get(row);

        let rowTotal = 0;

        SCORE_COLS.forEach(key => {

            const value =
                rowMap.get(key) || 0;

            rowTotal += value;

            columnTotals[key] += value;

            grandTotal += value;
        });

        const totalCell =
            document.createElement(
                'td'
            );

        totalCell.textContent =
            rowTotal || '';

        tr.appendChild(
            totalCell
        );

        SCORE_COLS.forEach(key => {

            const td =
                document.createElement(
                    'td'
                );

            const value =
                rowMap.get(key) || 0;

            td.textContent =
                value || '';

            tr.appendChild(
                td
            );
        });

        tbody.appendChild(
            tr
        );
    });

    const totalsRow =
        document.createElement(
            'tr'
        );

    const totalsLabel =
        document.createElement(
            'td'
        );

    totalsLabel.textContent =
        'Totals';

    totalsRow.appendChild(
        totalsLabel
    );

    const grandCell =
        document.createElement(
            'td'
        );

    grandCell.textContent =
        grandTotal || '';

    totalsRow.appendChild(
        grandCell
    );

    SCORE_COLS.forEach(key => {

        const td =
            document.createElement(
                'td'
            );

        td.textContent =
            columnTotals[key] || '';

        totalsRow.appendChild(
            td
        );
    });

    tbody.insertBefore(
        totalsRow,
        tbody.firstChild
    );

    table.appendChild(
        tbody
    );
}

function resetScoreboard() {
    scoreState.clear();
    renderScoreboard();
}

function initScoreboardCollapse() {

    const panel =
        document.getElementById(
            'scoreboard'
        );

    if (!panel) {
        return;
    }

    const toggle =
        document.createElement(
            'button'
        );

    toggle.type =
        'button';

    toggle.className =
        'humdrum-toggle';

    toggle.innerHTML =
        '► Scoreboard — click to open';

    panel.parentNode.insertBefore(
        toggle,
        panel
    );

    panel.style.display =
        'none';

    toggle.addEventListener(
        'click',
        () => {

            const open =
                panel.style.display !== 'none';

            if (open) {

                panel.style.display =
                    'none';

                toggle.innerHTML =
                    '► Scoreboard — click to open';

            } else {

                panel.style.display =
                    'block';

                toggle.innerHTML =
                    '▼ Scoreboard — click to close';
            }
        }
    );
}

function updateFigurePlacementButtons() {

    const above =
        document.getElementById(
            'labelFigAbove'
        );

    const below =
        document.getElementById(
            'labelFigBelow'
        );

    if (figuresAbove) {

        above.classList.add(
            'selected'
        );

        below.classList.remove(
            'selected'
        );

    } else {

        below.classList.add(
            'selected'
        );

        above.classList.remove(
            'selected'
        );
    }
}

async function main() {

    toolkit =
        await createToolkit();

    await loadTunes();

    renderScoreboard();
    initScoreboardCollapse();

    document
        .getElementById(
            'scoreReset'
        )
        .addEventListener(
            'click',
            resetScoreboard
        );

    function updateFbModeButtons() {

        const historic =
            document.getElementById(
                'labelHistoric'
            );

        const modern =
            document.getElementById(
                'labelModern'
            );

        if (fbMode === 'historic') {

            historic.classList.add(
                'selected'
            );

            modern.classList.remove(
                'selected'
            );

        } else {

            modern.classList.add(
                'selected'
            );

            historic.classList.remove(
                'selected'
            );
        }
    }

    document
        .querySelectorAll(
            'input[name="accMode"]'
        )
        .forEach(radio => {

            radio.addEventListener(
                'change',
                async () => {

                    fbMode =
                        radio.value;

                    updateFbModeButtons();

                    await renderCurrent();
                }
            );
        });

    const fbAboveRadio =
        document.getElementById(
            'fbAbove'
        );

    const fbBelowRadio =
        document.getElementById(
            'fbBelow'
        );

    fbAboveRadio.addEventListener(
        'change',
        async () => {

            figuresAbove = true;

            updateFigurePlacementButtons();

            await renderCurrent();
        }
    );

    fbBelowRadio.addEventListener(
        'change',
        async () => {

            figuresAbove = false;

            updateFigurePlacementButtons();

            await renderCurrent();
        }
    );

    updateFbModeButtons();
    updateFigurePlacementButtons();
    wireKeyButtons();
    refreshKeyButtonsUI();
    updateScaleSpacingDisplays();
    renderIncludeButtons();
    selectAllIncludeKeys();



    document
        .getElementById(
            'includeSelectAll'
        )
        .addEventListener(
            'click',
            selectAllIncludeKeys
        );

    document
        .getElementById(
            'includeSelectNone'
        )
        .addEventListener(
            'click',
            clearAllIncludeKeys
        );

    document
        .getElementById('scalePlus')
        .addEventListener(
            'click',
            async () => {

                currentScale += 2;

                updateScaleSpacingDisplays();

                await renderCurrent();
            }
        );

    document
        .getElementById('scaleMinus')
        .addEventListener(
            'click',
            async () => {

                currentScale =
                    Math.max(
                        10,
                        currentScale - 2
                    );

                updateScaleSpacingDisplays();

                await renderCurrent();
            }
        );

    document
        .getElementById('scaleReset')
        .addEventListener(
            'click',
            async () => {

                currentScale = 50;

                updateScaleSpacingDisplays();

                await renderCurrent();
            }
        );

    document
        .getElementById('spacingPlus')
        .addEventListener(
            'click',
            async () => {

                currentSpacing += 0.02;

                updateScaleSpacingDisplays();

                await renderCurrent();
            }
        );

    document
        .getElementById('spacingMinus')
        .addEventListener(
            'click',
            async () => {
                currentSpacing =
                    Math.max(
                        0.10,
                        currentSpacing - 0.02
                    );
                updateScaleSpacingDisplays();
                await renderCurrent();
            }
        );

    document
        .getElementById('spacingReset')
        .addEventListener(
            'click',
            async () => {
                currentSpacing = 0.32;
                updateScaleSpacingDisplays();
                await renderCurrent();
            }
        );

    const cadenceBtn =
        document.querySelector(
            '[data-value="cadence"]'
        );

    const sequenceBtn =
        document.querySelector(
            '[data-value="sequence"]'
        );

    cadenceBtn.addEventListener(
        'click',
        () => {

            allowCadences =
                !allowCadences;

            cadenceBtn.classList.toggle(
                'selected',
                allowCadences
            );
        }
    );

    sequenceBtn.addEventListener(
        'click',
        () => {

            allowSequences =
                !allowSequences;

            sequenceBtn.classList.toggle(
                'selected',
                allowSequences
            );
        }
    );

    cadenceBtn.classList.add(
        'selected'
    );

    sequenceBtn.classList.add(
        'selected'
    );

    document
        .getElementById(
            'randomFiltered'
        )
        .addEventListener(
            'click',
            newBassLine
        );

    await newBassLine();
    initHumdrumPanelCollapse();
}

function initHumdrumPanelCollapse() {

    const panel =
        document.getElementById(
            'humPanel'
        );

    if (!panel) {
        return;
    }

    const toggle =
        document.createElement(
            'button'
        );

    toggle.type = 'button';

    toggle.className =
        'humdrum-toggle';

    toggle.innerHTML =
        '► Humdrum Panel';

    panel.parentNode.insertBefore(
        toggle,
        panel
    );

    panel.style.display =
        'none';

    toggle.addEventListener(
        'click',
        () => {

            const open =
                panel.style.display !== 'none';

            if (open) {

                panel.style.display =
                    'none';

                toggle.innerHTML =
                    '► Humdrum Panel';

            } else {

                panel.style.display =
                    'block';

                toggle.innerHTML =
                    '▼ Humdrum Panel';
            }
        }
    );
}

main();
