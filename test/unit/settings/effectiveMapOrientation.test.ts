import {describe, expect, it} from 'vitest';
import {effectiveMapOrientation, Nav5Orientation} from '../../../kln90b/settings/KLN90BUserSettings';

// #368: HDG up needs a heading input. Without one the map is drawn north up; the stored setting is the pilot's and is
// not changed (characterization of the maintainer's ruling)
describe('effectiveMapOrientation (characterization)', () => {
    it.each([
        [Nav5Orientation.NORTH_UP, false, Nav5Orientation.NORTH_UP],
        [Nav5Orientation.DTK_UP, false, Nav5Orientation.DTK_UP],
        [Nav5Orientation.TK_UP, false, Nav5Orientation.TK_UP],
        [Nav5Orientation.HDG_UP, false, Nav5Orientation.NORTH_UP],
        [Nav5Orientation.HDG_UP, true, Nav5Orientation.HDG_UP],
        [Nav5Orientation.TK_UP, true, Nav5Orientation.TK_UP],
    ])('maps %s with heading input %s to %s (characterization, #368)', (stored, headingInput, expected) => {
        expect(effectiveMapOrientation(stored, headingInput)).toBe(expected);
    });
});
