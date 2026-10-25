import {useLayoutEffect,useRef} from 'react';
import {NavLink,useLocation} from 'react-router-dom';
import type {Club} from './clubs';

function useActiveTab(){
 const ref=useRef<HTMLElement>(null);const {pathname}=useLocation();
 useLayoutEffect(()=>{const nav=ref.current,active=nav?.querySelector('[aria-current="page"]');if(!nav||!active)return;const box=nav.getBoundingClientRect(),tab=active.getBoundingClientRect();if(tab.right>box.right)nav.scrollLeft+=tab.right-box.right+8;else if(tab.left<box.left)nav.scrollLeft+=tab.left-box.left-8;},[pathname]);
 return ref;
}

export function ClubNavigation({club}:{club:Club}){
 const ref=useActiveTab();const base='/clubs/'+club.id;const member=club.membership?.state==='active';
 return <nav ref={ref} className="tabs club-tabs" aria-label="Разделы клуба"><NavLink end to={base}>Лента</NavLink>{club.permissions.read_content&&<NavLink to={base+'/events'}>Встречи</NavLink>}<NavLink to={base+'/about'}>О клубе</NavLink>{club.permissions.read_content&&<NavLink to={base+'/members'}>Участники</NavLink>}{member&&<NavLink to={base+'/my-posts'}>Мои публикации</NavLink>}{(club.permissions.manage||club.permissions.owner)&&<NavLink to={base+'/manage'}>Управление</NavLink>}</nav>;
}
export function ClubReviewNavigation({club}:{club:Club}){
 const ref=useActiveTab();const base='/clubs/'+club.id;const role=club.membership?.role;
 return <nav ref={ref} className="tabs review-tabs" aria-label="Очереди клуба">{club.state==='active'&&['owner','admin'].includes(role??'')&&<NavLink to={base+'/requests'}>Заявки</NavLink>}{club.permissions.manage&&<><NavLink to={base+'/moderation'}>Публикации</NavLink><NavLink to={base+'/reports'}>Жалобы</NavLink></>}<NavLink to={base+'/manage'}>Все действия</NavLink></nav>;
}
