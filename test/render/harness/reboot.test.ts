import {describe, expect, it, vi} from 'vitest';
import {Facility, FlightPlanner, FlightPlannerOptions, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {simEnv} from '../../harness/sim/install';
import {airport, intersection} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);
// A user waypoint (region XX, 4730.00N 00815.50E): only user legs are written back to the fplN settings
const usra = intersection('USRA', 47.5, 8.258333, {region: 'XX'});
/** The instrument's planner. The options only matter when the planner does not exist yet, and WTFlightplanSync made it */
const plannerOf = (unit: HeadlessUnit): FlightPlanner => FlightPlanner.getPlanner('kln90b', unit.core.bus, {} as FlightPlannerOptions);
let first: HeadlessUnit;
let firstPlanner: FlightPlanner;

/** The two tests run in order: the second checks that the teardown after the first left nothing behind. */
describe('one unit per test (harness)', () => {
    it('boots a unit with user data, remarks and a flight plan', async () => {
        first = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.2, lon: 8.0}, magvar: 5,
            storage: {...savedFlightplan(0, [kaaa, usra]), wpt0: 'WXX        USRA    +4730.00+00815.50'},
        });
        // Nothing in the instrument calls Coherent yet, so the test makes the call a reset has to clear
        first.env.coherent.replies.set('REBOOT_TEST_PING', () => 'pong');
        void Coherent.call('REBOOT_TEST_PING');
        first.props.remarksManager.saveRemarks('KAAA', ['REMARK ONE ', '           ', '           ']);
        firstPlanner = plannerOf(first);

        expect(first.props.facilityRepository.get(ICAO.value('W', 'XX', '', 'USRA'))!.icaoStruct.ident).toBe('USRA');
        expect(first.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'USRA']);
        expect(first.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA']);
    });

    it('gives the next test a unit that sees nothing of the first', async () => {
        const env = simEnv();
        // Teardown ran when the first test ended
        expect(document.getElementById('pageContainer')).toBeNull();
        expect(env.sim.writes).toEqual([]);
        expect(env.sim.has('PLANE LATITUDE')).toBe(false);
        expect([...env.sim.gameVars.keys()]).toEqual([]);
        expect([...env.sim.unsetReads]).toEqual([]);
        expect(env.storage.data.size).toBe(0);
        expect(env.magvar(47.2, 8.0)).toBe(0);
        expect(env.coherent.calls).toEqual([]);
        expect(env.coherent.replies.size).toBe(0);

        const oldTick = vi.spyOn(first.props.messageHandler, 'tick');
        // Format 2 is the only data the second unit has, so it reads fpl0 with the loader that would parse a stale value
        const second = await bootUnit({facilities: [kaaa], position: {lat: 47.0, lon: 8.0}, storage: {userDataFormat: 2}});
        await vi.advanceTimersByTimeAsync(5_000);

        expect(oldTick).not.toHaveBeenCalled();
        const userWaypoints: Facility[] = [];
        second.props.facilityRepository.forEach(f => userWaypoints.push(f));
        expect(userWaypoints).toEqual([]);
        expect(second.props.facilityRepository).not.toBe(first.props.facilityRepository);
        expect(second.props.memory.fplPage.flightplans[0].getLegs()).toEqual([]);
        expect(second.props.remarksManager.getAirportsWithRemarks()).toEqual([]);
        expect(plannerOf(second)).not.toBe(firstPlanner);
        expect(second.errors).toEqual([]);
    });
});
