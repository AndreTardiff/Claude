// Systems run in this order: init at world creation, event handlers as events
// come due, and periodic hooks after each tick's events.

import { almanac } from './almanac.js';
import { wayfarers } from './wayfarers.js';

export const SYSTEMS = [almanac, wayfarers];
