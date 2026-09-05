import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei/web/Html';
import { Color, Object3D, MathUtils } from 'three';
import type { Group, InstancedMesh, PerspectiveCamera, Mesh, MeshStandardMaterial } from 'three';
import { CityStage } from './kit/CityStage';

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
export const tones = ['#ee8ead', '#67d9ce', '#ddb860', '#9387e3', '#7eb567', '#e39466'];
export function Box({ at = [0,0,0], size = [1,1,1], color = '#65516f', metal = 0, glow = false }: { at?: [number,number,number]; size?: [number,number,number]; color?: string; metal?: number; glow?: boolean }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} metalness={metal} roughness={metal ? .35 : .82} emissive={glow ? color : '#000'} emissiveIntensity={glow ? .6 : 0}/></mesh>;
}
export function Orb({ at = [0,0,0], scale = [1,1,1], radius = .3, color = '#ffe4a0', glow = false }: { at?: [number,number,number]; scale?: [number,number,number]; radius?: number; color?: string; glow?: boolean }) {
  return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[radius,16,12]}/><meshStandardMaterial color={color} roughness={.45} emissive={glow ? color : '#000'} emissiveIntensity={glow ? .8 : 0}/></mesh>;
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
export function Instances({ blocks }: {blocks: {at:[number,number,number];size:[number,number,number];color:string}[]}) {
  const ref=useRef<InstancedMesh>(null);
  useLayoutEffect(()=>{if(!ref.current)return;const dummy=new Object3D();const color=new Color();blocks.forEach((b,i)=>{dummy.position.set(...b.at);dummy.scale.set(...b.size);dummy.updateMatrix();ref.current!.setMatrixAt(i,dummy.matrix);ref.current!.setColorAt(i,color.set(b.color));});ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();},[blocks]);
  return <instancedMesh ref={ref} args={[undefined,undefined,blocks.length]} castShadow receiveShadow><boxGeometry/><meshStandardMaterial roughness={.78}/></instancedMesh>;
}
function Camera({ width, board }: {width:number;board:boolean}) {
  const {camera,size}=useThree();
  useEffect(()=>{const cam=camera as PerspectiveCamera;const aspect=size.width/Math.max(1,size.height);const extent=Math.max(width/aspect,width*.8);const distance=extent*1.25;cam.position.set(0,board?distance*.93:3.2,board?distance*.74:distance);cam.lookAt(0,board?0:2.1,0);cam.fov=43;cam.updateProjectionMatrix();},[camera,size.width,size.height,width,board]);
  return null;
}
export function Stage({children,onError,reducedMotion,width=9,board=false,theme='city'}: {children:ReactNode;onError?:ActionSceneData['onError'];reducedMotion?:boolean;width?:number;board?:boolean;theme?:'city'|'garden'|'harbour'|'vault'|'fair'}) {
  const portal=useRef<HTMLDivElement>(null!);
  return <div style={{position:'relative',height:'100%'}}><CityStage onError={onError} reducedMotion={reducedMotion}><LabelPortal.Provider value={portal}><Camera width={width} board={board}/><color attach="background" args={[theme==='harbour'?'#122334':'#20192c']}/><fog attach="fog" args={['#20192c',24,55]}/><directionalLight position={[-5,5,4]} color="#afa3df" intensity={.65}/><Scenery width={width} theme={theme}/>{children}</LabelPortal.Provider></CityStage><div ref={portal} style={{position:'absolute',inset:0,pointerEvents:'none'}}/></div>;
}
function Scenery({width,theme}:{width:number;theme:string}) {
  const blocks=useMemo(()=>{
    const b:{at:[number,number,number];size:[number,number,number];color:string}[]=[];
    for(let i=0;i<9;i++){const x=(i-4)*width/7.5;const h=1.4+(i*7%5)*.38;const z=-width*.65;
      b.push({at:[x,h/2-.5,z],size:[width/9,h,1.05],color:theme==='garden'?'#33493f':['#524366','#6a4b65','#40516b'][i%3]});
      b.push({at:[x,h-.4,z],size:[width/8.5,.14,1.2],color:'#987b8e'});
      b.push({at:[x,h-.15,z-.2],size:[.15,.45,.18],color:'#513746'});
      b.push({at:[x,-.21,z+.61],size:[width/8.5,.12,1.3],color:'#9d8185'});
      for(let r=0;r<3;r++)for(let c=0;c<2;c++){
        b.push({at:[x+(c-.5)*.35,r*.45+.1,z+.54],size:[.2,.28,.04],color:'#bd9e94'});
        b.push({at:[x+(c-.5)*.35,r*.45+.1,z+.567],size:[.14,.22,.018],color:(i+r+c)%3?'#e6bc70':'#35435d'});
      }
    } return b;
  },[width,theme]);
  return <><Box at={[0,-.5,0]} size={[width+3,.4,width+3]} color={theme==='harbour'?'#173f50':theme==='garden'?'#354b3c':'#493749'}/><Instances blocks={blocks}/>{Array.from({length:9},(_,i)=><mesh key={i} position={[(i-4)*width/7.5,1.4+(i*7%5)*.38-.16,-width*.65]} rotation={[0,Math.PI/4,0]}><coneGeometry args={[width/10,.65,4]}/><meshStandardMaterial color={theme==='harbour'?'#646681':['#7e647e','#614d70','#6a597b'][i%3]} roughness={.8}/></mesh>)}{[-1,1].map(side=><group key={side} position={[side*(width*.5+.45),0,-width*.25]}><Box at={[0,.65,0]} size={[.06,1.5,.06]} color="#322b3d" metal={.6}/><Box at={[0,1.48,0]} size={[.25,.3,.25]} color="#ffd791" glow/><mesh position={[0,1.7,0]}><coneGeometry args={[.23,.2,4]}/><meshStandardMaterial color="#44394e"/></mesh></group>)}{theme==='garden'&&[-1,1].map(s=><group key={s} position={[s*width*.5,.1,-width*.52]}><Box at={[0,.75,0]} size={[.2,1.5,.2]} color="#775548"/><Orb at={[0,1.8,0]} radius={.75} scale={[1,1.3,1]} color="#668268"/><Orb at={[.5,1.6,0]} radius={.5} color="#7c986d"/></group>)}</>;
}
export function Ring({at=[0,0,0],radius=.5,color='#ffe3a0',rotation=[0,0,0]}:{at?:[number,number,number];radius?:number;color?:string;rotation?:[number,number,number]}) {
  return <mesh position={at} rotation={rotation}><torusGeometry args={[radius,.065,8,36]}/><meshStandardMaterial color={color} metalness={.65} roughness={.3} emissive={color} emissiveIntensity={.14}/></mesh>;
}
export function Handle({color='#7ed8c2'}:{color?:string}){return <><Orb at={[0,.28,0]} radius={.21} color={color}/><Box at={[0,.02,0]} size={[.27,.3,.2]} color={color}/><Orb at={[-.075,.31,.18]} radius={.038} color="#fff9df"/><Orb at={[.075,.31,.18]} radius={.038} color="#fff9df"/></>;}

export function Ripple({color='#9cdde5',reduced=false}:{color?:string;reduced?:boolean}){
  const mesh=useRef<Mesh>(null),age=useRef(0);
  useFrame((_,dt)=>{age.current+=dt;if(!mesh.current)return;const phase=reduced?.4:(age.current%2)/2;mesh.current.scale.setScalar(.3+phase*.9);(mesh.current.material as MeshStandardMaterial).opacity=.65*(1-phase);});
  return <mesh ref={mesh} rotation={[-Math.PI/2,0,0]} position={[0,.025,0]}><torusGeometry args={[.32,.015,6,28]}/><meshStandardMaterial color={color} transparent opacity={.5} emissive={color} emissiveIntensity={.4} depthWrite={false}/></mesh>;
}
