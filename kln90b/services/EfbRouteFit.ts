import {KLNFlightplanLeg, MAX_FPL0_LEGS, MAX_LEGS} from "../data/flightplan/Flightplan";

/** §4: a part of the route, in route order */
export type EfbSegment =
    // Departure airport, en-route fixes: cut leg by leg
    | { readonly kind: "user", readonly legs: KLNFlightplanLeg[] }
    // SID, STAR, approach: whole or nothing
    | { readonly kind: "procedure", readonly legs: KLNFlightplanLeg[] }
    // A procedure the unit cannot take: skipped, reported
    | { readonly kind: "invalid", readonly idents: string[] }
    // A fix that cannot be loaded: dropped, reported, never cuts
    | { readonly kind: "missing", readonly ident: string };

export interface ResolvedEfbRoute {
    readonly segments: EfbSegment[],
    readonly destination: KLNFlightplanLeg | null,
}

export interface EfbFitResult {
    readonly legs: KLNFlightplanLeg[],
    /** The idents of everything left out, in route order */
    readonly deleted: string[],
}

/**
 * Fits an EFB route into FPL 0 (design §4, "The rules"). FPL 0 is loaded start to finish, within the limits of 30
 * en-route legs (4-1) and 45 legs in all (#221).
 *
 * - The destination keeps its place: it takes one en-route and one total leg, whatever comes before it.
 * - An en-route part (`user`) is cut leg by leg, a SID, STAR or approach (`procedure`) is taken whole or not at all.
 * - At the first leg or procedure that does not fit the walk is cut: it and everything after it is left out, even a
 *   later procedure that would fit alone (no gap). The destination is still appended.
 * - An `invalid` procedure is skipped and the walk goes on, and a `missing` fix is dropped without a cut. Both are
 *   reported in `deleted`, as is everything after a cut.
 */
export function fitEfbRoute(route: ResolvedEfbRoute): EfbFitResult {
    const reserve = route.destination === null ? 0 : 1;
    const maxEnRoute = MAX_LEGS - reserve;
    const maxTotal = MAX_FPL0_LEGS - reserve;

    const legs: KLNFlightplanLeg[] = [];
    const deleted: string[] = [];
    let enRoute = 0;
    let cut = false;

    for (const segment of route.segments) {
        switch (segment.kind) {
            case "invalid":
                deleted.push(...segment.idents);
                break;
            case "missing":
                deleted.push(segment.ident);
                break;
            case "user":
                for (const leg of segment.legs) {
                    if (!cut && enRoute + 1 <= maxEnRoute && legs.length + 1 <= maxTotal) {
                        legs.push(leg);
                        enRoute++;
                    } else {
                        cut = true;
                        deleted.push(leg.wpt.icaoStruct.ident);
                    }
                }
                break;
            case "procedure": {
                // Procedure legs are not en-route legs, so only the total counts
                if (!cut && legs.length + segment.legs.length <= maxTotal) {
                    legs.push(...segment.legs);
                } else {
                    cut = true;
                    deleted.push(...segment.legs.map(leg => leg.wpt.icaoStruct.ident));
                }
                break;
            }
        }
    }

    if (route.destination !== null) {
        legs.push(route.destination);
    }

    return {legs, deleted};
}
