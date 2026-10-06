import {describe, expect, it} from 'vitest';
import {convertTextToKLNCharset} from '../../../kln90b/data/Text';

describe('convertTextToKLNCharset', () => {
    it('upper-cases and keeps letters, digits, blanks and hyphens (3-47)', () => {
        // 3-47: the text characters of the unit are letters, digits, the hyphen and the blank
        expect(convertTextToKLNCharset('Winston-Salem 2')).toBe('WINSTON-SALEM 2');
    });

    it('deletes punctuation such as periods and apostrophes (3-26)', () => {
        // 3-26: in the name changes of the database most punctuation is deleted, without leaving a gap
        expect(convertTextToKLNCharset("St. John's Int'l")).toBe('ST JOHNS INTL');
        expect(convertTextToKLNCharset('A/B (C), D&E_F')).toBe('AB C DEF');
    });

    // Accented letters are not tested: the navigation tables of the AIRAC 2607 database hold none (maintainer ruling).
});
