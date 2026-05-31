export let FB_MODE = 'historic';

export function setFbMode(mode) {
    FB_MODE = (mode === 'modern') ? 'modern' : 'historic';
}

// ----------------------------
// FIGURE PARSING
// ----------------------------

function getFigureNumerals(figure) {
    const numerals = [];
    const matches = [...figure.matchAll(/\d+/g)];

    for (const m of matches) {
        numerals.push(Number(m[0]));
    }

    // standalone accidental = altered third
    if (/[#n-]/.test(figure) && !/\d[#n-]/.test(figure)) {
        numerals.push(3);
    }

    return numerals;
}

// ----------------------------
// DIATONIC LOGIC
// ----------------------------

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const LETTER_TO_SEMITONE = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
};

const KEY_SIGNATURES = {
    'C major': {},
    'G major': { F: '#' },
    'D major': { F: '#', C: '#' },
    'A major': { F: '#', C: '#', G: '#' },
    'E major': { F: '#', C: '#', G: '#', D: '#' },
    'B major': { F: '#', C: '#', G: '#', D: '#', A: '#' },
    'F# major': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#' },
    'C# major': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#', B: '#' },

    'F major': { B: '-' },
    'Bb major': { B: '-', E: '-' },
    'Eb major': { B: '-', E: '-', A: '-' },
    'Ab major': { B: '-', E: '-', A: '-', D: '-' },
    'Db major': { B: '-', E: '-', A: '-', D: '-', G: '-' },
    'Gb major': { B: '-', E: '-', A: '-', D: '-', G: '-', C: '-' },
    'Cb major': { B: '-', E: '-', A: '-', D: '-', G: '-', C: '-', F: '-' },


    'a minor': {},
    'e minor': { F: '#' },
    'b minor': { F: '#', C: '#' },
    'f# minor': { F: '#', C: '#', G: '#' },
    'c# minor': { F: '#', C: '#', G: '#', D: '#' },
    'g# minor': { F: '#', C: '#', G: '#', D: '#', A: '#' },
    'd# minor': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#' },
    'a# minor': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#', B: '#' },

    'd minor': { B: '-' },
    'g minor': { B: '-', E: '-' },
    'c minor': { B: '-', E: '-', A: '-' },
    'f minor': { B: '-', E: '-', A: '-', D: '-' },
    'bb minor': { B: '-', E: '-', A: '-', D: '-', G: '-' },
    'eb minor': { B: '-', E: '-', A: '-', D: '-', G: '-', C: '-' },
    'ab minor': { B: '-', E: '-', A: '-', D: '-', G: '-', C: '-', F: '-' }
};

function getScaleAccidental(tonic, mode, letter) {
    // Try both capitalizations for tonic
    const key1 = `${tonic} ${mode}`;
    const key2 = `${tonic.toLowerCase()} ${mode}`;
    const sig = KEY_SIGNATURES[key1] || KEY_SIGNATURES[key2] || {};
    return sig[letter] || 'n';
}

// ----------------------------

// ----------------------------
// FIGURE PARSING
// ----------------------------

function parseFigurePairs(figure) {
    // Returns array of {numeral, accidental} in order
    // Handles: "6 4", "5 #", "#", "n", "6#", "5-", "6 4\n5 #" etc.

    const pairs = [];

    // Match digit+optional_immediately_attached_accidental
    const explicitMatches = [...figure.matchAll(/(\d+)(--|##|#|-|n)?/g)];
    for (const m of explicitMatches) {
        pairs.push({
            numeral: Number(m[1]),
            accidental: m[2] || null  // null = use diatonic
        });
    }

    // Check for standalone accidental (not attached to any digit) = implied 3rd
    const standaloneAcc = figure.match(/(?<!\d)(--|##|#|-|n)(?!\d)/)?.[0];
    if (standaloneAcc) {
        pairs.push({ numeral: 3, accidental: standaloneAcc });
    }

    return pairs;
}

// ----------------------------
// DIATONIC LOGIC
// ----------------------------

export function computeDiatonicIntervalNotes(bass, figure, tonic, mode) {
    if (!bass) return '';

    const pairs = parseFigurePairs(figure);
    if (!pairs.length) return '';

    const bassLetter = bass[0].toUpperCase();
    const index = LETTERS.indexOf(bassLetter);

    return pairs.map(({ numeral }) => {
        const target = LETTERS[(index + numeral - 1) % 7];
        const acc = getScaleAccidental(tonic, mode, target);
        return target + acc;
    }).join(' ');
}

// ----------------------------
// ACCIDENTAL HANDLING
// ----------------------------

function noteToSemitone(note) {
    const letter = note[0];
    const acc = note.slice(1);

    let s = LETTER_TO_SEMITONE[letter];

    if (acc === '#') s += 1;
    if (acc === '##') s += 2;
    if (acc === '-') s -= 1;
    if (acc === '--') s -= 2;

    return s;
}

function accidentalOffset(acc) {
    if (acc === '#') return 1;
    if (acc === '##') return 2;
    if (acc === '-') return -1;
    if (acc === '--') return -2;
    return 0;
}

function offsetToAccidental(o) {
    if (o === 0) return 'n';
    if (o > 0) return '#'.repeat(o);
    return '-'.repeat(Math.abs(o));
}

// ----------------------------

export function computeUpperNotesReferenced(bass, figure, tonic, mode) {
    const pairs = parseFigurePairs(figure);
    if (!pairs.length) return '';

    const bassLetter = bass[0].toUpperCase();
    const index = LETTERS.indexOf(bassLetter);

    return pairs.map(({ numeral, accidental }) => {
        const target = LETTERS[(index + numeral - 1) % 7];
        const diatonicAcc = getScaleAccidental(tonic, mode, target);
        const finalAcc = accidental === null ? diatonicAcc
                       : accidental === 'n'  ? 'n'
                       : accidental;
        return target + finalAcc;
    }).join(' ');
}

// ----------------------------

export function computeDeviationFromDiatonic(din, unr) {

    if (!din || !unr) return '';

    const a = din.trim().split(/\s+/);
    const b = unr.trim().split(/\s+/);

    const len = Math.min(a.length, b.length);

    return a.slice(0, len).map((d, i) => {

        if (!d || !b[i]) {
            return '0';
        }

        const diff =
            noteToSemitone(b[i]) -
            noteToSemitone(d);

        return diff >= 0
            ? `+${diff}`
            : `${diff}`;

    }).join(' ');
}

// ----------------------------

export function computeNewUpperNotesReferenced(din, dfd) {
    const notes = din.split(' ');
    const devs = dfd.split(' ').map(Number);

    return notes.map((n, i) => {
        const offset = accidentalOffset(n.slice(1));
        const newOffset = offset + devs[i];
        return n[0] + offsetToAccidental(newOffset);
    }).join(' ');
}

// ----------------------------

export function buildNewFigure(original, newNotes) {
    if (/^[\d\s]+$/.test(original)) return original;
    if (/[\/|\\]/.test(original)) return original;

    const accs = newNotes.split(' ').map(n => n.slice(1));
    let explicitIndex = 0;
    let standaloneIndex = -1;

    // Find which index in accs corresponds to the standalone accidental
    const hasStandalone = /(?<!\d)(--|##|#|-|n)(?!\d)/.test(original);
    const explicitCount = [...original.matchAll(/(\d+)(--|##|#|-|n)?/g)].length;
    if (hasStandalone) standaloneIndex = explicitCount; // it's appended last by parseFigurePairs

    // Replace digit+attached_accidental pairs
    let result = original.replace(/(\d+)(--|##|#|-|n)?/g, (_, num, acc) => {
        const newAcc = acc != null ? (accs[explicitIndex++] || 'n') : '';
        return num + newAcc;
    });

    // Replace standalone accidental
    if (hasStandalone && standaloneIndex < accs.length) {
        const newAcc = acc ? (accs[explicitIndex++] || 'n') : '';
        result = result.replace(/(?<!\d)(--|##|#|-|n)(?!\d)/, newAcc);
    }

    return result;
}

// ----------------------------
// KEY INTERVAL + TRANSPOSITION
// ----------------------------

const LETTER_INDEX = {
    C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6
};

const SEMITONES = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
};

function parseNote(note) {
    const m = note.match(/^([A-Ga-g])([#b-]?)$/);
    if (!m) return null;

    return {
        letter: m[1].toUpperCase(),
        accidental: m[2] === 'b' ? '-' : m[2] || ''
    };
}

function noteToValue(note) {
    const p = parseNote(note);
    if (!p) return 0;

    let val = SEMITONES[p.letter];

    if (p.accidental === '#') val += 1;
    if (p.accidental === '-') val -= 1;

    return val;
}

export function computeKeyIntervalDescription(from, to) {

    const a = parseNote(from);
    const b = parseNote(to);

    if (!a || !b) return null;

    const letterDistance =
        (LETTER_INDEX[b.letter] - LETTER_INDEX[a.letter] + 7) % 7;

    const semitoneDistance =
        (noteToValue(to) - noteToValue(from) + 12) % 12;

    return {
        letterShift: letterDistance,
        semitoneShift: semitoneDistance
    };
}

export function transposeBassNote(note, interval) {
    if (!note || !interval) return note;

    // Separate repeated-letter octave prefix from accidental
    const m = note.match(/^([A-Ga-g]+)([#\-]*)$/);
    if (!m) return note;

    const letters = m[1];          // e.g. "GG"
    const accidental = m[2];       // e.g. ""
    const coreLetter = letters[0].toUpperCase();

    const parsed = {
        letter: coreLetter,
        accidental: accidental === 'b' ? '-' : accidental
    };

    const newLetterIndex = (LETTER_INDEX[parsed.letter] + interval.letterShift) % 7;
    const newLetter = Object.keys(LETTER_INDEX).find(k => LETTER_INDEX[k] === newLetterIndex);

    const naturalValue = SEMITONES[newLetter];
    const targetValue = (noteToValue(coreLetter + accidental) + interval.semitoneShift) % 12;

    let offset = targetValue - naturalValue;
    if (offset > 6) offset -= 12;
    if (offset < -6) offset += 12;

    let newAcc = '';
    if (offset > 0) newAcc = '#'.repeat(offset);
    else if (offset < 0) newAcc = '-'.repeat(-offset);

    // Rebuild with same letter repetition, new pitch letter, new accidental
    const newLetterRepeated = letters.replace(/[A-Ga-g]/g,
        (c) => c === c.toUpperCase() ? newLetter : newLetter.toLowerCase()
    );

    return newLetterRepeated + newAcc;
}

// ----------------------------
// MAIN ENGINE
// ----------------------------

export function transformKrnFiguredBass({
    krnText,
    fromTonic,
    toTonic,
    mode,
    fbMode = FB_MODE
}) {

    const lines = krnText.split(/\r?\n/);
    let currentBass = null;

    const outLines = lines.map(line => {

        if (!line.includes('\t')) return line;


        // ✅ HEADER LINES
        if (line.startsWith('**')) {

            const fields = line.split('\t');

            if (fields.length >= 2) {
                fields[1] = '**fb';
            }

            if (fields.length >= 3) {
                fields.splice(2, 1);
            }

            return fields.join('\t');
        }


        // ✅ TERMINATOR LINES
        if (line.startsWith('*-')) {

            const fields = line.split('\t');

            if (fields.length >= 3) {
                fields.splice(2, 1);
            }

            return fields.join('\t');
        }

        const fields = line.split('\t');

        const bassField = (fields[0] || '').trim();
        const historic = (fields[1] || '').trim();
        const modern = (fields[2] || '').trim();

        const bassMatch = bassField.match(/([A-Ga-g]+[#-]*)/);
        if (bassMatch) currentBass = bassMatch[1];

        const hasFigure = historic && historic !== '.';

        if (!hasFigure) {
            // still remove modern spine
            fields.splice(2, 1);
            return fields.join('\t');
        }

        const activeFigure =
            (fbMode === 'modern' && modern && modern !== '.')
                ? modern
                : historic;

        // ✅ PASS-THROUGH RULES

        const isNumericOnly =
            /^[\d\s]+$/.test(activeFigure);

        const hasSlash =
            /[\/|\\]/.test(activeFigure);

        const isHistoricFlatFive =
            (fbMode === 'historic' && activeFigure === '5-');

        if (isNumericOnly || hasSlash || isHistoricFlatFive) {

            fields[1] = activeFigure;

            fields.splice(2, 1);

            return fields.join('\t');
        }

        const DIN = computeDiatonicIntervalNotes(
            currentBass,
            activeFigure,
            fromTonic,
            mode
        );

        const UNR = computeUpperNotesReferenced(
            currentBass,
            activeFigure,
            fromTonic,
            mode
        );

        const DFD = computeDeviationFromDiatonic(DIN, UNR);

        // ✅ TARGET KEY RECONSTRUCTION

        const interval = computeKeyIntervalDescription(
            fromTonic,
            toTonic
        );

        const newBass = transposeBassNote(
            currentBass,
            interval
        );


        const DINNK = computeDiatonicIntervalNotes(
            newBass,
            activeFigure,
            toTonic,
            mode
        );

        const NUNR = computeNewUpperNotesReferenced(
            DINNK,
            DFD
        );

        console.log({
            activeFigure,
            currentBass,
            newBass,
            DIN,
            UNR,
            DFD,
            DINNK,
            NUNR
        });

        const newFigure = buildNewFigure(
            activeFigure,
            NUNR
        );

        console.log(activeFigure, newFigure);
        // replace figure
        fields[1] = newFigure;

        // remove modern spine
        fields.splice(2, 1);

        return fields.join('\t');
    });

    return {
        transformedKrn: outLines.join('\n')
    };
}
