import {readPageState,writePageState,readCommentDraft,writeCommentDraft,readReplyTarget,writeReplyTarget} from './community-state';
import {readPostDraft,writePostDraft,removePostDraft,postSnapshot} from './post-drafts';
export {resetPostDrafts} from './post-drafts';
import {roleLabel} from '../../shared/game-roles';
import {useEffect,useId,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useLoaderData,useLocation,useNavigationType,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {ArrowRight,Bookmark,ChevronDown,ChevronLeft,ChevronRight,ChevronUp,Heart,ImagePlus,MessageCircle,MoreHorizontal,Plus,Search,Send,Trash2,X} from 'lucide-react';
import {ApiError,api,collection,mediaUrl,message,query,type Author,type Collection,type Comment,type ImageAsset,type Post,type Profile} from './api';
import {Gate,useSession} from './auth-session';
import {ApiButton,AuthorName,Avatar,CheckField,ConfirmButton,Empty,Feedback,Field,PageHeading,ReportLink,Select,Submit,date,formValues,isChecked,splitValues,textValue,useTask} from './ui';
import {PostGallery} from './post-gallery';
import {PostText} from './post-text';
export function Discoveries(){const [collapsed,setCollapsed]=useState(()=>{try{return sessionStorage.getItem('wrcommunity:discoveries-collapsed')==='1';}catch{return false;}}),[slide,setSlide]=useState(0);const touch=useRef<{x:number;y:number}|null>(null);const {user}=useSession();const cards=[{title:'Найти своих',description:'Игроки, команды и темы, которые тебе близки.',to:'/discover',button:'Смотреть игроков',label:'Открытия'},{title:'Своя компания',description:'Общие интересы. Знакомые лица. Новые встречи.',to:'/clubs',button:'Открыть клубы',label:'Сообщества'},{title:'Есть что обсудить?',description:'Тактика, впечатления и собственные истории.',to:'/posts/new',button:'Написать пост',label:'Обсуждения'}];const card=cards[slide];function move(n:number){setSlide((n+cards.length)%cards.length);}function toggle(){const next=!collapsed;setCollapsed(next);try{sessionStorage.setItem('wrcommunity:discoveries-collapsed',next?'1':'0');}catch{}}return <section className={'discoveries'+(user?' compact':'')} aria-label="Открытия"><div className="discoveries-caption"><span>Открой для себя</span><button className="text-control" onClick={toggle} aria-expanded={!collapsed}>{collapsed?'Развернуть':'Свернуть'}{collapsed?<ChevronDown size={15}/>:<ChevronUp size={15}/>}</button></div>{!collapsed&&<><div className="hero-shell"><div className={'hero hero-'+slide} onTouchStart={e=>{touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{if(touch.current){const dx=e.changedTouches[0].clientX-touch.current.x,dy=e.changedTouches[0].clientY-touch.current.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2)move(slide+(dx<0?1:-1));touch.current=null;}}} onTouchCancel={()=>{touch.current=null;}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowRight'){e.preventDefault();move(slide+1);}if(e.key==='ArrowLeft'){e.preventDefault();move(slide-1);}}} tabIndex={0}><div className="hero-portal" aria-hidden="true"><div/><i/><b/></div><div className="hero-content"><span className="hero-label">{card.label}</span><h2>{card.title}</h2><p>{card.description}</p><Link to={card.to} className="hero-action">{card.button}<ArrowRight size={14}/></Link></div><button className="hero-next" aria-label="Следующая карточка" onClick={()=>move(slide+1)}><ArrowRight size={19}/></button></div></div><div className="hero-controls"><span>{slide+1} из {cards.length}</span><div className="hero-dots">{cards.map((_,i)=><button key={i} aria-label={'Карточка '+(i+1)} aria-current={slide===i} className={slide===i?'selected':''} onClick={()=>move(i)}/>)}</div></div></>}</section>;}
export function Home(){const data=useLoaderData() as Collection<Post>;const [params]=useSearchParams();const mode=params.get('mode')??'all';const {user}=useSession();return <><h1 className="sr-only">Лента WrCommunity</h1><Discoveries/><div className="feed-head"><div><h2>Лента</h2><span>Публикации сообщества</span></div><Link className="quiet-link" to="/discover"><Search size={17}/> Найти</Link></div><nav className="tabs" aria-label="Тип ленты"><Link to="/" preventScrollReset className={mode==='all'?'active':''}>Все</Link><Link to="/?mode=following" preventScrollReset className={mode==='following'?'active':''}>Подписки</Link><Link className="create-link" to="/posts/new" aria-label="Создать публикацию"><Plus size={19}/><span>Написать</span></Link></nav>{mode==='following'&&!user?<Empty title="Твоя лента подписок" to="/login?returnTo=%2F%3Fmode%3Dfollowing" action="Войти">Войди, чтобы читать публикации интересных тебе авторов.</Empty>:<PostList key={mode} data={data} path={'/feed'+query({mode})} emptyTitle={mode==='following'?'Здесь появятся посты твоих авторов':'Сообщество начинается с разговора'} emptyTo={mode==='following'?'/discover':'/posts/new'} emptyAction={mode==='following'?'Найти авторов':'Написать пост'} emptyText={mode==='following'?'Найди игроков по ролям и интересам и подпишись на их публикации.':'Публикаций пока нет. Поделись мыслью, задай вопрос или найди компанию для следующего матча.'}/>}<div className="community-note"><img src="/brand.svg" width="32" height="32" alt=""/><div><h2>За пределами матча</h2><p>Независимое русскоязычное сообщество игроков Wild Rift.</p></div></div></>;}
export function usePagedCollection<T extends {id:string}>(initial:Collection<T>,path:string){
 const {user}=useSession();
 const location=useLocation(),navigationType=useNavigationType();
 const scope=(user?.id??'guest')+':'+path+':'+location.key;
 const remembered=navigationType==='POP'?readPageState(scope):undefined;
 const restoreY=useRef<number|null>(remembered?.scrollY??null);
 const lastScrollY=useRef(window.scrollY);
 const [items,setItems]=useState(initial.items);
 const [cursor,setCursor]=useState(initial.nextCursor);
 const [busy,setBusy]=useState(Boolean(remembered&&remembered.pages>1));
 const [error,setError]=useState('');
 const pages=useRef(remembered?.pages??1);
 const scopeRef=useRef(scope);
 const requestVersion=useRef(0);
 const loadController=useRef<AbortController|null>(null);
 const pageUrl=(after:string)=>path+(path.includes('?')?'&':'?')+'cursor='+encodeURIComponent(after);
 useEffect(()=>{
  const version=++requestVersion.current;
  loadController.current?.abort();
  const controller=new AbortController();
  setError('');
  if(scopeRef.current!==scope){
   scopeRef.current=scope;
   const saved=navigationType==='POP'?readPageState(scope):undefined;
   pages.current=saved?.pages??1;
   restoreY.current=saved?.scrollY??null;
  }
  const pageCount=pages.current;
  if(pageCount===1){
   setItems(initial.items);
   setCursor(initial.nextCursor);
   setBusy(false);
   return ()=>controller.abort();
  }
  setBusy(true);
  void (async()=>{
   let current=[...initial.items];
   let next=initial.nextCursor;
   for(let index=1;index<pageCount&&next;index++){
    const result=await collection<T>(pageUrl(next),controller.signal);
    current=[...current,...result.items];
    next=result.nextCursor;
   }
   if(version!==requestVersion.current||controller.signal.aborted)return;
   setItems(Array.from(new Map(current.map(item=>[item.id,item])).values()));
   setCursor(next);
  })().catch(cause=>{
   if(version!==requestVersion.current||controller.signal.aborted)return;
   // Never retain stale extra pages if access changed or a refresh failed.
   setItems(initial.items);
   setCursor(initial.nextCursor);
   pages.current=1;
   restoreY.current=null;
   writePageState(scope,{pages:1,scrollY:0});
   setError(message(cause));
  }).finally(()=>{
   if(version===requestVersion.current&&!controller.signal.aborted)setBusy(false);
  });
  return ()=>controller.abort();
 },[initial,scope]);
 useLayoutEffect(()=>{
  if(busy||restoreY.current===null)return;
  const top=restoreY.current;
  // Let layout and browser scroll anchoring settle after inserting the restored tail.
  let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{window.scrollTo(0,top);restoreY.current=null;});});
  return()=>cancelAnimationFrame(frame);
 },[items,busy,scope]);
 useLayoutEffect(()=>{
  const capture=()=>{lastScrollY.current=window.scrollY;};
  window.addEventListener('scroll',capture,{passive:true});
  window.addEventListener('popstate',capture);
  document.addEventListener('click',capture,true);
  return()=>{
   window.removeEventListener('scroll',capture);window.removeEventListener('popstate',capture);document.removeEventListener('click',capture,true);
   // Removing the old DOM can already clamp window.scrollY before cleanup runs.
   writePageState(scope,{pages:pages.current,scrollY:lastScrollY.current});
   loadController.current?.abort();
  };
 },[scope]);
 async function loadMore(){
  if(busy||!cursor)return;
  const controller=new AbortController();
  loadController.current=controller;
  const version=requestVersion.current;
  setBusy(true);
  setError('');
  try{
   const next=await collection<T>(pageUrl(cursor),controller.signal);
   if(controller.signal.aborted||version!==requestVersion.current)return;
   pages.current+=1;
   writePageState(scope,{pages:pages.current,scrollY:window.scrollY});
   setItems(current=>Array.from(new Map([...current,...next.items].map(item=>[item.id,item])).values()));
   setCursor(next.nextCursor);
  }catch(cause){
   if(!controller.signal.aborted&&version===requestVersion.current)setError(message(cause));
  }finally{
   if(!controller.signal.aborted&&version===requestVersion.current)setBusy(false);
  }
 }
 const updateItem=(value:T)=>setItems(current=>current.map(item=>item.id===value.id?value:item));
 const removeItem=(id:string)=>setItems(current=>current.filter(item=>item.id!==id));
 return {items,cursor,busy,error,loadMore,updateItem,removeItem};
}
export function PostList({data,path,emptyTitle='Пока нет публикаций',emptyText='Новые записи появятся здесь.',emptyTo='/posts/new',emptyAction='Написать пост',editable=false}:{data:Collection<Post>;path:string;emptyTitle?:string;emptyText?:string;emptyTo?:string;emptyAction?:string;editable?:boolean}){
 const {items,cursor,busy,error,loadMore,updateItem,removeItem}=usePagedCollection(data,path);
 return <><div className="post-list">{items.length?items.map(post=><PostCard post={post} key={post.id} editable={editable} onUpdate={fresh=>{if(path.startsWith('/bookmarks')&&!fresh.bookmarked)removeItem(fresh.id);else updateItem(fresh);}} onUnavailable={()=>removeItem(post.id)}/>):<Empty title={emptyTitle} to={emptyTo} action={emptyAction}>{emptyText}</Empty>}</div>{cursor&&<button className="secondary load-more" disabled={busy} onClick={loadMore}>{busy?'Загружается…':'Показать ещё'}</button>}{error&&<div className="feedback error" role="alert">{error}</div>}</>;
}
export function PostCard({post:loadedPost,detail=false,editable=false,canModerate=false,onUpdate,onUnavailable}:{post:Post;detail?:boolean;editable?:boolean;canModerate?:boolean;onUpdate?:(post:Post)=>void;onUnavailable?:()=>void}){
 const {user}=useSession(),navigate=useNavigate();
 const task=useTask({revalidate:detail});
 const [snapshot,setSnapshot]=useState<{source:Post;value:Post}|null>(null);
 const [hiddenSource,setHiddenSource]=useState<Post|null>(null);
 const post=snapshot?.source===loadedPost?snapshot.value:loadedPost;
 const [menu,setMenu]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),menuId=useId();
 const own=post.author_id===user?.id||editable;
 useEffect(()=>{
  if(!menu)return;
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!trigger.current?.contains(event.target)&&!panel.current?.contains(event.target))setMenu(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMenu(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[menu]);
 async function react(kind:'like'|'bookmark',active:boolean){
  if(!user){navigate('/login?returnTo='+encodeURIComponent(location.pathname+location.search));return;}
  await task.run(async()=>{
   await api('/posts/'+post.id+'/'+kind,active?'DELETE':'PUT',{});
   if(detail)return;
   try{
    const fresh=await api<Post>('/posts/'+post.id);setSnapshot({source:loadedPost,value:fresh});onUpdate?.(fresh);
   }catch(error){if(error instanceof ApiError&&[403,404].includes(error.status)){setHiddenSource(loadedPost);onUnavailable?.();}throw error;}
  });
 }
 if(hiddenSource===loadedPost)return <article className="post"><p className="muted">Публикация больше недоступна.</p><Feedback task={task}/></article>;
 return <article className={'post'+(detail?' detail':'')}><div className="post-top"><Avatar author={post.author}/><div className="identity"><AuthorName author={post.author}/><span className="byline">{post.author.handle?'@'+post.author.handle+' · ':''}<time dateTime={post.created_at}>{date(post.created_at)}</time>{post.state!=='published'&&<span className="state-label">{post.state==='draft'?'Черновик':post.state==='pending'?'На проверке':post.state==='rejected'?'Отклонено':post.state}</span>}</span></div><button type="button" className="icon-button" ref={trigger} aria-label="Действия с публикацией" aria-expanded={menu} aria-controls={menuId} onClick={()=>setMenu(!menu)}><MoreHorizontal size={21}/></button></div>{menu&&<div className="context-menu" ref={panel} id={menuId} role="group" aria-label="Действия публикации" onClick={event=>{if(event.target instanceof Element&&event.target.closest('a'))setMenu(false);}}>{own&&<Link to={post.club_id?`/clubs/${post.club_id}/posts/${post.id}/edit`:`/posts/${post.id}/edit`}>Редактировать</Link>}{(own||canModerate)&&<ConfirmButton className="text-control danger-text" warning="Удалить публикацию? Она станет недоступна читателям." perform={()=>api(post.club_id?'/clubs/posts/'+post.id:'/posts/'+post.id,'DELETE')}>Удалить</ConfirmButton>}<ReportLink type="post" id={post.id}/></div>}{post.club_id&&<Link className="post-topic" to={'/clubs/'+post.club_id}>Публикация клуба<ChevronRight size={13}/></Link>}{post.tags?.length>0&&<div className="post-tags">{post.tags.map(tag=><Link key={tag} to={'/discover/content?tag='+encodeURIComponent(tag)}>#{tag}</Link>)}</div>}<PostText key={post.body} body={post.body} postId={post.id} detail={detail}/>{post.images?.length>0&&<PostGallery images={post.images}/>}<div className="post-actions"><button className={'react'+(post.liked?' active':'')} aria-label={post.liked?'Убрать отметку нравится':'Нравится'} aria-pressed={post.liked} disabled={task.busy} onClick={()=>react('like',post.liked)}><Heart size={20} fill={post.liked?'currentColor':'none'}/><span>{post.like_count||'Нравится'}</span></button><Link className="react" to={'/posts/'+post.id+'#comments'} aria-label="Комментарии"><MessageCircle size={20}/><span>{post.comment_count||'Ответить'}</span></Link><button className={'react push'+(post.bookmarked?' saved':'')} aria-label={post.bookmarked?'Убрать закладку':'Сохранить в закладки'} aria-pressed={post.bookmarked} disabled={task.busy} onClick={()=>react('bookmark',post.bookmarked)}><Bookmark size={20} fill={post.bookmarked?'currentColor':'none'}/></button></div><Feedback task={task}/></article>;}
export function PostsPage({kind}:{kind:'bookmarks'|'drafts'|'mine'|'mentions'|'content'}){const data=useLoaderData() as Collection<Post>;const {user}=useSession();const titles={bookmarks:'Закладки',drafts:'Черновики',mine:'Мои публикации',mentions:'Упоминания',content:'Темы и публикации'};return <><PageHeading title={titles[kind]} back={kind==='content'?'/discover':'/me'} action={kind==='drafts'||kind==='mine'?<Link className="icon-button" to="/posts/new" aria-label="Написать пост"><Plus size={21}/></Link>:undefined}/>{kind==='content'&&<form className="search-form" method="get"><Field name="tag" label="Тема" defaultValue={new URLSearchParams(location.search).get('tag')??''}/><button className="secondary">Найти</button></form>}<PostList data={data} path={kind==='bookmarks'?'/bookmarks':kind==='mentions'?'/mentions':kind==='content'?'/feed'+location.search:'/posts'+query({authorId:user?.id,state:kind==='drafts'?'draft':'published'})} editable={kind==='drafts'||kind==='mine'}/></>;}
export function PostDetail(){const {user}=useSession();const {post,comments,canModerate}=useLoaderData() as {post:Post;comments:Collection<Comment>;canModerate?:boolean};return <><PageHeading title="Публикация" back={post.club_id?'/clubs/'+post.club_id:'/'}/><PostCard post={post} detail canModerate={canModerate}/><Comments key={(user?.id??'guest')+':'+post.id} post={post} initial={comments} canModerate={canModerate}/></>;}
function Comments({post,initial,canModerate=false}:{post:Post;initial:Collection<Comment>;canModerate?:boolean}){
 const {user}=useSession();
 const draftScope=(user?.id??'guest')+':'+post.id;
 const [replyId,setReplyId]=useState<string|null>(()=>readReplyTarget(draftScope));
 const draftKey=draftScope+':'+(replyId??'root');
 const [body,setBody]=useState(()=>readCommentDraft(draftKey));
 const {items,cursor,busy,error,loadMore}=usePagedCollection(initial,'/posts/'+post.id+'/comments');
 const reply=items.find(comment=>comment.id===replyId)??null;
 const task=useTask();
 const ref=useRef<HTMLTextAreaElement>(null),inputId=useId();
 useLayoutEffect(()=>{writeCommentDraft(draftKey,body);writeReplyTarget(draftScope,replyId);},[draftKey,draftScope,body,replyId]);
 function changeReply(id:string|null){writeCommentDraft(draftKey,body);writeReplyTarget(draftScope,id);setReplyId(id);setBody(readCommentDraft(draftScope+':'+(id??'root')));ref.current?.focus();}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(replyId&&!reply)return;
  await task.run(()=>api('/posts/'+post.id+'/comments','POST',{body:body.trim(),parent_id:replyId??undefined}),()=>{writeCommentDraft(draftKey,'');writeReplyTarget(draftScope,null);setReplyId(null);setBody(replyId?readCommentDraft(draftScope+':root'):'');},'Комментарий отправлен');
 }
 const children=(parent:string|null)=>items.filter(c=>c.parent_id===parent||(!parent&&c.parent_id&&!items.some(p=>p.id===c.parent_id)));
 const replyCount=(id:string):number=>children(id).reduce((n,child)=>n+1+replyCount(child.id),0);
 function branch(comment:Comment,depth=0):React.ReactNode{
  return <CommentNode key={comment.id} comment={comment} depth={depth} replyCount={replyCount(comment.id)} canModerate={canModerate} onReply={c=>changeReply(c.id)}>{children(comment.id).map(c=>branch(c,depth+1))}</CommentNode>;
 }
 return <section className="comments" id="comments"><h2 className="section-title">Обсуждение</h2>{items.length?children(null).map(c=>branch(c)):<p className="muted">Пока тихо. Начни обсуждение.</p>}{cursor&&<button className="secondary" onClick={loadMore} disabled={busy}>{busy?'Загружается…':'Загрузить комментарии'}</button>}{error&&<div className="feedback error" role="alert">{error}</div>}{user?<form className="comment-form stack" onSubmit={submit}>{replyId&&!reply&&<div className="info-note"><p>Исходный комментарий пока недоступен. Загрузи ветку или <button type="button" className="text-control" onClick={()=>changeReply(null)}>Вернуться к комментарию</button>.</p></div>}{reply&&<div className="reply-context"><div className="reply-context-copy"><span>Ответ {reply.author.display_name??reply.author.nickname??reply.author.handle}</span><p>{reply.body.length>140?reply.body.slice(0,140)+'…':reply.body}</p><a href={'#comment-'+reply.id}>К комментарию</a></div><button className="icon-button" type="button" aria-label="Отменить ответ" onClick={()=>changeReply(null)}><X size={16}/></button></div>}<label className="formrow" htmlFor={inputId}><span id={inputId+'-label'}>{replyId?'Ответить':'Твой комментарий'}</span><textarea className="field" id={inputId} aria-labelledby={inputId+'-label'} ref={ref} value={body} onChange={event=>setBody(event.target.value)} name="body" required maxLength={5000} rows={3} placeholder="Поделись мыслями…"/></label><Feedback task={task}/><Submit busy={task.busy} disabled={Boolean(replyId&&!reply)}>Отправить<Send size={16}/></Submit></form>:<Empty title="Присоединяйся к разговору" to={'/login?returnTo='+encodeURIComponent('/posts/'+post.id)} action="Войти">Войди, чтобы оставить комментарий.</Empty>}</section>;
}
function CommentNode({comment,depth,replyCount,children,onReply,canModerate=false}:{comment:Comment;depth:number;replyCount:number;children:React.ReactNode;onReply:(comment:Comment)=>void;canModerate?:boolean}){const {user}=useSession();const task=useTask();const [collapsed,setCollapsed]=useState(false),[edit,setEdit]=useState(false);const own=comment.author.id===user?.id||comment.can_edit;async function save(e:FormEvent<HTMLFormElement>){const data=formValues(e);await task.run(()=>api('/comments/'+comment.id,'PATCH',{body:textValue(data,'body')}),()=>setEdit(false));}return <article id={'comment-'+comment.id} className={'comment depth-'+Math.min(depth,3)}><div className="comment-heading"><AuthorName author={comment.author}/><time>{date(comment.created_at)}</time></div>{edit?<form className="stack" onSubmit={save}><Field name="body" label="Изменить комментарий" type="textarea" defaultValue={comment.body} maxLength={5000} required/><Submit busy={task.busy}>Сохранить</Submit><button type="button" className="text-control" onClick={()=>setEdit(false)}>Отмена</button></form>:<p className="copy">{comment.body}</p>}<div className="comment-controls">{user?<button className="text-control" onClick={()=>onReply(comment)}>Ответить</button>:<Link className="text-control" to={'/login?returnTo='+encodeURIComponent('/posts/'+comment.post_id)}>Ответить</Link>}{own&&<><button className="text-control" onClick={()=>setEdit(!edit)}>Изменить</button><ConfirmButton className="text-control" warning="Удалить комментарий?" perform={()=>api('/comments/'+comment.id,'DELETE')}>Удалить</ConfirmButton></>}{!own&&(canModerate||comment.can_moderate)&&<ClubCommentRemoval id={comment.id}/>}{comment.can_block&&<ConfirmButton className="text-control" warning="Заблокировать автора комментария? Взаимные подписки и реакции будут прекращены, дальнейшее прямое взаимодействие станет недоступно." perform={()=>api('/comments/'+comment.id+'/block-author','PUT',{})}>Заблокировать автора</ConfirmButton>}<ReportLink type="comment" id={comment.id}/>{replyCount>0&&<button className="text-control" aria-controls={'comment-replies-'+comment.id} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'Показать':'Скрыть'} {replyCount} {replyCount%10===1&&replyCount%100!==11?'ответ':replyCount%10>=2&&replyCount%10<=4&&(replyCount%100<12||replyCount%100>14)?'ответа':'ответов'}</button>}</div><Feedback task={task}/>{!collapsed&&<div className="comment-children" id={'comment-replies-'+comment.id}>{children}</div>}</article>;}

function ClubCommentRemoval({id}:{id:string}){const [open,setOpen]=useState(false);const task=useTask();return <><button className="text-control danger-text" type="button" onClick={()=>setOpen(!open)}>Удалить из клуба</button>{open&&<form className="confirm-panel stack" onSubmit={e=>{const data=formValues(e);task.run(()=>api('/clubs/comments/'+id,'DELETE',{reason:textValue(data,'reason')}),()=>setOpen(false));}}><Field label="Причина удаления комментария" name="reason" minLength={5} maxLength={2000} required type="textarea" help="Причина сохранится в журнале клуба."/><Feedback task={task}/><div className="actions"><button className="secondary" type="button" onClick={()=>setOpen(false)}>Отмена</button><Submit busy={task.busy} className="danger">Удалить комментарий</Submit></div></form>}</>;}
export function PostEditor({club=false}:{club?:boolean}){const loaded=useLoaderData() as {post?:Post;club?:{id:string;name:string}}|null;const post=loaded?.post;const params=useParams(),navigate=useNavigate();const {user}=useSession();const draftKey='post:'+user?.id+':'+(club?params.clubId:'personal')+':'+(post?.id??'new');const cached=readPostDraft(draftKey);const unfinished=post&&cached&&cached.savedSnapshot===postSnapshot(cached.body,cached.tags,cached.images)?undefined:cached;const published=useRef(false);const task=useTask();const [body,setBody]=useState(unfinished?.body??post?.body??''),[tags,setTags]=useState(unfinished?.tags??post?.tags.join(', ')??''),[images,setImages]=useState<ImageAsset[]>(unfinished?.images??post?.images??[]),[savedId,setSavedId]=useState(unfinished?.savedId??post?.id),[preview,setPreview]=useState(false);const [savedSnapshot,setSavedSnapshot]=useState(unfinished?.savedSnapshot??postSnapshot(post?.body??'',post?.tags.join(', ')??'',post?.images??[]));const [buffered,setBuffered]=useState(true);const dirty=postSnapshot(body,tags,images)!==savedSnapshot;const hasContent=Boolean(body||tags||images.length);useLayoutEffect(()=>{if(published.current)return;if(post&&!dirty){removePostDraft(draftKey);return;}if(hasContent||savedId)setBuffered(writePostDraft(draftKey,{body,tags,images,savedId,savedSnapshot}));else removePostDraft(draftKey);},[draftKey,body,tags,images,savedId,savedSnapshot,hasContent,dirty,post?.id]);useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{if(!published.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);const [uploading,setUploading]=useState(false);async function upload(e:React.ChangeEvent<HTMLInputElement>){const files=Array.from(e.target.files??[]);if(files.length+images.length>4){task.setError('Можно добавить не более четырёх изображений.');return;}setUploading(true);await task.run(async()=>{const next=[];for(const file of files){if(file.size>10*1024*1024)throw new Error('Изображение должно быть меньше 10 МБ.');const data=new FormData();data.set('file',file);next.push(await api<ImageAsset>('/media','POST',data));}setImages([...images,...next]);});setUploading(false);}async function save(state:'draft'|'published'){const payload={body,images:images.map(i=>i.id),tags:splitValues(tags),state};if(club){const path=savedId?`/clubs/posts/${savedId}`:`/clubs/${params.clubId}/posts`;await task.run(()=>api<{id:string}>(path,savedId?'PATCH':'POST',{body,images:images.map(i=>i.id),tags:splitValues(tags)}),()=>{published.current=true;removePostDraft(draftKey);navigate(`/clubs/${params.clubId}/my-posts`);});}else await task.run(()=>api<Post>(savedId?'/posts/'+savedId:'/posts',savedId?'PATCH':'POST',payload),result=>{setSavedId(result.id);setSavedSnapshot(postSnapshot(body,tags,images));if(state==='published'){published.current=true;removePostDraft(draftKey);navigate('/posts/'+result.id);}},state==='draft'?'Черновик сохранён':'Публикация создана');}return <Gate verified publicOnly={club}><PageHeading title={post?'Редактировать публикацию':club?'Публикация в клуб':'Новая публикация'} description={club?'Новые публикации и изменения появятся в ленте после одобрения руководством.':undefined} back={club?'/clubs/'+params.clubId:'/me/drafts'}/><form className="editor stack" onSubmit={e=>{e.preventDefault();save('published');}}><Feedback task={task}/>{hasContent&&<p className={'draft-status'+(!buffered?' warning':'')} role="status">{!buffered?'Автовосстановление недоступно. Сохрани черновик перед уходом.':dirty?'Текст сохранён в этой вкладке. Восстановится после обновления.':'Сохранено на сервере.'}</p>}<div className="editor-tabs"><button type="button" className={!preview?'active':''} onClick={()=>setPreview(false)}>Редактор</button><button type="button" className={preview?'active':''} onClick={()=>setPreview(true)}>Предпросмотр</button></div>{preview?<div className="editor-preview"><p className="copy">{body||'Текст публикации появится здесь.'}</p>{images.map(img=><img src={img.url} key={img.id} alt="Предпросмотр вложения" width={640} height={480}/>)}</div>:<><label className="formrow"><span>Текст публикации</span><textarea className="field post-textarea" name="body" required maxLength={5000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Есть что обсудить?"/></label><span className="character-count">{body.length} / 5000</span><label className="formrow"><span>Темы</span><input className="field" maxLength={512} value={tags} onChange={e=>setTags(e.target.value)} placeholder="Например: тактика, поиск команды"/><small>Через запятую. Упоминание игрока: @handle в тексте.</small></label><div className="upload-grid">{images.map(img=><div key={img.id}><img src={img.url} alt="Вложение" width={160} height={160} loading="lazy"/><button className="icon-button" type="button" aria-label="Убрать изображение" onClick={()=>setImages(images.filter(i=>i.id!==img.id))}><X size={17}/></button></div>)}</div>{images.length<4&&<label className="upload-button secondary"><ImagePlus size={18}/>{uploading?'Загружается…':'Добавить изображения'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={upload}/></label>}<p className="fine-print">До четырёх изображений, каждое до 10 МБ. Загружай только изображения, которые имеешь право использовать.</p></>}<div className="actions">{!club&&<button type="button" className="secondary" disabled={task.busy||uploading||!body.trim()} onClick={()=>save('draft')}>Сохранить черновик</button>}<Submit busy={task.busy||uploading} disabled={!body.trim()}>{club?'Отправить на проверку':'Опубликовать'}</Submit></div></form></Gate>;}
export function PlayerCard({profile,reasons}:{profile:Profile;reasons?:string[]}){return <article className="person"><Avatar author={{display_name:profile.display_name,avatar_url:mediaUrl(profile.avatar_id)}}/><div className="person-copy"><Link className="author" to={'/users/'+profile.id}>{profile.display_name}</Link><small>@{profile.handle}</small><small>{[profile.game?.server?.value,Array.isArray(profile.game?.roles?.value)?profile.game.roles.value.map(roleLabel).join(', '):profile.game?.roles?.value].filter(Boolean).join(' · ')}</small>{reasons?.length?<small className="match-reasons">{reasons.join(' · ')}</small>:null}</div><Link className="icon-button" to={'/users/'+profile.id} aria-label={'Открыть профиль '+profile.display_name}><ChevronRight size={20}/></Link></article>;}
export function PublicProfile(){const {profile,posts,following}=useLoaderData() as {profile:Profile;posts:Collection<Post>;following:boolean};const {user}=useSession();return <><PageHeading title="Профиль игрока" back="/discover"/><div className="profile-cover" style={profile.cover_id?{backgroundImage:`url(${mediaUrl(profile.cover_id)})`}:undefined}><span className="portal-art" aria-hidden="true"/></div><div className="profile-identity"><Avatar large author={{display_name:profile.display_name,avatar_url:mediaUrl(profile.avatar_id)}}/>{profile.online&&<span className="pill online">На сайте</span>}</div><h1 className="profile-name">{profile.display_name}</h1><p className="muted handle">@{profile.handle}</p>{profile.biography&&<p className="body-copy">{profile.biography}</p>}<div className="profile-actions">{user?.id===profile.id?<Link className="secondary" to="/me/edit">Редактировать профиль</Link>:<><FollowButton id={profile.id} following={following}/>{user&&<ConfirmButton warning="Будут прекращены взаимные подписки и реакции. Прямое взаимодействие с этим игроком станет недоступно." perform={()=>api('/profiles/'+profile.id+'/block','PUT',{})}>Заблокировать</ConfirmButton>}</>}</div><ReportLink type="profile" id={profile.id}/>{Object.keys(profile.game??{}).length>0&&<section className="game-summary"><h2 className="section-title">Игровая карточка</h2><p className="fine-print">Указано игроком</p><dl>{Object.entries(profile.game).map(([key,field])=><div key={key}><dt>{({server:'Сервер',roles:'Роли',rank:'Ранг',champions:'Чемпионы',schedule:'Расписание',timezone:'Часовой пояс',languages:'Языки'} as Record<string,string>)[key]??key}</dt><dd>{Array.isArray(field.value)?(key==='roles'?field.value.map(roleLabel):field.value).join(', '):field.value}</dd></div>)}</dl></section>}<h2 className="section-title">Публикации</h2><PostList data={posts} path={'/posts?authorId='+profile.id}/></>;}
export function FollowButton({id,following}:{id:string;following:boolean}){const {user}=useSession(),navigate=useNavigate();const task=useTask();return <><button className={following?'secondary':'primary'} disabled={task.busy} onClick={()=>{if(!user)navigate('/login?returnTo='+encodeURIComponent('/users/'+id));else task.run(()=>api('/profiles/'+id+'/follow',following?'DELETE':'PUT',{}));}}>{following?'Вы подписаны':'Подписаться'}</button><Feedback task={task}/></>;}
export function PeopleList({kind}:{kind:'following'|'followers'|'blocked'}){const data=useLoaderData() as Collection<Profile>;return <Gate><PageHeading title={kind==='blocked'?'Заблокированные аккаунты':kind==='followers'?'Подписчики':'Подписки'} back={kind==='blocked'?'/me/settings':'/me'}/>{data.items.length?data.items.map(profile=><div className="list-row" key={profile.id}><span><b>{profile.display_name??profile.handle??'Аккаунт'}</b><small>{profile.handle?'@'+profile.handle:''}</small></span>{kind==='blocked'?<ApiButton path={'/profiles/'+profile.id+'/block'} method="DELETE">Разблокировать</ApiButton>:<Link className="secondary" to={'/users/'+profile.id}>Профиль</Link>}</div>):<Empty title={kind==='blocked'?'Нет заблокированных аккаунтов':kind==='followers'?'Пока нет видимых подписчиков':'Пока нет подписок'} to={kind==='following'?'/discover':undefined} action="Найти игроков">{kind==='following'?'Находи людей по игровым ролям и интересам.':'Здесь можно управлять своими блокировками.'}</Empty>}</Gate>;}
