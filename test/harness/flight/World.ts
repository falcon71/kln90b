import {BoundaryFacility, Facility} from '@microsoft/msfs-sdk';
import {LatLon} from './geo';

/** The navdata and magnetic variation a flight takes place in. Idents must be unique within a world, and must differ from those of the default navdata (fixtures.ts), which bootUnit adds. */
export class World {
    private readonly facilities: Facility[] = [];
    private readonly boundaries: BoundaryFacility[] = [];

    constructor(private readonly opts: { magvar?: number } = {}) {
    }

    public add(...facs: Facility[]): this {
        this.facilities.push(...facs);
        return this;
    }

    /** Adds airspaces (navdata/airspaces.ts) */
    public addAirspace(...airspaces: BoundaryFacility[]): this {
        this.boundaries.push(...airspaces);
        return this;
    }

    public airspaces(): BoundaryFacility[] {
        return [...this.boundaries];
    }

    public get(ident: string): Facility {
        const found = this.facilities.filter(f => f.icaoStruct.ident === ident);
        if (found.length !== 1) throw new Error(`World: ${found.length} facilities named ${ident}`);
        return found[0];
    }

    public pos(ident: string): LatLon {
        const f = this.get(ident);
        return {lat: f.lat, lon: f.lon};
    }

    public all(): Facility[] {
        return [...this.facilities];
    }

    public magvar(_lat: number, _lon: number): number {
        return this.opts.magvar ?? 0;
    }
}
