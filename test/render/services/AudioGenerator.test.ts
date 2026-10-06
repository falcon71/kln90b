import {describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {AudioGenerator, LONG_BEEP_ID, SHORT_BEEP_ID} from '../../../kln90b/services/AudioGenerator';
import {KLN90PlaneSettings} from '../../../kln90b/settings/KLN90BPlaneSettings';

// What the unit asks the sim to play. AudioGenerator asks the SDK sound server through the bus topic
// 'sound_server_play_sound' (SoundServerController.playSound); the server turns each request into
// Coherent.call('PLAY_INSTRUMENT_SOUND', id) once the sim is in game, which the harness never is. The test therefore
// listens on the bus: one request per tone, the next one only when the sim reports the previous tone ended.
//
// The sound ids kln_short_beep and kln_long_beep are what an aircraft must declare in the AvionicSounds section of its
// sound.xml (wiki "panel.xml customization", altitude alerter; issue #141 quotes it): public contract, no manual page.

/** An AudioGenerator on its own bus, and the list of sound ids it asked for */
function generator(opts: { altitudeAlertEnabled?: boolean, debugMode?: boolean } = {}) {
    const bus = new EventBus();
    const settings = {
        output: {altitudeAlertEnabled: opts.altitudeAlertEnabled ?? true},
        debugMode: opts.debugMode ?? false,
    } as unknown as KLN90PlaneSettings;
    const audio = new AudioGenerator(bus, settings);
    const played: string[] = [];
    bus.getSubscriber<any>().on('sound_server_play_sound').handle((id: string) => played.push(id));
    const statusLine: string[] = [];
    bus.getSubscriber<any>().on('statusLineMessage').handle((m: string) => statusLine.push(m));
    /** The sim reports the end of a sound, as KLN90B.onSoundEnd passes it on */
    const end = (id: string) => audio.onSoundEnd({__Type: 'Name_Z', idLow: 0, idHigh: 0, str: id} as unknown as Name_Z);
    return {audio, played, end, statusLine};
}

describe('AudioGenerator', () => {
    // 3-56: three short tones 1000 ft before the selected altitude. One tone is requested at a time; the next follows
    // when the sim reports the end of the previous one, and nothing follows the last.
    it('plays three short tones one after the other (3-56)', () => {
        const {audio, played, end} = generator();

        audio.shortBeeps(3);
        expect(played).toEqual([SHORT_BEEP_ID]);
        end(SHORT_BEEP_ID);
        expect(played).toEqual([SHORT_BEEP_ID, SHORT_BEEP_ID]);
        end(SHORT_BEEP_ID);
        end(SHORT_BEEP_ID);
        end(SHORT_BEEP_ID);

        expect(played).toEqual([SHORT_BEEP_ID, SHORT_BEEP_ID, SHORT_BEEP_ID]);
    });

    // Public contract (sound.xml of the aircraft, see the header): the ids the aircraft must declare
    it('names the tones kln_short_beep and kln_long_beep', () => {
        expect(SHORT_BEEP_ID).toBe('kln_short_beep');
        expect(LONG_BEEP_ID).toBe('kln_long_beep');
    });

    // 3-58: the height above airport alert is a short tone, a long tone and a short tone, in that order
    it('plays a pattern in its order: short, long, short (3-58)', () => {
        const {audio, played, end} = generator();

        audio.beepPattern([SHORT_BEEP_ID, LONG_BEEP_ID, SHORT_BEEP_ID]);
        end(SHORT_BEEP_ID);
        end(LONG_BEEP_ID);
        end(SHORT_BEEP_ID);

        expect(played).toEqual(['kln_short_beep', 'kln_long_beep', 'kln_short_beep']);
    });

    // The order of an asymmetric pattern. No caller passes one today (the only pattern, 3-58, is a palindrome), so this
    // states the method's own documentation ("Plays the pattern of beeps") rather than a manual page. doBeep takes the
    // tones from the end of the array (pop), so [short, long] plays long first.
    it.fails('plays an asymmetric pattern in the given order (#NEW-4-3)', () => {
        const {audio, played, end} = generator();

        audio.beepPattern([SHORT_BEEP_ID, LONG_BEEP_ID]);
        end(played[0]);

        expect(played).toEqual(['kln_short_beep', 'kln_long_beep']);
    });

    // 3-57: the installation can disable altitude alerting and the height above airport alert. Output.AltitudeAlertEnabled
    // is that strap (install manual, pin ALT ALERT); with it off no tone is ever requested.
    it('plays nothing when the installation disables the altitude alert (3-57)', () => {
        const {audio, played, end} = generator({altitudeAlertEnabled: false});

        audio.shortBeeps(2);
        audio.beepPattern([SHORT_BEEP_ID, LONG_BEEP_ID, SHORT_BEEP_ID]);
        end(SHORT_BEEP_ID);

        expect(played).toEqual([]);
    });

    // characterization: in the panel.xml debug mode every pattern also shows its length on the status line
    it('shows BEEP: n on the status line in debug mode (characterization)', () => {
        const {audio, statusLine} = generator({debugMode: true});

        audio.shortBeeps(4);

        expect(statusLine).toEqual(['BEEP: 4']);
    });

    // characterization: a new pattern replaces the rest of the one that is playing. The first tone of the new pattern is
    // asked for at once, while the old tone still plays (the SDK server drops a request whose key is playing).
    it('replaces the rest of a playing pattern with a new one (characterization)', () => {
        const {audio, played, end} = generator();

        audio.shortBeeps(3);
        audio.beepPattern([LONG_BEEP_ID]);
        end(SHORT_BEEP_ID);
        end(LONG_BEEP_ID);

        expect(played).toEqual([SHORT_BEEP_ID, LONG_BEEP_ID]);
    });
});
