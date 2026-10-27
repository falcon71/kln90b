import type {NavPageState} from "../VolatileMemory";

/**
 * True while the waypoint alert shows steady, not flashing: from the start of an anticipated turn on (4-8: the light
 * and the Super NAV 5 ident stop flashing and go steady when the turn begins, #437) and during the self-test (Installation
 * Manual 2-69: the annunciator lights are lit).
 */
export function isWaypointAlertSteady(nav: NavPageState): boolean {
    return nav.isSelfTestActive || nav.activeWaypoint.turnStack.length > 0;
}

/**
 * The external WPT light (L:KLN90B_WptLight, 3-29, 4-8, #437): on while the waypoint alert is on, flashing with the
 * display tick before a turn and steady during it. `blink` is the display tick's, the light is on in the phases where the
 * MSG light is on while it flashes.
 */
export function isWptLightOn(nav: NavPageState, blink: boolean): boolean {
    return nav.waypointAlert && (isWaypointAlertSteady(nav) || !blink);
}
