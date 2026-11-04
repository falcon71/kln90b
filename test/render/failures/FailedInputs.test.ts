import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {AIRDATA, fuelComputer, NO_ALTIMETER, panelXml} from '../../harness/panelXml';
import {Screen} from '../../harness/render/screen';
import {recordMap} from '../../harness/render/mapRecorder';
import {standardRoute} from '../../harness/fixtures';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {storedSetting} from '../../harness/storage';
import {showSuperNav5, SuperNav5} from '../../harness/render/superNav5';
import {courseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {moveAircraft} from '../../harness/boot';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

/**
 * #458: a failed input port reports it is not receiving, and its readers treat the value as missing (docs/failures.md,
 * "RS-232 input", "ARINC 429 air data receiver", "Altitude encoder", "OBS resolver"; the design
 * docs/superpowers/specs/2026-11-04-failures-framework-design.md, "The readers of a failed input").
 */

const RS232_AIRDATA = panelXml({...AIRDATA, 'Input.Airdata.BaroSource': 1});

describe('a failed gray code input (#458)', () => {
    // docs/failures.md, "Altitude encoder": the pressure altitude is missing and the receiver loses the altitude aiding
    it('a failed gray code takes the altitude and its aiding away', async () => {
        const unit = await bootUnit(); // The default installation has the encoding altimeter
        unit.env.sim.set('PRESSURE ALTITUDE', 'feet', 3000);
        await settle(unit);
        // Preconditions: the altitude arrives and aids the receiver
        expect(unit.props.sensors.in.airdata.pressureAltitude).toBe(3000);
        expect(unit.props.sensors.in.gps.solution.altitudeAided).toBe(true);

        unit.props.failures.fail('altitude');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.airdata.pressureAltitude).toBeNull();
        expect(unit.props.sensors.in.gps.solution.altitudeAided).toBe(false);
    });

    // The failure is not effective without the part (Failures.isEligible): without an altimeter there is nothing to take away
    it('does not change an installation without the altimeter', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_ALTIMETER)});
        await settle(unit);

        unit.props.failures.fail('altitude');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.airdata.pressureAltitude).toBeNull();
        expect(unit.props.sensors.in.gps.solution.altitudeAided).toBe(false);
    });

    it('the repair brings the altitude back at the next tick', async () => {
        const unit = await bootUnit();
        unit.env.sim.set('PRESSURE ALTITUDE', 'feet', 3000);
        await settle(unit);
        unit.props.failures.fail('altitude');
        await vi.advanceTimersByTimeAsync(2500);
        expect(unit.props.sensors.in.airdata.pressureAltitude).toBeNull(); // Precondition

        unit.props.failures.repair('altitude');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.airdata.pressureAltitude).toBe(3000);
        expect(unit.props.sensors.in.gps.solution.altitudeAided).toBe(true);
    });
});

describe('a failed RS-232 input (#458)', () => {
    // docs/failures.md, "RS-232 input": the unit behaves as if no baro were transmitted, the barometer keeps its last value
    it('a failed RS-232 input keeps the baro', async () => {
        const unit = await bootUnit({panelXml: RS232_AIRDATA});
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.5);
        await settle(unit);
        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(29.5, 2); // Precondition

        unit.props.failures.fail('rs232In');
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 30.1);
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(29.5, 2);
    });

    it('RS-232 data errors keep the baro as well', async () => {
        const unit = await bootUnit({panelXml: RS232_AIRDATA});
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.5);
        await settle(unit);

        unit.props.failures.fail('rs232Data');
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 30.1);
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(29.5, 2);
    });

    it('takes the RS-232 air data away', async () => {
        const unit = await bootUnit({panelXml: RS232_AIRDATA});
        unit.env.sim.set('PRESSURE ALTITUDE', 'feet', 3000);
        unit.env.sim.set('AIRSPEED TRUE', 'knots', 120);
        unit.env.sim.set('AIRSPEED MACH', 'mach', 0.18);
        unit.env.sim.set('AMBIENT TEMPERATURE', 'celsius', 5);
        unit.env.sim.set('TOTAL AIR TEMPERATURE', 'celsius', 8);
        await settle(unit);
        const a = unit.props.sensors.in.airdata;
        expect([a.pressureAltitude, a.tas, a.mach, a.sat, a.tat]).toEqual([3000, 120, 0.18, 5, 8]); // Precondition

        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect([a.pressureAltitude, a.tas, a.mach, a.sat, a.tat]).toEqual([null, null, null, null, null]);
    });

    it('a failed RS-232 heading draws the map north up', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({
            panelXml: panelXml({'Input.HeadingInput': true, 'Input.HeadingInterface': 'RS232'}),
            storage: {nav5MapOrientation: 3},
        });
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 90);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.headingGyro).toBe(90); // Precondition

        unit.props.failures.fail('rs232In');
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.sensors.in.headingGyro).toBeNull();
        expect(map.drawn).toContain('icon $ AC'); // north up draws the plane symbol $, a rotated map #
        expect(map.drawn).not.toContain('icon # AC');
        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('N^  '); // as without a heading input (#368)
        expect(storedSetting(unit, 'nav5MapOrientation')).toBe(3);
    });

    it('takes the transmitted fuel values away', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(fuelComputer({fuelUsed: true})),
            simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 2}],
        });
        unit.env.sim.set('FUEL TOTAL QUANTITY WEIGHT EX1', 'pounds', 600);
        unit.env.sim.set('ENG FUEL FLOW PPH:1', 'pounds per hour', 90);
        unit.env.sim.set('ENG FUEL FLOW PPH:2', 'pounds per hour', 84);
        unit.env.sim.set('GENERAL ENG FUEL USED SINCE START:1', 'pounds', 12);
        unit.env.sim.set('GENERAL ENG FUEL USED SINCE START:2', 'pounds', 6);
        await settle(unit);
        const f = unit.props.sensors.in.fuelComputer;
        expect([f.fob, f.fuelFlow1, f.fuelFlow2, f.fuelUsed1, f.fuelUsed2].map(v => v !== null && v > 0)).toEqual([true, true, true, true, true]);

        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect([f.fob, f.fuelFlow1, f.fuelFlow2, f.fuelUsed1, f.fuelUsed2]).toEqual([null, null, null, null, null]);
    });

    // A FOB the pilot entered is not a received value (Input.FuelComputer.FOBTransmitted false)
    it('keeps a FOB the pilot entered', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(fuelComputer({fob: false})),
            simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 1}],
        });
        await settle(unit);
        unit.props.sensors.in.fuelComputer.fob = 40;

        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.fuelComputer.fob).toBe(40);
        expect(unit.props.sensors.in.fuelComputer.fuelFlow1).toBeNull();
    });

    // A single engine has no second fuel flow: it stays 0 over the failure, so the total comes back with the repair.
    // 60 pph of avgas at 6 lb per US gallon is 10 GAL/HR (as in Oth7Page.test.ts)
    it('the repair brings the total fuel flow of a single engine back', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(fuelComputer()),
            simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 1}],
        });
        unit.env.sim.set('ENG FUEL FLOW PPH:1', 'pounds per hour', 60);
        await settle(unit);
        await unit.panel.selectPage('L', 'OTH 7');
        await vi.advanceTimersByTimeAsync(1500);
        expect(Screen.read().rows('L')[5]).toBe('       10  '); // Precondition
        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);
        expect(unit.props.sensors.in.fuelComputer.getTotalFuelFlow()).toBeNull(); // Precondition

        unit.props.failures.repair('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.fuelComputer.getTotalFuelFlow()).toBeCloseTo(10, 6);
        expect(Screen.read().rows('L')[5]).toBe('       10  ');
    });

    it('the repair brings the values back at the next tick', async () => {
        const unit = await bootUnit({panelXml: RS232_AIRDATA});
        unit.env.sim.set('AIRSPEED TRUE', 'knots', 120);
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.5);
        await settle(unit);
        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);
        expect(unit.props.sensors.in.airdata.tas).toBeNull(); // Precondition

        unit.props.failures.repair('rs232In');
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 30.1);
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.airdata.tas).toBe(120);
        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(30.1, 2);
    });
});

describe('a failed ARINC 429 air data receiver (#458)', () => {
    const ARINC_AIRDATA = panelXml({...AIRDATA, 'Input.Airdata.Interface': 'ARINC429', 'Input.Airdata.BaroSource': 1});

    it('takes the air data away and keeps the baro, which always comes over RS-232', async () => {
        const unit = await bootUnit({panelXml: ARINC_AIRDATA});
        unit.env.sim.set('AIRSPEED TRUE', 'knots', 120);
        unit.env.sim.set('PRESSURE ALTITUDE', 'feet', 3000);
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.5);
        await settle(unit);
        expect(unit.props.sensors.in.airdata.tas).toBe(120); // Precondition

        unit.props.failures.fail('airdata429');
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 30.1);
        await vi.advanceTimersByTimeAsync(2500);

        const a = unit.props.sensors.in.airdata;
        expect([a.pressureAltitude, a.tas, a.mach, a.sat, a.tat]).toEqual([null, null, null, null, null]);
        expect(a.barometer).toBeCloseTo(30.1, 2);
    });
});

describe('a failed OBS resolver (#458)', () => {
    // docs/failures.md, "OBS resolver": the unit behaves as with ObsSource 0, the course is set on the unit. The page
    // field is the one of Mod2Page.test.ts with ObsSource 0: the colon after OBS
    it('a failed OBS resolver lets the pilot set the course', async () => {
        const unit = await bootOnStandardRoute();
        unit.env.sim.set('Nav OBS:1', 'degrees', 70);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(unit.props.sensors.in.obsMag).toBe(70); // Precondition: the unit reads the indicator
        expect(Screen.read().rows('L')[3]).toMatch(/^OBS 070°/); // no colon: the course is not set on the unit

        unit.props.failures.fail('obsResolver');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.obsMag).toBeNull();
        expect(Screen.read().rows('L')[3]).toMatch(/^OBS:/); // the colon: the course is entered on the unit
    });

    it('the repair brings the course back at the next tick', async () => {
        const unit = await bootOnStandardRoute();
        unit.env.sim.set('Nav OBS:1', 'degrees', 70);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        unit.props.failures.fail('obsResolver');
        await vi.advanceTimersByTimeAsync(2500);
        expect(unit.props.sensors.in.obsMag).toBeNull(); // Precondition

        unit.props.failures.repair('obsResolver');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.props.sensors.in.obsMag).toBe(70);
    });
});

// A failed RS-232 heading behaves as without a heading input (docs/failures.md, "RS-232 input"): every consumer that keys
// on the presence of the heading asks SensorsIn.isHeadingAvailable
describe('a failed RS-232 heading behaves as without a heading input (#458)', () => {
    const HEADING_XML = panelXml({'Input.HeadingInput': true, 'Input.HeadingInterface': 'RS232'});

    it('Super NAV 5 draws north up, shows N^ in the orientation field and keeps the stored HDG up', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({panelXml: HEADING_XML, storage: {superNav5MapOrientation: 3}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 90);
        await vi.advanceTimersByTimeAsync(2000);
        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2000);
        await showSuperNav5(unit);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.cursor('R');

        expect(map.drawn).toContain('icon $ AC');
        expect(map.drawn).not.toContain('icon # AC');
        expect(SuperNav5.read().right![3].slice(-3)).toBe(' N^');
        expect(storedSetting(unit, 'superNav5MapOrientation')).toBe(3);
    });

    it('OTH 9 shows the wind as without a heading input, the TAS stays', async () => {
        const unit = await bootUnit({panelXml: panelXml({...AIRDATA, ...fuelComputer(), 'Input.HeadingInput': true,
            'Input.HeadingInterface': 'RS232', 'Input.Airdata.Interface': 'ARINC429'})});
        unit.env.sim.set('AIRSPEED TRUE', 'knots', 100);
        unit.env.sim.set('AIRSPEED MACH', 'mach', 0.15);
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 350);
        await settle(unit);
        await unit.panel.selectPage('L', 'OTH 9');
        await vi.advanceTimersByTimeAsync(1500);
        expect(Screen.read().rows('L')[3]).toMatch(/^[HT]DWND/); // Precondition: the wind rows

        unit.props.failures.fail('rs232In');
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 10);
        await unit.panel.selectPage('L', 'OTH10'); // The page is rebuilt on every knob step
        await unit.panel.selectPage('L', 'OTH 9');
        await vi.advanceTimersByTimeAsync(2500);

        expect(Screen.read().rows('L').slice(1)).toEqual(['TAS   100kt', 'MACH    .15', '           ', '           ', '           ']);
    });

    // The page keeps the layout it was built with; a heading lost while it is shown must not leave the last wind on it.
    // The wind: TAS 100 kt on the true heading 000 (350 magnetic, 10 E), ground 83.282 kt on 353.103 true, so a wind
    // from 030 at 20 kt and a headwind of 17 kt (the vector sum, by hand, as in Oth9Page.test.ts)
    it('OTH 9 dashes the wind when the heading fails while it is shown, and shows it again at the repair', async () => {
        const unit = await bootUnit({panelXml: panelXml({...AIRDATA, ...fuelComputer(), 'Input.HeadingInput': true,
            'Input.HeadingInterface': 'RS232', 'Input.Airdata.Interface': 'ARINC429'}), magvar: 10});
        unit.env.sim.set('AIRSPEED TRUE', 'knots', 100);
        unit.env.sim.set('AIRSPEED MACH', 'mach', 0.15);
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 350);
        await settle(unit);
        await moveAircraft(unit, {lat: 47.02, lon: 8.0}, {groundspeedKt: 83.282, trackTrue: 353.103});
        await unit.panel.selectPage('L', 'OTH 9');
        await vi.advanceTimersByTimeAsync(1500);
        const WIND = ['HDWND  17kt', 'WIND  030°¥', '       20kt'];
        expect(Screen.read().rows('L').slice(3)).toEqual(WIND); // Precondition

        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect(Screen.read().rows('L').slice(1)).toEqual(['TAS   100kt', 'MACH    .15', 'HDWND ---kt', 'WIND  ---°¥', '      ---kt']);

        unit.props.failures.repair('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(3)).toEqual(WIND);
    });

    // CAL 3 computes with the heading its layout shows: the stored HDG of 040 while the input is lost, the gyro's again
    // at the repair. TAS 100 kt, ground 120 kt on 000 true, gyro 000: a tailwind of 20 kt from 180. With the stored 040
    // the air vector is N 76.604, E 64.279, so the wind blows N 43.396, E -64.279: 77.6 kt from 124 true, 84 degrees off
    // the heading, a headwind of 77.6 cos 84 = 8.1 kt (by hand)
    it('CAL 3 asks for the heading when it fails while the page is shown, and drops the field at the repair', async () => {
        const unit = await bootUnit({panelXml: HEADING_XML, storage: {cal3HeadingMag: 40}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 0);
        await settle(unit);
        await moveAircraft(unit, {lat: 47.0, lon: 8.0}, {groundspeedKt: 120, trackTrue: 0});
        await unit.panel.selectPage('L', 'CAL 3');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // TAS 100 kt
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1500);
        expect(Screen.read().rows('L').slice(1)).toEqual(['TAS   100kt', '           ', 'TLWND  20kt', 'WIND  180°¥', '       20kt']); // Precondition

        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect(Screen.read().rows('L').slice(1)).toEqual(['TAS   100kt', 'HDG    040°', 'HDWND   8kt', 'WIND  124°¥', '       78kt']);

        unit.props.failures.repair('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(1)).toEqual(['TAS   100kt', '           ', 'TLWND  20kt', 'WIND  180°¥', '       20kt']);
    });

    // The HDG field of CAL 3 is read-only exactly while the heading arrives (5-12), also when that changes under the page
    it('CAL 3 lets the pilot enter the HDG once the heading fails while the page is shown, and not after the repair', async () => {
        const unit = await bootUnit({panelXml: HEADING_XML, storage: {cal3HeadingMag: 40}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 0);
        await settle(unit);
        await unit.panel.selectPage('L', 'CAL 3');
        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);
        expect(Screen.read().rows('L')[2]).toBe('HDG    040°'); // Precondition

        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', '04');
        await unit.panel.inner('L', 1);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'cal3HeadingMag')).toBe(50);
        expect(Screen.read().rows('L')[2]).toBe('HDG    050°');

        unit.props.failures.repair('rs232In');
        await vi.advanceTimersByTimeAsync(2500);
        await unit.panel.cursor('L');

        await expect(unit.panel.cursorTo('L', '05')).rejects.toThrow(/no field "05"/);
        expect(unit.errors).toEqual([]);
    });

    it('CAL 3 asks for the heading again, as without a heading input', async () => {
        const unit = await bootUnit({panelXml: HEADING_XML, storage: {cal3HeadingMag: 40}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 90);
        await settle(unit);
        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);
        await unit.panel.selectPage('L', 'CAL 3');
        await vi.advanceTimersByTimeAsync(1500);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('HDG    040°');
    });

    it('gives no roll steering', async () => {
        const {kaaa, abc} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(onLeg, abc);
        const unit = await bootOnStandardRoute({magvar: 0, panelXml: HEADING_XML});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', dtk);
        await moveAircraft(unit, pointFrom(onLeg, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeGreaterThan(0); // Precondition: left bank

        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(2500);

        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });
});
