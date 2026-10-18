import {TimeStamp} from "../Time";
import {AiracCycleFormatter, FacilityLoader} from "@microsoft/msfs-sdk";
import {Sensors} from "../../Sensors";


export class Database {


    public readonly expirationDateString: string;
    private readonly expirationTimestamp: TimeStamp;

    /**
     * DATA BASE OUT OF DATE is the persistent DatabaseOutOfDateMessage alone; the data base posts no copy of its own on
     * a time update (#175)
     */
    constructor(private sensors: Sensors) {
        const airac = FacilityLoader.getDatabaseCycles().current;

        this.expirationTimestamp = TimeStamp.create(airac.expirationTimestamp);
        this.expirationDateString = AiracCycleFormatter.create('{expMinus({dd} {MON} {YY})}')(airac);

        console.log("airac", airac, this.expirationTimestamp);
    }

    public isAiracCurrent(time: TimeStamp = this.sensors.in.gps.timeZulu): boolean {
        return time.getTimestamp() <= this.expirationTimestamp.getTimestamp();
    }


}
