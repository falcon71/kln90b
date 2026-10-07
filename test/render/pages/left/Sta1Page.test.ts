import {describe, expect, it} from 'vitest';
import {GPSSatellite} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {DEFAULT_START} from '../../../harness/sim/clock';

// The STA 1 snapshot of a unit with a fix is in GpsAcquisition.test.ts (describe 'STA 1 page with a fix'), with the
// INIT state of a sky search; the receiver states are the question #215

/**
 * A cold-and-dark unit last used 3000 NM away (stored position 0/0) with slow acquisition, powered on: a sky search.
 * STA 1 is shown right after the self-test, before any satellite is acquired.
 */
async function skySearch(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        engineRunning: false,
        storage: {fastGpsAcquisition: false, lastLatitude: 0, lastLongitude: 0, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
    });
    await unit.panel.powerOn();
    await unit.panel.approveSelfTest();
    await unit.panel.selectPage('L', 'STA 1');
    return unit;
}

/** The satellite rows of both STA 1 pages (four on the first page, below the state and the header; the rest on the second) */
async function satelliteRows(unit: HeadlessUnit): Promise<string[]> {
    const first = Screen.read().rows('L').slice(2);
    await unit.panel.inner('L', 1);
    const second = Screen.read().rows('L').filter(r => r.trim() !== '');
    await unit.panel.inner('L', -1);
    return [...first, ...second];
}

/** The PRNs of the receiver's satellites below the horizon, from the SDK's zenith angle (above 90 degrees) */
function belowHorizon(unit: HeadlessUnit): number[] {
    const sats = unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
    return sats.filter(s => s.position.get()[0] > Math.PI / 2).map(s => s.prn).sort((a, b) => a - b);
}

/** The PRN and the ELE field of a satellite row ("*02  00 83°": PRN 2, ELE "83") */
const prnAndEle = (row: string): [number, string] => [Number(row.slice(1, 3)), row.slice(8, 10)];

describe('STA 1 page during a sky search', () => {
    // 5-30: a * before the satellite number means the satellite is not used in the position solution; during a sky
    // search no satellite is
    it('marks every satellite as not used in the solution during a sky search (5-30)', async () => {
        const unit = await skySearch();
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);

        const rows = await satelliteRows(unit);

        expect(rows.map(r => r[0])).toEqual(['*', '*', '*', '*', '*', '*', '*', '*']);
    });

    // 5-29: there are two STA 1 pages when more than four satellites are received, which the + in STA+1 shows
    it('has a second page, STA+1, with eight satellites (5-29)', async () => {
        const unit = await skySearch();

        expect(Screen.read().status().left).toBe('STA+1');
        expect((await satelliteRows(unit)).map(r => prnAndEle(r)[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    // The precondition of the #213 pin below, on the same sequence: during a sky search with no fix the receiver tracks
    // satellites that are below the horizon by the SDK's own zenith angle (with the seed and the ephemeris of the harness)
    it('characterization: the receiver tracks satellites below the horizon during a sky search (precondition of #213)', async () => {
        const unit = await skySearch();

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        expect(belowHorizon(unit)).toEqual([2, 3, 4, 5, 6, 7]);
    });

    // 5-30: the elevation column ranges from 5 to 90 degrees above the horizon; a satellite below the horizon has no
    // elevation of 5 degrees or more (today the page mirrors it: |90 - zenith|). A fix that printed a negative number
    // would make the row wider than the half page, Screen.read() would throw, and an it.fails swallows that: the pin
    // would stay green for the wrong reason, so the fix must show dashes (or a clamp) below 5 degrees
    it.fails('shows no elevation of 5 degrees or more for a satellite below the horizon (5-30, #213)', async () => {
        const unit = await skySearch();
        const below = belowHorizon(unit);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => below.includes(prn));

        expect(shown.filter(([, ele]) => /^\d\d$/.test(ele) && Number(ele) >= 5)).toEqual([]);
    });
});
