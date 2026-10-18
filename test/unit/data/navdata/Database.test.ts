import {beforeEach, describe, expect, it} from 'vitest';
import {FacilityLoader} from '@microsoft/msfs-sdk';
import {Database} from '../../../../kln90b/data/navdata/Database';
import {TimeStamp} from '../../../../kln90b/data/Time';
import {Sensors} from '../../../../kln90b/Sensors';
import {simEnv} from '../../../harness/sim/install';
import {clearStatic} from '../../../harness/singletons';

// AIRAC cycle 2605 is effective 14 MAY 2026; the next cycle, 2606, is effective 11 JUN 2026 (28 days later, counted
// from the SDK's datum cycle 2401 of 25 JAN 2024). The sim reports a cycle as "<effective><next effective>/<year>".
const CYCLE_2605 = 'MAY14JUN11/26';

const at = (iso: string) => TimeStamp.create(Date.parse(iso));

let sensors: Sensors;

beforeEach(() => {
    // The SDK caches the cycle of the first call for the life of the module
    clearStatic(FacilityLoader, 'databaseCycleCache', false);
    simEnv().sim.reset();
    simEnv().sim.gameVars.set('FLIGHT NAVDATA DATE RANGE', CYCLE_2605);
    sensors = {in: {gps: {timeZulu: at('2026-06-01T12:00:00Z')}}} as unknown as Sensors;
});

describe('Database validity', () => {
    // 2-3: the unit uses a database up to the effective date of the next one. 3-7: the Database page shows EXPIRES
    // while it is current and EXPIRED after.
    it('is current from the effective date through the last day of the cycle (2-3)', () => {
        const db = new Database(sensors);

        expect(db.isAiracCurrent(at('2026-05-14T00:01:00Z'))).toBe(true);
        expect(db.isAiracCurrent(at('2026-06-10T23:59:00Z'))).toBe(true);
    });

    it('is out of date from the effective date of the next cycle (2-3)', () => {
        const db = new Database(sensors);

        expect(db.isAiracCurrent(at('2026-06-11T00:01:00Z'))).toBe(false);
        expect(db.isAiracCurrent(at('2027-01-01T00:00:00Z'))).toBe(false);
    });

    it('judges the GPS time when no time is given (characterization)', () => {
        const db = new Database(sensors);
        expect(db.isAiracCurrent()).toBe(true);

        sensors.in.gps.timeZulu = at('2026-06-11T00:01:00Z');

        expect(db.isAiracCurrent()).toBe(false);
    });
});

describe('Database expiration date', () => {
    // 2-3: the old data are used up to the effective date of the next cycle, so the last valid day is the day before it
    // (10 JUN for a cycle whose successor is effective 11 JUN; that reading is our own, the guide gives no example
    // for it). 3-7 and figure 2-4 on 2-5 show this field on the Database page as EXPIRES, then EXPIRED once it has passed.
    it('is the last day of the cycle (2-3, 3-7)', () => {
        const db = new Database(sensors);

        expect(db.expirationDateString.substring(0, 6)).toBe('10 JUN');
    });

    // Figure 2-4 (on 2-5) and figures 3-24 and 3-25 (3-7) show a two-digit year. The test above holds the day and month.
    it('shows the expiry with a two-digit year (2-5, 3-7, #199)', () => {
        const db = new Database(sensors);

        expect(db.expirationDateString).toBe('10 JUN 26');
    });

    // The year is the year of the expiry date, not that of the cycle number: cycle 2513 expires on 20 JAN 2026
    it('shows the year of the expiry date for a cycle that expires in the following year (#199)', () => {
        clearStatic(FacilityLoader, 'databaseCycleCache', false);
        simEnv().sim.gameVars.set('FLIGHT NAVDATA DATE RANGE', 'DEC24JAN21/26');

        expect(new Database(sensors).expirationDateString).toBe('20 JAN 26');
    });

    it('pads the year to two digits (characterization)', () => {
        clearStatic(FacilityLoader, 'databaseCycleCache', false);
        simEnv().sim.gameVars.set('FLIGHT NAVDATA DATE RANGE', 'MAY14JUN11/09');

        expect(new Database(sensors).expirationDateString).toBe('10 JUN 09');
    });
});
