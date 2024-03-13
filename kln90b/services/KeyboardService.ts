import {EVT_KEY} from "../HEvents";
import {CursorController} from "../pages/CursorController";

export class KeyboardService {

    public static routeKeyboardEvent(evt: string, lCursorController: CursorController, rCursorController: CursorController): boolean {
        if (!evt.startsWith(EVT_KEY)) {
            return false;
        }

        const split = evt.split(':');
        const key = split[2];
        let handled;
        switch (split[1]) {
            case 'LEFT':
                handled = lCursorController.keyboard(key);
                if (handled) {
                    lCursorController.outerRight(); //Automatically advance to the next field
                }
                return handled;
            case 'RIGHT':
                handled = rCursorController.keyboard(key);
                if (handled) {
                    rCursorController.outerRight(); //Automatically advance to the next field
                }
                return handled;
            default:
                throw new Error(`Unexpected page: ${evt}`);

        }


    }

}