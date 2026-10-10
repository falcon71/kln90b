import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, BootOptions, HeadlessUnit, moveAircraft, settle} from './boot';
import {dtWorld, standardRoute} from './fixtures';
import {savedFlightplan} from './storage';
import {activeIdent} from './readers';

/**
 * Boots with the standard route (fixtures.ts) as FPL 0, at KAAA unless `position` is given, settles, and throws unless
 * ABC is active. `facilities` are added to the route's; `storage` is merged over the stored plan.
 */
export async function bootOnStandardRoute(opts: BootOptions = {}): Promise<HeadlessUnit> {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        ...opts,
        position: opts.position ?? {lat: kaaa.lat, lon: kaaa.lon},
        facilities: [kaaa, abc, kbbb, ...opts.facilities ?? []],
        storage: {...savedFlightplan(0, [kaaa, abc, kbbb]), ...opts.storage},
    });
    await settle(unit);
    if (activeIdent(unit) !== 'ABC') {
        throw new Error(`bootOnStandardRoute: the active waypoint is ${activeIdent(unit)}, not ABC`);
    }
    return unit;
}

/**
 * Boots in the D/T world (fixtures.ts, dtWorld) 0.1 degree north of KAAA with `legs` (default KAAA, ABC, DEF, KBBB)
 * stored as FPL 0 and, unless `fpl3` is false, as FPL 3; settles; with `moving` (default true) the aircraft flies due
 * north at 120 kt. `facilities`, when given, replaces the legs as the navdata, so it must contain them.
 */
export async function bootOnDtWorld(opts: BootOptions & { legs?: Facility[], fpl3?: boolean, moving?: boolean } = {}): Promise<HeadlessUnit> {
    const {legs: given, fpl3, moving, ...boot} = opts;
    const w = dtWorld();
    const legs = given ?? [w.kaaa, w.abc, w.def, w.kbbb];
    const position = boot.position ?? {lat: 47.1, lon: 10.0};
    const unit = await bootUnit({
        facilities: legs, ...boot, position,
        storage: {...savedFlightplan(0, legs), ...(fpl3 ?? true ? savedFlightplan(3, legs) : {}), ...boot.storage},
    });
    await settle(unit);
    if (moving ?? true) {
        await moveAircraft(unit, position, {groundspeedKt: 120, trackTrue: 0});
    }
    return unit;
}
