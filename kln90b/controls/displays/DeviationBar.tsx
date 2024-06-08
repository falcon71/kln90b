import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../../TickController";
import {ToFrom} from "../../data/VolatileMemory";

/*
If this looks Greek to you, then because it is.
The Greek characters are mapped to the deviation scale from full left to full right.
 */
const DOT_LETTERS = ["Α", "Β", "Γ", "Δ", "Ε", "Ζ", "Η", "Θ", "Ι", "Κ"];
const TO_LETTERS = ["Λ", "Μ", "Ν", "Ξ", "Ο", "Π", "Ρ", "Σ", "Τ", "Υ"];
const FROM_LETTERS = ["Φ", "Χ", "Ψ", "Ω", "α", "β", "γ", "δ", "ε", "ζ"];


export class DeviationBar implements UiElement {
    readonly children = NO_CHILDREN;
    protected ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    protected flagRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public deviation: number | null, public to: ToFrom | null, public xtkScale: number = 5) {
    }

    render(): VNode {
        return (<span>
            <span ref={this.ref} class="d-none"></span>
            <span ref={this.flagRef}>ηη<span class="inverted">F L A G</span>ηη</span>
        </span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref, this.flagRef)) {
            return;
        }
        if (this.deviation === null) {
            this.ref.instance.classList.add("d-none");
            this.flagRef.instance.classList.remove("d-none");
        } else {
            this.ref.instance.classList.remove("d-none");
            this.flagRef.instance.classList.add("d-none");
            this.ref.instance.innerText = this.buildDeviationScale();
        }
    }

    protected buildDeviationScale(): string {
        const scale = this.to ? "ηηηηηθηηηηη" : "ηηηηηιηηηηη";
        const dev = -Utils.Clamp(this.deviation! / this.xtkScale, -1, 1);

        //0-10  -1:0  0:5  0.5: 7 1: 10
        let charToReplace = (dev + 1) * 5;
        //0-9 0:4 exakt, 0.1:5, 0.2:6, 0.3:7, 0.4:8, 0.5:0, 0.6:1, 0.7:1, 0.8:2, 0.9:3
        const subdeviation = (charToReplace % 1);
        const targetLetterIndex = Math.floor(((subdeviation + 0.5) * 9) % 9);
        charToReplace = Math.round(charToReplace);


        let targetChar;
        if (charToReplace == 5) {
            targetChar = this.to ? TO_LETTERS[targetLetterIndex] : FROM_LETTERS[targetLetterIndex];
        } else {
            targetChar = DOT_LETTERS[targetLetterIndex];
        }

        //Between two chars
        if (targetLetterIndex == 9 && charToReplace < 10) {
            if (charToReplace == 4) {
                targetChar += this.to ? TO_LETTERS[0] : FROM_LETTERS[0];
            } else {
                targetChar += DOT_LETTERS[0];
            }
        } else if (targetLetterIndex == 0 && charToReplace > 0) {
            if (charToReplace == 6) {
                targetChar = this.to ? TO_LETTERS[9] : FROM_LETTERS[9] + targetChar;
            } else {
                targetChar = DOT_LETTERS[9] + targetChar;
            }
            charToReplace--;
        }

        return this.replaceStringAt(scale, charToReplace, targetChar);
    }

    protected replaceStringAt(text: string, index: number, replacement: string) {
        return text.substring(0, index) + replacement + text.substring(index + replacement.length);
    }
}