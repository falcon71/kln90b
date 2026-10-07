import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {approachWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, star, withProcedures} from '../../../harness/navdata/procedures';
import {savedFlightplan} from '../../../harness/storage';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';

const rows = (side: 'L' | 'R') => Screen.read().half(side).split('\n').map(r => r.trimEnd());

// Invented fixes, as in test/render/harness/procedures.test.ts
const iafaa = intersection('IAFAA', 47.3, 7.7);
const ifaaa = intersection('IFAAA', 47.2, 7.8);
const fafaa = intersection('FAFAA', 47.1, 7.9);
const mapaa = intersection('MAPAA', 47.0, 8.0);
const mahaa = intersection('MAHAA', 47.0, 8.3);
const depaa = intersection('DEPAA', 47.0, 8.2);
const enraa = intersection('ENRAA', 47.0, 8.4);
const abc = vor('ABC', 47.5, 8.5);

describe('APT 7 page after a waypoint confirmation page (80631c8)', () => {
    // 3-14: the right side returns to the page that was shown before the waypoint confirmation page. 3-49: the text of an
    // empty database appears only for an airport without procedures; KPRC has a SID.
    it('shows the SID list again, not NO SID/STAR, once the confirmation page is gone', async () => {
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa, FixTypeFlags.IF)]}],
                final: [Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
                missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90, LegTurnDirection.Right, FixTypeFlags.MAHP)],
            })],
            departures: [sid('DEP1', {runways: [{runway: '27', legs: [Leg.CA(270), Leg.DF(depaa)]}], common: [Leg.TF(enraa)]})],
        });
        const unit = await bootUnit({
            facilities: [kprc, iafaa, ifaaa, fafaa, mapaa, mahaa, depaa, enraa, abc],
            position: {lat: 47, lon: 8},
            storage: savedFlightplan(0, [kprc]),
        });
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 7');
        expect(rows('R').slice(0, 3)).toEqual([' KPRC', 'SELECT SID', ' 1 DEP1']);

        await unit.panel.appendToFpl0(['ABC']); // the confirmation page is pushed on the right side and popped by the second ENT
        await vi.advanceTimersByTimeAsync(1000);

        // The confirmation happened: ABC is in FPL 0
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KPRC', 'ABC']);
        expect(Screen.read().status().right).toBe('APT 7');
        expect(rows('R').slice(0, 3)).toEqual([' KPRC', 'SELECT SID', ' 1 DEP1']);
        expect(Screen.read().text()).not.toContain('NO SID/STAR');
    });
});

const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => [l.wpt.icaoStruct.ident, l.type]);

describe('APT 7 putting a procedure into FPL 0', () => {
    // 6-23: the STAR comes before the approach, so a STAR chosen after the approach goes in front of the approach waypoints
    it('puts a STAR in front of an approach that FPL 0 already holds (6-23)', async () => {
        const w = approachWorld();
        const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
        const straa = intersection('STRAA', east(30).lat, east(30).lon);
        const strab = intersection('STRAB', east(12).lat, east(12).lon);
        const kprc = withProcedures(w.kprc, {approaches: [...w.kprc.approaches], arrivals: [star('ARR1', {common: [Leg.IF(straa), Leg.TF(strab)]})]});
        const unit = await bootUnit({
            facilities: [kprc, w.enraa, w.iafaa, w.ifaaa, w.fafaa, w.sdfaa, w.mapaa, straa, strab], position: w.north(40),
            storage: savedFlightplan(0, [w.enraa, kprc]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        // Precondition: the approach is in FPL 0
        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP],
            ['SDFAA', KLNLegType.APP], ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);

        await unit.panel.loadProcedure('APT 7');

        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['STRAA', KLNLegType.STAR], ['STRAB', KLNLegType.STAR],
            ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP], ['SDFAA', KLNLegType.APP],
            ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);
    });

    // 6-22: the departure airport comes first, followed by the SID. When FPL 0 does not hold it, the unit asks to add it
    // (PRESS ENT TO ADD KPRC AND SID TO FPL 0) and puts it at the start, not at the end
    it('puts the airport of a SID at the start of FPL 0 when it is not in the plan (6-22)', async () => {
        const w = approachWorld();
        const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
        const sidaa = intersection('SIDAA', east(8).lat, east(8).lon);
        const sidab = intersection('SIDAB', east(20).lat, east(20).lon);
        const kuuu = airport('KUUU', w.north(90).lat, w.north(90).lon);
        const kprc = withProcedures(w.kprc, {
            approaches: [],
            departures: [sid('DEP1', {runways: [{runway: '09', legs: [Leg.CA(90), Leg.DF(sidaa)]}], common: [Leg.TF(sidab)]})],
        });
        const unit = await bootUnit({
            facilities: [kprc, w.enraa, kuuu, sidaa, sidab], position: w.north(10),
            storage: savedFlightplan(0, [w.enraa, kuuu]),
        });
        await settle(unit);
        expect(fpl0Legs(unit)).toEqual([['ENRAA', KLNLegType.USER], ['KUUU', KLNLegType.USER]]); // Precondition: KPRC is not in the plan

        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        expect(rows('R').slice(0, 4)).toEqual(['DEP1-SID', 'PRESS ENT', 'TO ADD KPRC', 'AND SID TO']); // the question of the unit
        await unit.panel.cursor('R'); // loadProcedure switched the cursor off, which the page switches on by itself
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['KPRC', KLNLegType.USER], ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID],
            ['ENRAA', KLNLegType.USER], ['KUUU', KLNLegType.USER],
        ]);
    });
});
