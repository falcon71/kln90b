import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {Button} from "../../controls/Button";
import {FplFileimporter} from "../../services/FplFileimporter";
import {Fpl0Page} from "./FplPage";
import {MainPage} from "../MainPage";
import {TextDisplay} from "../../controls/displays/TextDisplay";


/**
 * Every fictitious setting the real KLN does not have
 */
export class Set10Page extends SixLineHalfPage {

    public cursorController;
    children: UIElementChildren<any>;

    readonly name: string = "SET10";

    protected ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private internalPage: SixLineHalfPage = new Set10BasicPage(this.props, this.setInternalPage.bind(this));

    constructor(props: PageProps) {
        super(props);

        this.children = this.internalPage.children;
        this.cursorController = this.internalPage.getCursorController();

    }

    public render(): VNode {
        return (
            <div ref={this.ref}>
                {this.internalPage.render()}
            </div>
        );
    }

    public clear(): boolean {
        if (!(this.internalPage instanceof Set10BasicPage)) {
            this.setInternalPage(new Set10BasicPage(this.props, this.setInternalPage.bind(this)));
            return true;
        }

        return super.clear();
    }

    protected redraw(): void {
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.internalPage.render(), this.ref.instance);
    }

    private setInternalPage(internalPage: SixLineHalfPage): void {
        this.internalPage = internalPage;
        this.children = internalPage.children;
        this.cursorController = this.internalPage.getCursorController();
        this.requiresRedraw = true;
    }
}

type Set10BasicPageTypes = {
    fastGps: SelectField;
    enableGlow: SelectField;
    importFlightplan: Button;
}

class Set10BasicPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set10BasicPageTypes>;

    readonly name: string = "SET10";

    private readonly fplImporter = new FplFileimporter(this.props.bus, this.props.facilityLoader, this.props.messageHandler);

    constructor(props: PageProps, setPage: (page: SixLineHalfPage) => void) {
        super(props);


        const fastGpsAcquisition = this.props.userSettings.getSetting("fastGpsAcquisition").get();
        const glow = this.props.userSettings.getSetting("enableGlow").get();

        const importFlightplanButton = new Button("IMPORT FPL?", () => setPage(new Set10ImportFplFilePage(this.props, setPage)));

        this.children = new UIElementChildren<Set10BasicPageTypes>({
            fastGps: new SelectField(['REAL', 'FAST'], fastGpsAcquisition ? 1 : 0, this.saveFastGpsAcquisition.bind(this)),
            enableGlow: new SelectField(['OFF', ' ON'], glow ? 1 : 0, this.saveGlow.bind(this)),
            importFlightplan: importFlightplanButton,
        });
        importFlightplanButton.setVisible(false);

        this.cursorController = new CursorController(this.children);

        this.fplImporter.klnPlnFileExists().then(exists => importFlightplanButton.setVisible(exists));
    }

    public render(): VNode {
        return (<pre>
                GPS:&nbsp&nbsp&nbsp{this.children.get("fastGps").render()}<br/>
                GLOW:&nbsp&nbsp&nbsp{this.children.get("enableGlow").render()}<br/>
            {this.children.get("importFlightplan").render()}
            </pre>);
    }

    private saveFastGpsAcquisition(fastGpsAcquisition: number): void {
        this.props.userSettings.getSetting("fastGpsAcquisition").set(fastGpsAcquisition === 1);
        if (fastGpsAcquisition === 1) {
            this.props.sensors.in.gps.gpsSatComputer.acquireAndUseSatellites();
        }
    }

    private saveGlow(glowEnabled: number): void {
        this.props.userSettings.getSetting("enableGlow").set(glowEnabled === 1);
        if (glowEnabled === 1) {

        }

    }

}

type Set10ImportFplFilePageTypes = {
    importFlightplan: Button;
    loading: TextDisplay,
}

class Set10ImportFplFilePage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set10ImportFplFilePageTypes>;

    readonly name: string = "SET10";

    private readonly fplImporter = new FplFileimporter(this.props.bus, this.props.facilityLoader, this.props.messageHandler);

    constructor(props: PageProps, private readonly setPage: (page: SixLineHalfPage) => void) {
        super(props);

        this.children = new UIElementChildren<Set10ImportFplFilePageTypes>({
            importFlightplan: new Button("IMPORT FPLN", this.importFlightplan.bind(this)),
            loading: new TextDisplay(''),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);

    }

    public render(): VNode {
        return (<pre>
                &nbsp&nbspIMPORT<br/>
                &nbsp&nbspKLN.PLN<br/>
                INTO FPL 0?<br/>
            <br/>
            {this.children.get("importFlightplan").render()}{this.children.get("loading").render()}
            </pre>);
    }

    private importFlightplan(): void {
        this.cursorController.setCursorActive(false);
        this.children.get("importFlightplan").setVisible(false);
        this.children.get("loading").text = "LOADING...";
        this.fplImporter.importFpl().then(fpl => {
            this.props.memory.fplPage.flightplans[0].load(fpl);
            const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
            mainPage.setLeftPage(new Fpl0Page(this.props));
        }).catch(e => {
            console.error("Error importing fpl file", e);
            this.setPage(new Set10ImportFplFileErrorPage(this.props, this.setPage));
        });
    }
}

type Set10ImportFplFileErrorPageTypes = {
    retry: Button;
}

class Set10ImportFplFileErrorPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set10ImportFplFileErrorPageTypes>;

    readonly name: string = "SET10";

    constructor(props: PageProps, private readonly setPage: (page: SixLineHalfPage) => void) {
        super(props);

        this.children = new UIElementChildren<Set10ImportFplFileErrorPageTypes>({
            retry: new Button("RETRY?", this.retry.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    public render(): VNode {
        return (<pre>
                &nbsp&nbspERROR<br/>
                <br/>
                &nbsp&nbspKLN.PLN<br/>
                &nbspCANNOT BE<br/>
                &nbspIMPORTED<br/>
                &nbsp&nbsp{this.children.get("retry").render()}
            </pre>);
    }

    private retry(): void {
        this.setPage(new Set10ImportFplFilePage(this.props, this.setPage));
    }
}