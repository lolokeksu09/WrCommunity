import {Link} from 'react-router-dom';
import {Check,ShieldCheck,Users} from 'lucide-react';
import {api} from './api';
import {useSession} from './auth-session';
import {Feedback,useTask} from './ui';
import type {Club} from './clubs';
import type {ClubEvent} from './lfg-events';

export function EventParticipation({event,club}:{event:ClubEvent;club:Club}){
 const {user}=useSession(),task=useTask();
 const active=event.my_registration===true||event.my_registration==='active'||(typeof event.my_registration==='object'&&event.my_registration?.state==='active');
 const member=club.membership?.state==='active',pending=club.membership?.state==='pending';
 const confirmed=active&&event.state==='open'&&club.state==='active';
 const open=['open','available'].includes(event.registration_status);
 const beforeStart=new Date(event.starts_at).valueOf()>Date.now();
 let title:string,description:string,action:React.ReactNode;
 if(event.state!=='open'){
  title=event.state==='cancelled'?'Встреча отменена':event.state==='completed'?'Встреча завершена':'Участие недоступно';
  description='Новые регистрации не принимаются.';
 }else if(club.state!=='active'){
  title='Клуб находится в архиве';description='Изменить участие в этой встрече сейчас нельзя.';
 }else if(active){
  title='Ты участвуешь';description=beforeStart?'Регистрация подтверждена. Если планы изменятся, отмени участие до начала встречи.':'Встреча уже началась. Изменить участие нельзя.';
  if(beforeStart)action=<button className="secondary" type="button" disabled={task.busy} onClick={()=>task.run(()=>api('/events/'+event.id+'/registration','DELETE',{}),undefined,'Участие отменено')}>Отменить участие</button>;
 }else if(!open){
  title=event.registration_status==='full'?'Мест нет':'Регистрация закрыта';description=event.registration_status==='full'?'Все места заняты. Можно проверить встречу позже.':'Срок записи истёк или встреча уже началась.';
 }else if(!user){
  title='Хочешь участвовать?';description='Войди в аккаунт. Для записи нужно действующее членство в клубе.';
  action=<Link className="primary" to={'/login?returnTo='+encodeURIComponent('/events/'+event.id)}>Войти для участия</Link>;
 }else if(!user.verified){
  title='Подтверди почту';description='Для записи на встречу нужна подтверждённая почта.';
  action=<Link className="primary" to="/account/verify-email">Подтвердить почту</Link>;
 }else if(!member){
  title=pending?'Заявка в клуб на рассмотрении':'Сначала вступи в клуб';description=pending?'После одобрения заявки ты сможешь записаться на встречу, если регистрация будет открыта.':'Публичный анонс виден всем, а участвовать могут только действующие участники клуба.';
  action=<Link className="primary" to={'/clubs/'+club.id+(pending?'/identity':'/join')}>{pending?'Моя заявка':club.join_mode==='open'?'Вступить в клуб':'Подать заявку в клуб'}</Link>;
 }else{
  title='Запись открыта';description='Ты состоишь в клубе и можешь присоединиться к встрече.';
  action=<button className="primary" type="button" disabled={task.busy} onClick={()=>task.run(()=>api('/events/'+event.id+'/registration','POST',{}),undefined,'Ты зарегистрирован на встречу')}>Участвовать</button>;
 }
 return <section className={'event-participation'+(confirmed?' confirmed':'')} aria-label="Участие во встрече">
  <div className="event-participation-heading">{confirmed?<Check size={22}/>:member?<ShieldCheck size={22}/>:<Users size={22}/>}<h2>{title}</h2></div>
  <p>{description}</p><Feedback task={task}/>{action&&<div className="actions">{action}</div>}
 </section>;
}
