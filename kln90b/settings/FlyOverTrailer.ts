/**
 * The fly-over flags of a stored flight plan (#77). This is our own storage format, not the unit's. It is appended to
 * the V2 string of the en-route legs, only when a leg is a fly-over: the leg count as two decimal digits, then one
 * base64 character for each six legs, least significant bit first.
 * See docs/superpowers/specs/2026-11-01-flyover-waypoints-design.md, section "Storage".
 */
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LEGS_PER_CHAR = 6;
const COUNT_DIGITS = 2;

/**
 * @param flags one entry for each stored leg
 * @returns the trailer, or an empty string when no leg is a fly-over
 */
export function encodeFlyOverTrailer(flags: boolean[]): string {
    if (!flags.some(f => f)) {
        return "";
    }

    let trailer = flags.length.toString().padStart(COUNT_DIGITS, "0");
    for (let i = 0; i < flags.length; i += LEGS_PER_CHAR) {
        let value = 0;
        for (let bit = 0; bit < LEGS_PER_CHAR && i + bit < flags.length; bit++) {
            if (flags[i + bit]) {
                value |= 1 << bit;
            }
        }
        trailer += BASE64[value];
    }
    return trailer;
}

/**
 * @param trailer what follows the legs in the stored string
 * @param legCount the number of stored legs
 * @returns exactly legCount flags. They are all false when the trailer is empty or does not fit the legs, so that the
 * legs load as en route
 */
export function decodeFlyOverTrailer(trailer: string, legCount: number): boolean[] {
    const flags: boolean[] = Array(legCount).fill(false);

    if (trailer.length !== COUNT_DIGITS + Math.ceil(legCount / LEGS_PER_CHAR)
        || trailer.substring(0, COUNT_DIGITS) !== legCount.toString().padStart(COUNT_DIGITS, "0")) {
        return flags;
    }

    const values: number[] = [];
    for (const char of trailer.substring(COUNT_DIGITS)) {
        const value = BASE64.indexOf(char);
        if (value < 0) {
            return flags;
        }
        values.push(value);
    }

    for (let i = 0; i < legCount; i++) {
        flags[i] = (values[Math.floor(i / LEGS_PER_CHAR)] & (1 << (i % LEGS_PER_CHAR))) !== 0;
    }
    return flags;
}
