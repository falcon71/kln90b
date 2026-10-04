import {describe, expect, it} from 'vitest';
import {BaroFieldsetFactory} from '../../../../kln90b/controls/selects/BaroFieldset';
import {SelectField} from '../../../../kln90b/controls/selects/SelectField';
import {BARO_UNIT_HPA, BARO_UNIT_INHG, KLN90BUserSettings} from '../../../../kln90b/settings/KLN90BUserSettings';

/** The fieldset only asks the settings for the barometer unit */
function settingsWithUnit(unit: boolean): KLN90BUserSettings {
    return {getSetting: () => ({get: () => unit})} as unknown as KLN90BUserSettings;
}

/** The three digit fields of a barometer fieldset, hundreds first */
function digits(fieldset: object): SelectField[] {
    const children = (fieldset as { children: { get(name: string): SelectField } }).children;
    return [children.get('baro100'), children.get('baro10'), children.get('baro1')];
}

describe('barometer fieldset', () => {
    it('reports one change when the ones digit changes, in millibars', () => {
        const changes: number[] = [];
        const fieldset = BaroFieldsetFactory.createBaroFieldSet(29.92, settingsWithUnit(BARO_UNIT_HPA), baro => changes.push(baro));

        digits(fieldset)[2].innerRight(); // 1013 hPa becomes 1014 hPa

        expect(changes).toHaveLength(1);
        expect(changes[0]).toBeCloseTo(29.9434, 3);
    });

    it('reports one change when the tens digit changes, in inches', () => {
        const changes: number[] = [];
        const fieldset = BaroFieldsetFactory.createBaroFieldSet(29.92, settingsWithUnit(BARO_UNIT_INHG), baro => changes.push(baro));

        digits(fieldset)[1].innerRight(); // 29.92 becomes 29.02

        expect(changes).toHaveLength(1);
    });

    // BaroFieldset.tsx, HpaBaroFieldset.saveBaro10 calls the callback twice
    it.fails('reports one change when the tens digit changes, in millibars (#113)', () => {
        const changes: number[] = [];
        const fieldset = BaroFieldsetFactory.createBaroFieldSet(29.92, settingsWithUnit(BARO_UNIT_HPA), baro => changes.push(baro));

        digits(fieldset)[1].innerRight(); // 1013 hPa becomes 1023 hPa

        expect(changes).toHaveLength(1);
    });
});
