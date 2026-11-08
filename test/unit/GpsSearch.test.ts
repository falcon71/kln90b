import {describe, expect, it} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {GPS_ERA_DURATION, GpsSearch, receiverTimeDifference, SearchMode} from '../../kln90b/GpsSearch';
import type {KLNGPSSatComputer} from '../../kln90b/Gps';

// #62, #63: the receiver keeps GPS time as the week modulo 1024 and the time of week, so a difference of its clocks is
// wrapped into half an era either way. The expectations are literals, not derived from the constant under test
const DAY = 24 * 60 * 60 * 1000;
const ERA = 1024 * 7 * 24 * 3600 * 1000;

describe('receiverTimeDifference', () => {
    it('the era is 1024 weeks', () => {
        expect(GPS_ERA_DURATION).toBe(ERA);
    });

    it.each([
        [0, 0, 0],
        [ERA, 0, 0],
        [-ERA, 0, 0],
    ])('a difference of %d - %d is no difference at all', (a, b, expected) => {
        expect(Math.abs(receiverTimeDifference(a, b))).toBe(expected);
    });

    it.each([
        [DAY, 0, DAY],
        [-DAY, 0, -DAY],
        [-ERA + DAY, 0, DAY], // A day ahead, one era back
        [ERA - DAY, 0, -DAY],
        [DAY, -ERA, DAY], // The second argument counts, too
        [ERA / 2, 0, ERA / 2], // Half an era stays as it is, either way
        [-ERA / 2, 0, -ERA / 2],
        [ERA / 2 + 1, 0, -ERA / 2 + 1], // Beyond half an era, the other way round is shorter
        [-ERA / 2 - 1, 0, ERA / 2 - 1],
    ])('%d - %d is %d', (a, b, expected) => {
        expect(receiverTimeDifference(a, b)).toBe(expected);
    });
});

/** A satellite outside the unit's interest: searched (None), or given up on by the SDK (Unreachable) */
const searched = (prn: number) => ({prn, state: {get: () => GPSSatelliteState.None}});
const givenUp = (prn: number) => ({prn, state: {get: () => GPSSatelliteState.Unreachable}});

/**
 * A satellite computer with the few members the search calls, and no satellites in channels. Records the acquisition
 * times, the erasures of the last known position and the forgotten Unreachable marks, which a sky search after a lost fix
 * sets
 */
class FakeComputer {
    public acquisitionTime: [number, number] | null = null;
    public acquisitionTimeWithEphemeris: [number, number] | null = null;
    public erased = 0;
    public forgotten = 0;
    /** Resolves the prediction context's init, so that a pending start begins */
    public ready = false;
    public createPredictionContext() {
        const computer = this;
        return {
            awaitInit: () => computer.ready ? Promise.resolve() : new Promise<void>(() => undefined), // Never ready: no pending start begins
            setPosition() {
                return this;
            },
            predict: () => undefined,
            getSatellites: () => [],
        };
    }
    public getLastAlmanacTime = (): number | undefined => undefined;
    public getSatellites: () => { prn: number, state?: { get: () => GPSSatelliteState } }[] = () => [searched(1), searched(2)];
    public setSatelliteInhibit(prn: number, inhibit: boolean): void {
        this.inhibited.set(prn, inhibit);
    }
    public setAcquisitionTime(mean: number, range: number): void {
        this.acquisitionTime = [mean, range];
    }
    public setAcquisitionTimeWithEphemeris(mean: number, range: number): void {
        this.acquisitionTimeWithEphemeris = [mean, range];
    }
    public eraseLastKnownPosition(): void {
        this.erased++;
    }
    public syncLastKnownPosition = (): void => undefined;
    public forgetUnreachable(): void {
        this.forgotten++;
    }
    public channels: { prn: number, signalStrength: { get: () => number } }[] = [];
    public inhibited = new Map<number, boolean>();
    public getChannels = () => this.channels;
}

// Design 2026-11-07, "Recovery": a unit with no fix for the start model's give-up time (Install manual 2-66: 5 minutes)
// gives up on its prediction and searches the sky, as after a power-on (3-17). The times are literals
describe('GpsSearch: the sky search after a lost fix (#465)', () => {
    const LOST_AT = 1_000_000;
    const FIVE_MINUTES = 5 * 60 * 1000;
    const HERE = {lat: 47, lon: 8};

    function idleSearch(): { search: GpsSearch, computer: FakeComputer } {
        const computer = new FakeComputer();
        const search = new GpsSearch(computer as unknown as KLNGPSSatComputer, () => false);
        return {search, computer};
    }

    // Final review (2026-11-08): the sky search keeps the receiver's belief. A jammed receiver's clock and position stay
    // right: the SDK keeps its last known position and its almanac, and the idle and hot times (IDLE_ACQUISITION 40 s and a
    // range of 6 s, HOT_ACQUISITION 9 s and a range of 6 s), not the blind ones
    it('five minutes after a lost fix in Idle it starts a sky search that keeps the belief', () => {
        const {search, computer} = idleSearch();
        search.lostFix(LOST_AT);

        search.tick(LOST_AT + FIVE_MINUTES - 1000, HERE, LOST_AT);
        expect(search.mode).toBe(SearchMode.Idle);
        expect(computer.erased).toBe(0);
        expect(computer.forgotten).toBe(0);
        expect(search.keepsBelief).toBe(false);

        search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);
        expect(search.mode).toBe(SearchMode.SkySearch);
        expect(search.keepsBelief).toBe(true);
        expect(computer.erased).toBe(0);
        expect(computer.acquisitionTime).toEqual([40_000, 6_000]);
        expect(computer.acquisitionTimeWithEphemeris).toEqual([9_000, 6_000]);
        expect(computer.forgotten).toBe(1); // Every PRN is searched again, also those the SDK marked Unreachable

        search.tick(LOST_AT + 2 * FIVE_MINUTES, HERE, LOST_AT);
        expect(computer.forgotten).toBe(2); // In every tick: it never gives up on a satellite for an hour
        expect(computer.erased).toBe(0);
        expect(search.mode).toBe(SearchMode.SkySearch); // It runs until a fix ends it

        search.end();
        expect(search.keepsBelief).toBe(false);
        expect(search.mode).toBe(SearchMode.Idle);
    });

    // The sky search of the start model after a power-on is unchanged: the predicted satellites were not there, so the
    // receiver no longer trusts where it was, and searches blind (BLIND_ACQUISITION 90 s, a range of 60 s)
    it('the power-on sky search after the give-up time still searches blind', async () => {
        const computer = new FakeComputer();
        computer.ready = true;
        computer.getLastAlmanacTime = () => LOST_AT;
        const search = new GpsSearch(computer as unknown as KLNGPSSatComputer, () => false);
        search.start(HERE);
        await Promise.resolve();
        search.tick(LOST_AT, HERE, LOST_AT);
        expect(search.mode).toBe(SearchMode.Acquisition); // Precondition
        search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);

        expect(search.mode).toBe(SearchMode.SkySearch);
        expect(search.keepsBelief).toBe(false);
        expect(computer.erased).toBe(1);
        expect(computer.acquisitionTime).toEqual([90_000, 60_000]);
    });

    // A satellite below the horizon in a channel (the SDK's geometric signal strength of 0.05 or less, GPSSat.ts) is inhibited
    // until it has left the channels, then the inhibit is lifted; one in view is not touched
    it('the sky search that keeps the belief takes satellites below the horizon out of the channels', () => {
        const {search, computer} = idleSearch();
        const sat = (prn: number, strength: number) => ({prn, signalStrength: {get: () => strength}});
        computer.getSatellites = () => [searched(1), searched(2), searched(3)];
        computer.channels = [sat(1, 0.5), sat(2, 0.05), sat(3, 0)];
        search.lostFix(LOST_AT);
        search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);
        search.applyInhibits();
        expect([...computer.inhibited.entries()].filter(([, v]) => v).map(([p]) => p)).toEqual([2, 3]);

        // The SDK took PRN 3 out at its channel assignment; PRN 2 is still in a channel
        computer.channels = [sat(1, 0.5), sat(2, 0.05), sat(1, 0.5)];
        search.tick(LOST_AT + FIVE_MINUTES + 1000, HERE, LOST_AT);
        search.applyInhibits();
        expect([...computer.inhibited.entries()].filter(([, v]) => v).map(([p]) => p)).toEqual([2]);

        // A fix ends the search and every inhibit it set
        search.end();
        expect([...computer.inhibited.entries()].filter(([, v]) => v).map(([p]) => p)).toEqual([]);
    });

    // A sky search of the start model (after a power-on) is blind: it takes nothing out of the channels
    it('the blind sky search takes nothing out of the channels', async () => {
        const computer = new FakeComputer();
        computer.ready = true;
        computer.getLastAlmanacTime = () => LOST_AT;
        computer.getSatellites = () => [searched(1), searched(2)];
        computer.channels = [{prn: 2, signalStrength: {get: () => 0}}];
        const search = new GpsSearch(computer as unknown as KLNGPSSatComputer, () => false);
        search.start(HERE);
        await Promise.resolve();
        search.tick(LOST_AT, HERE, LOST_AT);
        search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);
        search.tick(LOST_AT + FIVE_MINUTES + 1000, HERE, LOST_AT);
        search.applyInhibits();
        expect(search.mode).toBe(SearchMode.SkySearch); // Precondition
        expect([...computer.inhibited.entries()].filter(([, v]) => v).map(([p]) => p)).toEqual([]);
    });

    // #470: a blind search sweeps through the PRNs; the SDK gives up on one it searched in vain after 4 minutes and leaves
    // it out for an hour. Once every PRN the search may search outside the channels was given up on, the next pass starts:
    // the marks are forgotten. Not while one is still waiting for a channel, and an inhibited one does not count
    describe('the next pass of a blind search (#470)', () => {
        async function blindSkySearch(allBlocked = () => false): Promise<{ search: GpsSearch, computer: FakeComputer }> {
            const computer = new FakeComputer();
            computer.ready = true;
            computer.getLastAlmanacTime = () => LOST_AT;
            const search = new GpsSearch(computer as unknown as KLNGPSSatComputer, allBlocked);
            search.start(HERE);
            await Promise.resolve();
            search.tick(LOST_AT, HERE, LOST_AT);
            search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);
            expect(search.mode).toBe(SearchMode.SkySearch); // Precondition
            expect(search.searchesBlind).toBe(true);
            computer.forgotten = 0;
            return {search, computer};
        }

        it('forgets the marks once every PRN outside the channels was given up on', async () => {
            const {search, computer} = await blindSkySearch();
            computer.channels = [{prn: 3, signalStrength: {get: () => 0}}];
            computer.getSatellites = () => [givenUp(1), givenUp(2), searched(3)];

            search.tick(LOST_AT + FIVE_MINUTES + 1000, HERE, LOST_AT);

            expect(computer.forgotten).toBe(1);
        });

        it('waits while a PRN outside the channels has not been searched in this pass', async () => {
            const {search, computer} = await blindSkySearch();
            computer.channels = [{prn: 3, signalStrength: {get: () => 0}}];
            computer.getSatellites = () => [givenUp(1), searched(2), searched(3)];

            search.tick(LOST_AT + FIVE_MINUTES + 1000, HERE, LOST_AT);

            expect(computer.forgotten).toBe(0);
        });

        it('a satellite in a channel that was given up on is not waiting', async () => {
            const {search, computer} = await blindSkySearch();
            computer.channels = [{prn: 2, signalStrength: {get: () => 0}}];
            computer.getSatellites = () => [givenUp(1), givenUp(2)];

            search.tick(LOST_AT + FIVE_MINUTES + 1000, HERE, LOST_AT);

            expect(computer.forgotten).toBe(1);
        });

        it('an inhibited PRN does not count: with every PRN blocked there is no pass to restart', async () => {
            const {search, computer} = await blindSkySearch(() => true); // A receiver failure blocks every PRN
            computer.getSatellites = () => [givenUp(1), givenUp(2)];

            search.tick(LOST_AT + FIVE_MINUTES + 1000, HERE, LOST_AT);

            expect(computer.forgotten).toBe(0);
        });

        it('nothing is forgotten when no PRN was given up on', async () => {
            const {search, computer} = await blindSkySearch();
            computer.channels = [{prn: 1, signalStrength: {get: () => 0}}, {prn: 2, signalStrength: {get: () => 0}}];
            computer.getSatellites = () => [searched(1), searched(2)];

            search.tick(LOST_AT + FIVE_MINUTES + 1000, HERE, LOST_AT);

            expect(computer.forgotten).toBe(0);
        });

        it("the start model's acquisition and Idle do not search blind", async () => {
            const computer = new FakeComputer();
            computer.ready = true;
            computer.getLastAlmanacTime = () => LOST_AT;
            const search = new GpsSearch(computer as unknown as KLNGPSSatComputer, () => false);
            expect(search.searchesBlind).toBe(false); // Idle
            search.start(HERE);
            await Promise.resolve();
            search.tick(LOST_AT, HERE, LOST_AT);
            expect(search.mode).toBe(SearchMode.Acquisition);
            expect(search.searchesBlind).toBe(false);
        });

        it('the sky search after a lost fix keeps its belief: not blind', () => {
            const {search} = idleSearch();
            search.lostFix(LOST_AT);
            search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);
            expect(search.keepsBelief).toBe(true); // Precondition
            expect(search.searchesBlind).toBe(false);
        });
    });

    it('without a lost fix it stays idle', () => {
        const {search} = idleSearch();

        search.tick(LOST_AT + 10 * FIVE_MINUTES, HERE, LOST_AT);

        expect(search.mode).toBe(SearchMode.Idle);
    });

    // A fix ends the search (GPS.gpsAcquired), so a fix regained before the five minutes cancels it. start() clears it too:
    // it ends the search first
    it('end() clears it', () => {
        const {search} = idleSearch();
        search.lostFix(LOST_AT);

        search.end();
        search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);

        expect(search.mode).toBe(SearchMode.Idle);
    });

    it('a second loss restarts the five minutes', () => {
        const {search} = idleSearch();
        search.lostFix(LOST_AT);
        search.end(); // The fix regained in between
        search.lostFix(LOST_AT + 60_000);

        search.tick(LOST_AT + FIVE_MINUTES, HERE, LOST_AT);
        expect(search.mode).toBe(SearchMode.Idle);
        search.tick(LOST_AT + 60_000 + FIVE_MINUTES, HERE, LOST_AT);
        expect(search.mode).toBe(SearchMode.SkySearch);
    });
});
