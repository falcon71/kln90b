import {SelectField} from "./SelectField";
import {EventBus, Facility, FacilitySearchType, FacilityType, FSComponent, ICAO, Publisher, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {StatusLineMessageEvents} from "../StatusLine";
import {KLNFacilityLoader} from "../../data/navdata/KLNFacilityLoader";


export type WaypointFieldsetTypes = {
    ident0: SelectField;
    ident1: SelectField;
    ident2: SelectField;
    ident3: SelectField;
    ident4: SelectField;
}

const CHARSET = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export abstract class WaypointSelector<T extends Facility> implements UiElement {


    readonly children: UIElementChildren<WaypointFieldsetTypes>;
    private readonly facilityType: FacilityType;
    private statusLineMessagePublisher: Publisher<StatusLineMessageEvents>;

    protected constructor(bus: EventBus,
                          private ident: string,
                          private facilityLoader: KLNFacilityLoader,
                          private readonly length: number,
                          private readonly facilitySearchType: FacilitySearchType,
                          private readonly changedCallback: (facility: T | string) => void) {
        const childMap: { [key: string]: SelectField } = {};

        for (let i = 0; i < length; i++) {
            childMap[`ident${i}`] = new SelectField(CHARSET, CHARSET.indexOf(ident.substring(i, i + 1)), idx => this.saveChar.bind(this)(idx, i));
        }

        this.children = new UIElementChildren<WaypointFieldsetTypes>(childMap);

        switch (facilitySearchType) {
            case FacilitySearchType.Airport:
                this.facilityType = FacilityType.Airport;
                break;
            case FacilitySearchType.Vor:
                this.facilityType = FacilityType.VOR;
                break;
            case FacilitySearchType.Ndb:
                this.facilityType = FacilityType.NDB;
                break;
            case FacilitySearchType.Intersection:
                this.facilityType = FacilityType.Intersection;
                break;
            case FacilitySearchType.User:
                this.facilityType = FacilityType.USR;
                break;
            default:
                throw new Error(`Facility not supported: ${this.facilitySearchType}`);
        }

        this.statusLineMessagePublisher = bus.getPublisher<StatusLineMessageEvents>();
    }

    render(): VNode {
        return (<span>
            {...this.children.getall().map(c => c.render())}
        </span>);
    }

    tick(blink: boolean): void {
    }

    public setValue(ident: string): void {
        if (this.ident === ident) {
            return;
        }
        this.ident = ident;
        this.applyIdentToFields();
    }

    public setReadonly(readonly: boolean): void {
        for (let i = 0; i < this.length; i++) {
            this.children.get(`ident${i}` as any).isReadonly = readonly;
        }
    }

    protected isValidResult(facility: T): boolean {
        return true;
    }

    private saveChar(charIdx: number, idx: number): void {
        const enteredIdent = this.ident.substring(0, idx) + CHARSET[charIdx];


        this.facilityLoader.searchByIdent(this.facilitySearchType, enteredIdent, 100).then(async icaos => {
            let resultFound = 0;
            for (const icao of icaos) {
                const facility = await this.facilityLoader.getFacility(this.facilityType, icao) as unknown as T;
                if (this.isValidResult(facility)) {
                    if (resultFound == 0) {
                        this.ident = ICAO.getIdent(facility.icao);
                        this.changedCallback(facility);
                    } else if (resultFound == 1) {
                        if (this.ident === ICAO.getIdent(facility.icao)) {
                            this.statusLineMessagePublisher.pub("statusLineMessage", "DUP IDENT");
                        }
                        break;
                    }
                    resultFound++;
                }
            }
            if (resultFound === 0) {
                this.ident = enteredIdent;
                this.changedCallback(enteredIdent);
            }

            this.applyIdentToFields();
        });
    }

    private applyIdentToFields(): void {
        const ident = this.ident.padEnd(this.length, " ");

        for (let i = 0; i < this.length; i++) {
            this.children.get(`ident${i}` as any).value = CHARSET.indexOf(ident.substring(i, i + 1));
        }
    }


}