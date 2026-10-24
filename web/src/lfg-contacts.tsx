import {useLayoutEffect,useState,type FormEvent} from 'react';
import {useLoaderData,useParams} from 'react-router-dom';
import {Check,Clock,RefreshCw,ShieldCheck} from 'lucide-react';
import {api} from './api';
import {Gate} from './auth';
import {CheckField,Feedback,Field,PageHeading,Submit,formValues,isChecked,textValue,useTask} from './ui';

type ContactState={own_contact:string|null;partner_contact:string|null;own_consented:boolean;partner_consented:boolean;notice:string};

export function LfgContacts(){
 const initial=useLoaderData() as ContactState;const {applicationId}=useParams();
 return <Gate verified><ContactExchange key={applicationId} applicationId={applicationId!} initial={initial}/></Gate>;
}

function ContactExchange({applicationId,initial}:{applicationId:string;initial:ContactState}){
 const [data,setData]=useState<ContactState|null>(initial);const task=useTask({revalidate:false});
 useLayoutEffect(()=>setData(initial),[initial]);
 const path='/lfg/applications/'+applicationId+'/contacts';
 // Refresh and mutations both read the current server state. A failed read never
 // leaves a previously disclosed partner contact presented as current.
 async function update(method='GET',body?:unknown){
  setData(null);
  if(method!=='GET')await api(path,method,body);
  const fresh=await api<ContactState>(path);setData(fresh);
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
  {data&&<>
   <form key={data.own_contact??'empty'} className="stack" onSubmit={submit}>
    <Field name="game_contact" label="Твой игровой контакт" defaultValue={data.own_contact??''} maxLength={120} required help="Только игровой ник или ID, без email и телефона. Почта аккаунта не раскрывается."/>
    <CheckField name="consent" required>Разрешаю показать этот контакт только принятому напарнику в этой заявке.</CheckField>
    <Submit busy={task.busy}>Разрешить обмен контактами</Submit>
   </form>
   {data.own_consented&&<div className="section-gap"><button type="button" className="secondary" disabled={task.busy} onClick={()=>task.run(()=>update('DELETE'),undefined,'Согласие отозвано. Контакт скрыт при следующих просмотрах.')}>Отозвать согласие</button></div>}
  </>}
  <p className="fine-print">{data?.notice||'Отзыв прекращает дальнейший показ. Уже сохранённые получателем копии удалить невозможно.'}</p>
 </>;
}
