import {UserError} from './i18n.js';
export const MAX_OUTPUT_CHARACTERS=2_000_000;
export function pageSelection(total,first=1,last=total) {
 if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last>total)return null;
 return {first,last,count:last-first+1};
}
export function textBudget(t,maximum=MAX_OUTPUT_CHARACTERS) {
 let used=0;
 return {reserve(length){
  if(!Number.isSafeInteger(length)||length<0||used+length>maximum)throw new UserError(t('errorWorkBudget'));
  used+=length;
 },get used(){return used;}};
}
