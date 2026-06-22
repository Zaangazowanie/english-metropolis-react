// PROTOTYPE — hand-painted (Ghibli) texture maps on simple geometry + bold ink.
import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { useThree } from '@react-three/fiber'
import { TextureLoader, SRGBColorSpace, RepeatWrapping, DataTexture, RGBAFormat, LinearFilter } from 'three'
import { CityStage } from '../practice/shells3d/kit/CityStage'
import { InkOutline } from '../world/InkOutline'

const SOFT = (() => {
  const lv = [150, 188, 216, 236, 250]; const d = new Uint8Array(lv.length * 4)
  for (let i = 0; i < lv.length; i++) { d[i*4]=d[i*4+1]=d[i*4+2]=lv[i]; d[i*4+3]=255 }
  const t = new DataTexture(d, lv.length, 1, RGBAFormat); t.minFilter = t.magFilter = LinearFilter; t.needsUpdate = true; return t
})()
const tex = (url, rep) => { const t = new TextureLoader().load(url); t.colorSpace = SRGBColorSpace; t.anisotropy = 16; if (rep) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(rep[0], rep[1]) } return t }

function Building({ x, z, w, d, h, facade, roof }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h/2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshToonMaterial map={facade} gradientMap={SOFT} />
      </mesh>
      <mesh position={[0, h + 0.1, 0]} castShadow>
        <boxGeometry args={[w + 0.25, 0.2, d + 0.25]} />
        <meshToonMaterial color={roof} gradientMap={SOFT} />
      </mesh>
    </group>
  )
}

function Street() {
  const fac = useMemo(() => [tex('/tex/facade1.jpg'), tex('/tex/facade2.jpg')], [])
  const road = useMemo(() => tex('/tex/road.jpg', [1, 8]), [])
  const blds = []
  let zL = -16, zR = -16, i = 0
  while (zL < 16) { const w = 3.2 + (i%3)*0.5, h = 3.2 + (i*1.6%3.4); blds.push(<Building key={'L'+i} x={-5.0} z={zL+w/2} w={w} d={3.4} h={h} facade={fac[i%2]} roof={'#6b5a44'} />); zL += w + 0.12; i++ }
  i = 1
  while (zR < 16) { const w = 3.2 + (i%3)*0.5, h = 3.2 + (i*1.3%3.4); blds.push(<Building key={'R'+i} x={5.0} z={zR+w/2} w={w} d={3.4} h={h} facade={fac[(i+1)%2]} roof={'#6b5a44'} />); zR += w + 0.12; i++ }
  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.02,0]} receiveShadow><planeGeometry args={[60,60]} /><meshToonMaterial color="#9cb37a" gradientMap={SOFT} /></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0,0]} receiveShadow><planeGeometry args={[5,40]} /><meshToonMaterial map={road} gradientMap={SOFT} /></mesh>
      <mesh position={[-3.0,0.08,0]} receiveShadow><boxGeometry args={[1.3,0.16,40]} /><meshToonMaterial color="#cfcabd" gradientMap={SOFT} /></mesh>
      <mesh position={[3.0,0.08,0]} receiveShadow><boxGeometry args={[1.3,0.16,40]} /><meshToonMaterial color="#cfcabd" gradientMap={SOFT} /></mesh>
      {blds}
      <mesh position={[-2.4,1.4,-3]} castShadow><cylinderGeometry args={[0.06,0.06,2.8,8]} /><meshToonMaterial color="#5b6168" gradientMap={SOFT} /></mesh>
      <mesh position={[2.4,1.4,5]} castShadow><cylinderGeometry args={[0.06,0.06,2.8,8]} /><meshToonMaterial color="#5b6168" gradientMap={SOFT} /></mesh>
      <mesh position={[-2.3,0.35,2]} castShadow><coneGeometry args={[0.22,0.6,12]} /><meshToonMaterial color="#d8702e" gradientMap={SOFT} /></mesh>
    </group>
  )
}

function Sky() { const t = useMemo(() => tex('/tex/sky.jpg'), []); return <mesh position={[0, 12, -36]}><planeGeometry args={[150, 75]} /><meshBasicMaterial map={t} toneMapped={false} depthWrite={false} /></mesh> }
function Aim() { const { camera } = useThree(); camera.position.set(2.4, 2.0, 13); camera.lookAt(-0.5, 1.6, -3); return null }

function Scene() {
  return (
    <CityStage cameraPosition={[2.4, 2.0, 13]} cameraFov={46}>
      <hemisphereLight args={['#eaf4ff', '#aebb92', 0.95]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.5} color="#fff6e8" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-radius={4} shadow-camera-near={1} shadow-camera-far={60} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} shadow-bias={-0.0003} shadow-normalBias={0.5} />
      <Aim /><Sky /><Street /><InkOutline />
    </CityStage>
  )
}
createRoot(document.getElementById('root')).render(<StrictMode><Scene /></StrictMode>)
