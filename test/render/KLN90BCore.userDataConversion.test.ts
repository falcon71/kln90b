import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../harness/boot';
import {airport, vor} from '../harness/navdata/builders';

// Saved settings are stored per aircraft model and profile; the harness boots as ATC MODEL "KLN TEST"
const K = 'persistent-setting.KLN TEST.profile_1.';

/** Boots with a file written by version 1: no userDataFormat, FPL 1 in fpl0 and 12 character ICAOs */
function bootVersion1File(): Promise<HeadlessUnit> {
    return bootUnit({
        facilities: [airport('KAAA', 47, 8), vor('ABC', 47.2, 8, {region: 'K1'})],
        storage: {wpt0: 'WXX    USRA +4730.00-00815.50', fpl0: 'A      KAAA VK1    ABC  '},
    });
}

function stored(unit: HeadlessUnit, name: string): unknown {
    return JSON.parse(unit.env.storage.data.get(K + name)!);
}

describe('user data conversion at boot (#47)', () => {
    it('marks the file as version 2', async () => {
        const unit = await bootVersion1File();
        expect(stored(unit, 'userDataFormat')).toBe(2);
    });

    it('rewrites the user waypoints in the version 2 format', async () => {
        const unit = await bootVersion1File();
        expect(stored(unit, 'wpt0')).toBe('WXX        USRA    +4730.00-00815.50');
    });

    it('moves FPL 1 from fpl0 to fpl1 in the version 2 format', async () => {
        const unit = await bootVersion1File();
        expect(stored(unit, 'fpl1')).toBe('A          KAAA    VK1        ABC     ');
    });

    it('empties fpl0, because FPL 0 was not saved in version 1', async () => {
        const unit = await bootVersion1File();
        expect(stored(unit, 'fpl0')).toBe('');
    });
});
