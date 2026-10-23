import {BoundaryFacility, LodBoundary} from "@microsoft/msfs-sdk";

/**
 * The sim holds most airspaces two or three times, as separate boundaries with the same type, limits and vectors but
 * different names and ids (#410). The key identifies such a group of copies: the type, the limits with their types, and
 * every vector's type, position (5 decimals, about a meter) and radius (whole meters).
 */
export function airspaceAreaKey(facility: BoundaryFacility): string {
    let key = `${facility.type}|${facility.minAlt}|${facility.minAltType}|${facility.maxAlt}|${facility.maxAltType}`;
    for (const vector of facility.vectors) {
        key += `|${vector.type},${vector.lat.toFixed(5)},${vector.lon.toFixed(5)},${Math.round(vector.radius)}`;
    }
    return key;
}

/**
 * The boundaries a search session holds, as one area per group of identical copies (#410). The session reports
 * additions and removals by id, so add and remove keep that per-id bookkeeping; areas() hands out one representative per
 * key: the copy with the shortest name, ties by the lowest id (the plain names, like SEATTLE, tend to be the short ones).
 * When the representative is removed and other copies stay, the next one takes over.
 */
export class AirspaceAreas {
    private readonly boundaries = new Map<number, LodBoundary>();
    private readonly keys = new Map<number, string>();

    /** Adds a boundary; one with the same id replaces the old one */
    public add(boundary: LodBoundary): void {
        const id = boundary.facility.id;
        this.boundaries.set(id, boundary);
        this.keys.set(id, airspaceAreaKey(boundary.facility));
    }

    public remove(id: number): void {
        this.boundaries.delete(id);
        this.keys.delete(id);
    }

    /** One boundary per area, in the order of the first copy of each area that was added */
    public areas(): LodBoundary[] {
        const best = new Map<string, LodBoundary>();
        for (const [id, boundary] of this.boundaries) {
            const key = this.keys.get(id)!;
            const current = best.get(key);
            if (current === undefined || isBetterRepresentative(boundary.facility, current.facility)) {
                best.set(key, boundary);
            }
        }
        return [...best.values()];
    }

    /** The key of the area a boundary belongs to; a held boundary answers from the key computed when it was added */
    public keyOf(boundary: LodBoundary): string {
        const held = this.boundaries.get(boundary.facility.id) === boundary ? this.keys.get(boundary.facility.id) : undefined;
        return held ?? airspaceAreaKey(boundary.facility);
    }
}

function isBetterRepresentative(candidate: BoundaryFacility, current: BoundaryFacility): boolean {
    if (candidate.name.length !== current.name.length) {
        return candidate.name.length < current.name.length;
    }
    return candidate.id < current.id;
}
