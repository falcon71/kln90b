import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../harness/boot';
import {angleBetween, courseDeg, norm360, pointFrom} from '../harness/flight/geo';
import {airport, intersection, vor} from '../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../harness/navdata/procedures';
import {savedFlightplan} from '../harness/storage';

// Invented facilities; KAAA is at non-round coordinates so that no default or stale value can match its longitude
const kaaa = airport('KAAA', 47.1, 8.3);
const abc = vor('ABC', 47.5, 8.9);
const kbbb = airport('KBBB', 48.2, 9.2);

/** The unit sits on KAAA with FPL 0 = KAAA, ABC, KBBB; the first calculation tick activates ABC with KAAA as FROM */
function bootOnRoute(panelXml?: string, magvar = 0) {
    return bootUnit({
        facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        position: {lat: kaaa.lat, lon: kaaa.lon}, magvar, panelXml,
    });
}

// Public contract: the GPS SimVars written when Output.WriteGPSSimVars is set (CLAUDE.md, "Public contract with
// aircraft"). Their units are the MSFS GPS SimVar definitions.
describe('GPS SimVars written by SensorsOut', () => {
    it('writes GPS MAGVAR in radians (6be164c)', async () => {
        const unit = await bootUnit({magvar: 4, position: {lat: 47, lon: 8}});
        await vi.advanceTimersByTimeAsync(3000);

        const sim = unit.env.sim;
        // 4 degrees east; the literal conversion, not taken from the instrument
        expect(sim.get('GPS MAGVAR', 'radians')).toBeCloseTo(4 * Math.PI / 180, 6);
        expect(sim.lastWrite('GPS MAGVAR')!.unit).toBe('radians');
    });

    // Public contract: panel.xml Output.ObsTarget (cfg/panel.xml: "If 1 or 2 is set, the KLN writes the OBS to this
    // device"; CLAUDE.md, "Public contract with aircraft"). That the value is the magnetic DTK in LEG mode is a code fact
    // (ModeController.getDtkOrObsMagnetic), not part of the sample file. 07c6e37 made the output a key event (K:VOR1_SET),
    // because the plain name wrote a SimVar that is not writable.
    describe('Output.ObsTarget (07c6e37)', () => {
        const obsPanelXml = (target: number) =>
            `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><ObsTarget>${target}</ObsTarget></Output></Instrument></PlaneHTMLConfig>`;
        const vorKeyEvents = (unit: HeadlessUnit) => unit.env.sim.keyEvents.filter(k => k.name.startsWith('K:VOR'));

        it('sets VOR 1 to the magnetic DTK with ObsTarget 1', async () => {
            const unit = await bootOnRoute(obsPanelXml(1), 4);
            await vi.advanceTimersByTimeAsync(3000);

            const sim = unit.env.sim;
            expect(unit.errors).toEqual([]);
            // The aircraft sits on KAAA, so DTK is the initial course KAAA - ABC, less the 4 degrees east variation
            const expectedMag = courseDeg(kaaa, abc) - 4;
            const events = vorKeyEvents(unit);
            expect(events.length).toBeGreaterThan(0);
            expect(events.map(e => e.name)).toEqual(events.map(() => 'K:VOR1_SET'));
            expect(events[events.length - 1].value).toBeCloseTo(expectedMag, 2);
            // The old behavior: a write to the plain name
            expect(sim.writes.filter(w => w.name === 'VOR1_SET')).toEqual([]);
        });

        it('sets VOR 2 only with ObsTarget 2', async () => {
            const unit = await bootOnRoute(obsPanelXml(2), 4);
            await vi.advanceTimersByTimeAsync(3000);

            const events = vorKeyEvents(unit);
            expect(events.length).toBeGreaterThan(0);
            expect(events.map(e => e.name)).toEqual(events.map(() => 'K:VOR2_SET'));
            expect(events[events.length - 1].value).toBeCloseTo(courseDeg(kaaa, abc) - 4, 2);
            expect(unit.env.sim.writes.filter(w => w.name === 'VOR2_SET')).toEqual([]);
        });

        // 92fbba1: the OBS is written only while the GPS drives NAV 1. The condition is documented in that commit message,
        // not in cfg/panel.xml. Render stage only: a flight's
        // Aircraft.writeTo writes GPS DRIVES NAV1 true at 16 Hz, which would overwrite the value set here.
        it('writes the OBS only while the GPS drives NAV 1 (92fbba1)', async () => {
            const unit = await bootOnRoute(obsPanelXml(1), 4);
            await vi.advanceTimersByTimeAsync(3000);
            const before = vorKeyEvents(unit).length;
            // Precondition, not the claim: the unit writes while it drives NAV 1
            expect(before).toBeGreaterThan(0);

            unit.env.sim.set('GPS DRIVES NAV1', 'bool', false);
            await vi.advanceTimersByTimeAsync(5000);
            expect(vorKeyEvents(unit).length).toBe(before);

            // Not a permanent mute
            unit.env.sim.set('GPS DRIVES NAV1', 'bool', true);
            await vi.advanceTimersByTimeAsync(3000);
            expect(vorKeyEvents(unit).length).toBeGreaterThan(before);
        });

        it('writes no VOR key event with the default ObsTarget 0', async () => {
            const unit = await bootOnRoute(undefined, 4);
            await vi.advanceTimersByTimeAsync(3000);

            // The route is active, so DTK is known: the silence is the option, not a missing DTK
            expect(unit.env.sim.get('GPS WP NEXT ID', 'string')).toBe('ABC');
            expect(vorKeyEvents(unit)).toEqual([]);
        });
    });

    it('writes GPS WP NEXT LON and GPS WP PREV LON in degrees (1236025)', async () => {
        const unit = await bootOnRoute();
        await vi.advanceTimersByTimeAsync(3000);

        const sim = unit.env.sim;
        // ABC is the active waypoint and KAAA the FROM waypoint; the latitudes are controls against a swap
        expect(sim.get('GPS WP NEXT ID', 'string')).toBe('ABC');
        expect(sim.get('GPS WP NEXT LON', 'degrees')).toBeCloseTo(8.9, 6);
        expect(sim.get('GPS WP NEXT LAT', 'degrees')).toBeCloseTo(47.5, 6);
        expect(sim.get('GPS WP PREV LON', 'degrees')).toBeCloseTo(8.3, 6);
        expect(sim.get('GPS WP PREV LAT', 'degrees')).toBeCloseTo(47.1, 6);
        expect(sim.lastWrite('GPS WP NEXT LON')!.unit).toBe('degrees');
        expect(sim.lastWrite('GPS WP PREV LON')!.unit).toBe('degrees');
    });
});

// Public contract: GPS WP TRUE BEARING and GPS WP BEARING are what an autopilot follows (CLAUDE.md, "Public contract with
// aircraft", the GPS SimVars). L:KLN90B_GPS_WP_BEARING is the RMI bearing and differs from them (kln90b/LVars.ts,
// docs/architecture.md; Pilot's Guide appendix A). 1e1a8f5: on a DME arc the autopilot SimVars carry the desired track,
// because the bearing to the arc's end fix would make the autopilot fly straight at it.
describe('GPS WP TRUE BEARING on a DME arc (#21 1e1a8f5)', () => {
    // A left arc around ABC from the 270 to the 180 radial through the south-west, then FAFAA and the MAP
    const arcAbc = vor('ABC', 47.3, 8.3);
    const at = (bearing: number, nm: number) => pointFrom({lat: arcAbc.lat, lon: arcAbc.lon}, bearing, nm);
    const arcbg = intersection('ARCBG', at(270, 10).lat, at(270, 10).lon);
    const arcen = intersection('ARCEN', at(180, 10).lat, at(180, 10).lon);
    const fafaa = intersection('FAFAA', 47.1, 7.9);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
        approaches: [approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG', legs: [
                    Leg.IF(arcbg, FixTypeFlags.IAF),
                    Leg.AF(arcen, arcAbc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left}),
                    Leg.TF(fafaa, FixTypeFlags.FAF),
                ],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        })],
    });

    /** Booted on the arc and loaded, so FPL 0 is D225J ARCEN FAFAA MAPAA KPRC with ARCEN active */
    async function loadedOnArc() {
        const unit = await bootUnit({
            facilities: [kprc, arcAbc, arcbg, arcen, fafaa, mapaa], position: at(225, 10), storage: savedFlightplan(0, [kprc]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        return unit;
    }

    it('is the desired track on the arc, while the RMI LVar is the bearing to the end fix', async () => {
        const unit = await loadedOnArc();
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ARCEN');
        const p = at(210, 10);
        await moveAircraft(unit, p, {groundspeedKt: 0});
        await vi.advanceTimersByTimeAsync(2000);

        const sim = unit.env.sim;
        // The tangent of a counterclockwise arc is the course to the VOR plus 90 (119.91 here), not the bearing to
        // ARCEN (104.91)
        expect(norm360(sim.get('GPS WP TRUE BEARING', 'degrees'))).toBeCloseTo(norm360(courseDeg(p, arcAbc) + 90), 1);
        expect(norm360(sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees'))).toBeCloseTo(courseDeg(p, arcen), 1);
        expect(unit.errors).toEqual([]);
    });

    // The unchanged half of the contract: on a great-circle leg the bearing to the waypoint is written, which the break
    // of the arc case does not touch
    it('is the bearing to the waypoint on a great-circle leg', async () => {
        const unit = await loadedOnArc();
        const active = unit.props.memory.navPage.activeWaypoint;
        active.sequenceToNextWaypoint(); // FAFAA from ARCEN: a great circle
        // 2 NM along ARCEN to FAFAA and 1 NM to its right, so that the bearing to FAFAA differs from the DTK
        const along = pointFrom(arcen, courseDeg(arcen, fafaa), 2);
        const p = pointFrom(along, courseDeg(arcen, fafaa) + 90, 1);
        await moveAircraft(unit, p, {groundspeedKt: 0});
        await vi.advanceTimersByTimeAsync(2000);

        expect(active.getActiveWpt()!.icaoStruct.ident).toBe('FAFAA');
        expect(angleBetween(unit.props.memory.navPage.desiredTrack, courseDeg(p, fafaa))).toBeGreaterThan(3);
        expect(norm360(unit.env.sim.get('GPS WP TRUE BEARING', 'degrees'))).toBeCloseTo(courseDeg(p, fafaa), 1);
        expect(unit.errors).toEqual([]);
    });
});
