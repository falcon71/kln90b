import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../harness/boot';
import {angleBetween, courseDeg, distanceNm, norm360, pointBefore, pointFrom} from '../harness/flight/geo';
import {standardRoute} from '../harness/fixtures';
import {NavMode} from '../../kln90b/data/VolatileMemory';
import {airport, intersection, vor} from '../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../harness/navdata/procedures';
import {savedFlightplan} from '../harness/storage';
import {LEG_OBS_SWITCH, panelXml} from '../harness/panelXml';
import {activeIdent} from '../harness/readers';
import {bootOnStandardRoute} from '../harness/worldBoot';

// Invented facilities; KAAA is at non-round coordinates so that no default or stale value can match its longitude
const kaaa = airport('KAAA', 47.1, 8.3);
const abc = vor('ABC', 47.5, 8.9);
const kbbb = airport('KBBB', 48.2, 9.2);

/**
 * The unit sits on KAAA with FPL 0 = KAAA, ABC, KBBB; the first calculation tick activates ABC with KAAA as FROM. The
 * world is the invented one above and the tests advance the clock themselves, so it is not bootOnStandardRoute
 */
function bootOnRoute(xml?: string, magvar = 0) {
    return bootUnit({
        facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        position: {lat: kaaa.lat, lon: kaaa.lon}, magvar, panelXml: xml,
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
        const obsPanelXml = (target: number) => panelXml({'Output.ObsTarget': target});
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
    const MAGVAR = 4;
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
        // 4 degrees east variation, so that a true and a magnetic output cannot be mistaken for each other. The arc's
        // radials and all positions are true, and magnetic = true - 4.
        const unit = await bootUnit({
            facilities: [kprc, arcAbc, arcbg, arcen, fafaa, mapaa], position: at(225, 10), storage: savedFlightplan(0, [kprc]),
            magvar: MAGVAR,
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        return unit;
    }

    /** The three outputs of the active leg in degrees: GPS WP TRUE BEARING, GPS WP BEARING (magnetic), the RMI LVar */
    const outputs = (unit: HeadlessUnit) => ({
        trueBearing: norm360(unit.env.sim.get('GPS WP TRUE BEARING', 'degrees')),
        magBearing: norm360(unit.env.sim.get('GPS WP BEARING', 'degrees')),
        rmi: norm360(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')),
    });

    it('is the desired track on the arc, while the RMI LVar is the bearing to the end fix', async () => {
        const unit = await loadedOnArc();
        expect(activeIdent(unit)).toBe('ARCEN');
        const p = at(210, 10);
        await moveAircraft(unit, p, {groundspeedKt: 0});
        await vi.advanceTimersByTimeAsync(2000);

        // The tangent of a counterclockwise arc is the course to the VOR plus 90 (119.91 true here), not the bearing to
        // ARCEN (104.91 true). The autopilot SimVars carry the tangent, true and magnetic; the RMI LVar carries the
        // magnetic bearing to ARCEN.
        const tangent = norm360(courseDeg(p, arcAbc) + 90);
        const out = outputs(unit);
        expect(out.trueBearing).toBeCloseTo(tangent, 1);
        expect(out.magBearing).toBeCloseTo(tangent - MAGVAR, 1);
        expect(out.rmi).toBeCloseTo(courseDeg(p, arcen) - MAGVAR, 1);
        // The unit of all three is radians (Sensors.setWpBearing), which is what an aircraft reads
        for (const name of ['GPS WP TRUE BEARING', 'GPS WP BEARING', 'L:KLN90B_GPS_WP_BEARING']) {
            expect(unit.env.sim.lastWrite(name)!.unit).toBe('radians');
        }
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

        expect(activeIdent(unit)).toBe('FAFAA');
        expect(angleBetween(unit.props.memory.navPage.desiredTrack, courseDeg(p, fafaa))).toBeGreaterThan(3);
        const out = outputs(unit);
        expect(out.trueBearing).toBeCloseTo(courseDeg(p, fafaa), 1);
        expect(out.magBearing).toBeCloseTo(courseDeg(p, fafaa) - MAGVAR, 1);
        expect(out.rmi).toBeCloseTo(courseDeg(p, fafaa) - MAGVAR, 1);
        expect(unit.errors).toEqual([]);
    });
});

// Public contract: the GPS SimVars written when Output.WriteGPSSimVars is set (CLAUDE.md, "Public contract with
// aircraft"; the wiki page panel.xml customization lists them under WriteGPSSimVars, and the units are the MSFS GPS SimVar
// definitions). One known state, expected values from geo.ts: the aircraft is held 1 NM right of the first leg of the
// standard route, 20 NM before ABC, with a ground speed of 120 kt and a track 10 degrees right of the leg. The variation
// is 4 degrees east, so a true value cannot be taken for a magnetic one. Each group is its own `it`, so that one break
// cannot hide another (Vitest stops at the first failed assertion of an `it`).
describe('GPS SimVars for a known state', () => {
    const MAGVAR = 4;
    const route = standardRoute();
    const onLeg = pointBefore(route.kaaa, route.abc, 20);
    const legCourse = courseDeg(onLeg, route.abc); // About 50.75 true
    const p = pointFrom(onLeg, legCourse + 90, 1); // 1 NM right of the leg
    const trackTrue = norm360(legCourse + 10);

    const sim = (unit: HeadlessUnit) => unit.env.sim;

    async function bootKnownState(xml?: string) {
        const unit = await bootOnStandardRoute({position: p, magvar: MAGVAR, panelXml: xml});
        await moveAircraft(unit, p, {groundspeedKt: 120, trackTrue});
        await vi.advanceTimersByTimeAsync(4000); // The 16 Hz XTK filter converges on a constant input
        expect(unit.errors).toEqual([]);
        return unit;
    }

    it('writes the position, ground speed, magnetic variation and tracks', async () => {
        const unit = await bootKnownState();

        expect(sim(unit).get('GPS POSITION LAT', 'degrees')).toBeCloseTo(p.lat, 6);
        expect(sim(unit).get('GPS POSITION LON', 'degrees')).toBeCloseTo(p.lon, 6);
        expect(sim(unit).get('GPS GROUND SPEED', 'meters per second')).toBeCloseTo(120 * 1852 / 3600, 3);
        expect(sim(unit).get('GPS MAGVAR', 'degrees')).toBeCloseTo(4, 4);
        expect(norm360(sim(unit).get('GPS GROUND TRUE TRACK', 'degrees'))).toBeCloseTo(trackTrue, 2);
        expect(norm360(sim(unit).get('GPS GROUND MAGNETIC TRACK', 'degrees'))).toBeCloseTo(trackTrue - 4, 2);
    });

    it('writes the distance and the true and magnetic bearing to the active waypoint', async () => {
        const unit = await bootKnownState();

        expect(sim(unit).get('GPS WP NEXT ID', 'string')).toBe('ABC'); // Precondition: ABC is the active waypoint
        expect(sim(unit).get('GPS WP DISTANCE', 'meters')).toBeCloseTo(distanceNm(p, route.abc) * 1852, -1);
        expect(norm360(sim(unit).get('GPS WP TRUE BEARING', 'degrees'))).toBeCloseTo(courseDeg(p, route.abc), 2);
        expect(norm360(sim(unit).get('GPS WP BEARING', 'degrees'))).toBeCloseTo(courseDeg(p, route.abc) - 4, 2);
    });

    // The sign of GPS WP CROSS TRK follows the SDK's GpsSynchronizer, which writes the negated cross track: 1 NM right of
    // the leg is -1852 m. The scaling is the 5 NM of the enroute CDI (3-3), in meters.
    it('writes the desired track, the OBS value, the cross track and the CDI scaling', async () => {
        const unit = await bootKnownState();

        // The desired track is the course of the leg, less the variation, in radians
        expect(sim(unit).get('GPS WP DESIRED TRACK', 'degrees')).toBeCloseTo(courseDeg(onLeg, route.abc) - 4, 1);
        expect(sim(unit).lastWrite('GPS WP DESIRED TRACK')!.unit).toBe('radians');
        // In LEG mode the OBS value is the desired track
        expect(sim(unit).get('GPS OBS VALUE', 'degrees')).toBeCloseTo(courseDeg(onLeg, route.abc) - 4, 1);
        expect(sim(unit).get('GPS WP CROSS TRK', 'meters')).toBeCloseTo(-1852, -1);
        expect(sim(unit).get('GPS CDI SCALING', 'meters')).toBeCloseTo(9260, 3);
    });

    it('writes the time to the active waypoint and to the destination, and the arrival times', async () => {
        const unit = await bootKnownState();
        const toAbc = distanceNm(p, route.abc);
        const toKbbb = toAbc + distanceNm(route.abc, route.kbbb);
        const eteWp = toAbc / 120 * 3600;
        const eteDest = toKbbb / 120 * 3600;
        // The arrival time is the zulu time of day plus the time to go; the clock is the harness's fake clock
        const now = (Date.now() % 86_400_000) / 1000;

        expect(Math.abs(sim(unit).get('GPS WP ETE', 'seconds') - eteWp)).toBeLessThan(1);
        expect(Math.abs(sim(unit).get('GPS ETE', 'seconds') - eteDest)).toBeLessThan(1);
        expect(Math.abs(sim(unit).get('GPS WP ETA', 'seconds') - (now + eteWp))).toBeLessThan(1.5);
        expect(Math.abs(sim(unit).get('GPS ETA', 'seconds') - (now + eteDest))).toBeLessThan(1.5);
    });

    it('writes the flight plan size, the active index and the previous and next waypoint', async () => {
        const unit = await bootKnownState();

        expect(sim(unit).get('GPS FLIGHT PLAN WP COUNT', 'number')).toBe(3);
        expect(sim(unit).get('GPS FLIGHT PLAN WP INDEX', 'number')).toBe(2); // One based: ABC is the second waypoint
        expect(sim(unit).get('GPS WP PREV VALID', 'bool')).toBe(1);
        expect(sim(unit).get('GPS WP PREV ID', 'string')).toBe('KAAA');
        expect(sim(unit).get('GPS WP PREV LAT', 'degrees')).toBeCloseTo(47.0, 6);
        expect(sim(unit).get('GPS WP NEXT ID', 'string')).toBe('ABC');
        expect(sim(unit).get('GPS WP NEXT LAT', 'degrees')).toBeCloseTo(47.5, 6);
        expect(sim(unit).get('GPS IS ACTIVE FLIGHT PLAN', 'bool')).toBe(1);
        expect(sim(unit).get('GPS IS ACTIVE WAY POINT', 'bool')).toBe(1);
    });

    // The wiki lists the vertical outputs as set to 0: the KLN does not give vertical guidance. The values are asserted
    // through the last write, because a variable nobody wrote reads 0 too.
    it('writes the leg mode and the vertical outputs as zero, and switches the OBS off', async () => {
        const unit = await bootKnownState();

        for (const name of ['GPS IS APPROACH ACTIVE', 'GPS APPROACH MODE', 'GPS HAS GLIDEPATH', 'GPS GSI SCALING', 'GPS VERTICAL ANGLE',
            'GPS VERTICAL ANGLE ERROR', 'GPS VERTICAL ERROR']) {
            expect([name, sim(unit).lastWrite(name)?.value]).toEqual([name, 0]);
        }
        const obsEvents = sim(unit).keyEvents.filter(k => k.name.startsWith('K:GPS_OBS'));
        expect(obsEvents[obsEvents.length - 1].name).toBe('K:GPS_OBS_OFF');
    });

    // No contract states the sign of GPS WP TRACK ANGLE ERROR: this is what the code writes today, a negative angle for a
    // track to the right of the desired track
    it('writes a negative track angle error for a track 10 degrees right of the desired track (characterization)', async () => {
        const unit = await bootKnownState();

        expect(sim(unit).get('GPS WP TRACK ANGLE ERROR', 'degrees')).toBeCloseTo(-10, 0);
        expect(sim(unit).lastWrite('GPS WP TRACK ANGLE ERROR')!.unit).toBe('radians');
    });

    it('moves the index and the previous and next waypoint on after a sequence', async () => {
        const unit = await bootKnownState();
        unit.props.memory.navPage.activeWaypoint.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(sim(unit).get('GPS FLIGHT PLAN WP INDEX', 'number')).toBe(3);
        expect(sim(unit).get('GPS WP PREV ID', 'string')).toBe('ABC');
        expect(sim(unit).get('GPS WP PREV LON', 'degrees')).toBeCloseTo(8.9, 6);
        expect(sim(unit).get('GPS WP NEXT ID', 'string')).toBe('KBBB');
        expect(sim(unit).get('GPS WP NEXT LAT', 'degrees')).toBeCloseTo(48.2, 6);
    });

    // The K:GPS_OBS_ON and K:GPS_OBS_OFF key events stand in for GPS OBS ACTIVE, which cannot be written (Sensors.setMode);
    // the External Annunciators wiki page describes the OBS light. FakeSim gives key events no effect, so the events
    // themselves are the contract.
    describe('GPS OBS key events', () => {
        const obsEvents = (unit: HeadlessUnit) => unit.env.sim.keyEvents.filter(k => k.name.startsWith('K:GPS_OBS'));

        it('ends on K:GPS_OBS_ON in OBS mode', async () => {
            const unit = await bootKnownState();
            unit.env.sim.set('Nav OBS:1', 'degrees', 51);
            await unit.panel.obsMode();
            await vi.advanceTimersByTimeAsync(2000);

            expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
            const events = obsEvents(unit);
            expect(events[events.length - 1].name).toBe('K:GPS_OBS_ON');
        });

        // The switch makes GPS OBS ACTIVE read-only, so the unit leaves the key events out
        it('writes no K:GPS_OBS event with LegObsSwitchInstalled', async () => {
            const unit = await bootKnownState(panelXml(LEG_OBS_SWITCH));
            // The switch, not the unit, selects OBS: the unit follows GPS OBS ACTIVE
            unit.env.sim.set('Nav OBS:1', 'degrees', 51);
            unit.env.sim.set('GPS OBS ACTIVE', 'bool', true);
            await vi.advanceTimersByTimeAsync(2000);

            // The other outputs run, so the silence is the option
            expect(unit.env.sim.get('GPS WP NEXT ID', 'string')).toBe('ABC');
            expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
            expect(obsEvents(unit)).toEqual([]);
        });
    });
});
