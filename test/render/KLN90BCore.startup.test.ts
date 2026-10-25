import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {Facility, FacilityType, ICAO, IcaoValue} from '@microsoft/msfs-sdk';
import {bootUnit, bootUnitExpectingError} from '../harness/boot';
import {muteConsoleError} from '../harness/console';
import {KLN90BCore} from '../../kln90b/KLN90BCore';
import {EVT_ENT, EVT_POWER_OFF, EVT_POWER_ON} from '../../kln90b/HEvents';
import {MemoryFacilityClient} from '../harness/navdata/MemoryFacilityClient';
import {defaultNavdata} from '../harness/fixtures';
import {Screen} from '../harness/render/screen';
import {MSA} from '../../kln90b/services/MSA';

// The source is the fix commit, not a manual page. The harness test bootFailure.test.ts holds the catch on the
// propsReady chain (a facility client whose nearest search rejects, which fails after init() has returned). Here the
// failure is thrown inside init() itself, which only the catch of init() handles.
describe('KLN90BCore start-up failure (#50, b4a4ff2)', () => {
    it('shows an error thrown inside init() on the error page, without an unhandled rejection', async () => {
        muteConsoleError();

        const failed = await bootUnitExpectingError({
            platform: {
                createFacilityClient: () => {
                    throw new Error('no client');
                },
            },
        });

        expect(failed.errors.map(e => e.message)).toEqual(['no client']);
        expect(failed.errorPage()?.startsWith('Error: no client')).toBe(true);
        expect(failed.takeRejections()).toEqual([]);
    });
});

// The source is the fix commit 7b4465d ("ignore events until it is correctly initialized", the startup in the
// Dukes): an aircraft can send H events before BaseInstrument.Init has run. PageManager.test.ts holds the PageManager
// half (no throw, the log line). This test holds what the pilot saw: without the fix the event threw, the core
// published the error and the bus cached it; the error page received the cached error while init() was still building
// it, before it was rendered, so its showError threw and init() stopped. The unit never came up (re-broken:
// propsReady never fires).
describe('H events before KLN90BCore.init (7b4465d)', () => {
    it('are ignored, and the unit comes up without an error', async () => {
        muteConsoleError();
        const original = KLN90BCore.prototype.init;
        // The event arrives on the core that the boot built, just before its init() runs
        const init = vi.spyOn(KLN90BCore.prototype, 'init').mockImplementation(
            function (this: KLN90BCore, xml: Document) {
                this.onInteractionEvent([EVT_ENT]);
                return original.call(this, xml);
            });
        onTestFinished(() => init.mockRestore());

        const unit = await bootUnit();

        expect(init).toHaveBeenCalledTimes(1);
        expect(unit.errors).toEqual([]);
        expect(document.querySelector('.errorpage')!.classList.contains('d-none')).toBe(true);
        expect(unit.consoleErrors).toEqual([['Event KLN90B_ENT_Push ignored, we are not yet initialized!']]);
    });
});

/** A promise that never settles: a call whose answer never comes (#416) */
const never = <T>() => new Promise<T>(() => undefined);

/** The default VOR (fixtures.ts), saved as the last active waypoint, so that the boot looks it up first */
const ZZV = defaultNavdata().find(f => f.icaoStruct.ident === 'ZZV')!;
const LAST_ACTIVE_ZZV = {activeWaypoint: ICAO.valueToStringV2(ZZV.icaoStruct)};

/** Hands the lookups of ZZV to `answer`; every other lookup is the real one. The spy is restored when the test ends */
function onLookupOfZzv(answer: (real: () => Promise<Facility>) => Promise<Facility>): void {
    const getFacility = MemoryFacilityClient.prototype.getFacility;
    const spy = vi.spyOn(MemoryFacilityClient.prototype, 'getFacility');
    onTestFinished(() => spy.mockRestore());
    spy.mockImplementation(function (this: MemoryFacilityClient, type: FacilityType, icao: IcaoValue | string) {
        const real = () => getFacility.call(this, type, icao);
        const ident = typeof icao === 'string' ? ICAO.stringV2ToValue(icao).ident : icao.ident;
        return ident === 'ZZV' ? answer(real) : real();
    });
}

const TURN_ON_TOP_ROW = ' GPS             ORS 20';

// A call of the boot (asyncInit) that never answers leaves the unit without its services: it stays on the Turn-On page,
// and the self-test of the page names the call on the error page once it has been pending for 60 s. The engine runs, so
// the unit is on during the boot. Spec 4.2 and 4.4 of docs/superpowers/specs/2026-10-25-startup-self-test-design.md
describe('a hang during the boot (#416)', () => {
    it('shows the error page for a hung last-active-waypoint lookup and stays on the Turn-On page', async () => {
        muteConsoleError();
        onLookupOfZzv(() => never());

        const failed = await bootUnitExpectingError({storage: LAST_ACTIVE_ZZV});

        expect(failed.errors).toHaveLength(1);
        expect(failed.errorPage()).toContain('getFacility(');
        expect(Screen.read().row(0)).toBe(TURN_ON_TOP_ROW);
    });

    it('shows the error page for a hung nearest search session start and stays on the Turn-On page', async () => {
        muteConsoleError();
        const spy = vi.spyOn(MemoryFacilityClient.prototype, 'startNearestSearchSessionWithIcaoStructs').mockImplementation(() => never());
        onTestFinished(() => spy.mockRestore());

        const failed = await bootUnitExpectingError();

        expect(failed.errors).toHaveLength(1);
        expect(failed.errorPage()).toContain('startNearestSearchSessionWithIcaoStructs(');
        expect(Screen.read().row(0)).toBe(TURN_ON_TOP_ROW);
    });

    it('shows the error page for a hung msa.json request and stays on the Turn-On page', async () => {
        muteConsoleError();
        const spy = vi.spyOn(MSA.prototype, 'init').mockReturnValue(never());
        onTestFinished(() => spy.mockRestore());

        const failed = await bootUnitExpectingError();

        expect(failed.errors).toHaveLength(1);
        expect(failed.errorPage()).toContain('msa.json');
        expect(Screen.read().row(0)).toBe(TURN_ON_TOP_ROW);
    });

    // Before the props are there every pending call counts, also one of an earlier power-on: the boot itself still waits
    // on it. A power cycle during a stuck boot shows the error again at once, since the call is over 60 s old (spec 4.3)
    it('shows the error again at once after a power cycle during a hung boot', async () => {
        muteConsoleError();
        onLookupOfZzv(() => never());
        const failed = await bootUnitExpectingError({storage: LAST_ACTIVE_ZZV});
        expect(failed.errors).toHaveLength(1); // Precondition: the first power-on found the hang

        failed.core.onInteractionEvent([EVT_POWER_OFF]);
        await vi.advanceTimersByTimeAsync(1000);
        failed.core.onInteractionEvent([EVT_POWER_ON]);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().row(0)).toBe(TURN_ON_TOP_ROW); // Precondition: the new power-on shows the Turn-On page
        expect(failed.errors).toHaveLength(2);
        expect(failed.errors[1].message).toContain('getFacility(');
    });

    // In the sim every facility call waits for the initialization; the error names it, not the oldest call (spec 4.4)
    it('names the facility initialization when it never completes', async () => {
        muteConsoleError();
        const init = vi.spyOn(MemoryFacilityClient.prototype, 'awaitInitialization').mockImplementation(() => never());
        onTestFinished(() => init.mockRestore());
        const session = vi.spyOn(MemoryFacilityClient.prototype, 'startNearestSearchSessionWithIcaoStructs').mockImplementation(() => never());
        onTestFinished(() => session.mockRestore());

        const failed = await bootUnitExpectingError();

        expect(failed.errors).toHaveLength(1);
        expect(failed.errors[0].message).toBe("Start-up self-test failed: the sim's facility initialization has not completed for 60 s");
        expect(failed.errorPage()).toContain("the sim's facility initialization has not completed for");
        expect(Screen.read().row(0)).toBe(TURN_ON_TOP_ROW);
    });

    // The first failure of a power-on decides it: a hung call that answers later does not turn the test into a pass
    // (spec 4.2). With the engine running the Self Test page is shown all the same
    it('goes to TEST FAIL when a call hung before the props answers later', async () => {
        muteConsoleError();
        let answer!: () => void;
        onLookupOfZzv(real => new Promise((resolve, reject) => {
            answer = () => real().then(resolve, reject);
        }));

        const failed = await bootUnitExpectingError({storage: LAST_ACTIVE_ZZV});
        expect(failed.errors).toHaveLength(1); // Precondition: the hang was found
        answer();
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('R')[5]).toBe('  APPROVE? ');
        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
        expect(failed.errors).toHaveLength(1);
    });
});
