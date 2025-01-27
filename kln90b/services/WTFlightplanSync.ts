import {Flightplan, FlightplanEvents, KLNFixType} from "../data/flightplan/Flightplan";
import {
    EventBus,
    FacilityLoader,
    FlightPathAirplaneSpeedMode,
    FlightPathCalculator,
    FlightPlan,
    FlightPlanner,
    FlightPlanSegmentType,
    LegType,
} from "@microsoft/msfs-sdk";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {ActiveWaypoint, ActiveWaypointChangedEvents} from "../data/flightplan/ActiveWaypoint";


const FLIGHTPLANNER_ID = "kln90b";

export class WTFlightplanSync {
    private readonly flightplanner: FlightPlanner;

    constructor(bus: EventBus, facilityLoader: FacilityLoader, private readonly planeSettings: KLN90PlaneSettings, private readonly activeWaypoint: ActiveWaypoint) {
        bus.getSubscriber<FlightplanEvents>().on("flightplanChanged").handle(this.flightplanChanged.bind(this));
        bus.getSubscriber<ActiveWaypointChangedEvents>().on("activeWaypointChanged").handle(this.activeIdxChanged.bind(this));

        const calculator = new FlightPathCalculator(
            facilityLoader,
            {
                id: FLIGHTPLANNER_ID,
                initSyncRole: 'primary',
                defaultClimbRate: 300,
                defaultSpeed: 50,
                bankAngle: [[10, 60], [40, 300]],
                holdBankAngle: null,
                courseReversalBankAngle: null,
                turnAnticipationBankAngle: [[10, 60], [15, 100]],
                maxBankAngle: 25,
                airplaneSpeedMode: FlightPathAirplaneSpeedMode.GroundSpeed,
            },
            bus,
        );

        this.flightplanner = FlightPlanner.getPlanner(FLIGHTPLANNER_ID, bus, {calculator: calculator});
        this.flightplanner.createFlightPlan(0);
        this.flightplanner.setActivePlanIndex(0);
    }

    private flightplanChanged(klnPlan: Flightplan) {
        if (klnPlan.idx !== 0 || !this.planeSettings.output.writeGPSSimVars) {
            return;
        }

        this.syncToWTFlightplan(klnPlan, this.activeWaypoint.getActiveFplIdx());
    }

    private activeIdxChanged(activeIdx: number) {
        this.syncToWTFlightplan(this.activeWaypoint.fpl0, activeIdx);
    }

    private syncToWTFlightplan(klnPlan: Flightplan, activeIdx: number) {
        const wtPlan = this.flightplanner.getFlightPlan(0);
        const batchID = wtPlan.openBatch("KLN_sync");

        this.emptyFlightplan(wtPlan);
        this.setPlanLegs(wtPlan, klnPlan, activeIdx);
        wtPlan.closeBatch(batchID);

        console.log("wtPlan", wtPlan);
    }

    private emptyFlightplan(wtPlan: FlightPlan) {
        if (wtPlan.length == 0) {
            return;
        }

        wtPlan.removeSegment(0);
    }

    private setPlanLegs(wtPlan: FlightPlan, klnPlan: Flightplan, activeIdx: number) {
        wtPlan.addSegment(0, FlightPlanSegmentType.Enroute);

        let currentIdx = 0;
        let idxForWt = activeIdx;

        for (const klnLeg of klnPlan.getLegs()) {
            //The real KLN only transmits waypoint number, active waypoint, identifier, lat, lon and magvar
            const leg = FlightPlan.createLeg({
                type: LegType.DF,
                fixIcao: klnLeg.wpt.icao,
                lat: klnLeg.wpt.lat,
                lon: klnLeg.wpt.lon,
            });
            wtPlan.addLeg(0, leg);
            if (klnLeg.fixType === KLNFixType.MAP && currentIdx >= activeIdx) {
                wtPlan.setLateralLeg(idxForWt);
                return; //Install manual: We do not return data after a fence
            }
            if (klnLeg.arcData) {
                if (currentIdx >= activeIdx) {
                    wtPlan.setLateralLeg(idxForWt);
                    return; //Install manual: We do not return data after an arc
                } else {
                    //Everything before the arc must be deleted again, we only transmit everything after the arc
                    idxForWt -= wtPlan.length;
                    wtPlan.removeSegment(0);
                    wtPlan.addSegment(0, FlightPlanSegmentType.Enroute);
                }

            }
            currentIdx++;
        }

        wtPlan.setLateralLeg(idxForWt);
    }

}