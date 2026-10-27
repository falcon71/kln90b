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
    distToActive: number | null;
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
    selfTestApproved: boolean;
    /** The GPS time in ms, which the course messages count their seconds in (#401) */
    gpsTime: number;
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
        selfTestApproved: true,
        gpsTime: Date.UTC(2026, 5, 1, 12),
    };
}

function harness(w: World) {
    const navPage = {
        activeWaypoint: {
            getActiveLeg: () => w.activeLeg,
            getActiveFafLeg: () => w.activeLeg?.fixType === KLNFixType.FAF ? w.activeLeg : null,
        },
        get navmode() {
            return w.navmode;
        },
        get distToActive() {
            return w.distToActive;
        },
        get userMagvar() {
            return w.userMagvar;
        },
        get isSelfTestApproved() {
            return w.selfTestApproved;
        },
    };
    const mainPage = Object.create(MainPage.prototype);
    mainPage.getLeftPage = () => w.left;
    mainPage.getRightPage = () => w.right;
    const props = {
        planeSettings: {
            vfrOnly: false,
            input: {altimeterInterfaced: true, airdata: {isInterfaced: w.airdataInterfaced, baroSource: w.baroSource}},
            output: {
                // A getter, because the run-time Output.ObsTarget can change between two ticks (SimVarSync, #401)
                get obsTarget() {
                    return w.obsTarget;
                },
            },
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
                // Read through sensors.in.gps each time, as the unit does: Gps replaces its timeZulu object
                gps: {
                    get timeZulu() {
                        return {getTimestamp: () => w.gpsTime};
                    },
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

/**
 * Runs `seconds` calculation ticks, the GPS time advancing by a second before each, and returns the messages after the
 * last
 */
function tickSeconds(h: ReturnType<typeof harness>, w: World, seconds: number): string[] {
    let messages: string[] = [];
    for (let i = 0; i < seconds; i++) {
        w.gpsTime += 1000;
        messages = h.tick();
    }
    return messages;
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
    const before = (dist: number | null, askObs: boolean, obsMode = false) => {
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

    // B-2, 6-10: the reminder comes 4 NM before the fix. Without a position (NAV flag) NavCalculator.setFlag sets the
    // distance to null, and null <= 4 is true in JavaScript, so the reminder is posted at any distance
    it.fails('does not show without a distance to the fix (B-2) (#417)', () => {
        expect(before(null, true)).toEqual([]);
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

    // The manual says about 90 s, so the exact cut-off at 91 s is the code's choice (PersistentMessages.ts, timeToVnav <= 90)
    it('does not show 91 s before the start (characterization)', () => {
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

    // 6-8 (the note): with an air data computer supplying the baro the message is not shown. The ALT page takes the baro
    // from either source of the panel.xml (BaroSource 1 or 2), and the message is held back in both arming modes
    it.each([
        [1, 'ARM-LEG', NavMode.ARM_LEG],
        [2, 'ARM-LEG', NavMode.ARM_LEG],
        [1, 'ARM-OBS', NavMode.ARM_OBS],
        [2, 'ARM-OBS', NavMode.ARM_OBS],
    ])('does not show when an air data computer supplies the baro, source %i, %s (6-8) (#174)', (baroSource, _mode, armed) => {
        const w = quietWorld();
        w.airdataInterfaced = true;
        w.baroSource = baroSource;
        const h = harness(w);
        h.tick();
        w.navmode = armed;
        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // BaroSource only means something with an air data computer; without one nothing supplies the baro
    it('shows when the approach arms with a BaroSource but no air data computer (#360)', () => {
        const w = quietWorld();
        w.airdataInterfaced = false;
        w.baroSource = 1;
        const h = harness(w);
        h.tick();
        w.navmode = NavMode.ARM_LEG;
        expect(h.tick()).toEqual(['PRESS ALT TO SET BARO']);
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

    // B-2, 3-16: a message is there for the pilot to read. Before #175 the condition was true for one calculation tick
    // only, so the message was gone a second later, unread, and the MSG prompt with it. The data base expiring while the
    // unit runs is this path: the stub turns from current to expired between two ticks
    it('stays until it is read (B-2, 3-16) (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        h.tick();
        expect(h.tick()).toEqual([DB_TEXT]);
        expect(h.handler.hasUnreadMessages()).toBe(true);
    });

    // Checked in the KLN 89 trainer, 2026-10-18: after the message was read, the prompt was gone and the message page
    // showed no message. The data base stays out of date, so only the read ends it
    it('is gone once it is read, while the data base stays out of date (checked in the KLN 89 trainer, 2026-10-18) (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        expect(h.tick()).toEqual([DB_TEXT]);
        h.handler.getMessages()[0].seen = true; // What the MSG page does when it shows the message

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // The maintainer's ruling (#176): the unit loses its messages at the power-off, and MessageHandler.clear is the
    // power-off. The KLN 89 check of 2026-10-18 showed no message at a power-up with the date already past the end; it
    // did not try an unread message over the power cycle, so the title cites the issues only
    it('is not listed again after a power cycle with the message unread (#175, #176)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        expect(h.tick()).toEqual([DB_TEXT]); // Precondition: listed, unread
        h.handler.clear();

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // Checked in the KLN 89 trainer, 2026-10-18: with the date already past the end at power-up there was no message.
    // Here the data base expires while the unit is off, so the last tick before the power-off saw it current. That the
    // same holds for this case is our reading of that observation, not a trainer result
    it('is not posted at a power-on after the data base expired while the unit was off (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        h.handler.clear();
        w.dbCurrent = false;

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // The rulings of #351 (a read message keeps its seen flag over a power cycle) and #175 (the latch) together: the
    // pilot reads the message and the unit is switched off before the next tick. The read clears the latch at the first
    // tick, and the power-off clears it too, so it does not come back, read or unread
    it('stays gone over a power cycle right after it is read (#351, #175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        expect(h.tick()).toEqual([DB_TEXT]);
        h.handler.getMessages()[0].seen = true;
        h.handler.clear();

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // The maintainer's ruling (#175): a new change from current to expired after the read posts it again, once
    it('is posted again when the data base becomes out of date again after the read (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        h.tick();
        h.handler.getMessages()[0].seen = true;
        expect(h.tick()).toEqual([]); // Precondition: gone once read
        w.dbCurrent = true;
        h.tick();
        w.dbCurrent = false;

        expect(h.tick()).toEqual([DB_TEXT]);
        expect(h.handler.hasUnreadMessages()).toBe(true);
    });
});

describe('ADJ NAV IND CRS, a driven indicator', () => {
    // With an indicator the unit slews (Output.ObsTarget other than 0), the message shows when the indicator's course
    // has differed from the unit's selected course by more than 0.5 degrees for more than 12 s (B-1, on the spec tests
    // below; the 12 s are those of the KA 90 Installation Manual pp. 3-43 and 3-45, carried over by analogy for a driven
    // indicator, the maintainer, 2026-10-26; #401). The first tick is at the start time, so `seconds` is the time held
    const driven = (out: number | null, inp: number | null, obsTarget = 1, seconds = 13) => {
        const w = quietWorld();
        w.obsTarget = obsTarget;
        w.obsOut = out;
        w.obsIn = inp;
        const h = harness(w);
        h.tick();
        return tickSeconds(h, w, seconds);
    };

    /** A driven world with the indicator 0.6 degrees off, after the first tick */
    const drivenOff = () => {
        const w = quietWorld();
        w.obsTarget = 1;
        w.obsOut = 100;
        w.obsIn = 100.6;
        const h = harness(w);
        h.tick();
        return {w, h};
    };

    it('shows after more than 12 s at 0.6 degrees off, to either side (B-1, #401)', () => {
        expect(driven(100, 100.6, 1, 12)).toEqual([]);
        expect(driven(100, 100.6)).toEqual(['ADJ NAV IND CRS']);
        expect(driven(100, 99.4, 1, 12)).toEqual([]);
        expect(driven(100, 99.4)).toEqual(['ADJ NAV IND CRS']);
    });

    it('does the same for the second indicator target (characterization)', () => {
        expect(driven(100, 100.6, 2, 12)).toEqual([]);
        expect(driven(100, 100.6, 2)).toEqual(['ADJ NAV IND CRS']);
        expect(driven(100, 100.4, 2, 30)).toEqual([]);
    });

    it('does not show at 0.4 degrees off (B-1)', () => {
        expect(driven(100, 99.6, 1, 30)).toEqual([]);
    });

    it('compares across north (B-1)', () => {
        expect(driven(359.8, 0.1, 1, 30)).toEqual([]);
        expect(driven(359.8, 0.5)).toEqual(['ADJ NAV IND CRS']);
    });

    it('does not show without a course read back (characterization)', () => {
        expect(driven(100, null, 1, 30)).toEqual([]);
    });

    it('does not show for an indicator that follows within 12 s (#401)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 5)).toEqual([]);
        w.obsIn = 100;

        const after: string[][] = [];
        for (let i = 0; i < 30; i++) {
            after.push(tickSeconds(h, w, 1));
        }
        expect(after.filter(m => m.length > 0)).toEqual([]);
    });

    it('starts the count again after the indicator was within 0.5 degrees (#401)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 10)).toEqual([]);
        w.obsIn = 100;
        expect(tickSeconds(h, w, 1)).toEqual([]);
        w.obsIn = 100.6;

        expect(tickSeconds(h, w, 13)).toEqual([]);
        expect(tickSeconds(h, w, 1)).toEqual(['ADJ NAV IND CRS']);
    });

    // "Held without a break": a course that is not read back is a break, so the count starts again when it returns
    it('starts the count again after the course was not read back (#401)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 6)).toEqual([]);
        w.obsIn = null;
        expect(tickSeconds(h, w, 20)).toEqual([]);
        w.obsIn = 100.6;

        expect(tickSeconds(h, w, 1)).toEqual([]); // The count starts here
        expect(tickSeconds(h, w, 12)).toEqual([]);
        expect(tickSeconds(h, w, 1)).toEqual(['ADJ NAV IND CRS']);
    });

    // The same for the case that changes while the unit runs: Output.ObsTarget 1, 0 and 1 again (SimVarSync)
    it('starts the count again after Output.ObsTarget went to 0 and back to 1 (#401)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 6)).toEqual([]);
        w.obsTarget = 0;
        expect(tickSeconds(h, w, 20)).toEqual([]);
        w.obsTarget = 1;

        expect(tickSeconds(h, w, 1)).toEqual([]); // The count starts here
        expect(tickSeconds(h, w, 12)).toEqual([]);
        expect(tickSeconds(h, w, 1)).toEqual(['ADJ NAV IND CRS']);
    });

    it('does not count while the GPS time stands still (the sim paused) (#401)', () => {
        const {h} = drivenOff();
        for (let i = 0; i < 60; i++) {
            expect(h.tick()).toEqual([]);
        }
    });

    // 3-16: a message stays listed with a steady prompt for as long as its condition holds
    it('stays listed once read while the indicator is off (3-16)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 13)).toEqual(['ADJ NAV IND CRS']);
        expect(h.handler.hasUnreadMessages()).toBe(true);
        h.handler.getMessages()[0].seen = true;

        expect(tickSeconds(h, w, 1)).toEqual(['ADJ NAV IND CRS']);
        expect(h.handler.hasUnreadMessages()).toBe(false);
    });

    it('goes as soon as the indicator is within 0.5 degrees (B-1)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 13)).toEqual(['ADJ NAV IND CRS']);
        w.obsIn = 100.4;

        expect(tickSeconds(h, w, 1)).toEqual([]);
    });

    it('goes when the course is no longer read back (characterization)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 13)).toEqual(['ADJ NAV IND CRS']);
        w.obsIn = null;

        expect(tickSeconds(h, w, 1)).toEqual([]);
    });

    it('is evaluated from the tick Output.ObsTarget changes to 1 (#401)', () => {
        const w = quietWorld();
        w.obsOut = 100;
        w.obsIn = 100.6;
        const h = harness(w);
        h.tick();
        expect(tickSeconds(h, w, 20)).toEqual([]); // Precondition: an undriven indicator posts no plain message
        w.obsTarget = 1;

        expect(tickSeconds(h, w, 13)).toEqual([]);
        expect(tickSeconds(h, w, 1)).toEqual(['ADJ NAV IND CRS']);
    });

    it('is no longer evaluated from the tick Output.ObsTarget changes to 0 (#401)', () => {
        const {w, h} = drivenOff();
        expect(tickSeconds(h, w, 13)).toEqual(['ADJ NAV IND CRS']);
        w.obsTarget = 0;

        expect(tickSeconds(h, w, 1)).toEqual([]);
        expect(tickSeconds(h, w, 30)).toEqual([]);
    });

    // 4-8, B-1: no turn-anticipation message when the unit slews the indicator itself, whatever the indicator shows
    it('never shows the TO message (4-8, B-1)', () => {
        const w = quietWorld();
        w.obsTarget = 1;
        w.dtkMag = 46;
        w.obsOut = 46;
        w.obsIn = 46;
        const h = harness(w);
        h.tick();
        w.dtkMag = 100; // A leg change of more than 5 degrees
        w.obsOut = 100;
        w.obsIn = 100;
        expect(tickSeconds(h, w, 1)).toEqual([]);
        w.obsIn = 60; // 40 degrees off the DTK: the plain message is the one for it, and only after 12 s

        expect(tickSeconds(h, w, 13)).toEqual([]);
        expect(tickSeconds(h, w, 1)).toEqual(['ADJ NAV IND CRS']);
    });

    // #330, as for the readable indicator: the self-test page sends its fixed course to a driven indicator, which reads
    // it back one tick later
    it('is not evaluated before the self-test is approved (#330)', () => {
        const {w, h} = drivenOff();
        w.selfTestApproved = false;
        expect(tickSeconds(h, w, 30)).toEqual([]);

        w.selfTestApproved = true;
        expect(tickSeconds(h, w, 13)).toEqual([]); // The count starts at the approval
        expect(tickSeconds(h, w, 1)).toEqual(['ADJ NAV IND CRS']);
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
        h.tick(); // The first DTK is the start-up course and opens no force window (#330); 31 s keep a window closed anyway
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

    // #361: a DTK of 359.7 magnetic is named 000 in the message, the north rule of #263
    it('names a DTK of 359.7 as 000° (characterization, #361)', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        const w = quietWorld();
        w.dtkMag = 359.7;
        w.obsIn = 10; // more than 5 degrees off
        const h = harness(w);

        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 000°']);
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

    // The code comment (PersistentMessages.ts, forceShow) cites two YouTube timestamps for about 30 s; the maintainer
    // re-checked the video: https://youtu.be/S1lt2W95bLA?t=2244 and https://youtu.be/S1lt2W95bLA?t=2574
    it('keeps ADJ NAV IND CRS TO for 30 s after a DTK change of more than 5 degrees, even on course (#177)', () => {
        const {w, h} = readable();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(25_000);
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(6_000);
        expect(h.tick()).toEqual([]);
    });

    // The video gives "about 30 s", not the exact edge: the code shows the message up to, and not at, 30.000 s
    it('closes the window at 30 s, not before (characterization)', () => {
        const {w, h} = readable();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(29_999);
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(1);
        expect(h.tick()).toEqual([]);
    });

    it('starts a new 30 s window at a second DTK change of more than 5 degrees (characterization)', () => {
        const {w, h} = readable();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']);
        vi.advanceTimersByTime(20_000);
        w.dtkMag = 160;
        w.obsIn = 160;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 160°']);
        vi.advanceTimersByTime(29_000); // 49 s after the first change, 29 s after the second
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 160°']);
        vi.advanceTimersByTime(1_000);
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

    // Since #330 the course at the first evaluation after the approval is the start-up course and opens no window, so
    // the first DTK here comes after a start-up without one, as at a Direct To after a start-up without a flight plan
    it('opens the window at the first DTK, even on course (characterization)', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        const w = quietWorld();
        const h = harness(w);
        expect(h.tick()).toEqual([]); // The start-up, without a DTK
        w.dtkMag = 3;
        w.obsIn = 3;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 003°']);
    });

    it('does not show without a course read back from the indicator (characterization)', () => {
        const {w, h} = readable();
        w.obsIn = null;
        expect(h.tick()).toEqual([]);
    });
});

describe('ADJ NAV IND CRS TO nnn before the self-test is approved', () => {
    const atNoon = () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    };

    // Figure 3-4: the self-test page with the indicator on 242° against the fixed course of 315° and no message prompt.
    // The maintainer's ruling (#330) widens this to the whole time before the approval, the Turn-On page included. The
    // same world after the approval shows the message, so the approval is what lets it through
    it('is not evaluated before the approval, with the indicator off the course (figure 3-4) (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 315;
        w.obsIn = 242;
        w.selfTestApproved = false;
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);

        w.selfTestApproved = true;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 315°']);
    });

    // #330: the start-up is no DTK change. The DTK of 046° at the approval opens no 30 s window (#177) for a pilot whose
    // indicator is already on it
    it('takes the course at the approval as no DTK change, so it opens no 30 s window (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.selfTestApproved = false;
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        w.selfTestApproved = true;
        w.dtkMag = 46;
        w.obsIn = 46;

        expect(h.tick()).toEqual([]);
    });

    // #330: the engine-running start skips the self-test and counts as approved; its first course is the start-up
    // course as well
    it('takes the first course of a start that skips the self-test as no DTK change (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 46;
        w.obsIn = 46;

        expect(harness(w).tick()).toEqual([]);
    });

    // #330: every power-on starts anew. The last course of the previous power-on (046°) is not compared with the DTK at
    // the next approval (100°), so that DTK opens no window either
    it('takes the course at the approval after a power cycle as no DTK change (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 46;
        w.obsIn = 46;
        const h = harness(w);
        expect(h.tick()).toEqual([]); // Precondition: the start-up course opens no window
        w.selfTestApproved = false; // The next power-on
        expect(h.tick()).toEqual([]);
        w.dtkMag = 100;
        w.obsIn = 100;
        w.selfTestApproved = true;

        expect(h.tick()).toEqual([]);
    });

    // #330: a window opened by a DTK change before a power-off does not show after the approval of the next power-on,
    // although its 30 s have not run out
    it('ends a window from before the power-off at the approval (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 46;
        w.obsIn = 46;
        const h = harness(w);
        h.tick();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']); // Precondition: the DTK change opened the window
        w.selfTestApproved = false; // The next power-on
        expect(h.tick()).toEqual([]);
        vi.advanceTimersByTime(5_000);
        w.selfTestApproved = true;

        expect(h.tick()).toEqual([]);
    });
});
