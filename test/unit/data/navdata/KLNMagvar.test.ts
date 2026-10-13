import {afterEach, describe, expect, it} from 'vitest';
import {KLNMagvar} from '../../../../kln90b/data/navdata/KLNMagvar';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';
import {simEnv} from '../../../harness/sim/install';

// getReferenceMagvar (#280): the variation that turns a true radial from a reference into the magnetic one, east
// positive. The sim stores a VOR's variation with west positive (builders.ts, Nav2Page), so a VOR stored as -10 is 10 E.
// The model of the world here is 15 E north of 47.4 N and 4 E south of it.
describe('KLNMagvar.getReferenceMagvar (characterization)', () => {
    afterEach(() => {
        simEnv().magvar = () => 0;
    });

    const north = 47.5;
    const south = 46.0;
    const useModel = () => {
        simEnv().magvar = (lat: number) => lat > 47.4 ? 15 : 4;
    };

    it('characterization: uses the own variation of a database VOR, negated (#280)', () => {
        useModel();

        expect(KLNMagvar.getReferenceMagvar(vor('ABC', south, 10.5, {magneticVariation: -10}))).toBe(10);
    });

    it('characterization: uses the own variation of a user VOR, not the model at its position (#280)', () => {
        useModel();

        expect(KLNMagvar.getReferenceMagvar(vor('USV', north, 10.5, {region: 'XX', magneticVariation: -7}))).toBe(7);
    });

    it.each([
        ['an NDB in the north', ndb('XYN', north, 10.5), 15],
        ['an NDB in the south', ndb('XYS', south, 10.5), 4],
        ['an airport in the north', airport('KNNN', north, 10.5), 15],
        ['an intersection in the south', intersection('XYZAB', south, 10.5), 4],
    ])('characterization: takes the model at the position of %s (#280)', (_name, facility, expected) => {
        useModel();

        expect(KLNMagvar.getReferenceMagvar(facility)).toBe(expected);
    });
});
