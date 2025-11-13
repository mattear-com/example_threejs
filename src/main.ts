import './style.css'
import { 
  Scene, 
  PerspectiveCamera, 
  WebGLRenderer, 
  AmbientLight, 
  DirectionalLight,
  Group,        
  Mesh,         
  SphereGeometry, 
  BoxGeometry,    
  MeshBasicMaterial, 
  Color,        
  Vector3,      
  Box3,
  LoadingManager,  
  Points,            
  PointsMaterial,    
  BufferGeometry,    
  BufferAttribute, 
  Vector2,               
  MeshStandardMaterial,  
  AdditiveBlending,      
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'


// --- CLASE STARFIELD ---
// Crea un campo de estrellas dinámico
class Starfield {
  public mesh: Points

  constructor(count = 10000) {
    const geometry = new BufferGeometry()
    const positions = new Float32Array(count * 3) 

    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (Math.random() - 0.5) * 200 
      positions[i + 1] = (Math.random() - 0.5) * 200 
      positions[i + 2] = (Math.random() - 0.5) * 200 
    }

    geometry.setAttribute('position', new BufferAttribute(positions, 3))

    const material = new PointsMaterial({
      color: 0x88ffff, // Tono cian
      size: 0.15,
      transparent: true,
      blending: AdditiveBlending, 
      depthWrite: false,         
    })

    this.mesh = new Points(geometry, material)
  }

  public update(cameraPositionZ: number, positions: Float32Array) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 2] += 0.1 // Mover "hacia" la cámara

      if (positions[i + 2] > cameraPositionZ) {
        positions[i + 2] = cameraPositionZ - 100 // Reiniciar
      }
    }
    (this.mesh.geometry.attributes.position as BufferAttribute).needsUpdate = true
  }
}

// --- CLASE PROJECTILE ---
// Representa un proyectil disparado
class Projectile {
  public mesh: Mesh 
  private speed = 0.5 
  public isAlive = true 

  constructor(position: Vector3, rotationY: number) {
    const geometry = new SphereGeometry(0.1, 8, 8) 
    const material = new MeshStandardMaterial({ 
      color: 0x00ff00,
      emissive: 0x00ff00, // Emitir luz verde
      emissiveIntensity: 3.0 // Intensidad del brillo
    }) 
    this.mesh = new Mesh(geometry, material)
    this.mesh.position.copy(position) 
    this.mesh.rotation.y = rotationY
    this.mesh.translateZ(-0.5) 
  }

  public update() {
    // **CORRECCIÓN DE LÓGICA:**
    // Si la nave girada 180º usa +Z para ir adelante,
    // el proyectil (que hereda esa rotación) también debe usar +Z.
    this.mesh.translateZ(this.speed); 
  }
}

// --- CLASE TARGET ---
// Representa un objetivo (cubo)
class Target {
  public mesh: Mesh 
  public isAlive = true 

  constructor(position: Vector3) {
    const geometry = new BoxGeometry(1, 1, 1) 
    const material = new MeshBasicMaterial({ color: new Color(Math.random(), Math.random(), Math.random()) })
    this.mesh = new Mesh(geometry, material)
    this.mesh.position.copy(position) 
  }

  public update() {
    this.mesh.rotation.x += 0.01
    this.mesh.rotation.y += 0.01
  }
}

// --- CLASE SPACESHIP ---
// Lógica de la nave del jugador
class Spaceship {
  public model: Group 
  public isAlive = true 
  private speed = 0.1
  private rotationSpeed = 0.05 

  constructor(model: Group) {
    this.model = model
    
    // **CORRECCIÓN DE LÓGICA:**
    // Rotación de 180 grados (Math.PI radianes) como se solicitó.
    this.model.rotation.y = Math.PI 
  }

  public update(keysPressed: { [key: string]: boolean }) {
    // **CORRECCIÓN DE LÓGICA:**
    // Con la nave girada 180 grados, su "+Z local" ahora apunta
    // "hacia adelante" en el mundo (lejos de la cámara).
    if (keysPressed['ArrowUp']) this.model.translateZ(this.speed) // CAMBIADO A POSITIVO
    
    if (keysPressed['ArrowDown']) this.model.translateZ(-this.speed) // CAMBIADO A NEGATIVO
    
    // La rotación sigue igual
    if (keysPressed['ArrowLeft']) this.model.rotation.y += this.rotationSpeed
    if (keysPressed['ArrowRight']) this.model.rotation.y -= this.rotationSpeed
  }

  public getPosition(): Vector3 { return this.model.position.clone() }
  public getRotationY(): number { return this.model.rotation.y }

  public reset() {
    this.model.position.set(0, 0, 0)
    // Mantener la rotación inicial de 180 grados al resetear
    this.model.rotation.set(0, Math.PI, 0) 
    this.isAlive = true
  }
}

// --- CLASE APP ---
// Clase principal del juego
class App {
  private scene: Scene
  private camera: PerspectiveCamera
  private renderer: WebGLRenderer
  private canvas: HTMLCanvasElement

  private composer: EffectComposer
  private bloomPass: UnrealBloomPass

  // Gestores
  private loadingManager: LoadingManager
  private gltfLoader: GLTFLoader
  private fontLoader: FontLoader

  // Objetos
  private spaceship: Spaceship | null = null
  private starfield: Starfield
  private starfieldPositions: Float32Array
  private neonTitle: Mesh | null = null
  
  private projectiles: Projectile[] = []
  private targets: Target[] = []
  
  // Estado
  private keysPressed: { [key: string]: boolean } = {}
  private gameIsOver = false
  private isPaused = true 
  private score = 0

  // Timers
  private lastShotTime = 0 
  private shootCooldown = 200 
  private maxTargets = 10 
  private spawnTargetInterval = 2000 
  private lastTargetSpawnTime = 0 

  // UI
  private scoreElement: HTMLElement
  private startMenu: HTMLElement
  private gameOverElement: HTMLElement
  private startButton: HTMLElement
  private restartButton: HTMLElement

  // Colisiones
  private shipBox = new Box3()
  private targetBox = new Box3()
  private projectileBox = new Box3()

  // Cámara
  private cameraOffset = new Vector3(0, 8, 10) 

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    
    // UI
    this.scoreElement = document.getElementById('score')!
    this.startMenu = document.getElementById('start-menu')!
    this.gameOverElement = document.getElementById('game-over')!
    this.startButton = document.getElementById('start-button')!
    this.restartButton = document.getElementById('restart-button')!

    this.init() // Configurar escena, cámara, renderer
    this.setupPostProcessing() // Configurar Bloom/Glow
    this.setupLights() 

    // Campo de estrellas
    const starfieldCount = 10000
    this.starfield = new Starfield(starfieldCount)
    this.starfieldPositions = (this.starfield.mesh.geometry.attributes.position as BufferAttribute).array as Float32Array
    this.scene.add(this.starfield.mesh)
    
    // Gestores de carga
    this.loadingManager = new LoadingManager()
    this.loadingManager.onLoad = () => {
      this.startMenu.style.display = 'flex' 
    }
    
    this.gltfLoader = new GLTFLoader(this.loadingManager)
    this.fontLoader = new FontLoader(this.loadingManager)

    this.loadAssets() 
    this.setupUI() 
    this.animate() 
  }

  private init() {
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    
    // **CORRECCIÓN DE "MANCHA CIAN":**
    // Establecer una posición inicial para la cámara ANTES del primer render.
    this.camera.position.set(0, 8, 10)
    this.camera.lookAt(0, 0, 0)
    
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
  }

  /**
   * Configura el EffectComposer y el UnrealBloomPass para el efecto Neón
   */
  private setupPostProcessing() {
    const renderPass = new RenderPass(this.scene, this.camera)

    this.bloomPass = new UnrealBloomPass(
      new Vector2(window.innerWidth, window.innerHeight),
      1.5, // strength
      0.4, // radius
      0.85 // threshold
    )

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(renderPass)
    this.composer.addPass(this.bloomPass)
  }

  private setupLights() {
    const ambientLight = new AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)
    const directionalLight = new DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 10, 7.5)
    this.scene.add(directionalLight)
  }

  /**
   * Carga el modelo .glb de la nave y la fuente .json del título
   */
  private loadAssets() {
    // Cargar nave
    this.gltfLoader.load('spaceship.glb', (gltf: GLTF) => {
        const model = gltf.scene 
        model.scale.set(0.2, 0.2, 0.2)
        this.spaceship = new Spaceship(model) 
        this.scene.add(this.spaceship.model) 
      },
      undefined, (error) => { console.error('Error cargando nave:', error) }
    )

    // Cargar fuente y crear título "Mattear"
    this.fontLoader.load('helvetiker_regular.typeface.json', (font) => {
        const textGeometry = new TextGeometry('Mattear', {
          font: font, size: 4, depth: 0.5, curveSegments: 12,
        })
        textGeometry.center() 
        
        // Material de Neón Sólido (Brillante)
        const textMaterial = new MeshStandardMaterial({ 
          color: 0x00ffff,        
          emissive: 0x00ffff,       
          emissiveIntensity: .75, 
          metalness: 0.1,           
          roughness: 0.4            
        })
        
        this.neonTitle = new Mesh(textGeometry, textMaterial)
        this.neonTitle.position.set(0, 3, -15) // Posicionado delante
        this.scene.add(this.neonTitle)
      },
      undefined, (error) => { console.error('Error cargando fuente:', error) }
    )
  }

  /**
   * Configura los botones de la UI (Start, Restart)
   */
  private setupUI() {
    // Botón de Inicio
    this.startButton.addEventListener('click', () => {
      this.isPaused = false
      this.gameIsOver = false
      this.startMenu.style.display = 'none'
      document.getElementById('ui')!.style.display = 'block'
      
      // **CORRECCIÓN DE VUELO:**
      // No ocultamos el título, permitiendo que la nave lo atraviese.
      // if (this.neonTitle) this.neonTitle.visible = false // <--- LÍNEA ELIMINADA
    })

    // Botón de Reinicio
    this.restartButton.addEventListener('click', () => {
      this.resetGame()
    })
    
    // Listeners de Ventana y Teclado
    window.addEventListener('resize', this.onWindowResize.bind(this))
    window.addEventListener('keydown', this.onKeyDown.bind(this))
    window.addEventListener('keyup', this.onKeyUp.bind(this))
  }

  /**
   * Bucle principal de animación (se llama 60fps)
   */
  private animate = () => {
    requestAnimationFrame(this.animate)
    
    // Si el juego está pausado (menú), solo animar el título
    if (this.isPaused) {
      if (this.neonTitle) {
        this.neonTitle.rotation.y += 0.01
      }
    } else {
      // Si el juego está activo, actualizar toda la lógica
      this.update() 
    }
    
    // Renderizar siempre usando el composer para aplicar el efecto Bloom
    this.composer.render()
  }

  /**
   * Actualiza toda la lógica del juego (se llama solo si no está pausado)
   */
  private update() {
    const currentTime = performance.now() 

    // 1. Actualizar nave y cámara
    if (this.spaceship && this.spaceship.isAlive) {
      this.spaceship.update(this.keysPressed)
      this.updateCamera()

      // Lógica de disparo
      if (this.keysPressed[' '] && (currentTime - this.lastShotTime > this.shootCooldown)) {
        this.shoot()
        this.lastShotTime = currentTime
      }
    }

    // 2. Actualizar campo de estrellas
    this.starfield.mesh.position.z = this.camera.position.z
    this.starfield.update(this.camera.position.z, this.starfieldPositions)

    // 3. Actualizar proyectiles (y eliminarlos)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i]
      projectile.update()
      if (projectile.mesh.position.z < this.camera.position.z - 200) projectile.isAlive = false

      if (!projectile.isAlive) {
        this.scene.remove(projectile.mesh)
        this.projectiles.splice(i, 1)
      }
    }

    // 4. Actualizar objetivos
    for (const target of this.targets) {
      target.update()
    }

    // 5. Comprobar colisiones
    this.checkCollisions()

    // 6. Generar nuevos objetivos
    if (this.targets.length < this.maxTargets && (currentTime - this.lastTargetSpawnTime > this.spawnTargetInterval)) {
      this.spawnTarget()
      this.lastTargetSpawnTime = currentTime
    }
  }

  /**
   * Actualiza la cámara para que siga suavemente a la nave
   */
  private updateCamera() {
    if (this.spaceship) {
      const shipPosition = this.spaceship.getPosition()
      const cameraTargetPosition = shipPosition.clone().add(this.cameraOffset)
      
      this.camera.position.lerp(cameraTargetPosition, 0.05) 
      this.camera.lookAt(shipPosition)
    }
  }

  /**
   * Crea un nuevo proyectil
   */
  private shoot() {
    if (this.spaceship) {
      const projectile = new Projectile(this.spaceship.getPosition(), this.spaceship.getRotationY())
      this.projectiles.push(projectile)
      this.scene.add(projectile.mesh)
    }
  }

  /**
   * Crea un nuevo objetivo (cubo)
   */
  private spawnTarget() {
    if (!this.spaceship) return 

    const shipPosition = this.spaceship.getPosition()
    const x = (Math.random() - 0.5) * 50 
    const y = shipPosition.y // Mismo plano Y que la nave
    const z = shipPosition.z + (Math.random() * -100) - 50 // Delante de la nave
    
    const position = new Vector3(x, y, z)
    const target = new Target(position)
    this.targets.push(target)
    this.scene.add(target.mesh)
  }

  /**
   * Comprueba colisiones (Nave-Objetivo y Proyectil-Objetivo) usando Box3
   */
  private checkCollisions() {
    // Proyectil vs Objetivo
    for (let pIndex = this.projectiles.length - 1; pIndex >= 0; pIndex--) {
      const projectile = this.projectiles[pIndex]
      if (!projectile.isAlive) continue
      this.projectileBox.setFromObject(projectile.mesh)

      for (let tIndex = this.targets.length - 1; tIndex >= 0; tIndex--) {
        const target = this.targets[tIndex]
        if (!target.isAlive) continue
        this.targetBox.setFromObject(target.mesh)

        if (this.projectileBox.intersectsBox(this.targetBox)) {
          projectile.isAlive = false
          target.isAlive = false
          this.score++
          this.updateScoreUI()
          break 
        }
      }
    }

    // Nave vs Objetivo
    if (this.spaceship && this.spaceship.isAlive) {
      this.shipBox.setFromObject(this.spaceship.model)
      for (const target of this.targets) {
        if (!target.isAlive) continue 
        this.targetBox.setFromObject(target.mesh)

        if (this.shipBox.intersectsBox(this.targetBox)) {
          this.spaceship.isAlive = false
          target.isAlive = false 
          this.endGame()
          break 
        }
      }
    }

    this.cleanupDeadObjects()
  }
  
  /**
   * Limpia los arrays de objetos marcados como "muertos"
   */
  private cleanupDeadObjects() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].isAlive) {
        this.scene.remove(this.projectiles[i].mesh)
        this.projectiles.splice(i, 1)
      }
    }
    for (let i = this.targets.length - 1; i >= 0; i--) {
      if (!this.targets[i].isAlive) {
        this.scene.remove(this.targets[i].mesh)
        this.targets.splice(i, 1)
      }
    }
  }

  private updateScoreUI() {
    this.scoreElement.innerText = this.score.toString()
  }

  /**
   * Finaliza el juego y muestra la pantalla de Game Over
   */
  private endGame() {
    this.gameIsOver = true
    this.isPaused = true 
    this.gameOverElement.style.display = 'flex' 
    document.getElementById('ui')!.style.display = 'none' 
  }

  /**
   * Resetea el juego a su estado inicial
   */
  private resetGame() {
    // Resetear UI
    this.score = 0
    this.updateScoreUI()
    this.gameOverElement.style.display = 'none'
    document.getElementById('ui')!.style.display = 'block'
    
    // **CORRECCIÓN DE VUELO:**
    // Asegurarse de que el título "Mattear" sea visible de nuevo
    if (this.neonTitle) this.neonTitle.visible = true
    
    // Resetear estado del juego
    this.gameIsOver = false
    this.isPaused = false // Empezar a jugar inmediatamente

    // Resetear nave
    if (this.spaceship) {
      this.spaceship.reset()
    }

    // Limpiar todos los proyectiles y objetivos restantes
    this.projectiles.forEach(p => this.scene.remove(p.mesh))
    this.projectiles = []
    this.targets.forEach(t => this.scene.remove(t.mesh))
    this.targets = []

    // Generar nuevos objetivos iniciales
    for (let i = 0; i < 5; i++) {
      this.spawnTarget()
    }
    
    // Resetear cámara
    this.camera.position.set(0, 8, 10)
    this.updateCamera() 
  }

  // --- Manejadores de Eventos ---
  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    
    // Actualizar composer y bloom pass al cambiar tamaño
    this.composer.setSize(window.innerWidth, window.innerHeight)
    this.bloomPass.resolution.set(window.innerWidth, window.innerHeight)
  }

  private onKeyDown(event: KeyboardEvent) {
    this.keysPressed[event.key] = true
  }

  private onKeyUp(event: KeyboardEvent) {
    this.keysPressed[event.key] = false
  }
}

// --- PUNTO DE ENTRADA DE LA APLICACIÓN ---
const canvas = document.getElementById("canvas") as HTMLCanvasElement

if (canvas) {
  new App(canvas)
} else {
  console.error("Error: No se encontró el elemento canvas con id='canvas'.")
}