/**
 * The KLN can only display A TO Z and 0 to 9 uppercase. This function handles the conversion of arbitrary text.
 * The conversion simply removes unknown characters. The sim database has no accented letters in its names, so
 * dropping them instead of transliterating them is fine and not a bug (#387).
 * @param text
 */
export function convertTextToKLNCharset(text: string): string {
    const upper = text.toUpperCase();
    return upper.replace(/[^ A-Z0-9\-]/g, ""); //The regex matches everything except for spaces, minus, uppercase chars and digits
}