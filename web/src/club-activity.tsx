import {Link,useLoaderData,useLocation,useSearchParams} from 'react-router-dom';
import {CalendarDays,Pin,Plus} from 'lucide-react';
import {type Collection,type Post} from './api';
import type {Club} from './clubs';
import {ClubNavigation} from './club-navigation';
import {EventCard,type ClubEvent} from './lfg-events';
import {PostCard,usePagedCollection} from './social';
import {Empty,PageHeading} from './ui';

export type ClubFeedItem=(Post&{kind:'post';pinned:boolean})|(ClubEvent&{kind:'event'});
function PageTail({page}:{page:{cursor?:string;busy:boolean;error:string;loadMore:()=>void}}){const location=useLocation();return <>{page.cursor&&<button className="secondary load-more" disabled={page.busy} onClick={page.loadMore}>{page.busy?'Загружается…':'Показать ещё'}</button>}{page.error&&<div className="feedback error club-list-error" role="alert">{page.error}<Link className="text-control" to={location.pathname+location.search}>Открыть начало списка</Link></div>}</>;}
function EventEntry({event}:{event:ClubEvent}){
 const registration=typeof event.my_registration==='object'&&event.my_registration?event.my_registration.state:event.my_registration;
 const active=registration===true||registration==='active'||registration==='registered';
 return <div className="club-event-entry"><EventCard event={event}/>{active&&<span className="pill participation-note">{event.state==='open'?'Ты участвуешь':'Ты был записан'}</span>}{registration==='cancelled'&&<span className="pill participation-note">Твоя запись отменена</span>}</div>;
}
export function ClubFeed({club,initial}:{club:Club;initial:Collection<ClubFeedItem>}){
 const page=usePagedCollection(initial,'/clubs/'+club.id+'/feed?view=feed');const member=club.membership?.state==='active';
 return <section className="club-feed" aria-label="Лента клуба">{page.items.length?page.items.map(item=>item.kind==='event'?<EventEntry key={'event-'+item.id} event={item}/>:<div className={'club-feed-entry'+(item.pinned?' pinned':'')} key={'post-'+item.id}>{item.pinned&&<div className="pin-label"><Pin size={15} aria-hidden="true"/>Закреплено</div>}<PostCard post={item} canModerate={club.permissions.manage} onUpdate={fresh=>page.updateItem({...fresh,kind:'post',pinned:item.pinned})} onUnavailable={()=>page.removeItem(item.id)}/></div>):<Empty title="Первый разговор — за вами" to={member&&club.state==='active'?'/clubs/'+club.id+'/posts/new':undefined} action="Написать публикацию">Публикации и встречи клуба появятся в этой ленте.</Empty>}<PageTail page={page}/></section>;
}
export function ClubEvents(){
 const {club,events}=useLoaderData() as {club:Club;events:Collection<ClubFeedItem>};const [params]=useSearchParams();
 const view=['past','cancelled'].includes(params.get('view')??'')?params.get('view')!:'upcoming';
 const page=usePagedCollection(events,'/clubs/'+club.id+'/feed?view='+view);
 const canCreate=club.state==='active'&&club.membership?.state==='active'&&club.event_roles.includes(club.membership.role);
 const labels={upcoming:['Пока нет ближайших встреч','Здесь появятся предстоящие и текущие встречи клуба.'],past:['Прошедших встреч пока нет','Завершённые встречи сохраняются здесь.'],cancelled:['Отменённых встреч нет','Отменённые анонсы сохраняются отдельно от ближайших встреч.']} as const;
 const [title,copy]=labels[view as keyof typeof labels];
 if(!club.permissions.read_content)return <><PageHeading title="Встречи клуба" description={club.name} back={'/clubs/'+club.id}/><ClubNavigation club={club}/><Empty title="Встречи для участников" to={club.state==='active'?'/clubs/'+club.id+'/join':undefined} action="Вступить в клуб">Встречи закрытой ленты доступны действующим участникам клуба.</Empty></>;
 return <><PageHeading title="Встречи клуба" description={club.name} back={'/clubs/'+club.id} action={canCreate?<Link className="secondary" to={'/clubs/'+club.id+'/events/new'}><Plus size={16}/>Создать встречу</Link>:undefined}/><ClubNavigation club={club}/><nav className="tabs event-view-tabs" aria-label="Виды встреч">{([['upcoming','Ближайшие'],['past','Прошедшие'],['cancelled','Отменённые']] as const).map(([value,label])=><Link key={value} className={view===value?'active':''} aria-current={view===value?'page':undefined} to={'/clubs/'+club.id+'/events'+(value==='upcoming'?'':'?view='+value)}>{label}</Link>)}</nav><p className="fine-print event-list-note"><CalendarDays size={15} aria-hidden="true"/>{view==='upcoming'?'Предстоящие и текущие встречи, сначала ближайшие.':'Сначала встречи с более поздним началом.'} Время: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><section className="club-events" aria-label="Список встреч">{page.items.length?page.items.map(item=>item.kind==='event'?<EventEntry key={item.id} event={item}/>:null):<Empty title={title}>{copy}</Empty>}<PageTail page={page}/></section></>;
}
