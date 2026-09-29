// Systems run in this order: init at world creation, event handlers as events
// come due, and periodic hooks after each tick's events.

import { almanac } from './almanac.js';
import { wayfarers } from './wayfarers.js';
import { residents } from './residents.js';
import { mercs } from './mercs.js';
import { economy } from './economy.js';
import { merchants } from './merchants.js';
import { coin } from './coin.js';
import { lord } from './lord.js';
import { raiders } from './raiders.js';
import { player } from './player.js';
import { roads } from './roads.js';
import { knowledge } from './knowledge.js';
import { post } from './post.js';

// Order matters for init: the economy sizes its markets from the residents, and
// coin opens an account for every wayfarer and merchant that exists by then.
// Daily hooks: residents (apprentices learn, vacancies fill, people are born, die and move)
// settle before the economy; merchants' households spend before coin (wages, the
// Mint, wear) settles; knowledge (inn boards) comes after that, so the boards show
// the day's closing prices. Seasonal: the lord's forced loans land before the Crown's due.
// The lord weighs his undertakings after coin has settled the day (and taken the Crown's due).
// Raiders recruit after the day's hunger is known, and hold their captives until the ransom comes.
// Sellswords (after residents: they are residents too, and the markets are sized from everyone)
// heal, pay their board, mend and buy gear, and walk home when there's no work.
// The player (step G) hears the inn where they stand, pays the changer each season.
// Roads: surprise weather, camps and waystations, and news round the night's fires.
export const SYSTEMS = [almanac, wayfarers, residents, mercs, economy, merchants, coin, lord, raiders, player, roads, knowledge, post];
