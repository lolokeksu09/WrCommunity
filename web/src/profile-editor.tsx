import {useEffect,useRef,useState,type ChangeEvent,type FormEvent,type ReactNode} from 'react';
import {useLoaderData,useNavigate} from 'react-router-dom';
import {Gamepad2,Globe,Lock,ShieldCheck} from 'lucide-react';
import {canonicalRoles,roleLabel} from '../../shared/game-roles';
import {ApiError,api,mediaUrl,type Profile} from './api';
import {Gate} from './auth-session';
import {draftBaselines} from './profile-editor-state';
import {RolePicker} from './game-roles';
import {CheckField,Feedback,Field,PageHeading,Submit,draftValue,formValues,isChecked,splitValues,textValue,useFormDraft,useTask} from './ui';

type Mode='edit'|'game'|'privacy';
type Patch=Record<string,unknown>;
const gameFields=[['server','Сервер','EU',60],['roles','Роли','',60],['rank','Ранг','',60],['champions','Любимые чемпионы','Через запятую',undefined],['schedule','Когда играешь','Вечером по будням',500],['timezone','Часовой пояс','Europe/Moscow',80],['languages','Языки','Русский, English',undefined]] as const;
const labels:Record<string,string>={display_name:'Имя',biography:'О себе',avatar_id:'Аватар',cover_id:'Обложка',visibility:'Видимость профиля',online_opt_in:'Присутствие на сайте',game:'Игровая карточка'};
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);

function makePatch(profile:Profile,mode:Mode,data:FormData,avatar:string|null,cover:string|null,visibility:Profile['visibility']):Patch{
 const patch:Patch={};
 const set=(key:keyof Profile,value:unknown)=>{if(!same(profile[key],value))patch[key]=value;};
 if(mode==='edit'){
  set('display_name',textValue(data,'display_name'));set('biography',textValue(data,'biography'));set('avatar_id',avatar);set('cover_id',cover);
 }else if(mode==='privacy'){
  set('visibility',visibility);set('online_opt_in',isChecked(data,'online_opt_in'));
  if(patch.visibility!==undefined)patch.visibility_acknowledged=isChecked(data,'visibility_acknowledged');
 }else{
  const changed:Record<string,unknown>={};
  for(const [key]of gameFields){
   let value:unknown;
   if(key==='roles'){const roles=canonicalRoles(data.getAll(key).map(String));value=roles.length?{value:roles,public:isChecked(data,key+'_public')}:null;}
   else{const text=textValue(data,key);value=text?{value:['champions','languages'].includes(key)?splitValues(text):text,public:isChecked(data,key+'_public')}:null;}
   if(!same(profile.game[key],value))changed[key]=value;
  }
  if(Object.keys(changed).length)patch.game=changed;
 }
 return patch;
}
function valueView(key:string,value:unknown):ReactNode{
 if((key==='avatar_id'||key==='cover_id')&&typeof value==='string')return <img className="conflict-image" src={mediaUrl(value)} alt="Версия изображения" width={320} height={200}/>;
 if(value===null||value===undefined||value==='')return 'Не задано';
 if(typeof value==='boolean')return value?'Да':'Нет';
 if(key==='visibility')return value==='public'?'Публичный':'Скрытый';
 if(key==='game')return <ul>{Object.entries(value as Profile['game']).map(([name,field])=><li key={name}><b>{gameFields.find(([key])=>key===name)?.[1]??name}:</b> {field?`${Array.isArray(field.value)?(name==='roles'?field.value.map(roleLabel):field.value).join(', '):field.value} · ${field.public?'Публично':'Только тебе'}`:'Убрать поле'}</li>)}</ul>;
 return String(value);
}
export function ProfileEditor({mode}:{mode:Mode}){
 const profile=useLoaderData() as Profile;
 return <Gate><Editor key={profile.id+':'+mode} profile={profile} mode={mode}/></Gate>;
}
function Editor({profile:loadedProfile,mode}:{profile:Profile;mode:Mode}){
 const draftKey='profile:'+loadedProfile.id+':'+mode;
 const [profile]=useState(()=>draftBaselines.get(draftKey)??loadedProfile);
 const formDraft=useFormDraft(draftKey);
 const task=useTask(),navigate=useNavigate();const heading=useRef<HTMLHeadingElement>(null);
 const [visibility,setVisibility]=useState(draftValue(draftKey,'visibility') as Profile['visibility']??profile.visibility);
 const [avatarId,setAvatarId]=useState<string|null>((draftValue(draftKey,'avatar_id')??profile.avatar_id)||null);
 const [coverId,setCoverId]=useState<string|null>((draftValue(draftKey,'cover_id')??profile.cover_id)||null);
 const [uploading,setUploading]=useState(false);
 const [conflict,setConflict]=useState<{latest:Profile;patch:Patch}|null>(null);
 useEffect(()=>{if(avatarId!==profile.avatar_id||coverId!==profile.cover_id||visibility!==profile.visibility){draftBaselines.set(draftKey,profile);formDraft.remember();}},[avatarId,coverId,visibility]);
 useEffect(()=>{
  if(!conflict)return;const frame=requestAnimationFrame(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'center'});});return()=>cancelAnimationFrame(frame);
 },[conflict]);
 async function upload(event:ChangeEvent<HTMLInputElement>,kind:'avatar'|'cover'){
  const input=event.target,file=input.files?.[0];if(!file)return;setUploading(true);
  await task.run(async()=>{const data=new FormData();data.set('file',file);const result=await api<{id:string}>('/media','POST',data);if(kind==='avatar')setAvatarId(result.id);else setCoverId(result.id);});
  input.value='';setUploading(false);
 }
 async function save(patch:Patch,version:number){
  await task.run(async()=>{
   try{return await api('/me/profile','PATCH',{version,...patch});}
   catch(error){
    if(error instanceof ApiError&&error.code==='VERSION_CONFLICT'){
     formDraft.remember();const latest=await api<Profile>('/me/profile');
     if(latest.id!==profile.id)throw new Error('Аккаунт изменился. Откройте свой профиль заново.');
     setConflict({latest,patch});
    }
    throw error;
   }
  },()=>{formDraft.clear();draftBaselines.delete(draftKey);navigate('/me');});
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  const data=formValues(event);const patch=makePatch(profile,mode,data,avatarId||null,coverId||null,visibility);
  if(!Object.keys(patch).length){formDraft.clear();draftBaselines.delete(draftKey);task.setError('Нет изменений для сохранения.');return;}
  await save(patch,profile.version);
 }
 return <>
  <PageHeading title={mode==='edit'?'Редактировать профиль':mode==='game'?'Игровая карточка':'Приватность'} back="/me" description={mode==='game'?'Данные указываются вручную. Выбери, какие поля будут видны в публичном профиле.':undefined}/>
  {conflict&&<section className="conflict-panel" aria-labelledby="profile-conflict-heading">
   <h2 id="profile-conflict-heading" ref={heading} tabIndex={-1}>Профиль изменён в другой вкладке</h2>
   <p>Твой ввод сохранён. Сравни изменения перед повторным сохранением. Остальные поля останутся в актуальной версии сервера.</p>
   {Object.entries(conflict.patch).filter(([key])=>key!=='visibility_acknowledged').map(([key,value])=>{
    const latest=key==='game'?Object.fromEntries(Object.keys(value as object).map(name=>[name,conflict.latest.game[name]??null])):conflict.latest[key as keyof Profile];
    return <article className="conflict-field" key={key}><h3>{labels[key]??key}</h3><dl><dt>Сейчас на сервере</dt><dd>{valueView(key,latest)}</dd><dt>Твой ввод</dt><dd>{valueView(key,value)}</dd></dl></article>;
   })}
   <div className="actions"><button className="secondary" type="button" disabled={task.busy} onClick={()=>{setConflict(null);task.setError('');}}>Вернуться к редактированию</button><button className="primary" type="button" disabled={task.busy} onClick={()=>{void save(conflict.patch,conflict.latest.version);}}>{task.busy?'Сохраняется…':'Сохранить мой ввод'}</button></div>
  </section>}
  <form ref={formDraft.ref} onChange={event=>{
   if(event.target instanceof HTMLInputElement&&event.target.type==='file')return;
   draftBaselines.set(draftKey,profile);formDraft.onChange(event);
  }} className="stack" onSubmit={submit}>
   <input type="hidden" name="avatar_id" value={avatarId??''}/><input type="hidden" name="cover_id" value={coverId??''}/>
   <Feedback task={task}/>
   <fieldset className="editor-fields" disabled={Boolean(conflict)||task.busy}>
    {mode==='edit'&&<>
     <Field label="Имя" name="display_name" required maxLength={80} defaultValue={profile.display_name}/>
     <Field label="О себе" name="biography" type="textarea" maxLength={2000} defaultValue={profile.biography}/>
     <Field label="Аватар" name="avatar"><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event=>{void upload(event,'avatar');}}/></Field>
     {avatarId?<><img className="upload-preview" src={mediaUrl(avatarId)} alt="Аватар" width={75} height={75}/><button className="secondary" type="button" disabled={uploading} onClick={()=>setAvatarId(null)}>Убрать аватар</button></>:<p className="muted">Аватар не выбран.</p>}
     {avatarId!==profile.avatar_id&&<button className="text-control" type="button" disabled={uploading} onClick={()=>setAvatarId(profile.avatar_id)}>Вернуть сохранённый аватар</button>}
     <Field label="Обложка" name="cover"><input type="file" name="cover" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event=>{void upload(event,'cover');}}/></Field>
     {coverId?<><img className="upload-preview wide" src={mediaUrl(coverId)} alt="Обложка" width={640} height={140}/><button className="secondary" type="button" disabled={uploading} onClick={()=>setCoverId(null)}>Убрать обложку</button></>:<p className="muted">Обложка не выбрана.</p>}
     {coverId!==profile.cover_id&&<button className="text-control" type="button" disabled={uploading} onClick={()=>setCoverId(profile.cover_id)}>Вернуть сохранённую обложку</button>}
    </>}
    {mode==='game'&&<>
     <div className="info-note"><Gamepad2 size={20}/><p>Указано игроком. Мы не проверяем данные через игровые API.</p></div>
     {gameFields.map(([key,label,placeholder,maxLength])=><div className="game-field" key={key}>
      {key==='roles'?<RolePicker name={key} label={label} defaultValue={Array.isArray(profile.game.roles?.value)?profile.game.roles.value:[]}/>:<Field label={label} name={key} defaultValue={Array.isArray(profile.game[key]?.value)?(profile.game[key].value as string[]).join(', '):profile.game[key]?.value as string??''} maxLength={maxLength} placeholder={placeholder}/>}
      <CheckField name={key+'_public'} defaultChecked={profile.game[key]?.public}>Показывать в публичной карточке</CheckField>
     </div>)}
    </>}
    {mode==='privacy'&&<>
     <fieldset className="choice-list"><legend>Кто видит твой профиль</legend>
      <label><input name="visibility" type="radio" value="hidden" checked={visibility==='hidden'} onChange={()=>setVisibility('hidden')}/><Lock size={21}/><span><b>Скрытый</b><small>Профиль и собственные посты доступны только тебе. Клубные согласия действуют отдельно.</small></span></label>
      <label><input name="visibility" type="radio" value="public" checked={visibility==='public'} onChange={()=>setVisibility('public')}/><Globe size={21}/><span><b>Публичный</b><small>Профиль, опубликованные записи и выбранные игровые данные доступны всем.</small></span></label>
     </fieldset>
     <div className="info-note"><ShieldCheck size={20}/><div>{profile.visibility_warnings?.length?profile.visibility_warnings.map(warning=><p key={warning}>{warning}</p>):<p>Скрытие профиля не удаляет подписи у прежних комментариев в публичных обсуждениях. Владелец клуба должен оставаться публичным.</p>}</div></div>
     <CheckField name="visibility_acknowledged" required>Я понимаю последствия изменения видимости профиля.</CheckField>
     <CheckField name="online_opt_in" defaultChecked={profile.online_opt_in}>Показывать присутствие на сайте в публичном профиле. Это не статус в игре.</CheckField>
    </>}
    <Submit busy={task.busy||uploading}>Сохранить изменения</Submit>
   </fieldset>
  </form>
 </>;
}
