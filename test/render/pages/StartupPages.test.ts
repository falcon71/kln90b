import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, BootOptions, HeadlessUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

// The pages between the approval of the Self Test page and the first main page (3-7, 3-8): the VFR only page, the OBS
// warning and the Database page with ACKNOWLEDGE?, then NAV 2 on the left. The self-test values themselves are in
// SelfTestLeftPage.test.ts and SelfTestRightPage.test.ts; the right page after the start-up is in PageManager.test.ts.

const VFR_ONLY = '<VFROnly>true</VFROnly>';
const OBS_SWITCH = '<Input><ExternalSwitches><LegObsSwitchInstalled>true</LegObsSwitchInstalled></ExternalSwitches>'
    + '</Input>';
const panelXml = (...parts: string[]) =>
    `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>${parts.join('')}</Instrument></PlaneHTMLConfig>`;

/** The fake clock's navdata cycle ends in June 2026 (DEFAULT_NAVDATA_RANGE): a start in July has an expired database */
const AFTER_CYCLE = new Date('2026-07-01T12:00:00Z');

/** Cold and dark, switched on, through the Turn-On page, then ENT on APPROVE? of the Self Test page */
async function approveSelfTestPage(opts: BootOptions = {}): Promise<HeadlessUnit> {
    const unit = await bootToSelfTest(opts);
    await unit.panel.cursorTo('R', 'APPROVE?');
    await unit.panel.ent();
    return unit;
}

/** The six rows of the full-width page, trimmed */
const pageRows = () => Screen.read().text().split('\n').slice(0, 6).map(r => r.trim());

/** The characters of a full-width row that are shown inverse: the field under the cursor */
function inverseText(row: number): string {
    const s = Screen.read();
    const text = s.row(row);
    const mask = s.mask().split('\n')[row];
    return [...text].filter((_, i) => mask[i] === 'I').join('');
}

describe('Database page (3-7)', () => {
    // 3-7 step 12, figure 3-24: line 2 says the data base expires, line 3 gives the date, and the cursor is on
    // ACKNOWLEDGE?. The status line shows the mode, a flashing ENT and CRSR on the right (figure 3-24; 3-10 for ENT).
    // Line 1 (the coverage area) and the year of line 3 (#199) are not asserted here.
    it('shows the expiry of a current data base with the cursor on ACKNOWLEDGE? (3-7)', async () => {
        const unit = await approveSelfTestPage();

        const rows = pageRows();
        expect(rows[1]).toBe('DATA BASE EXPIRES');
        expect(rows[2].startsWith('11 JUN')).toBe(true);
        expect(rows.slice(3)).toEqual(['', '', 'ACKNOWLEDGE?']);
        expect(inverseText(5)).toBe('ACKNOWLEDGE?');
        expect(Screen.read().status()).toEqual({left: '', mode: 'enr-leg ent', right: 'CRSR'});
        expect(unit.errors).toEqual([]);
    });

    // 3-7 step 12, figure 3-25: an expired data base says EXPIRED, gives the date it expired, and adds that all data
    // must be confirmed before use
    it('shows the date an expired data base expired and the warning (3-7)', async () => {
        const unit = await approveSelfTestPage({start: AFTER_CYCLE, storage: {lastLatitude: 47, lastLongitude: 8}});

        const rows = pageRows();
        expect(rows[1]).toBe('DATA BASE EXPIRED');
        expect(rows[2].startsWith('11 JUN')).toBe(true);
        expect(rows.slice(3)).toEqual(['ALL DATA MUST BE', 'CONFIRMED BEFORE USE', 'ACKNOWLEDGE?']);
        expect(inverseText(5)).toBe('ACKNOWLEDGE?');
        expect(unit.errors).toEqual([]);
    });

    // 3-7, figures 3-24 and 3-25: the date has a two-digit year. The sibling above holds the day and month.
    it.fails('shows the expiry date with a two-digit year (3-7, #199)', async () => {
        await approveSelfTestPage();

        expect(pageRows()[2]).toBe('11 JUN 26');
    });

    // 3-8: ENT on ACKNOWLEDGE? ends the start-up sequence; NAV 2 is shown on the left
    it('shows NAV 2 on the left after ACKNOWLEDGE? (3-7, 3-8)', async () => {
        const unit = await approveSelfTestPage();

        await unit.panel.ent();

        expect(Screen.read().status().left).toBe('NAV 2');
        expect(Screen.read().rows('L')[0]).toBe('PRESENT POS');
        expect(unit.errors).toEqual([]);
    });
});

describe('VFR only page (3-7)', () => {
    /**
     * The two texts of the page with their cells: the title on the second row, three cells in, and the button on the
     * sixth row, five cells in (figure 3-22 is not column-exact; the cells are the code's). The other rows are the
     * business of the #NEW-A-1 pin below
     */
    const expectVfrPage = () => {
        expect([Screen.read().row(1), Screen.read().row(5)])
            .toEqual(['   FOR VFR USE ONLY'.padEnd(23), '     ACKNOWLEDGE?'.padEnd(23)]);
    };

    // 3-7 step 11, figure 3-22: a unit installed for VFR only shows FOR VFR USE ONLY after APPROVE?, with the cursor on
    // ACKNOWLEDGE?; ENT leads on to the Database page (step 12)
    it('shows FOR VFR USE ONLY after APPROVE? and goes on to the Database page with ENT (3-7)', async () => {
        const unit = await approveSelfTestPage({panelXml: panelXml(VFR_ONLY)});

        expectVfrPage();
        expect(inverseText(5)).toBe('ACKNOWLEDGE?');

        await unit.panel.ent();

        expect(pageRows()[1]).toBe('DATA BASE EXPIRES');
        expect(unit.errors).toEqual([]);
    });

    // Figure 3-22: the page shows FOR VFR USE ONLY and ACKNOWLEDGE? and nothing else. VFROnlyPage.render has a comma
    // after a <br/>, which the page shows at the start of its fourth row. The sibling above holds the page itself.
    it.fails('shows nothing but FOR VFR USE ONLY and ACKNOWLEDGE? (3-7, #NEW-A-1)', async () => {
        await approveSelfTestPage({panelXml: panelXml(VFR_ONLY)});

        expect(pageRows().filter(r => r !== '')).toEqual(['FOR VFR USE ONLY', 'ACKNOWLEDGE?']);
    });

    // 3-7 step 11: on a VFR only unit with the external GPS CRS switch in OBS, the VFR only page comes first and the
    // OBS warning (figure 3-23) after its acknowledgement; the warning gives way to the Database page once the switch
    // is back in LEG. Figure 3-23 shows the OBS mode with its course on the status line and no ENT.
    it('shows the OBS warning after the VFR only page, then the Database page once the switch is in LEG '
        + '(3-7)', async () => {
        const unit = await bootToSelfTest({
            panelXml: panelXml(VFR_ONLY, OBS_SWITCH),
            storage: {lastLatitude: 47, lastLongitude: 8},
        });
        unit.env.sim.set('GPS OBS ACTIVE', 'bool', true);
        await unit.panel.cursorTo('R', 'APPROVE?');
        await unit.panel.ent();
        expectVfrPage();

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().text()).toContain('SYSTEM IS IN OBS MODE');
        expect(Screen.read().status().mode).toMatch(/^enr:\d{3}( msg)?$/); // no ent: nothing to approve

        unit.env.sim.set('GPS OBS ACTIVE', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(pageRows()[1]).toBe('DATA BASE EXPIRES');
        expect(unit.errors).toEqual([]);
    });
});

describe('messages at power-on (B-3, B-4)', () => {
    const messages = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

    // B-3: POSITION DIFFERS posts only when the first fix is more than 2 NM from the position at power-off; B-4: SYSTEM
    // TIME UPDATED only when the GPS moves the clock by more than 10 minutes. A cold-and-dark unit switched on where it
    // was switched off, with its clock right, therefore posts neither, and the status line shows no MSG (3-10).
    it('posts no message on a cold-and-dark start at the stored position (B-3, B-4, 3-10)', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {lastLatitude: 47, lastLongitude: 8}});
        await unit.panel.powerOn();
        await unit.panel.approveSelfTest();
        await settle(unit);

        expect(messages(unit)).toEqual([]);
        expect(Screen.read().status().mode).toBe('enr-leg');
        expect(unit.errors).toEqual([]);
    });

    // Sibling of the pin below: an engine-running boot at its stored position has a fix, shows the main page and, as
    // B-3 says for a position within 2 NM, does not post POSITION DIFFERS
    it('boots with the engine running at the stored position to NAV 2 with a fix and no POSITION DIFFERS '
        + '(B-3)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(messages(unit)).not.toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
        expect(Screen.read().status().left).toBe('NAV 2');
    });

    // B-4: the clock of a unit that was running all along needs no correction of more than 10 minutes. A flight started
    // with the engine running stands for a unit that is already on, but its clock starts one hour behind
    // (Gps.ts subtracts the hour PowerButton assumes the unit was off, and forceReadyToUse never adds it back), so
    // every such flight starts with SYSTEM TIME UPDATED TO GPS TIME and the MSG annunciator lit (testing.md section 6).
    it.fails('posts no message on an engine-running start at the stored position (B-3, B-4, #NEW-A-2)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);

        expect(messages(unit)).toEqual([]);
    });
});
