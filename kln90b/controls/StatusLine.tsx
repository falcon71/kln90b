import {DisplayComponent, FSComponent, NodeReference, Publisher, Subscription, VNode} from "@microsoft/msfs-sdk";
import {TICK_TIME_DISPLAY, TickController} from "../TickController";
import {NO_CHILDREN, Page, PageProps, UiElement} from "../pages/Page";
import {NavMode} from "../data/VolatileMemory";
import {format} from "numerable";
import {CHAR_HEIGHT, CHAR_WIDTH, MARGIN_X, MARGIN_Y, ZOOM_FACTOR} from "../data/Constants";


export interface StatusLineProps extends PageProps {
    screen: Page;
}

export type KLNErrorMessage =
    "ACTIVE WPT" |
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
    statusLineMessage: KLNErrorMessage;
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

    private keyboardRef: NodeReference<HTMLInputElement> = FSComponent.createRef<HTMLInputElement>();

    private statusLineMessage: KLNErrorMessage | null = null;
    private statusLineMessageTimer: number = 0;
    private sub: Subscription;
    private readonly keyboardPublisher: Publisher<KeyboardEvent>;

    private keyBoardInitialized = false;
    private isLeftKeyboardActive = false;
    private isRightKeyboardActive = false;
    private readonly keyboardId = this.genGuid();

    constructor(props: StatusLineProps) {
        super(props);

        this.sub = props.bus.getSubscriber<StatusLineMessageEvents>().on("statusLineMessage").handle(this.showMessage.bind(this), true);

        this.keyboardPublisher = props.bus.getPublisher<KeyboardEvent>();
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
            <input class="keyboard" ref={this.keyboardRef}></input>
        </pre>);
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.leftPageRef, this.modeRef, this.msgEntRef, this.rightPageRef, this.statusRef, this.keyboardRef)) {
            return;
        }

        if (!this.keyBoardInitialized) {
            this.setupKeyboard();
        }

        if (this.isVisible) {
            this.containerRef.instance.classList.remove("d-none");
        } else {
            this.containerRef.instance.classList.add("d-none");
        }

        if (this.statusLineMessageTimer > 0) {
            this.statusLineMessageTimer -= TICK_TIME_DISPLAY;
        } else {
            this.statusLineMessage = null;
        }

        if (this.statusLineMessage === null) {
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
            this.statusLineMessageRef.instance.textContent = this.statusLineMessage.padEnd(11, " ");
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
            if (this.isLeftKeyboardActive) {
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
            if (this.isLeftKeyboardActive) {
                this.keyboardRef.instance.blur();
            }

            this.leftPageRef.instance.textContent = this.props.screen.leftPageName().padEnd(5, " ");
            this.leftPageRef.instance.classList.remove("inverted", "inverted-blink", "offset-left-cursor");
        }


        if (this.props.screen.isRightCursorActive()) {
            this.rightPageRef.instance.classList.add("inverted");
            if (this.isRightKeyboardActive) {
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
            if (this.isRightKeyboardActive) {
                this.keyboardRef.instance.blur();
            }

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
    }

    destroy() {
        console.log("destroy StatusLine");
        this.sub.destroy();
        if (this.isLeftKeyboardActive || this.isRightKeyboardActive) { //Very important that we clean up, otherwise the user cannot click anything
            this.keyboardRef.instance.blur();
        }
        super.destroy();
    }

    private setupKeyboard() {
        console.log("Setting up keyboards");

        this.keyBoardInitialized = true;

        this.keyboardRef.instance.onkeydown = (event) => {
            //console.log(event);
            const side = this.isLeftKeyboardActive ? 'LEFT' : 'RIGHT';
            this.keyboardPublisher.pub("keyboardevent", {side: side, keyCode: event.keyCode});
            event.preventDefault();
        };
        this.keyboardRef.instance.onkeypress = (event) => {
            //console.log(event);
            if (event.keyCode == 13) { //Enter somehow does not trigger onkeydown
                const side = this.isLeftKeyboardActive ? 'LEFT' : 'RIGHT';
                this.keyboardPublisher.pub("keyboardevent", {side: side, keyCode: event.keyCode});
                event.preventDefault();
                this.keyboardRef.instance.value = "";
            }
        };
        this.keyboardRef.instance.onblur = (event) => {
            console.log(event);
            this.isLeftKeyboardActive = false;
            this.isRightKeyboardActive = false;

            Coherent.trigger('UNFOCUS_INPUT_FIELD', '');
            Coherent.off('mousePressOutsideView');
        };
        this.keyboardRef.instance.onmousedown = (event) => {
            console.log(event);
            if (event.button == 0) { //Left Click
                if (this.props.screen.isLeftCursorActive() && !this.isLeftKeyboardActive && this.isWithinX(event.screenX, 1, 5) && this.isWithinY(event.screenY, 6)) {
                    this.keyboardRef.instance.value = "";

                    if (this.isRightKeyboardActive) {
                        this.keyboardRef.instance.blur();
                    }

                    this.isLeftKeyboardActive = true;
                    Coherent.trigger('FOCUS_INPUT_FIELD', this.keyboardId, '', '', '', false);
                    Coherent.on('mousePressOutsideView', () => {
                        console.log('mousePressOutsideView');
                        this.keyboardRef.instance.blur();
                    });
                }

                if (this.props.screen.isRightCursorActive() && !this.isRightKeyboardActive && this.isWithinX(event.screenX, 18, 22) && this.isWithinY(event.screenY, 6)) {
                    this.keyboardRef.instance.value = "";

                    if (this.isLeftKeyboardActive) {
                        this.keyboardRef.instance.blur();
                    }

                    this.isRightKeyboardActive = true;
                    Coherent.trigger('FOCUS_INPUT_FIELD', this.keyboardId, '', '', '', false);
                    Coherent.on('mousePressOutsideView', () => {
                        console.log('mousePressOutsideView');
                        this.keyboardRef.instance.blur();
                    });
                }
            } else if (event.button == 2) {  //Right click
                if ((this.isLeftKeyboardActive || this.isRightKeyboardActive)) {
                    this.keyboardRef.instance.blur();
                }
            }

        };
    }

    private isWithinX(screenX: number, charLeft: number, charRight: number) {
        return screenX >= (MARGIN_X + charLeft * CHAR_WIDTH) * ZOOM_FACTOR && screenX <= (MARGIN_X + (charRight) * CHAR_WIDTH) * ZOOM_FACTOR;
    }

    /**
     * 3-10
     * @param message
     */
    public showMessage(message: KLNErrorMessage): void {
        this.statusLineMessage = message;
        this.statusLineMessageTimer = STATUS_MESSAGE_TIME;

    }

    private isWithinY(screenY: number, row: number) {
        return screenY >= (MARGIN_Y + row * CHAR_HEIGHT) * ZOOM_FACTOR && screenY <= (MARGIN_Y + (row + 1) * CHAR_HEIGHT) * ZOOM_FACTOR;
    }

    private getModeString(): string {
        switch (this.props.memory.navPage.navmode) {
            case NavMode.ENR_LEG:
                return "enr-leg";
            case NavMode.ENR_OBS:
                return `enr:${format(this.props.memory.navPage.obsMag, "000")}`;
            case NavMode.ARM_LEG:
                return "arm-leg";
            case NavMode.ARM_OBS:
                return `arm:${format(this.props.memory.navPage.obsMag, "000")}`;
            case NavMode.APR_LEG:
                return "apr-leg";
        }
    }

    /**
     * Generates a unique id.
     * @returns A unique ID string.
     */
    private genGuid(): string {
        return 'INPT-xxxyxxyy'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}