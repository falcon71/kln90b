import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildPersistentMessages} from '../../../kln90b/data/PersistentMessages';
import {MessageHandler} from '../../../kln90b/data/MessageHandler';
import {NavMode} from '../../../kln90b/data/VolatileMemory';
import {KLNFixType} from '../../../kln90b/data/flightplan/Flightplan';
import {VnavState} from '../../../kln90b/services/Vnav';
import {MainPage} from '../../../kln90b/pages/MainPage';
import {AltPage} from '../../../kln90b/pages/left/AltPage';
import {Nav4LeftPage, Nav4RightPage} from '../../../kln90b/pages/left/Nav4Page';
import {Nav2Page} from '../../../kln90b/pages/left/Nav2Page';
import {PageProps} from '../../../kln90b/pages/Page';

/**
 * The state the persistent messages read, as plain values. Each message reads only a few of these; the rest stay at a
 * value that keeps every other message quiet, so a test sees the one message it is about.
 */
interface World {
    activeLeg: { fixType?: KLNFixType, askObs?: boolean } | null;
    navmode: NavMode;
    distToActive: number;
    userMagvar: number;
    magvarValid: boolean;
    dbCurrent: boolean;
    obsMode: boolean;
    dtkMag: number | null;
    obsIn: number | null;
    obsOut: number | null;
    vnavState: VnavState;
    timeToVnav: number | null;
    left: object;
    right: object;
    obsTarget: number;
    airdataInterfaced: boolean;
    baroSource: number;
}

/** A page object that passes the instanceof checks of PersistentMessages without being rendered */
const pageOf = <T extends object>(cls: { prototype: T }): T => Object.create(cls.prototype);

function quietWorld(): World {
    return {
        activeLeg: null,
        navmode: NavMode.ENR_LEG,
        distToActive: 50,
        userMagvar: 0,
        magvarValid: true,
        dbCurrent: true,
        obsMode: false,
        dtkMag: null,
        obsIn: null,
        obsOut: null,
        vnavState: VnavState.Inactive,
        timeToVnav: null,
        left: pageOf(Nav2Page),
        right: pageOf(Nav2Page),
        obsTarget: 0,
        airdataInterfaced: false,
        baroSource: 0,
    };
}

function harness(w: World) {
    const navPage = {
        activeWaypoint: {getActiveLeg: () => w.activeLeg},
        get navmode() {
            return w.navmode;
        },
        get distToActive() {
            return w.distToActive;
        },
        get userMagvar() {
            return w.userMagvar;
        },
    };
    const mainPage = Object.create(MainPage.prototype);
    mainPage.getLeftPage = () => w.left;
    mainPage.getRightPage = () => w.right;
    const props = {
        planeSettings: {
            vfrOnly: false,
            input: {altimeterInterfaced: true, airdata: {isInterfaced: w.airdataInterfaced, baroSource: w.baroSource}},
            output: {obsTarget: w.obsTarget},
        },
        memory: {navPage},
        database: {isAiracCurrent: () => w.dbCurrent},
        modeController: {isObsModeActive: () => w.obsMode, getDtkOrObsMagnetic: () => w.dtkMag},
        magvar: {isMagvarValid: () => w.magvarValid},
        pageManager: {getCurrentPage: () => mainPage},
        vnav: {
            get state() {
                return w.vnavState;
            },
            get timeToVnav() {
                return w.timeToVnav;
            },
        },
        sensors: {
            in: {
                get obsMag() {
                    return w.obsIn;
                },
            },
            out: {
                get obsOut() {
                    return w.obsOut;
                },
            },
        },
    } as unknown as PageProps;
    const handler = new MessageHandler();
    handler.persistentMessages = buildPersistentMessages(props);
    return {
        handler,
        /** One calculation tick, then the texts of the messages on the MSG page, one string per message */
        tick(): string[] {
            handler.tick();
            return handler.getMessages().map(m => m.message.join(' '));
        },
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('the quiet world', () => {
    // The precondition of every test below: the stub state raises no message, so a message in a test is that test's own
    it('raises no message (harness of this file)', () => {
        const h = harness(quietWorld());
        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });
});

describe('ARM GPS APPROACH', () => {
    // With the approach disarmed (ENR), the unit reminds the pilot 3 NM before the FAF (B-1, on the spec tests below)
    const atFaf = (navmode: NavMode, dist: number, fixType = KLNFixType.FAF) => {
        const w = quietWorld();
        w.activeLeg = {fixType};
        w.navmode = navmode;
        w.distToActive = dist;
        return harness(w).tick();
    };

    it('shows 3 NM before the FAF in ENR-LEG (B-1)', () => {
        expect(atFaf(NavMode.ENR_LEG, 3)).toEqual(['ARM GPS APPROACH']);
    });

    it('does not show 3.1 NM before the FAF (B-1)', () => {
        expect(atFaf(NavMode.ENR_LEG, 3.1)).toEqual([]);
    });

    it('does not show while the approach is armed (B-1)', () => {
        // The arming itself raises PRESS ALT TO SET BARO (6-8), and nothing else
        expect(atFaf(NavMode.ARM_LEG, 2)).toEqual(['PRESS ALT TO SET BARO']);
    });

    it('does not show before a fix that is not the FAF (B-1)', () => {
        expect(atFaf(NavMode.ENR_LEG, 2, KLNFixType.IAF)).toEqual([]);
    });

    it('shows in ENR-OBS too (characterization)', () => {
        expect(atFaf(NavMode.ENR_OBS, 2)).toEqual(['ARM GPS APPROACH']);
    });
});

describe('IF REQUIRED SELECT OBS', () => {
    // B-2: 4 NM before a waypoint usable for a procedure turn or a holding pattern, in LEG mode (all spec tests)
    const before = (dist: number, askObs: boolean, obsMode = false) => {
        const w = quietWorld();
        w.activeLeg = {askObs};
        w.distToActive = dist;
        w.obsMode = obsMode;
        return harness(w).tick();
    };

    it('shows 4 NM before a holding or procedure-turn fix (B-2)', () => {
        expect(before(4, true)).toEqual(['IF REQUIRED SELECT OBS']);
    });

    it('does not show 4.1 NM before it (B-2)', () => {
        expect(before(4.1, true)).toEqual([]);
    });

    it('does not show before another fix (B-2)', () => {
        expect(before(2, false)).toEqual([]);
    });

    it('does not show in OBS mode (B-2)', () => {
        expect(before(2, true, true)).toEqual([]);
    });
});

describe('MAGNETIC VAR INVALID (B-2, 5-44)', () => {
    it('shows outside the magnetic variation area without a pilot-entered variation (B-2, 5-44)', () => {
        const w = quietWorld();
        w.magvarValid = false;
        expect(harness(w).tick()).toEqual(['MAGNETIC VAR INVALID ALL DATA REFERENCED TO TRUE NORTH']);
    });

    it('goes when the pilot enters an east variation (B-2, 5-44)', () => {
        const w = quietWorld();
        w.magvarValid = false;
        const h = harness(w);
        expect(h.tick()).toHaveLength(1); // The precondition: it shows before the entry
        w.userMagvar = 10;
        expect(h.tick()).toEqual([]);
    });

    // West variations are stored negative (MagvarEditor)
    it('goes when the pilot enters a west variation (B-2, 5-44)', () => {
        const w = quietWorld();
        w.magvarValid = false;
        const h = harness(w);
        expect(h.tick()).toHaveLength(1); // The precondition: it shows before the entry
        w.userMagvar = -10;
        expect(h.tick()).toEqual([]);
    });
});

describe('VNV ALERT', () => {
    // About 90 s before the VNAV start, unless NAV 4 is on the screen (B-4 on the spec tests below). VNAV is armed on
    // NAV 4, so the unit ticks with VNAV inactive first
    const armed = (seconds: number, w = quietWorld()) => {
        const h = harness(w);
        h.tick();
        w.vnavState = VnavState.Armed;
        w.timeToVnav = seconds;
        return {w, h};
    };

    it('shows 90 s before the start (B-4)', () => {
        expect(armed(90).h.tick()).toEqual(['VNV ALERT']);
    });

    it('does not show 91 s before the start (B-4)', () => {
        expect(armed(91).h.tick()).toEqual([]);
    });

    it('goes when VNAV is no longer armed (characterization)', () => {
        const {w, h} = armed(60);
        expect(h.tick()).toEqual(['VNV ALERT']); // The precondition: it shows while armed
        w.vnavState = VnavState.Inactive;
        expect(h.tick()).toEqual([]);
    });

    // The alert warns of the start of the descent, so it has no purpose once VNAV is active
    it('goes when the descent has started and VNAV is active (characterization)', () => {
        const {w, h} = armed(60);
        expect(h.tick()).toEqual(['VNV ALERT']); // The precondition: it shows while armed
        w.vnavState = VnavState.Active;
        expect(h.tick()).toEqual([]);
    });

    it('does not show with NAV 4 on the left (B-4)', () => {
        const w = quietWorld();
        w.left = pageOf(Nav4LeftPage);
        expect(armed(60, w).h.tick()).toEqual([]);
    });

    it('does not show with NAV 4 on the right (B-4)', () => {
        const w = quietWorld();
        w.right = pageOf(Nav4RightPage);
        expect(armed(60, w).h.tick()).toEqual([]);
    });

    it('goes once NAV 4 is selected, and does not come back when NAV 4 is left again (characterization)', () => {
        const {w, h} = armed(80);
        expect(h.tick()).toEqual(['VNV ALERT']);
        w.right = pageOf(Nav4RightPage);
        w.timeToVnav = 79;
        expect(h.tick()).toEqual([]);
        w.right = pageOf(Nav2Page);
        w.timeToVnav = 78;
        expect(h.tick()).toEqual([]);
    });

    it('comes back for a new VNAV after the next arming (characterization)', () => {
        const {w, h} = armed(80);
        w.right = pageOf(Nav4RightPage);
        h.tick();
        w.right = pageOf(Nav2Page);
        w.vnavState = VnavState.Inactive;
        h.tick();
        w.vnavState = VnavState.Armed;
        w.timeToVnav = 60;
        expect(h.tick()).toEqual(['VNV ALERT']);
    });

    it('comes back when the time to the start rises above 90 s and falls again (characterization)', () => {
        const {w, h} = armed(80);
        w.right = pageOf(Nav4RightPage);
        h.tick();
        w.right = pageOf(Nav2Page);
        w.timeToVnav = 100;
        expect(h.tick()).toEqual([]);
        w.timeToVnav = 80;
        expect(h.tick()).toEqual(['VNV ALERT']);
    });
});

describe('PRESS ALT TO SET BARO (6-8, B-3)', () => {
    // 6-8, B-3: the message comes with the arming of the approach; the ALT page answers it
    it('shows when the approach arms, and stays until the ALT page is shown (6-8, B-3)', () => {
        const w = quietWorld();
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        w.navmode = NavMode.ARM_LEG;
        expect(h.tick()).toEqual(['PRESS ALT TO SET BARO']);
        expect(h.tick()).toEqual(['PRESS ALT TO SET BARO']);

        w.left = pageOf(AltPage);
        expect(h.tick()).toEqual([]);
        w.left = pageOf(Nav2Page);
        expect(h.tick()).toEqual([]); // Answered: it does not come back while still armed
    });

    it('shows when the approach arms in OBS (6-8, B-3)', () => {
        const w = quietWorld();
        w.navmode = NavMode.ENR_OBS;
        const h = harness(w);
        h.tick();
        w.navmode = NavMode.ARM_OBS;
        expect(h.tick()).toEqual(['PRESS ALT TO SET BARO']);
    });

    // 6-8 (the note): with an air data computer supplying the baro the message is not shown
    it.fails('does not show when an air data computer supplies the baro (6-8) (#174)', () => {
        const w = quietWorld();
        w.airdataInterfaced = true;
        w.baroSource = 1;
        const h = harness(w);
        h.tick();
        w.navmode = NavMode.ARM_LEG;
        expect(h.tick()).toEqual([]);
    });

    it('shows when the approach arms with air data that does not supply the baro (sibling of #174)', () => {
        const w = quietWorld();
        w.airdataInterfaced = true;
        w.baroSource = 0;
        const h = harness(w);
        h.tick();
        w.navmode = NavMode.ARM_LEG;
        expect(h.tick()).toEqual(['PRESS ALT TO SET BARO']);
    });
});

describe('DATA BASE OUT OF DATE', () => {
    const DB_TEXT = 'DATA BASE OUT OF DATE ALL DATA MUST BE CONFIRMED BEFORE USE';

    it('is posted at the tick the data base becomes out of date (characterization)', () => {
        const w = quietWorld();
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        w.dbCurrent = false;
        expect(h.tick()).toEqual([DB_TEXT]);
    });

    it('is not posted for a data base that was out of date from the start (characterization)', () => {
        const w = quietWorld();
        w.dbCurrent = false;
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // B-2, 3-16: a message is there for the pilot to read. Today the condition is true for one calculation tick only, so
    // the message is gone a second later, unread, and the MSG prompt with it.
    // This pin is bound to the persistent DatabaseOutOfDateMessage class (PersistentMessages.ts). If the fix deletes that
    // class, delete this pin with it: the render pin below ("lists the message once") then carries the bug.
    it.fails('stays until it is read (B-2, 3-16) (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        h.tick();
        expect(h.tick()).toEqual([DB_TEXT]);
        expect(h.handler.hasUnreadMessages()).toBe(true);
    });
});

describe('ADJ NAV IND CRS, a driven indicator', () => {
    // With an indicator the unit slews (Output.ObsTarget other than 0), the message shows when the indicator's
    // course differs from the unit's selected course by more than 0.5 degrees (B-1, on the spec tests below)
    const driven = (out: number | null, inp: number | null, obsTarget = 1) => {
        const w = quietWorld();
        w.obsTarget = obsTarget;
        w.obsOut = out;
        w.obsIn = inp;
        return harness(w).tick();
    };

    it('shows at 0.6 degrees off, to either side (B-1)', () => {
        expect(driven(100, 100.6)).toEqual(['ADJ NAV IND CRS']);
        expect(driven(100, 99.4)).toEqual(['ADJ NAV IND CRS']);
    });

    it('does the same for the second indicator target (characterization)', () => {
        expect(driven(100, 100.6, 2)).toEqual(['ADJ NAV IND CRS']);
        expect(driven(100, 100.4, 2)).toEqual([]);
    });

    it('does not show at 0.4 degrees off (B-1)', () => {
        expect(driven(100, 99.6)).toEqual([]);
    });

    it('compares across north (B-1)', () => {
        expect(driven(359.8, 0.1)).toEqual([]);
        expect(driven(359.8, 0.5)).toEqual(['ADJ NAV IND CRS']);
    });

    it('does not show without a course read back (characterization)', () => {
        expect(driven(100, null)).toEqual([]);
    });
});

describe('ADJ NAV IND CRS TO nnn, a readable indicator', () => {
    // In LEG mode, with an HSI course the unit can read, the message shows while the course differs from the DTK
    // by more than 5 degrees (B-1, on the spec tests below). The unit also shows it for a while after every DTK change
    // of more than 5 degrees, whatever the indicator shows (the force window, below)
    const readable = () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        const w = quietWorld();
        w.dtkMag = 46;
        w.obsIn = 46;
        const h = harness(w);
        h.tick(); // The first DTK opens the force window; 31 s is past it, whether it lasts 10 s or 30 s
        vi.advanceTimersByTime(31_000);
        return {w, h};
    };

    it('shows at 6 degrees off the DTK, with the DTK in three digits (B-1)', () => {
        const {w, h} = readable();
        expect(h.tick()).toEqual([]); // The precondition: the force window has closed
        w.obsIn = 52;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 046°']);
    });

    it('shows at 6 degrees off the DTK on the other side (B-1)', () => {
        const {w, h} = readable();
        expect(h.tick()).toEqual([]); // The precondition: the force window has closed
        w.obsIn = 40;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 046°']);
    });

    it('does not show at 5 degrees off the DTK (B-1)', () => {
        const {w, h} = readable();
        w.obsIn = 41;
        expect(h.tick()).toEqual([]);
    });

    it('does not show in OBS mode (B-1)', () => {
        const {w, h} = readable();
        w.obsIn = 100;
        w.obsMode = true;
        expect(h.tick()).toEqual([]);
    });

    it('shows for the first 10 s after a DTK change of more than 5 degrees, even with the indicator on course (characterization)', () => {
        const {w, h} = readable();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(9_000);
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
    });

    // The code comment (PersistentMessages.ts, forceShow) cites two YouTube timestamps for about 30 s; the maintainer
    // re-checked the video: https://youtu.be/S1lt2W95bLA?t=2244 and https://youtu.be/S1lt2W95bLA?t=2574. The code
    // closes the window after 10 s.
    it.fails('keeps ADJ NAV IND CRS TO for 30 s after a DTK change of more than 5 degrees, even on course (#177)', () => {
        const {w, h} = readable();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(25_000);
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(6_000);
        expect(h.tick()).toEqual([]);
    });

    it('ends the window once the message is read (characterization)', () => {
        const {w, h} = readable();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        h.handler.getMessages().forEach(m => m.seen = true); // What the MSG page does
        vi.advanceTimersByTime(1_000);
        expect(h.tick()).toEqual([]);
    });

    it('does not open the window for a DTK change of 5 degrees (characterization)', () => {
        const {w, h} = readable();
        w.dtkMag = 51;
        w.obsIn = 51;
        expect(h.tick()).toEqual([]);
    });

    it('opens the window for a DTK change of 6 degrees (characterization)', () => {
        const {w, h} = readable();
        w.dtkMag = 52;
        w.obsIn = 52;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 052°']);
    });

    it('opens the window for a DTK change of 6 degrees to the left (characterization)', () => {
        const {w, h} = readable();
        w.dtkMag = 40;
        w.obsIn = 40;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 040°']);
    });

    it('opens the window at the first DTK, even on course (characterization)', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        const w = quietWorld();
        w.dtkMag = 3;
        w.obsIn = 3;
        expect(harness(w).tick()).toEqual(['ADJ NAV IND CRS TO 003°']);
    });

    it('does not show without a course read back from the indicator (characterization)', () => {
        const {w, h} = readable();
        w.obsIn = null;
        expect(h.tick()).toEqual([]);
    });
});
