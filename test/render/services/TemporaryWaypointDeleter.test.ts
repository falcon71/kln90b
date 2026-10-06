import {Facility, FacilityType, FixTypeFlags, ICAO, LegTurnDirection} from '@microsoft/msfs-sdk';
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {savedFlightplan, savedUserWaypoints} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';
import {pointFrom} from '../../harness/flight/geo';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

/** The user waypoints in the facility repository, as "ident region", sorted */
function userWaypoints(unit: HeadlessUnit): string[] {
    const found: string[] = [];
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => found.push(`${f.icaoStruct.ident} ${f.icaoStruct.region}`), [FacilityType.USR]);
    return found.sort();
}

/**
 * A temporary user waypoint (region XY) as an earlier session saved it, in the V2 format (docs/architecture.md, Core 7):
 * type U, region XY, 8 blanks, the ident padded to 8, then +DDMM.mm and +DDDMM.mm. Laid out by hand, like
 * savedUserWaypoints, which writes region XX only.
 */
const savedTemporary = (ident: string, latMin: string, lonMin: string) => `UXY        ${ident.padEnd(8, ' ')}+47${latMin}+008${lonMin}`;
/** The ICAO of that waypoint, for savedFlightplan, which reads only the ICAO */
const temporaryIcao = (ident: string) => ({icaoStruct: ICAO.value('U', 'XY', '', ident)}) as unknown as Facility;

// The unit treats every temporary waypoint (region XY: reference, center, EFB lat/lon and DME arc entry waypoints) alike.
// The spec tests cite their pages; the tests labeled characterization pin what the code does beyond the manual.
describe('TemporaryWaypointDeleter', () => {
    // 5-22 and 5-26: reference and center waypoints that no flight plan holds any more are deleted from the user waypoint
    // list when the unit is turned off. The waypoint stays as long as the unit is on, and is gone once it is turned off
    it('deletes a temporary waypoint that no flight plan holds when the unit is turned off', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}]}));
        await vi.advanceTimersByTimeAsync(2000);
        expect(userWaypoints(unit)).toEqual(['CUST XY']); // Precondition: the lat/lon leg is a temporary waypoint
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb})); // FPL 0 no longer holds CUST
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'KBBB']);
        expect(userWaypoints(unit)).toEqual(['CUST XY']); // Not before the unit is turned off

        await unit.panel.powerOff();

        expect(userWaypoints(unit)).toEqual([]);
    });

    // 5-22 and 5-26: a reference waypoint that is part of a flight plan stays, and OTH 3 lists it with the number of that
    // plan (5-20). FPL 0 is plan number 0, which a truthiness check of the plan number would count as "not held"
    it('keeps a temporary waypoint that FPL 0 holds, over a power cycle', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}]}));
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'CUST', 'KBBB']); // Precondition

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(userWaypoints(unit)).toEqual(['CUST XY']);
        await unit.panel.selectPage('L', 'OTH 3');
        expect(Screen.read().rows('L').slice(0, 2)).toEqual([' USER WPTS ', 'CUST  S   0']);
    });

    // 5-22 and 5-26: the same for a numbered plan, which OTH 3 lists by its number (5-20). Plan 3, so that a check of FPL 0
    // alone cannot keep it
    it('keeps a temporary waypoint that a numbered flight plan holds, over a power cycle', async () => {
        const unit = await bootUnit({
            facilities: [kaaa],
            storage: {userDataFormat: 2, wpt0: savedTemporary('TMPB', '07.00', '07.00'), ...savedFlightplan(3, [kaaa, temporaryIcao('TMPB')])},
        });
        await settle(unit);
        expect(unit.props.memory.fplPage.flightplans[3].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'TMPB']); // Precondition

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(userWaypoints(unit)).toEqual(['TMPB XY']);
        await unit.panel.selectPage('L', 'OTH 3');
        expect(Screen.read().rows('L').slice(0, 2)).toEqual([' USER WPTS ', 'TMPB  S   3']);
    });

    // 5-20: a user waypoint (region XX) is deleted only by the pilot, on OTH 3; the purge of 5-22 is for reference and
    // center waypoints
    it('keeps a user waypoint that no flight plan holds, over a power cycle', async () => {
        const unit = await bootUnit({facilities: [kaaa], storage: savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}])});
        await settle(unit);
        expect(userWaypoints(unit)).toEqual(['FARM XX']); // Precondition: restored

        await unit.panel.powerCycle();

        expect(userWaypoints(unit)).toEqual(['FARM XX']);
    });

    // The purge looks at the flight plans only. A temporary waypoint that is the direct-to target of the active
    // waypoint, but that no plan holds any more (the EFB replaced FPL 0), is deleted at the power cycle all the same
    it('deletes a temporary waypoint that is the active direct-to target once no plan holds it (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}]}));
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // CUST
        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb})); // FPL 0 no longer holds CUST
        await vi.advanceTimersByTimeAsync(2000);
        const active = unit.props.memory.navPage.activeWaypoint;
        expect(active.getActiveWpt()!.icaoStruct.ident).toBe('CUST'); // Precondition: CUST is still the direct-to target
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'KBBB']);
        expect(userWaypoints(unit)).toEqual(['CUST XY']);

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(userWaypoints(unit)).toEqual([]);
    });

    // The sim can be left with the unit on, which is no power-off, so the unit also purges at power-on: a temporary
    // waypoint saved by the last session that no saved flight plan holds is gone after the boot. TMPB, held by FPL 3, is
    // the control
    it('deletes a saved temporary waypoint that no saved flight plan holds at the boot (characterization)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa],
            storage: {
                userDataFormat: 2,
                wpt0: savedTemporary('TMPA', '06.00', '06.00'),
                wpt1: savedTemporary('TMPB', '07.00', '07.00'),
                ...savedFlightplan(3, [kaaa, temporaryIcao('TMPB')]),
            },
        });
        await settle(unit);

        expect(userWaypoints(unit)).toEqual(['TMPB XY']);
    });

    // The entry waypoint of a DME arc (SidStar) is a temporary waypoint in the repository while the approach is in FPL 0.
    // A power cycle of more than 5 minutes removes the procedures from FPL 0 (6-5, VolatileMemory.reset) before the purge
    // runs, so the entry is gone after it. The arc: right, 10 NM around ABC from the 180 to the 270 radial; the unit starts on the
    // 190 radial, so the entry is D190J
    it('deletes the entry waypoint of a DME arc at a power cycle of more than 5 minutes that removes the approach (characterization)', async () => {
        const abc = vor('ABC', 47.3, 8.3);
        const at = (radial: number, nm: number) => pointFrom(abc, radial, nm);
        const arcbg = intersection('ARCBG', at(180, 10).lat, at(180, 10).lon);
        const arcen = intersection('ARCEN', at(270, 10).lat, at(270, 10).lon);
        const mapaa = intersection('MAPAA', at(270, 1).lat, at(270, 1).lon);
        const kprc = withProcedures(airport('KPRC', at(270, 1).lat, at(270, 1).lon), {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG', legs: [
                        Leg.IF(arcbg, FixTypeFlags.IAF),
                        Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 180, toRadial: 270, turn: LegTurnDirection.Right}),
                    ],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({facilities: [kprc, abc, arcbg, arcen, mapaa], position: at(190, 10), storage: savedFlightplan(0, [kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(userWaypoints(unit)).toEqual(['D190J XY']); // Precondition: the entry waypoint exists

        await unit.panel.powerCycle({offSeconds: 6 * 60});
        await unit.panel.approveSelfTest();

        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KPRC']);
        expect(userWaypoints(unit)).toEqual([]);
    });
});
