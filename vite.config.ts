import { defineConfig } from 'vite'

export default defineConfig({
  // Esto es lo que arregla el error 404.
  // Le dice al navegador que busque los archivos dentro de la carpeta del repo.
  base: '/example_threejs/',
})