import {shortYearToLongYear, TimeStamp} from "../Time";
import {EventBus, SimVarValueType} from "@microsoft/msfs-sdk";
import {Sensors} from "../../Sensors";
import {MessageHandler, OneTimeMessage} from "../MessageHandler";
import {GPSEvents} from "../../Gps";

const AIRAC_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"];

export class Database {


    public readonly expirationDateString: string;
    private readonly expirationTimestamp: TimeStamp;

    constructor(bus: EventBus, private sensors: Sensors, private messageHandler: MessageHandler) {

        const airacRange: string = SimVar.GetGameVarValue('FLIGHT NAVDATA DATE RANGE', SimVarValueType.String);
        const yearStr = airacRange.substring(11, 13);
        const monthStr = airacRange.substring(5, 8);
        const dateStr = airacRange.substring(8, 10);
        const year = shortYearToLongYear(Number(yearStr));
        const month = AIRAC_MONTHS.indexOf(monthStr);
        const date = Number(dateStr);

        this.expirationTimestamp = TimeStamp.createDate(year, month, date);
        this.expirationDateString = `${dateStr} ${monthStr} ${yearStr}`;

        console.log("airacRange", airacRange, this.expirationTimestamp);
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