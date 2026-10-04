import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../harness/boot';
import {courseDeg} from '../harness/flight/geo';
import {airport, vor} from '../harness/navdata/builders';
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
            // The aircraft sits on KAAA, so DTK is the initial course KAAA - ABC (about 50.37), less the 4 degrees east variation
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

        // 92fbba1: the OBS is written only while the GPS drives NAV 1. The condition is documented in that commit message
        // (and as a comment on the OBS input in Sensors.ts), not in cfg/panel.xml. Render stage only: a flight's
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
