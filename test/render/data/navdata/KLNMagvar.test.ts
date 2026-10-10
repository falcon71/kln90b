import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {NO_OBS, panelXml} from '../../../harness/panelXml';
import {activeIdent, messages} from '../../../harness/readers';
import {finalCourseDeg} from '../../../harness/flight/geo';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const MAGVAR_INVALID = 'MAGNETIC VAR INVALID ALL DATA REFERENCED TO TRUE NORTH';

/** The TK row of NAV 3 */
async function nav3Track(unit: HeadlessUnit): Promise<string> {
    return (await unit.panel.show('L', 'NAV 3'))[2];
}

// 3-1 and 5-44: the primary coverage area, with the magnetic variation of the database, runs from N 74 to S 60. The N 74
// side is in PersistentMessages.test.ts.
describe('MAGNETIC VAR INVALID at the southern limit (3-1, 5-44, B-2)', () => {
    it('shows at S 60.5 (3-1, 5-44, B-2)', async () => {
        const unit = await bootUnit({position: {lat: -60.5, lon: 8.0}});
        await settle(unit);

        expect(messages(unit)).toContain(MAGVAR_INVALID);
    });

    it('does not show at S 59.5 (3-1, 5-44, B-2)', async () => {
        const unit = await bootUnit({position: {lat: -59.5, lon: 8.0}});
        await settle(unit);

        expect(messages(unit)).not.toContain(MAGVAR_INVALID);
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });
});

// 5-44: outside the primary coverage area all navigation data is referenced to true north, unless the pilot enters a
// magnetic variation on SET 2. The world's variation is 10 E everywhere, so a magnetic track is the true track less 10.
// The unit settles inside the area first, so that it has a database variation to lose.
describe('the reference of the displayed track outside the coverage area', () => {
    async function flownOut() {
        const unit = await bootUnit({position: {lat: 73.5, lon: 8.0}, magvar: 10});
        await settle(unit);
        await moveAircraft(unit, {lat: 73.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});
        expect(await nav3Track(unit)).toBe('TK     080°'); // Inside: magnetic, 090 true less 10 E
        await moveAircraft(unit, {lat: 74.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});
        return unit;
    }

    it('shows the track true outside the area (5-44)', async () => {
        const unit = await flownOut();

        expect(await nav3Track(unit)).toBe('TK     090°');
    });

    it('shows the track with the variation the pilot entered on SET 2 (5-44)', async () => {
        const unit = await flownOut();
        // What MagvarEditor on SET 2 line 6 stores for 5 E (east positive, see the west case in PersistentMessages)
        unit.props.memory.navPage.userMagvar = 5;
        await vi.advanceTimersByTimeAsync(1000);

        expect(await nav3Track(unit)).toBe('TK     085°');
        expect(messages(unit)).not.toContain(MAGVAR_INVALID);
    });

    // KLNMagvar.tick sets the pilot's variation to 0 on every tick inside the area, so a variation entered outside is
    // gone after a visit inside
    it('forgets the pilot-entered variation once back inside the area (characterization)', async () => {
        const unit = await flownOut();
        unit.props.memory.navPage.userMagvar = 5;
        await moveAircraft(unit, {lat: 73.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 270});
        expect(unit.props.memory.navPage.userMagvar).toBe(0);

        await moveAircraft(unit, {lat: 74.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});

        expect(messages(unit)).toContain(MAGVAR_INVALID);
        expect(await nav3Track(unit)).toBe('TK     090°');
    });
});

// 5-44: the same holds in OBS mode while the active waypoint lies outside the area, even with the aircraft inside it.
// KFAR is at N 75; the aircraft is at N 73.5 on the leg KAAA - KFAR, inside the area.
describe('OBS mode with the active waypoint outside the coverage area', () => {
    const kaaa = airport('KAAA', 73.0, 8.0);
    const kfar = airport('KFAR', 75.0, 8.0);
    const OBS_SOURCE_OFF = panelXml(NO_OBS);

    async function toKfar() {
        const unit = await bootUnit({
            facilities: [kaaa, kfar], position: {lat: 73.5, lon: 8.0}, magvar: 10, panelXml: OBS_SOURCE_OFF,
            storage: savedFlightplan(0, [kaaa, kfar]),
        });
        await settle(unit);
        expect(activeIdent(unit)).toBe('KFAR');
        return unit;
    }

    // The passing sibling of the pins below: it holds their setup, and in Leg mode the message stays away
    it('does not show the message in Leg mode, with the aircraft inside the area (5-44)', async () => {
        const unit = await toKfar();

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(messages(unit)).not.toContain(MAGVAR_INVALID);
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    // The setup of the pins below, held where it passes: the unit enters OBS mode on the leg to KFAR (characterization)
    it('switches to OBS mode with KFAR active (characterization, setup of #190)', async () => {
        const unit = await toKfar();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(activeIdent(unit)).toBe('KFAR');
        expect(finalCourseDeg(kaaa, kfar)).toBeCloseTo(0, 5); // The leg runs due north
    });

    it.fails('shows MAGNETIC VAR INVALID in OBS mode (5-44, #190)', async () => {
        const unit = await toKfar();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain(MAGVAR_INVALID);
    });

    // ObsSource 0: the unit chooses the OBS course itself, the DTK (000 true). Referenced to true north it is 000, not
    // 350 (000 less 10 E)
    it.fails('chooses the OBS course referenced to true north (5-44, #190)', async () => {
        const unit = await toKfar();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.obsMag).toBeCloseTo(0, 1);
    });
});
