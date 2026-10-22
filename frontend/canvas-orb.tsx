import {createRoot} from 'react-dom/client';
import {VoiceOrb} from './components/agents/voice-orb';
const host=document.getElementById('script-orb');
if(host) createRoot(host).render(<VoiceOrb colors={['#91cf28','#d7ff94','#071209']} speed={.65} activity={.12} style={{width:'100%',height:'100%'}}/>);
