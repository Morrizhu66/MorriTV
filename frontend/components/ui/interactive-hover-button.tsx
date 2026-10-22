// Adapted from Magic UI Interactive Hover Button, MIT, Aayush Bharti.
import type {ButtonHTMLAttributes} from 'react';
import {ArrowRight} from 'lucide-react';
import {cn} from '@/lib/utils';
export function InteractiveHoverButton({children,className,...props}:ButtonHTMLAttributes<HTMLButtonElement>){
 return <button {...props} className={cn('interactive-hover-button',className)}>
  <span className="hover-button-rest"><i aria-hidden="true"/><span>{children}</span></span>
  <span className="hover-button-active" aria-hidden="true"><span>{children}</span><ArrowRight size={15}/></span>
 </button>;
}
