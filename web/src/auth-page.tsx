import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {Lock} from 'lucide-react';
import {ApiError,api,session} from './api';
import {useSession} from './auth';
import {ApiButton,Empty,Feedback,Field,PageHeading,Submit,formValues,textValue,useTask} from './ui';

type Mode='login'|'signup'|'recovery'|'reset'|'verify';
const handleHint='Используйте 3–32 латинские буквы, цифры или знак подчёркивания.';

export function AuthPage({mode}:{mode:Mode}){
 const task=useTask(),navigate=useNavigate();const [params]=useSearchParams();const {user}=useSession();
 const [done,setDone]=useState(false),[fields,setFields]=useState<Record<string,string>>({}),[focusRequest,setFocusRequest]=useState(0);
 const form=useRef<HTMLFormElement>(null);
 const title={login:'С возвращением',signup:'Найди своих',recovery:'Восстановить доступ',reset:'Новый пароль',verify:'Подтверждение почты'}[mode];
 const token=params.get('token')??'';
 useEffect(()=>{
  if(!focusRequest)return;
  const frame=requestAnimationFrame(()=>{
   const target=form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')??form.current?.querySelector<HTMLElement>('[role="alert"]');
   if(!target)return;target.tabIndex=target instanceof HTMLInputElement?target.tabIndex:-1;
   target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:'auto'});
  });return()=>cancelAnimationFrame(frame);
 },[focusRequest]);
 function showFields(errors:Record<string,string>){setFields(errors);setFocusRequest(n=>n+1);}
 async function submit(event:FormEvent<HTMLFormElement>){
  const data=formValues(event);setFields({});
  if(mode==='signup'&&!/^[a-z0-9_]{3,32}$/.test(textValue(data,'handle').toLowerCase())){
   showFields({handle:handleHint});task.setError('Проверьте выделенное поле.');return;
  }
  await task.run(async()=>{
   try{
    if(mode==='login'||mode==='signup'){
     await api(mode==='login'?'/auth/login':'/auth/register','POST',mode==='login'?{email:textValue(data,'email'),password:String(data.get('password'))}:{email:textValue(data,'email'),password:String(data.get('password')),handle:textValue(data,'handle'),display_name:textValue(data,'display_name')});
     await session();
    }else if(mode==='recovery')await api('/auth/reset-request','POST',{email:textValue(data,'email')});
    else if(mode==='reset')await api('/auth/reset-confirm','POST',{token:textValue(data,'token'),password:String(data.get('password'))});
    else await api('/auth/verify-email','POST',{token:textValue(data,'token')});
   }catch(error){showFields(error instanceof ApiError?error.fields:{});throw error;}
  },()=>{
   if(mode==='login'||mode==='signup'){
    const target=params.get('returnTo');navigate(target?.startsWith('/')&&!target.startsWith('//')?target:mode==='signup'?'/account/verify-email':'/me');
   }else setDone(true);
  });
 }
 return <div className="auth-page">
  <div className="auth-symbol"><img src="/brand.svg" width="48" height="48" alt=""/></div>
  <PageHeading title={title} description={mode==='signup'?'Люди, обсуждения и команды за пределами матча.':mode==='login'?'Войди в своё сообщество.':mode==='verify'?'Открой письмо и перейди по ссылке или вставь код ниже.':'Безопасный доступ к своему аккаунту.'}/>
  {done?<Empty title={mode==='recovery'?'Проверь почту':mode==='verify'?'Почта подтверждена':'Пароль изменён'} to={mode==='recovery'?'/login':mode==='verify'?'/me':'/login'} action={mode==='verify'?'В профиль':'Войти'}>
   {mode==='recovery'?'Если такой адрес зарегистрирован, мы отправили ссылку для восстановления.':mode==='verify'?'Теперь можно публиковать, вступать в клубы и искать команду.':'Войди с новым паролем. Предыдущие сессии завершены.'}
  </Empty>:<form ref={form} onSubmit={submit} className="stack" onChange={event=>{
   const target=event.target;const name=target instanceof HTMLInputElement||target instanceof HTMLSelectElement||target instanceof HTMLTextAreaElement?target.name:'';
   if(fields[name])setFields(current=>{const next={...current};delete next[name];return next;});
   task.setError('');
  }}>
   <Feedback task={task}/>
   {(mode==='login'||mode==='signup'||mode==='recovery')&&<Field label="Электронная почта" name="email" error={fields.email} type="email" autoComplete="email" spellCheck={false} required maxLength={254}/>}
   {mode==='signup'&&<>
    <Field label="Как тебя зовут" name="display_name" error={fields.display_name} autoComplete="nickname" maxLength={80} required/>
    <Field label="Уникальный ник" name="handle" error={fields.handle} autoComplete="username" spellCheck={false} minLength={3} maxLength={32} required help="3–32 латинские буквы, цифры или _. Ссылки на профиль используют постоянный ID."/>
   </>}
   {(mode==='login'||mode==='signup'||mode==='reset')&&<Field label={mode==='reset'?'Новый пароль':'Пароль'} name="password" error={fields.password} type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:12} maxLength={128} help={mode!=='login'?'От 12 до 128 символов.':undefined}/>}
   {(mode==='verify'||mode==='reset')&&<Field label="Код из письма" name="token" error={fields.token} defaultValue={token} autoComplete="one-time-code" required/>}
   {mode==='signup'&&<div className="info-note"><Lock size={18}/><p>Новый профиль скрыт. Ты сам решишь, когда открыть его другим игрокам.</p></div>}
   <Submit busy={task.busy}>{mode==='login'?'Войти':mode==='signup'?'Создать аккаунт':mode==='recovery'?'Отправить ссылку':mode==='reset'?'Изменить пароль':'Подтвердить почту'}</Submit>
  </form>}
  {mode==='login'&&<div className="auth-links"><Link to="/account/recovery">Забыли пароль?</Link><span>Впервые здесь? <Link to="/signup">Создать аккаунт</Link></span></div>}
  {mode==='signup'&&<p className="muted">Уже есть аккаунт? <Link to="/login">Войти</Link></p>}
  {mode==='verify'&&user&&<ApiButton path="/auth/verify-request" success="Письмо отправлено. Проверьте также папку «Спам».">Отправить письмо ещё раз</ApiButton>}
  <p className="fine-print">Независимое сообщество игроков. Не связано с Riot Games.</p>
 </div>;
}
