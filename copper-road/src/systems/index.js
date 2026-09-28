// Systems run in this order: init at world creation, event handlers as events
// come due, and periodic hooks after each tick's events.

import { almanac } from './almanac.js';
import { wayfarers } from './wayfarers.js';
import { residents } from './residents.js';
import { economy } from './economy.js';
import { coin } from './coin.js';
import { knowledge } from './knowledge.js';
import { post } from './post.js';

// Order matters for init: the economy sizes its markets from the residents.
// Daily hooks: residents (apprentices learn, vacancies fill, people are born, die and move)
// settle before the economy; coin (wages, the Mint, wear) settles after the markets;
// knowledge (inn boards) after that, so the boards show the day's closing prices.
export const SYSTEMS = [almanac, wayfarers, residents, economy, coin, knowledge, post];
