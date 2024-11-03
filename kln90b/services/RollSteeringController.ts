import {CalcTickable} from "../TickController";
import {Sensors} from "../Sensors";
import {VolatileMemory} from "../data/VolatileMemory";
import {EventBus, LNavComputer} from "@microsoft/msfs-sdk";

/**
 * How long it takes for the bank to switch between 0 and 5° on the selft test page.
 * The manual does not mention how long this actual takes, so this is just a guess
 */
const SELF_TEST_TIME_SEC = 5;
const SELF_TEST_DIR_RIGHT = 1;
const SELF_TEST_DIR_LEFT = -1;

/**
 * Calculates the roll command for the autopilot
 * Code was adapted from Working Titles LNavComputer
 */
export class RollSteeringController implements CalcTickable {
    private readonly lNavComputer: LNavComputer;

    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory, bus: EventBus) {
        this.lNavComputer = new LNavComputer(0, bus, this.memory.fplPage.flighplanner, undefined, {
            maxBankAngle: 25,
            hasVectorAnticipation: true,
        });
    }

    public tick(): void {
        //TODO test mode!

        //TODO aircraft state uses actual variables instead of the know state
        this.lNavComputer.update();

        this.sensors.out.setRollCommand(this.lNavComputer.steerCommand.get().desiredBankAngle);
    }
}