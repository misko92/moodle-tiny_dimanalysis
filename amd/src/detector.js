// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Pure dimensional-analysis (factor-label) expression *detector*.
 *
 * A JavaScript port of the detection and validation half of PHP
 * `filter_dimanalysis\local\parser`, so what the editor highlights is
 * exactly what the filter will lay out as stacked fractions at display
 * time. It never produces HTML and never mutates its input: it only
 * reports the [start, end) offsets of each recognised expression within
 * a string.
 *
 * Recognises the natural form
 *
 *     5 L x (1 mol / 22.4 L) x (46 g / 1 mol)
 *
 * (auto-detected when >= 2 terms are joined by x / X / U+00D7 / * /
 * U+00B7 / U+22C5 / U+2219 and at least one is a parenthesised "a / b"),
 * and the explicit `[da] ... [/da]` block. Same deliberate limits as the
 * filter: parentheses nest one level; a bare quantity may not contain
 * the ASCII letter "x"; the expression must lie within one string
 * (one text node).
 *
 * @module      tiny_dimanalysis/detector
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {string[]} Multi-character multiplicative separators. */
const SEP_CHARS = ['×', '*', '·', '⋅', '∙'];

/** @type {string} Character class body (negated, used with the /u flag). */
const NOT_BARE = '[^()=/xX×*·⋅∙]';

/** @type {string[]} Units recognised when a run has no space after the number. */
const KNOWN_UNITS = [
    'molecules', 'particles', 'formula', 'atoms', 'ions', 'items',
    'mmol', 'umol', 'µmol', 'mol',
    'kcal', 'cal', 'kJ', 'J',
    'mL', 'dL', 'uL', 'µL', 'L',
    'mg', 'ug', 'µg', 'ng', 'kg', 'g',
    'kPa', 'Pa', 'atm', 'torr', 'bar', 'mmHg',
    'mol/L', 'M', 'km', 'cm', 'mm', 'nm', 'pm', 'm',
    'min', 'ms', 'hr', 'h', 's',
    'K', 'eq', 'meq',
].sort((a, b) => b.length - a.length);

const DA_BLOCK = /\[da(\s+nocancel)?\]\s*([\s\S]*?)\s*\[\/da\]/gi;
const SEP_END = new RegExp(`(?:(?<=[\\s)])[xX]\\s*|\\s*(?:×|\\*|·|⋅|∙)\\s*)$`, 'u');
const SEP_START = new RegExp(`^(?:\\s*[xX](?=[\\s(])|\\s*(?:×|\\*|·|⋅|∙)\\s*)`, 'u');
const BARE_END = new RegExp(`([+-]?\\d${NOT_BARE}*)$`, 'u');
const BARE_START = new RegExp(`^([+-]?\\d${NOT_BARE}*)`, 'u');
const RESULT_START = new RegExp(`^(\\s*=\\s*)([+-]?\\d${NOT_BARE}*)`, 'u');
const NUMBER_HEAD = /^([+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?(?:\s*[×xX*]\s*10\s*\^\s*[+-]?\d+)?)\s*([\s\S]*)$/;

/**
 * Offset of the first occurrence of a single ASCII char at paren depth
 * zero, or null.
 *
 * @param {string} s
 * @param {string} needle single character
 * @returns {?number}
 */
const findTopLevel = (s, needle) => {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '(') {
            depth++;
        } else if (c === ')') {
            depth = Math.max(0, depth - 1);
        } else if (depth === 0 && c === needle) {
            return i;
        }
    }
    return null;
};

/**
 * If a multiplicative separator starts at offset i, its length, else 0.
 * ×, *, ·, ⋅, ∙ stand alone; an "x"/"X" counts only when flanked by
 * whitespace or a parenthesis on both sides (") x (", ")x(", " x(").
 *
 * @param {string} s
 * @param {number} i
 * @returns {number}
 */
const separatorLengthAt = (s, i) => {
    for (const sep of SEP_CHARS) {
        if (s.substr(i, sep.length) === sep) {
            return sep.length;
        }
    }
    if ((s[i] === 'x' || s[i] === 'X')
            && i > 0 && (/\s/.test(s[i - 1]) || s[i - 1] === ')')
            && i + 1 < s.length && (/\s/.test(s[i + 1]) || s[i + 1] === '(')) {
        return 1;
    }
    return 0;
};

/**
 * Split on the multiplicative separator at paren depth zero. Empty
 * pieces are dropped.
 *
 * @param {string} s
 * @returns {string[]}
 */
const splitTerms = (s) => {
    const terms = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '(') {
            depth++;
            continue;
        }
        if (c === ')') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth !== 0) {
            continue;
        }
        const sepLen = separatorLengthAt(s, i);
        if (sepLen > 0) {
            terms.push(s.slice(start, i).trim());
            i += sepLen - 1;
            start = i + 1;
        }
    }
    terms.push(s.slice(start).trim());
    return terms.filter((t) => t !== '');
};

/**
 * Whether the whole string is one balanced "( ... )" group.
 *
 * @param {string} s
 * @returns {boolean}
 */
const isWrapped = (s) => {
    if (s.length < 2 || s[0] !== '(' || s[s.length - 1] !== ')') {
        return false;
    }
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') {
            depth++;
        } else if (s[i] === ')') {
            depth--;
            if (depth === 0) {
                return i === s.length - 1;
            }
        }
    }
    return false;
};

/**
 * Split a spaceless run like "gH2" into [unit, label] via the known-unit
 * list, longest prefix first, or null if no known unit is a prefix.
 *
 * @param {string} run
 * @returns {?string[]}
 */
const splitKnownUnit = (run) => {
    for (const unit of KNOWN_UNITS) {
        if (run.startsWith(unit)) {
            return [unit, run.slice(unit.length).trim()];
        }
    }
    return null;
};

/**
 * Parse a "value? unit? label?" quantity slot, or null if it is empty.
 *
 * @param {string} slot
 * @returns {?{value: string, unit: string, label: string}}
 */
const parseQuantity = (slot) => {
    slot = slot.trim();
    if (slot === '') {
        return null;
    }

    let value = '';
    let rest = slot;
    const m = slot.match(NUMBER_HEAD);
    if (m) {
        value = m[1].trim();
        rest = m[2].trim();
    }

    let unit = '';
    let label = '';
    if (rest !== '') {
        const rm = rest.match(/^(\S+)\s+([\s\S]*)$/);
        if (rm) {
            unit = rm[1];
            label = rm[2].trim();
        } else {
            const split = splitKnownUnit(rest);
            if (split) {
                [unit, label] = split;
            } else {
                unit = rest;
            }
        }
    }

    if (value === '' && unit === '' && label === '') {
        return null;
    }
    return {value, unit, label};
};

/**
 * Recursively reduce a term to zero or more bare / factor items,
 * flattening pure grouping parentheses like "(a x (b/c))".
 *
 * @param {string} term
 * @param {object[]} out
 */
const flattenTerm = (term, out) => {
    let s = term.trim();
    while (isWrapped(s)) {
        s = s.slice(1, -1).trim();
    }
    if (s === '') {
        return;
    }

    const parts = splitTerms(s);
    if (parts.length > 1) {
        parts.forEach((part) => flattenTerm(part, out));
        return;
    }

    const slash = findTopLevel(s, '/');
    if (slash !== null) {
        out.push({type: 'factor', num: s.slice(0, slash).trim(), den: s.slice(slash + 1).trim()});
        return;
    }

    out.push({type: 'bare', str: s});
};

/**
 * Validate an expression string. Returns a light tree on success (used
 * only as a truthy "this is a real expression" signal), or null.
 *
 * @param {string} expr
 * @returns {?object}
 */
const parseExpression = (expr) => {
    expr = expr.replace(/\s+/gu, ' ').trim();
    if (expr === '') {
        return null;
    }

    let resultStr = null;
    const eqPos = findTopLevel(expr, '=');
    if (eqPos !== null) {
        resultStr = expr.slice(eqPos + 1);
        expr = expr.slice(0, eqPos);
    }

    const flat = [];
    splitTerms(expr.trim()).forEach((term) => flattenTerm(term, flat));
    if (flat.length < 2) {
        return null;
    }

    let given = null;
    const factors = [];
    for (const item of flat) {
        if (item.type === 'bare') {
            if (given !== null) {
                return null;
            }
            given = parseQuantity(item.str);
        } else {
            const num = parseQuantity(item.num);
            const den = parseQuantity(item.den);
            if (num === null || den === null) {
                return null;
            }
            factors.push({num, den});
        }
    }
    if (given === null || factors.length === 0) {
        return null;
    }

    const result = (resultStr !== null && resultStr.trim() !== '') ? parseQuantity(resultStr) : null;
    return {given, factors, result};
};

/**
 * All top-level (non-nested) "( ... )" groups as [open, close] pairs.
 *
 * @param {string} text
 * @returns {number[][]}
 */
const topLevelParenGroups = (text) => {
    const groups = [];
    let depth = 0;
    let open = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') {
            if (depth === 0) {
                open = i;
            }
            depth++;
        } else if (text[i] === ')' && depth > 0) {
            depth--;
            if (depth === 0) {
                groups.push([open, i]);
            }
        }
    }
    return groups;
};

/**
 * Offset of the "(" matching the final ")" of s.
 *
 * @param {string} s
 * @returns {?number}
 */
const matchOpenParen = (s) => {
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        if (s[i] === ')') {
            depth++;
        } else if (s[i] === '(') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return null;
};

/**
 * Offset of the ")" matching the leading "(" of s.
 *
 * @param {string} s
 * @returns {?number}
 */
const matchCloseParen = (s) => {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') {
            depth++;
        } else if (s[i] === ')') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return null;
};

/**
 * If the text before `start` ends with " SEP term", the offset where
 * that term begins, else null.
 *
 * @param {string} text
 * @param {number} start
 * @returns {?number}
 */
const matchTermLeft = (text, start) => {
    const head = text.slice(0, start);
    const sm = head.match(SEP_END);
    if (!sm) {
        return null;
    }
    const before = head.slice(0, head.length - sm[0].length).replace(/\s+$/u, '');
    if (before === '') {
        return null;
    }
    if (before[before.length - 1] === ')') {
        return matchOpenParen(before);
    }
    const bm = before.match(BARE_END);
    if (bm && bm[1].replace(/\s+$/u, '') !== '') {
        return before.length - bm[1].length;
    }
    return null;
};

/**
 * If the text at `end` starts with " SEP term", the offset just past
 * that term, else null.
 *
 * @param {string} text
 * @param {number} end
 * @returns {?number}
 */
const matchTermRight = (text, end) => {
    const tail = text.slice(end);
    const sm = tail.match(SEP_START);
    if (!sm) {
        return null;
    }
    // A bare "x" (no whitespace before it in the match) is only an
    // operator when it butts against the previous factor's ")", not when
    // it is the tail of a bare quantity like "6x".
    if ((sm[0][0] === 'x' || sm[0][0] === 'X')) {
        const prev = end > 0 ? text[end - 1] : '';
        if (prev !== ')' && !/\s/.test(prev)) {
            return null;
        }
    }
    const afterSep = tail.slice(sm[0].length);
    const lead = afterSep.length - afterSep.replace(/^\s+/u, '').length;
    const rest = afterSep.replace(/^\s+/u, '');
    if (rest === '') {
        return null;
    }
    if (rest[0] === '(') {
        const rel = matchCloseParen(rest);
        return rel === null ? null : end + sm[0].length + lead + rel + 1;
    }
    const bm = rest.match(BARE_START);
    if (bm) {
        const run = bm[1].replace(/\s+$/u, '');
        if (run === '') {
            return null;
        }
        return end + sm[0].length + lead + run.length;
    }
    return null;
};

/**
 * Grow a [open, close] paren span outward across " SEP term" sequences
 * on both sides, then an optional trailing "= quantity".
 *
 * @param {string} text
 * @param {number} open
 * @param {number} close
 * @returns {number[]} [start, endExclusive]
 */
const expandAround = (text, open, close) => {
    let start = open;
    let end = close + 1;

    for (let guard = 0; guard < 50; guard++) {
        const next = matchTermLeft(text, start);
        if (next === null || next >= start) {
            break;
        }
        start = next;
    }
    for (let guard = 0; guard < 50; guard++) {
        const next = matchTermRight(text, end);
        if (next === null || next <= end) {
            break;
        }
        end = next;
    }
    const rm = text.slice(end).match(RESULT_START);
    if (rm) {
        end += rm[1].length + rm[2].replace(/\s+$/u, '').length;
    }
    return [start, end];
};

/**
 * Whether [aStart, aEnd) overlaps any already accepted result range.
 *
 * @param {number} aStart
 * @param {number} aEnd
 * @param {object[]} results
 * @returns {boolean}
 */
const intersects = (aStart, aEnd, results) => results.some((r) => aStart < r.end && aEnd > r.start);

/**
 * Locate every dimensional-analysis expression in a plain-text string.
 *
 * @param {string} text the text-node contents to scan.
 * @returns {Array<{start: number, end: number}>} ordered, non-overlapping.
 */
export const detectExpressions = (text) => {
    if (!text) {
        return [];
    }

    const results = [];

    DA_BLOCK.lastIndex = 0;
    let block;
    while ((block = DA_BLOCK.exec(text)) !== null) {
        if (parseExpression(block[2]) !== null) {
            results.push({start: block.index, end: block.index + block[0].length});
        }
    }

    for (const [open, close] of topLevelParenGroups(text)) {
        if (intersects(open, close + 1, results)) {
            continue;
        }
        if (findTopLevel(text.slice(open + 1, close), '/') === null) {
            continue;
        }
        const [rawStart, rawEnd] = expandAround(text, open, close);
        const raw = text.slice(rawStart, rawEnd);
        const start = rawStart + (raw.length - raw.replace(/^\s+/u, '').length);
        const src = raw.trim();
        if (src === '' || intersects(start, start + src.length, results)) {
            continue;
        }
        if (parseExpression(src) === null) {
            continue;
        }
        results.push({start, end: start + src.length});
    }

    results.sort((a, b) => a.start - b.start);

    const final = [];
    let prevEnd = -1;
    for (const r of results) {
        if (r.start <= prevEnd) {
            continue;
        }
        final.push(r);
        prevEnd = r.end - 1;
    }
    return final;
};
