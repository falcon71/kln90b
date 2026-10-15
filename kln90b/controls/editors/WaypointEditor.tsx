import {Editor, Rawvalue} from "./Editor";
import {Facility, FacilitySearchType, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {AlphabetEditorField, EditorField, EditorFieldValue, FirstIdentEditorField} from "./EditorField";
import {PageProps, PageSide} from "../../pages/Page";
import {MainPage} from "../../pages/MainPage";
import {EnterResult} from "../../pages/CursorController";
import {DuplicateWaypointPage} from "../../pages/left/DuplicateWaypointPage";
import {WaypointConfirmPage} from "../../pages/right/WaypointConfirmPage";
import {isWapointPage, unpackFacility} from "../../pages/right/WaypointPage";
import {SixLineHalfPage} from "../../pages/FiveSegmentPage";
import {SupPage} from "../../pages/right/SupPage";
import {reportErrors} from "../ErrorPage";

interface WaypointEditorProps extends PageProps {
    value?: Facility | null,
    enterCallback: (text: Facility | null) => void,
    emptyFieldValue?: EditorFieldValue,

    pageSite?: PageSide,

    parent: SixLineHalfPage,

    /**
     * False: CLR does not blank the ident, it only closes an open edit (Editor's CLR). SET 1, checked in the KLN 89
     * trainer, 2026-10-12 (#244). Default true: CLR blanks the ident and waits for ENT (3-29)
     */
    clearBlanks?: boolean,

    /**
     * #262 4-2: true on the flight plan pages and D->: ENT on an ident in no database brings up the SUP page that
     * creates a user waypoint of that name, and the new waypoint then waits for the normal approval. Default false: every
     * other host answers NO SUCH WPT (C-2)
     */
    offerCreation?: boolean,

}

/**
 * 3-14 3.4.2 Data Entry
 */
export class WaypointEditor extends Editor<Facility | null> {

    /**
     * True if we await confirmation for the entered value (might be CLR)
     * @private
     */
    private isAwaitingConfirmation: boolean = false;
    private valueToConfirm: Facility | null = null;
    /**
     * #262: the SUP page that creates the typed ident, from the ENT that brought it up until the waypoint is stored or
     * the creation is canceled. The editor stays entered meanwhile and leaves ENT to that page
     */
    private creationPage: SupPage | null = null;


    constructor(private props: WaypointEditorProps) {
        super(props.bus, [
            new FirstIdentEditorField(),
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
        if (this.isCreationPageOpen()) {
            //#262 ENT belongs to the creation page on the right, or to the page it pushed (the approval of a REF waypoint)
            return EnterResult.Not_Handled;
        }
        this.creationPage = null; //A creation page closed on the right: the typed ident is searched again
        if (this.isAwaitingConfirmation) {
            return this.currentValueConfirmed();
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
                //#343: only the trailing blanks go, a blank inside the ident stays
                const ident = editedValue.map((v, i) => this.editorFields[i].charset[v]).join("").replace(/ +$/, "");
                if (this.props.offerCreation && ident !== "" && !ident.startsWith(" ")) {
                    this.showCreationPage(ident);
                } else {
                    this.statusLineMessagePublisher.pub("statusLineMessage", "NO SUCH WPT");
                }
                return EnterResult.Handled_Keep_Focus;
            }
            this.setEntered(false);
            await this.confirmValue(editedValue, value);
            return EnterResult.Handled_Move_Focus;
        }
    }

    /**
     * True while the waypoint (or the CLR of it) waits for the approval with ENT
     */
    public isWaitingForConfirmation(): boolean {
        return this.isAwaitingConfirmation;
    }

    /**
     * #262: true while the SUP page that creates the typed ident is on the right stack, shown or covered by a page it
     * pushed (the approval of a REF waypoint). FlightplanListItem.clear reads it before and after CLR: true before and
     * false after means CLR canceled the creation
     */
    public isWaitingForCreation(): boolean {
        return this.isCreationPageOpen();
    }

    /**
     * True if we are showing the waypoint page on the right.
     * Might be different than isAwaitingConfirmation, if we confirm a CLR
     * @private
     */
    private isShowingWaypointPage(): boolean {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        return mainPage.getRightPage() instanceof WaypointConfirmPage;
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
        this.children.walk((child) => (child as EditorField).isParentBlink = this.isAwaitingConfirmation);

        super.tick(blink);

    }

    outerLeft(): boolean {
        if (this.isAwaitingConfirmation) {
            return true; //We don't want the cursor to move
        }
        return super.outerLeft();
    }

    outerRight(): boolean {
        if (this.isAwaitingConfirmation) {
            return true; //We don't want the cursor to move
        }
        return super.outerRight();
    }

    innerLeft(): boolean {
        this.cancelCreation(); //#262 the ident is changed: its creation page goes
        if (this.isAwaitingConfirmation) { //3-28 Note: If an incorrect identifier has been entered, you may immediately start using the left inner knob to re-enter the correct identifier
            this.cancelAwaitingConfirmation();
        }
        const startsEntry = !this.isEntered;
        const handled = super.innerLeft();
        if (startsEntry) {
            this.startEntryWith("9");
        }
        return handled;
    }

    innerRight(): boolean {
        this.cancelCreation(); //#262 the ident is changed: its creation page goes
        if (this.isAwaitingConfirmation) { //3-28 Note: If an incorrect identifier has been entered, you may immediately start using the left inner knob to re-enter the correct identifier
            this.cancelAwaitingConfirmation();
        }
        const startsEntry = !this.isEntered;
        const handled = super.innerRight();
        if (startsEntry) {
            this.startEntryWith("A");
        }
        return handled;
    }

    /**
     * #311: the click that starts an entry gives the first character of the wheel in its direction, an A clockwise and a
     * 9 counterclockwise, and offers the first identifier that begins with it (3-14, checked in the KLN 89 trainer,
     * 2026-10-08 and 2026-10-15). The numeric editors keep the blank of Editor.setEntered, so this is not done there
     */
    private startEntryWith(ch: string): void {
        this.editorFields[0].setDisplayValue(ch);
        reportErrors(this.onCharChanged(), this.props.bus);
    }

    isEnterAccepted(): boolean {
        if (this.isCreationPageOpen()) {
            return false; //#262 MainPage passes ENT on to the right side, where the creation page is open
        }
        return super.isEnterAccepted();
    }

    isClearAccepted(): boolean {
        if (this.props.clearBlanks === false) {
            return super.isClearAccepted();
        }
        return true;
    }

    clear(): boolean {
        if (this.props.clearBlanks === false) {
            return super.clear();
        }
        if (this.isCreationPageOpen()) {
            const rightPage = (this.props.pageManager.getCurrentPage() as MainPage).getRightPage();
            if (rightPage.hasOpenEntry()) {
                //An open entry on the right is closed first, as on any page (#307): a latitude being typed on the
                //creation page, or the REF waypoint waiting for its approval on the page above it (#359)
                return rightPage.clear();
            }
            //#262, checked in the KLN 89 trainer, 2026-10-15: CLR on the creation choices creates nothing and leaves a
            //blank field without a pending approval
            this.cancelCreation();
            this.value = null;
            this.convertedValue = null;
            this.setEntered(false);
            return true;
        }
        if (this.isAwaitingConfirmation) {
            this.cancelAwaitingConfirmation();
        }
        this.confirmValue(null, null);

        return true;
    }

    protected convertFromValue(value: Facility): Rawvalue {
        const ident = value.icaoStruct.ident.padEnd(5);

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
            .filter(wpt => wpt.icaoStruct.ident === ident); //We only want exact matches
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

        const values = await this.props.facilityLoader.searchByIdentWithIcaoStructs(FacilitySearchType.All, ident, 1);
        if (values.length > 0) {
            ident = values[0].ident;
        }
        ident = ident.padEnd(5, " ");

        for (let i = this.cursorIndex; i < this.editorFields.length; i++) {
            this.editorFields[i].setDisplayValue(ident.substring(i, i + 1));
        }
        return Promise.resolve();
    }

    /**
     * #374: the first cell takes no blank (checked in the KLN 89 trainer, 2026-10-15). True for a blank that would go
     * into it: a key that starts an edit, or re-enters after the approval, goes to the first cell, as does a key with the
     * cursor on it. Callers that open the edit before they hand the key over (FlightplanListItem) ask first, so that a
     * refused key changes nothing
     */
    public refusesKey(key: string): boolean {
        return key === " " && (!this.isEntered || this.isAwaitingConfirmation || this.cursorIndex === 0);
    }

    public keyboard(key: string): boolean {
        if (this.refusesKey(key)) {
            return false; //Editor.keyboard would open the edit first
        }
        this.cancelCreation(); //#262 the ident is changed: its creation page goes
        if (this.isAwaitingConfirmation) { //3-28 Note: If an incorrect identifier has been entered, you may immediately start using the left inner knob to re-enter the correct identifier
            this.cancelAwaitingConfirmation();
        }
        return super.keyboard(key);
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

    protected setEntered(isEntered: boolean) {
        if (!isEntered) {
            this.cancelCreation(); //#262 the cursor was turned off or the page left: the creation page goes
        }
        if (!isEntered && this.isAwaitingConfirmation) {
            this.cancelAwaitingConfirmation();
        }
        super.setEntered(isEntered);
    }

    public currentValueConfirmed(): EnterResult {
        if (this.isShowingWaypointPage()) {//The waypoint confirm Page is shown. Return will be handled there
            const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
            mainPage.popRightPage();
        }

        this.isAwaitingConfirmation = false;

        if (this.valueToConfirm === null) {
            this.convertedValue = null;
        } else {
            this.convertedValue = this.convertFromValue(this.valueToConfirm);
        }
        this.value = this.valueToConfirm;

        this.enterCallback(this.valueToConfirm);
        this.isEntered = false;
        this.valueToConfirm = null;
        return EnterResult.Handled_Move_Focus;
    }

    private async confirmValue(editedValue: Rawvalue | null, value: Facility | null): Promise<void> {
        this.isEntered = true; //We still want to steal the cursor
        this.isAwaitingConfirmation = true;
        this.valueToConfirm = value;

        this.applyValueToFields(editedValue);

        if (value === null) {
            return Promise.resolve();
        }

        return WaypointConfirmPage.showWaypointconfirmation({
            ...this.propsForPushedPage(),
            facility: value,
            callingEditor: this,
        }, this.props.parent);
    }

    private cancelAwaitingConfirmation() {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        if (this.isShowingWaypointPage()) {
            mainPage.popRightPage();
        }
        this.isAwaitingConfirmation = false;
        this.valueToConfirm = null;
        this.isEntered = false;
        this.applyValueToFields(this.convertedValue);
    }

    /**
     * #262 4-2, 5-16: the SUP page on the right offers to create the typed ident (CREATE NEW WPT AT:). The editor stays
     * entered and keeps the ident (checked in the KLN 89 trainer, 2026-10-15). The page is a child of this editor's page,
     * as the waypoint confirmation is
     */
    private showCreationPage(ident: string): void {
        this.creationPage = SupPage.createWaypointPage(this.propsForPushedPage(), {
            ident: ident,
            onCreated: this.waypointCreated.bind(this),
        });
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.pushRightPage(this.creationPage, this.props.parent);
    }

    /**
     * #262: the props of a page this editor pushes on the right. The REF editors of those pages are built from them and
     * keep NO SUCH WPT
     */
    private propsForPushedPage(): WaypointEditorProps {
        return {...this.props, offerCreation: false};
    }

    /**
     * #262: the creation page is on the right stack. It need not be the shown page: on USER POS? its REF waypoint is
     * approved on a waypoint page pushed on top of it (5-19), and a duplicate REF ident pushes the list of duplicates
     */
    private isCreationPageOpen(): boolean {
        if (this.creationPage === null) {
            return false;
        }
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        return mainPage.isInRightStack(this.creationPage);
    }

    /**
     * #262: the SUP page has stored the new waypoint. It now waits for the normal approval, whose ENT inserts it or
     * executes the Direct To (checked in the KLN 89 trainer, 2026-10-15)
     */
    private waypointCreated(facility: Facility): void {
        if (this.creationPage === null) {
            return;
        }
        this.cancelCreation();
        this.setEntered(false);
        reportErrors(this.confirmValue(this.convertFromValue(facility), facility), this.props.bus);
    }

    /**
     * #262: removes the creation page, with the pages it pushed on top of it, if it is still open, and ends the wait for
     * the creation
     */
    private cancelCreation(): void {
        if (this.isCreationPageOpen()) {
            const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
            while (mainPage.popRightPage() !== this.creationPage) {
                //The pages above the creation page belong to it
            }
        }
        this.creationPage = null;
    }
}