import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei/web/Html';
import { Color, Object3D, MathUtils } from 'three';
import type { Group, InstancedMesh, PerspectiveCamera, Mesh, MeshStandardMaterial } from 'three';
import { CityStage, useStageQuality } from './kit/CityStage';

export type Cell3 = { r: number; c: number };
export interface ActionActor {
  id: number; x: number; y: number; z?: number; label?: string; color?: string;
  state?: string; selected?: boolean; enabled?: boolean; hidden?: boolean; value?: number; rotation?: number;
}
export interface ActionSceneData {
  actors?: ActionActor[];
  body?: Cell3[];
  grid?: { rows: number; cols: number; walls?: number[][] };
  player?: Cell3;
  shadow?: Cell3;
  shield?: number;
  lamps?: Cell3[];
  direction?: string;
  angle?: number;
  duration?: number;
  selected?: number | null;
  running?: boolean;
  reducedMotion?: boolean;
  verdict?: string | null;
  blade?: boolean;
  dial?: number;
  onPick?: (id: number) => void;
  onMove?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onSpin?: () => void;
  onDial?: () => void;
  onError?: (error: Error) => void;
}
export const tones = ['#ff1268', '#00e4ef', '#ffd000', '#7927ff', '#36ee30', '#ff6500'];
/** Explicit enamel swatches keep controller colours out of the physical art palette. */
export function vividColor(color?: string, index = 0) {
  const swatches: Record<string, string> = {'#fb7185':'#ff174f','#fbbf24':'#ffcf00','#7dd3fc':'#00cdff','#a78bfa':'#7527ff','#34d399':'#00e875','#e879f9':'#ee00ff','#bef264':'#9aff00','#f472b6':'#ff008e'};
  return color ? swatches[color.toLowerCase()] ?? color : tones[index % tones.length];
}
export type DetailBlock = {at:[number,number,number];size:[number,number,number];color:string};
export function Box({ at = [0,0,0], size = [1,1,1], color = '#2336cb', metal = .18, glow = false }: { at?: [number,number,number]; size?: [number,number,number]; color?: string; metal?: number; glow?: boolean }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} metalness={metal} roughness={metal ? .28 : .42} toneMapped={false} emissive={glow ? color : '#000'} emissiveIntensity={glow ? .32 : 0}/></mesh>;
}
export function Orb({ at = [0,0,0], scale = [1,1,1], radius = .3, color = '#ffd000', glow = false }: { at?: [number,number,number]; scale?: [number,number,number]; radius?: number; color?: string; glow?: boolean }) {
  return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[radius,16,12]}/><meshStandardMaterial color={color} metalness={.1} roughness={.22} toneMapped={false} emissive={glow ? color : '#000'} emissiveIntensity={glow ? .35 : 0}/></mesh>;
}
const LabelPortal = createContext<RefObject<HTMLDivElement> | undefined>(undefined);
export function Label({ at, text, selected = false, number = false }: {at:[number,number,number];text: string; selected?:boolean;number?:boolean}) {
  const portal = useContext(LabelPortal);
  return <Html portal={portal} position={at} center zIndexRange={[5,0]} style={{pointerEvents:'none'}}><span className="action-three-label" data-active={selected} data-number={number} aria-current={selected ? 'true' : undefined} aria-label={selected ? `${text}, selected` : undefined}>{text}</span></Html>;
}
export function Smooth({ at, children, reduced = false, yaw = 0 }: {at:[number,number,number];children:ReactNode;reduced?:boolean;yaw?:number}) {
  const ref=useRef<Group>(null);
  const initialPosition=useRef<[number,number,number]>([...at]);
  useFrame((_,dt)=>{ const g=ref.current;if(!g)return;const k=reduced?1:Math.min(1,dt*16);g.position.x=MathUtils.lerp(g.position.x,at[0],k);g.position.y=MathUtils.lerp(g.position.y,at[1],k);g.position.z=MathUtils.lerp(g.position.z,at[2],k);g.rotation.y=yaw; });
  return <group ref={ref} position={initialPosition.current}>{children}</group>;
}
export function Instances({ blocks }: {blocks: DetailBlock[]}) {
  const ref=useRef<InstancedMesh>(null);
  useLayoutEffect(()=>{if(!ref.current)return;const dummy=new Object3D();const color=new Color();blocks.forEach((b,i)=>{dummy.position.set(...b.at);dummy.scale.set(...b.size);dummy.updateMatrix();ref.current!.setMatrixAt(i,dummy.matrix);ref.current!.setColorAt(i,color.set(b.color));});ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();},[blocks]);
  return <instancedMesh ref={ref} args={[undefined,undefined,blocks.length]} castShadow receiveShadow><boxGeometry/><meshStandardMaterial metalness={.18} roughness={.36} toneMapped={false}/></instancedMesh>;
}
function Camera({ width, board }: {width:number;board:boolean}) {
  const {camera,size}=useThree();
  useEffect(()=>{const cam=camera as PerspectiveCamera;const aspect=size.width/Math.max(1,size.height);const extent=Math.max(width/aspect,width*.8);const distance=extent*1.25;cam.position.set(0,board?distance*.93:3.2,board?distance*.74:distance);cam.lookAt(0,board?0:2.1,0);cam.fov=43;cam.updateProjectionMatrix();},[camera,size.width,size.height,width,board]);
  return null;
}
export function Stage({children,onError,reducedMotion,width=9,board=false,theme='city'}: {children:ReactNode;onError?:ActionSceneData['onError'];reducedMotion?:boolean;width?:number;board?:boolean;theme?:'city'|'garden'|'harbour'|'vault'|'fair'}) {
  const portal=useRef<HTMLDivElement>(null!);
  const sky={city:'#080d2e',garden:'#031c24',harbour:'#03162f',vault:'#090b2c',fair:'#1b0530'}[theme];
  return <div style={{position:'relative',height:'100%'}}><CityStage arcade onError={onError} reducedMotion={reducedMotion}><LabelPortal.Provider value={portal}><Camera width={width} board={board}/><color attach="background" args={[sky]}/><fog attach="fog" args={[sky,28,65]}/><Scenery width={width} theme={theme}/>{children}</LabelPortal.Provider></CityStage><div ref={portal} style={{position:'absolute',inset:0,pointerEvents:'none'}}/></div>;
}
function Scenery({width,theme}:{width:number;theme:string}) {
  const {tier}=useStageQuality();
  const blocks=useMemo(()=>{
    const b:DetailBlock[]=[];
    const accent=theme==='harbour'?'#00d9ff':theme==='garden'?'#5dff00':theme==='vault'?'#ffcf00':'#ff128b';
    const count=tier==='low'?7:11;
    for(let i=0;i<count;i++){
      const x=(i-(count-1)/2)*width/(count-1)*1.3,h=1.3+(i*7%6)*.32,z=-width*.68,span=width/count;
      b.push({at:[x,h/2-.45,z],size:[span*.88,h,.86],color:['#1624a5','#4715a8','#073d83'][i%3]});
      b.push({at:[x,h-.39,z],size:[span*.95,.12,.96],color:accent});
      b.push({at:[x,h-.18,z],size:[span*.48,.34,.54],color:'#080e34'});
      b.push({at:[x,h+.12,z],size:[.035,.35,.04],color:'#00d9ff'});
      b.push({at:[x-span*.36,h/2-.42,z+.45],size:[.035,h,.035],color:accent});
      for(let r=0;r<Math.floor(h/.35)-1;r++)for(let c=0;c<3;c++){
        b.push({at:[x+(c-1)*span*.23,r*.35-.12,z+.45],size:[span*.12,.18,.025],color:(i+r+c)%4?'#ffc400':'#082552'});
      }
      b.push({at:[x,-.18,z+.7],size:[span*.98,.17,1],color:'#082554'});
      b.push({at:[x,.16,z+.63],size:[span*.6,.5,.15],color:'#00a7dd'});
    }
    for(let i=0;i<19;i++){
      const x=(i-9)*width/16;
      b.push({at:[x,-.275,width*.53],size:[.24,.025,.055],color:i%2?'#00dbff':accent});
      b.push({at:[x,-.285,-width*.48],size:[.17,.02,.38],color:'#b5deff'});
    }
    for(const side of [-1,1]){
      b.push({at:[side*(width*.54),-.2,0],size:[.06,.16,width+1.5],color:accent});
      for(let j=0;j<4;j++){
        const z=(j-1.5)*width*.22;
        b.push({at:[side*width*.56,.48,z],size:[.055,1.5,.055],color:'#092250'});
        b.push({at:[side*width*.56,1.22,z],size:[.26,.08,.17],color:'#00d9ff'});
        b.push({at:[side*width*.56,.07,z],size:[.22,.14,.22],color:accent});
      }
    }
    return b;
  },[width,theme,tier]);
  return <><Box at={[0,-.5,0]} size={[width+3,.4,width+3]} color={theme==='harbour'?'#003a75':theme==='garden'?'#043a37':'#11183e'}/><Instances blocks={blocks}/></>;
}
export function Ring({at=[0,0,0],radius=.5,color='#ffce00',rotation=[0,0,0]}:{at?:[number,number,number];radius?:number;color?:string;rotation?:[number,number,number]}) {
  return <mesh position={at} rotation={rotation}><torusGeometry args={[radius,.065,8,36]}/><meshStandardMaterial color={color} metalness={.4} roughness={.22} toneMapped={false} emissive={color} emissiveIntensity={.2}/></mesh>;
}
export function Handle({color='#00e4b9'}:{color?:string}){return <><Orb at={[0,.28,0]} radius={.21} color={color}/><Box at={[0,.02,0]} size={[.27,.3,.2]} color={color}/><Box at={[0,.02,.11]} size={[.28,.055,.035]} color="#142bbc"/><Orb at={[-.075,.31,.18]} radius={.038} color="#fff"/><Orb at={[.075,.31,.18]} radius={.038} color="#fff"/></>;}

export function Ripple({color='#00f2ff',reduced=false}:{color?:string;reduced?:boolean}){
  const mesh=useRef<Mesh>(null),age=useRef(0);
  useFrame((_,dt)=>{age.current+=dt;if(!mesh.current)return;const phase=reduced?.4:(age.current%2)/2;mesh.current.scale.setScalar(.3+phase*.9);(mesh.current.material as MeshStandardMaterial).opacity=.65*(1-phase);});
  return <mesh ref={mesh} rotation={[-Math.PI/2,0,0]} position={[0,.025,0]}><torusGeometry args={[.32,.015,6,28]}/><meshStandardMaterial color={color} transparent opacity={.5} emissive={color} emissiveIntensity={.4} depthWrite={false}/></mesh>;
}
