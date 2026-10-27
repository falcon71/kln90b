import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, finalCourseDeg, pointBefore} from '../../harness/flight/geo';
import {HEADING_INPUT, NO_OBS, panelXml} from '../../harness/panelXml';
import {messages, turnStackLength} from '../../harness/readers';

/** One sample a second, after the calculation tick of that second */
interface Sample { active: string | null; turnStackLength: number; messages: string[] }

const sample = (flight: Flight): Sample => ({
    active: flight.nav.activeIdent, turnStackLength: turnStackLength(flight.unit),
    messages: messages(flight.unit).filter(m => m.startsWith('ADJ NAV IND CRS')),
});

/** Flies a second at a time until `done` holds for the last sample, at most `timeout` seconds; one sample per second */
async function sampleUntil(flight: Flight, done: (s: Sample) => boolean, timeout: number): Promise<Sample[]> {
    const samples: Sample[] = [];
    do {
        if (samples.length >= timeout) throw new Error(`sampleUntil: not done within ${timeout} s`);
        await flight.fly(1);
        samples.push(sample(flight));
    } while (!done(samples[samples.length - 1]));
    return samples;
}

/** One sample a second for `seconds` */
async function sampleFor(flight: Flight, seconds: number): Promise<Sample[]> {
    const samples: Sample[] = [];
    for (let i = 0; i < seconds; i++) {
        await flight.fly(1);
        samples.push(sample(flight));
    }
    return samples;
}

/**
 * The standard route KAAA, ABC, KBBB with magvar 0 and an indicator the unit can neither read nor set (Input.ObsSource 0,
 * Output.ObsTarget 0), the aircraft `nm` before ABC on the first leg, ABC active
 */
async function unreadableOnStandardRoute(nm: number, storage: Record<string, unknown> = {}): Promise<Flight> {
    const {kaaa, abc, kbbb} = standardRoute();
    const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
    const start = pointBefore(kaaa, abc, nm);
    const flight = await Flight.start({
        world, storage: {...savedFlightplan(0, [kaaa, abc, kbbb]), ...storage},
        panelXml: panelXml({...HEADING_INPUT, ...NO_OBS}),
        aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: finalCourseDeg(kaaa, abc)},
    });
    await flight.flyUntilActive('ABC', {timeout: 30});
    expect(flight.unit.props.sensors.in.obsMag).toBeNull(); // Precondition: the course cannot be read
    expect(flight.unit.props.planeSettings.output.obsTarget).toBe(0); // nor set
    return flight;
}

/** The DTK of the leg ABC to KBBB, 016° magnetic with magvar 0 */
const MSG_LEG2 = 'ADJ NAV IND CRS TO 016°';

/**
 * Without a course the unit can read, ADJ NAV IND CRS TO comes at a leg change of more than 5 degrees and goes at the
 * end of the turn the leg change started (4-8, B-1): the MSG light came on as the WPT light went steady at the start of
 * the turn and went out, unread, as the WPT light went off at its end (the Tu-154 video, https://youtu.be/S1lt2W95bLA,
 * about t=2245 and t=2574; the Air Chathams CV580 video at 30:38). Both are proven unreadable installations: the
 * Tu-154's self-test page at about 02:57 shows OBS IN dashed (the maintainer, 2026-10-27), and the CV580's CDI is on
 * NAV 1. The standard route turns 34° left at ABC. #436
 */
describe('ADJ NAV IND CRS TO without a readable course (#436)', () => {
    it('posts ADJ NAV IND CRS TO at the start of the turn and removes it at its end (4-8, #436)', async () => {
        const flight = await unreadableOnStandardRoute(3);

        const samples = await sampleUntil(flight, s => s.active === 'KBBB' && s.turnStackLength === 0, 300);
        const turnStart = samples.findIndex(s => s.turnStackLength > 0);
        const turnEnd = samples.length - 1; // the first sample after the turn
        expect(turnStart).toBeGreaterThan(30); // Precondition: half a minute on the first leg before the turn

        // Before the turn: nothing
        expect(samples.slice(0, turnStart).flatMap(s => s.messages)).toEqual([]);
        // From the calculation that starts the turn, which shows the DTK of the second leg (#407, checked in the KLN 89
        // trainer, 2026-10-27: the message prompt comes in the same display update as the turn start), to the last
        // calculation of the turn, past the sequencing at its midpoint
        const duringTurn = samples.slice(turnStart, turnEnd);
        expect(duringTurn.every(s => s.turnStackLength > 0)).toBe(true); // Precondition: one turn, no break
        expect(duringTurn.length).toBeGreaterThan(5);
        expect(duringTurn.map(s => s.messages)).toEqual(Array(duringTurn.length).fill([MSG_LEG2]));
        // Gone, unread, with the end of the turn, and not back on the straight leg
        expect(samples[turnEnd].messages).toEqual([]);
        expect((await sampleFor(flight, 60)).flatMap(s => s.messages)).toEqual([]);
    });

    // Without turn anticipation (SET 6) the unit sequences at ABC without a turn, so nothing marks an end: the message
    // stays until it is read or the next leg change (the maintainer's ruling, 2026-10-27, low confidence). The AVsoftech
    // trainer posted it the instant the leg switched
    it('characterization: keeps it after a sequencing without turn anticipation until read (#436)', async () => {
        const flight = await unreadableOnStandardRoute(3, {turnAnticipation: false});

        const samples = await sampleUntil(flight, s => s.active === 'KBBB', 300);
        const sequencing = samples.length - 1;
        expect(sequencing).toBeGreaterThan(30); // Precondition: half a minute on the first leg before ABC
        // Before ABC: nothing. From the calculation that sequences it, which shows the DTK of the second leg (#407,
        // checked in the KLN 89 trainer, 2026-10-27, run a12: no lag with turn anticipation off either), the message
        expect(samples.slice(0, sequencing).flatMap(s => s.messages)).toEqual([]);
        expect(samples[sequencing].messages).toEqual([MSG_LEG2]);

        const after = await sampleFor(flight, 60);
        expect([...samples, ...after].every(s => s.turnStackLength === 0)).toBe(true); // Precondition: no turn
        expect(after.map(s => s.messages)).toEqual(Array(60).fill([MSG_LEG2]));
    });

    // The Tu-154 video, about 43:52: a Direct To gives no message. It is no leg change (the maintainer, 2026-10-27)
    it('posts nothing at a Direct To in Leg mode (the Tu-154 video, 43:52, #436)', async () => {
        const flight = await unreadableOnStandardRoute(10);
        const dtkBefore = flight.nav.dtkTrue!;

        await flight.panel.directTo('KBBB');
        const samples = [sample(flight), ...await sampleFor(flight, 30)];

        expect(flight.nav.activeIdent).toBe('KBBB'); // Preconditions: a Direct To that turns the DTK by more than 5°
        expect(angleBetween(flight.nav.dtkTrue, dtkBefore)).toBeGreaterThan(5);
        expect(samples.flatMap(s => s.messages)).toEqual([]);
    });
});
