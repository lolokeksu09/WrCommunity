import {useId,useLayoutEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,ChevronDown,ChevronUp} from 'lucide-react';

export function PostText({body,postId,detail=false}:{body:string;postId:string;detail?:boolean}){
 const [expanded,setExpanded]=useState(false),[overflows,setOverflows]=useState(false);
 const paragraph=useRef<HTMLParagraphElement>(null),textId=useId();
 useLayoutEffect(()=>{
  if(detail||expanded||!paragraph.current)return;
  const element=paragraph.current;
  let active=true;
  const measure=()=>{if(active)setOverflows(element.scrollHeight>element.clientHeight+1);};
  measure();
  const observer=new ResizeObserver(measure);
  observer.observe(element);
  void document.fonts.ready.then(measure);
  return()=>{active=false;observer.disconnect();};
 },[body,detail,expanded]);
 const text=<p className="copy" id={textId} ref={paragraph}>{body}</p>;
 return <><div className={'post-body'+(expanded?' expanded':'')}>{detail||expanded?text:<Link className="post-content-link" to={'/posts/'+postId}>{text}</Link>}</div>{!detail&&overflows&&<div className="post-reading-controls"><button type="button" className="read-more" aria-expanded={expanded} aria-controls={textId} onClick={()=>setExpanded(value=>!value)}>{expanded?'Свернуть текст':'Читать полностью'}{expanded?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button><Link className="quiet-link" to={'/posts/'+postId}>Открыть публикацию<ArrowRight size={13}/></Link></div>}</>;
}
