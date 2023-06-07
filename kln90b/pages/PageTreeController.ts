import {
    Fpl0Page,
    Fpl10Page,
    Fpl11Page,
    Fpl12Page,
    Fpl13Page,
    Fpl14Page,
    Fpl15Page,
    Fpl16Page,
    Fpl17Page,
    Fpl18Page,
    Fpl19Page,
    Fpl1Page,
    Fpl20Page,
    Fpl21Page,
    Fpl22Page,
    Fpl23Page,
    Fpl24Page,
    Fpl25Page,
    Fpl2Page,
    Fpl3Page,
    Fpl4Page,
    Fpl5Page,
    Fpl6Page,
    Fpl7Page,
    Fpl8Page,
    Fpl9Page,
} from "./left/FplPage";
import {Nav1Page} from "./left/Nav1Page";
import {Nav2Page} from "./left/Nav2Page";
import {Nav3Page} from "./left/Nav3Page";
import {Nav4LeftPage, Nav4RightPage} from "./left/Nav4Page";
import {Nav5Page} from "./left/Nav5Page";
import {Set1Page} from "./left/Set1Page";
import {Set2Page} from "./left/Set2Page";
import {Set3Page} from "./left/Set3Page";
import {Set4Page} from "./left/Set4Page";
import {Set5Page} from "./left/Set5Page";
import {Set6Page} from "./left/Set6Page";
import {Set7Page} from "./left/Set7Page";
import {Set8Page} from "./left/Set8Page";
import {Set9Page} from "./left/Set9Page";
import {Oth1Page} from "./left/Oth1Page";
import {Oth2Page} from "./left/Oth2Page";
import {Oth3Page} from "./left/Oth3Page";
import {Oth4Page} from "./left/Oth4Page";
import {ActPagePage} from "./right/ActPage";
import {Dt1Page} from "./right/Dt1Page";
import {Dt2Page} from "./right/Dt2Page";
import {Dt3Page} from "./right/Dt3Page";
import {Dt4Page} from "./right/Dt4Page";
import {Apt1Page} from "./right/Apt1Page";
import {Apt2Page} from "./right/Apt2Page";
import {Apt3Page} from "./right/Apt3Page";
import {Apt4Page} from "./right/Apt4Page";
import {Apt5Page} from "./right/Apt5Page";
import {Apt6Page} from "./right/Apt6Page";
import {VorPage} from "./right/VorPage";
import {NdbPage} from "./right/NdbPage";
import {IntPage} from "./right/IntPage";
import {SupPage} from "./right/SupPage";
import {SixLineHalfPage} from "./FiveSegmentPage";
import {PageProps} from "./Page";
import {Tri0Page} from "./left/Tri0Page";
import {Tri1Page} from "./left/Tri1Page";
import {Tri3Page} from "./left/Tri3Page";
import {Tri5Page} from "./left/Tri5Page";
import {Tri2Page} from "./left/Tri2Page";
import {Tri4Page} from "./left/Tri4Page";
import {Tri6Page} from "./left/Tri6Page";
import {Cal1Page} from "./left/Cal1Page";
import {Cal2Page} from "./left/Cal2Page";
import {Cal3Page} from "./left/Cal3Page";
import {Cal4Page} from "./left/Cal4Page";
import {Cal5Page} from "./left/Cal5Page";
import {Cal6Page} from "./left/Cal6Page";
import {Cal7Page} from "./left/Cal7Page";
import {RefPage} from "./right/RefPage";
import {Ctr1Page} from "./right/Ctr1Page";
import {Ctr2Page} from "./right/Ctr2Page";
import {Sta3Page} from "./left/Sta3Page";
import {Sta4Page} from "./left/Sta4Page";
import {Mod1Page} from "./left/Mod1Page";
import {Mod2Page} from "./left/Mod2Page";
import {Oth5Page} from "./left/Oth5Page";
import {Oth6Page} from "./left/Oth6Page";
import {Oth7Page} from "./left/Oth7Page";
import {Oth8Page} from "./left/Oth8Page";
import {Oth9Page} from "./left/Oth9Page";
import {Oth10Page} from "./left/Oth10Page";
import {Set0DummyPage} from "./left/Set0Page";
import {Apt8Page} from "./right/Apt8Page";
import {Apt7Page} from "./right/Apt7Page";
import {Sta2Page} from "./left/Sta2Page";
import {Sta5Page} from "./left/Sta5Page";
import {Sta1Page} from "./left/Sta1Page";
import {Set10Page} from "./left/Set10Page";

export const LEFT_PAGE_TREE = [
    [Tri0Page, Tri1Page, Tri2Page, Tri3Page, Tri4Page, Tri5Page, Tri6Page],
    [Mod1Page, Mod2Page],
    [Fpl0Page, Fpl1Page, Fpl2Page, Fpl3Page, Fpl4Page, Fpl5Page, Fpl6Page, Fpl7Page, Fpl8Page, Fpl9Page, Fpl10Page, Fpl11Page, Fpl12Page, Fpl13Page, Fpl14Page, Fpl15Page, Fpl16Page, Fpl17Page, Fpl18Page, Fpl19Page, Fpl20Page, Fpl21Page, Fpl22Page, Fpl23Page, Fpl24Page, Fpl25Page],
    [Nav1Page, Nav2Page, Nav3Page, Nav4LeftPage, Nav5Page],
    [Cal1Page, Cal2Page, Cal3Page, Cal4Page, Cal5Page, Cal6Page, Cal7Page],
    [Sta1Page, Sta2Page, Sta3Page, Sta4Page, Sta5Page],
    [Set1Page, Set2Page, Set3Page, Set4Page, Set5Page, Set6Page, Set7Page, Set8Page, Set9Page, Set10Page, Set0DummyPage],
    [Oth1Page, Oth2Page, Oth3Page, Oth4Page, Oth5Page, Oth6Page, Oth7Page, Oth8Page, Oth9Page, Oth10Page],
];

export const RIGHT_PAGE_TREE = [
    [Ctr1Page, Ctr2Page],
    [RefPage],
    [ActPagePage],
    [Dt1Page, Dt2Page, Dt3Page, Dt4Page],
    [Nav1Page, Nav2Page, Nav3Page, Nav4RightPage, Nav5Page],
    [Apt1Page, Apt2Page, Apt3Page, Apt4Page, Apt5Page, Apt6Page, Apt7Page, Apt8Page],
    [VorPage],
    [NdbPage],
    [IntPage],
    [SupPage],
];

/**
 * This class handles navigation in the page tree
 */
export class PageTreeController {
    private readonly subPageIndices = this.tree.map(() => 0);
    private pageIndex: number = 0;

    constructor(private readonly tree: (typeof LEFT_PAGE_TREE | typeof RIGHT_PAGE_TREE), public currentPage: SixLineHalfPage, public props: PageProps, private readonly onPageChanged: (newpage: SixLineHalfPage) => void) {
        if (tree.length === 8) { //left tree
            if (!this.props.planeSettings.input.airdata.isInterfaced) {
                this.tree[7].splice(8, 2); //Removes airdata pages
            }
            if (!this.props.planeSettings.input.fuelComputer.isInterfaced) {
                this.tree[7].splice(4, 4); //Removes fuel computer pages
            }
        } else {
            if (!this.props.planeSettings.vfrOnly) { //Not sure what the conditions are exactly. Maybe altitude input, CRS output and indicators?
                this.tree[5].splice(7, 0); //3-49 Removes APT 8 page
            }
        }


        [this.pageIndex, this.subPageIndices[this.pageIndex]] = this.getPageIndices(currentPage);
    }

    public setPage(page: SixLineHalfPage) {
        if (this.currentPage === page) {
            return;
        }
        this.currentPage = page;
        [this.pageIndex, this.subPageIndices[this.pageIndex]] = this.getPageIndices(page);
        this.onPageChanged(page);
    }

    /**
     * Selects the next page in the right pagetree
     * @param direction forward or backwards
     * @private
     */
    public movePage(direction: number) {
        this.pageIndex += direction;
        if (this.pageIndex < 0) {
            this.pageIndex = this.tree.length - 1;
        } else if (this.pageIndex >= this.tree.length) {
            this.pageIndex = 0;
        }

        const type = this.tree[this.pageIndex][this.getPageSubIndex()];
        this.setPage(this.createPage(type));
    }

    /**
     * Selects the next subpage in the right pagetree
     * @param direction forward or backwards
     * @private
     */
    public moveSubpage(direction: number) {
        if (direction < 0) {
            if (this.currentPage.currentPage > 0) {
                this.currentPage.setCurrentPage(this.currentPage.currentPage + direction);
            } else {
                let newIdx = this.getPageSubIndex() + direction;
                if (newIdx < 0) {
                    newIdx = this.tree[this.pageIndex].length - 1;
                }
                if (newIdx !== this.getPageSubIndex()) {
                    this.setPageSubIndex(newIdx);
                    const type = this.tree[this.pageIndex][this.getPageSubIndex()];
                    this.setPage(this.createPage(type));
                    this.currentPage.setCurrentPage(this.currentPage.numPages - 1);
                }
            }

        } else {
            if (this.currentPage.currentPage + 1 < this.currentPage.numPages) {
                this.currentPage.setCurrentPage(this.currentPage.currentPage + direction);
            } else {
                let newIdx = this.getPageSubIndex() + direction;
                if (newIdx >= this.tree[this.pageIndex].length) {
                    newIdx = 0;
                }
                if (newIdx !== this.getPageSubIndex()) {
                    this.setPageSubIndex(newIdx);
                    const type = this.tree[this.pageIndex][this.getPageSubIndex()];
                    this.setPage(this.createPage(type));
                    this.currentPage.setCurrentPage(0);
                }
            }
        }
    }

    private createPage(type: any): SixLineHalfPage {
        return new type(this.props);

    }

    private getPageIndices(page: SixLineHalfPage): [number, number] {
        for (let pageIndex = 0; pageIndex < this.tree.length; pageIndex++) {
            const subPageTree = this.tree[pageIndex];
            for (let subpageIndex = 0; subpageIndex < subPageTree.length; subpageIndex++) {
                const subpage = subPageTree[subpageIndex];
                // noinspection SuspiciousTypeOfGuard
                if (page instanceof subpage) {
                    return [pageIndex, subpageIndex];
                }
            }
        }
        throw Error(`page ${page} not found in pagetree`);
    }

    private getPageSubIndex(): number {
        return this.subPageIndices[this.pageIndex];
    }

    private setPageSubIndex(rightSubpageIndex: number): void {
        this.subPageIndices[this.pageIndex] = rightSubpageIndex;
    }
}

/**
 * The WaypointConfirmPage and ActPage have dynamic trees depending on the type of data they show
 */
export interface CustomPageTreeController {
    pageTreeController: PageTreeController;
}

export function isCustomPageTreeController(page: any): page is CustomPageTreeController {
    return "pageTreeController" in page;
}
