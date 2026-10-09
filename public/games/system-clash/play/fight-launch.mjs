import {demoRoster} from './demo-flow.mjs';
import {readTournamentContext} from './tournament.mjs';
/** Local unlocks govern new local choices; saved runs and room opponents retain their own truth. */
export function fightLaunchRoster(url,catalog,{corporateUnlocked=false,online=false,storage}={}){
 if(online||storage&&readTournamentContext(url,catalog,storage))return catalog;
 return demoRoster(catalog,{corporateUnlocked});
}
