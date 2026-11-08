import {DefaultUserSettingManager} from '@microsoft/msfs-sdk';
import {KLN90BFailureTypes} from "../settings/KLN90BFailureSettings";
import {Failures} from "./Failures";

/** At or below this charge the unit shows the low state (CMM 22, B-2) */
export const BATTERY_LOW_PERCENT = 1.5;
/** The aging, in percent of a full charge per year: every aging draws a rate between these two (a life of 3 to 5 years) */
export const MIN_RATE_PER_YEAR = 20;
export const MAX_RATE_PER_YEAR = 100 / 3;

const SECONDS_PER_YEAR = 365.25 * 86400;

/**
 * The charge after the sim time from lastDateS to nowS (#461). The first session (lastDateS 0) only notes the date; a date
 * that was set back or has not moved changes nothing. Pure, one draw of random.
 */
export function ageBattery(health: number, lastDateS: number, nowS: number, random: () => number): { health: number, lastDateS: number } {
    if (lastDateS === 0) {
        return {health, lastDateS: nowS};
    }
    if (nowS > lastDateS) {
        const years = (nowS - lastDateS) / SECONDS_PER_YEAR;
        const rate = MIN_RATE_PER_YEAR + random() * (MAX_RATE_PER_YEAR - MIN_RATE_PER_YEAR);
        return {health: Math.max(0, health - years * rate), lastDateS: nowS};
    }
    return {health, lastDateS};
}

/**
 * The unit's internal battery (#461): its charge lives in the failure settings, as the aging has to survive sessions.
 */
export class Battery {
    constructor(private readonly settings: DefaultUserSettingManager<KLN90BFailureTypes>, private readonly failures: Failures) {
    }

    public get health(): number {
        return this.settings.getSetting('batteryHealth').get();
    }

    /** The charge as the page shows it: rounded up, so that anything above 0 shows at least 1 */
    public get displayPercent(): number {
        return Math.ceil(this.health);
    }

    public get isLow(): boolean {
        return this.health <= BATTERY_LOW_PERCENT || this.failures.isActive('battery');
    }

    public age(nowS: number, random: () => number = Math.random): void {
        const result = ageBattery(this.health, this.settings.getSetting('batteryDate').get(), nowS, random);
        this.settings.getSetting('batteryHealth').set(result.health);
        this.settings.getSetting('batteryDate').set(result.lastDateS);
    }

    /** A new battery: the date of the last session stays */
    public service(): void {
        this.settings.getSetting('batteryHealth').set(100);
    }
}
