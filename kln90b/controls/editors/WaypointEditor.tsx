import {Editor, Rawvalue} from "./Editor";
import {Facility, FacilitySearchType, FSComponent, ICAO, VNode} from "@microsoft/msfs-sdk";
import {AlphabetEditorField, EditorFieldValue} from "./EditorField";
import {PageProps, PageSide} from "../../pages/Page";
import {MainPage} from "../../pages/MainPage";
import {TickController} from "../../TickController";
import {EnterResult} from "../../pages/CursorController";
import {DuplicateWaypointPage} from "../../pages/left/DuplicateWaypointPage";
import {WaypointConfirmPage} from "../../pages/right/WaypointConfirmPage";
import {isWapointPage, unpackFacility} from "../../pages/right/WaypointPage";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {SixLineHalfPage} from "../../pages/FiveSegmentPage";

interface WaypointEditorProps extends PageProps {
    value?: Facility | null,
    enterCallback: (text: Facility | null) => void,
    emptyFieldValue?: EditorFieldValue,

    pageSite?: PageSide,

    parent: SixLineHalfPage,

}

/**
 * 3-14 3.4.2 Data Entry
 */
export class WaypointEditor extends Editor<Facility | null> {

    /**
     * True if the waypoint page is shown, and we await confirmation
     * @private
     */
    private isAwaitingConfirmationForAirport: boolean = false;

    constructor(private props: WaypointEditorProps) {
        super(props.bus, [
            new AlphabetEditorField(),
            new AlphabetEditorField(),
            new AlphabetEditorField(),
            new AlphabetEditorField(),
            new AlphabetEditorField(),
        ], props.value ?? null, props.enterCallback, props.emptyFieldValue === undefined ? 0 : props.emptyFieldValue);

        this.DEFAULT_FIELD_VALUE = 0;
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}{this.editorFields[3].render()}{this.editorFields[4].render()}
        </span>);
    }

    async enter(): Promise<EnterResult> {
        if (this.isAwaitingConfirmationForAirport) {
            if (this.editorFields[0].value === 0) { //This is a hack. This means, clear was pressed on the DCT page and no airport was actually shown
                this.valueConfirmed(null);
                return EnterResult.Handled_Move_Focus;
            } else { //The waypoint confirm Page is shown. Return will be handled there
                return EnterResult.Not_Handled;
            }
        } else if (!this.isEntered) {
            //3.15 3.4.3 Alternate Waypoint Data Entry Methode
            const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
            const rightPage = mainPage.getRightPage();

            if (!isWapointPage(rightPage)) {
                return EnterResult.Not_Handled;
            }
            const facility = unpackFacility(rightPage.facility);
            if (facility === null) {
                return EnterResult.Not_Handled;
            }
            const editedValue = this.convertFromValue(facility);
            await this.confirmValue(editedValue, facility);
            return EnterResult.Handled_Move_Focus;
        } else {
            const editedValue = this.editorFields.map(f => f.value ?? 0);
            const value = await this.convertToValue(editedValue);
            if (value === null) {
                this.statusLineMessagePublisher.pub("statusLineMessage", "NO SUCH WPT");
                return EnterResult.Handled_Keep_Focus;
            }
            this.setEntered(false);
            await this.confirmValue(editedValue, value);
            return EnterResult.Handled_Move_Focus;
        }
    }

    /**
     * Used in the direct to page. This control will immediatly ask for confirmation of the entered value
     */
    public confirmCurrentValue(): Promise<void> {
        if (this.value === null) {
            return this.confirmValue(null, null);
        } else {
            const editedValue = this.convertFromValue(this.value);
            return this.confirmValue(editedValue, this.value);
        }

    }

    tick(blink: boolean) {
        super.tick(blink);
        if (!TickController.checkRef(this.containerRef)) {
            return;
        }
        if (this.isAwaitingConfirmationForAirport && blink) {
            this.containerRef!.instance.classList.add("inverted-blink");
        } else {
            this.containerRef!.instance.classList.remove("inverted-blink");
        }

    }

    outerLeft(): boolean {
        if (this.isAwaitingConfirmationForAirport) {
            return true; //We don't want the cursor to move
        }
        return super.outerLeft();
    }

    outerRight(): boolean {
        if (this.isAwaitingConfirmationForAirport) {
            return true; //We don't want the cursor to move
        }
        return super.outerRight();
    }

    innerLeft(): boolean {
        if (this.isAwaitingConfirmationForAirport) { //3-28 Note: If an incorrect identifier has been entered, you may immediately start using the left inner knob to re-enter the correct identifier
            this.cancelAwaitingConfirmation();
        }
        return super.innerLeft();
    }

    innerRight(): boolean {
        if (this.isAwaitingConfirmationForAirport) { //3-28 Note: If an incorrect identifier has been entered, you may immediately start using the left inner knob to re-enter the correct identifier
            this.cancelAwaitingConfirmation();
        }
        return super.innerRight();
    }

    isEnterAccepted(): boolean {
        return super.isEnterAccepted() && !this.isAwaitingConfirmationForAirport; //We don't want to steal the enter Event from the WaypointConfirmationPage
    }

    isClearAccepted(): boolean {
        return true;
    }

    clear(): boolean {
        if (this.isAwaitingConfirmationForAirport) {
            this.cancelAwaitingConfirmation();
        }
        this.confirmValue(null, null);

        return true;
    }

    protected convertFromValue(value: Facility): Rawvalue {
        const ident = IcaoFixedLength.getIdent(value.icao);

        return [
            this.editorFields[0].charset.indexOf(ident.substring(0, 1)),
            this.editorFields[1].charset.indexOf(ident.substring(1, 2)),
            this.editorFields[2].charset.indexOf(ident.substring(2, 3)),
            this.editorFields[3].charset.indexOf(ident.substring(3, 4)),
            this.editorFields[4].charset.indexOf(ident.substring(4, 5)),
        ];
    }

    protected async convertToValue(rawValue: Rawvalue): Promise<Facility | null> {
        const val = Array(rawValue.length);
        for (let i = 0; i < rawValue.length; i++) {
            val[i] = this.editorFields[i].charset[rawValue[i]];
        }
        const ident = val.join("").trim();
        const results = (await this.props.facilityLoader.findNearestFacilitiesByIdent(FacilitySearchType.All, ident, this.props.sensors.in.gps.coords.lat, this.props.sensors.in.gps.coords.lon, 99))
            .filter(wpt => ICAO.getIdent(wpt.icao) === ident); //We only want exact matches
        if (results.length === 0) {
            return null;
        } else if (results.length === 1) {
            return results[0];
        } else {
            return await this.selectDuplicateWaypoint(ident, results);
        }
    }

    /**
     * 3-14: The following characters are automatically appended based on the first match
     * @protected
     */
    protected async onCharChanged(): Promise<void> {
        if (this.cursorIndex == 4) {
            return Promise.resolve();
        }

        let ident = this.editorFields
            .slice(0, this.cursorIndex + 1)
            .map(f => f.charset[f.value!])
            .join("");

        const values = await this.props.facilityLoader.searchByIdent(FacilitySearchType.All, ident, 1);
        if (values.length > 0) {
            ident = ICAO.getIdent(values[0]);
        }
        ident = ident.padEnd(5, " ");

        for (let i = this.cursorIndex; i < this.editorFields.length; i++) {
            this.editorFields[i].setDisplayValue(ident.substring(i, i + 1));
        }
        return Promise.resolve();
    }

    protected setEntered(isEntered: boolean) {
        if (!isEntered && this.isAwaitingConfirmationForAirport) {
            this.cancelAwaitingConfirmation();
        }
        super.setEntered(isEntered);
    }

    private async selectDuplicateWaypoint(ident: string, waypoints: Facility[]): Promise<Facility> {
        const props = {
            ...this.props,
            ident: ident,
            waypoints: waypoints,
            side: this.props.pageSite ?? PageSide.LeftPage,
        };
        return DuplicateWaypointPage.selectDuplicateWaypoint(props);
    }

    private async confirmValue(editedValue: Rawvalue | null, value: Facility | null): Promise<void> {
        this.isEntered = true; //We still want to steal the cursor
        this.isAwaitingConfirmationForAirport = true;

        this.applyValueToFields(editedValue);

        if (value === null) {
            return Promise.resolve();
        }

        return WaypointConfirmPage.showWaypointconfirmation({
            ...this.props,
            facility: value,
        }, this.props.parent).then(this.valueConfirmed.bind(this));
    }

    private valueConfirmed(value: Facility | null): void {
        this.isAwaitingConfirmationForAirport = false;

        if (value === null) {
            this.convertedValue = null;
        } else {
            this.convertedValue = this.convertFromValue(value);
        }
        this.value = value;

        this.enterCallback(value);
        this.isEntered = false;
    }

    private cancelAwaitingConfirmation() {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.popRightPage();
        this.isAwaitingConfirmationForAirport = false;
        this.isEntered = false;
        this.applyValueToFields(this.convertedValue);
    }
}