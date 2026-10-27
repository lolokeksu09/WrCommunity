import {useId,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {ArrowRight,Check,ChevronDown,ChevronUp,Compass,Gamepad2} from 'lucide-react';
import {canonicalRole,canonicalRoles,roleLabel} from '../../shared/game-roles';
import type {Profile} from './api';

function preferences(profile:Profile){
 const raw=profile.game.server?.value;
 const server=typeof raw==='string'&&raw.trim().length<=80?raw.trim():'';
 const roles=canonicalRoles(Array.isArray(profile.game.roles?.value)?profile.game.roles.value:[]).filter(role=>role.length<=40);
 return {server,roles};
}

export function FirstSteps({profile,verified}:{profile:Profile;verified:boolean}){
 const storageKey='wrc:first-steps:'+profile.id;
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem(storageKey)==='collapsed';}catch{return false;}});
 const id=useId();const server=profile.game.server?.value;
 const roles=canonicalRoles(Array.isArray(profile.game.roles?.value)?profile.game.roles.value:[]);
 const ready=Boolean(typeof server==='string'&&server.trim()&&roles.length);
 function toggle(){const next=!collapsed;setCollapsed(next);try{localStorage.setItem(storageKey,next?'collapsed':'expanded');}catch{/* Display preference is optional. */}}
 return <section className={'journey-panel first-steps'+(collapsed?' collapsed':'')} aria-label="Первые шаги">
  <header><div><h2><Compass size={20} aria-hidden="true"/>Первые шаги</h2><p>Готово: {Number(verified)+Number(ready)} из 2</p></div><button type="button" className="icon-button" aria-label={collapsed?'Показать первые шаги':'Свернуть первые шаги'} aria-expanded={!collapsed} aria-controls={id} onClick={toggle}>{collapsed?<ChevronDown size={20}/>:<ChevronUp size={20}/>}</button></header>
  <div id={id} hidden={collapsed}>
   <ol className="journey-checklist">
    <li><span className={'journey-step'+(verified?' done':'')} aria-hidden="true">{verified?<Check size={15}/>:1}</span><div><b>{verified?'Почта подтверждена':'Подтверди почту'}</b><p>{verified?'Можно откликаться и участвовать в сообществе.':'Открой письмо, чтобы участвовать в сообществе.'}</p>{!verified&&<Link to="/account/verify-email" className="text-control">Подтвердить почту<ArrowRight size={15}/></Link>}</div></li>
    <li><span className={'journey-step'+(ready?' done':'')} aria-hidden="true">{ready?<Check size={15}/>:2}</span><div><b>{ready?'Игровые предпочтения заполнены':'Добавь сервер и роли'}</b><p>{ready?'Используй их, чтобы находить подходящих игроков.':'Они помогут настроить поиск напарников.'}</p><Link className="text-control" to="/me/game">{ready?'Изменить игровую карточку':'Заполнить игровую карточку'}<ArrowRight size={15}/></Link></div></li>
   </ol>
   <p className="fine-print">Заполнение карточки не открывает профиль. Видимость каждого поля выбираешь ты.</p>
   <div className="journey-actions"><Link className="secondary" to="/discover"><Compass size={17}/>Найти игроков</Link><Link className="secondary" to="/discover/lfg"><Gamepad2 size={17}/>Найти команду</Link></div>
  </div>
 </section>;
}

export function SearchPreferences({profile}:{profile:Profile|null}){
 const [params]=useSearchParams(),navigate=useNavigate();
 const own=profile?preferences(profile):{server:'',roles:[]};
 const storedRoles=profile&&Array.isArray(profile.game.roles?.value)?canonicalRoles(profile.game.roles.value):[];
 const current=canonicalRole(params.get('role')??'');
 const [role,setRole]=useState(own.roles.includes(current)?current:own.roles[0]??'');
 // Keep a populated preset compact so results appear sooner on mobile.
 const [expanded,setExpanded]=useState(!(own.server||own.roles.length));
 const id=useId();if(!profile)return null;
 function apply(){const next=new URLSearchParams(params);next.delete('cursor');if(own.server)next.set('server',own.server);else next.delete('server');if(role)next.set('role',role);else next.delete('role');navigate({search:next.toString()});}
 return <section className="search-preferences" aria-label="Свои настройки поиска">
  <div className="search-preferences-heading"><div><div className="search-preferences-title"><Gamepad2 size={19} aria-hidden="true"/><h2>Из твоей игровой карточки</h2></div>{!expanded&&<p>{[own.server,current?roleLabel(current):'Все роли'].filter(Boolean).join(' · ')}</p>}</div>{(own.server||own.roles.length>0)&&<button type="button" className="icon-button" aria-label={expanded?'Свернуть мои настройки':'Изменить мои настройки'} aria-expanded={expanded} aria-controls={id+'-fields'} onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronUp size={19}/>:<ChevronDown size={19}/>}</button>}</div>
  <div id={id+'-fields'} hidden={!expanded}>
  {own.server||own.roles.length?<>
   <p>{own.server?'Сервер: '+own.server:'Сервер не указан'}{!own.roles.length&&!storedRoles.length?' · Роли не указаны':''}</p>
   {!own.roles.length&&storedRoles.length>0&&<p className="fine-print">Для поиска название роли должно быть не длиннее 40 символов. Сохранённая роль остаётся в игровой карточке.</p>}
   {own.roles.length>0&&<label className="preference-role" htmlFor={id}><span>Роль из моей карточки</span><select className="field" id={id} value={role} onChange={e=>setRole(e.target.value)}><option value="">Все роли</option>{own.roles.map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>}
   <div className="journey-actions"><button type="button" className="secondary" onClick={apply}>Использовать мои настройки</button><Link className="text-control" to="/me/game">Изменить карточку</Link></div>
   <p className="fine-print">Применятся сервер и одна выбранная роль. Остальные фильтры сохранятся. Видимость профиля не изменится.</p>
  </>:<p>Добавь сервер и роли, чтобы применять их в поиске. <Link className="text-control" to="/me/game">Заполнить игровую карточку<ArrowRight size={14}/></Link></p>}
  </div>
 </section>;
}
