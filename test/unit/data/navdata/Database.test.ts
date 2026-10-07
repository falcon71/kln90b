import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, FacilityLoader} from '@microsoft/msfs-sdk';
import {Database} from '../../../../kln90b/data/navdata/Database';
import {MessageHandler, OneTimeMessage} from '../../../../kln90b/data/MessageHandler';
import {TimeStamp} from '../../../../kln90b/data/Time';
import {Sensors} from '../../../../kln90b/Sensors';
import {GPSEvents} from '../../../../kln90b/Gps';
import {simEnv} from '../../../harness/sim/install';
import {clearStatic} from '../../../harness/singletons';

// AIRAC cycle 2605 is effective 14 MAY 2026; the next cycle, 2606, is effective 11 JUN 2026 (28 days later, counted
// from the SDK's datum cycle 2401 of 25 JAN 2024). The sim reports a cycle as "<effective><next effective>/<year>".
const CYCLE_2605 = 'MAY14JUN11/26';

const at = (iso: string) => TimeStamp.create(Date.parse(iso));

let bus: EventBus;
let handler: MessageHandler;
let sensors: Sensors;

beforeEach(() => {
    // The SDK caches the cycle of the first call for the life of the module
    clearStatic(FacilityLoader, 'databaseCycleCache', false);
    simEnv().sim.reset();
    simEnv().sim.gameVars.set('FLIGHT NAVDATA DATE RANGE', CYCLE_2605);
    bus = new EventBus();
    handler = new MessageHandler();
    sensors = {in: {gps: {timeZulu: at('2026-06-01T12:00:00Z')}}} as unknown as Sensors;
});

describe('Database validity', () => {
    // 2-3: the unit uses a database up to the effective date of the next one. 3-7: the Database page shows EXPIRES
    // while it is current and EXPIRED after.
    it('is current from the effective date through the last day of the cycle (2-3)', () => {
        const db = new Database(bus, sensors, handler);

        expect(db.isAiracCurrent(at('2026-05-14T00:01:00Z'))).toBe(true);
        expect(db.isAiracCurrent(at('2026-06-10T23:59:00Z'))).toBe(true);
    });

    it('is out of date from the effective date of the next cycle (2-3)', () => {
        const db = new Database(bus, sensors, handler);

        expect(db.isAiracCurrent(at('2026-06-11T00:01:00Z'))).toBe(false);
        expect(db.isAiracCurrent(at('2027-01-01T00:00:00Z'))).toBe(false);
    });

    it('judges the GPS time when no time is given (characterization)', () => {
        const db = new Database(bus, sensors, handler);
        expect(db.isAiracCurrent()).toBe(true);

        sensors.in.gps.timeZulu = at('2026-06-11T00:01:00Z');

        expect(db.isAiracCurrent()).toBe(false);
    });
});

describe('Database expiration date', () => {
    // 2-4: figure 2-4 shows the date as 17 AUG 94, the day before the AIRAC date 18 AUG 1994, so the page shows the
    // last day of validity. 3-7 shows the same field on the Database page.
    it('is the last day of the cycle (2-4, 3-7)', () => {
        const db = new Database(bus, sensors, handler);

        expect(db.expirationDateString.substring(0, 6)).toBe('10 JUN');
    });

    // Figures 2-4, 3-24 and 3-25 show a two-digit year. 22b4532 changed the format from the two digits of the sim's
    // range to {YYYY}. The test above is the passing sibling: the day and month are right.
    it.fails('shows the expiry with a two-digit year (2-4, 3-7, #NEW-1-2)', () => {
        const db = new Database(bus, sensors, handler);

        expect(db.expirationDateString).toBe('10 JUN 26');
    });
});

describe('DATA BASE OUT OF DATE on a time update', () => {
    const TEXT = ['DATA BASE OUT OF DATE', 'ALL DATA MUST BE', 'CONFIRMED BEFORE USE'];
    const posted = () => handler.getMessages().map(m => (m as OneTimeMessage).message);

    // B-2: the message appears when the database is out of date because of a date entered on SET 2 or the Self Test
    // page, or a pilot-entered date overridden by the GPS date. Both publish timeUpdatedEvent (Set2Page, Gps).
    it('is posted when the new time is past the expiration (B-2)', () => {
        new Database(bus, sensors, handler);

        bus.getPublisher<GPSEvents>().pub('timeUpdatedEvent', at('2026-06-11T00:01:00Z'));

        expect(posted()).toEqual([TEXT]);
    });

    it('is not posted for a time inside the cycle (B-2)', () => {
        new Database(bus, sensors, handler);

        bus.getPublisher<GPSEvents>().pub('timeUpdatedEvent', at('2026-06-10T23:59:00Z'));

        expect(posted()).toEqual([]);
    });
});
