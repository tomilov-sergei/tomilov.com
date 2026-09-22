
import * as THREE from './vendor/build/three.module.js';
import {TourSpring} from './tour-spring.js';
import {CameraHandoff} from './camera-handoff.js';
import {GLTFLoader}    from './vendor/examples/jsm/loaders/GLTFLoader.js';
import {EXRLoader}     from './vendor/examples/jsm/loaders/EXRLoader.js';
import {OrbitControls} from './vendor/examples/jsm/controls/OrbitControls.js';
import {createReflectionTour, createTourCamera, worldToModel} from './tour-fidelity.js';
import {createAoTour, createScreenTour} from './material-fidelity.js';
import {WallpaperState} from './wallpaper-motion.js';
import {HingeState} from './hinge-motion.js';
import {tourLabels, tourState, sampleTour, mergeVariant} from './showcase-state.js';
import {createShowcaseScreens} from './showcase-screens.js';
import {createShowcaseMasks} from './showcase-masks.js';

const $ = s => document.querySelector(s);
const boot = $('#boot'), say = t => boot.textContent = t;
let failedAsset='';
THREE.DefaultLoadingManager.onError=url=>{failedAsset=url;console.error('Asset failed:',url);};

/* ═══════ константы, снятые со страницы Apple ═══════ */
const TEXTURE_SPACE_LOCATIONS = [
  [12.586,2167.96,641.917], [-18.6749,1999.97,645.12], [74.9038,835.745,5.85019],
  [7.06619,99.53625,-13.56189], [-2.8202,47.7888,-9.11627]];
const TEXTURE_SPACE_SIZES = [
  [1357.29,122e-6,868.359], [1274.72,1,625.511], [535.265,535.226,65.1626],
  [48.13627,25.78078,10.37156], [47.19929,46.9705,11.64885]];
const LUT_HEIGHTS = {sky:{c:6}, stars:{c:3}, hills:{c:3,f:9}, duneBack:{c:5}, duneFront:{c:9,f:9}};

// mesh/additive/depth/текстуры — ровно как в таблице пассов main.built.js.
// Текстуры адресуются id из wallpaper-shader-assets.lsd: оттуда же берутся
// colorSpace / wrap / filter / flipY, чтобы не угадывать.
const PASSES = [
  {key:'sky',      mesh:'Plane_001',          frag:'wallpaper_0_sky.frag.glsl',      additive:false, depth:false, noise:false,
   tex:{uColorRampLutTexture:'sky_color_ramp_lut', uWallpaperTexture:'sky_3k_cropped'}},
  {key:'stars',    mesh:'Plane_526',          frag:'wallpaper_1_stars.frag.glsl',    additive:true,  depth:false, noise:false,
   tex:{uColorRampLutTexture:'stars_color_ramp_lut'}},
  {key:'hills',    mesh:'Plane_006',          frag:'wallpaper_2_hills.frag.glsl',    additive:false, depth:true,  noise:true,
   tex:{uColorRampLutTexture:'hills_color_ramp_lut', uCurveFloatLutTexture:'hills_curve_float_lut',
        uHashTexture:'hash', uWallpaperTexture:'hills_5k_cropped'}},
  {key:'duneBack', mesh:'uvquickshade19_001', frag:'wallpaper_3_duneBack.frag.glsl', additive:false, depth:true,  noise:false,
   tex:{uColorRampLutTexture:'dune_far_color_ramp_lut', uWallpaperTexture:'dune_far_3k_cropped'}},
  {key:'duneFront',mesh:'attribdelete_cleanup',frag:'wallpaper_4_duneFront.frag.glsl',additive:false,depth:true,  noise:false,
   tex:{uColorRampLutTexture:'dune_close_color_ramp_lut', uCurveFloatLutTexture:'dune_close_curve_float_lut',
        uWallpaperTexture:'dune_close_3k_cropped'}},
];

const INNER_ASPECT = 0.703370787, OUTER_ASPECT = 0.687315634;
const INNER_PIXEL_SIZE = [1878, 2670], OUTER_PIXEL_SIZE = [1398, 2034];
const WP_NEAR = 10, WP_FAR = 3000;                    // NEAR/FAR из модуля камеры обоев
const NODE_ORDER = ['gyro','portrait','landscapeToPortrait','stateAB','stateABJump','camera'];
const ASPECT  = {inner: 1/INNER_ASPECT, outer: OUTER_ASPECT};
const IS_INNER= {inner: true, outer: false};

/* ───── риг камеры обоев, порт WallpaperCamera из main.built.js ───── */
const lerp1=(a,b,t)=>a+(b-a)*t;
const lerpN=(a,b,t)=>a.map((v,i)=>lerp1(v,b[i],t));

// p(): матрица поворота, порядок Rz · Ry · Rx (именно так собирает Lotus)
function rotMat(rad){
  const [sx,cx]=[Math.sin(rad[0]),Math.cos(rad[0])];
  const [sy,cy]=[Math.sin(rad[1]),Math.cos(rad[1])];
  const [sz,cz]=[Math.sin(rad[2]),Math.cos(rad[2])];
  const Rx=new THREE.Matrix4().set(1,0,0,0, 0,cx,-sx,0, 0,sx,cx,0, 0,0,0,1);
  const Ry=new THREE.Matrix4().set(cy,0,sy,0, 0,1,0,0, -sy,0,cy,0, 0,0,0,1);
  const Rz=new THREE.Matrix4().set(cz,-sz,0,0, sz,cz,0,0, 0,0,1,0, 0,0,0,1);
  return Rz.multiply(Ry).multiply(Rx);
}
// m(): матрица узла — поворот, затем scale, затем позиция
function nodeMat(n){
  const M=rotMat(n.rotationDeg.map(d=>d*Math.PI/180));
  M.scale(new THREE.Vector3(n.scale[0],n.scale[1],n.scale[2]));
  M.setPosition(n.translation[0],n.translation[1],n.translation[2]);
  return M;
}
// f(): цепочка узлов без gyro
function subMat(pose){
  return nodeMat(pose.nodes.portrait)
    .multiply(nodeMat(pose.nodes.landscapeToPortrait))
    .multiply(nodeMat(pose.nodes.stateAB))
    .multiply(nodeMat(pose.nodes.stateABJump))
    .multiply(nodeMat(pose.nodes.camera));
}
// v(): обнуляет Y-поворот у landscapeToPortrait
const zeroLtpYaw = p => ({...p, nodes:{...p.nodes,
  landscapeToPortrait:{...p.nodes.landscapeToPortrait,
    rotationDeg:[p.nodes.landscapeToPortrait.rotationDeg[0], 0, p.nodes.landscapeToPortrait.rotationDeg[2]]}}});
// g(): вариант для внешнего экрана
const outerVariant = p => ({...p, sensorZoom: p.sensorZoom/OUTER_ASPECT,
  sensorShift:[p.sensorShift[1]/(OUTER_ASPECT*INNER_ASPECT), -p.sensorShift[0]]});

class WallpaperCamera {
  constructor(poses, sceneType='inner'){
    const tr = sceneType==='outer' ? outerVariant : (x=>x);
    this.sceneType = sceneType;
    this.corners = {folded: zeroLtpYaw(tr(poses.innerFoldedLock)),
                    open:   zeroLtpYaw(tr(poses.innerLandscapeLockOpen))};
    this.foldedMatrix = subMat(this.corners.folded);
    this.openMatrix   = subMat(this.corners.open);
    this.subMatrix = new THREE.Matrix4();
    this.pose = null;
    this.update(1);
  }
  update(t){
    const A=this.corners.folded, B=this.corners.open, nodes={};
    for (const n of NODE_ORDER) nodes[n]={
      translation: lerpN(A.nodes[n].translation, B.nodes[n].translation, t),
      rotationDeg: lerpN(A.nodes[n].rotationDeg, B.nodes[n].rotationDeg, t),
      scale:       lerpN(A.nodes[n].scale,       B.nodes[n].scale,       t)};
    this.pose = {nodes,
      focalLength: lerp1(A.focalLength,B.focalLength,t),
      sensorSize:  lerp1(A.sensorSize, B.sensorSize, t),
      sensorZoom:  lerp1(A.sensorZoom, B.sensorZoom, t),
      sensorShift: lerpN(A.sensorShift,B.sensorShift,t)};
    // между опорными матрицами — slerp поворота и lerp позиции, как в оригинале
    const qA=new THREE.Quaternion().setFromRotationMatrix(this.foldedMatrix);
    const qB=new THREE.Quaternion().setFromRotationMatrix(this.openMatrix);
    const q =qA.clone().slerp(qB,t);
    const pA=new THREE.Vector3().setFromMatrixPosition(this.foldedMatrix);
    const pB=new THREE.Vector3().setFromMatrixPosition(this.openMatrix);
    this.subMatrix=new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(pA.lerp(pB,t));
    return this;
  }
  worldMatrix(){
    return nodeMat({...this.pose.nodes.gyro, rotationDeg:[0,0,0]}).multiply(this.subMatrix);
  }
  projectionMatrix(){
    const e=ASPECT[this.sceneType], isInner=IS_INNER[this.sceneType], i=this.pose;
    const s=2*i.focalLength/i.sensorSize*i.sensorZoom;
    const n=isInner? s/e : s;
    const o=isInner? s   : s*e;
    const c=isInner? [i.sensorShift[1], -i.sensorShift[0]] : i.sensorShift;
    return new THREE.Matrix4().set(
      n,0,-c[0],0,
      0,o,-c[1],0,
      0,0,(WP_FAR+WP_NEAR)/(WP_NEAR-WP_FAR), 2*WP_FAR*WP_NEAR/(WP_NEAR-WP_FAR),
      0,0,-1,0);
  }
}

const DUNE_ANCHORS = {
  duneClose:{fT:[4.1735,70.605,-10.886], fR:[0,0,0],       uT:[0,50,-13.433],     uR:[0,0,0]},
  duneFar:  {fT:[9.3029,127.15,-11.735], fR:[0,-1.6771,0], uT:[0,108.33,-13.433], uR:[0,0,0]},
};

/* ═══════ рендерер и основная сцена ═══════ */
const renderer = new THREE.WebGLRenderer({antialias:true,stencil:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbbbbbb);
const camera = new THREE.PerspectiveCamera(32, innerWidth/innerHeight, 0.05, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;        // сдвиг идёт по плоскости экрана, а не по «полу»
controls.panSpeed = 1.1;
controls.rotateSpeed = 0.9;
controls.zoomSpeed = 0.9;
controls.minDistance = 2;
controls.maxDistance = 400;
controls.mouseButtons = {LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN};
controls.touches    = {ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN};
// Shift на тачпаде переводит перетаскивание в сдвиг — правой кнопкой там неудобно
addEventListener('keydown', e=>{ if(e.key === 'Shift') controls.mouseButtons.LEFT = THREE.MOUSE.PAN; });
addEventListener('keyup',   e=>{ if(e.key === 'Shift') controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; });
addEventListener('blur',    ()=>{ controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; });
// горизонтальный скролл двумя пальцами — панорама (OrbitControls читает только deltaY)
renderer.domElement.addEventListener('wheel', e=>{
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
  e.preventDefault();
  const d = camera.position.distanceTo(controls.target);
  const k = d * 0.0016;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-e.deltaX * k);
  camera.position.add(right); controls.target.add(right);
}, {passive:false});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);});

/* ═══════ проход 1: сцена обоев в off-screen ═══════ */
const wpScene = new THREE.Scene();
// ASPECT.inner = 1/0.7034 = 1.4217 — это ЛАНДШАФТ (2670×1878), а не портрет.
// Подтверждается плашкой lockscreen_ui_inner: 2048×1441 = 1.4212.
// В портретном таргете расширение угла обзора «зумило» и по вертикали,
// из-за чего ландшафт наезжал, а не разъезжался горизонтально.
const wpCam   = new THREE.PerspectiveCamera(35, ASPECT.inner, 1, 6000);
const [RT_W, RT_H] = [INNER_PIXEL_SIZE[1], INNER_PIXEL_SIZE[0]];
const wpTarget = new THREE.WebGLRenderTarget(RT_W, RT_H, {samples:4});
wpTarget.texture.colorSpace = THREE.SRGBColorSpace;

const gltfLoader=new GLTFLoader(), exrLoader=new EXRLoader(), texLoader=new THREE.TextureLoader();
const txt = f => fetch('shaders/static/'+f).then(r=>{ if(!r.ok) throw new Error('нет файла '+f); return r.text(); });

/* Свойства текстур берём из wallpaper-shader-assets.lsd (id → colorSpace/wrap/filter/flipY).
   Числовые коды — константы three.js: 1000 Repeat, 1001 ClampToEdge, 1002 MirroredRepeat,
   1006 LinearFilter, 1003 NearestFilter. */
const WRAP = {1000:THREE.RepeatWrapping, 1001:THREE.ClampToEdgeWrapping, 1002:THREE.MirroredRepeatWrapping};
const FILT = {1003:THREE.NearestFilter, 1006:THREE.LinearFilter};
let ASSETS = null;                       // id → {file, props}
let flipLut = true;                      // EXR-LUT игнорируют texture.flipY — переворачиваем данные руками
const lutTextures = [];

async function loadAssetIndex(){
  const list = await (await fetch('wp-shader-assets.json')).json();
  ASSETS = {};
  for (const a of list) if (a.path) ASSETS[a.id] = {file:a.path.split('/').pop(), props:a.properties||{}};
}

function flipDataRows(tex){            // вертикальный переворот DataTexture на месте
  const {data, width, height} = tex.image;
  const stride = data.length / height, row = data.constructor.from? null : null;
  const tmp = new data.constructor(stride);
  for (let y=0; y<Math.floor(height/2); y++){
    const a=y*stride, b=(height-1-y)*stride;
    tmp.set(data.subarray(a,a+stride));
    data.copyWithin(a, b, b+stride);
    data.set(tmp, b);
  }
  tex.needsUpdate = true;
}

async function loadTex(id){
  const a = ASSETS[id];
  if (!a) throw new Error('нет ассета '+id);
  const isEXR = a.file.endsWith('.exr');
  const t = await (isEXR ? exrLoader.loadAsync('wp/'+a.file) : texLoader.loadAsync('wp/'+a.file));
  const p = a.props;
  t.colorSpace = p.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  t.wrapS = WRAP[p.wrapS] ?? THREE.ClampToEdgeWrapping;
  t.wrapT = WRAP[p.wrapT] ?? THREE.ClampToEdgeWrapping;
  t.minFilter = FILT[p.minFilter] ?? THREE.LinearFilter;
  t.magFilter = FILT[p.magFilter] ?? THREE.LinearFilter;
  t.generateMipmaps = p.generateMipmaps ?? false;
  if (p.flipY !== undefined) t.flipY = p.flipY;
  if (isEXR && id.includes('lut')){      // LUT-строки адресуются по индексу — важен порядок
    lutTextures.push(t);
    if (flipLut) flipDataRows(t);
  }
  t.needsUpdate = true;
  return t;
}

// uUnlockProgress / uDimmingAmount по умолчанию — те значения, которые Apple
// вшила в преамбулу константами: именно с ними картинка совпадает с сайтом
const wpUniforms = {
  uFoldProgress:{value:1}, uUnlockProgress:{value:0}, uDimmingAmount:{value:1},
  uGyro:{value:new THREE.Vector3()},
  uDuneFarMatrix:{value:new THREE.Matrix4()}, uDuneCloseMatrix:{value:new THREE.Matrix4()},
};
const vec3s = a => `vec3(${a.map(v=>Number.isInteger(v)?v.toFixed(1):String(v)).join(', ')})`;
const num   = v => Number.isInteger(v)? v.toFixed(1) : String(v);

async function buildWallpaper(){
  let [prelude, noise, vert] = await Promise.all([
    txt('wallpaper_prelude.glsl'), txt('wallpaper_noise.glsl'), txt('wallpaper_shared.vert.glsl')]);
  // В шипнутой преамбуле это вшитые const, а не uniform — поднимаем обратно, чтобы ими управлять
  prelude = prelude
    .replace(/^\s*const\s+float\s+uDimmingAmount\s*=[^;]*;/m,  'uniform float uDimmingAmount;')
    .replace(/^\s*const\s+float\s+uUnlockProgress\s*=[^;]*;/m, 'uniform float uUnlockProgress;')
    .replace(/^\s*const\s+vec3\s+uGyro\s*=[^;]*;/m,            'uniform vec3 uGyro;');

  // Lotus кладёт геометрию обоев под assetRoot с matrix = makeRotationX(PI/2).
  // Без этого поворота мировые позиции не совпадают с TEXTURE_SPACE_LOCATION,
  // и computeGeneratedTextureCoordinates() выдаёт мусор (чёрные «осколки»).
  const assetRoot = new THREE.Group();
  assetRoot.matrixAutoUpdate = false;
  assetRoot.matrix.makeRotationX(Math.PI/2);
  assetRoot.matrixWorldNeedsUpdate = true;
  assetRoot.add((await gltfLoader.loadAsync('models/wallpaper/scene-wallpaper.gltf')).scene);
  wpScene.add(assetRoot);

  let applied=0;
  for (let i=0;i<PASSES.length;i++){
    const p=PASSES[i];
    say(`обои: слой ${i+1}/5 — ${p.key}…`);
    const frag=await txt(p.frag), lut=LUT_HEIGHTS[p.key];
    const defines = {OBJECT_INDEX:i, COLOR_INDEX:'0.0',
      TEXTURE_SPACE_LOCATION: vec3s(TEXTURE_SPACE_LOCATIONS[i]),
      TEXTURE_SPACE_SIZE:     vec3s(TEXTURE_SPACE_SIZES[i]),
      COLOR_RAMP_LUT_HEIGHT:  num(lut.c)};
    if (lut.f!==undefined) defines.CURVE_FLOAT_LUT_HEIGHT = num(lut.f);

    const uniforms = Object.assign({}, wpUniforms);
    for (const [n,id] of Object.entries(p.tex)) uniforms[n]={value: await loadTex(id)};

    // transparent:false для всех — иначе three кидает sky/stars в прозрачную очередь
    // и они рисуются ПОСЛЕ холмов. Порядок задаём renderOrder 0..4.
    // Для additive three всё равно включит блендинг (NormalBlending+transparent:false → NoBlending).
    const mat = new THREE.ShaderMaterial({
      name:`Wallpaper:${p.key}`, defines, uniforms,
      vertexShader: prelude+'\n'+vert, fragmentShader: prelude+'\n'+(p.noise?noise:'')+'\n'+frag,
      depthTest:p.depth, depthWrite:p.depth,
      blending: p.additive? THREE.AdditiveBlending : THREE.NormalBlending,
      transparent: false});
    const mesh = wpScene.getObjectByName(p.mesh);
    if (mesh){ mesh.material=mat; mesh.renderOrder=i; mesh.frustumCulled=false; p.node=mesh; applied++; }
    else console.warn('меш слоя не найден:', p.mesh);
  }
  // переключатели видимости слоёв
  const box=$('#wpLayers');
  PASSES.forEach(p=>{
    if(!p.node) return;
    const l=document.createElement('label'); l.className='chk';
    l.innerHTML=`<input type="checkbox" checked> ${p.key}`;
    l.firstChild.onchange=e=>p.node.visible=e.target.checked;
    box.appendChild(l);
  });
  window.__wp = {scene:wpScene, cam:wpCam, uniforms:wpUniforms, passes:PASSES};
  return applied;
}

/* ═══════ проход 2: композит экрана настоящим ScreenUiPass ═══════ */
const quad = new THREE.PlaneGeometry(2,2);
const orthoCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
// таргет с мипами — BlurPass читает его через textureLod
function mipTarget(w,h){
  const t = new THREE.WebGLRenderTarget(w,h,{
    generateMipmaps:true, minFilter:THREE.LinearMipmapLinearFilter,
    magFilter:THREE.LinearFilter, depthBuffer:false});
  t.texture.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* screenCrop / uiFit — формулы Lotus один в один.
   Обои рендерятся ОДИН раз в ландшафтный таргет, а портретный внешний экран
   получает из него КРОП по горизонтали, а не растяжку. Именно растяжка
   сплющивала горы в закрытом виде. */
const WP_ASPECT = () => RT_W / RT_H;
function screenCrop(key){
  const t = ASPECT[key] / WP_ASPECT();
  return [Math.min(t,1), Math.min(1/t,1)];
}
const UI_FIT_K = 1.012;                       // константа v из uiFit()
function uiFit(plate, tw, th){
  const s = (tw/th) / (plate.image.width/plate.image.height);
  return [Math.max(s,1)*UI_FIT_K, Math.max(1/s,1)*UI_FIT_K];
}

async function makeScreenComposite(key, uiFile){
  const [v,f] = await Promise.all([txt('ScreenUiPass.vert.glsl'), txt('ScreenUiPass.frag.glsl')]);
  const [bv,bf] = await Promise.all([txt('BlurPass.vert.glsl'), txt('BlurPass.frag.glsl')]);
  const [fcom,fmap] = await Promise.all([txt('FramePass_common.glsl'), txt('FramePass_map.glsl')]);
  const crop = screenCrop(key);
  const w = Math.max(1, Math.round(RT_W*crop[0]));
  const h = Math.max(1, Math.round(RT_H*crop[1]));
  const target = mipTarget(w,h);
  // ScreenUiPass сам делает flipY() внутри шейдера (у Apple uiMap приходит render target'ом,
  // снизу вверх). Плюс материал экрана в чанке Wipe берёт 1.0 - vUv.y. Итого на UI
  // приходится два переворота, поэтому исходную картинку не переворачиваем.
  const ui = await texLoader.loadAsync('wp/'+uiFile);
  ui.colorSpace = THREE.SRGBColorSpace; ui.flipY = false;
  ui.wrapS = ui.wrapT = THREE.ClampToEdgeWrapping;
  ui.minFilter = ui.magFilter = THREE.LinearFilter; ui.generateMipmaps = false;
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, name:'ScreenUiPass',
    vertexShader:v, fragmentShader:f,
    // wallpaperUvScale — кроп из screenCrop(); uiUvScale — подгонка плашки из uiFit()
    uniforms:{ wallpaperMap:{value:wpTarget.texture}, uiMap:{value:ui},
               wallpaperUvScale:{value:new THREE.Vector2(crop[0], crop[1])},
               uiUvScale:{value:new THREE.Vector2(...uiFit(ui, w, h))} }});
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(quad, mat));

  // BlurPass — оригинальный шейдер Apple: бикубическая выборка по мип-уровню,
  // LOD = blurArea * maxBlur(8). Lotus гоняет его дважды пинг-понгом (A→B→A).
  const blurMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, name:'BlurPass',
    vertexShader:bv, fragmentShader:bf,
    uniforms:{ map:{value:null}, wipeAmount:{value:0}, wipePosition:{value:0},
               blurBounds:{value:new THREE.Vector2(-0.25, 1)} }});   // дефолт поля Wipe
  const blurScene = new THREE.Scene(); blurScene.add(new THREE.Mesh(quad, blurMat));

  // FramePass — отзумливает обратно на 1/0.9 и накладывает скруглённые углы
  // через sdRoundedBox. Без него зум 1.12 внутри чанка Wipe не компенсируется,
  // и элементы интерфейса у краёв обрезаются.
  // At the original target resolution, use the source pixel radius unchanged.
  const borderRadius = 110; // Original pixel radius at the original render-target size.
  const fcomScaled = fcom.replace('#define BORDER_RADIUS 110.0',
                                  `#define BORDER_RADIUS ${borderRadius.toFixed(3)}`);
  const frameMat = new THREE.MeshBasicMaterial({name:'FramePass', map:target.texture});
  frameMat.onBeforeCompile = (sh)=>{
    sh.uniforms.enableFraming = frameMat.userData.enableFraming;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', fcomScaled)
      .replace('#include <map_fragment>', fmap);
  };
  frameMat.userData.enableFraming = {value:true};
  frameMat.customProgramCacheKey = ()=>`framepass:${borderRadius}`;
  const frameScene = new THREE.Scene(); frameScene.add(new THREE.Mesh(quad, frameMat));

  return {key, scene:sc, target, mat, ui, blurMat, blurScene, frameMat, frameScene,
          frameA: mipTarget(w,h), frameB: mipTarget(w,h),
          uiScale: uiFit(ui, w, h)};
}
let innerComp=null, outerComp=null, uiOn=true;

/* ═══════ якоря дюн и объектив ═══════ */
function anchor(spec){
  const e=new THREE.Euler(...spec.uR.map(THREE.MathUtils.degToRad),'XYZ');
  const baked=new THREE.Matrix4().makeRotationFromEuler(e).setPosition(...spec.uT).invert();
  const tmp=new THREE.Euler(), out=new THREE.Matrix4();
  return f=>{
    const T=spec.fT.map((v,i)=>THREE.MathUtils.lerp(v,spec.uT[i],f));
    const R=spec.fR.map((v,i)=>THREE.MathUtils.degToRad(THREE.MathUtils.lerp(v,spec.uR[i],f)));
    tmp.set(R[0],R[1],R[2],'XYZ');
    return out.makeRotationFromEuler(tmp).setPosition(T[0],T[1],T[2]).multiply(baked);
  };
}
const duneCloseM=anchor(DUNE_ANCHORS.duneClose), duneFarM=anchor(DUNE_ANCHORS.duneFar);

const wallpaperState = new WallpaperState();
let wpRig = null;                    // WallpaperCamera
// Камера НЕ живёт под assetRoot: в Lotus она добавляется в privateScene напрямую,
// поэтому rotateX(90°) к ней не применяется. Её собственный разворот приходит из
// stateABJump (~88–90° по X) — он и направляет взгляд в повёрнутую сцену.
let rigInAssetSpace = false;         // тумблер оставлен для сравнения
const ASSET_ROT = new THREE.Matrix4().makeRotationX(Math.PI/2);

function updateWpCamera(f){
  if (!wpRig) return;
  wpRig.update(f);
  const world = wpRig.worldMatrix();
  if (rigInAssetSpace) world.premultiply(ASSET_ROT);   // камера в той же системе, что и assetRoot
  wpCam.matrixAutoUpdate = false;
  wpCam.matrix.copy(world);
  wpCam.matrixWorld.copy(world);
  wpCam.matrixWorldNeedsUpdate = false;
  wpCam.projectionMatrix.copy(wpRig.projectionMatrix());
  wpCam.projectionMatrixInverse.copy(wpCam.projectionMatrix).invert();
  if (wpTilt){                                          // ручная докрутка, по умолчанию 0
    wpCam.matrix.multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(wpTilt)));
    wpCam.matrixWorld.copy(wpCam.matrix);
  }
}

/* ═══════ материал экрана с проекцией обоев (компонент Wipe) ═══════
   Ключевая хитрость Apple: пока крышка складывается, UV берётся НЕ с меша,
   а проекцией луча взгляда на виртуальную плоскость (p0,p1,p2). Поэтому обои
   не «стелются» по гнущейся половине — они ждут раскрытия. Всё, что спроецировалось
   за пределы плоскости, гасит маска edges — отсюда тёмная половина.
   При раскрытии transitionToCameraRest = smoothstep(0.45, 1, fold) переводит
   выборку на обычные UV меша. Чанки взяты из бандла и вживляются так же,
   как это делает Lotus: заменой #include <emissivemap_fragment>. */
let wipeChunks = null;
async function loadWipeChunks(){
  const [vDecl,vBody,fDecl,fBody] = await Promise.all([
    txt('wallpaper_localspace.varyings.glsl'), txt('wallpaper_localspace.vert-chunk.glsl'),
    txt('wipe_transition.glsl'), txt('wipe_emissive_body.glsl')]);
  wipeChunks = {vDecl, vBody, fDecl, fBody};
}

// Авторские значения чанка Wipe, снятые прямо из манифеста сцены (.lsd).
// Именно они задают, где стоит виртуальная плоскость проекции и с какой стороны
// идёт затемнение. wipePosition у внутреннего и внешнего экранов противоположны —
// это не наша ошибка, так у Apple.
const WIPE_CFG = {
  inner:{ emissiveLocalPos:[0,0,0],     rotation:[-Math.PI/2,0,0], scale:1.9816, zoom:7.95,
          offset:0,    minShading:0, shadeBounds:[0.5,1], blurBounds:[0.45,1],
          cameraDarkness:0.95, wipePosition:1 },
  outer:{ emissiveLocalPos:[4.1,0.8,0], rotation:[-Math.PI/2,0,0], scale:0.9894, zoom:7.68,
          offset:0.24, minShading:0, shadeBounds:[0,1],   blurBounds:[0,0.9],
          cameraDarkness:0.95, wipePosition:0 },
};

function makeWipeMaterial(tex, cfg, sourceMaterial){
  const u = {
    modelMatrixInverse:{value:new THREE.Matrix4()},
    emissiveLocalPos:{value:new THREE.Vector3(...cfg.emissiveLocalPos)},
    rotation:{value:new THREE.Vector3(...cfg.rotation)},
    wipeAmount:{value:0}, wipePosition:{value:cfg.wipePosition},
    minShading:{value:cfg.minShading}, offset:{value:cfg.offset},
    scale:{value:cfg.scale}, brightness:{value:1},
    shadeBounds:{value:new THREE.Vector2(...cfg.shadeBounds)}, zoom:{value:cfg.zoom},
    transitionToCameraRest:{value:1},
    wallpaperUvScale:{value:new THREE.Vector2(1,1)},
    enableFraming:{value:true},
    cameraPos:{value:new THREE.Vector2(2035,127)}, cameraRadius:{value:83},
    cameraDarkness:{value:cfg.cameraDarkness}, maxViewingAngle:{value:90},
  };
  // Preserve the glTF clearcoat, roughness and AO maps. Lotus uses the same
  // standard KHR_materials_clearcoat path; the extra coat extension is ignored.
  const mat = sourceMaterial.clone();
  mat.emissiveMap = tex;
  mat.toneMapped = false;
  mat.defines = {...mat.defines, USE_UV:''};                       // чанк работает с vUv, как у Apple
  mat.onBeforeCompile = (sh)=>{
    Object.assign(sh.uniforms, u);
    sh.vertexShader = wipeChunks.vDecl + '\n' + sh.vertexShader
      // после скиннинга: transformed уже в локальном пространстве нужной половины
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + wipeChunks.vBody);
    sh.fragmentShader = wipeChunks.fDecl + '\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', wipeChunks.fBody);
  };
  mat.customProgramCacheKey = ()=>'wipe-screen';
  return {mat, u};
}

/* Product-tour exposure and the two explicit Environment groups.
   EnvironmentInterpolation groups are handled by tour-fidelity.js.
   AO variants and screen brightness are handled by material-fidelity.js. */
let tourLighting = null, reflectionTour = null, aoTour = null, updateScreenTour = null, updateTourCamera = null;
async function setupTourLighting(pmrem) {
  const read = async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`нет файла ${path}`);
    return response.json();
  };
  const [manifest, variants] = await Promise.all([
    read('scene_L_avif.lsd.json'), read('variants.lsd.json')]);
  const definitions = new Map(), environments = [];
  const visit = node => {
    for (const [name, definition] of Object.entries(node.materials || {}))
      definitions.set(name, definition);
    if (node.scripts?.Environment)
      environments.push({name:node.name, ...node.scripts.Environment});
    for (const child of node.children || []) visit(child);
  };
  manifest.children.forEach(visit);
  const states = tourLabels.map(name => {
    const state = mergeVariant(variants,name);
    if (!state) throw new Error(`нет состояния ${name}`);
    return state;
  });
  const envGroups = new Map();
  for (const definition of environments) {
    const source = await exrLoader.loadAsync(`wp/${definition.envMap}.exr`);
    source.mapping = THREE.EquirectangularReflectionMapping;
    const target = pmrem.fromEquirectangular(source);
    source.dispose();
    envGroups.set(definition.layer, {...definition, target});
  }
  const materials = new Set();
  phone.traverse(node => {
    if (node.isMesh) for (const material of [].concat(node.material)) materials.add(material);
  });
  const entries = [];
  for (const material of materials) {
    const definition = definitions.get(material.name);
    if (!definition) continue;
    const baseExposure = definition.chunks?.Exposure?.exposure ?? 0;
    const exposure = {value:baseExposure};
    const values = states.map(state => state[`${material.name}:Exposure`]?.exposure ?? baseExposure);
    if (definition.chunks?.Exposure || values.some(v => v !== 0)) {
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = function(shader, renderer) {
        previousCompile.call(this, shader, renderer);
        shader.uniforms.tourExposure = exposure;
        shader.fragmentShader = 'uniform float tourExposure;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>',
          'gl_FragColor.rgb *= exp2(tourExposure);\n#include <tonemapping_fragment>');
      };
      material.customProgramCacheKey = () => `${previousKey}:tour-exposure-v1`;
    }
    entries.push({material, exposure, values, environment:envGroups.get(definition.layer)});
  }
  aoTour = await createAoTour({renderer,phone,definitions,states});
  reflectionTour = await createReflectionTour({renderer,loader:gltfLoader,phone,definitions,pmrem});
  updateTourCamera = await createTourCamera(camera,controls,viewerFrame,poseRoot);
  return {
    update(fold, enabled) {

      for (const entry of entries) {
        entry.exposure.value = sampleTour(entry.values);
        const env = entry.environment;
        if (!env) continue;
        const values=states.map(state=>state[`${env.name}:Environment`]||{});
        const rotation=['X','Y','Z'].map((axis,i)=>sampleTour(values.map(v=>v[`envMapRotation${axis}`]??env.envMapRotation[i])));
        const texture = enabled ? env.target.texture : null;
        if (entry.material.envMap !== texture) {
          entry.material.envMap = texture;
          entry.material.needsUpdate = true;
        }
        entry.material.envMapRotation.setFromQuaternion(worldToModel.clone().multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))));
        entry.material.envMapIntensity = sampleTour(values.map(v=>v.envMapIntensity??env.envMapIntensity));
      }
    }
  };
}

/* ═══════ загрузка ═══════ */
const poseRoot=new THREE.Group();scene.add(poseRoot);
let showcaseScreens=null,showcaseMasks=null;
let phone=null, mixer=null, foldAction=null, foldClip=null, screens=[], envTex=null;

async function build(){
  say('индекс ассетов обоев…');
  await loadAssetIndex();
  say('риг камеры обоев…');
  wpRig = new WallpaperCamera(await (await fetch('poses.json')).json(), 'inner');
  const applied = await buildWallpaper();

  say('чанки Wipe…');
  await loadWipeChunks();
  say('композит экрана…');
  // размеры таргетов считает сам screenCrop() от ландшафтного таргета обоев
  innerComp = await makeScreenComposite('inner', 'lockscreen_ui_inner-wallpaper_png.avif');
  outerComp = await makeScreenComposite('outer', 'lockscreen_ui_outer-wallpaper_png.avif');

  say('телефон…');
  // The packed GLB has stale extension texture indices. Read the unmodified
  // source glTF and its original AVIF maps instead.
  const decoded = await (await fetch('reference/decoded/index.json')).json();
  const fallback = new Map(decoded.map(asset => [asset.original, new URL(`reference/decoded/${asset.file}`,document.baseURI).href]));
  const manager = new THREE.LoadingManager();
  let sourceFailure='';
  manager.onError=url=>{sourceFailure=url;};
  manager.addHandler(/\.png$/,new THREE.TextureLoader(manager));
  // Keep the on-disk glTF unchanged, but describe fallback bytes truthfully.
  // URL rewriting alone leaves the old AVIF URI/mimeType in the parser's cache.
  const modelResponse=await fetch('main_model.gltf');
  if(!modelResponse.ok)throw new Error('Не удалось загрузить main_model.gltf');
  const sourceModel=await modelResponse.json();
  for(const image of sourceModel.images){
    const replacement=fallback.get(image.uri);
    if(replacement){image.uri=replacement;image.mimeType='image/png';}
  }
  const sourceLoader = new GLTFLoader(manager).setResourcePath('model/');
  const g = await sourceLoader.parseAsync(sourceModel,'model/');
  if(sourceFailure) throw new Error(`Не удалось загрузить текстуру модели: ${sourceFailure}`);
  phone=g.scene; poseRoot.add(phone);
  mixer=new THREE.AnimationMixer(phone);
  foldClip=g.animations.find(a=>a.name==='Slider')||g.animations[0];
  foldAction=mixer.clipAction(foldClip); foldAction.play(); foldAction.paused=true;

  const wire=(node,comp,cfg)=>{ const m=phone.getObjectByName(node); if(!m){console.warn('экран не найден',node);return;}
    const w = makeWipeMaterial(comp.target.texture, cfg, m.material);
    comp.blurMat.uniforms.blurBounds.value.fromArray(cfg.blurBounds);
    comp.wipePosition = cfg.wipePosition;
    m.material = w.mat;
    screens.push({mesh:m, comp, wipe:w}); };
  wire('skeleton_0_3_screenTexture_geo',             innerComp, WIPE_CFG.inner);
  wire('skeleton_0_7_outerDisplayScreenTexture_geo', outerComp, WIPE_CFG.outer);

  updateScreenTour = await createScreenTour(screens);
  showcaseScreens = await createShowcaseScreens();

  say('окружение: IBL…');
  const pmrem=new THREE.PMREMGenerator(renderer);
  const exr=await exrLoader.loadAsync('wp/SfFEyQuyjAgUwjH.exr');
  exr.mapping=THREE.EquirectangularReflectionMapping;
  envTex=pmrem.fromEquirectangular(exr).texture;
  scene.environment=envTex;
  scene.environmentRotation=new THREE.Euler(1,0.6,0);   // envMapRotation из манифеста
  exr.dispose();
  tourLighting = await setupTourLighting(pmrem);
  // Retained for the dynamic reflection-card group.

  setupParts();
  showcaseMasks=await createShowcaseMasks(renderer,scene,phone);
  frameOn(phone);           // задаёт near/far по габаритам
  aimWallpaperCamera();
  resetAll();               // стартуем в исходном состоянии: свёрнутый, лицом к зрителю

  setFold(1/3);
  sceneReady=true; boot.hidden=true; $('#ui').hidden=false;
  $('#stat').textContent =
    `слоёв обоев   ${applied}/5\n`+
    `экранов       ${screens.length}\n`+
    `клип          ${foldClip.name} ${foldClip.duration.toFixed(2)}s\n`+
    `обои RT       ${RT_W}×${RT_H} (ландшафт)\n`+
    `внутр. экран  ${innerComp.target.width}×${innerComp.target.height}\n`+
    `внешн. экран  ${outerComp.target.width}×${outerComp.target.height}\n`+
    `частей        ${parts.length}\n`+
    `AO-материалов ${aoTour.count} (${aoTour.animatedCount} со смешиванием)`;
  window.__ready={applied, screens:screens.length};
}

function frameOn(obj){
  const size=new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  const extent=Math.max(size.x,size.y,size.z)||1;
  camera.near=extent/500; camera.far=extent*60;
  const direction=camera.position.clone().sub(controls.target).normalize();
  viewFrom(direction.toArray(),camera.up.toArray());
}

let wpTilt = 0;                       // ручная докрутка поверх рига, градусы
function aimWallpaperCamera(){
  // assetRoot с matrixAutoUpdate=false — без этого Box3 посчитается по старым матрицам
  wpScene.updateMatrixWorld(true);
  const full=new THREE.Box3().setFromObject(wpScene);
  window.__wpBox={min:full.min.toArray().map(v=>+v.toFixed(1)),
                  max:full.max.toArray().map(v=>+v.toFixed(1))};
}
const applyWpAim = () => updateWpCamera(wallpaperState.fold);

/* ═══════ взрыв-схема и режимы разбора ═══════ */
const EXPLODE_K = 6;                  // при разлёте 1.0 части отходят примерно на треть габарита
let explodeAmount = 0, explodeTarget=0, explodeVelocity=0, explodeLayout='layers';
const explodeSpring=new TourSpring({stiffness:36,damping:1});
const inspectionCamera=new CameraHandoff(camera,controls);
let inspectionDestination=null,inspectionTarget=null;
controls.addEventListener('start',()=>inspectionCamera.cancel());
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const parts = [];                     // {mesh, dir, base, origMat}
let skelHelper = null, boxHelpers = null;

// шахматка для показа UV-развёртки
function makeCheckerTexture(){
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), cell = n/16;
  for (let y=0;y<16;y++) for (let x=0;x<16;x++){
    g.fillStyle = ((x+y)&1) ? '#d8d8dd' : '#2b2b30';
    g.fillRect(x*cell, y*cell, cell, cell);
  }
  g.strokeStyle = '#0071e3'; g.lineWidth = 6; g.strokeRect(3,3,n-6,n-6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let checkerTex = null;

function setupParts(){
  const box = new THREE.Box3().setFromObject(phone);
  const centre = box.getCenter(new THREE.Vector3());
  const inv = new THREE.Matrix4();
  phone.traverse(o=>{
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return;
    // направление разлёта — от центра корпуса к центру детали, в системе родителя
    const dir = b.getCenter(new THREE.Vector3()).sub(centre);
    if (dir.lengthSq() < 1e-9) dir.set(0,1,0);
    dir.normalize();
    if (o.parent){ inv.copy(o.parent.matrixWorld).invert(); dir.transformDirection(inv); }
    // Keep attached skinning: detached mode applies parent pose transforms
    // twice (once through the bones and once through matrixWorld). For the
    // exploded view, cancel only the un-exploded world transform instead.
    if (o.isSkinnedMesh) {
      const updateWorld=o.updateMatrixWorld, base=o.position.clone(), neutral=new THREE.Matrix4();
      o.updateMatrixWorld=function(force){
        updateWorld.call(this,force);
        if(explodeAmount && this.parent){
          neutral.copy(this.matrix).setPosition(base).premultiply(this.parent.matrixWorld);
          this.bindMatrixInverse.copy(neutral).invert();
        }
      };
    }
    parts.push({mesh:o, dir, base:o.position.clone(), origMat:o.material});
  });
  window.__parts = parts.length;
}

function prepareLayerLayout(){
  phone.updateMatrixWorld(true);
  const inverse=new THREE.Matrix3();
  for(const p of parts){
    const inner=p.mesh.name==='skeleton_0_3_screenTexture_geo';
    const outer=p.mesh.name==='skeleton_0_7_outerDisplayScreenTexture_geo';
    const metal=(p.origMat.metalness||0)>.5;
    p.layer=inner?0:outer?3:metal?2:1;
    const world=p.mesh.getWorldPosition(new THREE.Vector3());
    const displacement=new THREE.Vector3((inner||outer)?0:Math.sign(world.x)*.8,[5,1.7,-1.8,-5][p.layer],0);
    inverse.setFromMatrix4(p.mesh.parent.matrixWorld).invert();
    p.layerDir=displacement.applyMatrix3(inverse);
  }
}
function applyExplode(){
  for(const p of parts){
    const delay=[0,.12,.22,.06][p.layer??0];
    const progress=THREE.MathUtils.smoothstep(explodeAmount,delay,1);
    p.mesh.position.copy(p.base).addScaledVector(explodeLayout==='layers'&&p.layerDir?p.layerDir:p.dir,
      explodeLayout==='layers'&&p.layerDir?progress:explodeAmount*EXPLODE_K);
  }
}
function inspectionView(){
  const from=camera.clone(),target=controls.target.clone(),previous=explodeAmount;
  explodeAmount=1;applyExplode();
  viewFrom([.55,.82,-.38],[0,0,-1]);
  inspectionDestination=camera.clone();inspectionTarget=controls.target.clone();
  explodeAmount=previous;applyExplode();phone.updateMatrixWorld(true);
  camera.copy(from);controls.target.copy(target);inspectionCamera.cancel();inspectionCamera.begin();
}
function requestExplode(value){
  explodeTarget=THREE.MathUtils.clamp(value,0,1);
  $('#explode').value=Math.round(explodeTarget*1000);
  $('#explodev').textContent=Math.round(explodeTarget*100)+'%';
}

const MODES = [
  ['none',   'как есть'],
  ['wire',   'каркас'],
  ['normals','нормали'],
  ['uv',     'UV-развёртка'],
  ['albedo', 'базовый цвет'],
  ['rough',  'шероховатость'],
  ['metal',  'металличность'],
  ['ao',     'AO-карта'],
  ['nmap',   'карта нормалей'],
  ['emissive','свечение'],
  ['env',    'только окружение (IBL)'],
];
const MAP_OF = {albedo:'map', rough:'roughnessMap', metal:'metalnessMap',
                ao:'aoMap', nmap:'normalMap', emissive:'emissiveMap'};
const debugMats = new Map();          // mesh → материал режима
let normalMat = null;

let debugMode='none';
function setMode(mode){
  debugMode=mode;
  if (mode === 'normals' && !normalMat) normalMat = new THREE.MeshNormalMaterial();
  if (mode === 'uv' && !checkerTex) checkerTex = makeCheckerTexture();
  let missing = 0, total = 0;

  for (const p of parts){
    const src = p.origMat;
    if (mode === 'none'){ p.mesh.material = src; continue; }
    if (mode === 'normals'){ p.mesh.material = normalMat; continue; }

    const key = p.mesh.uuid + ':' + mode;
    let m = debugMats.get(key);
    if (!m){
      if (mode === 'wire'){
        m = src.clone(); m.wireframe = true;
      } else if (mode === 'uv'){
        m = new THREE.MeshBasicMaterial({map: checkerTex});
      } else if (mode === 'env'){
        m = new THREE.MeshStandardMaterial({color:0xffffff,
          roughness: src.roughness ?? 0.25, metalness: src.metalness ?? 1.0});
      } else {
        const tex = src[MAP_OF[mode]] || null;
        m = new THREE.MeshBasicMaterial({map: tex, color: tex ? 0xffffff : 0x1b1b1f});
      }
      debugMats.set(key, m);
    }
    if (MAP_OF[mode]){ total++; if (!src[MAP_OF[mode]]) missing++; }
    p.mesh.material = m;
  }

  const info = $('#modeinfo');
  if (MAP_OF[mode]) info.textContent = `есть карта: ${total-missing} из ${total} мешей`;
  else if (mode === 'none') info.textContent = '';
  else info.textContent = `частей: ${parts.length}`;
}

function toggleSkeleton(on){
  if (on && !skelHelper){
    skelHelper = new THREE.SkeletonHelper(phone);
    skelHelper.material.linewidth = 2; scene.add(skelHelper);
  }
  if (skelHelper) skelHelper.visible = on;
}
function toggleBoxes(on){
  if (on && !boxHelpers){
    boxHelpers = new THREE.Group();
    for (const p of parts){
      const h = new THREE.Box3Helper(new THREE.Box3(), 0x0071e3);
      h.userData.src = p.mesh; boxHelpers.add(h);
    }
    scene.add(boxHelpers);
  }
  if (boxHelpers) boxHelpers.visible = on;
}
function updateBoxes(){
  if (!boxHelpers || !boxHelpers.visible) return;
  for (const h of boxHelpers.children) h.box.setFromObject(h.userData.src);
}

/* ═══════ управление ═══════ */
let fold=1, playing=false, cycling=false, dir=1, autorot=false, showRt=false;
// wipePosition — точка, от которой растёт размытие (в ней картинка резкая).
// У Apple дефолт поля 0, но ось X нашего экранного UV зеркальна относительно их,
// поэтому чёрная зона максимального блюра уезжала на неподвижную половину.
// Держим её на 1 — тогда размытие приходится на подвижную, как в оригинале.
let wpOn=true, blurOn=true, wipeAuto=true, wipeAmount=0, wipePosition=1, useWipe=true;
const foldEl=$('#fold');
const hingeState=new HingeState(0);
let hingeTarget=0,hingePointer=false,hingeClick=false;

// Драйвер из компонента Wipe (ветка portrait):
//   wipeAmount = clamp(1 - 2*|hinge - 0.5|, 0, 1) / 2
// то есть размытие максимально в середине складывания и исчезает на обоих концах.
function wipeFromFold(f){ return THREE.MathUtils.clamp(1 - 2*Math.abs(f - 0.5), 0, 1) / 2; }

const poseNames={PT_Landscape:'Альбом',PT_Portrait:'Портрет',PT_Closed:'Закрыт',PT_Laptop:'Ноутбук',PT_Tent:'Домиком',PT_Durability:'Корпус'};
function updatePoseUi(){
  for(const button of $('#showcase').children) button.setAttribute('aria-pressed',String(button.dataset.pose===(tourState.label||'')));
  $('#poseStatus').textContent=tourState.label ? poseNames[tourState.label]+(tourState.active || Math.abs(fold-tourState.fold)>1e-5?' · переход…':'') : 'Свободное раскрытие';
}
for(const [label,name] of [['','Вручную'],...Object.entries(poseNames)]){
  const button=document.createElement('button');button.className='chip';button.textContent=name;button.dataset.pose=label;
  button.onclick=()=>{
    playing=cycling=autorot=false;$('#tRot').checked=false;phone.rotation.set(0,0,0);
    if(!$('#tTourCamera').checked)updateTourCamera?.begin();
    $('#tTourCamera').checked=true;
    if(label){tourState.select(label);updatePoseUi();}else setFold(fold);
  };$('#showcase').appendChild(button);
}
function setFold(f,preservePose=false){
  if(!preservePose){tourState.setFold(f);hingeState.reset(f);hingeTarget=f;hingeClick=false;}
  updateTourCamera?.updateModel();
  fold=THREE.MathUtils.clamp(f,0,1);
  updatePoseUi();
  if(!hingePointer)foldEl.value=Math.round(fold*1000);
  $('#foldv').textContent=Math.round(fold*180)+'°';
  if(foldAction){ foldAction.paused=true; foldAction.time=fold*foldClip.duration; mixer.update(0); }
  tourLighting?.update(fold, $('#tIbl').checked);
  updateScreenTour?.(fold);
  if ($('#tTourCamera').checked) updateTourCamera?.(fold);
  if (wipeAuto){
    wipeAmount = wipeFromFold(fold);
    const el=$('#wipe'); if(el){ el.value=Math.round(wipeAmount*1000); $('#wipev').textContent=wipeAmount.toFixed(2); }
  }
}
foldEl.onpointerdown=()=>{hingePointer=true;};
window.addEventListener('pointerup',()=>{hingePointer=false;});
window.addEventListener('pointercancel',()=>{hingePointer=false;});
window.addEventListener('blur',()=>{hingePointer=false;});
foldEl.oninput=()=>{
  playing=cycling=false;hingeTarget=Number(foldEl.value)/1000;hingeClick=!hingePointer;
  if(tourState.label)tourState.setFold(fold);
};
$('#play').onclick=()=>{if(tourState.label)setFold(fold);cycling=false; playing=!playing; if(playing&&fold>=0.999) setFold(0); dir=1;};
$('#cyc').onclick =()=>{if(tourState.label)setFold(fold);playing=false; cycling=!cycling;};
const bind=(id,out,fn,scale=1000,dec=2)=>{const e=$(id);e.oninput=()=>{const v=e.value/scale;$(out).textContent=v.toFixed(dec);fn(v);};};
bind('#unlock','#unlockv',v=>wpUniforms.uUnlockProgress.value=v);
bind('#dim','#dimv',     v=>wpUniforms.uDimmingAmount.value=v);
bind('#gx','#gxv',       v=>wpUniforms.uGyro.value.x=v,10000,3);
bind('#gy','#gyv',       v=>wpUniforms.uGyro.value.y=v,10000,3);
$('#tilt').oninput = e => { wpTilt=+e.target.value; $('#tiltv').textContent=wpTilt; applyWpAim(); };
$('#tIbl').onchange=e=>{
  scene.environment = e.target.checked ? envTex : null;
  tourLighting?.update(fold, e.target.checked);
};
$('#tWp').onchange =e=>{ wpOn=e.target.checked;
  screens.forEach(s=>{ s.wipe.mat.color.set(wpOn?0x000000:0x101010);
                       s.wipe.mat.needsUpdate=true; });};
$('#tBlur').onchange=e=>blurOn=e.target.checked;
$('#tProj').onchange=e=>useWipe=e.target.checked;
$('#tWipeAuto').onchange=e=>{ wipeAuto=e.target.checked; setFold(fold); };
$('#wipe').oninput=e=>{ wipeAuto=false; $('#tWipeAuto').checked=false;
  wipeAmount=e.target.value/1000; $('#wipev').textContent=wipeAmount.toFixed(2); };
$('#wipePos').oninput=e=>{ wipePosition=e.target.value/1000;
  $('#wipePosv').textContent=wipePosition.toFixed(2); };
$('#tUi').onchange =e=>{ uiOn=e.target.checked; };
$('#tLut').onchange=e=>{ flipLut=e.target.checked; lutTextures.forEach(flipDataRows); };
$('#tRig').onchange=e=>{ rigInAssetSpace=e.target.checked; updateWpCamera(wallpaperState.fold); };
$('#tRt').onchange =e=>showRt=e.target.checked;
$('#tRot').onchange=e=>autorot=e.target.checked;
// взрыв-схема и режимы разбора
$('#explode').oninput = e => requestExplode(Number(e.target.value)/1000);
// режимы — списком кнопок, чтобы щёлкать по ним быстро
const modeBtns = new Map();
MODES.forEach(([v,label])=>{
  const b=document.createElement('button'); b.className='chip'; b.textContent=label;
  b.onclick=()=>{ setMode(v); modeBtns.forEach((el,k)=>el.setAttribute('aria-current', String(k===v))); };
  modeBtns.set(v,b); $('#modes').appendChild(b);
});
modeBtns.get('none').setAttribute('aria-current','true');

// ракурсы: подводим камеру по оси, сохраняя текущую дистанцию кадрирования
// Модель лежит плашмя: экран смотрит в +Y, верх экрана — в −Z.
// Поэтому оси подписаны по детали, а не по абстрактным «спереди/сзади».
const VIEWS = [
  ['экран',   [0, 1, 0], [0, 0,-1]],
  ['спинка',  [0,-1, 0], [0, 0, 1]],
  ['торец ↑', [0, 0,-1], [0, 1, 0]],
  ['торец ↓', [0, 0, 1], [0, 1, 0]],
  ['торец ←', [-1,0, 0], [0, 1, 0]],
  ['торец →', [1, 0, 0], [0, 1, 0]],
  ['¾',       [0.6, 0.72, -0.5], [0, 0,-1]],
];
function viewerFrame(){
  const mobile=innerWidth<720,left=mobile?0:410,top=mobile?155:70;
  return {left,top,width:Math.max(48,innerWidth-left),height:mobile?Math.max(120,innerHeight*.36):Math.max(160,innerHeight-125)};
}
function viewerViewport(){
  const {left,top,width,height}=viewerFrame();
  camera.setViewOffset(width,height,-left,-top,innerWidth,innerHeight);
  camera.updateProjectionMatrix();
  return width/height;
}
function viewFrom(v, up){
  phone.updateMatrixWorld(true);
  phone.traverse(node=>{if(node.isSkinnedMesh) node.computeBoundingBox();});
  const box=new THREE.Box3().setFromObject(phone), center=box.getCenter(new THREE.Vector3());
  const direction=new THREE.Vector3(...v).normalize();
  const right=new THREE.Vector3(...up).cross(direction).normalize();
  const vertical=direction.clone().cross(right).normalize();
  camera.zoom=1;
  const aspect=viewerViewport(), tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)), tanX=tanY*aspect;
  let distance=controls.minDistance;
  for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
    const point=new THREE.Vector3(x,y,z).sub(center);
    distance=Math.max(distance,point.dot(direction)+1.12*Math.max(
      Math.abs(point.dot(right))/tanX,Math.abs(point.dot(vertical))/tanY));
  }
  camera.up.copy(vertical);
  camera.position.copy(center).addScaledVector(direction,distance);
  controls.target.copy(center); controls.update();
}

VIEWS.forEach(([label,v,up])=>{
  const b=document.createElement('button'); b.className='chip'; b.textContent=label;
  b.onclick=()=>viewFrom(v,up); $('#views').appendChild(b);
});
{ const b=document.createElement('button'); b.className='chip'; b.textContent='вписать';
  b.onclick=()=>frameOn(phone); $('#views').appendChild(b); }
// Полный сброс: свёрнутый телефон, фронтальный взгляд на экран,
// все режимы разбора и входы шейдера — в исходные значения.
function resetAll(){
  updateTourCamera?.begin();
  updateTourCamera?.cancel();
  $('#tTourCamera').checked = true;
  playing = cycling = false;
  autorot = false; $('#tRot').checked = false;
  if (phone) phone.rotation.set(0,0,0);          // снимаем накопленный автоповорот

  explodeAmount = explodeTarget = explodeVelocity = 0;
  inspectionCamera.cancel();
  $('#explode').value = 0; $('#explodev').textContent = '0%';
  applyExplode();

  setMode('none');
  modeBtns.forEach((el,k)=>el.setAttribute('aria-current', String(k === 'none')));
  $('#tSkel').checked = false; toggleSkeleton(false);
  $('#tBox').checked  = false; toggleBoxes(false);

  // входы шейдера обоев — к значениям, вшитым Apple в преамбулу
  $('#unlock').value=0;    $('#unlockv').textContent='0.00'; wpUniforms.uUnlockProgress.value=0;
  $('#dim').value=1000;    $('#dimv').textContent='1.00';    wpUniforms.uDimmingAmount.value=1;
  $('#gx').value=0;        $('#gxv').textContent='0.000';    wpUniforms.uGyro.value.x=0;
  $('#gy').value=0;        $('#gyv').textContent='0.000';    wpUniforms.uGyro.value.y=0;
  $('#tilt').value=0;      $('#tiltv').textContent='0';      wpTilt=0;

  wipeAuto = true; $('#tWipeAuto').checked = true;
  showcaseScreens?.reset();
  wallpaperState.reset(0);
  setFold(0);                                     // исходное состояние — свёрнутый
  if ($('#tTourCamera').checked) updateTourCamera?.(fold);
  else viewFrom([0,1,0], [0,0,-1]);                    // и смотрим прямо на экран
}
$('#reset').onclick = ()=>{resetAll();selectChapter('motion');setFold(1/3);};
const releaseTourCamera = () => {
  updateTourCamera?.cancel();
  $('#tTourCamera').checked=false;
  // Keep the reserved inspector area when switching to OrbitControls.
  viewerViewport();
};
controls.addEventListener('start',releaseTourCamera);
$('#tTourCamera').onchange=e=>{if(e.target.checked){updateTourCamera?.begin();updateTourCamera?.(fold);}else releaseTourCamera();};
$('#views').addEventListener('click',releaseTourCamera,{capture:true});
addEventListener('resize',()=>{if($('#tTourCamera').checked) updateTourCamera?.(fold);else viewerViewport();});

// двойной клик — вернуть модель в центр, не трогая ракурс
renderer.domElement.addEventListener('dblclick', ()=>{
  const c=new THREE.Box3().setFromObject(phone).getCenter(new THREE.Vector3());
  const shift=c.clone().sub(controls.target);
  camera.position.add(shift); controls.target.copy(c); controls.update();
});
$('#tSkel').onchange = e => toggleSkeleton(e.target.checked);
$('#tBox').onchange  = e => toggleBoxes(e.target.checked);

/* превью прохода обоев — GPU-оверлей, без readback */
const ovScene=new THREE.Scene();
// Показываем проход обоев как есть, ДО композита: это отладочная врезка,
// поэтому по вертикали она ориентирована как сам render target, а не как экран.
const ovMesh=new THREE.Mesh(quad, new THREE.MeshBasicMaterial({
  map:wpTarget.texture, toneMapped:false}));
ovScene.add(ovMesh);
function drawRtOverlay(){
  if(!showRt) return;
  // setViewport/setScissor принимают CSS-пиксели: three сам умножит на pixelRatio
  const h=Math.round(Math.min(200,innerHeight*0.26)), w=Math.round(h*ASPECT.inner);
  const x=innerWidth-w-18, y=18;
  renderer.autoClear=false; renderer.setScissorTest(true);
  renderer.setViewport(x,y,w,h);
  renderer.setScissor (x,y,w,h);
  renderer.render(ovScene, orthoCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0,0,innerWidth,innerHeight);
  renderer.autoClear=true;
}

/* ═══════ кадр ═══════ */
const clock=new THREE.Clock();
let sceneReady = false;
let lastWallpaperKey = null, lastCompositeKey = null;
renderer.setAnimationLoop(()=>{
  const dt=clock.getDelta();
  if (!sceneReady) return;
  $('#play').textContent=playing?'Пауза':'Раскрыть ↗';
  $('#cyc').setAttribute('aria-pressed',String(cycling));
  if(explodeAmount!==explodeTarget || explodeVelocity!==0){
    const next=reduceMotion.matches?{value:explodeTarget,velocity:0}:explodeSpring.update(explodeAmount,explodeTarget,explodeVelocity,Math.min(dt,.1));
    explodeAmount=next.value;explodeVelocity=next.velocity;applyExplode();
  }
  if(inspectionCamera.active)inspectionCamera.apply(inspectionDestination,inspectionTarget,Math.min(dt,.1));
  const poseChanged=tourState.step(dt);
  hingeState.simulate(tourState.label?tourState.fold:hingeTarget,Boolean(tourState.label)||hingePointer||hingeClick);
  const hingePosition=THREE.MathUtils.clamp(hingeState.step(dt),0,1);
  if(hingeState.magnetEngaging || hingeState.near(true))hingeClick=false;
  if(poseChanged || Math.abs(hingePosition-fold)>1e-10){
    if(!tourState.label)tourState.setFold(hingePosition);
    setFold(hingePosition,true);
  }
  showcaseScreens.update(tourState.screenLabel,dt);
  if(playing||cycling){
    let f=fold+dir*dt*0.45;
    if(cycling){ if(f>1){f=1;dir=-1;} else if(f<0){f=0;dir=1;} }
    else if(f>=1){ f=1; playing=false; }
    setFold(f);
  }
  if(autorot&&phone) phone.rotation.y+=dt*0.25;

  reflectionTour?.update(fold, $('#tIbl').checked);
  aoTour?.update(fold);
  // Debug clones must follow updated maps, especially the recycled dynamic RT.
  for (const part of parts) {
    const material=part.mesh.material, source=part.origMat;
    if (material === source || !material.isMeshStandardMaterial) continue;
    if (Boolean(material.envMap) !== Boolean(source.envMap)) material.needsUpdate=true;
    material.envMap=source.envMap;
    material.envMapRotation.copy(source.envMapRotation);
    material.envMapIntensity=source.envMapIntensity;
    if (material.wireframe) material.aoMapIntensity=source.aoMapIntensity;
  }

  // Wallpaper motion has its own dead zone and spring, independent of Wipe.
  const wallpaperFold = wallpaperState.step(fold);
  const wallpaperKey = [wallpaperFold, wpTilt, rigInAssetSpace, flipLut,
    wpUniforms.uUnlockProgress.value, wpUniforms.uDimmingAmount.value,
    ...wpUniforms.uGyro.value.toArray(), ...PASSES.map(pass => pass.node?.visible)].join(':');
  const wallpaperChanged = wallpaperKey !== lastWallpaperKey;
  if (wallpaperChanged) {
    wpUniforms.uFoldProgress.value = wallpaperFold;
    wpUniforms.uDuneCloseMatrix.value.copy(duneCloseM(wallpaperFold));
    wpUniforms.uDuneFarMatrix.value.copy(duneFarM(wallpaperFold));
    updateWpCamera(wallpaperFold);
    renderer.setRenderTarget(wpTarget); renderer.render(wpScene, wpCam);
    lastWallpaperKey = wallpaperKey;
  }
  const compositeKey = [showcaseScreens.revision,fold, uiOn, blurOn, useWipe, wipeAuto, wipeAmount, wipePosition].join(':');
  if (wallpaperChanged || compositeKey !== lastCompositeKey) {
    // 2) композит экрана: обои + UI-плашка
    for (const c of [innerComp,outerComp]){
      if(!c) continue;
      c.mat.uniforms.uiMap.value = uiOn ? c.ui : null;
      c.mat.uniforms.uiUvScale.value.set(uiOn?c.uiScale[0]:0, uiOn?c.uiScale[1]:0);
      renderer.setRenderTarget(c.target); renderer.render(c.scene, orthoCam);
      // 2b) FramePass → A, затем BlurPass дважды пинг-понгом A→B→A. Порядок как в Lotus.
      const staticTexture=showcaseScreens.texture(c.key);
      c.frameMat.map = staticTexture ?? c.target.texture;
      c.frameMat.userData.enableFraming.value=!staticTexture;
      renderer.setRenderTarget(c.frameA); renderer.render(c.frameScene, orthoCam);
      const screenWipe = wipeAuto && c.key === 'inner'
        ? THREE.MathUtils.clamp(1.2 * (1 - fold), 0, 1) : wipeAmount;
      if (!staticTexture && blurOn && useWipe && screenWipe > 0.001){
        c.blurMat.uniforms.wipeAmount.value   = screenWipe;
        c.blurMat.uniforms.wipePosition.value = (c.wipePosition ?? wipePosition);
        c.blurMat.uniforms.map.value = c.frameA.texture;
        renderer.setRenderTarget(c.frameB); renderer.render(c.blurScene, orthoCam);
        c.blurMat.uniforms.map.value = c.frameB.texture;
        renderer.setRenderTarget(c.frameA); renderer.render(c.blurScene, orthoCam);
      }
      c.out = c.frameA.texture;
    }
    lastCompositeKey = compositeKey;
  }
  renderer.setRenderTarget(null);
  for (const s of screens){
    s.wipe.mat.emissiveMap = s.comp.out;
    s.wipe.mat.emissiveIntensity=showcaseScreens.intensity;
    s.wipe.u.enableFraming.value=!showcaseScreens.isStatic;
    s.wipe.u.modelMatrixInverse.value.copy(s.mesh.matrixWorld).invert();
    s.wipe.u.brightness.value = wpOn ? (showcaseScreens.isStatic ? 1 : (useWipe ? s.brightness : 1)) : 0;
    // Выключенная проекция = всегда UV меша и без затемнения: так видно «сырые» обои
    // Lotus uses the triangular pulse only for the portrait outer target.
    // The landscape inner target follows its Wipe variant: -1.2*hinge+1.2.
    s.wipe.u.wipeAmount.value = useWipe && !showcaseScreens.isStatic ? (wipeAuto && s.comp.key === 'inner'
      ? THREE.MathUtils.clamp(1.2 * (1 - fold), 0, 1) : wipeAmount) : 0;
    // smoothstep(0.45, 1, fold) — пока крышка не раскрыта, выборка идёт проекцией
    s.wipe.u.transitionToCameraRest.value =
      useWipe && !showcaseScreens.isStatic ? (s.comp.key === 'outer' ? THREE.MathUtils.smoothstep(fold, 0.45, 1) : 0) : 1;
  }
  // 3) основная сцена
  updateBoxes();
  if($('#tTourCamera').checked)updateTourCamera?.step(dt);
  else if(!inspectionCamera.active)controls.update();
  showcaseMasks.render(camera,debugMode==='none' && explodeAmount===0);
  drawRtOverlay();
});

const bb=o=>{const b=new THREE.Box3().setFromObject(o);return{size:b.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2))};};
window.__scene=()=>({cam:camera.position.toArray().map(v=>+v.toFixed(2)),
  target:controls.target.toArray().map(v=>+v.toFixed(2)),
  phone:phone?bb(phone):null, wpBox:window.__wpBox,
  screens:screens.map(s=>({name:s.mesh.name, hasMap:!!s.mesh.material.map}))});
window.__view=(x,y,z)=>{ camera.position.set(x,y,z); controls.target.set(0,0,0); controls.update(); };
window.__dbg=()=>({fold,playing,cycling,wpFov:+wpCam.fov.toFixed(2),
  frame:renderer.info.render.frame, tris:renderer.info.render.triangles});


const chapters={
 motion:['Движение с характером','Потяните ползунок. Шарнир догоняет движение и притягивается к краям, а обои меняют глубину и резкость.'],
 assembly:['Целое — из отдельных слоёв','Изображение экрана — отдельная поверхность. Отведите её от корпуса: под ней останется геометрия, которая ловит свет.'],
 light:['Металл рисует свет','Поверните модель и сравните режимы. Геометрия остаётся прежней, но без отражений и контактных теней предмет читается совсем иначе.']
};
function selectChapter(chapter){
  if(!sceneReady)return;
  playing=cycling=false;$('#cyc').setAttribute('aria-pressed','false');
  inspectionCamera.cancel();
  for(const button of document.querySelectorAll('[data-chapter]'))button.setAttribute('aria-pressed',String(button.dataset.chapter===chapter));
  for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==chapter;
  $('#chapterTitle').textContent=chapters[chapter][0];$('#chapterText').textContent=chapters[chapter][1];
  setMode('none');$('#explodedWire').setAttribute('aria-pressed','false');for(const b of document.querySelectorAll('[data-look]'))b.setAttribute('aria-pressed',String(b.dataset.look==='none'));
  explodeAmount=explodeTarget=explodeVelocity=0;applyExplode();requestExplode(0);
  if(chapter==='assembly'){
    setFold(1);releaseTourCamera();prepareLayerLayout();inspectionView();requestExplode(.8);
  }else{
    $('#tTourCamera').checked=true;setFold(chapter==='motion'?1/3:1);
    if(chapter==='light'){releaseTourCamera();viewFrom([.5,.85,-.3],[0,0,-1]);}
  }
}
for(const b of document.querySelectorAll('[data-chapter]'))b.onclick=()=>selectChapter(b.dataset.chapter);
for(const b of document.querySelectorAll('[data-look]'))b.onclick=()=>{
 setMode(b.dataset.look);for(const other of document.querySelectorAll('[data-look]'))other.setAttribute('aria-pressed',String(b===other));
};
for(const b of document.querySelectorAll('[data-layout]'))b.onclick=()=>{
 explodeLayout=b.dataset.layout;applyExplode();inspectionView();
 for(const other of document.querySelectorAll('[data-layout]'))other.setAttribute('aria-pressed',String(b===other));
};
$('#explodedWire').onclick=()=>{const on=$('#explodedWire').getAttribute('aria-pressed')!=='true';setMode(on?'wire':'none');$('#explodedWire').setAttribute('aria-pressed',String(on));};
$('#reframe').onclick=()=>{
 const chapter=document.querySelector('[data-chapter][aria-pressed="true"]').dataset.chapter;
 if(chapter==='assembly'){inspectionView();return;}
 if(chapter==='light'){viewFrom([.5,.85,-.3],[0,0,-1]);return;}
 updateTourCamera.begin();$('#tTourCamera').checked=true;updateTourCamera(fold);
};
$('#disassemble').onclick=()=>requestExplode(1);$('#assemble').onclick=()=>requestExplode(0);
const cycleClick=$('#cyc').onclick;$('#cyc').onclick=()=>{cycleClick();$('#cyc').setAttribute('aria-pressed',String(cycling));};

build().catch(e=>{ boot.hidden=true; const el=$('#err');
  el.textContent='Ошибка сборки:\n'+(e.message || failedAsset || 'не удалось декодировать ресурс'); el.style.display='block'; console.error(e); });
