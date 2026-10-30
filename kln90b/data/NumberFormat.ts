/**
 * Nudges a scaled value up by two units in the last place before it is rounded. A decimal half that binary cannot hold
 * exactly, like the 25 kHz and 8.33 kHz comm channels of APT 4 (3-45, 128.075 * 100 = 12807.499999999998), then rounds
 * up as the decimal number does.
 */
const HALF_NUDGE = 1 + 2 * Number.EPSILON;

/**
 * A number rounded to an integer, halves away from zero, with its magnitude padded with zeros to the digits. A negative
 * result gets a minus in front of the digits (-05); a value that rounds to zero gets none. A wider value is not cut.
 */
export function padInt(value: number, digits: number): string {
    const rounded = Math.round(Math.abs(value));
    const text = String(rounded).padStart(digits, "0");
    return value < 0 && rounded !== 0 ? `-${text}` : text;
}

/**
 * A number rounded to the decimals, halves away from zero, with the integer part padded with zeros to intDigits. The
 * sign is the same as for padInt.
 */
export function padFixed(value: number, intDigits: number, decimals: number): string {
    const factor = 10 ** decimals;
    const scaled = Math.round(Math.abs(value) * factor * HALF_NUDGE);
    const whole = Math.floor(scaled / factor);
    const text = `${String(whole).padStart(intDigits, "0")}.${String(scaled - whole * factor).padStart(decimals, "0")}`;
    return value < 0 && scaled !== 0 ? `-${text}` : text;
}

/**
 * The text with the sign of the value in front, a plus also for zero. The sign is taken from the value, not the text,
 * so a latitude 0.4° south that truncates to 00 stays -00.
 */
export function withSign(value: number, text: string): string {
    return (value < 0 ? "-" : "+") + text;
}
