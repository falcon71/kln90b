import {DisplayComponent, FSComponent, NodeReference, Subscription, VNode} from "@microsoft/msfs-sdk";
import {TICK_TIME_DISPLAY, TickController} from "../TickController";
import {NO_CHILDREN, Page, PageProps, UiElement} from "../pages/Page";
import {NavMode} from "../data/VolatileMemory";
import {padInt} from "../data/NumberFormat";
import {roundBearing} from "../data/Coordinates";
import {ScratchpadMessage} from "../data/MessageHandler";
import {isWptLightOn} from "../data/navdata/WaypointAlert";


export interface StatusLineProps extends PageProps {
    screen: Page;
}

export type StatusLineMessage =
    "ACTIVE WPT" |
    `d› CRS ${string}°` |
    "DUP IDENT" |
    "ENT LAT/LON" |
    "FPL FULL" |
    "IN ACT LIST" |
    "INVALID ADD" |
    "INVALID DEL" |
    "INVALID ENT" |
    "INVALID REF" |
    "INVALID VNV" |
    "NO ACTV WPT" |
    "NO APPROACH" |
    "NO APT WPTS" |
    "NO INT WPTS" |
    "NO INTRCEPT" |
    "NO NDB WPTS" |
    "NO SUCH WPT" |
    "NO SUP WPTS" |
    "NO VOR WPTS" |
    "OUTDATED DB" |
    "RMKS FULL" |
    "USED IN FPL" |
    "USR DB FULL";

const STATUS_MESSAGE_TIME = 5000;

export interface StatusLineMessageEvents {
    statusLineMessage: StatusLineMessage;
}

export interface KeyboardEventData {
    side: 'LEFT' | 'RIGHT';
    keyCode: number;
}

export interface KeyboardEvent {
    keyboardevent: KeyboardEventData;
}


export class StatusLine extends DisplayComponent<StatusLineProps> implements UiElement {

    readonly children = NO_CHILDREN;
    public isVisible = true;
    private readonly containerRef: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();
    private readonly leftPageRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private readonly statusRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private readonly modeRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private readonly rightPageRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private readonly msgEntRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private readonly statusLineMessageRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    //The message on the status line. It is also an entry of the MessageHandler, so the MSG page lists it
    private scratchpad: ScratchpadMessage | null = null;
    private sub: Subscription;

    constructor(props: StatusLineProps) {
        super(props);

        this.sub = props.bus.getSubscriber<StatusLineMessageEvents>().on("statusLineMessage").handle(this.showMessage.bind(this), true);

        this.sub.resume(false); //We don't care about old notifications from ages ago
    }

    render(): VNode {
        return (<pre ref={this.containerRef}>
            <span class="statusline">
            <span ref={this.leftPageRef}>{this.props.screen.leftPageName()}</span>
            |<span ref={this.statusLineMessageRef} class="d-none inverted"></span><span ref={this.statusRef}><span
                ref={this.modeRef}>{this.getModeString()}</span> <span ref={this.msgEntRef}>   </span></span>|
            <span ref={this.rightPageRef}>{this.props.screen.rightPageName()}</span>
             <br/>
            </span>
        </pre>);
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.leftPageRef, this.modeRef, this.msgEntRef, this.rightPageRef, this.statusRef)) {
            return;
        }


        if (this.isVisible) {
            this.containerRef.instance.classList.remove("d-none");
        } else {
            this.containerRef.instance.classList.add("d-none");
        }

        this.tickScratchpad();

        if (this.scratchpad === null) {
            this.statusLineMessageRef.instance.classList.add("d-none");
            this.statusRef.instance.classList.remove("d-none");

            if (this.props.screen.isEnterAccepted()) {
                this.msgEntRef.instance.textContent = "ent";
                if (blink) {
                    this.msgEntRef.instance.classList.add("blink");
                } else {
                    this.msgEntRef.instance.classList.remove("blink");
                }
                this.msgEntRef.instance.classList.remove("inverted");
            } else if (this.props.messageHandler.hasMessages()) {
                this.msgEntRef.instance.classList.add("inverted");
                this.msgEntRef.instance.classList.remove("blink"); //the ent prompt may have ended in its blink phase
                this.msgEntRef.instance.textContent = "msg";

                if (this.props.messageHandler.hasUnreadMessages()) {
                    if (blink) {
                        this.msgEntRef.instance.classList.add("inverted-blink");
                    } else {
                        this.msgEntRef.instance.classList.remove("inverted-blink");
                    }
                } else {
                    this.msgEntRef.instance.classList.remove("inverted-blink");
                }
            } else if (this.props.screen.isMessagePageShown()) {
                //https://youtu.be/-7xleA3Hz3Y?t=137
                this.msgEntRef.instance.textContent = "msg";
                this.msgEntRef.instance.classList.remove("inverted", "blink", "inverted-blink");

            } else {
                this.msgEntRef.instance.classList.remove("inverted", "blink", "inverted-blink");
                this.msgEntRef.instance.textContent = "   ";
            }
        } else {
            this.statusLineMessageRef.instance.textContent = this.scratchpad.message[0].padEnd(11, " ");
            this.statusLineMessageRef.instance.classList.remove("d-none");
            this.statusRef.instance.classList.add("d-none");
        }

        if (this.props.screen.leftPageName() === "SET 0") {
            this.modeRef.instance.textContent = "       "; //3-7, this page is a bit special
        } else {
            this.modeRef.instance.textContent = this.getModeString();
        }


        if (this.props.screen.isLeftCursorActive()) {
            this.leftPageRef.instance.classList.add("inverted", "offset-left-cursor");
            if (this.props.pageManager.isLeftKeyboardActive()) {
                this.leftPageRef.instance.textContent = "KYBD";
                if (blink) {
                    this.leftPageRef.instance.classList.add("inverted-blink");
                } else {
                    this.leftPageRef.instance.classList.remove("inverted-blink");
                }
            } else {
                this.leftPageRef.instance.textContent = "CRSR";
                this.leftPageRef.instance.classList.remove("inverted-blink");
            }
        } else {
            this.leftPageRef.instance.textContent = this.props.screen.leftPageName().padEnd(5, " ");
            this.leftPageRef.instance.classList.remove("inverted", "inverted-blink", "offset-left-cursor");
        }


        if (this.props.screen.isRightCursorActive()) {
            this.rightPageRef.instance.classList.add("inverted");
            if (this.props.pageManager.isRightKeyboardActive()) {
                this.rightPageRef.instance.textContent = "KYBD";
                if (blink) {
                    this.rightPageRef.instance.classList.add("inverted-blink");
                } else {
                    this.rightPageRef.instance.classList.remove("inverted-blink");
                }
            } else {
                this.rightPageRef.instance.textContent = "CRSR";
                this.rightPageRef.instance.classList.remove("inverted-blink");
            }
        } else {
            if (this.props.screen.leftPageName() === "SET 0") {
                this.rightPageRef.instance.textContent = "     ";  //3-7, this page is a bit special
            } else {
                this.rightPageRef.instance.textContent = this.props.screen.rightPageName().padEnd(5, " ");
            }
            this.rightPageRef.instance.classList.remove("inverted", "inverted-blink");
        }

        //Odd place to put this, but the problem is, we need access to blink
        if (this.props.memory.navPage.isSelfTestActive) {
            this.props.sensors.out.setMessageLight(true);
        } else if (this.props.messageHandler.hasMessages()) {
            if (this.props.messageHandler.hasUnreadMessages()) {
                this.props.sensors.out.setMessageLight(!blink); //Flashing https://youtu.be/S1lt2W95bLA?si=C45kt8pik15Iodoy&t=2245
            } else {
                this.props.sensors.out.setMessageLight(true);  //Alway on: https://youtu.be/S1lt2W95bLA?si=RZ0ki0BAj-BOQwSD&t=822
            }
        } else {
            this.props.sensors.out.setMessageLight(false);
        }

        //The external WPT light flashes during the alert before a turn and is steady from the start of the turn (3-29, 4-8,
        //Tu-154 video https://youtu.be/S1lt2W95bLA?t=2245, #437). Like the MSG light it is written here, where blink is known
        this.props.sensors.out.setWptAlertLight(isWptLightOn(this.props.memory.navPage, blink));
    }

    destroy() {
        console.log("destroy StatusLine");
        this.sub.destroy();
        this.endScratchpad(); //a screen change or a power-off leaves no entry behind
        super.destroy();
    }

    /**
     * 3-10
     * @param message
     */
    public showMessage(message: StatusLineMessage): void {
        //A newer message replaces the older one and gets its own 5 seconds. The AVsoftech 90B trainer keeps the first
        //one's clock instead (2026-10-24, one sample), too rare to trust it on, see the characterization test
        this.endScratchpad();
        this.scratchpad = new ScratchpadMessage(message);
        this.props.messageHandler.addMessage(this.scratchpad);
    }

    /**
     * 3-10: a message stays on the status line for about 5 seconds, counted from the first time the status line shows it
     * (AVsoftech 90B trainer, 2026-10-24). The clock runs on while Super NAV 5 hides the status line again, but the
     * message ends only while the status line is visible, so it waits there, and clears at once when the status line
     * returns. A message posted on a visible page stays on screen as long as it always did.
     */
    private tickScratchpad(): void {
        const scratchpad = this.scratchpad;
        if (scratchpad === null) {
            return;
        }
        if (scratchpad.elapsedMs === null) {
            if (this.isVisible) {
                scratchpad.elapsedMs = 0;
            }
        } else {
            scratchpad.elapsedMs += TICK_TIME_DISPLAY;
        }
        if (this.isVisible && scratchpad.elapsedMs !== null && scratchpad.elapsedMs >= STATUS_MESSAGE_TIME) {
            this.endScratchpad(); //before the light and the prompt below, so that both follow on this tick
        }
    }

    private endScratchpad(): void {
        if (this.scratchpad !== null) {
            this.scratchpad.ended = true;
            this.props.messageHandler.removeMessage(this.scratchpad);
            this.scratchpad = null;
        }
    }

    private getModeString(): string {
        switch (this.props.memory.navPage.navmode) {
            case NavMode.ENR_LEG:
                return "enr-leg";
            case NavMode.ENR_OBS:
                return `enr:${padInt(roundBearing(this.props.modeController.getObsMag()), 3)}`;
            case NavMode.ARM_LEG:
                return "arm-leg";
            case NavMode.ARM_OBS:
                return `arm:${padInt(roundBearing(this.props.modeController.getObsMag()), 3)}`;
            case NavMode.APR_LEG:
                return "apr-leg";
        }
    }

}