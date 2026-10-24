import {GAME_ROLES,canonicalRole,canonicalRoles,roleLabel} from '../../shared/game-roles';

export function roleFilterOptions(current:string):[string,string][]{
 const value=canonicalRole(current);
 const options:[string,string][]=[['','Все роли'],...GAME_ROLES.map(role=>[role.value,role.label] as [string,string])];
 if(value&&!GAME_ROLES.some(role=>role.value===value))options.push([value,roleLabel(current)]);
 return options;
}

export function RolePicker({name,label,defaultValue=[]}:{name:string;label:string;defaultValue?:string[]}){
 const selected=canonicalRoles(defaultValue);
 const extra=selected.filter(value=>!GAME_ROLES.some(role=>role.value===value));
 const options=[...GAME_ROLES,...extra.map(value=>({value,label:roleLabel(value)}))];
 return <fieldset className="role-picker"><legend>{label}</legend><div className="role-options">{options.map(role=><label key={role.value}><input type="checkbox" name={name} value={role.value} defaultChecked={selected.includes(role.value)}/><span>{role.label}</span></label>)}</div><p className="fine-print">Можно выбрать несколько ролей.</p></fieldset>;
}
