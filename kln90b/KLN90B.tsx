/**
 * @license
 *     KLN 90B for MSFS
 *     Copyright (C) 2023 falcon71
 *
 *     This program is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU Lesser General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     This program is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU Lesser General Public License for more details.
 *
 *     You should have received a copy of the GNU Lesser General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// noinspection JSUnusedGlobalSymbols

import '../KLN90B.scss';
import {KLN90BCore} from "./KLN90BCore";
import {SIM_PLATFORM} from "./KLN90BPlatform";

/**
 * Congratulations on finding the primary class. This is how it all begins: this class connects the instrument to the
 * sim's BaseInstrument lifecycle, and KLN90BCore builds everything else. The second most interesting class would be
 * MainPage. After that, PageTreeController will guide you to the individual screens.
 * Numbers like 1-12 reference a page in the manual that contains further information and reference:
 * https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08773-0000-KLN-90B-Pilots-Guide.pdf
 */
class KLN90B extends BaseInstrument {
    private readonly core = new KLN90BCore(SIM_PLATFORM, args => this.onInteractionEvent(args));

    get templateID(): string {
        return 'KLN90B';
    }


    get isInteractive(): boolean {
        return true;
    }


    Init() {
        super.Init();

        // noinspection JSIgnoredPromiseFromCall
        this.core.init(this.xmlConfig);
    }

    /**
     * A callback for when sounds are done playing.  This is needed to support the sound server.
     * @param soundEventId The sound that got played.
     */
    public onSoundEnd(soundEventId: Name_Z): void {
        this.core.onSoundEnd(soundEventId);
    }

    connectedCallback(): void {
        super.connectedCallback();
    }

    onInteractionEvent(args: Array<string>): void {
        super.onInteractionEvent(args);
        this.core.onInteractionEvent(args);
    }
}

registerInstrument('kln-90b', KLN90B);
