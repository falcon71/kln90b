import {ComponentProps, DisplayComponent, EventBus, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {Page, PageProps, UIElementChildren} from "./Page";
import {CursorController} from "./CursorController";
import {Inverted} from "../controls/Inverted";
import {TakehomePage} from "./TakehomePage";
import {FourSegmentPage} from "./FourSegmentPage";
import {FiveSegmentPage} from "./FiveSegmentPage";
import {SelfTestLeftPage} from "./left/SelfTestLeftPage";
import {FreetextEditor} from "../controls/editors/FreetextEditor";
import {SelfTestRightPage} from "./right/SelfTestRightPage";
import {
    EVT_ENT,
    EVT_L_CURSOR,
    EVT_L_INNER_LEFT,
    EVT_L_INNER_RIGHT,
    EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT,
} from "../HEvents";
import {PropsReadyEvent} from "../KLN90B";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {PageManager} from "./PageManager";


type WelcomePageChildTypes = {
    welcome1: FreetextEditor;
    welcome2: FreetextEditor;
    welcome3: FreetextEditor;
    welcome4: FreetextEditor;
}

const TEST_TIME = 17000; //https://youtube.com/shorts/9We5fcd2-VE?feature=share https://www.youtube.com/watch?v=8esFTk7Noj8
const TEST_TIME_DEBUG = 0;

export interface WelcomePageProps extends ComponentProps {
    bus: EventBus;

    planeSettings: KLN90PlaneSettings;

    userSettings: KLN90BUserSettings,

    pageManager: PageManager,
}

export class WelcomePage extends DisplayComponent<WelcomePageProps | PageProps> implements Page {

    public readonly lCursorController: CursorController;
    readonly children;
    private readonly startTime = Date.now();

    constructor(props: WelcomePageProps | PageProps) {
        super(props);

        console.log("Welcome page shown");

        const welcome1 = this.props.userSettings.getSetting("welcome1").get();
        const welcome2 = this.props.userSettings.getSetting("welcome2").get();
        const welcome3 = this.props.userSettings.getSetting("welcome3").get();
        const welcome4 = this.props.userSettings.getSetting("welcome4").get();


        this.children = new UIElementChildren<WelcomePageChildTypes>({
            welcome1: new FreetextEditor(this.props.bus, welcome1, 23, this.saveWelcome1.bind(this)),
            welcome2: new FreetextEditor(this.props.bus, welcome2, 23, this.saveWelcome2.bind(this)),
            welcome3: new FreetextEditor(this.props.bus, welcome3, 23, this.saveWelcome3.bind(this)),
            welcome4: new FreetextEditor(this.props.bus, welcome4, 23, this.saveWelcome4.bind(this)),
        });


        this.lCursorController = new CursorController(this.children);

        this.props.bus.getSubscriber<PropsReadyEvent>().on("propsReady").handle(this.setProps.bind(this));
    }

    onInteractionEvent(evt: string): boolean {
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
                this.lCursorController.enter();
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

    public tick(blink: boolean): void {
        const now = Date.now();

        const testTime = this.props.planeSettings.debugMode ? TEST_TIME_DEBUG : TEST_TIME;

        //The real device takes about 15 seconds. That's plenty of time to initialize all sorts of facilityLoaders,
        // searchsessions and caches
        if (now - this.startTime > testTime && !this.lCursorController.cursorActive && this.arePropsReady(this.props)) {
            if (this.props.planeSettings.debugMode) {
                //We got no time for that
                this.props.sensors.in.gps.startGPSSearch();
                this.props.sensors.in.gps.gpsSatComputer.acquireAndUseSatellites();
                this.props.pageManager.startMainPage(this.props);
            } else if (this.props.planeSettings.takeHomeMode) {
                this.props.pageManager.setCurrentPage(FourSegmentPage, {
                    ...this.props,
                    page: new TakehomePage(this.props),
                });
            } else {
                this.props.pageManager.setCurrentPage(FiveSegmentPage, {
                    ...this.props,
                    lPage: new SelfTestLeftPage(this.props),
                    rPage: new SelfTestRightPage(this.props),
                });
            }
        }
    }

    public isMessagePageShown(): boolean {
        return false;
    }

    private setProps(props: PageProps) {
        this.props = props;
    }

    private arePropsReady(props: WelcomePageProps | PageProps): props is PageProps {
        return "memory" in this.props && this.props.memory.isReady;
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
}