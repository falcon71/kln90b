import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// 3-47: APT 5 holds three lines of 11 characters of remarks per airport, OTH 4 lists the airports that have remarks.
// The stored slot (rmk0: ident of 4 characters plus the three lines) is persisted user data, docs/architecture.md Core 7.
const KAAA = () => airport('KAAA', 47, 8);

describe('APT 5 remarks', () => {
    it('stores a remark line entered on APT 5 under rmk0', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 5');
        await unit.panel.cursor('R');
        for (let i = 0; i < 10 && unit.panel.focused('R').row !== 2; i++) {
            await unit.panel.outer('R', 1);
        }
        expect(unit.panel.focused('R').row).toBe(2);

        await unit.panel.type('R', 'FUEL');
        await unit.panel.ent();
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(storedSetting(unit, 'rmk0')).toBe('KAAAFUEL       ' + ' '.repeat(22));
        expect(Screen.read().rows('R')[2]).toBe('FUEL       ');
    });

    it('shows the remarks of the airport in a stored slot', async () => {
        const unit = await bootUnit({
            facilities: [KAAA()], position: {lat: 47, lon: 8},
            storage: {rmk0: 'KAAAFUEL       CTAF       X          '},
        });

        await unit.panel.selectPage('R', 'APT 5');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R').slice(2, 5)).toEqual(['FUEL       ', 'CTAF       ', 'X          ']);
    });

    it('lists the airport of a stored slot on OTH 4', async () => {
        const unit = await bootUnit({
            facilities: [KAAA()], position: {lat: 47, lon: 8},
            storage: {rmk0: 'KAAAFUEL       CTAF       X          '},
        });

        await unit.panel.selectPage('L', 'OTH 4');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(0, 2)).toEqual(['APTS W/RMKS', 'KAAA       ']);
    });
});
