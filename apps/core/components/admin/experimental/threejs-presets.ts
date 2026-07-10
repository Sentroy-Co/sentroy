/**
 * Three.js video editör preset sistemi.
 *
 * Mantık: kullanıcı sıfırdan sahne kurmak yerine hazır template seçer
 * ve yalnızca curated bir param listesini (renk, hız, vb.) tweak eder.
 * Geometri, materyal, ışık, kamera kurulumu — preset'in `build` fonksiyonu
 * içinde sabit. Bu hem "sınırsız özgürlük kullanıcının kafasını karıştırır"
 * problemini çözer hem de her preset'in tutarlı kalitede çıktı vermesini
 * garanti eder.
 *
 * Yeni preset eklemek için: yeni bir `Preset` objesi yaz, `PRESETS`
 * array'ine push et. `build` fonksiyonu THREE'yi argument olarak alır
 * (server-side bundle'a three girmesin diye lazy).
 */

import type * as THREE_NS from "three"

// ── Param schema ──────────────────────────────────────────────────────────

export type ParamValue = string | number | boolean

export type PresetParam =
  | {
      type: "color"
      key: string
      label: string
      default: string
    }
  | {
      type: "number"
      key: string
      label: string
      default: number
      min: number
      max: number
      step: number
    }
  | {
      type: "select"
      key: string
      label: string
      default: string
      options: Array<{ value: string; label: string }>
    }
  | {
      type: "boolean"
      key: string
      label: string
      default: boolean
    }

export interface PresetInstance {
  /** Animation tick — saniye cinsinden delta zaman. */
  update?: (dt: number) => void
  /**
   * Param değişikliğinde çağrılır. Rebuild gerekmiyorsa true döner.
   * False dönerse editor preset'i baştan rebuild eder.
   */
  apply?: (params: Record<string, ParamValue>) => boolean
  /**
   * Custom render hook — preset standart `renderer.render(scene, camera)`
   * yerine kendi pipeline'ını çağırmak isterse (örn. EffectComposer
   * postprocessing). Tanımlıysa editor renderOnce + animation tick
   * bunu kullanır. Yoksa default render çalışır.
   */
  render?: () => void
  /**
   * Renderer/canvas resize edildiğinde çağrılır — postprocessing
   * pipeline kullanan presetlerin composer.setSize() çağırması için.
   */
  resize?: (width: number, height: number) => void
  /** Resource cleanup — geometry/material/texture dispose, scene remove. */
  dispose: () => void
}

export interface PresetBuildContext {
  THREE: typeof THREE_NS
  scene: THREE_NS.Scene
  camera: THREE_NS.PerspectiveCamera
  renderer: THREE_NS.WebGLRenderer
  /** Her frame'de re-render tetiklemek için — preset asyncron asset
   *  yüklerse (örn. BufferGeometryLoader) hazır olunca bunu çağırır. */
  requestRender: () => void
}

export interface Preset {
  id: string
  name: string
  description: string
  /** Kategori kart grupları için — örn "Geometry", "Particles". */
  category: string
  /** Sidebar küçük thumbnail emoji veya kısa text. Görsel CSS ile çizilir. */
  badge: string
  params: PresetParam[]
  /** Default kamera position — preset onsuz kalmasın. */
  camera: {
    position: [number, number, number]
    lookAt: [number, number, number]
    fov?: number
  }
  /** Önerilen background color — record settings'in default'u olur. */
  background: string
  /** Builder. Async olabilir (model yükleyebilir). */
  build: (
    ctx: PresetBuildContext,
    params: Record<string, ParamValue>,
  ) => Promise<PresetInstance> | PresetInstance
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Param listesi → default değer haritası. */
export function defaultParams(preset: Preset): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}
  for (const p of preset.params) {
    out[p.key] = p.default
  }
  return out
}

// ── Wireframe head preset ─────────────────────────────────────────────────
// threejs.org webgl_materials_wireframe örneğinden uyarlandı:
// dual mesh — solda klasik MeshBasicMaterial wireframe, sağda custom edge
// shader. WaltHeadLo geometry threejs.org/examples'tan fetch edilir.

const WIREFRAME_HEAD_VERTEX = `
attribute vec3 center;
varying vec3 vCenter;
void main() {
  vCenter = center;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const WIREFRAME_HEAD_FRAGMENT = `
uniform float thickness;
uniform vec3 frontColor;
uniform vec3 backColor;
varying vec3 vCenter;
void main() {
  vec3 afwidth = fwidth( vCenter.xyz );
  vec3 edge3 = smoothstep( ( thickness - 1.0 ) * afwidth, thickness * afwidth, vCenter.xyz );
  float edge = 1.0 - min( min( edge3.x, edge3.y ), edge3.z );
  gl_FragColor.rgb = gl_FrontFacing ? frontColor : backColor;
  gl_FragColor.a = edge;
}
`

const WALT_HEAD_URL =
  "https://threejs.org/examples/models/json/WaltHeadLo_buffergeometry.json"

const wireframeHead: Preset = {
  id: "wireframe-head",
  name: "Wireframe Head",
  description:
    "Dual-mesh wireframe rendering — classic basic wireframe on the left, custom edge shader on the right. Adapted from the three.js webgl materials wireframe example.",
  category: "Geometry showcase",
  badge: "WH",
  background: "#0a0a0a",
  camera: { position: [0, 0, 200], lookAt: [0, 0, 0], fov: 40 },
  params: [
    {
      type: "color",
      key: "wireColor",
      label: "Wireframe color",
      default: "#e0e0ff",
    },
    {
      type: "color",
      key: "edgeFront",
      label: "Edge color (front)",
      default: "#e6e6ff",
    },
    {
      type: "color",
      key: "edgeBack",
      label: "Edge color (back)",
      default: "#666680",
    },
    {
      type: "number",
      key: "thickness",
      label: "Edge thickness",
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
    },
    {
      type: "number",
      key: "spacing",
      label: "Mesh spacing",
      default: 40,
      min: 20,
      max: 100,
      step: 1,
    },
    {
      type: "number",
      key: "rotationSpeed",
      label: "Rotation speed",
      default: 0.3,
      min: 0,
      max: 2,
      step: 0.05,
    },
  ],
  async build(ctx, params) {
    const { THREE, scene, requestRender } = ctx

    // Setup attribute helper — örnekle birebir aynı: her vertex bir
    // standart basis vector'a etiketlenir, fragment shader edge testi
    // bu attribute üstünden yapar.
    const setupAttributes = (geometry: THREE_NS.BufferGeometry) => {
      const vectors = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1),
      ]
      const position = geometry.attributes.position
      const centers = new Float32Array(position.count * 3)
      for (let i = 0, l = position.count; i < l; i++) {
        vectors[i % 3].toArray(centers, i * 3)
      }
      geometry.setAttribute(
        "center",
        new THREE.BufferAttribute(centers, 3),
      )
    }

    // Fallback geometry — fetch fail ederse subdivided icosahedron benzer
    // topolojik karmaşıklık verir, kullanıcı en azından bir şey görür.
    const buildFallback = () => {
      const geo = new THREE.IcosahedronGeometry(40, 4)
      geo.deleteAttribute("normal")
      geo.deleteAttribute("uv")
      setupAttributes(geo)
      return geo
    }

    let geometry: THREE_NS.BufferGeometry
    try {
      const loader = new THREE.BufferGeometryLoader()
      geometry = await new Promise<THREE_NS.BufferGeometry>(
        (resolve, reject) => {
          loader.load(
            WALT_HEAD_URL,
            (g) => resolve(g),
            undefined,
            (err) => reject(err),
          )
        },
      )
      geometry.deleteAttribute("normal")
      geometry.deleteAttribute("uv")
      setupAttributes(geometry)
    } catch {
      // CORS / network — fallback'e düş.
      geometry = buildFallback()
    }

    const wire = new THREE.MeshBasicMaterial({
      color: new THREE.Color(params.wireColor as string),
      wireframe: true,
    })
    const mesh1 = new THREE.Mesh(geometry, wire)

    const shader = new THREE.ShaderMaterial({
      uniforms: {
        thickness: { value: params.thickness as number },
        frontColor: {
          value: new THREE.Color(params.edgeFront as string),
        },
        backColor: { value: new THREE.Color(params.edgeBack as string) },
      },
      vertexShader: WIREFRAME_HEAD_VERTEX,
      fragmentShader: WIREFRAME_HEAD_FRAGMENT,
      side: THREE.DoubleSide,
      transparent: true,
      alphaToCoverage: true,
    })
    const mesh2 = new THREE.Mesh(geometry, shader)

    const applySpacing = (sp: number) => {
      mesh1.position.set(-sp, 0, 0)
      mesh2.position.set(sp, 0, 0)
    }
    applySpacing(params.spacing as number)

    scene.add(mesh1)
    scene.add(mesh2)
    requestRender()

    let rotSpeed = params.rotationSpeed as number

    return {
      update(dt) {
        if (rotSpeed === 0) return
        const d = rotSpeed * dt
        mesh1.rotation.y += d
        mesh2.rotation.y += d
      },
      apply(p) {
        wire.color.set(p.wireColor as string)
        shader.uniforms.thickness.value = p.thickness as number
        shader.uniforms.frontColor.value.set(p.edgeFront as string)
        shader.uniforms.backColor.value.set(p.edgeBack as string)
        applySpacing(p.spacing as number)
        rotSpeed = p.rotationSpeed as number
        return true
      },
      dispose() {
        scene.remove(mesh1)
        scene.remove(mesh2)
        geometry.dispose()
        wire.dispose()
        shader.dispose()
      },
    }
  },
}

// ── PBR sphere lineup preset ──────────────────────────────────────────────
// threejs.org webgl_materials_envmaps_exr / FastHDR örneğinden uyarlandı:
// 5 sphere transmission/standart kombinasyonlarıyla, scene'in environment
// map'i KTX2 (FastHDR) üzerinden yüklenir. Kullanıcı HDR seçer, exposure /
// fov / background blur sliders ile rendering tweak'ler. Sphere geometri
// ve material setupları sabit — tutarlı render için kontrol verilmez.

const HDR_OPTIONS = [
  {
    value: "https://cdn.needle.tools/static/hdris/ballroom_2k.pmrem.ktx2",
    label: "Ballroom",
  },
  {
    value:
      "https://cdn.needle.tools/static/hdris/brown_photostudio_02_2k.pmrem.ktx2",
    label: "Brown Photostudio",
  },
  {
    value: "https://cdn.needle.tools/static/hdris/cape_hill_2k.pmrem.ktx2",
    label: "Cape Hill",
  },
  {
    value: "https://cdn.needle.tools/static/hdris/cannon_2k.pmrem.ktx2",
    label: "Cannon",
  },
  {
    value: "https://cdn.needle.tools/static/hdris/metro_noord_2k.pmrem.ktx2",
    label: "Metro Noord",
  },
  {
    value:
      "https://cdn.needle.tools/static/hdris/the_sky_is_on_fire_2k.pmrem.ktx2",
    label: "The Sky Is on Fire",
  },
  {
    value:
      "https://cdn.needle.tools/static/hdris/studio_small_09_2k.pmrem.ktx2",
    label: "Studio Small 09",
  },
  {
    value:
      "https://cdn.needle.tools/static/hdris/wide_street_01_2k.pmrem.ktx2",
    label: "Wide Street 01",
  },
]

// Three sürümü ile sabit basis transcoder yolu — paket güncellenirse bu
// versiyon-pin de güncellenmeli (yoksa CDN 404 verir, transcoder fail
// eder ve sahne karanlık kalır). Three node_modules'undan okuyamıyoruz
// çünkü preset modülü server bundle'a değil client bundle'a giriyor.
const KTX2_TRANSCODER_PATH =
  "https://unpkg.com/three@0.184.0/examples/jsm/libs/basis/"

const pbrSpheres: Preset = {
  id: "pbr-spheres",
  name: "PBR Sphere Lineup",
  description:
    "Five spheres across the metalness/roughness/transmission grid, lit by an HDR environment map. Pick a studio or skybox to relight everything in one click.",
  category: "Lighting showcase",
  badge: "PBR",
  background: "#0a0a0a",
  camera: { position: [7, 0, 0], lookAt: [0, 0, 0], fov: 40 },
  params: [
    {
      type: "select",
      key: "environment",
      label: "Environment (HDR)",
      default: HDR_OPTIONS[0].value,
      options: HDR_OPTIONS,
    },
    {
      type: "number",
      key: "exposure",
      label: "Exposure",
      default: 1.0,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      type: "number",
      key: "bgBlur",
      label: "Background blur",
      default: 0,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "fov",
      label: "Field of view",
      default: 40,
      min: 10,
      max: 100,
      step: 1,
    },
    {
      type: "color",
      key: "brushedTint",
      label: "Brushed sphere tint",
      default: "#888888",
    },
    {
      type: "color",
      key: "diffuseTint",
      label: "Matte sphere tint",
      default: "#6ab440",
    },
    {
      type: "number",
      key: "rotationSpeed",
      label: "Camera orbit speed",
      default: 0.4,
      min: 0,
      max: 2,
      step: 0.05,
    },
  ],
  async build(ctx, params) {
    const { THREE, scene, camera, renderer, requestRender } = ctx

    // KTX2Loader dynamic import — bundle'a girmesin diye lazy. Preset
    // çağrılana kadar three/addons reach edilmez.
    const { KTX2Loader } = await import(
      "three/addons/loaders/KTX2Loader.js"
    )

    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = params.exposure as number
    scene.backgroundBlurriness = params.bgBlur as number

    const sphereGeo = new THREE.SphereGeometry(0.45, 64, 32)

    // Sphere 1 — glass-like transmission
    const matGlass = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness: 2.0,
      metalness: 0.0,
      roughness: 0.0,
    })
    const s1 = new THREE.Mesh(sphereGeo, matGlass)
    s1.position.z = 2

    // Sphere 2 — fully rough white plastic
    const matRough = new THREE.MeshStandardMaterial({
      metalness: 0.0,
      roughness: 1.0,
    })
    const s2 = new THREE.Mesh(sphereGeo, matRough)
    s2.position.z = 1

    // Sphere 3 — perfect chrome
    const matChrome = new THREE.MeshStandardMaterial({
      metalness: 1.0,
      roughness: 0.0,
    })
    const s3 = new THREE.Mesh(sphereGeo, matChrome)

    // Sphere 4 — brushed metal (tinted)
    const matBrushed = new THREE.MeshStandardMaterial({
      metalness: 1.0,
      roughness: 0.5,
      color: new THREE.Color(params.brushedTint as string),
    })
    const s4 = new THREE.Mesh(sphereGeo, matBrushed)
    s4.position.z = -1

    // Sphere 5 — soft diffuse colored
    const matDiffuse = new THREE.MeshStandardMaterial({
      metalness: 0.0,
      roughness: 0.0,
      color: new THREE.Color(params.diffuseTint as string),
    })
    const s5 = new THREE.Mesh(sphereGeo, matDiffuse)
    s5.position.z = -2

    const group = new THREE.Group()
    group.add(s1, s2, s3, s4, s5)
    scene.add(group)

    // Environment loader — KTX2'nin pre-mipmapped (PMREM) format'ı,
    // CubeUVReflectionMapping ile direkt scene.environment'a verilir.
    const loader = new KTX2Loader()
      .setTranscoderPath(KTX2_TRANSCODER_PATH)
      .detectSupport(renderer)

    let currentEnvUrl = params.environment as string
    let activeEnvTexture: THREE_NS.Texture | null = null

    const loadEnvironment = (url: string) => {
      currentEnvUrl = url
      loader.load(
        url,
        (texture) => {
          // Yeni texture geldi — eskisini dispose et, scene'e bağla.
          texture.mapping = THREE.CubeUVReflectionMapping
          if (activeEnvTexture) activeEnvTexture.dispose()
          activeEnvTexture = texture
          scene.environment = texture
          scene.background = texture
          requestRender()
        },
        undefined,
        () => {
          // Fail durumunda en azından bir hata feedback'i atmıyoruz —
          // sahne PMREM olmadan çok karanlık kalır ama editor sürmeli.
        },
      )
    }
    loadEnvironment(currentEnvUrl)

    // Kamera FOV'u preset.camera ile geldi, ama param ile override
    // edilebilir — initial apply.
    camera.fov = params.fov as number
    camera.updateProjectionMatrix()

    let rotSpeed = params.rotationSpeed as number
    // Kamera origin etrafında y eksenli orbit — başlangıç polar
    // koordinatları (radius, angle) saklanır, her tick angle += dt*speed.
    const radius = Math.hypot(camera.position.x, camera.position.z)
    let angle = Math.atan2(camera.position.z, camera.position.x)

    return {
      update(dt) {
        if (rotSpeed === 0) return
        angle += rotSpeed * dt
        camera.position.x = Math.cos(angle) * radius
        camera.position.z = Math.sin(angle) * radius
        camera.lookAt(0, 0, 0)
      },
      apply(p) {
        renderer.toneMappingExposure = p.exposure as number
        scene.backgroundBlurriness = p.bgBlur as number
        const newFov = p.fov as number
        if (camera.fov !== newFov) {
          camera.fov = newFov
          camera.updateProjectionMatrix()
        }
        matBrushed.color.set(p.brushedTint as string)
        matDiffuse.color.set(p.diffuseTint as string)
        rotSpeed = p.rotationSpeed as number
        const nextEnv = p.environment as string
        if (nextEnv !== currentEnvUrl) {
          loadEnvironment(nextEnv)
        }
        return true
      },
      dispose() {
        scene.environment = null
        scene.background = null
        scene.backgroundBlurriness = 0
        scene.remove(group)
        sphereGeo.dispose()
        matGlass.dispose()
        matRough.dispose()
        matChrome.dispose()
        matBrushed.dispose()
        matDiffuse.dispose()
        if (activeEnvTexture) {
          activeEnvTexture.dispose()
          activeEnvTexture = null
        }
        loader.dispose()
      },
    }
  },
}

// ── Lee Perry-Smith head preset ──────────────────────────────────────────
// threejs.org webgl_materials_normalmap örneğinden uyarlandı: Lee
// Perry-Smith'in klasik scanned head modeli (GLB) + diffuse / specular /
// normal texture'lar, MeshPhongMaterial üstünden render edilir.
// EffectComposer pipeline: RenderPass → BleachBypass → ColorCorrection
// → OutputPass → FXAA. Karakter özelleştirme için cilt/spec/shininess +
// 3 ayrı ışık + normal map toggle açıktır.

const LEE_BASE = "https://threejs.org/examples/models/gltf/LeePerrySmith"
const LEE_GLB = `${LEE_BASE}/LeePerrySmith.glb`
const LEE_DIFFUSE = `${LEE_BASE}/Map-COL.jpg`
const LEE_SPECULAR = `${LEE_BASE}/Map-SPEC.jpg`
const LEE_NORMAL = `${LEE_BASE}/Infinite-Level_02_Tangent_SmoothUV.jpg`

const leePerrySmithHead: Preset = {
  id: "lee-perry-smith-head",
  name: "Photoreal Head",
  description:
    "Lee Perry-Smith's photoscanned head model, lit by three independently tunable lights and rendered through a bleach-bypass / color-corrected / FXAA pipeline. Customize skin tone, lighting mood, and post-processing without touching geometry.",
  category: "Character",
  badge: "HD",
  background: "#494949",
  camera: { position: [0, 0, 12], lookAt: [0, 0, 0], fov: 27 },
  params: [
    // ── Material / character ────────────────────────────────────────
    {
      type: "color",
      key: "skinTint",
      label: "Skin tint",
      default: "#efefef",
    },
    {
      type: "color",
      key: "specularColor",
      label: "Specular highlight",
      default: "#222222",
    },
    {
      type: "number",
      key: "shininess",
      label: "Shininess",
      default: 35,
      min: 0,
      max: 200,
      step: 1,
    },
    {
      type: "boolean",
      key: "enableNormalMap",
      label: "Normal map",
      default: true,
    },
    {
      type: "number",
      key: "normalScale",
      label: "Normal scale",
      default: 1,
      min: 0,
      max: 2,
      step: 0.05,
    },
    // ── Lighting ────────────────────────────────────────────────────
    {
      type: "color",
      key: "ambientColor",
      label: "Ambient light",
      default: "#ffffff",
    },
    {
      type: "number",
      key: "ambientIntensity",
      label: "Ambient intensity",
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
    },
    {
      type: "color",
      key: "keyLightColor",
      label: "Key light",
      default: "#ffffff",
    },
    {
      type: "number",
      key: "keyLightIntensity",
      label: "Key light intensity",
      default: 3,
      min: 0,
      max: 10,
      step: 0.1,
    },
    {
      type: "color",
      key: "fillLightColor",
      label: "Fill light",
      default: "#ffffff",
    },
    {
      type: "number",
      key: "fillLightIntensity",
      label: "Fill light intensity",
      default: 30,
      min: 0,
      max: 80,
      step: 1,
    },
    // ── Post-processing ─────────────────────────────────────────────
    {
      type: "number",
      key: "bleach",
      label: "Bleach bypass",
      default: 0.2,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      type: "boolean",
      key: "fxaa",
      label: "FXAA antialiasing",
      default: true,
    },
    // ── Camera motion ───────────────────────────────────────────────
    {
      type: "number",
      key: "orbitSpeed",
      label: "Camera orbit speed",
      default: 0.25,
      min: 0,
      max: 2,
      step: 0.05,
    },
  ],
  async build(ctx, params) {
    const { THREE, scene, camera, renderer, requestRender } = ctx

    // Postprocessing modülleri parallel dynamic import — bundle'a
    // girmesinler, preset çağrılana kadar three/addons/* fetch edilmez.
    const [
      { GLTFLoader },
      { EffectComposer },
      { RenderPass },
      { ShaderPass },
      { OutputPass },
      { FXAAPass },
      { BleachBypassShader },
      { ColorCorrectionShader },
    ] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/ShaderPass.js"),
      import("three/addons/postprocessing/OutputPass.js"),
      import("three/addons/postprocessing/FXAAPass.js"),
      import("three/addons/shaders/BleachBypassShader.js"),
      import("three/addons/shaders/ColorCorrectionShader.js"),
    ])

    // ── Lights ─────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(
      new THREE.Color(params.ambientColor as string),
      params.ambientIntensity as number,
    )
    const keyLight = new THREE.DirectionalLight(
      new THREE.Color(params.keyLightColor as string),
      params.keyLightIntensity as number,
    )
    keyLight.position.set(1, -0.5, -1)
    const fillLight = new THREE.PointLight(
      new THREE.Color(params.fillLightColor as string),
      params.fillLightIntensity as number,
    )
    fillLight.position.set(0, 0, 6)
    scene.add(ambient, keyLight, fillLight)

    // ── Texture loading ────────────────────────────────────────────
    const textureLoader = new THREE.TextureLoader()
    textureLoader.crossOrigin = "anonymous"

    const diffuseMap = textureLoader.load(LEE_DIFFUSE, () => requestRender())
    diffuseMap.colorSpace = THREE.SRGBColorSpace
    const specularMap = textureLoader.load(LEE_SPECULAR, () => requestRender())
    specularMap.colorSpace = THREE.SRGBColorSpace
    const normalMap = textureLoader.load(LEE_NORMAL, () => requestRender())

    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(params.skinTint as string),
      specular: new THREE.Color(params.specularColor as string),
      shininess: params.shininess as number,
      map: diffuseMap,
      specularMap: specularMap,
      normalMap: (params.enableNormalMap as boolean) ? normalMap : null,
      normalScale: new THREE.Vector2(
        params.normalScale as number,
        params.normalScale as number,
      ),
    })

    // ── Mesh — async GLB load, sphere fallback ─────────────────────
    let mesh: THREE_NS.Mesh | null = null
    let fallbackGeo: THREE_NS.SphereGeometry | null = null
    try {
      const loader = new GLTFLoader()
      const gltf = await new Promise<{ scene: THREE_NS.Group }>(
        (resolve, reject) => {
          loader.load(
            LEE_GLB,
            (g) => resolve(g as unknown as { scene: THREE_NS.Group }),
            undefined,
            (err) => reject(err),
          )
        },
      )
      const head = gltf.scene.children[0] as THREE_NS.Mesh | undefined
      if (head?.geometry) {
        mesh = new THREE.Mesh(head.geometry, material)
        mesh.position.y = -0.5
        scene.add(mesh)
      } else {
        throw new Error("No geometry in GLB")
      }
    } catch {
      // Asset reach edilemezse fallback sphere — kullanıcı en azından
      // ışık + material kontrollerini test edebilir.
      fallbackGeo = new THREE.SphereGeometry(2, 64, 32)
      mesh = new THREE.Mesh(fallbackGeo, material)
      mesh.position.y = -0.5
      scene.add(mesh)
    }

    // ── Postprocessing pipeline ────────────────────────────────────
    renderer.autoClear = false
    const renderTarget = new THREE.WebGLRenderTarget(
      renderer.domElement.width,
      renderer.domElement.height,
      {
        type: THREE.HalfFloatType,
        depthTexture: new THREE.DepthTexture(1, 1),
      },
    )
    const composer = new EffectComposer(renderer, renderTarget)

    const renderPass = new RenderPass(scene, camera)
    const bleachPass = new ShaderPass(BleachBypassShader)
    const colorPass = new ShaderPass(ColorCorrectionShader)
    const outputPass = new OutputPass()
    const fxaaPass = new FXAAPass()

    bleachPass.uniforms["opacity"].value = params.bleach as number
    colorPass.uniforms["powRGB"].value.set(1.4, 1.45, 1.45)
    colorPass.uniforms["mulRGB"].value.set(1.1, 1.1, 1.1)
    fxaaPass.enabled = params.fxaa as boolean

    composer.addPass(renderPass)
    composer.addPass(bleachPass)
    composer.addPass(colorPass)
    composer.addPass(outputPass)
    composer.addPass(fxaaPass)

    // ── Camera orbit ───────────────────────────────────────────────
    let orbitSpeed = params.orbitSpeed as number
    const radius = Math.hypot(camera.position.x, camera.position.z) || 12
    let angle = Math.atan2(camera.position.x, camera.position.z) || 0

    requestRender()

    return {
      update(dt) {
        if (orbitSpeed === 0) return
        angle += orbitSpeed * dt
        camera.position.x = Math.sin(angle) * radius
        camera.position.z = Math.cos(angle) * radius
        camera.lookAt(0, 0, 0)
      },
      apply(p) {
        material.color.set(p.skinTint as string)
        material.specular.set(p.specularColor as string)
        material.shininess = p.shininess as number
        const useNormal = p.enableNormalMap as boolean
        if (!!material.normalMap !== useNormal) {
          material.normalMap = useNormal ? normalMap : null
          material.needsUpdate = true
        }
        const ns = p.normalScale as number
        material.normalScale.setScalar(ns)

        ambient.color.set(p.ambientColor as string)
        ambient.intensity = p.ambientIntensity as number
        keyLight.color.set(p.keyLightColor as string)
        keyLight.intensity = p.keyLightIntensity as number
        fillLight.color.set(p.fillLightColor as string)
        fillLight.intensity = p.fillLightIntensity as number

        bleachPass.uniforms["opacity"].value = p.bleach as number
        fxaaPass.enabled = p.fxaa as boolean

        orbitSpeed = p.orbitSpeed as number
        return true
      },
      render() {
        composer.render()
      },
      resize(width, height) {
        composer.setSize(width, height)
      },
      dispose() {
        if (mesh) scene.remove(mesh)
        scene.remove(ambient, keyLight, fillLight)
        material.dispose()
        diffuseMap.dispose()
        specularMap.dispose()
        normalMap.dispose()
        if (fallbackGeo) fallbackGeo.dispose()
        composer.dispose()
        renderTarget.dispose()
        renderer.autoClear = true
      },
    }
  },
}

// ── Cube panorama preset ─────────────────────────────────────────────────
// threejs.org webgl_panorama_cube örneğinden uyarlandı: 6-face atlas image
// crop edilip içe çevrilmiş bir BoxGeometry'nin face material array'ine
// verilir. Kamera box'ın merkezinde durur ve etrafına döner — izleyiciye
// 360° "ortamın içindeyim" hissi verir. Recording için yaw orbit hızı
// kontrol edilebilir.

const PANORAMA_OPTIONS = [
  {
    value: "https://threejs.org/examples/textures/cube/sun_temple_stripe.jpg",
    label: "Sun Temple (6-strip)",
  },
]

const cubePanorama: Preset = {
  id: "cube-panorama",
  name: "Cube Panorama",
  description:
    "Stand inside a 360° environment built from a 6-face cube atlas image. Pan with the auto-orbit, tilt the view, or change exposure for cinematic moods. Bring your own atlas URL if you want a custom location.",
  category: "Environment",
  badge: "360",
  background: "#000000",
  // Kamera box'ın iç merkezi — z=0.01 frustum near-plane sorununa karşı
  // hafif offset.
  camera: { position: [0, 0, 0.01], lookAt: [0, 0, -1], fov: 90 },
  params: [
    {
      type: "select",
      key: "atlas",
      label: "Panorama atlas",
      default: PANORAMA_OPTIONS[0].value,
      options: PANORAMA_OPTIONS,
    },
    {
      type: "number",
      key: "fov",
      label: "Field of view",
      default: 90,
      min: 30,
      max: 120,
      step: 1,
    },
    {
      type: "number",
      key: "yawSpeed",
      label: "Auto-pan speed",
      default: 0.15,
      min: -1,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "pitch",
      label: "Tilt (pitch)",
      default: 0,
      min: -1,
      max: 1,
      step: 0.01,
    },
    {
      type: "color",
      key: "tint",
      label: "Color tint",
      default: "#ffffff",
    },
    {
      type: "number",
      key: "exposure",
      label: "Exposure",
      default: 1,
      min: 0.2,
      max: 2,
      step: 0.01,
    },
  ],
  build(ctx, params) {
    const { THREE, scene, camera, renderer, requestRender } = ctx

    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = params.exposure as number

    // 6-face atlas crop helper — orijinal örnekle aynı: image yüklenince
    // her face image.height x image.height olarak ayrı canvas'a çizilir,
    // ardından texture.needsUpdate = true ile WebGL'e itilir.
    const textures: THREE_NS.Texture[] = []
    for (let i = 0; i < 6; i++) {
      textures.push(new THREE.Texture())
    }

    const tintMaterials: THREE_NS.MeshBasicMaterial[] = []
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: textures[i],
        color: new THREE.Color(params.tint as string),
      })
      tintMaterials.push(m)
    }

    let currentAtlas = params.atlas as string
    const loadAtlas = (url: string) => {
      currentAtlas = url
      const loader = new THREE.ImageLoader()
      loader.setCrossOrigin("anonymous")
      loader.load(
        url,
        (image) => {
          const tile = image.height
          for (let i = 0; i < 6; i++) {
            const canvas = document.createElement("canvas")
            const ctx2d = canvas.getContext("2d")
            if (!ctx2d) continue
            canvas.height = tile
            canvas.width = tile
            ctx2d.drawImage(image, tile * i, 0, tile, tile, 0, 0, tile, tile)
            textures[i].colorSpace = THREE.SRGBColorSpace
            textures[i].image = canvas
            textures[i].needsUpdate = true
          }
          requestRender()
        },
        undefined,
        () => {
          // Atlas fail — kullanıcı görsel feedback için boş kalmasın,
          // her face'i tint rengiyle dolu bırak.
        },
      )
    }
    loadAtlas(currentAtlas)

    // BoxGeometry'nin scale.z = -1 ile içe çevrilmesi — face'ler
    // dışarıdan değil içeriden görünür hale gelir.
    const skyGeo = new THREE.BoxGeometry(1, 1, 1)
    skyGeo.scale(1, 1, -1)
    const skyBox = new THREE.Mesh(skyGeo, tintMaterials)
    scene.add(skyBox)

    // Yön — kamera başlangıçta -z'ye bakar (preset.camera.lookAt).
    // Animasyon yaw eksenini doğrudan camera.rotation.y olarak yazar
    // (lookAt'i tekrar çağırmıyoruz — yoksa pitch override edilir).
    let yawSpeed = params.yawSpeed as number
    let yaw = 0
    let pitch = params.pitch as number
    camera.rotation.order = "YXZ"
    camera.rotation.set(pitch, yaw, 0)
    camera.fov = params.fov as number
    camera.updateProjectionMatrix()

    return {
      update(dt) {
        if (yawSpeed === 0) return
        yaw += yawSpeed * dt
        camera.rotation.set(pitch, yaw, 0)
      },
      apply(p) {
        const newFov = p.fov as number
        if (camera.fov !== newFov) {
          camera.fov = newFov
          camera.updateProjectionMatrix()
        }
        yawSpeed = p.yawSpeed as number
        const newPitch = p.pitch as number
        if (newPitch !== pitch) {
          pitch = newPitch
          camera.rotation.set(pitch, yaw, 0)
        }
        const tintColor = p.tint as string
        for (const m of tintMaterials) m.color.set(tintColor)
        renderer.toneMappingExposure = p.exposure as number
        const nextAtlas = p.atlas as string
        if (nextAtlas !== currentAtlas) loadAtlas(nextAtlas)
        return true
      },
      dispose() {
        scene.remove(skyBox)
        skyGeo.dispose()
        for (const m of tintMaterials) m.dispose()
        for (const t of textures) t.dispose()
        camera.rotation.set(0, 0, 0)
      },
    }
  },
}

// ── Equirectangular panorama preset ──────────────────────────────────────
// threejs.org webgl_panorama_equirectangular örneğinden uyarlandı: tek
// 2:1 panoramic image (genelde 360° photo) içe-flip edilmiş büyük bir
// sphere'in iç yüzeyine giydirilir. Kamera kürenin merkezindedir;
// yaw/pitch için spherical coords (phi/theta → xyz lookAt) kullanılır.
// Cube panorama'dan farklı asset format'ı (single JPG/HDR vs 6-strip
// atlas) ve farklı kamera matematiği — yine de aynı immersive amaç.

const EQUIRECT_OPTIONS = [
  {
    value: "https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg",
    label: "Iceland (Jón Ragnarsson)",
  },
]

const equirectPanorama: Preset = {
  id: "equirect-panorama",
  name: "360° Photo",
  description:
    "Stand at the center of an equirectangular (2:1) panorama wrapped onto a giant sphere. Pan with auto-orbit, tilt up or down, and dial in the FOV / exposure for a cinematic look. Best with HDRI-style 360° captures.",
  category: "Environment",
  badge: "EQ",
  background: "#000000",
  // Sphere radius 500 — kamera origin'de durur, near=1 / far=1100.
  camera: { position: [0, 0, 0], lookAt: [1, 0, 0], fov: 75 },
  params: [
    {
      type: "select",
      key: "image",
      label: "Panorama image",
      default: EQUIRECT_OPTIONS[0].value,
      options: EQUIRECT_OPTIONS,
    },
    {
      type: "number",
      key: "fov",
      label: "Field of view",
      default: 75,
      min: 10,
      max: 100,
      step: 1,
    },
    {
      type: "number",
      key: "yawSpeed",
      label: "Auto-pan speed",
      default: 0.1,
      min: -1,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "lat",
      label: "Initial tilt (lat)",
      default: 0,
      min: -85,
      max: 85,
      step: 1,
    },
    {
      type: "color",
      key: "tint",
      label: "Color tint",
      default: "#ffffff",
    },
    {
      type: "number",
      key: "exposure",
      label: "Exposure",
      default: 1,
      min: 0.2,
      max: 2,
      step: 0.01,
    },
  ],
  build(ctx, params) {
    const { THREE, scene, camera, renderer, requestRender } = ctx

    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = params.exposure as number

    // Sphere'i içe çevir — `geometry.scale(-1, 1, 1)` x ekseninde flip
    // edip face normal'larını içe gönderir, böylece kamera içerden bakar.
    const sphereGeo = new THREE.SphereGeometry(500, 60, 40)
    sphereGeo.scale(-1, 1, 1)

    const texture = new THREE.Texture()
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(params.tint as string),
    })

    const mesh = new THREE.Mesh(sphereGeo, material)
    scene.add(mesh)

    // ImageLoader üstünden (TextureLoader CORS friendly değildir bazı
    // browser/CDN kombinasyonlarında — Image elementini direkt yükleyip
    // texture.image'a atamak daha güvenilir).
    let currentImage = params.image as string
    const imageLoader = new THREE.ImageLoader()
    imageLoader.setCrossOrigin("anonymous")
    const loadImage = (url: string) => {
      currentImage = url
      imageLoader.load(
        url,
        (img) => {
          texture.image = img
          texture.colorSpace = THREE.SRGBColorSpace
          texture.needsUpdate = true
          requestRender()
        },
        undefined,
        () => {
          // Asset reach edilemezse mesh boş kalmaz — material rengi görünür.
        },
      )
    }
    loadImage(currentImage)

    // Spherical orientation state — orijinal örnekle aynı: lon (yaw),
    // lat (pitch). Animation'da lon += dt * speed, pitch sabit (lat).
    let lon = 0
    let lat = params.lat as number
    let yawSpeed = params.yawSpeed as number

    const applyLookAt = () => {
      const clampedLat = Math.max(-85, Math.min(85, lat))
      const phi = THREE.MathUtils.degToRad(90 - clampedLat)
      const theta = THREE.MathUtils.degToRad(lon)
      // 500 büyüklüğüne çekmek görsel sonuç değiştirmez (lookAt yön
      // vektörü ile çalışır), ama orijinal örnekle parite için aynı.
      const x = 500 * Math.sin(phi) * Math.cos(theta)
      const y = 500 * Math.cos(phi)
      const z = 500 * Math.sin(phi) * Math.sin(theta)
      camera.lookAt(x, y, z)
    }

    camera.fov = params.fov as number
    camera.updateProjectionMatrix()
    applyLookAt()

    return {
      update(dt) {
        if (yawSpeed === 0) return
        // Orijinal örnek "lon += 0.1" frame başına ekliyordu (60fps'te
        // 6 deg/s); biz dt-tabanlı ölçekledik, slider değeri de
        // 0.1 ≈ orijinal hız civarına denk gelsin diye 60× çarpmıyoruz —
        // 0.1 = ~5.7°/s, görsel olarak benzer.
        lon += yawSpeed * 60 * dt
        applyLookAt()
      },
      apply(p) {
        const newFov = p.fov as number
        if (camera.fov !== newFov) {
          camera.fov = newFov
          camera.updateProjectionMatrix()
        }
        const newLat = p.lat as number
        if (newLat !== lat) {
          lat = newLat
          applyLookAt()
        }
        yawSpeed = p.yawSpeed as number
        material.color.set(p.tint as string)
        renderer.toneMappingExposure = p.exposure as number
        const nextImage = p.image as string
        if (nextImage !== currentImage) loadImage(nextImage)
        return true
      },
      dispose() {
        scene.remove(mesh)
        sphereGeo.dispose()
        material.dispose()
        texture.dispose()
      },
    }
  },
}

// ── Particle figures preset ──────────────────────────────────────────────
// threejs.org webgl_points_dynamic örneğinden uyarlandı: male02 + female02
// OBJ modellerinin vertex bulutları çıkarılır, parent group'a 9 sahne
// kümelenir, her kümenin vertex'leri sırayla yere "düşer" → bekler →
// orijinal pozisyonlarına "yükselir" — sonsuz döngü. Composer pipeline:
// RenderPass → BloomPass → FilmPass → FocusShader → OutputPass.

const PARTICLES_MALE_OBJ =
  "https://threejs.org/examples/models/obj/male02/male02.obj"
const PARTICLES_FEMALE_OBJ =
  "https://threejs.org/examples/models/obj/female02/female02.obj"

interface ClonemeshEntry {
  mesh: THREE_NS.Points
  speed: number
}
interface AnimMeshEntry {
  mesh: THREE_NS.Points
  verticesDown: number
  verticesUp: number
  direction: number
  speed: number
  delay: number
  start: number
}

const particleFigures: Preset = {
  id: "particle-figures",
  name: "Particle Figures",
  description:
    "Male and female mesh point clouds drift, fall apart vertex-by-vertex, then reassemble — all while a parent group spins through bloom + film grain + focus blur post-processing. A cinematic intro vibe in one preset.",
  category: "Particles",
  badge: "PT",
  background: "#000104",
  camera: { position: [0, 700, 7000], lookAt: [0, 0, 0], fov: 20 },
  params: [
    {
      type: "number",
      key: "particleSize",
      label: "Particle size",
      default: 30,
      min: 5,
      max: 80,
      step: 1,
    },
    {
      type: "color",
      key: "accentColor",
      label: "Accent color",
      default: "#ff7744",
    },
    {
      type: "color",
      key: "background",
      label: "Background",
      default: "#000104",
    },
    {
      type: "number",
      key: "fogDensity",
      label: "Fog density",
      default: 0.0000675,
      min: 0,
      max: 0.0003,
      step: 0.0000025,
    },
    {
      type: "number",
      key: "bloomStrength",
      label: "Bloom strength",
      default: 0.75,
      min: 0,
      max: 3,
      step: 0.05,
    },
    {
      type: "number",
      key: "filmIntensity",
      label: "Film grain",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      type: "boolean",
      key: "focusEnabled",
      label: "Focus blur",
      default: true,
    },
    {
      type: "number",
      key: "spinSpeed",
      label: "Spin speed",
      default: 0.02,
      min: 0,
      max: 0.2,
      step: 0.005,
    },
    {
      type: "number",
      key: "animSpeed",
      label: "Animation speed",
      default: 1,
      min: 0.1,
      max: 3,
      step: 0.05,
    },
  ],
  async build(ctx, params) {
    const { THREE, scene, camera, renderer, requestRender } = ctx

    const [
      { OBJLoader },
      { EffectComposer },
      { RenderPass },
      { ShaderPass },
      { BloomPass },
      { FilmPass },
      { FocusShader },
      { OutputPass },
    ] = await Promise.all([
      import("three/addons/loaders/OBJLoader.js"),
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/ShaderPass.js"),
      import("three/addons/postprocessing/BloomPass.js"),
      import("three/addons/postprocessing/FilmPass.js"),
      import("three/addons/shaders/FocusShader.js"),
      import("three/addons/postprocessing/OutputPass.js"),
    ])

    // ── Scene fog + parent group ────────────────────────────────────
    scene.fog = new THREE.FogExp2(
      new THREE.Color(params.background as string).getHex(),
      params.fogDensity as number,
    )
    const parent = new THREE.Object3D()
    scene.add(parent)

    // Ground grid — orijinalde renderer.autoClear=false; biz autoClear'ı
    // composer pipeline'ı için zaten flip edeceğiz.
    const gridGeo = new THREE.PlaneGeometry(15000, 15000, 64, 64)
    const gridMat = new THREE.PointsMaterial({ color: 0xff0000, size: 10 })
    const grid = new THREE.Points(gridGeo, gridMat)
    grid.position.y = -400
    grid.rotation.x = -Math.PI / 2
    parent.add(grid)

    // ── OBJ → vertex buffer combiner ───────────────────────────────
    type LoadedObj = THREE_NS.Group
    const combineBuffer = (
      model: LoadedObj,
      bufferName: "position",
    ): THREE_NS.BufferAttribute => {
      let count = 0
      model.traverse((child) => {
        const m = child as THREE_NS.Mesh
        if ((m as unknown as { isMesh?: boolean }).isMesh) {
          const buf = m.geometry.attributes[bufferName]
          count += buf.array.length
        }
      })
      const combined = new Float32Array(count)
      let offset = 0
      model.traverse((child) => {
        const m = child as THREE_NS.Mesh
        if ((m as unknown as { isMesh?: boolean }).isMesh) {
          const buf = m.geometry.attributes[bufferName]
          combined.set(buf.array as Float32Array, offset)
          offset += buf.array.length
        }
      })
      return new THREE.BufferAttribute(combined, 3)
    }

    const animMeshes: AnimMeshEntry[] = []
    const cloneMeshes: ClonemeshEntry[] = []
    const allMaterials: THREE_NS.PointsMaterial[] = []
    const allGeometries: THREE_NS.BufferGeometry[] = []

    // Her figür 8 clone yapar — son clone accent renkte, diğer 7 dim.
    const CLONE_OFFSETS: Array<[number, number, number]> = [
      [6000, 0, -4000],
      [5000, 0, 0],
      [1000, 0, 5000],
      [1000, 0, -5000],
      [4000, 0, 2000],
      [-4000, 0, 1000],
      [-5000, 0, -5000],
      [0, 0, 0],
    ]

    let currentSize = params.particleSize as number
    let currentAccent = new THREE.Color(params.accentColor as string)

    const createFigure = (
      positions: THREE_NS.BufferAttribute,
      scale: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", positions.clone())
      geometry.setAttribute("initialPosition", positions.clone())
      ;(
        geometry.attributes.position as THREE_NS.BufferAttribute
      ).setUsage(THREE.DynamicDrawUsage)
      allGeometries.push(geometry)

      let lastMesh: THREE_NS.Points | null = null
      for (let i = 0; i < CLONE_OFFSETS.length; i++) {
        const isAccent = i === CLONE_OFFSETS.length - 1
        const color = isAccent ? currentAccent.clone() : new THREE.Color(0x252525)
        const mat = new THREE.PointsMaterial({ size: currentSize, color })
        ;(mat as unknown as { __isAccent?: boolean }).__isAccent = isAccent
        allMaterials.push(mat)

        const mesh = new THREE.Points(geometry, mat)
        mesh.scale.setScalar(scale)
        mesh.position.set(
          x + CLONE_OFFSETS[i][0],
          y + CLONE_OFFSETS[i][1],
          z + CLONE_OFFSETS[i][2],
        )
        parent.add(mesh)
        cloneMeshes.push({ mesh, speed: 0.5 + Math.random() })
        lastMesh = mesh
      }
      // Animation state — son mesh'in vertex'leri animate edilir; tüm
      // clone'lar geometry paylaştığı için tek state hepsini etkiler.
      if (lastMesh) {
        animMeshes.push({
          mesh: lastMesh,
          verticesDown: 0,
          verticesUp: 0,
          direction: 0,
          speed: 15,
          delay: Math.floor(200 + 200 * Math.random()),
          start: Math.floor(100 + 200 * Math.random()),
        })
      }
    }

    // ── Async OBJ load — paralelle 2 model fetch ───────────────────
    const loader = new OBJLoader()
    loader.crossOrigin = "anonymous"
    const loadObj = (url: string) =>
      new Promise<LoadedObj>((resolve, reject) => {
        loader.load(url, (obj) => resolve(obj), undefined, (err) =>
          reject(err),
        )
      })

    try {
      const [maleObj, femaleObj] = await Promise.all([
        loadObj(PARTICLES_MALE_OBJ),
        loadObj(PARTICLES_FEMALE_OBJ),
      ])
      const malePos = combineBuffer(maleObj, "position")
      const femalePos = combineBuffer(femaleObj, "position")

      // Orijinal layout — her figürün konumu örnekten birebir.
      createFigure(malePos, 4.05, -500, -350, 600)
      createFigure(malePos, 4.05, 500, -350, 0)
      createFigure(malePos, 4.05, -250, -350, 1500)
      createFigure(malePos, 4.05, -250, -350, -1500)

      createFigure(femalePos, 4.05, -1000, -350, 0)
      createFigure(femalePos, 4.05, 0, -350, 0)
      createFigure(femalePos, 4.05, 1000, -350, 400)
      createFigure(femalePos, 4.05, 250, -350, 1500)
      createFigure(femalePos, 4.05, 250, -350, 2500)
    } catch {
      // Asset reach edilemezse en azından grid + boş sahne — kullanıcı
      // composer/bloom/film toggle'larını yine test edebilir.
    }

    requestRender()

    // ── Postprocessing ─────────────────────────────────────────────
    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false

    const renderPass = new RenderPass(scene, camera)
    const bloomPass = new BloomPass(params.bloomStrength as number)
    const filmPass = new FilmPass(params.filmIntensity as number)
    const focusPass = new ShaderPass(FocusShader)
    const outputPass = new OutputPass()

    // Three pass type'larında `uniforms` Record<string, IUniform> olarak
    // export edilmiyor — cast'le erişim yapıyoruz.
    type UniformBag = Record<string, { value: unknown }>
    const filmUniforms = filmPass.uniforms as unknown as UniformBag
    const focusUniforms = focusPass.uniforms as unknown as UniformBag
    // BloomPass strength uniform'u `combineUniforms.strength`'ta yaşar.
    const bloomCombine = (
      bloomPass as unknown as { combineUniforms: UniformBag }
    ).combineUniforms

    const setFocusSize = (w: number, h: number) => {
      const dpr = renderer.getPixelRatio()
      focusUniforms["screenWidth"].value = w * dpr
      focusUniforms["screenHeight"].value = h * dpr
    }
    setFocusSize(renderer.domElement.width, renderer.domElement.height)
    focusPass.enabled = params.focusEnabled as boolean

    const composer = new EffectComposer(renderer)
    composer.addPass(renderPass)
    composer.addPass(bloomPass)
    composer.addPass(filmPass)
    composer.addPass(focusPass)
    composer.addPass(outputPass)

    let spinSpeed = params.spinSpeed as number
    let animSpeed = params.animSpeed as number

    return {
      update(dt) {
        // Orijinal: `delta = 10 * timer.getDelta()` cap 2. Bizim dt
        // saniye, aynı pattern'i koruyup user-controlled hız ile çarp.
        const delta = Math.min(2, 10 * dt * animSpeed)
        parent.rotation.y -= spinSpeed * delta
        for (const cm of cloneMeshes) {
          cm.mesh.rotation.y -= 0.1 * delta * cm.speed
        }
        for (const data of animMeshes) {
          const positions = data.mesh.geometry.attributes
            .position as THREE_NS.BufferAttribute
          const initial = data.mesh.geometry.attributes
            .initialPosition as THREE_NS.BufferAttribute
          const count = positions.count
          if (data.start > 0) {
            data.start -= 1
          } else if (data.direction === 0) {
            data.direction = -1
          }

          for (let i = 0; i < count; i++) {
            const px = positions.getX(i)
            const py = positions.getY(i)
            const pz = positions.getZ(i)

            // Falling down — Y > 0 iken yere doğru random walk.
            if (data.direction < 0) {
              if (py > 0) {
                positions.setXYZ(
                  i,
                  px + 1.5 * (0.5 - Math.random()) * data.speed * delta,
                  py + 3.0 * (0.25 - Math.random()) * data.speed * delta,
                  pz + 1.5 * (0.5 - Math.random()) * data.speed * delta,
                )
              } else {
                data.verticesDown += 1
              }
            }

            // Rising up — initial pozisyona doğru asymptotic geri çağırma.
            if (data.direction > 0) {
              const ix = initial.getX(i)
              const iy = initial.getY(i)
              const iz = initial.getZ(i)
              const dx = Math.abs(px - ix)
              const dy = Math.abs(py - iy)
              const dz = Math.abs(pz - iz)
              const d = dx + dy + dz
              if (d > 1) {
                positions.setXYZ(
                  i,
                  px -
                    ((px - ix) / (dx || 1)) *
                      data.speed *
                      delta *
                      (0.85 - Math.random()),
                  py -
                    ((py - iy) / (dy || 1)) *
                      data.speed *
                      delta *
                      (1 + Math.random()),
                  pz -
                    ((pz - iz) / (dz || 1)) *
                      data.speed *
                      delta *
                      (0.85 - Math.random()),
                )
              } else {
                data.verticesUp += 1
              }
            }
          }

          if (data.verticesDown >= count) {
            if (data.delay <= 0) {
              data.direction = 1
              data.speed = 5
              data.verticesDown = 0
              data.delay = 320
            } else {
              data.delay -= 1
            }
          }
          if (data.verticesUp >= count) {
            if (data.delay <= 0) {
              data.direction = -1
              data.speed = 15
              data.verticesUp = 0
              data.delay = 120
            } else {
              data.delay -= 1
            }
          }

          positions.needsUpdate = true
        }
      },
      apply(p) {
        const newSize = p.particleSize as number
        if (newSize !== currentSize) {
          currentSize = newSize
          for (const m of allMaterials) m.size = newSize
        }
        const accentHex = p.accentColor as string
        currentAccent.set(accentHex)
        for (const m of allMaterials) {
          if ((m as unknown as { __isAccent?: boolean }).__isAccent) {
            m.color.set(accentHex)
          }
        }
        const bgColor = new THREE.Color(p.background as string)
        scene.background = bgColor
        if (scene.fog) {
          ;(scene.fog as THREE_NS.FogExp2).color = bgColor
          ;(scene.fog as THREE_NS.FogExp2).density = p.fogDensity as number
        }
        bloomCombine["strength"].value = p.bloomStrength as number
        filmUniforms["intensity"].value = p.filmIntensity as number
        focusPass.enabled = p.focusEnabled as boolean
        spinSpeed = p.spinSpeed as number
        animSpeed = p.animSpeed as number
        return true
      },
      render() {
        composer.render(0.01)
      },
      resize(width, height) {
        composer.setSize(width, height)
        setFocusSize(width, height)
      },
      dispose() {
        scene.remove(parent)
        scene.fog = null
        for (const m of allMaterials) m.dispose()
        for (const g of allGeometries) g.dispose()
        gridGeo.dispose()
        gridMat.dispose()
        composer.dispose()
        renderer.autoClear = prevAutoClear
      },
    }
  },
}

// ── Particle Waves preset ────────────────────────────────────────────────
// threejs.org webgl_points_waves örneğinden uyarlandı: AMOUNTX × AMOUNTY
// grid'inde Points particle'ları çift sinüs dalgasıyla yukarı-aşağı
// hareket eder ve aynı dalgalarla scale'i pulslanır. Custom vertex
// shader scale attribute'unu gl_PointSize'a perspektif-correct mapler;
// fragment shader yuvarlak point maskleme yapar (köşeleri discard).
// Orijinal mouse-driven kamera yerine otomatik orbit — recording içindir.

const WAVE_VERTEX_SHADER = `
attribute float scale;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = scale * ( 300.0 / - mvPosition.z );
  gl_Position = projectionMatrix * mvPosition;
}
`

const WAVE_FRAGMENT_SHADER = `
uniform vec3 color;
void main() {
  if ( length( gl_PointCoord - vec2( 0.5, 0.5 ) ) > 0.475 ) discard;
  gl_FragColor = vec4( color, 1.0 );
}
`

const particleWaves: Preset = {
  id: "particle-waves",
  name: "Particle Waves",
  description:
    "Animated grid of particles rippling with two superimposed sine waves — both vertical position and point size pulse together. Tweak the grid density, frequencies, amplitude and color tint; camera orbits automatically for recording.",
  category: "Particles",
  badge: "WV",
  background: "#000000",
  camera: { position: [0, 0, 1000], lookAt: [0, 0, 0], fov: 75 },
  params: [
    {
      type: "number",
      key: "amountX",
      label: "Grid X",
      default: 50,
      min: 10,
      max: 100,
      step: 1,
    },
    {
      type: "number",
      key: "amountY",
      label: "Grid Y",
      default: 50,
      min: 10,
      max: 100,
      step: 1,
    },
    {
      type: "number",
      key: "separation",
      label: "Spacing",
      default: 100,
      min: 30,
      max: 200,
      step: 5,
    },
    {
      type: "color",
      key: "color",
      label: "Particle color",
      default: "#ffffff",
    },
    {
      type: "color",
      key: "background",
      label: "Background",
      default: "#000000",
    },
    {
      type: "number",
      key: "amplitude",
      label: "Wave amplitude",
      default: 50,
      min: 0,
      max: 200,
      step: 1,
    },
    {
      type: "number",
      key: "freqX",
      label: "Wave freq X",
      default: 0.3,
      min: 0.05,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "freqY",
      label: "Wave freq Y",
      default: 0.5,
      min: 0.05,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "timeSpeed",
      label: "Time speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
    },
    {
      type: "number",
      key: "orbitSpeed",
      label: "Camera orbit speed",
      default: 0.15,
      min: 0,
      max: 2,
      step: 0.05,
    },
  ],
  build(ctx, params) {
    const { THREE, scene, camera, requestRender } = ctx

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(params.color as string) },
      },
      vertexShader: WAVE_VERTEX_SHADER,
      fragmentShader: WAVE_FRAGMENT_SHADER,
    })

    // Grid çözünürlüğü değiştiğinde geometry baştan inşa edilmeli — yeni
    // particle sayısı yeni Float32Array buffer demek. Material reuse,
    // sadece geometry swap.
    let amountX = params.amountX as number
    let amountY = params.amountY as number
    let separation = params.separation as number

    const buildGeometry = () => {
      const numParticles = amountX * amountY
      const positions = new Float32Array(numParticles * 3)
      const scales = new Float32Array(numParticles)
      let i = 0
      let j = 0
      for (let ix = 0; ix < amountX; ix++) {
        for (let iy = 0; iy < amountY; iy++) {
          positions[i] = ix * separation - (amountX * separation) / 2
          positions[i + 1] = 0
          positions[i + 2] = iy * separation - (amountY * separation) / 2
          scales[j] = 1
          i += 3
          j++
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      geo.setAttribute("scale", new THREE.BufferAttribute(scales, 1))
      return geo
    }

    let geometry = buildGeometry()
    let particles = new THREE.Points(geometry, material)
    scene.add(particles)

    const rebuildParticles = () => {
      scene.remove(particles)
      geometry.dispose()
      geometry = buildGeometry()
      particles = new THREE.Points(geometry, material)
      scene.add(particles)
    }

    // Animation state — orijinal `count += 0.1` her frame, 60fps'te
    // ~6/s. dt-based: count += 6 * dt * speed.
    let count = 0
    let amplitude = params.amplitude as number
    let freqX = params.freqX as number
    let freqY = params.freqY as number
    let timeSpeed = params.timeSpeed as number
    let orbitSpeed = params.orbitSpeed as number

    const radius =
      Math.hypot(camera.position.x, camera.position.z) || 1000
    let angle = Math.atan2(camera.position.x, camera.position.z) || 0

    requestRender()

    return {
      update(dt) {
        if (orbitSpeed !== 0) {
          angle += orbitSpeed * dt
          camera.position.x = Math.sin(angle) * radius
          camera.position.z = Math.cos(angle) * radius
          camera.lookAt(0, 0, 0)
        }

        count += 6 * dt * timeSpeed

        const posAttr = geometry.attributes
          .position as THREE_NS.BufferAttribute
        const scaleAttr = geometry.attributes
          .scale as THREE_NS.BufferAttribute
        const posArr = posAttr.array as Float32Array
        const scaleArr = scaleAttr.array as Float32Array

        let i = 0
        let j = 0
        for (let ix = 0; ix < amountX; ix++) {
          for (let iy = 0; iy < amountY; iy++) {
            posArr[i + 1] =
              Math.sin((ix + count) * freqX) * amplitude +
              Math.sin((iy + count) * freqY) * amplitude
            scaleArr[j] =
              (Math.sin((ix + count) * freqX) + 1) * 20 +
              (Math.sin((iy + count) * freqY) + 1) * 20
            i += 3
            j++
          }
        }
        posAttr.needsUpdate = true
        scaleAttr.needsUpdate = true
      },
      apply(p) {
        ;(
          material.uniforms.color as { value: THREE_NS.Color }
        ).value.set(p.color as string)
        scene.background = new THREE.Color(p.background as string)
        amplitude = p.amplitude as number
        freqX = p.freqX as number
        freqY = p.freqY as number
        timeSpeed = p.timeSpeed as number
        orbitSpeed = p.orbitSpeed as number

        const newX = p.amountX as number
        const newY = p.amountY as number
        const newSep = p.separation as number
        if (
          newX !== amountX ||
          newY !== amountY ||
          newSep !== separation
        ) {
          amountX = newX
          amountY = newY
          separation = newSep
          rebuildParticles()
        }
        return true
      },
      dispose() {
        scene.remove(particles)
        geometry.dispose()
        material.dispose()
      },
    }
  },
}

// ── Filter Quadrants preset (4-pane postprocessing comparison) ──────────
// threejs.org webgl_postprocessing örneğinden uyarlandı: aynı sahne (Lee
// Perry-Smith head + skybox quad arka plan) 4 ayrı EffectComposer
// pipeline'ından geçirilip canvas'ın 4 quadrant'ına çizilir.
//
//   ┌─────────────┬─────────────┐
//   │ TL: BW Film │ TR: DotScreen + dual-color (mask + inverse) │
//   │   + Vignette│   + Vignette                                │
//   ├─────────────┼─────────────┤
//   │ BL: Sepia + │ BR: Bloom + Bleach + Film + Vignette        │
//   │ Film + Vig. │                                             │
//   └─────────────┴─────────────┘
//
// Recording için: kullanıcı tek kayıtta 4 farklı look'u yan yana karşılaştırır.

const FILTER_QUADRANTS_BG_URL =
  "https://threejs.org/examples/textures/cube/SwedishRoyalCastle/pz.jpg"

const filterQuadrants: Preset = {
  id: "filter-quadrants",
  name: "Filter Quadrants",
  description:
    "Compare four post-processing looks side-by-side: BW film, dot-screen + dual-color, sepia, and bloom-bleach. The same Lee Perry-Smith head spins in all four panes — one record captures the whole swatch.",
  category: "Compositing",
  badge: "4Q",
  background: "#000000",
  // Editör perspective camera'sını model için kuruyor; ortho bg camera'sı
  // preset içinde lokal yaratılıyor.
  camera: { position: [0, 0, 900], lookAt: [0, 0, 0], fov: 50 },
  params: [
    {
      type: "number",
      key: "rotationSpeed",
      label: "Rotation speed",
      default: 0.4,
      min: 0,
      max: 2,
      step: 0.05,
    },
    {
      type: "number",
      key: "bleach",
      label: "Bleach (BR)",
      default: 0.95,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "sepia",
      label: "Sepia (BL)",
      default: 0.9,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "bloom",
      label: "Bloom (BR)",
      default: 0.5,
      min: 0,
      max: 3,
      step: 0.05,
    },
    {
      type: "number",
      key: "filmIntensity",
      label: "Film grain",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      type: "number",
      key: "dotScale",
      label: "Dot scale (TR)",
      default: 0.5,
      min: 0.05,
      max: 2,
      step: 0.01,
    },
    {
      type: "number",
      key: "vignetteOffset",
      label: "Vignette offset",
      default: 1.6,
      min: 0,
      max: 4,
      step: 0.05,
    },
    {
      type: "number",
      key: "vignetteDarkness",
      label: "Vignette darkness",
      default: 0.95,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      type: "color",
      key: "colorify1",
      label: "Mask tint (TR)",
      default: "#ffcccc",
    },
    {
      type: "color",
      key: "colorify2",
      label: "Inverse tint (TR)",
      default: "#ffbf80",
    },
  ],
  async build(ctx, params) {
    const { THREE, scene, camera, renderer, requestRender } = ctx

    const [
      { GLTFLoader },
      { EffectComposer },
      { RenderPass },
      { ShaderPass },
      { BloomPass },
      { FilmPass },
      { DotScreenPass },
      { MaskPass, ClearMaskPass },
      { TexturePass },
      { BleachBypassShader },
      { ColorifyShader },
      { SepiaShader },
      { VignetteShader },
      { GammaCorrectionShader },
    ] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/ShaderPass.js"),
      import("three/addons/postprocessing/BloomPass.js"),
      import("three/addons/postprocessing/FilmPass.js"),
      import("three/addons/postprocessing/DotScreenPass.js"),
      import("three/addons/postprocessing/MaskPass.js"),
      import("three/addons/postprocessing/TexturePass.js"),
      import("three/addons/shaders/BleachBypassShader.js"),
      import("three/addons/shaders/ColorifyShader.js"),
      import("three/addons/shaders/SepiaShader.js"),
      import("three/addons/shaders/VignetteShader.js"),
      import("three/addons/shaders/GammaCorrectionShader.js"),
    ])

    // ── Cameras ────────────────────────────────────────────────────
    // Editör'ün verdiği `camera` perspective — bu preset model rendering
    // için onu kullanır. Background quad ortografik camera ile ayrı
    // composer pass'ında render edilir.
    let halfW = renderer.domElement.width / 2
    let halfH = renderer.domElement.height / 2
    const cameraOrtho = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      -10000,
      10000,
    )
    cameraOrtho.position.z = 100

    // ── Scenes ─────────────────────────────────────────────────────
    // Editör kendi scene'inden bahsetmiyor; biz model + bg + mask için
    // 3 ayrı scene tutuyoruz. Editör'ün scene'i kullanılmıyor — visual
    // çıktı tamamen 4 composer'dan geliyor. Background'u editör scene'inde
    // göstermiyoruz, composer pipeline halleder.
    const sceneModel = new THREE.Scene()
    const sceneBG = new THREE.Scene()

    // ── Lights ─────────────────────────────────────────────────────
    const directionalLight = new THREE.DirectionalLight(0xffffff, 3)
    directionalLight.position.set(0, -0.1, 1).normalize()
    sceneModel.add(directionalLight)

    // ── Texture loader (CORS) ──────────────────────────────────────
    const textureLoader = new THREE.TextureLoader()
    textureLoader.crossOrigin = "anonymous"

    // ── Background quad — sceneBG içine full-screen plane ──────────
    const bgTexture = textureLoader.load(FILTER_QUADRANTS_BG_URL, () =>
      requestRender(),
    )
    bgTexture.colorSpace = THREE.SRGBColorSpace
    const bgMat = new THREE.MeshBasicMaterial({
      map: bgTexture,
      depthTest: false,
    })
    const quadBG = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat)
    quadBG.position.z = -500
    quadBG.scale.set(halfW * 2, halfH * 2, 1)
    sceneBG.add(quadBG)

    // ── Model — async GLB load + sphere fallback ───────────────────
    let mesh: THREE_NS.Mesh | null = null
    const modelDiffuse = textureLoader.load(
      "https://threejs.org/examples/models/gltf/LeePerrySmith/Map-COL.jpg",
      () => requestRender(),
    )
    modelDiffuse.colorSpace = THREE.SRGBColorSpace
    const modelNormal = textureLoader.load(
      "https://threejs.org/examples/models/gltf/LeePerrySmith/Infinite-Level_02_Tangent_SmoothUV.jpg",
      () => requestRender(),
    )
    const modelMaterial = new THREE.MeshPhongMaterial({
      color: 0xcbcbcb,
      specular: 0x080808,
      shininess: 20,
      map: modelDiffuse,
      normalMap: modelNormal,
      normalScale: new THREE.Vector2(0.75, 0.75),
    })
    let fallbackGeo: THREE_NS.SphereGeometry | null = null
    try {
      const loader = new GLTFLoader()
      const gltf = await new Promise<{ scene: THREE_NS.Group }>(
        (resolve, reject) => {
          loader.load(
            "https://threejs.org/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb",
            (g) => resolve(g as unknown as { scene: THREE_NS.Group }),
            undefined,
            (err) => reject(err),
          )
        },
      )
      const head = gltf.scene.children[0] as THREE_NS.Mesh | undefined
      if (head?.geometry) {
        mesh = new THREE.Mesh(head.geometry, modelMaterial)
        mesh.position.set(0, -50, 0)
        mesh.scale.setScalar(100)
        sceneModel.add(mesh)
      } else {
        throw new Error("No geometry in GLB")
      }
    } catch {
      fallbackGeo = new THREE.SphereGeometry(2, 64, 32)
      mesh = new THREE.Mesh(fallbackGeo, modelMaterial)
      mesh.position.set(0, -50, 0)
      mesh.scale.setScalar(100)
      sceneModel.add(mesh)
    }

    // ── Effect passes ──────────────────────────────────────────────
    type UniformBag = Record<string, { value: unknown }>

    const effectBleach = new ShaderPass(BleachBypassShader)
    const effectSepia = new ShaderPass(SepiaShader)
    const effectVignette = new ShaderPass(VignetteShader)
    const gammaCorrection = new ShaderPass(GammaCorrectionShader)

    const bleachU = effectBleach.uniforms as unknown as UniformBag
    const sepiaU = effectSepia.uniforms as unknown as UniformBag
    const vignetteU = effectVignette.uniforms as unknown as UniformBag

    bleachU["opacity"].value = params.bleach as number
    sepiaU["amount"].value = params.sepia as number
    vignetteU["offset"].value = params.vignetteOffset as number
    vignetteU["darkness"].value = params.vignetteDarkness as number

    const effectBloom = new BloomPass(params.bloom as number)
    const effectFilm = new FilmPass(params.filmIntensity as number)
    const effectFilmBW = new FilmPass(params.filmIntensity as number, true)
    const filmU = effectFilm.uniforms as unknown as UniformBag
    const filmBwU = effectFilmBW.uniforms as unknown as UniformBag
    const bloomCombine = (
      effectBloom as unknown as { combineUniforms: UniformBag }
    ).combineUniforms

    const effectDotScreen = new DotScreenPass(
      new THREE.Vector2(0, 0),
      0.5,
      params.dotScale as number,
    )
    const dotU = effectDotScreen.uniforms as unknown as UniformBag

    const effectColorify1 = new ShaderPass(ColorifyShader)
    const effectColorify2 = new ShaderPass(ColorifyShader)
    effectColorify1.uniforms.color = new THREE.Uniform(
      new THREE.Color(params.colorify1 as string),
    )
    effectColorify2.uniforms.color = new THREE.Uniform(
      new THREE.Color(params.colorify2 as string),
    )
    const colorify1U = effectColorify1.uniforms as unknown as UniformBag
    const colorify2U = effectColorify2.uniforms as unknown as UniformBag

    const clearMask = new ClearMaskPass()
    const renderMask = new MaskPass(sceneModel, camera)
    const renderMaskInverse = new MaskPass(sceneModel, camera)
    renderMaskInverse.inverse = true

    // ── Composers ──────────────────────────────────────────────────
    // composerScene → renderTarget2'ye yazar; sonra 4 composer onun
    // texture'ını TexturePass üstünden tüketir. Stencil buffer mask
    // pipeline için şart.
    const rtParams = { stencilBuffer: true }

    const renderBackground = new RenderPass(sceneBG, cameraOrtho)
    const renderModel = new RenderPass(sceneModel, camera)
    renderModel.clear = false

    const composerScene = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(halfW * 2, halfH * 2, rtParams),
    )
    composerScene.addPass(renderBackground)
    composerScene.addPass(renderModel)

    const renderScene = new TexturePass(
      composerScene.renderTarget2.texture as THREE_NS.Texture,
    )

    const composer1 = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(halfW, halfH, rtParams),
    )
    composer1.addPass(renderScene)
    composer1.addPass(gammaCorrection)
    composer1.addPass(effectFilmBW)
    composer1.addPass(effectVignette)

    const composer2 = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(halfW, halfH, rtParams),
    )
    composer2.addPass(renderScene)
    composer2.addPass(gammaCorrection)
    composer2.addPass(effectDotScreen)
    composer2.addPass(renderMask)
    composer2.addPass(effectColorify1)
    composer2.addPass(clearMask)
    composer2.addPass(renderMaskInverse)
    composer2.addPass(effectColorify2)
    composer2.addPass(clearMask)
    composer2.addPass(effectVignette)

    const composer3 = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(halfW, halfH, rtParams),
    )
    composer3.addPass(renderScene)
    composer3.addPass(gammaCorrection)
    composer3.addPass(effectSepia)
    composer3.addPass(effectFilm)
    composer3.addPass(effectVignette)

    const composer4 = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(halfW, halfH, rtParams),
    )
    composer4.addPass(renderScene)
    composer4.addPass(gammaCorrection)
    composer4.addPass(effectBloom)
    composer4.addPass(effectFilm)
    composer4.addPass(effectBleach)
    composer4.addPass(effectVignette)

    const renderSceneUniforms = renderScene.uniforms as unknown as UniformBag
    renderSceneUniforms["tDiffuse"].value =
      composerScene.renderTarget2.texture

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false

    let rotationSpeed = params.rotationSpeed as number
    let elapsed = 0
    const fixedDelta = 0.01 // composer.render(delta) için sabit, FilmPass time uniform'u

    return {
      update(dt) {
        elapsed += dt * rotationSpeed
        if (mesh) mesh.rotation.y = -elapsed
      },
      apply(p) {
        rotationSpeed = p.rotationSpeed as number
        bleachU["opacity"].value = p.bleach as number
        sepiaU["amount"].value = p.sepia as number
        bloomCombine["strength"].value = p.bloom as number
        filmU["intensity"].value = p.filmIntensity as number
        filmBwU["intensity"].value = p.filmIntensity as number
        dotU["scale"].value = p.dotScale as number
        vignetteU["offset"].value = p.vignetteOffset as number
        vignetteU["darkness"].value = p.vignetteDarkness as number
        ;(
          colorify1U["color"].value as THREE_NS.Color
        ).set(p.colorify1 as string)
        ;(
          colorify2U["color"].value as THREE_NS.Color
        ).set(p.colorify2 as string)
        return true
      },
      render() {
        // Önce master scene composerScene'e (offscreen) çiz, sonra
        // 4 composer ana canvas'ın 4 quadrant'ına viewport split ile çizer.
        renderer.setViewport(0, 0, halfW, halfH)
        composerScene.render(fixedDelta)

        renderer.setViewport(0, 0, halfW, halfH)
        composer1.render(fixedDelta)

        renderer.setViewport(halfW, 0, halfW, halfH)
        composer2.render(fixedDelta)

        renderer.setViewport(0, halfH, halfW, halfH)
        composer3.render(fixedDelta)

        renderer.setViewport(halfW, halfH, halfW, halfH)
        composer4.render(fixedDelta)
      },
      resize(width, height) {
        halfW = width / 2
        halfH = height / 2
        cameraOrtho.left = -halfW
        cameraOrtho.right = halfW
        cameraOrtho.top = halfH
        cameraOrtho.bottom = -halfH
        cameraOrtho.updateProjectionMatrix()

        composerScene.setSize(halfW * 2, halfH * 2)
        composer1.setSize(halfW, halfH)
        composer2.setSize(halfW, halfH)
        composer3.setSize(halfW, halfH)
        composer4.setSize(halfW, halfH)

        renderSceneUniforms["tDiffuse"].value =
          composerScene.renderTarget2.texture

        quadBG.scale.set(halfW * 2, halfH * 2, 1)
      },
      dispose() {
        if (mesh) sceneModel.remove(mesh)
        sceneModel.remove(directionalLight)
        sceneBG.remove(quadBG)
        modelMaterial.dispose()
        modelDiffuse.dispose()
        modelNormal.dispose()
        bgMat.dispose()
        bgTexture.dispose()
        quadBG.geometry.dispose()
        if (fallbackGeo) fallbackGeo.dispose()
        composerScene.dispose()
        composer1.dispose()
        composer2.dispose()
        composer3.dispose()
        composer4.dispose()
        renderer.autoClear = prevAutoClear
        // Editör'ün viewport'unu sıfırla — bu preset 4-pane viewport ayarı
        // bırakıyor; başka preset'e geçince renderer.render() full canvas
        // beklediği için reset.
        renderer.setViewport(
          0,
          0,
          renderer.domElement.width,
          renderer.domElement.height,
        )
      },
    }
  },
}

// ── Point Lights (displaced) preset ──────────────────────────────────────
// threejs.org webgpu_lights_points örneğinden uyarlandı. Orijinal
// WebGPURenderer + TSL node API kullanıyor; bizim editor WebGLRenderer
// olduğu için aynı displacement effect'ini MeshPhongMaterial'ın
// `onBeforeCompile` hook'una GLSL injeksiyonu ile yeniden ifade ettik —
// hem mevcut renderer ile çalışır hem de cross-browser (Safari/Firefox
// dahil) destekli.
//
// Geometry tetrahedral subdivision: her triangle 4 yeni triangle'a
// (tetrahedron) bölünür, her vertex'e `seed`, `time`, `displaceNormal`
// attribute'ları eklenir. Vertex shader'da iki point light'ın world-space
// pozisyonu local'e çevrilip distance-based displacement'a etkir; ayrıca
// per-tetrahedron `seed`+sin tabanlı sürekli "nefes alma" hareketi.

const POINT_LIGHTS_OBJ_URL =
  "https://threejs.org/examples/models/obj/walt/WaltHead.obj"

// GLSL injeksiyon parçaları — onBeforeCompile bu bloklari mevcut Phong
// vertex shader'ın #include satırlarının yerine koyar.
const POINT_LIGHTS_VERTEX_DECLS = `
  uniform float uTime;
  uniform vec3 uLight1;
  uniform vec3 uLight2;
  uniform float uDisplacement;
  uniform mat4 uModelMatrixInverse;
  attribute float seed;
  attribute float aTime;
  attribute vec3 displaceNormal;
`

const POINT_LIGHTS_VERTEX_BODY = `
  vec3 transformed = vec3( position );

  // Light pozisyonlarını local space'e çek — TSL'deki
  // modelWorldMatrixInverse.mul(effector) eşdeğeri.
  vec3 effector1Local = ( uModelMatrixInverse * vec4( uLight1, 1.0 ) ).xyz;
  vec3 effector2Local = ( uModelMatrixInverse * vec4( uLight2, 1.0 ) ).xyz;

  float distance1 = distance( position, effector1Local );
  float distance2 = distance( position, effector2Local );

  float invDistance1 = max( 0.0, 20.0 - distance1 ) / 2.0;
  float invDistance2 = max( 0.0, 20.0 - distance2 ) / 2.0;

  float localTime = aTime + uTime;
  float s = abs( sin( localTime * 2.0 + seed ) * 0.5 ) + invDistance1 + invDistance2;

  transformed += displaceNormal * s * uDisplacement;
`

interface PointLightShaderRefs {
  uTime: { value: number }
  uLight1: { value: THREE_NS.Vector3 }
  uLight2: { value: THREE_NS.Vector3 }
  uDisplacement: { value: number }
  uModelMatrixInverse: { value: THREE_NS.Matrix4 }
}

const pointLightsDisplacement: Preset = {
  id: "point-lights-displacement",
  name: "Point Lights Displacement",
  description:
    "Walt Disney head's surface is shattered into thousands of tiny tetrahedrons that breathe and stretch as two colored point lights orbit through it. Each vertex's displacement reacts to light proximity in real time.",
  category: "Character",
  badge: "PL",
  background: "#0a0a14",
  camera: { position: [0, 0, 100], lookAt: [0, 0, 0], fov: 50 },
  params: [
    {
      type: "color",
      key: "light1Color",
      label: "Light 1 color",
      default: "#ff0040",
    },
    {
      type: "color",
      key: "light2Color",
      label: "Light 2 color",
      default: "#0040ff",
    },
    {
      type: "number",
      key: "lightIntensity",
      label: "Light intensity",
      default: 2000,
      min: 100,
      max: 5000,
      step: 50,
    },
    {
      type: "color",
      key: "modelColor",
      label: "Model color",
      default: "#cccccc",
    },
    {
      type: "number",
      key: "displacement",
      label: "Displacement strength",
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
    },
    {
      type: "number",
      key: "ambientIntensity",
      label: "Ambient",
      default: 0.1,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      type: "number",
      key: "animSpeed",
      label: "Animation speed",
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.05,
    },
    {
      type: "number",
      key: "orbitSpeed",
      label: "Camera orbit",
      default: 0.15,
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],
  async build(ctx, params) {
    const { THREE, scene, camera, requestRender } = ctx

    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js")

    // ── Lights ────────────────────────────────────────────────────
    // Editör scene'inde kalır; vertex shader pozisyonlarını uniform
    // üstünden okur (light.position kendiliğinden mesh'i de etkiler).
    const ambient = new THREE.AmbientLight(
      0xaaaaaa,
      params.ambientIntensity as number,
    )
    scene.add(ambient)

    const light1 = new THREE.PointLight(
      new THREE.Color(params.light1Color as string),
      params.lightIntensity as number,
    )
    const light2 = new THREE.PointLight(
      new THREE.Color(params.light2Color as string),
      params.lightIntensity as number,
    )

    // Her light için küçük sphere visualizer (kendi rengiyle).
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 8)
    const sphere1Mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(params.light1Color as string),
    })
    const sphere2Mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(params.light2Color as string),
    })
    light1.add(new THREE.Mesh(sphereGeo, sphere1Mat))
    light2.add(new THREE.Mesh(sphereGeo, sphere2Mat))

    scene.add(light1, light2)

    // ── Material — onBeforeCompile ile vertex shader injection ────
    const shaderRefs: PointLightShaderRefs = {
      uTime: { value: 0 },
      uLight1: { value: light1.position },
      uLight2: { value: light2.position },
      uDisplacement: { value: params.displacement as number },
      uModelMatrixInverse: { value: new THREE.Matrix4() },
    }

    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(params.modelColor as string),
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shaderRefs.uTime
      shader.uniforms.uLight1 = shaderRefs.uLight1
      shader.uniforms.uLight2 = shaderRefs.uLight2
      shader.uniforms.uDisplacement = shaderRefs.uDisplacement
      shader.uniforms.uModelMatrixInverse = shaderRefs.uModelMatrixInverse

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>\n${POINT_LIGHTS_VERTEX_DECLS}`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        POINT_LIGHTS_VERTEX_BODY,
      )
    }

    // ── Tetrahedral subdivision helper ────────────────────────────
    // Orijinaldeki createGeometry'nin birebir GLSL'siz portu — her
    // triangle 4 yeni triangle'a (tetrahedron) bölünür.
    const buildTetrahedralGeometry = (
      sourceGeo: THREE_NS.BufferGeometry,
    ): THREE_NS.BufferGeometry => {
      const position = sourceGeo.getAttribute(
        "position",
      ) as THREE_NS.BufferAttribute
      const v0 = new THREE.Vector3()
      const v1 = new THREE.Vector3()
      const v2 = new THREE.Vector3()
      const v3 = new THREE.Vector3()
      const n = new THREE.Vector3()
      const plane = new THREE.Plane()

      const vertices: number[] = []
      const times: number[] = []
      const seeds: number[] = []
      const displaceNormal: number[] = []

      for (let i = 0; i < position.count; i += 3) {
        v0.fromBufferAttribute(position, i)
        v1.fromBufferAttribute(position, i + 1)
        v2.fromBufferAttribute(position, i + 2)

        plane.setFromCoplanarPoints(v0, v1, v2)

        v3.copy(v0).add(v1).add(v2).divideScalar(3)
        v3.add(n.copy(plane.normal).multiplyScalar(-1))

        // 4 triangles per tetrahedron
        vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z)
        vertices.push(v3.x, v3.y, v3.z, v1.x, v1.y, v1.z, v0.x, v0.y, v0.z)
        vertices.push(v3.x, v3.y, v3.z, v2.x, v2.y, v2.z, v1.x, v1.y, v1.z)
        vertices.push(v3.x, v3.y, v3.z, v0.x, v0.y, v0.z, v2.x, v2.y, v2.z)

        const t = Math.random()
        const s = Math.random()
        n.copy(plane.normal)

        for (let k = 0; k < 12; k++) times.push(t)
        for (let k = 0; k < 12; k++) seeds.push(s)
        for (let k = 0; k < 12; k++) {
          displaceNormal.push(n.x, n.y, n.z)
        }
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      )
      // attribute adı `time` ile shader içindeki `aTime` arasında
      // çakışma yaşanmasın — aTime'a remap.
      geo.setAttribute("aTime", new THREE.Float32BufferAttribute(times, 1))
      geo.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1))
      geo.setAttribute(
        "displaceNormal",
        new THREE.Float32BufferAttribute(displaceNormal, 3),
      )
      geo.computeVertexNormals()
      return geo
    }

    // ── Async OBJ load ─────────────────────────────────────────────
    let mesh: THREE_NS.Mesh | null = null
    let geometry: THREE_NS.BufferGeometry | null = null
    let fallbackSourceGeo: THREE_NS.IcosahedronGeometry | null = null
    try {
      const loader = new OBJLoader()
      const obj = await new Promise<THREE_NS.Group>((resolve, reject) => {
        loader.load(
          POINT_LIGHTS_OBJ_URL,
          (g) => resolve(g),
          undefined,
          (err) => reject(err),
        )
      })
      const head = obj.children[0] as THREE_NS.Mesh | undefined
      if (head?.geometry) {
        geometry = buildTetrahedralGeometry(head.geometry)
      } else {
        throw new Error("No geometry in OBJ")
      }
    } catch {
      // Asset reach edilemezse: subdivided icosahedron'u kullan.
      // Tetrahedral re-subdivision aynı kalır, görsel yeterince benzer.
      fallbackSourceGeo = new THREE.IcosahedronGeometry(30, 4)
      // toNonIndexed — buildTetrahedral indexed olmayan triangle list bekler.
      const flat = fallbackSourceGeo.toNonIndexed()
      geometry = buildTetrahedralGeometry(flat)
      flat.dispose()
    }

    if (geometry) {
      mesh = new THREE.Mesh(geometry, material)
      mesh.scale.setScalar(0.8)
      mesh.position.y = -30
      scene.add(mesh)
      // ModelMatrix değişmiyor (sabit position/scale), inverse'i bir
      // kez hesapla; light orbit ettiği için light pozisyonu uniform
      // olarak sürekli güncellenir, inverse stabil.
      mesh.updateMatrixWorld(true)
      shaderRefs.uModelMatrixInverse.value
        .copy(mesh.matrixWorld)
        .invert()
    }

    requestRender()

    // ── Camera orbit ───────────────────────────────────────────────
    let orbitSpeed = params.orbitSpeed as number
    let animSpeed = params.animSpeed as number
    const camRadius = Math.hypot(camera.position.x, camera.position.z) || 100
    let camAngle =
      Math.atan2(camera.position.x, camera.position.z) || 0
    let elapsed = 0

    return {
      update(dt) {
        elapsed += dt * animSpeed
        const time = elapsed
        // Orijinal animation: light.position = sin/cos kombinasyonları
        light1.position.x = Math.sin(time) * 20
        light1.position.y = -Math.cos(time * 0.75) * 30
        light1.position.z = Math.cos(time * 0.5) * 20

        light2.position.x = Math.cos(time * 0.5) * 20
        light2.position.y = -Math.sin(time * 0.75) * 30
        light2.position.z = Math.sin(time) * 20

        // Vertex shader uniform — sürekli artar.
        shaderRefs.uTime.value = elapsed

        if (orbitSpeed !== 0) {
          camAngle += orbitSpeed * dt
          camera.position.x = Math.sin(camAngle) * camRadius
          camera.position.z = Math.cos(camAngle) * camRadius
          camera.lookAt(0, 0, 0)
        }
      },
      apply(p) {
        light1.color.set(p.light1Color as string)
        light2.color.set(p.light2Color as string)
        sphere1Mat.color.set(p.light1Color as string)
        sphere2Mat.color.set(p.light2Color as string)
        light1.intensity = p.lightIntensity as number
        light2.intensity = p.lightIntensity as number
        material.color.set(p.modelColor as string)
        ambient.intensity = p.ambientIntensity as number
        shaderRefs.uDisplacement.value = p.displacement as number
        animSpeed = p.animSpeed as number
        orbitSpeed = p.orbitSpeed as number
        return true
      },
      dispose() {
        if (mesh) scene.remove(mesh)
        scene.remove(light1, light2, ambient)
        if (geometry) geometry.dispose()
        if (fallbackSourceGeo) fallbackSourceGeo.dispose()
        material.dispose()
        sphereGeo.dispose()
        sphere1Mat.dispose()
        sphere2Mat.dispose()
      },
    }
  },
}

// ── Registry ──────────────────────────────────────────────────────────────

export const PRESETS: Preset[] = [
  wireframeHead,
  pbrSpheres,
  leePerrySmithHead,
  cubePanorama,
  equirectPanorama,
  particleFigures,
  particleWaves,
  filterQuadrants,
  pointLightsDisplacement,
]

export const PRESETS_BY_ID: Record<string, Preset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
)

export const DEFAULT_PRESET_ID = wireframeHead.id

// ── Overlay font catalog ─────────────────────────────────────────────────
// Kullanıcının text overlay'lerinde fontunu seçebileceği güvenli liste.
// Hepsi system-available veya CSS @import gerektirmeyen web-safe stack'ler.
// Yeni font eklemek istersek next/font veya CSS link gerekir — bu liste
// "out of the box" çalışır.

export const OVERLAY_FONTS: Array<{ value: string; label: string }> = [
  { value: "Inter, system-ui, sans-serif", label: "Inter (Sans)" },
  { value: "system-ui, sans-serif", label: "System UI" },
  {
    value: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    label: "Helvetica",
  },
  { value: "Georgia, serif", label: "Georgia (Serif)" },
  { value: '"Times New Roman", Times, serif', label: "Times" },
  {
    value: '"Courier New", Courier, monospace',
    label: "Courier (Mono)",
  },
  { value: "Impact, sans-serif", label: "Impact" },
  { value: '"Arial Black", sans-serif', label: "Arial Black" },
  { value: "cursive", label: "Cursive" },
]

export const OVERLAY_WEIGHTS: Array<{ value: string; label: string }> = [
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Regular (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "Semibold (600)" },
  { value: "700", label: "Bold (700)" },
  { value: "900", label: "Black (900)" },
]
