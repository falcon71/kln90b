import {CalcTickable} from "../TickController";
import {Sensors} from "../Sensors";

export class SignalOutputFillterTick implements CalcTickable {


    constructor(private readonly sensors: Sensors) {
    }

    public tick(): void {
        this.sensors.out.setFilteredOutputs();

    }

}