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

const DTO_PLAN_INDEX = 1;
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
        this.writeFpl0(klnPlan, activeIdx);
        this.writeDtoPlan();

        console.log("wtPlan", this.flightplanner);
    }

    private writeFpl0(klnPlan: Flightplan, activeIdx: number) {
        const wtPlan = this.flightplanner.getFlightPlan(0);
        const batchID = wtPlan.openBatch("KLN_sync");

        this.emptyFlightplan(wtPlan);
        this.setPlanLegs(wtPlan, klnPlan, activeIdx);
        wtPlan.closeBatch(batchID);
    }

    private writeDtoPlan() {
        //DTO is done on flightplan 1 like the Garmins
        //Since the KLN always keeps the entire flightplan, we do all DTOs here, not just random DTOs
        if (this.activeWaypoint.isDctNavigation()) {
            const dtoPlan = this.flightplanner.createFlightPlan(DTO_PLAN_INDEX);
            const batchID = dtoPlan.openBatch("KLN_sync");
            this.emptyFlightplan(dtoPlan);
            dtoPlan.addSegment(0, FlightPlanSegmentType.RandomDirectTo);
            const from = this.activeWaypoint.getFromWpt()!;

            const fromLeg = FlightPlan.createLeg({
                type: LegType.IF,
                lat: from.lat,
                lon: from.lon,
            });
            dtoPlan.addLeg(0, fromLeg);

            const to = this.activeWaypoint.getActiveWpt()!;

            const toLeg = FlightPlan.createLeg({
                type: LegType.DF,
                fixIcao: to.icao,
                lat: to.lat,
                lon: to.lon,
            });
            dtoPlan.addLeg(0, toLeg);
            dtoPlan.setLateralLeg(1);
            dtoPlan.setDirectToData(1);
            dtoPlan.closeBatch(batchID);
            this.flightplanner.setActivePlanIndex(DTO_PLAN_INDEX);
        } else {
            this.flightplanner.deleteFlightPlan(DTO_PLAN_INDEX);
            this.flightplanner.setActivePlanIndex(0);
        }
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
                wtPlan.setDirectToData(this.activeWaypoint.isDctNavigation() ? idxForWt : -1);
                return; //Install manual: We do not return data after a fence
            }
            if (klnLeg.arcData) {
                if (currentIdx >= activeIdx) {
                    wtPlan.setLateralLeg(idxForWt);
                    wtPlan.setDirectToData(this.activeWaypoint.isDctNavigation() ? idxForWt : -1);
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
        wtPlan.setDirectToData(this.activeWaypoint.isDctNavigation() ? idxForWt : -1);

    }

}