import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, star, withProcedures} from '../../../harness/navdata/procedures';
import {savedFlightplan} from '../../../harness/storage';
import {courseDeg, pointFrom} from '../../../harness/flight/geo';
import {KLNFixType} from '../../../../kln90b/data/flightplan/Flightplan';

const fpl0 = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs();
const idents = (unit: HeadlessUnit) => fpl0(unit).map(l => l.wpt.icaoStruct.ident);
const activeWaypoint = (unit: HeadlessUnit) => unit.props.memory.navPage.activeWaypoint;

// 3364def: when FROM and TO are the same fix the path of the leg has no center (NaN) and the guard in NavCalculator.tick
// sequences on. The Pilot's Guide has no page for sequencing through a repeated fix; the KLN 89 trainer does it (as in
// test/flight/flights/duplicateWaypoint.test.ts for #19). #23 is the same situation made by loading a STAR.
describe('a STAR whose first fix is the last enroute waypoint (#23, 3364def)', () => {
    /** KPT 20 NM north of KDST, ENRAA 30 NM north of KPT, STARB 8 NM from KPT on 135; the STAR KPT4H starts at KPT */
    async function loadStarFromKpt() {
        const kdst = airport('KDST', 47.0, 8.0);
        const kptPos = pointFrom(kdst, 0, 20);
        const kpt = vor('KPT', kptPos.lat, kptPos.lon);
        const enrPos = pointFrom(kpt, 0, 30);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const stbPos = pointFrom(kpt, 135, 8);
        const starb = intersection('STARB', stbPos.lat, stbPos.lon);
        const apt = withProcedures(kdst, {arrivals: [star('KPT4H', {common: [Leg.IF(kpt), Leg.TF(starb)]})]});
        const unit = await bootUnit({
            facilities: [apt, kpt, enraa, starb], position: pointFrom(kpt, 0, 3),
            storage: savedFlightplan(0, [enraa, kpt, apt]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 7');
        return {unit, kpt, starb};
    }

    // 6-5 and B-3: loading the STAR leaves the same fix twice in the plan and the unit says so on the MSG page
    it('loads the repeated fix twice and reports it on the MSG page (#23)', async () => {
        const {unit} = await loadStarFromKpt();

        expect(idents(unit)).toEqual(['ENRAA', 'KPT', 'KPT', 'STARB', 'KDST']);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(1);
        const messages = unit.props.messageHandler.getMessages().map(m => m.message);
        expect(messages).toContainEqual(['REDUNDANT WPTS IN FPL', 'EDIT ENROUTE WPTS', 'AS NECESSARY']);
    });

    // The KLN 89 trainer and 3364def: the zero-length leg KPT to KPT is sequenced through without an error
    it('sequences through the repeated fix to the next fix of the STAR without an error (#23)', async () => {
        const {unit, kpt, starb} = await loadStarFromKpt();
        expect(idents(unit)).toEqual(['ENRAA', 'KPT', 'KPT', 'STARB', 'KDST']); // Precondition
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(1);

        await moveAircraft(unit, pointFrom(kpt, 180, 0.3), {groundspeedKt: 120});
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(3);
        expect(activeWaypoint(unit).getActiveWpt()!.icaoStruct.ident).toBe('STARB');
        expect(Math.abs(unit.props.memory.navPage.desiredTrack! - courseDeg(kpt, starb))).toBeLessThan(0.5);
    });
});

// 6-10: the example approach has a waypoint that is the IAF and the FAF at once; the unit lists it twice, once as the
// IAF and once as the FAF, and sequences through both to the MAP. The same guard as above (3364def) carries it.
describe('an approach whose IAF and FAF are the same fix (6-10)', () => {
    it('sequences through the IAF and FAF copies to the MAP without an error (6-10)', async () => {
        const kprc = airport('KPRC', 47.0, 8.0);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const txoPos = pointFrom(kprc, 0, 5);
        const txo = intersection('TXOAA', txoPos.lat, txoPos.lon);
        const enrPos = pointFrom(txo, 0, 30);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_VOR, runway: '18',
                transitions: [{name: 'TXOAA', legs: [Leg.IF(txo, FixTypeFlags.IAF)]}],
                final: [Leg.IF(txo, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, txo, mapaa], position: pointFrom(txo, 0, 1.6), storage: savedFlightplan(0, [enraa, apt]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(idents(unit)).toEqual(['ENRAA', 'TXOAA', 'TXOAA', 'MAPAA', 'KPRC']); // Preconditions
        expect(fpl0(unit)[1].fixType).toBe(KLNFixType.IAF);
        expect(fpl0(unit)[2].fixType).toBe(KLNFixType.FAF);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(1);

        await moveAircraft(unit, pointFrom(txo, 180, 0.3), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(3);
        expect(activeWaypoint(unit).getActiveWpt()!.icaoStruct.ident).toBe('MAPAA');
    });
});
