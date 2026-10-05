import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, withProcedures} from '../../../harness/navdata/procedures';
import {savedFlightplan} from '../../../harness/storage';

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
