import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Degrees, Knots} from "../../data/Units";
import {SpeedFieldset} from "../../controls/selects/SpeedFieldset";
import {BearingFieldset} from "../../controls/selects/BearingFieldset";


type Tri0PageTypes = {
    tas: SpeedFieldset,
    windDir: BearingFieldset,
    windSpeed: SpeedFieldset,
}

/**
 * 5-2
 * The empty page can be seen here: https://www.youtube.com/shorts/9We5fcd2-VE
 */
export class Tri0Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Tri0PageTypes>;

    readonly name: string = "TRI 0";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Tri0PageTypes>({
            tas: new SpeedFieldset(this.props.userSettings.getSetting('triTas').get(), this.setSpeed.bind(this)),
            windDir: new BearingFieldset(this.props.userSettings.getSetting('triWindDirTrue').get(), this.setWindDir.bind(this)),
            windSpeed: new SpeedFieldset(this.props.userSettings.getSetting('triWindSpeed').get(), this.setWindSpeed.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            &nbspTRIP PLAN<br/>
            &nbspESTIMATES<br/>
            <br/>
            TAS:&nbsp&nbsp{this.children.get("tas").render()}kt<br/>
            WIND:&nbsp{this.children.get("windDir").render()}°¥<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("windSpeed").render()}kt
        </pre>);
    }

    private setSpeed(speed: Knots) {
        this.props.userSettings.getSetting('triTas').set(speed);
    }

    private setWindDir(dir: Degrees) {
        this.props.userSettings.getSetting('triWindDirTrue').set(dir);
    }

    private setWindSpeed(speed: Knots) {
        this.props.userSettings.getSetting('triWindSpeed').set(speed);
    }
}