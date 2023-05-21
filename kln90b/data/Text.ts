/**
 * The KLN can only display A TO Z and 0 to 9 uppercase. This function handles the conversion of arbitrary text.
 * The conversion currently simplay removes unknwon characters
 * @param text
 */
export function convertTextToKLNCharset(text: string): string {
    const upper = text.toUpperCase();
    return upper.replace(/[^ A-Z0-9\-]/g, ""); //The regex matches everything except for spaces, minus, uppercase chars and digits
}