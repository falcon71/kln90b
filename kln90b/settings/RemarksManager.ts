import {DefaultUserSettingManager, EventBus} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from "./KLN90BUserSettings";
import { KLN90BUserFlightplansTypes} from "./KLN90BUserFlightplans";
import {KLN90BUserRemarkSettings, NUM_REMARKS} from "./KLN90BUserRemarkSettings";

export interface RemarksChangedEvent {
    changed: string;
}

/**
 * This class holds the remarks entered for airports on the apt 5 page (3-47)
 * We only use the ident and not the icao, since the ident is unique for airports and it's shorter for the actual settings
 */
export class RemarksManager {
    private remarks: {
        [ident: string]: [string, string, string];
    } = {};

    private manager: DefaultUserSettingManager<KLN90BUserFlightplansTypes>;

    constructor(private readonly bus: EventBus, readonly userSettings: KLN90BUserSettings) {
        this.manager = KLN90BUserRemarkSettings.getManager(bus);
        this.loadRemarks();
        console.log("Loaded remarks", this.remarks);
    }

    public saveRemarks(ident: string, remarks: [string, string, string]) {
        if (Object(this.remarks).length >= 100) {
            throw new Error("RMKS FULL");
        }
        if (remarks[0] || remarks[1] || remarks[2]) {
            this.remarks[ident] = remarks;
        } else {
            delete this.remarks[ident];
        }
        console.log("Remarks", this.remarks);


        this.saveAllRemarks();

        this.bus.getPublisher<RemarksChangedEvent>().pub("changed", ident);
    }

    public deleteRemarks(ident: string): void {
        this.saveRemarks(ident, ["", "", ""]);
    }

    public getRemarks(ident: string): [string, string, string] {
        if (this.remarks.hasOwnProperty(ident)) {
            return this.remarks[ident];
        }
        return ["           ", "           ", "           "];
    }

    public getAirportsWithRemarks(): string[] {
        return Object.keys(this.remarks).sort((a, b) => a.localeCompare(b));
    }

    private loadRemarks() {
        for (let i = 0; i < NUM_REMARKS; i++) {
            const rmk = this.manager.getSetting(`rmk${i}`).get();
            if (rmk !== "") {
                const ident = rmk.substring(0, 4);
                const lines = [...rmk.substring(4).match(/.{1,11}/g)!];
                this.remarks[ident] = lines as [string, string, string];
            }
        }
    }

    private saveAllRemarks() {
        let i = 0;
        for (const ident in this.remarks) {
            const joinedText = this.remarks[ident].join("");
            this.manager.getSetting(`rmk${i}`).set(ident + joinedText);
            i++;
        }
    }

}