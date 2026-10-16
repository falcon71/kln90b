import {convertTextToKLNCharset} from "./Text";

/** APT 1 shows a name in two rows of eleven (figure 3-85) */
const NAME_LENGTH = 22;
/** 3-26: the first word is usually kept unless it is longer than this */
const FIRST_WORD_KEPT_LENGTH = 8;

/** 3-26: the words that get a short form, each matched as a whole word */
const SHORT_FORMS: [string, string][] = [
    ["NORTHWEST", "NW"], ["NORTHEAST", "NE"], ["SOUTHWEST", "SW"], ["SOUTHEAST", "SE"],
    ["NORTHERN", "N"], ["NORTH", "N"], ["EASTERN", "E"], ["EAST", "E"],
    ["SOUTHERN", "S"], ["SOUTH", "S"], ["WESTERN", "W"], ["WEST", "W"],
    ["POINT", "PT"], ["PORT", "PT"], ["FORT", "FT"], ["SAINT", "ST"], ["GENERAL", "GEN"],
    ["INTERNATIONAL", "INT"], ["REGIONAL", "REG"],
];
/** 3-26: deleted words */
const DELETED_WORDS = ["CITY OF", "GREATER", "THE"];

/**
 * The airport name as APT 1 shows it (3-26). The person's-initials rule of 3-26 is not implemented: a person's name
 * cannot be told from other words.
 */
export class AirportNameFormatter {
    public static format(rawName: string): string {
        const name = AirportNameFormatter.collapse(convertTextToKLNCharset(rawName));
        if (name.length <= NAME_LENGTH) {
            return name;
        }

        let shortened = name;
        for (const word of DELETED_WORDS) {
            shortened = shortened.replace(AirportNameFormatter.wholeWord(word), "");
        }
        shortened = AirportNameFormatter.collapse(shortened);

        const firstBlank = shortened.indexOf(" ");
        const firstWord = firstBlank === -1 ? shortened : shortened.substring(0, firstBlank);
        const rest = firstBlank === -1 ? "" : shortened.substring(firstBlank);
        const first = firstWord.length > FIRST_WORD_KEPT_LENGTH ? AirportNameFormatter.shorten(firstWord) : firstWord;
        return first + AirportNameFormatter.shorten(rest);
    }

    private static shorten(text: string): string {
        for (const [word, shortForm] of SHORT_FORMS) {
            text = text.replace(AirportNameFormatter.wholeWord(word), shortForm);
        }
        return text;
    }

    private static wholeWord(word: string): RegExp {
        return new RegExp(`\\b${word}\\b`, "g");
    }

    private static collapse(text: string): string {
        return text.replace(/ {2,}/g, " ").trim();
    }
}
