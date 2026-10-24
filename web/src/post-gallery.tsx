import {useRef,useState,type MouseEvent} from 'react';
import {ArrowUpRight,ChevronLeft,ChevronRight,X} from 'lucide-react';
import type {ImageAsset} from './api';

export function PostGallery({images}:{images:ImageAsset[]}){
 const dialog=useRef<HTMLDialogElement>(null);
 const trigger=useRef<HTMLButtonElement|null>(null);
 const [index,setIndex]=useState(0);
 const show=(position:number,event:MouseEvent<HTMLButtonElement>)=>{
  trigger.current=event.currentTarget;
  setIndex(position);
  dialog.current?.showModal();
 };
 const move=(amount:number)=>setIndex(current=>(current+amount+images.length)%images.length);
 const close=()=>dialog.current?.close();
 return <>
  <div className={'post-images count-'+images.length}>
   {images.map((image,position)=><button
    key={image.id}
    type="button"
    className="post-image-trigger"
    aria-label={'Открыть изображение '+(position+1)+' из '+images.length}
    onClick={event=>show(position,event)}
   ><img src={image.url} alt="Вложение к публикации" loading="lazy"/></button>)}
  </div>
  <dialog
   ref={dialog}
   className="post-gallery-dialog"
   aria-label="Просмотр изображений"
   onClose={()=>trigger.current?.focus()}
   onKeyDown={event=>{
    if(images.length<2)return;
    if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
    if(event.key==='ArrowRight'){event.preventDefault();move(1);}
   }}
   onClick={event=>{if(event.target===event.currentTarget)close();}}
  >
   <div className="post-gallery-frame">
    <div className="post-gallery-toolbar">
     <span aria-live="polite">{index+1} из {images.length}</span>
     <div className="post-gallery-tools">
      <a href={images[index].url} target="_blank" rel="noopener noreferrer" aria-label="Открыть оригинал изображения">Оригинал <ArrowUpRight size={17}/></a>
      <button type="button" className="icon-button" aria-label="Закрыть просмотр" onClick={close}><X size={22}/></button>
     </div>
    </div>
    <div className="post-gallery-stage">
     <img src={images[index].url} alt={'Изображение '+(index+1)+' из '+images.length}/>
    </div>
    {images.length>1&&<div className="post-gallery-controls">
     <button type="button" className="secondary" aria-label="Предыдущее изображение" onClick={()=>move(-1)}><ChevronLeft size={19}/> Назад</button>
     <button type="button" className="secondary" aria-label="Следующее изображение" onClick={()=>move(1)}>Далее <ChevronRight size={19}/></button>
    </div>}
   </div>
  </dialog>
 </>;
}
