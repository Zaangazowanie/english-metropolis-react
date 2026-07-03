// Shared GLTFLoader with Draco worker decode + meshopt fallback.
// Decoder files are served locally from /vendor/draco (offline-first, like Abeto).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let _draco = null;
function dracoLoader() {
  if (_draco) return _draco;
  _draco = new DRACOLoader();
  _draco.setDecoderPath('public/vendor/draco/');  // draco_wasm_wrapper.js + draco_decoder.wasm
  _draco.setDecoderConfig({ type: 'wasm' });  // WASM decode in a worker — fast on low-end
  _draco.preload();                            // spin up worker pool early
  return _draco;
}

export function makeGLTFLoader(manager) {
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(dracoLoader());
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export function disposeLoaders() {
  _draco?.dispose();
  _draco = null;
}
