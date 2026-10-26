import type {ReactNode} from 'react';
import {useRouteLoaderData} from 'react-router-dom';
import type {Session} from './api';
import {AuthRequired,Empty} from './ui';

export const useSession=()=>useRouteLoaderData('root') as Session;

export function Gate({children,verified=false,publicOnly=false}:{children:ReactNode;verified?:boolean;publicOnly?:boolean}){
 const {user}=useSession();
 if(!user||(verified&&!user.verified))return <AuthRequired user={user} verified={verified}/>;
 if(publicOnly&&user.visibility!=='public')return <Empty title="Нужен публичный профиль" to="/me/privacy" action="Настроить приватность">Сначала решите, какие данные профиля вы готовы открыть сообществу.</Empty>;
 return <>{children}</>;
}
