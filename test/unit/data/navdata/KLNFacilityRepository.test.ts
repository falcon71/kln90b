import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, Facility, FacilityType, ICAO, UnitType, UserFacility, UserFacilityType} from '@microsoft/msfs-sdk';
import {
    FacilityRepositorySyncData, FacilityRepositorySyncType, KLNFacilityRepository,
} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {vor} from '../../../harness/navdata/builders';
import {clearStatic} from '../../../harness/singletons';

/** A supplemental waypoint in the user region XX, or in the temporary region XY (REF, CTR and lat/lon imports) */
const sup = (ident: string, lat: number, lon: number, region: 'XX' | 'XY' = 'XX'): UserFacility => ({
    icao: ICAO.valueToStringV1(ICAO.value('U', region, '', ident)), icaoStruct: ICAO.value('U', region, '', ident),
    name: '', lat, lon, region, city: '', isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
} as unknown as UserFacility);

let bus: EventBus;
let repo: KLNFacilityRepository;
let syncs: FacilityRepositorySyncData[];

// The repository is a singleton bound to the first bus; every test gets a fresh one on its own bus
beforeEach(() => {
    clearStatic(KLNFacilityRepository, 'INSTANCE', false);
    bus = new EventBus();
    repo = KLNFacilityRepository.getRepository(bus);
    syncs = [];
    bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle((d: FacilityRepositorySyncData) => syncs.push(d));
});

/** The idents of the supplemental waypoints within 10 NM of a point */
function supsNear(lat: number, lon: number): string[] {
    const radius = UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN);
    return repo.search(FacilityType.USR, lat, lon, radius, 10, []).map(f => f.icaoStruct.ident).sort();
}

describe('KLNFacilityRepository capacity', () => {
    // 2-2, 2-8, 5-16: up to 250 user-defined waypoints. C-2: USR DB FULL when 250 exist. The pages turn the error into
    // the status line message (Apt1Page, SupPage and others catch it).
    it('holds 250 user waypoints and refuses the 251st (2-8, C-2)', () => {
        // The 250 cover the other waypoint types as well (5-16): the last one is a user VOR
        for (let i = 0; i < 249; i++) {
            repo.add(sup(`W${i}`, 47, 8));
        }
        repo.add(vor('ABC', 47, 8, {region: 'XX'}));
        expect(repo.size()).toBe(250);

        expect(() => repo.add(sup('W250', 47, 8))).toThrow();
        expect(repo.size()).toBe(250);
        expect(repo.get(ICAO.value('U', 'XX', '', 'W250'))).toBeUndefined();
    });

    // 5-22, 5-26: Reference and Center waypoints are stored as supplemental waypoints and count as user waypoints.
    // In the code they are temporary waypoints (region XY), and the limit counts every region.
    it('counts temporary waypoints toward the 250 (5-22, 5-26)', () => {
        for (let i = 0; i < 249; i++) {
            repo.add(sup(`W${i}`, 47, 8));
        }
        repo.add(sup('REFA', 47, 8, 'XY'));

        expect(() => repo.add(sup('W249', 47, 8))).toThrow();
    });
});

describe('KLNFacilityRepository add, update and remove', () => {
    // The persistors (UserWaypointPersistor) and the user scan list (Scanlist) listen on the sync topic: each change
    // is one event, with the facility or its ICAO.
    it('publishes one sync event per change (characterization)', () => {
        const wpt = sup('ONE', 47, 8);
        repo.add(wpt);
        repo.update(wpt, w => w.lat = 47.5);
        repo.remove(wpt.icaoStruct);

        expect(syncs.map(s => s.type)).toEqual([FacilityRepositorySyncType.Add, FacilityRepositorySyncType.Update, FacilityRepositorySyncType.Remove]);
        expect((syncs[0] as { facs: Facility[] }).facs).toEqual([wpt]);
        expect((syncs[1] as { facs: Facility[] }).facs).toHaveLength(1);
        expect((syncs[1] as { facs: Facility[] }).facs[0]).toBe(wpt);
        expect(wpt.lat).toBe(47.5);
        expect((syncs[2] as { facs: unknown[] }).facs.map(i => ICAO.valueToStringV2(i as never))).toEqual([ICAO.valueToStringV2(wpt.icaoStruct)]);
    });

    it('finds a waypoint at its new position after an update (characterization)', () => {
        const wpt = sup('ONE', 47, 8);
        repo.add(wpt);

        repo.update(wpt, w => w.lat = 48);

        expect(supsNear(47, 8)).toEqual([]);
        expect(supsNear(48, 8)).toEqual(['ONE']);
    });

    it('refuses to update a database waypoint (characterization)', () => {
        const database = vor('ABC', 47, 8);

        expect(() => repo.update(database, w => w.lat = 48)).toThrow();
        expect(database.lat).toBe(47);
    });

    it('keeps one waypoint when one with the same ICAO is added again (characterization)', () => {
        repo.add(sup('ONE', 47, 8));
        const moved = sup('ONE', 48, 8);

        repo.add(moved);

        expect(repo.size()).toBe(1);
        expect(repo.get(ICAO.value('U', 'XX', '', 'ONE'))).toBe(moved);
        expect(supsNear(47, 8)).toEqual([]);
        expect(supsNear(48, 8)).toEqual(['ONE']);
    });

    it('forgets a removed waypoint in every lookup (characterization)', () => {
        repo.add(sup('ONE', 47, 8));
        repo.add(sup('TWO', 47, 8));

        repo.remove(ICAO.value('U', 'XX', '', 'ONE'));

        expect(repo.get(ICAO.value('U', 'XX', '', 'ONE'))).toBeUndefined();
        expect(repo.size()).toBe(1);
        expect(supsNear(47, 8)).toEqual(['TWO']);
        const all: string[] = [];
        repo.forEach(f => all.push(f.icaoStruct.ident));
        expect(all).toEqual(['TWO']);
    });

    it('keeps a database ident apart from a user waypoint of the same ident and type (characterization)', () => {
        repo.add(vor('ABC', 47, 8, {region: 'XX'}));

        expect(repo.get(ICAO.value('V', 'K1', '', 'ABC'))).toBeUndefined();
        expect(repo.get(ICAO.value('N', 'XX', '', 'ABC'))).toBeUndefined();
        expect(repo.get(ICAO.value('V', 'XX', '', 'ABC'))?.lat).toBe(47);
    });
});

describe('KLNFacilityRepository sync between instruments', () => {
    // Every instrument has its own repository; a new one asks the others for their waypoints (a dump request) and
    // answers such requests itself. With one KLN 90B per aircraft there is nobody to answer.
    // a second KLN 90B in one aircraft: #200
    it('answers a dump request of another instrument with all its waypoints (characterization)', () => {
        const wpt = sup('ONE', 47, 8);
        const userVor = vor('ABC', 47, 8, {region: 'XX'});
        repo.add(wpt);
        repo.add(userVor);
        syncs.length = 0;

        bus.getPublisher<any>().pub(KLNFacilityRepository.SYNC_TOPIC, {type: FacilityRepositorySyncType.DumpRequest, uid: 42}, false, false);

        // The response is published inside the handling of the request, so it reaches this listener first
        expect(syncs.filter(s => s.type === FacilityRepositorySyncType.DumpResponse))
            .toEqual([{type: FacilityRepositorySyncType.DumpResponse, uid: 42, facs: [wpt, userVor]}]);
    });
});
