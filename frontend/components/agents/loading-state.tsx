// Pixel-grid Drive variant supplied by the user, with live elapsed time.
import {useEffect,useState} from 'react';
export function LoadingState({startedAt,label='正在等待回复'}:{startedAt:number,label?:string}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(timer);},[]);
 const seconds=Math.max(0,(now-startedAt)/1000);
 return <div className="first-token-loader" role="status" aria-label={label}>
  <span className="loader-grid" aria-hidden>{Array.from({length:9},(_,i)=><i key={i} style={{animationDelay:`${(i%3+Math.abs(Math.floor(i/3)-1))*90}ms`}}/>)}</span>
  <span className="loader-shimmer">{label}</span>
  <span className="loader-time" aria-hidden>{seconds<60?seconds.toFixed(1)+'s':`${Math.floor(seconds/60)}m ${(seconds%60).toFixed(1)}s`}</span>
 </div>;
}
