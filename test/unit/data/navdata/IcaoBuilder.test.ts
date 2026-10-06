import {describe, expect, it} from 'vitest';
import {FacilityType, ICAO} from '@microsoft/msfs-sdk';
import {
    buildIcao,
    buildIcaoStruct,
    buildIcaoStructIdentOnly,
    TEMPORARY_WAYPOINT,
    USER_WAYPOINT,
} from '../../../../kln90b/data/navdata/IcaoBuilder';
import {IcaoFixedLength} from '../../../../kln90b/data/navdata/IcaoFixedLength';
import {vor} from '../../../harness/navdata/builders';

// Contract. Source: CLAUDE.md "Navdata" (ICAO region XX = user, XY = temporary) and the persisted V1/V2 waypoint
// strings (docs/architecture.md Core 7), which carry the region; a stored user waypoint keeps it across versions.
describe('user and temporary regions', () => {
    it('uses XX for user waypoints and XY for temporary ones', () => {
        expect(USER_WAYPOINT).toBe('XX');
        expect(TEMPORARY_WAYPOINT).toBe('XY');
    });
});

// Contract. Source: the V1 persisted waypoint string (docs/architecture.md Core 7): type, region, four airport cells,
// the ident padded to five.
describe('buildIcao (V1 string)', () => {
    it('lays out type, region, four blank airport cells and the ident padded to five', () => {
        expect(buildIcao('V', 'XX', 'ABC')).toBe('VXX    ABC  ');
        expect(buildIcao('U', 'XY', 'CUSTA')).toBe('UXY    CUSTA');
    });

    it('is read back by the SDK as the type it was built with', () => {
        expect(ICAO.getFacilityType(buildIcao('N', 'XX', 'AB'))).toBe(FacilityType.NDB);
    });
});

// Contract. Source: CLAUDE.md "Navdata": user waypoints of any type carry the region XX or XY, which is how the
// repository and the loader tell them from the sim database.
describe('buildIcaoStruct', () => {
    it('fills type, region and ident and leaves the airport empty', () => {
        const v = buildIcaoStruct('U', 'XY', 'CUST');
        expect([v.type, v.region, v.airport, v.ident]).toEqual(['U', 'XY', '', 'CUST']);
    });

    it('builds an ident-only value for searches (characterization)', () => {
        const v = buildIcaoStructIdentOnly('KAAA ');
        expect([v.type, v.region, v.airport, v.ident]).toEqual(['', '', '', 'KAAA ']);
    });
});

describe('IcaoFixedLength.getIdentFromFacility', () => {
    it('pads the ident to five cells, and gives five blanks for no facility (characterization)', () => {
        // NAV 1, NAV 3, FPL rows and OTH 3 show the ident in a five-cell field
        expect(IcaoFixedLength.getIdentFromFacility(vor('AB', 47, 8))).toBe('AB   ');
        expect(IcaoFixedLength.getIdentFromFacility(vor('ABCDE', 47, 8))).toBe('ABCDE');
        expect(IcaoFixedLength.getIdentFromFacility(null)).toBe('     ');
    });
});
