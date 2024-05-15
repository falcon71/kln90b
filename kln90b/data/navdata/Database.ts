import {TimeStamp} from "../Time";
import {AiracCycleFormatter, EventBus, FacilityLoader} from "@microsoft/msfs-sdk";
import {Sensors} from "../../Sensors";
import {MessageHandler, OneTimeMessage} from "../MessageHandler";
import {GPSEvents} from "../../Gps";


export class Database {


    public readonly expirationDateString: string;
    private readonly expirationTimestamp: TimeStamp;

    constructor(bus: EventBus, private sensors: Sensors, private messageHandler: MessageHandler) {
        const airac = FacilityLoader.getDatabaseCycles().current;

        this.expirationTimestamp = TimeStamp.create(airac.expirationTimestamp);
        this.expirationDateString = AiracCycleFormatter.create('{expMinus({dd} {MON} {YYYY})}')(airac);

        console.log("airac", airac, this.expirationTimestamp);
        bus.getSubscriber<GPSEvents>().on("timeUpdatedEvent").handle(this.onGPSAcquired.bind(this));
    }

    public isAiracCurrent(time: TimeStamp = this.sensors.in.gps.timeZulu): boolean {
        return time.getTimestamp() <= this.expirationTimestamp.getTimestamp();
    }

    private onGPSAcquired(time: TimeStamp) {
        if (!this.isAiracCurrent(time)) {
            this.messageHandler.addMessage(new OneTimeMessage(["DATA BASE OUT OF DATE", "ALL DATA MUST BE", "CONFIRMED BEFORE USE"]))
        }
    }


}