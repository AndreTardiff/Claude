// Systems run in this order: init at world creation, event handlers as events
// come due, and periodic hooks after each tick's events.

import { almanac } from './almanac.js';
import { wayfarers } from './wayfarers.js';
import { residents } from './residents.js';
import { economy } from './economy.js';
import { merchants } from './merchants.js';
import { coin } from './coin.js';
import { knowledge } from './knowledge.js';
import { post } from './post.js';

// Order matters for init: the economy sizes its markets from the residents, and
// coin opens an account for every wayfarer and merchant that exists by then.
// Daily hooks: residents (apprentices learn, vacancies fill, people are born, die and move)
// settle before the economy; merchants' households spend before coin (wages, the
// Mint, wear) settles; knowledge (inn boards) comes after that, so the boards show
// the day's closing prices. Seasonal: the lord's forced loans land before the Crown's due.
export const SYSTEMS = [almanac, wayfarers, residents, economy, merchants, coin, knowledge, post];
