import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      /*
       * Para subir un anuncio y analizarlo.
       *
       * El tope por defecto es 1 MB, pensado para formularios. Un anuncio de
       * sesenta segundos en 1080p pesa entre cinco y veinte megas, así que sin
       * esto la función no arranca siquiera.
       *
       * Sesenta y cuatro y no más: Next monta el cuerpo entero en memoria y el
       * servidor tiene cuatro gigas. Un tope generoso aquí no habilita nada útil
       * —no hay anuncios de doscientos megas— y sí una forma fácil de tumbar la
       * máquina. El límite real se comprueba otra vez en la acción, con un
       * mensaje que dice cuánto pesaba.
       */
      bodySizeLimit: "64mb",
    },
  },
};

export default nextConfig;
