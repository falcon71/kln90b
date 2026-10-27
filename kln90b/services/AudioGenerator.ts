import {EventBus, SimVarValueType, SoundServer, SoundServerController} from "@microsoft/msfs-sdk";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {StatusLineMessageEvents} from "../controls/StatusLine";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {LVAR_ALERT_VOLUME} from "../LVars";

export const SHORT_BEEP_ID = "kln_short_beep";
export const LONG_BEEP_ID = "kln_long_beep";


/**
 * For this to work, the aircraft must have entries for kln_short_beep and kln_long_beep defined in the section AvionicSounds of the sound.xml!
 * The instrument cannot set the volume of a sound, so the SET 9 volume is only mirrored to L:KLN90B_AlertVolume (#197).
 */
export class AudioGenerator {


    private readonly soundController: SoundServerController;
    private readonly soundServer: SoundServer;

    private beeps: string[] = [];

    constructor(private bus: EventBus, private settings: KLN90PlaneSettings, userSettings: KLN90BUserSettings) {
        this.soundController = new SoundServerController(bus);
        this.soundServer = new SoundServer(bus);
        //Real unit: fictional as a signal. The SET 9 volume (3-57) sets the level of the tone on P901 pin 39 ALT ALERT
        //AUDIO, at most 3.5 V rms into 500 ohm (Installation manual 1-8). The sim gauge cannot set the loudness, so the
        //aircraft reads the setting from L:KLN90B_AlertVolume
        userSettings.getSetting("altAlertVolume").sub(volume => SimVar.SetSimVarValue(LVAR_ALERT_VOLUME, SimVarValueType.Number, volume), true);
    }

    /**
     * Plays the specified amount of short beeps
     * @param numBeeps
     */
    public shortBeeps(numBeeps: number) {
        this.beepPattern(Array(numBeeps).fill(SHORT_BEEP_ID));
    }


    /**
     * Plays the pattern of beeps. Expects either SHORT_BEEP_ID or LONG_BEEP_ID
     * @param beeps
     */
    public beepPattern(beeps: string[]) {
        if (!this.settings.output.altitudeAlertEnabled) {
            return;
        }
        if (this.settings.debugMode) {
            this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", `BEEP: ${beeps.length}` as any)
        }
        this.beeps = beeps;
        this.doBeep();
    }

    /**
     * A callback for when sounds are done playing.  This is needed to support the sound server.
     * @param soundEventId The sound that got played.
     */
    public onSoundEnd(soundEventId: Name_Z): void {
        this.soundServer.onSoundEnd(soundEventId);
        this.doBeep();
    }

    private doBeep() {
        const beep = this.beeps.shift();
        if (beep) {
            //Real unit: two outputs that are active together (Installation manual 1-8, 2-7, 2-69)
            //- P901 pin 39 ALT ALERT AUDIO, a 1 kHz tone to an audio panel input
            //- P901 pin 38 ALT ALERT, pulled low to sound a Sonalert or light a lamp, unless pin 38 is strapped to ground
            //  (Output.AltitudeAlertEnabled false)
            //The sim plays the aircraft's kln_short_beep and kln_long_beep for both
            this.soundController.playSound(beep);
        }
    }
}