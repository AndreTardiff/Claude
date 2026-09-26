// Systems run in this order: init at world creation, event handlers as events
// come due, and periodic hooks after each tick's events.

import { almanac } from './almanac.js';
import { wayfarers } from './wayfarers.js';
import { residents } from './residents.js';
import { economy } from './economy.js';

// Order matters for init: the economy sizes its markets from the residents.
// Daily hooks: residents (apprentices learn, vacancies fill) settle before the economy.
export const SYSTEMS = [almanac, wayfarers, residents, economy];
