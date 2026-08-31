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
 * Unit tests for the tiny_dimanalysis expression detector. Mirrors the
 * PHP filter_dimanalysis\local\parser_test cases so the editor highlight
 * and the display-time render agree on what is an expression.
 *
 * @module      tiny_dimanalysis/tests/jest/detector_test
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {detectExpressions} from '../../amd/src/detector';

/**
 * The literal substrings the detector claims in `text`.
 *
 * @param {string} text
 * @returns {string[]}
 */
const hits = (text) => detectExpressions(text).map((h) => text.slice(h.start, h.end));

describe('detectExpressions', () => {
    it('finds a three-factor chain inside prose', () => {
        const text = 'At STP: 5 L x (1 mol / 22.4 L) x (46 g / 1 mol) of ethanol.';
        expect(hits(text)).toEqual(['5 L x (1 mol / 22.4 L) x (46 g / 1 mol)']);
    });

    it('finds a nested, fully grouped chain', () => {
        const text = '(2.4 g H2 x (1 mol / 1.008 g)) x (6.02E23 molecules / 1 mol)';
        expect(hits(text)).toEqual([text]);
    });

    it('finds an explicit [da] block including its markers', () => {
        const text = 'ans: [da] 2 mol x (58.44 g / 1 mol) = 116.9 g [/da] ok';
        expect(hits(text)).toEqual(['[da] 2 mol x (58.44 g / 1 mol) = 116.9 g [/da]']);
    });

    it('accepts a glued ")x(" between factors', () => {
        const text = 'time: 1200 s x (1 min / 60 s)x(1 hr / 60 min) elapsed';
        expect(hits(text)).toEqual(['1200 s x (1 min / 60 s)x(1 hr / 60 min)']);
    });

    it('does not run into leading sentence text', () => {
        const text = 'Given this: 5 L x (1 mol / 22.4 L)';
        expect(hits(text)).toEqual(['5 L x (1 mol / 22.4 L)']);
    });

    it('ignores plain fractions and prose', () => {
        expect(detectExpressions('Mix a 3/4 to 1/2 ratio (see p. 3).')).toEqual([]);
        expect(detectExpressions('nothing to see here')).toEqual([]);
    });

    it('ignores a lone parenthesised fraction with no given quantity', () => {
        expect(detectExpressions('the ratio (1 mol / 22.4 L) at STP')).toEqual([]);
    });

    it('ignores a chain with no conversion factor', () => {
        expect(detectExpressions('5 L x 3 mol x 2 g')).toEqual([]);
    });

    it('handles empty and whitespace input', () => {
        expect(detectExpressions('')).toEqual([]);
        expect(detectExpressions('   ')).toEqual([]);
    });

    it('returns ordered, non-overlapping ranges for two expressions', () => {
        const text = 'A 5 L x (1 mol / 22.4 L) and B 2 mol x (18 g / 1 mol) done';
        const found = detectExpressions(text);
        expect(found).toHaveLength(2);
        expect(found[0].end).toBeLessThanOrEqual(found[1].start);
        expect(hits(text)).toEqual(['5 L x (1 mol / 22.4 L)', '2 mol x (18 g / 1 mol)']);
    });
});
