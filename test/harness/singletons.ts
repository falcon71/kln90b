import {FlightPlanner} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserWaypointsSettings} from '../../kln90b/settings/KLN90BUserWaypoints';
import {KLN90BUserFlightplansSettings} from '../../kln90b/settings/KLN90BUserFlightplans';
import {KLN90BUserRemarkSettings} from '../../kln90b/settings/KLN90BUserRemarkSettings';
import {LEFT_PAGE_TREE} from '../../kln90b/pages/PageTreeController';

/** PageTreeController prunes LEFT_PAGE_TREE in place on every MainPage (#90); restore it for the next unit */
const LEFT_TREE_AT_LOAD = LEFT_PAGE_TREE.map(group => [...group]);

/** Only the left tree is restored. RIGHT_PAGE_TREE is spliced in place too, but with a delete count of 0 (the other half of #90) */
export function restorePageTrees(): void {
    LEFT_PAGE_TREE.length = 0;
    LEFT_TREE_AT_LOAD.forEach(group => LEFT_PAGE_TREE.push([...group]));
}

/**
 * Sets a private static singleton field back to undefined. A required field that does not exist throws, so a renamed
 * singleton fails here instead of leaking into the next unit. With TypeScript's class fields for es2017 a declared but
 * never assigned static does not exist, so a boot that failed early passes required = false.
 */
export function clearStatic(owner: Function, field: string, required: boolean): void {
    if (!Object.prototype.hasOwnProperty.call(owner, field)) {
        if (!required) return;
        throw new Error(`resetSingletons: ${owner.name}.${field} does not exist. Was it renamed? Update test/harness/singletons.ts`);
    }
    (owner as any)[field] = undefined;
}

/**
 * Clears the singletons a booted unit creates, so the next bootUnit builds fresh ones on its own bus. FlightPlanner keeps
 * its planners by id; without this the next unit would get the "kln90b" planner bound to the old bus.
 */
export function resetSingletons(required: boolean): void {
    clearStatic(KLNFacilityRepository, 'INSTANCE', required);
    clearStatic(KLN90BUserWaypointsSettings, 'INSTANCE', required);
    clearStatic(KLN90BUserFlightplansSettings, 'INSTANCE', required);
    clearStatic(KLN90BUserRemarkSettings, 'INSTANCE', required);
    const planners = (FlightPlanner as any).instances;
    if (!(planners instanceof Map)) {
        throw new Error('resetSingletons: FlightPlanner.instances is not a Map. Did the SDK change? Update test/harness/singletons.ts');
    }
    planners.clear();
    restorePageTrees();
}
