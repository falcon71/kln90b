import {describe, expect, it} from 'vitest';
import {Facility, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../harness/boot';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {savedFlightplan, savedUserWaypoints} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';

// The world: FPL 0 is KAAA, then the waypoint under test half a degree north-east of it, then KBBB. The aircraft stands
// at KAAA, so the leg to the waypoint under test is the closest and that waypoint is active after the settle
const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.0, 9.5);
const LAT = 47.5;
const LON = 8.9;

/** A user supplemental waypoint FARM as savedUserWaypoints stores it, as the ICAO that savedFlightplan reads */
const farmIcao = {icaoStruct: ICAO.value('U', 'XX', '', 'FARM')} as unknown as Facility;

interface Case {
    type: string;
    ident: string;
    page: string;
    facilities: Facility[];
    legs: Facility[];
    storage?: Record<string, unknown>;
}

// Each case also has a decoy of the same type whose ident sorts first, far off the route: a waypoint page that is not
// told which waypoint to show opens on the first one of its scan list, the decoy
const cases: Case[] = [
    {
        type: 'a VOR', ident: 'ABC', page: 'VOR',
        facilities: [vor('ABC', LAT, LON), vor('AAV', 46.0, 7.0)], legs: [vor('ABC', LAT, LON)],
    },
    {
        type: 'an NDB', ident: 'ABN', page: 'NDB',
        facilities: [ndb('ABN', LAT, LON), ndb('AAN', 46.0, 7.0)], legs: [ndb('ABN', LAT, LON)],
    },
    {
        type: 'an intersection', ident: 'ABINT', page: 'INT',
        facilities: [intersection('ABINT', LAT, LON), intersection('AAINT', 46.0, 7.0)],
        legs: [intersection('ABINT', LAT, LON)],
    },
    {
        type: 'a user supplemental waypoint', ident: 'FARM', page: 'SUP', facilities: [], legs: [farmIcao],
        storage: savedUserWaypoints([
            {kind: 'sup', ident: 'FARM', lat: LAT, lon: LON},
            {kind: 'sup', ident: 'AAUSR', lat: 46.0, lon: 7.0},
        ]),
    },
];

// 3-8, figure 3-26 (and the pre-departure walk-through of 3-60): after the power-on the left side shows NAV 2 and the
// right side the waypoint page of the waypoint that was active when the unit was turned off. The airport case (APT 4)
// is held at the boot in Apt4Page.test.ts; these hold the other waypoint types, over a power cycle in the same session
describe('the pages after the power-on (3-8)', () => {
    it.each(cases)('shows the page of $type that was active at the power-off (3-8)', async c => {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb, ...c.facilities], position: {lat: kaaa.lat, lon: kaaa.lon},
            storage: {...c.storage, ...savedFlightplan(0, [kaaa, ...c.legs, kbbb])},
        });
        await settle(unit);
        // Precondition: the waypoint under test is the active one
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe(c.ident);

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        const screen = Screen.read();
        expect(screen.status().left).toBe('NAV 2');
        expect(screen.status().right).toBe(c.page);
        // The ident follows the active waypoint arrow in the first cell of the top row
        expect(screen.rows('R')[0].slice(1).split(' ')[0]).toBe(c.ident);
    });
});
