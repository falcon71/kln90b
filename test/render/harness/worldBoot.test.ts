import {describe, expect, it} from 'vitest';
import {standardRoute} from '../../harness/fixtures';
import {intersection} from '../../harness/navdata/builders';
import {fplIdents} from '../../harness/readers';
import {savedFlightplan} from '../../harness/storage';
import {bootOnDtWorld, bootOnStandardRoute} from '../../harness/worldBoot';

describe('bootOnStandardRoute (harness)', () => {
    it('boots with the standard route as FPL 0 and ABC active', async () => {
        const unit = await bootOnStandardRoute();

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('ABC');
    });

    it('adds the facilities given to those of the route, and merges the storage over the stored plan', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const xyz = intersection('XYZ', 47.6, 8.9);

        const unit = await bootOnStandardRoute({facilities: [xyz], storage: savedFlightplan(0, [kaaa, abc, xyz, kbbb])});

        // XYZ is in the plan only if the navdata has it; ABC is still active
        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'XYZ', 'KBBB']);
    });

    it('rejects when ABC does not become the active waypoint', async () => {
        const {kaaa} = standardRoute();

        // A plan whose only waypoint is KAAA has no ABC to activate
        await expect(bootOnStandardRoute({storage: savedFlightplan(0, [kaaa])})).rejects.toThrow(/not ABC/);
    });
});

describe('bootOnDtWorld (harness)', () => {
    it('stores the plan as FPL 0 and FPL 3 and flies north at 120 kt', async () => {
        const unit = await bootOnDtWorld();

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'DEF', 'KBBB']);
        expect(fplIdents(unit, 3)).toEqual(['KAAA', 'ABC', 'DEF', 'KBBB']);
        expect(unit.props.sensors.in.gps.groundspeed).toBeCloseTo(120, 0);
    });

    it('leaves FPL 3 empty with fpl3 false, and the aircraft standing with moving false', async () => {
        const unit = await bootOnDtWorld({fpl3: false, moving: false});

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'DEF', 'KBBB']);
        expect(fplIdents(unit, 3)).toEqual([]);
        expect(unit.props.sensors.in.gps.groundspeed).toBe(0);
    });
});
