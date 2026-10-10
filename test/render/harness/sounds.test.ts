import {describe, expect, it} from 'vitest';
import {bootToSelfTest} from '../../harness/boot';
import {recordSounds} from '../../harness/sounds';
import {ALTITUDE_ALERT, panelXml} from '../../harness/panelXml';

const ALERT_ON_XML = panelXml(ALTITUDE_ALERT(true));

describe('recordSounds', () => {
    // 3-7 step 11: ENT on APPROVE? sounds five short tones, one after the other
    it('lists the tone of ENT on APPROVE? and the four that follow after finishAll (3-7)', async () => {
        const unit = await bootToSelfTest({panelXml: ALERT_ON_XML});
        const sounds = recordSounds(unit);
        expect(sounds.ids).toEqual([]);

        await unit.panel.cursorTo('R', 'APPROVE?');
        await unit.panel.ent();
        expect(sounds.ids).toEqual(['kln_short_beep']);

        sounds.finishAll();
        expect(sounds.ids).toEqual(Array(5).fill('kln_short_beep'));
        expect(unit.errors).toEqual([]);
    });

    it('starts empty when it is installed after the sounds played', async () => {
        const unit = await bootToSelfTest({panelXml: ALERT_ON_XML});
        const first = recordSounds(unit);
        await unit.panel.cursorTo('R', 'APPROVE?');
        await unit.panel.ent();
        first.finishAll();
        expect(first.ids).toHaveLength(5);

        const late = recordSounds(unit);

        expect(late.ids).toEqual([]);
        late.finishAll();
        expect(late.ids).toEqual([]);
    });
});
