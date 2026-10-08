import {StatusLineMessageEvents} from '../../kln90b/controls/StatusLine';
import {HeadlessUnit} from './boot';

/**
 * The status-line messages (`statusLineMessage`, controls/StatusLine.tsx) published from now on, in order. The bus calls
 * a new subscriber at once with the last cached message (testing.md section 6); that call is dropped.
 */
export function collectStatusMessages(unit: HeadlessUnit): string[] {
    const seen: string[] = [];
    unit.props.bus.getSubscriber<StatusLineMessageEvents>().on('statusLineMessage').handle(m => seen.push(m));
    seen.length = 0;
    return seen;
}
