import {HeadlessUnit} from './boot';

/** The sounds a unit asked the sim to play, and a way to play them through */
export interface SoundRecorder {
    /** The sound ids requested on sound_server_play_sound since the recorder was installed, in order */
    readonly ids: string[];

    /**
     * Reports the end of the playing sound to the unit, as KLN90B.onSoundEnd does in the sim, until no new sound is
     * requested (at most 20 times), so that a pattern of several tones (AudioGenerator) plays through
     */
    finishAll(): void;
}

/**
 * Records the sound ids the unit requests from now on. The topic is not cached (SoundServerController publishes it
 * with isCached false), so a recorder installed after a sound played starts empty. Install it before the action that
 * sounds.
 */
export function recordSounds(unit: HeadlessUnit): SoundRecorder {
    const ids: string[] = [];
    unit.props.bus.getSubscriber<any>().on('sound_server_play_sound').handle((id: string) => ids.push(id));
    const audio = unit.props.sensors.out.audioGenerator;
    return {
        ids,
        finishAll() {
            for (let i = 0; i < 20 && ids.length > 0; i++) {
                const before = ids.length;
                audio.onSoundEnd({__Type: 'Name_Z', idLow: 0, idHigh: 0, str: ids[ids.length - 1]} as unknown as Name_Z);
                if (ids.length === before) return;
            }
        },
    };
}
