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
       * Para los fotogramas de un anuncio analizado.
       *
       * El tope por defecto es 1 MB, pensado para formularios. Aquí suben veinte
       * JPEG y un WAV de voz: unos cuatro megas para un anuncio de un minuto, y
       * hasta ocho para uno de tres.
       *
       * **El vídeo no viaja**: se descompone en el navegador. Por eso esto son
       * dieciséis megas y no sesenta — Next monta el cuerpo entero en memoria y
       * el servidor tiene cuatro gigas.
       */
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
