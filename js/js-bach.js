import { createToolkit, renderKrn } from './render.js';

import {
    transformKrnFiguredBass,
    FB_MODE,
    setFbMode
} from './fb-transform.js';

/* ========================================================================== 
     Full app (complete). Changes:
     - "tonics" removed.
     - Include grid (spelled-tonics) implemented in the Include area.
     - Include all/none buttons wired; default = all lit.
     - Historic/Modern radio labels show selected state.
     ========================================================================== */

(async function () {
    // -------------------- CONSTANTS --------------------
    const BASE_PITCH = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    const ACC_OFF = { '--': -2, '-': -1, 'n': 0, '#': +1, '##': +2 };
    const ACC_GLYPHS = ['--', '-', 'n', '#', '##'];
    const MAJOR_BY_COUNT = { 0: ['C'], 1: ['G', 'F'], 2: ['D', 'Bb'], 3: ['A', 'Eb'], 4: ['E', 'Ab'], 5: ['B', 'Db'], 6: ['F#', 'Gb'], 7: ['C#', 'Cb'] };
    const MINOR_BY_COUNT = { 0: ['a'], 1: ['e', 'd'], 2: ['b', 'g'], 3: ['f#', 'c'], 4: ['c#', 'f'], 5: ['g#', 'bb'], 6: ['d#', 'eb'], 7: ['a#', 'ab'] };
    const KEY_TOKEN_RE = /^\*([A-Ga-g])([#\u266f-]{0,2})\s*:/

    // -------------------- DOM refs --------------------
    const svgHost = document.getElementById('svg');
    const humPanel = document.getElementById('humPanel');
    const status = document.getElementById('status');

    const diffRow = document.getElementById('diffRow');
    const matchCount = document.getElementById('matchCount');
    const totalCount = document.getElementById('totalCount');

    const randomBtn = document.getElementById('randomFiltered');
    const clearBtn = document.getElementById('clearFilters');

    // --- SCOREBOARD DOM refs ---
    const scoreTable = document.getElementById('scoreTable');
    const scoreResetBtn = document.getElementById('scoreReset');

    const titlePill = document.getElementById('titlePill');
    const keyPillValue = document.getElementById('keyPillValue');

    const traceToggle = document.getElementById('traceToggle');
    const tracePanel = document.getElementById('tracePanel');
    const clearTraceBtn = document.getElementById('clearTrace');
    const downloadTraceBtn = document.getElementById('downloadTrace');

    const modeTagline = document.getElementById('modeTagline');
    const historicalStatus = document.getElementById('historicalStatus');

    // Double length
    let DOUBLE_LENGTH = false;

    // Accidentals (Historic/Modern)
    const accRadios = Array.from(document.querySelectorAll('input[name="accMode"]'));
    let ACC_MODE = 'historic'; // 'historic' | 'modern'

    // NEW: Figured-bass placement state (false = below **fb, true = above **fba)
    let FB_ABOVE = false;

    // Key range state/UI
    const keyButtons = Array.from(document.querySelectorAll('.key-btn'));
    const selectAllKeysBtn = document.getElementById('selectAllKeys');
    const selectNoneKeysBtn = document.getElementById('selectNoneKeys');
    let enabledCounts = new Set([0, 1, 2, 3, 4, 5, 6, 7]);

    // Include spelled-tonics grid
    const includeGridEl = document.getElementById('includeGrid');
    const includeSelectAllBtn = document.getElementById('includeSelectAll');
    const includeSelectNoneBtn = document.getElementById('includeSelectNone');
    let allowedTonicBases = new Set(); // elements like "F#", "B-", "C" where flats use '-' glyph

    // Scale / Spacing (UI-only)
    const scaleSlider = document.getElementById('scaleSlider');
    const scaleValue = document.getElementById('scaleValue');
    const spacingSlider = document.getElementById('spacingSlider');
    const spacingValue = document.getElementById('spacingValue');
    const scaleReset = document.getElementById('scaleReset');
    const spacingReset = document.getElementById('spacingReset');
    const scaleMinus = document.getElementById('scaleMinus');
    const scalePlus = document.getElementById('scalePlus');
    const spacingMinus = document.getElementById('spacingMinus');
    const spacingPlus = document.getElementById('spacingPlus');

    // Transpose / Octave
    const tpMinus = document.getElementById('tpMinus');
    const tpPlus = document.getElementById('tpPlus');
    const tpToggle = document.getElementById('tpToggle');
    const octMinus = document.getElementById('octMinus');
    const octPlus = document.getElementById('octPlus');
    // --- HUMDRUM: default collapsed with chevron toggle (visual-only) ---
    (function initHumdrumCollapsed() {
        const humPanelEl = document.getElementById('humPanel');
        if (!humPanelEl) return;

        // Hide the original label (keep in DOM)
        const humLabel = Array.from(document.querySelectorAll('label.small')).find(l =>
            /displayed humdrum|humdrum/i.test((l.textContent || '').trim())
        );
        if (humLabel) humLabel.classList.add('humdrum-original-label');

        // Create the new toggle
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'humdrum-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'humPanel');

        const chev = document.createElement('span');
        chev.className = 'humdrum-chevron';
        chev.textContent = '►'; // closed

        const txt = document.createElement('span');
        txt.textContent = 'Humdrum panel -- click to open';

        toggle.appendChild(chev);
        toggle.appendChild(txt);

        // Insert above the panel and start collapsed
        humPanelEl.parentNode.insertBefore(toggle, humPanelEl);
        humPanelEl.style.display = 'none';

        toggle.addEventListener('click', () => {
            const isOpen = humPanelEl.style.display !== 'none';
            if (isOpen) {
                humPanelEl.style.display = 'none';
                toggle.setAttribute('aria-expanded', 'false');
                chev.textContent = '►';
                txt.textContent = 'Humdrum panel -- click to open';
            } else {
                humPanelEl.style.display = 'block';
                toggle.setAttribute('aria-expanded', 'true');
                chev.textContent = '▼';
                txt.textContent = 'Humdrum panel -- click to close';
            }
        });
    })();


    // -------------------- Filter state (internal) --------------------
    const DEFAULT_KEY_MODES = new Set(['major', 'minor']);
    const DEFAULT_CATEGORIES = new Set(['cadence', 'sequence']);
    const selected = {
        keyMode: new Set(DEFAULT_KEY_MODES),
        category: new Set(DEFAULT_CATEGORIES)
    };

    // make sure catalog exists before any UI code calls currentMatches()
    let catalog = [];

    function setButtonSelection(containerSelector, activeSet) {
        document.querySelectorAll(containerSelector + ' .btn').forEach(btn => {
            const v = btn.dataset.value;
            if (!v) return;
            btn.classList.toggle('selected', activeSet.has(v));
        });
    }

    function initDefaultFilterSelections() {
        setButtonSelection('#keyModeRow', selected.keyMode);
        setButtonSelection('#categoryRow', selected.category);
        setButtonSelection('#diffRow', selected.diff);
        updateMatchCount();
    }

    initDefaultFilterSelections();

    // -------------------- Utils --------------------
    function setStatus(txt, isErr) {
        if (status) {
            status.textContent = 'Status: ' + txt;
            status.style.color = isErr ? 'crimson' : '';
        }
    }
    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function nextLetter(letter) {
        return 'CDEFGAB'[('CDEFGAB'.indexOf(letter.toUpperCase()) + 1) % 7];
    }
    function letterStepsUp(fromLetter, steps) { // steps >= 0
        const order = 'CDEFGAB';
        const i = order.indexOf(fromLetter.toUpperCase());
        return order[(i + (steps % 7) + 7) % 7];
    }

    // Normalize tonic to Humdrum glyphs ('-', '--', '#', '##', 'n')
    // Normalize tonic to Humdrum glyphs ('-', '--', '#', '##', 'n')
    function normalizeTonicForHumdrum(s) {
        if (!s) return s;
        const raw = String(s).trim();
        const m = raw.match(/^([A-Ga-g])([#\u266f\u266db-]{0,2})?$/);
        if (!m) return raw;

        const letter = m[1];
        let acc = m[2] || '';

        acc = acc
            .replace(/\u266f/g, '#')
            .replace(/\u266d/g, '-')
            .replace(/bb/g, '--')
            .replace(/b/g, '-');

        return letter + acc;
    }

    // double length button
    function applyDoubleLengthToSpine1(krnText) {
        if (!DOUBLE_LENGTH) return krnText;

        const lines = krnText.split(/\r?\n/);

        return lines.map(line => {
            if (!line.includes('\t')) return line;

            const fields = line.split('\t');
            const tok = (fields[0] || '').trim();

            // Only transform actual note/rest tokens (not *, =, .)
            if (!tok || tok === '.' || tok.startsWith('*') || tok.startsWith('=')) {
                return line;
            }

            // Match duration at start (e.g., 4F, 8r, 16cc#)
            const m = tok.match(/^(\d+)(.*)$/);
            if (!m) return line;

            const dur = parseInt(m[1], 10);
            const rest = m[2];

            // Double length = halve number (4 → 2, 2 → 1, etc.)
            const newDur = Math.max(1, Math.floor(dur / 2));

            fields[0] = String(newDur) + rest;
            return fields.join('\t');
        }).join('\n');
    }

    // Parse tonic string "A", "Ab", "C#", returns {letter, acc, mode}
    // Parse tonic string "A", "Ab", "C#", returns {letter, acc, mode}
    function parseTonicString(s) {
        if (!s) return null;
        const m = String(s).trim().match(/^([A-Ga-g])([#\u266f\u266db-]{0,2})$/);
        if (!m) return null;

        let letter = m[1].toUpperCase();
        let acc = (m[2] || '') || 'n';

        acc = acc
            .replace(/\u266f/g, '#')
            .replace(/\u266d/g, '-')
            .replace(/bb/g, '--')
            .replace(/b/g, '-');

        if (acc === '') acc = 'n';
        return { letter, acc, mode: (m[1] === m[1].toLowerCase() ? 'minor' : 'major') };
    }

    function spelledToSemitone(letter, glyph) {
        const base = BASE_PITCH[letter.toUpperCase()];
        const off = (ACC_OFF[glyph] !== undefined) ? ACC_OFF[glyph] : 0;
        return ((base + off) % 12 + 12) % 12;
    }




    let vrv;



    try {
        setStatus('creating verovio toolkit...');
        vrv = await createToolkit();
        setStatus('toolkit ready');
    }
    catch (e) {
        setStatus('Failed to create toolkit: ' + e.message, true);
        svgHost.textContent = 'Toolkit init failed';
    }
    setStatus('toolkit ready');

    // -------------------- Trace --------------------
    let TRACE_ON = false;
    let traceBuf = [];
    function renderTrace() {
        tracePanel.textContent = TRACE_ON ? traceBuf.join('\n') : '(trace disabled)';
    }
    function traceClear() { traceBuf = []; renderTrace(); }
    function traceLog(msg) {
        if (!TRACE_ON) return;
        traceBuf.push(`[${new Date().toISOString()}] ${msg}`);
        if (traceBuf.length > 3000) traceBuf.shift();
        renderTrace();
    }
    function traceDownload() {
        const blob = new Blob([traceBuf.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'krn-transpose-trace.txt';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }
    if (traceToggle) traceToggle.addEventListener('change', (e) => {
        TRACE_ON = e.target.checked;
        renderTrace();
    });
    if (clearTraceBtn) clearTraceBtn.addEventListener('click', traceClear);
    if (downloadTraceBtn) downloadTraceBtn.addEventListener('click', traceDownload);

    // -------------------- Courtesy / suppression / modern override --------------------
    function suppressThirdFourthSpinesAfterKey(krnText) {
        const lines = krnText.split(/\r?\n/);
        let suppress = false;
        return lines.map(line => {
            if (!line.includes('\t')) {
                if (!suppress && KEY_TOKEN_RE.test(line.trim())) suppress = true;
                return line;
            }
            const fields = line.split('\t');
            if (!suppress) {
                if (fields.some(f => KEY_TOKEN_RE.test((f || '').trim()))) {
                    suppress = true;
                    return line;
                }
                return line;
            }
            // Suppress ONLY spine 3 (index 2), keep spine 4 (index 3 for da capo text)
            // Suppress ONLY spine 3 (index 2)
            // Keep spine 4 alive for lyric/text rendering
            if (fields.length > 2) {
                const tok = (fields[2] || '').trim();
                if (tok !== '*-') {
                    fields[2] = '.';
                }
            }

            return fields.join('\t');
        }).join('\n');
    }

    function applyModernOverride(krnText) {
        const lines = krnText.split(/\r?\n/);
        let afterKey = false;
        return lines.map(line => {
            if (!line.includes('\t')) {
                if (!afterKey && KEY_TOKEN_RE.test(line.trim())) afterKey = true;
                return line;
            }
            const fields = line.split('\t');
            if (!afterKey) {
                if (fields.some(f => KEY_TOKEN_RE.test((f || '').trim()))) {
                    afterKey = true;
                    return line;
                }
                return line;
            }
            if (fields.length >= 3) {
                const s3 = (fields[2] ?? '').trim();
                if (s3 && s3 !== '.' && !s3.startsWith('*') && !s3.startsWith('=') && s3 !== '*-') {
                    fields[1] = s3; // spine-3 → spine-2
                }
            }
            return fields.join('\t');
        }).join('\n');
    }




    // -------------------- Figured-bass placement transformer --------------------
    // Switch **fb <-> **fba in header and manage 'x' padding for alignment when above.
    function applyFiguredBassPlacement(krnText, placeAbove) {
        if (!krnText) return krnText;
        const lines = krnText.split(/\r?\n/);
        let headerLineIdx = -1;
        let fbIndex = -1;

        // 1) Find the first header line containing **spines and locate the **fb/**fba spine index
        for (let i = 0; i < lines.length; i++) {
            const s = lines[i];
            if (!/\*\*/.test(s)) continue; // not a spine header
            const toks = s.split('\t');
            for (let c = 0; c < toks.length; c++) {
                if (/^\*\*fb(?:a)?\b/.test(toks[c])) {
                    fbIndex = c;
                }
            }
            headerLineIdx = i;
            break;
        }
        if (headerLineIdx < 0 || fbIndex < 0) return krnText; // no **fb/**fba spine found

        // 2) Rewrite header token: **fb -> **fba for above, and reverse for below
        {
            const toks = lines[headerLineIdx].split('\t');
            toks[fbIndex] = placeAbove
                ? toks[fbIndex].replace(/^\*\*fb(?:a)?/, '**fba')
                : toks[fbIndex].replace(/^\*\*fba/, '**fb');
            lines[headerLineIdx] = toks.join('\t');
        }

        // 3) Compute global max number of numerals across the fb spine (for top-alignment)
        function countNumerals(tok) {
            if (!tok || tok === '.' || /^[\*\=\!\|]/.test(tok)) return 0;
            const parts = tok.trim().split(/\s+/);
            let numerals = 0;
            for (const p of parts) {
                const m = p.match(/\d+/g);
                numerals += m ? m.length : (/\d/.test(p) ? 1 : 0);
            }
            return numerals || (parts.some(p => /\d/.test(p)) ? 1 : 0);
        }
        let globalMax = 0;
        for (let i = headerLineIdx + 1; i < lines.length; i++) {
            const s = lines[i];
            if (!s.includes('\t')) continue;
            const toks = s.split('\t');
            const tok = toks[fbIndex];
            if (!tok || tok === '.' || /^[\*\=\!\|]/.test(tok)) continue;
            globalMax = Math.max(globalMax, countNumerals(tok));
        }

        // 4) Transform data rows: when placing above, apply leading 'x' padding; below strips them
        for (let i = headerLineIdx + 1; i < lines.length; i++) {
            const s = lines[i];
            if (!s.includes('\t')) continue;
            const toks = s.split('\t');
            let tok = toks[fbIndex] || '';
            if (!tok || tok === '.' || /^[\*\=\!\|]/.test(tok)) { lines[i] = toks.join('\t'); continue; }

            const parts = tok.trim().split(/\s+/);
            // Normalize any preexisting padding by removing leading x
            while (parts[0] === 'x') parts.shift();

            if (placeAbove) {
                const numeralsHere = countNumerals(parts.join(' ')) || 1;
                const need = Math.max(0, globalMax - Math.max(1, numeralsHere));
                tok = (need > 0 ? ('x '.repeat(need)) : '') + parts.join(' ');
                toks[fbIndex] = tok.trim();
            } else {
                // below: no padding
                toks[fbIndex] = parts.join(' ');
            }
            lines[i] = toks.join('\t');
        }

        return lines.join('\n');
    }

    function moveTextSpineToAbove(krnText) {
        const lines = krnText.split(/\r?\n/);

        let headerIdx = -1;
        let textIndex = -1;

        // Find LAST **text spine
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].includes('**')) continue;

            const toks = lines[i].split('\t');

            toks.forEach((t, idx) => {
                if (t.trim() === '**text') {
                    textIndex = idx;
                }
            });

            if (textIndex >= 0) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx < 0 || textIndex < 0) {
            return krnText;
        }

        // Convert header spine type
        {
            const toks = lines[headerIdx].split('\t');
            toks[textIndex] = '**cdata';
            lines[headerIdx] = toks.join('\t');
        }

        // Convert interpretation lines
        // Normalize interpretation lines for **cdata
        for (let i = headerIdx + 1; i < lines.length; i++) {
            if (!lines[i].includes('\t')) continue;

            const toks = lines[i].split('\t');

            if (textIndex >= toks.length) continue;

            const tok = (toks[textIndex] || '').trim();

            // Any interpretation token becomes neutral
            if (tok.startsWith('*') && tok !== '*-') {
                toks[textIndex] = '*';
            }

            // Put cdata above the staff
            if (tok === '*') {
                toks[textIndex] = '*above';
            }

            lines[i] = toks.join('\t');
        }
        return lines.join('\n');
    }



    function prettyCategoryName(mode) {
        const m = String(mode || '').toLowerCase();
        if (m === 'common-chord') return 'Common Chord';
        if (m === 'ascending') return 'Ascending RoO';
        if (m === 'descending') return 'Descending RoO';
        if (m === 'chromatic') return 'Chromatic';
        if (m === 'pedal') return 'Pedal Point';
        if (m === 'modulating') return 'Modulating';
        if (m === 'mod-remote') return 'Modulating (Remote Keys)';
        if (m === 'major') return 'Major';
        if (m === 'minor') return 'Minor';
        return mode ? String(mode) : '';
    }

    function categoryDisplayName(mode) {
        const m = String(mode || '').toLowerCase();
        if (m === 'ascending') return 'Ascending';
        if (m === 'descending') return 'Descending';
        if (m === 'asc-chromatic') return 'Ascending Chromatic';
        if (m === 'desc-chromatic') return 'Descending Chromatic';
        if (m === 'common-chord') return 'Common Chord';
        if (m === 'chromatic') return 'Chromatic';
        if (m === 'pedal') return 'Pedal Point';
        if (m === 'modulating') return 'Modulating';
        if (m === 'mod-remote') return 'Modulating (Remote Keys)';
        return mode ? String(mode) : '';
    }

    // -------------------- Catalog / filters / UI --------------------
    function updatePillsFromCatalogEntry(entry) {
        const mode = entry?.mode;
        const num = entry?.diff != null ? String(entry.diff) : '';

        let title = '';

        if (mode === 'cadence') {
            title = `Cadences ${num}`;
        } else if (mode === 'sequence') {
            title = `Sequences ${num}`;
        } else {
            title = entry?.title || 'No title';
        }

        titlePill.innerHTML = escapeHtml(title.trim());
    }

    function formatKeyName(tonic, mode) {
        if (!tonic) return 'original';
        const m = String(tonic).trim().match(/^([A-Ga-g])(.+)?$/);
        if (!m) return tonic + ' ' + (mode === 'minor' ? 'minor' : 'major');
        let letter = m[1], acc = m[2] || '';
        acc = acc.replace(/bb/g, '♭♭').replace(/b/g, '♭').replace(/#/g, '♯').replace(/--/g, '♭♭').replace(/-/g, '♭');
        const root = (mode === 'minor') ? letter.toLowerCase() : letter.toUpperCase();
        return root + acc + ' ' + (mode === 'minor' ? 'minor' : 'major');
    }
    function updateKeyPill(tonic, mode) {
        keyPillValue.textContent = formatKeyName(tonic, mode);
        if (!tonic) document.getElementById('keyPill').style.display = 'none';
        else document.getElementById('keyPill').style.display = '';
    }

    let currentKrn = '';
    let currentEntry = null;
    let lastTargetTonic = '';
    let lastTargetMode = '';
    let transposePreferFlats = false;
    let currentRenderSemitoneShift = 0;

    // NEW: Keep a copy of the transposed text BEFORE placement (so radios can re-apply quickly)
    let lastTransformedKrn = '';

    // -------------------- Fetch helpers --------------------
    async function fetchList() {
        try {
            const r = await fetch('tunes.json?_=' + Date.now(), { cache: 'no-cache' });
            if (!r.ok) return [];
            const arr = await r.json();
            const list = Array.isArray(arr) ? arr : (Array.isArray(arr.files) ? arr.files : []);
            return (list || []).map(x => String(x).replace(/^\/+/, ''));
        } catch (e) {
            return [];
        }
    }
    async function fetchText(path) {
        const p = path.startsWith('tunes/') ? path : 'tunes/' + path;
        const r = await fetch(p + '?_=' + Date.now(), { cache: 'no-cache' });
        if (!r.ok) throw new Error('fetch failed: ' + p);
        const t = await r.text();
        return { path: p, text: t };
    }
    function inferKeyMode(path, text) {
        const fname = String(path || '').toLowerCase().split('/').pop() || '';

        // Filename wins for the common-chord set
        if (/_common_min_/i.test(fname) || /cpe_common_min_/i.test(fname)) return 'minor';
        if (/_common_maj_/i.test(fname) || /cpe_common_maj_/i.test(fname)) return 'major';

        // Then trust the actual Humdrum key token
        const m = String(text || '').match(/^\*([A-Ga-g])([#\u266f-]?)\s*:/m);
        if (m) return (m[1] === m[1].toUpperCase()) ? 'major' : 'minor';

        return 'major';
    }

    function metaFromHeader(krn, path = '') {
        const lines = krn.split(/\r?\n/).slice(0, 120);
        let keyMode = null;
        let category = null;
        let title = null;
        let diff = null;
        let instructions = null;

        const p = String(path || '').toLowerCase();
        const fname = p.split('/').pop() || '';

        // Filename-first override for the common-chord set
        if (/_common_min_/i.test(fname) || /cpe_common_min_/i.test(fname)) keyMode = 'minor';
        if (/_common_maj_/i.test(fname) || /cpe_common_maj_/i.test(fname)) keyMode = 'major';
        if (/common/.test(fname)) category = 'common-chord';

        for (const rawLine of lines) {
            const s = String(rawLine || '').trim();
            if (!s) continue;

            // Still accept the actual Humdrum key token
            if (!keyMode) {
                const keyTok = s.match(/^\*([A-Ga-g])([#\u266f-]?)\s*:/);
                if (keyTok) {
                    keyMode = (keyTok[1] === keyTok[1].toUpperCase()) ? 'major' : 'minor';
                    continue;
                }
            }

            if (!s.startsWith('!!')) continue;

            const titleMatch = s.match(/^!!\s*(?:Title|T)\s+(.*)$/i);
            if (titleMatch && titleMatch[1] && !title) {
                title = titleMatch[1].trim();
                continue;
            }

            const numMatch = s.match(/^!!\s*Number\s+(\d+)\s*$/i);
            if (numMatch && numMatch[1]) {
                diff = parseInt(numMatch[1], 10);
                continue;
            }

            const instrMatch = s.match(/^!!\s*Instructions:\s*(.*)$/i);
            if (instrMatch && instrMatch[1]) {
                instructions = instrMatch[1].trim();
                continue;
            }

            const dirLine = s.match(/^!!\s*Dir\b(.*)$/i);
            if (dirLine) {
                const rest = (dirLine[1] || '').trim();

                if (/common\s*chord/i.test(rest)) {
                    category = 'common-chord';
                } else if (/ascending\s+chromatic/i.test(rest)) {
                    category = 'asc-chromatic';
                } else if (/descending\s+chromatic/i.test(rest)) {
                    category = 'desc-chromatic';
                } else if (/chromatic/i.test(rest)) {
                    category = 'chromatic';
                } else if (/pedal\s*point/i.test(rest)) {
                    category = 'pedal';
                } else if (/remote\s*key\s*modulation|modulation\s*.*remote/i.test(rest)) {
                    category = 'mod-remote';
                } else if (/modulating/i.test(rest)) {
                    category = 'modulating';
                } else if (/ascending/i.test(rest)) {
                    category = 'ascending';
                } else if (/descending/i.test(rest)) {
                    category = 'descending';
                }
            }
        }

        return { keyMode, mode: category, diff, title, instructions };
    }

    async function buildCatalog(paths, concurrency = 4) {
        catalog = [];
        let i = 0;
        const results = [];

        async function worker() {
            while (i < paths.length) {
                const idx = i++;
                const raw = paths[idx];
                if (!/\.(krn|hum|txt)$/i.test(raw)) continue;

                try {
                    const { path, text } = await fetchText(raw);
                    const meta = metaFromHeader(text, path);

                    function categoryFromPath(path) {
                        const p = String(path).toLowerCase();

                        if (p.includes('cadence')) return 'cadence';
                        if (p.includes('sequence')) return 'sequence';

                        return null;
                    }

                    results.push({
                        path,
                        mode: categoryFromPath(path),   // 🔥 THIS is the key change
                        keyMode: inferKeyMode(path, text),
                        diff: meta.diff,
                        title: meta.title,
                        instructions: meta.instructions,
                        text
                    });
                } catch (e) {
                    // skip bad file
                }
            }
        }

        await Promise.all(Array.from({ length: concurrency }, worker));
        catalog = results.filter(Boolean);
        if (totalCount) totalCount.textContent = String(catalog.length);
        updateMatchCount();
    }

    function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function matchesFilters(item) {
        if (!item || typeof item !== 'object') return false;

        const activeCategories = selected.category.size
            ? selected.category
            : DEFAULT_CATEGORIES;

        if (!item.mode || !activeCategories.has(item.mode)) return false;

        return true;
    }

    function currentMatches() { return catalog.filter(matchesFilters); }
    function updateMatchCount() {
        if (matchCount) matchCount.textContent = String(currentMatches().length);
    }

    // -------------------- Key button helpers (fixed) --------------------
    function refreshKeyButtonsUI() {
        keyButtons.forEach(btn => {
            const c = Number(btn.dataset.count);
            if (enabledCounts.has(c)) btn.classList.add('selected');
            else btn.classList.remove('selected');
        });
    }
    refreshKeyButtonsUI();
    keyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const c = Number(btn.dataset.count);
            if (enabledCounts.has(c)) {
                enabledCounts.delete(c);
            } else {
                enabledCounts.add(c);
            }
            refreshKeyButtonsUI();
            updateMatchCount();
        });
    });
    selectAllKeysBtn.addEventListener('click', () => {
        for (let i = 0; i <= 7; i++) enabledCounts.add(i);
        refreshKeyButtonsUI();
        updateMatchCount();
        // also select all spelled-tonics for convenience
        selectAllIncludeTonics();
    });
    selectNoneKeysBtn.addEventListener('click', () => {
        enabledCounts.clear();
        refreshKeyButtonsUI();
        updateMatchCount();
        // also clear include spelled-tonics
        clearAllIncludeTonics();
    });

    function getOriginalTonicFromKrn(krnText) {

        const match =
            krnText.match(
                /^\*([A-Ga-g])([#\u266f-]{0,2})\s*:/m
            );

        if (!match) return 'C';

        return normalizeTonicForHumdrum(
            match[1] + (match[2] || '')
        );
    }

    // -------------------- Build allowed tonics (original) --------------------
    function buildAllowedTonicsForMode(mode) {
        const byCount = (mode === 'minor') ? MINOR_BY_COUNT : MAJOR_BY_COUNT;
        const allowed = [];
        for (const cStr of Object.keys(byCount)) {
            const c = Number(cStr);
            if (!enabledCounts.has(c)) continue;
            for (const tonic of byCount[c] || []) allowed.push(tonic);
        }
        return allowed;
    }

    // -------------------- INCLUDE grid wiring (spelled-tonics) --------------------
    function uniqueTonicBasesFromMaps() {
        const set = new Set();
        for (const arr of Object.values(MAJOR_BY_COUNT)) for (const t of arr) {
            const n = normalizeTonicForHumdrum(t);
            if (!n) continue;
            const p = parseTonicString(n);
            if (!p) continue;
            const base = p.letter + (p.acc === 'n' ? '' : p.acc);
            set.add(base);
        }
        for (const arr of Object.values(MINOR_BY_COUNT)) for (const t of arr) {
            const n = normalizeTonicForHumdrum(t);
            if (!n) continue;
            const p = parseTonicString(n);
            if (!p) continue;
            const base = p.letter + (p.acc === 'n' ? '' : p.acc);
            set.add(base);
        }
        return Array.from(set).sort((a, b) => {
            const order = 'CDEFGAB';
            const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
            if (ia !== ib) return ia - ib;
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
    }

    function renderIncludeButtons() {
        const list = uniqueTonicBasesFromMaps();
        includeGridEl.innerHTML = '';
        list.forEach(base => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'include-btn';
            const display = base.replace(/--/g, '♭♭').replace(/-/g, '♭').replace(/#/g, '♯');
            btn.textContent = display;
            btn.dataset.base = base;
            btn.addEventListener('click', () => {
                const b = btn.dataset.base;
                if (allowedTonicBases.has(b)) {
                    allowedTonicBases.delete(b);
                    btn.classList.remove('toggled');
                } else {
                    allowedTonicBases.add(b);
                    btn.classList.add('toggled');
                }
            });
            includeGridEl.appendChild(btn);
        });
    }
    renderIncludeButtons();

    // How many include bases exist in total (used to decide if "All" is truly all)
    const ALL_BASES_LIST = uniqueTonicBasesFromMaps();
    const ALL_BASES_COUNT = ALL_BASES_LIST.length;


    function selectAllIncludeTonics() {
        allowedTonicBases.clear();
        const btns = Array.from(includeGridEl.querySelectorAll('.include-btn'));
        btns.forEach(btn => {
            const b = btn.dataset.base;
            allowedTonicBases.add(b);
            btn.classList.add('toggled');
        });
    }
    function clearAllIncludeTonics() {
        allowedTonicBases.clear();
        const btns = Array.from(includeGridEl.querySelectorAll('.include-btn'));
        btns.forEach(btn => btn.classList.remove('toggled'));
    }

    // Wire the include all/none buttons
    if (includeSelectAllBtn) {
        includeSelectAllBtn.addEventListener('click', () => {
            selectAllIncludeTonics();
        });
    }
    if (includeSelectNoneBtn) {
        includeSelectNoneBtn.addEventListener('click', () => {
            clearAllIncludeTonics();
        });
    }

    // -------------------- Effective allowed tonics (updated) --------------------
    function getEffectiveAllowedTonicsForMode(mode) {
        // First build the set from key-range only
        const allowedByCount = buildAllowedTonicsForMode(mode);

        // IMPORTANT: If Include-grid is effectively "All" or "None", do NOT intersect (no restriction)
        if (allowedTonicBases.size === 0 || allowedTonicBases.size === ALL_BASES_COUNT) {
            return allowedByCount;
        }

        // Otherwise, apply the intersection with the selected include bases
        const out = [];
        const allowedSpecs = Array.from(allowedTonicBases).map(b => {
            const letter = b[0].toUpperCase();
            const acc = b.length > 1 ? b.slice(1) : '';
            return { letter, acc };
        });

        for (const t of allowedByCount) {
            const n = normalizeTonicForHumdrum(t);
            const p = parseTonicString(n);
            if (!p) continue;
            const candLetter = p.letter;                // uppercase
            const candAcc = p.acc === 'n' ? '' : p.acc; // '', '#', '-'
            for (const spec of allowedSpecs) {
                if (candLetter !== spec.letter) continue;
                const specAcc = spec.acc;
                if (specAcc === '') {
                    if (candAcc === '') { out.push(t); break; }
                } else {
                    if (candAcc === specAcc) { out.push(t); break; }
                }
            }
        }

        return out;
    }

    // -------------------- Rendering --------------------

    function tonicToVerovioAscii(tonic) {
        if (!tonic) return '';
        return String(tonic)
            .replace(/--/g, 'bb')
            .replace(/-/g, 'b')
            .replace(/\u266d/g, 'b')
            .replace(/\u266f/g, '#');
    }




    // Fit-to-viewer render (like Boyvin)
    async function renderWithVerovio(
        krnText,
        tonicForRender
    ) {

        try {

            const transposeParam =
                (currentRenderSemitoneShift &&
                    !isNaN(Number(currentRenderSemitoneShift)))
                    ? String(Number(currentRenderSemitoneShift))
                    : (
                        tonicForRender
                            ? tonicToVerovioAscii(
                                String(tonicForRender)
                            )
                            : ''
                    );

            await renderKrn(
                vrv,
                krnText || '',
                svgHost,
                {
                    scale: Number(scaleSlider.value),
                    spacing: Number(spacingSlider.value) / 100
                },
                transposeParam
            );

        } catch (e) {

            svgHost.textContent =
                'Render failed: ' + (e?.message || e);

            traceLog(
                'renderWithVerovio error: ' +
                (e?.message || e)
            );
        }
    }


    // -------------------- Pipeline --------------------
    function runPipelineForEntry(entry, tonic, m) {
        console.log(
            'PIPELINE MODE CHECK',
            {
                tonic,
                m,
                keyMode: entry?.keyMode,
                mode: entry?.mode
            }
        );
        const originalAbsolute = entry.text;

        const instructionsBox = document.getElementById('instructionsBox');
        if (instructionsBox) {
            instructionsBox.textContent = entry.instructions
                ? entry.instructions
                : '';
        }

        // Prepare a working copy first
        let prepared = entry.text;

        // Modern override (if on)
        if (ACC_MODE === 'modern') {
            prepared = applyModernOverride(prepared);
        }

        // Always show the image tagline + a hidden historical span
        modeTagline.innerHTML =
            '<img src="./jsbach.png" alt="J. S. Bach" class="tagline-img">' +
            '<span id="historicalStatus" class="visually-hidden"></span>';

        // Re-query the fresh span (the old const points to a removed node after innerHTML)
        const hs = document.getElementById('historicalStatus');
        if (hs) hs.textContent = `Historical=${ACC_MODE === 'historic' ? 'TRUE' : 'FALSE'}`;

        let suppressed =
            suppressThirdFourthSpinesAfterKey(
                prepared
            );

        // APPLY DOUBLE LENGTH HERE
        suppressed = applyDoubleLengthToSpine1(suppressed);
        const krnSentToVerovio = suppressed;

        const originalTonic =
            getOriginalTonicFromKrn(
                krnSentToVerovio
            );

        // Figure-aware transform using spelled interval + chromatic-bass support
        const { transformedKrn } =
            transformKrnFiguredBass({
                krnText: krnSentToVerovio,
                fromTonic: originalTonic,
                toTonic: String(tonic || '').trim(),
                mode: m,
                fbMode: ACC_MODE
            });

        const transformed = transformedKrn;

        // Save the pre-placement form, then apply placement
        lastTransformedKrn = transformed;
        currentKrn = applyFiguredBassPlacement(lastTransformedKrn, FB_ABOVE);

        currentKrn = moveTextSpineToAbove(currentKrn);

        // Humdrum panel
        humPanel.textContent = '';

        humPanel.textContent += '## 1) ORIGINAL .krn\n\n';
        humPanel.textContent += originalAbsolute + '\n\n';

        humPanel.textContent += '## 2) Pre-transform .krn\n\n';
        humPanel.textContent += krnSentToVerovio + '\n\n';

        humPanel.textContent += '## 3) Final .krn sent to Verovio\n\n';
        humPanel.textContent += currentKrn + '\n\n';

        humPanel.textContent += `## 4) Target key\n\n${formatKeyName(tonic, m)}\n\n`;

        humPanel.textContent += `## 5) Historic mode\n\n${ACC_MODE === 'historic' ? 'ON' : 'OFF'}\n`;

        // Remember keys so toggles can act
        lastTargetTonic = tonic;
        lastTargetMode = m;

        // Reset numeric render shift (octave) when we start a new pipeline run
        currentRenderSemitoneShift = 0;

        // Update badge and render
        updateKeyPill(tonic, m);
        renderWithVerovio(currentKrn, tonic);
    }

    // -------------------- Sample / Random --------------------
    const sample = `**kern\t**fb\t**text\t**text
!!\t\tactual acc.\tforce diatonic accidental
!! Dir\tDescending Minor
!! Title\tRule of the Octave
!! Number\t4
*clefF4\t*\t*\t*
*k[]\t*k[]\t*k[]\t*k:
*a:\t*a:\t*a:\t*a:
=1\t=1\t.\t.
2B-\t.\t.\t.
2A\t.\t.\t.
2c\t.\t.\t.
2Bn\t.\t.\t.
=|\t=|\t.\t.
*-\t*-\t*-\t*-`;

    // -------------------- Enharmonic toggle sets --------------------
    const ENH_MAJOR_PAIRS = [['C#', 'Db'], ['F#', 'Gb']];
    const ENH_MINOR_PAIRS = [['Eb', 'D#'], ['Ab', 'G#'], ['A#', 'Bb']];

    function findEnhPairContaining(name, mode) {
        if (!name) return null;
        const norm = normalizeTonicForHumdrum(name);
        const pairs = (mode === 'minor') ? ENH_MINOR_PAIRS : ENH_MAJOR_PAIRS;
        for (const pair of pairs) {
            for (const p of pair) {
                if (normalizeTonicForHumdrum(p) === norm) return pair;
            }
        }
        return null;
    }

    // -------------------- Semitone/tonic helpers for tp+/- --------------------
    function semitoneToTonicName(targetSemitone, mode, preferFlats) {
        const byCount = (mode === 'minor') ? MINOR_BY_COUNT : MAJOR_BY_COUNT;
        const candidates = [];
        for (const arr of Object.values(byCount)) {
            for (const t of arr) candidates.push(t);
        }
        const matches = candidates.filter(t => {
            const n = normalizeTonicForHumdrum(t);
            const p = parseTonicString(n);
            if (!p) return false;
            return spelledToSemitone(p.letter, p.acc) === ((targetSemitone % 12) + 12) % 12;
        });
        if (!matches.length) return null;
        if (matches.length === 1) return matches[0];
        const flats = matches.filter(x => /b|--|-/.test(x));
        const sharps = matches.filter(x => /#/.test(x));
        if (preferFlats && flats.length) return flats[0];
        if (!preferFlats && sharps.length) return sharps[0];
        return matches[0];
    }

    function pickSpelledTonicBySemitoneStep(currentSpelledTonic, mode, step) {
        const baseParsed = parseTonicString(normalizeTonicForHumdrum(currentSpelledTonic));
        if (!baseParsed) return null;
        const baseSem = spelledToSemitone(baseParsed.letter, baseParsed.acc);
        const newSem = ((baseSem + step) % 12 + 12) % 12;
        const candidatesAllowed = buildAllowedTonicsForMode(mode);
        for (const cand of candidatesAllowed) {
            const p = parseTonicString(normalizeTonicForHumdrum(cand));
            if (!p) continue;
            if (spelledToSemitone(p.letter, p.acc) === newSem) return normalizeTonicForHumdrum(cand);
        }
        const standard = semitoneToTonicName(newSem, mode, transposePreferFlats);
        if (standard) return normalizeTonicForHumdrum(standard);
        if (candidatesAllowed && candidatesAllowed.length) {
            const normList = candidatesAllowed.map(x => normalizeTonicForHumdrum(x));
            let idx = normList.indexOf(normalizeTonicForHumdrum(currentSpelledTonic));
            if (idx < 0) idx = 0;
            const next = normList[(idx + (step > 0 ? 1 : -1) + normList.length) % normList.length];
            return normalizeTonicForHumdrum(next);
        }
        return null;
    }

    // -------------------- Transpose control wiring --------------------
    function setTargetTonic(tonic) {
        if (!currentEntry) { traceLog('setTargetTonic: no current entry'); return; }
        const t = normalizeTonicForHumdrum(tonic);
        lastTargetTonic = t;
        // Use true key-mode (major/minor), not the category label (chromatic/pedal)
        lastTargetMode = lastTargetMode || currentEntry.keyMode || 'major';
        currentRenderSemitoneShift = 0;
        runPipelineForEntry(currentEntry, t, lastTargetMode);
    }

    if (tpPlus) tpPlus.addEventListener('click', () => {
        traceLog('tpPlus pressed (semitone up)');
        if (!lastTargetTonic || !lastTargetMode) { traceLog('tpPlus: no current spelled tonic; nothing to do'); return; }
        const next = pickSpelledTonicBySemitoneStep(lastTargetTonic, lastTargetMode, +1);
        if (next) { traceLog(`tpPlus -> chosen spelled tonic ${next}`); setTargetTonic(next); } else { traceLog('tpPlus: failed to find next spelled tonic - no change'); }
    });
    if (tpMinus) tpMinus.addEventListener('click', () => {
        traceLog('tpMinus pressed (semitone down)');
        if (!lastTargetTonic || !lastTargetMode) { traceLog('tpMinus: no current spelled tonic; nothing to do'); return; }
        const next = pickSpelledTonicBySemitoneStep(lastTargetTonic, lastTargetMode, -1);
        if (next) { traceLog(`tpMinus -> chosen spelled tonic ${next}`); setTargetTonic(next); } else { traceLog('tpMinus: failed to find next spelled tonic - no change'); }
    });

    if (tpToggle) tpToggle.addEventListener('click', () => {
        traceLog('tpToggle clicked');
        if (!lastTargetTonic || !lastTargetMode) {
            transposePreferFlats = !transposePreferFlats;
            tpToggle.classList.toggle('active', transposePreferFlats);
            traceLog('tpToggle: no spelled tonic loaded; toggled preferFlats=' + transposePreferFlats);
            return;
        }
        const pair = findEnhPairContaining(lastTargetTonic, lastTargetMode);
        if (!pair) {
            transposePreferFlats = !transposePreferFlats;
            tpToggle.classList.toggle('active', transposePreferFlats);
            traceLog('tpToggle: no pair for ' + lastTargetTonic + '; preferFlats=' + transposePreferFlats);
            updateKeyPill(lastTargetTonic, lastTargetMode);
            return;
        }
        const norm = normalizeTonicForHumdrum(lastTargetTonic);
        const other = normalizeTonicForHumdrum(pair[0]) === norm ? pair[1] : pair[0];
        traceLog(`tpToggle: switching ${norm} -> ${other}`);
        setTargetTonic(other);
        transposePreferFlats = /b|--|-/.test(other);
        tpToggle.classList.toggle('active', transposePreferFlats);
    });




    // -------------------- Octave buttons (render-only numeric transpose) --------------------
    function applyRenderSemitoneShift(delta) {
        // accumulate numeric render shifts (12 per octave)
        currentRenderSemitoneShift = (currentRenderSemitoneShift || 0) + delta;
        traceLog(`applyRenderSemitoneShift => ${currentRenderSemitoneShift}`);
        // Re-render with same pipeline-output KRn, but numeric transpose to verovio.
        renderWithVerovio(currentKrn || sample, lastTargetTonic || '');
        // Keep key pill showing the spelled target key (do not change it)
        updateKeyPill(lastTargetTonic || '', lastTargetMode || '');
    }
    if (octPlus) octPlus.addEventListener('click', () => { traceLog('octPlus clicked'); applyRenderSemitoneShift(+12); });
    if (octMinus) octMinus.addEventListener('click', () => { traceLog('octMinus clicked'); applyRenderSemitoneShift(-12); });

    // -------------------- Accidentals toggle re-run + label visuals --------------------
    const labelHistoric = document.getElementById('labelHistoric');
    const labelModern = document.getElementById('labelModern');
    function updateAccLabelVisuals() {
        const checked = document.querySelector('input[name="accMode"]:checked');
        if (checked && checked.value === 'modern') {
            labelModern.classList.add('selected');
            labelHistoric.classList.remove('selected');
        } else {
            labelHistoric.classList.add('selected');
            labelModern.classList.remove('selected');
        }
    }
    accRadios.forEach(r => {
        r.addEventListener('change', () => {
            if (!r.checked) return;
            ACC_MODE = r.value === 'modern' ? 'modern' : 'historic';
            updateAccLabelVisuals();
            traceLog(`Accidentals mode changed => ${ACC_MODE}`);

            if (currentEntry && lastTargetTonic && lastTargetMode) {
                runPipelineForEntry(currentEntry, lastTargetTonic, lastTargetMode);
            } else {
                // Keep the image tagline and add a fresh hidden span
                modeTagline.innerHTML =
                    '<img src="./jsbach.png" alt="J. S. Bach" class="tagline-img">' +
                    '<span id="historicalStatus" class="visually-hidden"></span>';

                // Write to the new span
                const hs = document.getElementById('historicalStatus');
                if (hs) hs.textContent = `Historical=${ACC_MODE === 'historic' ? 'TRUE' : 'FALSE'}`;
            }
        });
    });
    updateAccLabelVisuals(); // initialize visual

    // -------------------- Figured-bass placement radio wiring --------------------
    function updateFigPlaceLabelVisuals() {
        const fbAbove = document.getElementById('fbAbove');
        const fbBelow = document.getElementById('fbBelow');
        const labA = document.getElementById('labelFigAbove');
        const labB = document.getElementById('labelFigBelow');
        const above = !!(fbAbove && fbAbove.checked);
        if (labA) labA.classList.toggle('selected', above);
        if (labB) labB.classList.toggle('selected', !above);
    }

    (function initFigPlacementRadios() {
        const fbAbove = document.getElementById('fbAbove');
        const fbBelow = document.getElementById('fbBelow');

        const applyAndRender = () => {
            FB_ABOVE = !!(fbAbove && fbAbove.checked);
            updateFigPlaceLabelVisuals();

            // Re-apply placement to the latest transposed KRn and re-render
            if (lastTransformedKrn) {
                currentKrn = applyFiguredBassPlacement(lastTransformedKrn, FB_ABOVE);
                renderWithVerovio(currentKrn, lastTargetTonic || '');

                // Re-run the pipeline so the Humdrum panel sections stay perfectly in sync
                if (currentEntry && lastTargetTonic && lastTargetMode) {
                    runPipelineForEntry(currentEntry, lastTargetTonic, lastTargetMode);
                }
            }
        };

        if (fbAbove) fbAbove.addEventListener('change', applyAndRender);
        if (fbBelow) fbBelow.addEventListener('change', applyAndRender);

        // initial visuals
        updateFigPlaceLabelVisuals();
    })();

    // double length
    function updateDoubleLengthLabels() {
        const on = document.querySelector('input[name="doubleLength"][value="on"]');
        const off = document.querySelector('input[name="doubleLength"][value="off"]');
        const labOn = document.getElementById('labelDLOn');
        const labOff = document.getElementById('labelDLOff');

        if (on && on.checked) {
            labOn.classList.add('selected');
            labOff.classList.remove('selected');
        } else {
            labOff.classList.add('selected');
            labOn.classList.remove('selected');
        }
    }

    document.querySelectorAll('input[name="doubleLength"]').forEach(r => {
        r.addEventListener('change', () => {
            DOUBLE_LENGTH = (r.value === 'on');
            updateDoubleLengthLabels();

            if (currentEntry && lastTargetTonic && lastTargetMode) {
                runPipelineForEntry(currentEntry, lastTargetTonic, lastTargetMode);
            }
        });
    });

    // initialize
    updateDoubleLengthLabels();

    // -------------------- Filter button wiring (FIX) --------------------
    // Utility to toggle a value in a Set and update UI/counts
    function toggleFilterValue(filterName, value, btnEl) {
        const set = selected[filterName];
        if (!set) return;

        if (set.has(value)) {
            set.delete(value);
            btnEl.classList.remove('selected');
        } else {
            set.add(value);
            btnEl.classList.add('selected');
        }

        updateMatchCount();
    }

    // Attach listeners to Key Mode / Category / Diff buttons
    Array.from(document.querySelectorAll('#keyModeRow .btn')).forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.value;
            if (!v) return;
            toggleFilterValue('keyMode', v, btn);
        });
    });

    Array.from(document.querySelectorAll('#categoryRow .btn')).forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.value;
            if (!v) return;
            toggleFilterValue('category', v, btn);
        });
    });



    // Clear filters button: clear internal sets and visual selected classes
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            selected.keyMode = new Set(DEFAULT_KEY_MODES);
            selected.category = new Set(DEFAULT_CATEGORIES);



            setButtonSelection('#categoryRow', selected.category);


            updateMatchCount();
        });
    }

    // ==========================================================================
    // SCOREBOARD (keys × titles)
    // - Columns: exact order with UPPERCASE majors, lowercase minors.
    // - Rows: "<Dir> <Number>" (e.g., "Ascending 5"), alphabetical, de-duplicated.
    // - Update: once per "New Bass Line" draw.
    // ==========================================================================

    // Columns (ASCII internal IDs). We'll render with proper ♯/♭ glyphs in the header.
    const SCORE_COLS_ASCII = [
        // Majors (UPPERCASE)
        'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
        // Minors (lowercase)
        'a', 'e', 'b', 'f#', 'c#', 'g#', 'd#', 'a#', 'd', 'g', 'c', 'f', 'bb', 'eb', 'ab'
    ];

    // State: Map<rowLabel, Map<colKey, count>>
    const scoreState = new Map();

    // Build header and empty body once

    // Build header (adds a permanent "totals" column header right of the title column)
    function initScoreboard() {
        if (!scoreTable) return;

        // Clear table
        scoreTable.innerHTML = '';

        const thead = document.createElement('thead');
        const trh = document.createElement('tr');

        // First column = row label
        const th0 = document.createElement('th');
        th0.textContent = 'Title (Dir + Num)';
        trh.appendChild(th0);

        // NEW: Totals column header (italic)
        const thTotals = document.createElement('th');
        thTotals.textContent = 'totals';
        thTotals.className = 'totals-col';
        trh.appendChild(thTotals);

        // Key columns with glyphs
        for (const col of SCORE_COLS_ASCII) {
            const th = document.createElement('th');
            th.textContent = asciiKeyToGlyph(col);
            trh.appendChild(th);
        }
        thead.appendChild(trh);

        const tbody = document.createElement('tbody');
        tbody.id = 'scoreBody';

        scoreTable.appendChild(thead);
        scoreTable.appendChild(tbody);
    }


    function asciiKeyToGlyph(k) {
        // k like 'F#', 'Bb', 'f#', 'bb' → display with ♯/♭, keep letter case
        const letter = k.charAt(0);
        const rest = k.slice(1);
        return letter + rest.replace(/#/g, '♯').replace(/b/g, '♭');
    }

    // Convert our tonic (Humdrum normalization uses '#' and '-' for flats) to
    // an ASCII scoreboard column ID in the correct case for mode.
    function humTonicToScoreAscii(tonic, mode) {
        if (!tonic) return null;
        // Normalize humdrum: '--' (dbl flat) → 'bb'; '-' → 'b'; '♯' → '#'; '♭' → 'b'
        let t = String(tonic).trim()
            .replace(/--/g, 'bb')
            .replace(/-/g, 'b')
            .replace(/\u266f/g, '#')
            .replace(/\u266d/g, 'b');

        const base = t.charAt(0);       // letter
        const acc = t.slice(1);        // accidental part if any
        const isMinor = (mode === 'minor');

        const candidate = (isMinor ? base.toLowerCase() : base.toUpperCase()) + acc;
        return SCORE_COLS_ASCII.includes(candidate) ? candidate : null;
    }

    // Add one count to the (rowLabel, colKey) cell
    function addScore(rowLabel, colKey) {
        if (!rowLabel || !colKey) return;
        if (!scoreState.has(rowLabel)) scoreState.set(rowLabel, new Map());
        const rowMap = scoreState.get(rowLabel);
        rowMap.set(colKey, (rowMap.get(colKey) || 0) + 1);
    }


    // Re-render the body (adds a permanent first data row with column totals,
    // and a permanent second column with per-row totals)
    function renderScoreboard() {
        const tbody = document.getElementById('scoreBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const labels = Array.from(scoreState.keys()).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true })
        );

        // Precompute column totals and row totals
        const colTotals = new Map(SCORE_COLS_ASCII.map(k => [k, 0]));
        const rowTotals = new Map();

        for (const label of labels) {
            const rowMap = scoreState.get(label) || new Map();
            let rSum = 0;
            for (const col of SCORE_COLS_ASCII) {
                const v = rowMap.get(col) || 0;
                rSum += v;
                colTotals.set(col, (colTotals.get(col) || 0) + v);
            }
            rowTotals.set(label, rSum);
        }

        // ---- Totals row (first data row, directly underneath the header) ----
        const trTotals = document.createElement('tr');
        trTotals.className = 'totals-row';

        // label cell
        const tdLabel = document.createElement('td');
        tdLabel.textContent = 'totals';
        trTotals.appendChild(tdLabel);

        // Totals column cell in the totals row: keep blank (or compute grand total if desired)
        const tdGrand = document.createElement('td');

        const grandTotal = Array.from(rowTotals.values())
            .reduce((a, b) => a + b, 0);

        tdGrand.textContent = grandTotal || '';
        tdGrand.className = 'grand-total-cell';

        trTotals.appendChild(tdGrand);

        // Column totals by key
        for (const col of SCORE_COLS_ASCII) {
            const td = document.createElement('td');
            const v = colTotals.get(col) || 0;
            td.textContent = v ? String(v) : '';
            trTotals.appendChild(td);
        }
        tbody.appendChild(trTotals);

        // ---- Regular rows (with per-row totals in the 2nd column) ----
        for (const label of labels) {
            const tr = document.createElement('tr');

            // Row label
            const tdL = document.createElement('td');
            tdL.textContent = label;
            tr.appendChild(tdL);

            // NEW: totals column for this row
            const tdRowTotal = document.createElement('td');
            const rSum = rowTotals.get(label) || 0;
            tdRowTotal.textContent = rSum ? String(rSum) : '';
            tdRowTotal.className = 'totals-col';
            tr.appendChild(tdRowTotal);

            // Key cells
            const rowMap = scoreState.get(label) || new Map();
            for (const col of SCORE_COLS_ASCII) {
                const td = document.createElement('td');
                const v = rowMap.get(col) || 0;
                td.textContent = v ? String(v) : '';
                tr.appendChild(td);
            }

            tbody.appendChild(tr);
        }
    }


    // Derive row label from the chosen entry (supports Ascending/Descending Chromatic)
    // Derive row label from the chosen entry (supports Ascending/Descending Chromatic, Common Chord)
    // Derive row label from the chosen entry
    function rowLabelFromEntry(entry) {
        const category = (entry?.mode || '').toLowerCase();
        const num = (entry?.diff != null) ? String(entry.diff) : '';

        const noRoO = new Set(['pedal', 'modulating', 'mod-remote']);

        if (category === 'common-chord') {
            const keyMode = entry?.keyMode ? ` (${entry.keyMode})` : '';
            return `Common Chord${keyMode}${num ? ' ' + num : ''}`;
        }

        if (category === 'asc-chromatic' || category === 'desc-chromatic') {
            return `${categoryDisplayName(category)} Rule of the Octave${num ? ' ' + num : ''}`;
        }

        if (category === 'ascending' || category === 'descending') {
            return `${categoryDisplayName(category)} Rule of the Octave${num ? ' ' + num : ''}`;
        }

        const label = categoryDisplayName(category);

        if (noRoO.has(category)) {
            // 🔥 NO "Rule of the Octave"
            return `${label}${num ? ' ' + num : ''}`;
        }

        if (label) {
            return [label, 'Rule of the Octave', num].filter(Boolean).join(' ');
        }

        return num || '(untitled)';
    }


    // Public hook: call this right after a draw is finalized
    function updateScoreboardForDraw(entry, tonic, trueMode) {
        const colKey = humTonicToScoreAscii(tonic, trueMode);
        if (!colKey) {
            // Key not in the specified scoreboard columns; silently ignore.
            return;
        }
        const label = rowLabelFromEntry(entry);
        addScore(label, colKey);
        renderScoreboard();
    }

    // Reset button
    if (scoreResetBtn) {
        scoreResetBtn.addEventListener('click', () => {
            scoreState.clear();
            renderScoreboard();
        });
    }

    // Initialize header + empty body on load
    initScoreboard();
    renderScoreboard();

    // --- Collapsible Scoreboard (same chevron behavior as Humdrum panel) ---
    (function initScoreboardCollapsed() {
        const sbPanelEl = document.getElementById('scoreboard');
        if (!sbPanelEl) return;

        // Create toggle button (re-use same classes to match the Humdrum toggle)
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'humdrum-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'scoreboard');

        const chev = document.createElement('span');
        chev.className = 'humdrum-chevron';
        chev.textContent = '►'; // closed

        const txt = document.createElement('span');
        txt.textContent = 'Scoreboard — click to open';

        toggle.appendChild(chev);
        toggle.appendChild(txt);

        // Insert above the scoreboard and start collapsed
        sbPanelEl.parentNode.insertBefore(toggle, sbPanelEl);
        sbPanelEl.style.display = 'none';

        toggle.addEventListener('click', () => {
            const isOpen = sbPanelEl.style.display !== 'none';
            if (isOpen) {
                sbPanelEl.style.display = 'none';
                toggle.setAttribute('aria-expanded', 'false');
                chev.textContent = '►';
                txt.textContent = 'Scoreboard — click to open';
            } else {
                sbPanelEl.style.display = 'block';
                toggle.setAttribute('aria-expanded', 'true');
                chev.textContent = '▼';
                txt.textContent = 'Scoreboard — click to close';
            }
        });
    })();

    // -------------------- Sample / Random wiring (UPDATED to respect include spelled-tonics) ----
    randomBtn.addEventListener('click', async () => {
        // Pick from filtered catalog, or fall back to sample
        const matches = currentMatches();

        if (!matches.length) {
            setStatus('No matching exercises.', true);
            return;
        }

        const pick = pickRandom(matches);

        currentEntry = pick;

        // Target key mode comes from the UI, not from the source .krn
        const mForTonics = pick.keyMode || inferKeyMode(pick.path, pick.text) || 'major';

        // Use effective allowed tonics (Include-grid and Key-Range) based on chosen target mode
        const allowedTonics = getEffectiveAllowedTonicsForMode(mForTonics);

        traceLog(`Allowed tonics for key-mode=${mForTonics}: ${JSON.stringify(allowedTonics)}`);
        traceLog(
            `POOL targetMode=${mForTonics} ` +
            `counts=[${Array.from(enabledCounts).sort((a, b) => a - b).join(',')}] ` +
            `allowedTonics=${JSON.stringify(allowedTonics)}`
        );

        if (!allowedTonics.length) {
            const msg = 'No allowed keys selected for this mode. Enable one or more key-range buttons (0..7) or choose Include keys.';
            setStatus(msg, true);
            traceLog('ERROR: ' + msg);
            updatePillsFromCatalogEntry(pick);
            updateKeyPill('', mForTonics);
            humPanel.textContent = '##original\n' + suppressThirdFourthSpinesAfterKey(pick.text) + '\n\n##transposed to [none]\n';
            return;
        }

        // Choose a target tonic within the allowed set
        const tonic = normalizeTonicForHumdrum(pickRandom(allowedTonics));
        lastTargetTonic = tonic;
        lastTargetMode = mForTonics;

        // Update UI and run pipeline
        updatePillsFromCatalogEntry(pick);
        updateKeyPill(tonic || '', mForTonics);
        runPipelineForEntry(pick, tonic, mForTonics);
        updateScoreboardForDraw(pick, tonic, mForTonics);
    });

    // -------------------- Scale / Spacing wiring --------------------
    function updateScaleValueDisplay() {
        if (scaleValue && scaleSlider) scaleValue.textContent = String(Number(scaleSlider.value));
    }
    function updateSpacingValueDisplay() {
        if (spacingValue && spacingSlider) spacingValue.textContent = (Number(spacingSlider.value) / 100).toFixed(2);
    }
    if (scaleSlider) {
        scaleSlider.addEventListener('input', () => {
            updateScaleValueDisplay();
            if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic);
            else renderWithVerovio(sample, '');
        });
        updateScaleValueDisplay();
    }
    if (spacingSlider) {
        spacingSlider.addEventListener('input', () => {
            updateSpacingValueDisplay();
            if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic);
            else renderWithVerovio(sample, '');
        });
        updateSpacingValueDisplay();
    }
    if (scaleMinus) scaleMinus.addEventListener('click', () => { scaleSlider.value = Math.max(10, Number(scaleSlider.value) - 1); updateScaleValueDisplay(); if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic); else renderWithVerovio(sample, ''); });
    if (scalePlus) scalePlus.addEventListener('click', () => { scaleSlider.value = Math.min(120, Number(scaleSlider.value) + 1); updateScaleValueDisplay(); if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic); else renderWithVerovio(sample, ''); });
    if (scaleReset) scaleReset.addEventListener('click', () => { scaleSlider.value = 50; updateScaleValueDisplay(); if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic); else renderWithVerovio(sample, ''); });

    if (spacingMinus) spacingMinus.addEventListener('click', () => { spacingSlider.value = Math.max(10, Number(spacingSlider.value) - 1); updateSpacingValueDisplay(); if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic); else renderWithVerovio(sample, ''); });
    if (spacingPlus) spacingPlus.addEventListener('click', () => { spacingSlider.value = Math.min(120, Number(spacingSlider.value) + 1); updateSpacingValueDisplay(); if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic); else renderWithVerovio(sample, ''); });
    if (spacingReset) spacingReset.addEventListener('click', () => { spacingSlider.value = 32; updateSpacingValueDisplay(); if (currentKrn) renderWithVerovio(currentKrn, lastTargetTonic); else renderWithVerovio(sample, ''); });

    // -------------------- Misc UI placeholders --------------------
    if (tpMinus) tpMinus.addEventListener('click', () => { /* handled above */ });
    if (tpPlus) tpPlus.addEventListener('click', () => { /* handled above */ });
    if (tpToggle) tpToggle.addEventListener('click', () => { /* handled above */ });

    // -------------------- Init: catalog or sample --------------------
    const paths = await (async () => {
        try { return await fetchList(); } catch (e) { return []; }
    })();
    if (paths.length) {
        setStatus('Indexing tunes.json…');
        await buildCatalog(paths, 4);
        setStatus('Index complete — choose filters & key range, then click “New Bass Line”.');
    } else {
        setStatus('No tunes.json found — using sample.');
    }

    // By default include all spelled tonics (user asked default = all lit up)
    selectAllIncludeTonics();

    // Also make sure key-range default selected matches earlier behavior (all)
    for (let i = 0; i <= 7; i++) enabledCounts.add(i);
    refreshKeyButtonsUI();
    updateMatchCount();

    if (!currentKrn) {
        currentEntry = { path: 'sample', text: sample, mode: 'descending', keyMode: 'minor', diff: 1, title: 'Sample' };
        const prepared = suppressThirdFourthSpinesAfterKey(sample);
        humPanel.textContent = '##original\n' + prepared + '\n\n##transposed to [none]\n';
        renderWithVerovio(sample, '');
        setStatus('ready — toggle TRACE and click "New Bass Line"');
    }

})();
