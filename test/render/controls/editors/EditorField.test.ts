import {describe, expect, it} from 'vitest';
import {
    AlphabetEditorField,
    EastWestEditorField,
    MonthEditorField,
    NorthSouthEditorField,
    NumberEditorField,
    RemarkEditorField,
    RunwaySurfaceEditorField,
} from '../../../../kln90b/controls/editors/EditorField';

/** The entry a typed key selects, or null when the field refuses the key */
function typed(field: { keyboard(key: string): boolean, value: number | null, charset: string[] }, key: string): string | null {
    return field.keyboard(key) ? field.charset[field.value!] : null;
}

// The keyboard is the project's own feature (#13, #25, #109), so no manual page describes these keys
describe('EditorField keyboard (#109)', () => {
    it('selects the blank of a cell that has a blank instead of a 0 for a typed 0 (#109)', () => {
        expect(typed(NumberEditorField.createWithBlankMax(1), '0')).toBe(' ');
        expect(typed(NumberEditorField.createWithBlankMax(9), '0')).toBe(' ');
    });

    // These cells start with a blank and hold a 0 of their own: the 0 stays a 0
    it('keeps a typed 0 a 0 in an ident and a remark cell (#109)', () => {
        expect(typed(new AlphabetEditorField(), '0')).toBe('0');
        expect(typed(new RemarkEditorField(), '0')).toBe('0');
    });

    // The 0 takes the first choice only when that is a blank: no general "first entry" rule
    it('refuses a typed 0 in a cell that has neither a 0 nor a blank (#109)', () => {
        expect(typed(new NorthSouthEditorField(), '0')).toBeNull();
        expect(typed(new EastWestEditorField(), '0')).toBeNull();
        expect(typed(new MonthEditorField(), '0')).toBeNull();
        expect(typed(new RunwaySurfaceEditorField(), '0')).toBeNull();
        expect(typed(NumberEditorField.createWithMinMax(1, 31), '0')).toBeNull();
    });

    it('keeps a typed 0 a 0 in a digit cell (#109)', () => {
        expect(typed(NumberEditorField.createWithMinMax(0, 1), '0')).toBe('0');
    });

    it('selects HRD for H and SFT for S in the runway surface cell, and refuses other letters (#109)', () => {
        expect(typed(new RunwaySurfaceEditorField(), 'H')).toBe('HRD');
        expect(typed(new RunwaySurfaceEditorField(), 'S')).toBe('SFT');
        expect(typed(new RunwaySurfaceEditorField(), 'D')).toBeNull();
    });

    // #109 leaves the month out: its first letters are ambiguous (J, M, A)
    it('characterization: still refuses a letter in the month cell (#109)', () => {
        expect(typed(new MonthEditorField(), 'J')).toBeNull();
    });
});
