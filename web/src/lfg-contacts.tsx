import {useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {useLoaderData,useParams} from 'react-router-dom';
import {Check,Clock,RefreshCw,ShieldCheck} from 'lucide-react';
import {api} from './api';
import {Gate,useSession} from './auth-session';
import {Feedback,Field,PageHeading,Submit,formValues,isChecked,textValue,useTask} from './ui';

type ContactState={own_contact:string|null;partner_contact:string|null;own_consented:boolean;partner_consented:boolean;notice:string};

export function LfgContacts(){
 const initial=useLoaderData() as ContactState;const {applicationId}=useParams();const {user}=useSession();
 return <Gate verified><ContactExchange key={(user?.id??'guest')+':'+applicationId} applicationId={applicationId!} initial={initial}/></Gate>;
}

function ContactExchange({applicationId,initial}:{applicationId:string;initial:ContactState}){
 const [data,setData]=useState<ContactState|null>(initial);const task=useTask({revalidate:false});
 const [contact,setContact]=useState(initial.own_contact??''),[consent,setConsent]=useState(false);
 const savedContact=useRef(initial.own_contact??'');
 function receive(fresh:ContactState){
  const previous=savedContact.current;const next=fresh.own_contact??'';
  setContact(value=>value===previous?next:value);savedContact.current=next;setData(fresh);
 }
 useLayoutEffect(()=>receive(initial),[initial]);
 const path='/lfg/applications/'+applicationId+'/contacts';
 // Refresh and mutations both read the current server state. A failed read never
 // leaves a previously disclosed partner contact presented as current.
 async function update(method='GET',body?:unknown){
  setData(null);
  if(method!=='GET')await api(path,method,body);
  if(method==='DELETE'){setContact('');savedContact.current='';setConsent(false);}
  if(method==='PUT')setConsent(false);
  const fresh=await api<ContactState>(path);receive(fresh);
  if(method==='PUT')setContact(fresh.own_contact??'');
 }
 function submit(e:FormEvent<HTMLFormElement>){const values=formValues(e);void task.run(()=>update('PUT',{game_contact:textValue(values,'game_contact'),consent:isChecked(values,'consent')}),undefined,'Согласие и контакт сохранены');}
 const title=!data?'Статус пока не подтверждён':data.own_consented&&data.partner_consented?'Контакты доступны':data.own_consented?'Ожидаем согласие напарника':data.partner_consented?'Нужно твоё согласие':'Обмен ещё не разрешён';
 return <>
  <PageHeading title="Игровые контакты" back="/me/lfg" description="После принятия отклика каждый отдельно решает, делиться ли своим игровым контактом."/>
  <section className="journey-panel contact-exchange" aria-label="Состояние обмена" aria-busy={task.busy}>
   <div className="contact-exchange-title"><ShieldCheck size={23} aria-hidden="true"/><h2>{title}</h2></div>
   {data?<>
    <ul className="contact-consents"><li>{data.own_consented?<Check size={18}/>:<Clock size={18}/>}<span><b>Твоё согласие</b><small>{data.own_consented?'Дано':'Не дано'}</small></span></li><li>{data.partner_consented?<Check size={18}/>:<Clock size={18}/>}<span><b>Согласие напарника</b><small>{data.partner_consented?'Дано':'Не дано'}</small></span></li></ul>
    <p className="muted">{data.own_consented&&data.partner_consented?'Оба разрешили обмен. Добавьте друг друга в игре и договоритесь о матче.':data.own_consented?'Твой контакт появится у напарника только после его отдельного согласия. Обнови статус, когда он будет готов.':data.partner_consented?'Напарник разрешил обмен. Его контакт появится, когда ты отдельно разрешишь показать свой.':'Укажи игровой ник или ID и разреши обмен, когда будешь готов. Контакты появятся после двух согласий.'}</p>
   </>:<p className="muted">{task.busy?'Проверяем согласия на сервере…':'Обнови статус, чтобы получить актуальные согласия и контакты.'}</p>}
   <button type="button" className="secondary" disabled={task.busy} onClick={()=>task.run(()=>update())}><RefreshCw size={16} aria-hidden="true"/>Обновить статус</button>
  </section>
  <Feedback task={task}/>
  {data?.partner_contact&&<section className="contact-card"><span className="muted">Игровой контакт напарника</span><b>{data.partner_contact}</b></section>}
   <form className="stack" onSubmit={submit}>
    <Field name="game_contact" label="Твой игровой контакт" help="Только игровой ник или ID, без email и телефона. Почта аккаунта не раскрывается."><input className="field" name="game_contact" value={contact} onChange={e=>setContact(e.target.value)} maxLength={120} required disabled={task.busy} autoComplete="off"/></Field>
    <label className="checkrow"><input type="checkbox" name="consent" checked={consent} onChange={e=>setConsent(e.target.checked)} required disabled={task.busy}/><span>Разрешаю показать этот контакт только принятому напарнику в этой заявке.</span></label>
    <Submit busy={task.busy}>Разрешить обмен контактами</Submit>
   </form>
   {data?.own_consented&&<div className="section-gap"><button type="button" className="secondary" disabled={task.busy} onClick={()=>task.run(()=>update('DELETE'),undefined,'Согласие отозвано. Контакт скрыт при следующих просмотрах.')}>Отозвать согласие</button></div>}
  <p className="fine-print">{data?.notice||'Отзыв прекращает дальнейший показ. Уже сохранённые получателем копии удалить невозможно.'}</p>
 </>;
}
