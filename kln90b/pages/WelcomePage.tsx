import {ComponentProps, DisplayComponent, EventBus, FSComponent, Subscription, VNode} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {Page, PageProps, UIElementChildren} from "./Page";
import {CursorController} from "./CursorController";
import {Inverted} from "../controls/Inverted";
import {TakehomePage} from "./TakehomePage";
import {FourSegmentPage} from "./FourSegmentPage";
import {FiveSegmentPage} from "./FiveSegmentPage";
import {SelfTestLeftPage} from "./left/SelfTestLeftPage";
import {FreetextEditor} from "../controls/editors/FreetextEditor";
import {ErrorEvent, reportErrors} from "../controls/ErrorPage";
import {SelfTestRightPage} from "./right/SelfTestRightPage";
import {
    EVT_ENT,
    EVT_L_CURSOR,
    EVT_L_INNER_LEFT,
    EVT_L_INNER_RIGHT,
    EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT,
} from "../HEvents";
import {PropsReadyEvent} from "../KLN90BCore";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {PageManager} from "./PageManager";
import {KeyboardService} from "../services/KeyboardService";
import {FACILITY_INITIALIZATION, PendingCall, PendingCalls} from "../services/PendingCalls";
import {OneTimeMessage} from "../data/MessageHandler";


type WelcomePageChildTypes = {
    welcome1: FreetextEditor;
    welcome2: FreetextEditor;
    welcome3: FreetextEditor;
    welcome4: FreetextEditor;
}

//Maintenance manual says 15 seconds (page 84)
const TEST_TIME = 17000; //https://youtube.com/shorts/9We5fcd2-VE?feature=share https://www.youtube.com/watch?v=8esFTk7Noj8

export interface WelcomePageProps extends ComponentProps {
    bus: EventBus;

    planeSettings: KLN90PlaneSettings;

    userSettings: KLN90BUserSettings,

    pageManager: PageManager,

    forceReadyToUse: boolean,

    pendingCalls: PendingCalls,
}

export class WelcomePage extends DisplayComponent<WelcomePageProps | PageProps> implements Page {

    public readonly lCursorController: CursorController;
    readonly children;
    private readonly startTime = Date.now();
    private propsReadySub: Subscription | undefined;

    /**
     * #416: the failure of this power-on's self-test, or null while it has not failed. The first failure decides it, also
     * when the call that hung answers later (spec 4.2); the page hands it on to VolatileMemory when it leaves
     */
    private failure: Error | null = null;

    private readonly forceReadyToUse; //True if the aircraft was started on the runway. We skip all test pages
    constructor(props: WelcomePageProps | PageProps) {
        super(props);

        console.log("Welcome page shown", props);

        const welcome1 = this.props.userSettings.getSetting("welcome1").get();
        const welcome2 = this.props.userSettings.getSetting("welcome2").get();
        const welcome3 = this.props.userSettings.getSetting("welcome3").get();
        const welcome4 = this.props.userSettings.getSetting("welcome4").get();

        if ("forceReadyToUse" in props && props.forceReadyToUse) {
            this.forceReadyToUse = props.forceReadyToUse;
        } else {
            this.forceReadyToUse = this.props.planeSettings.debugMode;
        }

        this.children = new UIElementChildren<WelcomePageChildTypes>({
            welcome1: new FreetextEditor(this.props.bus, welcome1, 23, this.saveWelcome1.bind(this)),
            welcome2: new FreetextEditor(this.props.bus, welcome2, 23, this.saveWelcome2.bind(this)),
            welcome3: new FreetextEditor(this.props.bus, welcome3, 23, this.saveWelcome3.bind(this)),
            welcome4: new FreetextEditor(this.props.bus, welcome4, 23, this.saveWelcome4.bind(this)),
        });


        this.lCursorController = new CursorController(this.children);

        this.propsReadySub = this.props.bus.getSubscriber<PropsReadyEvent>().on("propsReady").handle(this.setProps.bind(this));
    }

    onInteractionEvent(evt: string): boolean {
        KeyboardService.routeKeyboardEvent(evt, this.lCursorController, this.lCursorController);

        switch (evt) {
            case EVT_L_CURSOR:
                return this.lCursorController.toggleCursor();
            case EVT_L_OUTER_LEFT:
                return this.lCursorController.outerLeft();
            case EVT_L_OUTER_RIGHT:
                return this.lCursorController.outerRight();
            case EVT_L_INNER_LEFT:
                return this.lCursorController.innerLeft();
            case EVT_L_INNER_RIGHT:
                return this.lCursorController.innerRight();
            case EVT_ENT:
                reportErrors(this.lCursorController.enter(), this.props.bus);
                return true;
        }

        return false;
    }

    isEnterAccepted(): boolean {
        return this.lCursorController.isEnterAccepted();
    }

    isLeftCursorActive(): boolean {
        return this.lCursorController.cursorActive;
    }

    isRightCursorActive(): boolean {
        return false;
    }

    leftPageName(): string {
        return "";
    }

    rightPageName(): string {
        return "";
    }

    public destroy(): void {
        this.propsReadySub?.destroy(); //#96
        super.destroy();
    }

    public render(): VNode {
        return (<pre class="full-page">
            <span> GPS             ORS 20</span><br/>
            <span> ©1994 ALLIEDSIGNAL INC</span><br/>
            {this.children.get("welcome1").render()}<br/>
            {this.children.get("welcome2").render()}<br/>
            {this.children.get("welcome3").render()}<br/>
            {this.children.get("welcome4").render()}<br/>
            <span> <Inverted>SELF TEST IN PROGRESS</Inverted> </span>
        </pre>);
    }

    /**
     * 3-3: the Turn-On page shows while the unit runs its internal test, and the Self Test page replaces it once the test is
     * complete. The test fails (#416, spec 4.2) when a scan list could not be built, or when a call of the start-up has not
     * answered for HANG_TIME_MS; a failed test shows TEST FAIL on the Self Test page (3-4)
     */
    public tick(blink: boolean): void {
        const now = Date.now();

        this.checkSelfTest(now);

        //The real device takes about 15 seconds. That's plenty of time to initialize all sorts of facilityLoaders,
        // searchsessions and caches
        if ((now - this.startTime > TEST_TIME || this.forceReadyToUse) && !this.lCursorController.cursorActive && this.arePropsThere(this.props)
            && (this.props.memory.isReady || this.failure !== null)) {
            if (this.failure !== null) {
                this.leaveFailed(this.props, this.failure);
            } else if (this.forceReadyToUse) {
                //We got no time for that
                this.props.sensors.in.gps.gpsSatComputer.acquireAndUseSatellites();
                this.props.memory.navPage.isSelfTestApproved = true; //A skipped self-test counts as approved (#330)
                this.props.pageManager.startMainPage(this.props);
            } else {
                this.showSelfTestPage(this.props);
            }
        }
    }

    /**
     * #416: finds the failure of the self-test, once per power-on, and shows it on the error page, naming the call that
     * hung. The cursor rule does not hold it back. Once the props are there, only the calls of this power-on count: one
     * left pending by an earlier power-on does not fail it (spec 4.3). Before, the boot itself waits on every pending call
     */
    private checkSelfTest(now: number): void {
        if (this.failure !== null) {
            return;
        }

        const props = this.props;
        const propsThere = this.arePropsThere(props);
        if (propsThere && props.memory.selfTestFailure !== null) {
            this.failure = WelcomePage.withContext(props.memory.selfTestFailure);
        } else if (!(propsThere && props.memory.isReady)) {
            const hung = props.pendingCalls.findHung(now, propsThere ? this.startTime : -Infinity);
            if (hung !== null) {
                this.failure = new Error(WelcomePage.hangMessage(hung, now));
            }
        }

        if (this.failure !== null) {
            props.bus.getPublisher<ErrorEvent>().pub("error", this.failure);
        }
    }

    /** The error page shows the error without its context, so a rejection from the reset names the self-test */
    private static withContext(failure: Error): Error {
        const error = new Error(`Start-up self-test failed: ${failure.message}`);
        error.stack = failure.stack; //The original stack points at the call that failed
        return error;
    }

    private static hangMessage(hung: PendingCall, now: number): string {
        const seconds = Math.floor((now - hung.started) / 1000);
        return hung.description === FACILITY_INITIALIZATION
            ? `Start-up self-test failed: the sim's facility initialization has not completed for ${seconds} s`
            : `Start-up self-test failed: ${hung.description} has not answered for ${seconds} s`;
    }

    /**
     * #416: a failed unit goes on as the real one does (spec 4.2). The message is read on the MSG page after APPROVE?
     * (maintenance manual 1022); DATA BASE CHECKSUM ERR is the message of a database that fails its power-on test (B-2).
     * The Self Test page shows TEST FAIL, also with the engine running, where the GPS acquires at once as after a passed
     * test, but the test is not counted as approved: the pilot approves it with APPROVE?
     */
    private leaveFailed(props: PageProps, failure: Error): void {
        if (props.memory.selfTestFailure === null) {
            props.memory.selfTestFailure = failure; //A failure found before the props were there, or a hang
        }
        props.messageHandler.addMessage(new OneTimeMessage(["DATA BASE CHECKSUM ERR"]));
        if (this.forceReadyToUse) {
            props.sensors.in.gps.gpsSatComputer.acquireAndUseSatellites();
        }
        this.showSelfTestPage(props);
    }

    /** The Self Test page, after the Take-Home warning in take-home mode */
    private showSelfTestPage(props: PageProps): void {
        if (props.planeSettings.takeHomeMode) {
            props.pageManager.setCurrentPage(FourSegmentPage, {
                ...props,
                page: new TakehomePage(props),
            });
        } else {
            props.pageManager.setCurrentPage(FiveSegmentPage, {
                ...props,
                lPage: new SelfTestLeftPage(props),
                rPage: new SelfTestRightPage(props),
            });
        }
    }

    public isMessagePageShown(): boolean {
        return false;
    }

    private setProps(props: PageProps) {
        this.props = props;
    }

    /** Whether propsReady has been published, so that the services exist */
    private arePropsThere(props: WelcomePageProps | PageProps): props is PageProps {
        return "memory" in props;
    }

    private saveWelcome1(welcome1: string): void {
        this.props.userSettings.getSetting("welcome1").set(welcome1);
    }

    private saveWelcome2(welcome2: string): void {
        this.props.userSettings.getSetting("welcome2").set(welcome2);
    }

    private saveWelcome3(welcome3: string): void {
        this.props.userSettings.getSetting("welcome3").set(welcome3);
    }

    private saveWelcome4(welcome4: string): void {
        this.props.userSettings.getSetting("welcome4").set(welcome4);
    }

    public hasStatusline(): boolean {
        return false;
    }
}