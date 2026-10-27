import {useId,useState,type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {ChevronDown,ChevronUp,SlidersHorizontal} from 'lucide-react';
import {roleLabel} from '../../shared/game-roles';

export function searchConditions(params:URLSearchParams,fields:Record<string,string>){
 return Object.entries(fields).flatMap(([key,label])=>{const value=params.get(key)?.trim();return value?[label+': '+(key==='role'?roleLabel(value):value)]:[];});
}
export function SearchFilters({conditions,resetTo,children,initiallyExpanded}:{conditions:string[];resetTo:string;children:ReactNode;initiallyExpanded?:boolean}){
 const [expanded,setExpanded]=useState(initiallyExpanded??conditions.length===0),id=useId();
 return <div className={'filter-panel'+(expanded?'':' collapsed')}>
  <div className="filter-panel-toolbar"><button type="button" className="filter-toggle secondary" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}><SlidersHorizontal size={17}/>Фильтры{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{conditions.length>0&&<Link className="quiet-link" to={resetTo}>Сбросить фильтры</Link>}</div>
  {conditions.length>0&&<ul className="active-filters" aria-label="Выбранные фильтры">{conditions.map(condition=><li key={condition}>{condition}</li>)}</ul>}
  <div id={id} className="filter-panel-fields">{children}</div>
 </div>;
}
