import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {NO_CHILDREN, PageProps, UIElementChildren} from "../Page";
import {CursorController, NO_CURSOR_CONTROLLER} from "../CursorController";
import {Button} from "../../controls/Button";
import {SixLinePage} from "../FourSegmentPage";
import {TextDisplay} from "../../controls/displays/TextDisplay";


type Set0PageTypes = {
    line2: TextDisplay,
    line3: TextDisplay,
    line5: TextDisplay,

    button: Button,
}

const key = "C70220BE";

/**
 * We fake the update screen as far as you would get without a connection.
 * The whole procedure can be seen here: https://youtu.be/7l57UDAuz8A
 */

export class Set0Page extends SixLinePage {

    readonly children: UIElementChildren<Set0PageTypes>;

    public readonly lCursorController: CursorController;
    public readonly rCursorController: CursorController = NO_CURSOR_CONTROLLER;

    readonly name: string = "SET 0";

    private step: number = 0;

    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private requiresRedraw: boolean = false;


    constructor(props: PageProps) {
        super(props);


        this.children = new UIElementChildren<Set0PageTypes>({
            line2: new TextDisplay("   O N   G R O U N D"),
            line3: new TextDisplay("        O N L Y "),
            line5: new TextDisplay(`     KEY ${key}`),
            button: new Button("UPDATE PUBLISHED DB", this.next.bind(this)),
        });

        this.children.get("button").isVisible = false; //No readonly though, otherwise the cursor would not work

        this.lCursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (
            <div ref={this.ref}>
                {this.renderInternal()}
            </div>
        );
    }

    public tick(blink: boolean): void {
        super.tick(blink);
        if (this.requiresRedraw) {
            this.redraw();
            this.requiresRedraw = false;
        }

        if (this.step === 0) {
            this.children.get("button").isVisible = this.lCursorController.cursorActive;

            if (this.lCursorController.cursorActive) {
                this.children.get("line2").text = "  ";
                this.children.get("line3").text = "  ";
                this.children.get("line5").text = "  ";
            } else {
                this.children.get("line2").text = "   O N   G R O U N D";
                this.children.get("line3").text = "        O N L Y ";
                this.children.get("line5").text = `     KEY ${key}`;
            }
        }
    }

    public clear(): boolean {
        if (this.step === 0) {
            return false;
        }

        this.step--;


        this.requiresRedraw = true;
        return true;
    }

    private renderInternal(): VNode {
        switch (this.step) {
            case 0:
                this.children.get("button").text = "UPDATE PUBLISHED DB";
                this.children.get("button").isReadonly = false;
                return (<pre>
                    &nbsp&nbsp&nbsp&nbsp&nbsp&nbspU P D A T E<br/>
                    &nbsp&nbsp&nbspD A T A&nbsp&nbsp&nbspB A S E<br/>
                    {this.children.get("line2").render()}<br/>
                    {this.children.get("line3").render()}{this.children.get("button").render()}<br/>
                    <br/>
                    {this.children.get("line5").render()}
                </pre>);
            case 1:
                this.children.get("button").text = "U P D A T E ?";
                this.children.get("button").isReadonly = false;
                return (<pre>
                    &nbsp&nbsp&nbsp&nbsp&nbsp&nbspU P D A T E<br/>
                    <br/>
                    &nbsp&nbsp&nbsp&nbsp&nbspINTERNATIONAL<br/>
                    &nbsp&nbsp&nbspDATA BASE {this.props.database.isAiracCurrent() ? "EXPIRES" : "EXPIRED"}<br/>
                    &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.props.database.expirationDateString}<br/>
                    &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("button").render()}
                </pre>);
            case 2:
                this.lCursorController.setCursorActive(false);
                this.children.get("button").isReadonly = true;
                return (<pre>
                    &nbsp&nbsp&nbsp&nbsp&nbsp&nbspU P D A T E<br/>
                    &nbsp&nbsp&nbspD A T A&nbsp&nbsp&nbspB A S E<br/>
                    <br/>
                    &nbsp&nbsp&nbsp&nbsp&nbsp&nbspL O A D E R<br/>
                    &nbsp&nbsp&nbspN O T&nbsp&nbsp&nbspR E A D Y
                </pre>);
            default:
                throw Error(`Unexpected step: ${this.step}`);
        }
    }

    private redraw(): void {
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.renderInternal(), this.ref.instance);
    }

    private next(): void {
        this.step++;
        this.requiresRedraw = true;
    }
}

/**
 * The SET 0 page is a full page, this is just a dummy to trigger the display
 */
export class Set0DummyPage extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children = NO_CHILDREN;

    readonly name: string = "SET 0";

    public render(): VNode {
        return (<pre></pre>);
    }


}