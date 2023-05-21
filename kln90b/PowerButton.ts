import {HEvent, Publisher, SimVarValueType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettingsTypes} from "./settings/KLN90BUserSettings";
import {EVT_BRT_DEC, EVT_BRT_INC, EVT_POWER} from "./HEvents";
import {BrightnessManager} from "./BrightnessManager";
import {WelcomePage, WelcomePageProps} from "./pages/WelcomePage";
import {NullPage} from "./pages/NullPage";
import {PageProps} from "./pages/Page";
import {PropsReadyEvent} from "./KLN90B";
import {LVAR_BRIGHTNESS, LVAR_POWER, LVAR_RIGHT_SCAN} from "./LVars";
import {HOURS_TO_SECONDS} from "./data/navdata/NavCalculator";

export interface PowerEventData {
    isPowered: boolean,
    timeSincePowerChange: number, //milliseconds
}


export interface PowerEvent {
    powerEvent: PowerEventData;
}

export class PowerButton {


    private readonly brightnessManager: BrightnessManager;
    private isPowered: boolean = false;
    private readonly isPoweredPublisher: Publisher<PowerEvent>;
    private readonly powerCyclesSettings: UserSetting<NonNullable<KLN90BUserSettingsTypes["powercycles"]>>;
    private lastPowerChangeTime: number = Date.now() - HOURS_TO_SECONDS * 1000;


    constructor(private props: WelcomePageProps | PageProps) {
        this.brightnessManager = new BrightnessManager(props.bus, props.planeSettings);

        const hEvent = this.props.bus.getSubscriber<HEvent>();
        hEvent.on('hEvent').handle((e: string) => {
            if (e === EVT_BRT_INC) {
                this.brightnessManager.incBrightness();
            } else if (e === EVT_BRT_DEC) {
                this.brightnessManager.decBrightness();
            } else if (e === EVT_POWER) {
                this.togglePower();
            }
        });

        this.isPoweredPublisher = this.props.bus.getPublisher<PowerEvent>();

        this.powerCyclesSettings = this.props.userSettings.getSetting("powercycles");

        SimVar.SetSimVarValue(LVAR_POWER, SimVarValueType.Bool, this.isPowered);

        this.props.bus.getSubscriber<PropsReadyEvent>().on("propsReady").handle(this.handlePropsReady.bind(this));
    }

    handlePropsReady(props: PageProps) {
        this.props = props;
    }

    private togglePower() {
        this.setPowered(!this.isPowered);
    }

    public setPowered(isPowered: boolean): void{
        if(this.isPowered === isPowered){
            return;
        }

        console.log("Power", isPowered);
        this.isPowered = isPowered;

        SimVar.SetSimVarValue(LVAR_POWER, SimVarValueType.Bool, isPowered);

        const now = Date.now();
        const timePoweredOff = now - this.lastPowerChangeTime;
        if (this.isPowered) {
            this.powerCyclesSettings.set(this.powerCyclesSettings.value + 1);
            console.log("Powercycles: ", this.powerCyclesSettings.value);
            this.props.pageManager.setCurrentPage(WelcomePage, this.props);
        } else {
            this.props.pageManager.setCurrentPage(NullPage, {});
        }
        this.isPoweredPublisher.pub("powerEvent", {
            isPowered: this.isPowered,
            timeSincePowerChange: timePoweredOff,
        });
        this.lastPowerChangeTime = now;
    }

    public setBrightness(brightness: number): void{
        this.brightnessManager.setBrightness(brightness);
    }

}