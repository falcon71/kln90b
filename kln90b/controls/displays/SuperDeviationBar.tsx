import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {DeviationBar} from "./DeviationBar";

/*
If this looks Cyrillic to you, then because it is.
The Greek characters are mapped to the deviation scale from full left to full right.
 */
const DOT_LETTERS = ["Ѐ", "Ё", "Ђ", "Ѓ", "Є", "Ѕ", "І", "Ї", "Ј", "Љ"];
const TO_LETTERS = ["Њ", "Ћ", "Ќ", "Ѝ", "Ў", "Џ", "А", "Б", "В", "Г"];
const FROM_LETTERS = ["Д", "Е", "Ж", "З", "И", "Й", "К", "Л", "М", "Н"];
const SPACE_LETTERS = ["О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч"];

/**
 * https://youtu.be/gjmVrkHTdP0?t=103 Example for flagged Super NAV 1
 */
export class SuperDeviationBar extends DeviationBar {


    render(): VNode {
        return (<span class="super-deviation-bar">
            <span ref={this.ref} class="d-none"></span>
            <span ref={this.flagRef}>&nbspШ&nbspШ&nbspШ&nbspШ<span
                class="inverted">F L A G</span>Ш&nbspШ&nbspШ&nbspШ</span>
        </span>);
    }

    protected buildDeviationScale(): string {
        const scale = this.to ? " Ш Ш Ш Ш Ш Щ Ш Ш Ш Ш Ш " : " Ш Ш Ш Ш Ш Ъ Ш Ш Ш Ш Ш ";
        const dev = -Utils.Clamp(this.deviation! / this.xtkScale, -1, 1);

        //0-22  -1:0  0:5  0.5: 7 1: 22
        let charToReplace = (dev + 1) * 11;
        //0-9 0:4 exakt, 0.1:5, 0.2:6, 0.3:7, 0.4:8, 0.5:0, 0.6:1, 0.7:1, 0.8:2, 0.9:3
        const subdeviation = (charToReplace % 1);
        const targetLetterIndex = Math.floor(((subdeviation + 0.5) * 9) % 9);
        charToReplace = Math.round(charToReplace);


        let targetChar;
        if (charToReplace == 11) {
            targetChar = this.to ? TO_LETTERS[targetLetterIndex] : FROM_LETTERS[targetLetterIndex];
        } else if (charToReplace % 2 == 0) {
            targetChar = SPACE_LETTERS[targetLetterIndex];
        } else {
            targetChar = DOT_LETTERS[targetLetterIndex];
        }

        //Between two chars
        if (targetLetterIndex == 9 && charToReplace < 22) {
            if (charToReplace == 10) {
                targetChar += this.to ? TO_LETTERS[0] : FROM_LETTERS[0];
            } else if (charToReplace % 2 == 1) {
                targetChar += SPACE_LETTERS[0];
            } else {
                targetChar += DOT_LETTERS[0];
            }
        } else if (targetLetterIndex == 0 && charToReplace > 0) {
            if (charToReplace == 12) {
                targetChar = this.to ? TO_LETTERS[9] : FROM_LETTERS[9] + targetChar;
            } else if (charToReplace % 2 == 1) {
                targetChar = SPACE_LETTERS[9] + targetChar;
            } else {
                targetChar = DOT_LETTERS[9] + targetChar;
            }
            charToReplace--;
        }

        return this.replaceStringAt(scale, charToReplace, targetChar);

    }

}