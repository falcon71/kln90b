import {ComponentProps, DisplayComponent, EventBus, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {PageManager} from "./PageManager";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {Sensors} from "../Sensors";
import {VolatileMemory} from "../data/VolatileMemory";
import {NearestUtils} from "../data/navdata/NearestUtils";
import {RemarksManager} from "../settings/RemarksManager";
import {Nearestlists} from "../data/navdata/NearestList";
import {KLNFacilityLoader} from "../data/navdata/KLNFacilityLoader";
import {Scanlists} from "../data/navdata/Scanlist";
import {MessageHandler} from "../data/MessageHandler";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {Hardware} from "../Hardware";
import {MSA} from "../services/MSA";
import {Vnav} from "../services/Vnav";
import {ModeController} from "../services/ModeController";
import {Database} from "../data/navdata/Database";
import {KLNMagvar} from "../data/navdata/KLNMagvar";
import {SidStar} from "../data/navdata/SidStar";

export enum PageSide {
    LeftPage,
    RightPage
}

/**
 * State and services avaiable to all pages.
 */
export interface PageProps extends ComponentProps {
    ref: NodeReference<DisplayComponent<any, any> | HTMLElement | SVGElement>;
    bus: EventBus;
    userSettings: KLN90BUserSettings,
    planeSettings: KLN90PlaneSettings;
    sensors: Sensors;
    pageManager: PageManager;
    messageHandler: MessageHandler;
    hardware: Hardware;
    memory: VolatileMemory;
    facilityLoader: KLNFacilityLoader;
    nearestLists: Nearestlists;
    nearestUtils: NearestUtils;
    scanLists: Scanlists;
    remarksManager: RemarksManager;
    msa: MSA;
    vnav: Vnav;
    modeController: ModeController;
    database: Database;
    magvar: KLNMagvar,
    sidstar: SidStar,
}

/**
 * This is a full page. May be a container in the case of MainPage.
 */
export interface Page extends UiElement {
    onInteractionEvent(evt: string): boolean;

    isEnterAccepted(): boolean;

    isLeftCursorActive(): boolean;

    isRightCursorActive(): boolean;

    leftPageName(): string;

    rightPageName(): string;

    isMessagePageShown(): boolean;


}

export declare type UiElementRecord = Record<any, UiElement>;

export type ChildMap = {
    [id: string]: UiElement;
}

/**
 * Children of an element. Allow accessing children using the get method.
 */
export class UIElementChildren<T extends UiElementRecord> {
    private readonly children: ChildMap = {};


    constructor(children: ChildMap) {
        this.children = children;
    }

    /**
     * Converts a list of elements
     * @param list
     */
    static forList(list: UiElement[]): UIElementChildren<any> {
        const listMap = list.reduce((acc: { [key: string]: UiElement }, curr, idx) => (acc["i" + idx] = curr, acc), {});
        return new UIElementChildren<any>(listMap);
    }

    public get<K extends keyof T & string>(key: K): T[K] {

        // @ts-ignore
        return this.children[key];
    }

    public set<K extends keyof T & string>(key: K, child: T[K]) {
        this.children[key] = child;
    }

    public walk(fn: (el: UiElement) => void) {
        for (const name in this.children) {
            const child = this.children[name];
            fn(child);
            child.children.walk(fn);
        }
    }

    public getallFlat(): UiElement[] {
        const flatChildren = [];
        for (const name in this.children) {
            const child = this.children[name];
            flatChildren.push(child, ...child.children.getallFlat());
        }
        return flatChildren;
    }

    public getall(): UiElement[] {
        const children = [];
        for (const name in this.children) {
            const child = this.children[name];
            children.push(child);
        }
        return children;
    }

}

export const NO_CHILDREN = new UIElementChildren({});

/**
 * A element that can be rendered. Interactive elements implement the interface Field
 */
export interface UiElement {

    readonly children: UIElementChildren<any>;

    tick(blink: boolean): void;

    render(): VNode | null;
}