// Stable values for forms/API; stored legacy/custom values remain readable.
export const GAME_ROLES=[
 {value:'baron',label:'Барон'},
 {value:'jungle',label:'Лес'},
 {value:'mid',label:'Мид'},
 {value:'dragon',label:'Дракон'},
 {value:'support',label:'Поддержка'},
] as const;
const folded=(value:string)=>value.trim().toLocaleLowerCase('ru-RU');
export function canonicalRole(value:string):string{
 const role=GAME_ROLES.find(role=>[role.value,role.label].some(alias=>folded(alias)===folded(value)));
 return role?.value??value.trim();
}
export function canonicalRoles(values:readonly string[]):string[]{return [...new Set(values.map(canonicalRole).filter(Boolean))];}
export function roleLabel(value:string):string{return GAME_ROLES.find(role=>role.value===canonicalRole(value))?.label??value;}
export function roleAliases(value:string):string[]{const role=GAME_ROLES.find(role=>role.value===canonicalRole(value));return role?[role.value,folded(role.label)]:[folded(value)];}
