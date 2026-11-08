import {afterEach, describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../harness/boot';
import {spooferAt} from '../../harness/gps';
import {pointFrom} from '../../harness/flight/geo';
import {messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {panelXml} from '../../harness/panelXml';
import {spooferPowerDb} from '../../../kln90b/GpsTransmitter';
import {SpooferSite} from '../../../kln90b/failures/Transmitters';

// #471, antennaGain: the antenna's gain is low, so every satellite's SNR is lower by the drawn loss, 6 to 15 dB (IM C-7;
// KLN 900 Pilot's Guide B-6). The loss lowers the received signals only: a spoofer's fake satellites arrive through the
// same antenna, and the noise floor is not raised

const HOME = {lat: 47, lon: 8};
const STORED_HOME = {lastLatitude: HOME.lat, lastLongitude: HOME.lon};
const JET_FT = 35_000;
/** The draw 6 + 0.5 * 9 */
const LOSS = 10.5;

afterEach(() => {
    vi.restoreAllMocks();
});

const gpsOf = (unit: HeadlessUnit) => unit.props.sensors.in.gps;
const prnsOf = (unit: HeadlessUnit) => gpsOf(unit).gpsSatComputer.getSatellites().map(s => s.prn);

function snrs(unit: HeadlessUnit): Map<number, number> {
    const gps = gpsOf(unit);
    return new Map(prnsOf(unit).map(prn => [prn, gps.signals.snr(prn)]));
}

describe('antennaGain (#471)', () => {
    it('lowers every satellite SNR by the loss, shows it on STA 1, posts no message and no TEST FAIL, and a repair restores it', async () => {
        const unit = await bootUnit({storage: STORED_HOME});
        await settle(unit);
        const gps = gpsOf(unit);
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        await untilCalcTick(unit);
        const before = snrs(unit);
        expect(Math.max(...before.values())).toBeGreaterThan(30); // Precondition: real signals
        gps.failures.receiverErrors.random = () => 0.5;

        unit.props.failures.fail('antennaGain');
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(250);

        expect(gps.failures.receiverErrors.antennaLossDb).toBeCloseTo(LOSS, 9); // Precondition
        const after = snrs(unit);
        for (const [prn, snr] of before) {
            expect(after.get(prn)).toBeCloseTo(snr - LOSS, 6);
        }
        expect(messages(unit)).toEqual([]);
        expect(gps.failures.receiverErrors.code).toBe(0);
        expect(unit.errors).toEqual([]);

        unit.props.failures.repair('antennaGain');
        await untilCalcTick(unit);
        for (const [prn, snr] of before) {
            expect(gps.signals.snr(prn)).toBeCloseTo(snr, 6);
        }
    }, 300_000);

    it('STA 1 shows the lower SNRs', async () => {
        const unit = await bootUnit({storage: STORED_HOME});
        await settle(unit);
        const gps = gpsOf(unit);
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        await unit.panel.selectPage('L', 'STA 1');
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(250);
        const snrOfFirst = () => Number(Screen.read().rows('L')[2].slice(5, 7));
        const rowBefore = Screen.read().rows('L')[2];
        const prn = Number(rowBefore.slice(1, 3));
        const shown = snrOfFirst();
        expect(Math.round(gps.signals.snr(prn))).toBe(shown); // Precondition: the row shows the SNR as a whole number

        gps.failures.receiverErrors.random = () => 0.5;
        unit.props.failures.fail('antennaGain');
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(250);

        const row = Screen.read().rows('L')[2];
        expect(Number(row.slice(1, 3))).toBe(prn);
        expect(Math.abs(snrOfFirst() - (shown - LOSS))).toBeLessThanOrEqual(1);
    }, 300_000);

    it('lowers a spoofer\'s fake satellites by the loss', async () => {
        const p = pointFrom(HOME, 90, 258);
        const f = pointFrom(p, 20, 80);
        const site: SpooferSite = {lat: p.lat, lon: p.lon, powerDb: spooferPowerDb(300), refAglFt: JET_FT, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs: 2 * 3600 * 1000, clockM: 30_000};
        const unit = await bootUnit({
            panelXml: panelXml({}), altitudeFt: JET_FT, storage: {...STORED_HOME, ...spooferAt(site)},
            simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: JET_FT}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
        });
        await settle(unit);
        const gps = gpsOf(unit);
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        gps.fakeReceiver.jitterScale = 0;
        await untilCalcTick(unit);
        const fake: number[] = [];
        for (let prn = 1; prn < 256; prn++) {
            if (gps.fakeReceiver.snr(prn) > 0) {
                fake.push(prn);
            }
        }
        expect(fake.length).toBeGreaterThan(0); // Precondition: fake satellites are sent
        const before = fake.map(prn => gps.fakeReceiver.snr(prn));
        gps.failures.receiverErrors.random = () => 0.5;

        unit.props.failures.fail('antennaGain');
        await untilCalcTick(unit);

        fake.forEach((prn, i) => expect(gps.fakeReceiver.snr(prn)).toBeCloseTo(before[i] - LOSS, 6));
    }, 300_000);
});
