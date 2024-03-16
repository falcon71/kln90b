import {
    ComponentProps,
    DisplayComponent,
    DisplayComponentFactory,
    EventBus,
    FSComponent,
    NodeReference,
    Publisher,
    VNode,
} from "@microsoft/msfs-sdk";
import {DisplayTickable, TickController} from "../TickController";
import {Page, PageProps} from "../pages/Page";
import {CHAR_HEIGHT, CHAR_WIDTH, MARGIN_X, MARGIN_Y, ZOOM_FACTOR} from "../data/Constants";
import {KeyboardEvent} from "./StatusLine";
import {PowerEvent} from "../PowerButton";


export interface PageContainerProps extends ComponentProps {
    bus: EventBus;
}

/**
 * This class is needed, so the keyboard is always available and retains its state if the active page changes
 */
export class PageContainer extends DisplayComponent<PageContainerProps> implements DisplayTickable {

    private keyboardRef: NodeReference<HTMLInputElement> = FSComponent.createRef<HTMLInputElement>();
    private containerRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private readonly keyboardPublisher: Publisher<KeyboardEvent>;

    private keyBoardInitialized = false;
    private readonly keyboardId = this.genGuid();
    private currentPage: DisplayComponent<PageProps> & Page | undefined;

    constructor(props: PageContainerProps) {
        super(props);

        this.keyboardPublisher = props.bus.getPublisher<KeyboardEvent>();
        props.bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.resetKeyboard.bind(this));
    }

    private _isLeftKeyboardActive = false;

    public get isLeftKeyboardActive(): boolean {
        return this._isLeftKeyboardActive;
    }

    private _isRightKeyboardActive = false;

    public get isRightKeyboardActive(): boolean {
        return this._isRightKeyboardActive;
    }

    render(): VNode {
        return (<div>
            <div id="pageContainer" ref={this.containerRef}></div>
            <input class="keyboard" ref={this.keyboardRef}></input>
        </div>);
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.keyboardRef)) {
            return;
        }

        if (!this.keyBoardInitialized) {
            this.setupKeyboard();
        }

        if (!this.getCurrentPage().isLeftCursorActive() && this._isLeftKeyboardActive) {
            this.resetKeyboard();
        }
        if (!this.getCurrentPage().isRightCursorActive() && this._isRightKeyboardActive) {
            this.resetKeyboard();
        }


        this.getCurrentPage().tick(blink);
        this.getCurrentPage().children.walk((el) => el.tick(blink));
    }

    public setCurrentPage<T extends ComponentProps>(type: DisplayComponentFactory<T>, props: T) {
        //todo this is too fast, we must move the rerendering to the next tick!
        this.currentPage?.destroy();

        const page = FSComponent.buildComponent(type, props);
        this.currentPage = page?.instance as unknown as DisplayComponent<PageProps> & Page;

        this.rerenderCurrentPage();
    }

    onInteractionEvent(evt: string): void {
        this.currentPage!.onInteractionEvent(evt);
    }

    public getCurrentPage(): (DisplayComponent<PageProps> & Page) {
        return this.currentPage!;
    }

    public rerenderCurrentPage() {
        this.containerRef.instance.innerHTML = "";

        FSComponent.render(this.currentPage!.render()!, this.containerRef.instance);
    }

    destroy() {
        console.log("destroy PageContainer");
        if (this._isLeftKeyboardActive || this._isRightKeyboardActive) { //Very important that we clean up, otherwise the user cannot click anything
            this.resetKeyboard();
        }
        super.destroy();
    }

    public resetKeyboard() {
        this.keyboardRef.instance.blur();
    }

    private setupKeyboard() {
        /**
         * The keyboard works like this:
         * We have one huge unvisible input element on top of the screen.
         * We capture all mouse clicks, if it is a left click and at the region of the CRSR fields, we enter
         * keyboard mode by focusing the input element
         * We capture all keys and send them via the event bus
         * Left clicks do nothing, because repeated enter keys trigger a left click
         * Right click causes a blur. We check every tick if the cursor for the keyboard is still active, if not it will
         * trigger a blur.
         * All blurs exit keyboard mode.
         */

        console.log("Setting up keyboards");

        this.keyBoardInitialized = true;

        this.keyboardRef.instance.onkeydown = (event) => {
            //console.log(event);
            const side = this._isLeftKeyboardActive ? 'LEFT' : 'RIGHT';
            this.keyboardPublisher.pub("keyboardevent", {side: side, keyCode: event.keyCode});
            event.preventDefault();
        };
        this.keyboardRef.instance.onkeypress = (event) => {
            //console.log(event);
            if (event.keyCode == 13) { //Enter somehow does not trigger onkeydown
                const side = this._isLeftKeyboardActive ? 'LEFT' : 'RIGHT';
                this.keyboardPublisher.pub("keyboardevent", {side: side, keyCode: event.keyCode});
                event.preventDefault();
                this.keyboardRef.instance.value = "";
            }
        };
        this.keyboardRef.instance.onblur = (event) => {
            console.log(event);
            this._isLeftKeyboardActive = false;
            this._isRightKeyboardActive = false;

            Coherent.trigger('UNFOCUS_INPUT_FIELD', '');
            Coherent.off('mousePressOutsideView');
        };
        this.keyboardRef.instance.onmousedown = (event) => {
            console.log(event);
            if (event.button == 0) { //Left Click
                if (this.currentPage!.isLeftCursorActive() && this.currentPage!.hasStatusline() && !this._isLeftKeyboardActive && this.isWithinX(event.screenX, 1, 5) && this.isWithinY(event.screenY, 6)) {
                    this.keyboardRef.instance.value = "";

                    if (this._isRightKeyboardActive) {
                        this.resetKeyboard();
                    }

                    this._isLeftKeyboardActive = true;
                    Coherent.trigger('FOCUS_INPUT_FIELD', this.keyboardId, '', '', '', false);
                    Coherent.on('mousePressOutsideView', () => {
                        console.log('mousePressOutsideView');
                        this.resetKeyboard();
                    });
                }

                if (this.currentPage!.isRightCursorActive() && this.currentPage!.hasStatusline() && !this._isRightKeyboardActive && this.isWithinX(event.screenX, 18, 22) && this.isWithinY(event.screenY, 6)) {
                    this.keyboardRef.instance.value = "";

                    if (this._isLeftKeyboardActive) {
                        this.resetKeyboard();
                    }

                    this._isRightKeyboardActive = true;
                    Coherent.trigger('FOCUS_INPUT_FIELD', this.keyboardId, '', '', '', false);
                    Coherent.on('mousePressOutsideView', () => {
                        console.log('mousePressOutsideView');
                        this.resetKeyboard();
                    });
                }
            } else if (event.button == 2) {  //Right click
                if ((this._isLeftKeyboardActive || this._isRightKeyboardActive)) {
                    this.resetKeyboard();
                }
            }

        };
    }

    private isWithinX(screenX: number, charLeft: number, charRight: number) {
        return screenX >= (MARGIN_X + charLeft * CHAR_WIDTH) * ZOOM_FACTOR && screenX <= (MARGIN_X + (charRight) * CHAR_WIDTH) * ZOOM_FACTOR;
    }

    private isWithinY(screenY: number, row: number) {
        return screenY >= (MARGIN_Y + row * CHAR_HEIGHT) * ZOOM_FACTOR && screenY <= (MARGIN_Y + (row + 1) * CHAR_HEIGHT) * ZOOM_FACTOR;
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