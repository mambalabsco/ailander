# Pipeline de B-Roll para VSL — PiAPI + Kling 3.0
# Carpeta: videos-kling. Entorno separado de la fábrica fal/Kling 2.6 Pro en videos-broll.
# Propósito: probar Kling 3.0 (mejor calidad, multi-shot, audio nativo) y comparar contra fal.

═══════════════════════════════════════════════════════════
QUÉ ENTREGA
═══════════════════════════════════════════════════════════
Video vertical 9:16 montado CON la voz del narrador pegada y sincronizada: b-roll en orden,
cortes secos, cada toma dura lo que su frase narrada. (Flujo voz-primero, sección MÉTODO 0.)
Subtítulos y música los pone el usuario en el editor.
Entregable principal: final_<n>_voiced.mp4 + clips_<n>/ numerados + clips_sync_<n>/ (tomas lipsync).
NUNCA sobreescribir un output anterior — cada video tiene su propio archivo (_voiced no sobreescribe).

═══════════════════════════════════════════════════════════
CÓMO SE USA (fábrica reutilizable)
═══════════════════════════════════════════════════════════
1. Para cada video nuevo: BRIEF + GUION. El usuario GRABA la voz completa (una pista por video).
2. Yo aplico el FLUJO OFICIAL (MÉTODO sección 0): transcribo la voz, derivo los cortes reales,
   genero keyframes, animo en Kling, lipsync en las tomas habladas, y monto con la voz pegada.
3. El método NO cambia entre productos; solo cambia el brief y la voz.

═══════════════════════════════════════════════════════════
ESTRUCTURA DE CARPETAS (reorganizado 2026-06-07)
═══════════════════════════════════════════════════════════
Todo agrupado por TIPO, con subcarpeta por versión (<name> = v1, v2, v4, v5, v7…).
Los scripts (.mjs) viven en la raíz; sus defaults YA apuntan a estas rutas.

  scripts (.mjs) + package.json    → RAÍZ
  assets/<name>/    kf_<n>.png      ← keyframes (batch_keyframes_fal.mjs)
  assets/_shared/   biozentra_pouch.png  (producto real, ref para nano-banana)
  assets/_legacy/                   (keyframes del primer run PiAPI)
  audio/<name>/     seg_<n>.wav     ← cortes de voz (cut_audio.mjs)
  clips/<name>/     raw_<n>.mp4     ← i2v mudo (batch_kling3 / batch_kling26)
  clips/<name>_sync/ lip_<n>.mp4    ← lipsync (batch_lipsync_fal / _sync)
  clips/_legacy/                    (clips del primer run PiAPI)
  config/   cuts_<n>.json, keyframes_input_<n>.json, batch_input_<n>.json,
            kf_map_<n>.json, lipsync_input_<n>.json, transcript_<n>.json
  guiones/  guion_<n>.md, shotlist_<n>.md, index_<n>.md
  output/   final_<name>_voiced.mp4  (entregables finales — NUNCA sobreescribir)
  "Videos a iterar/"   voces grabadas (V<n>.mp3) + videos originales de referencia

REGLA: al correr los scripts pasar las rutas nuevas (ej. config/cuts_v7.json,
clips/v7, clips/v7_sync). Los defaults de cada script ya usan esta convención.

═══════════════════════════════════════════════════════════
MÉTODO
═══════════════════════════════════════════════════════════

## 0. FLUJO OFICIAL — VOZ PRIMERO (DEFAULT, usar SIEMPRE)
# Validado en V4 ("Mi Esposo Es Diabético", Biozentra) → final_v4_voiced.mp4 salió bien.
# Reemplaza el viejo flujo "video mudo + estimar tiempos + freeze frames a ojo".
# IDEA CLAVE: la VOZ REAL grabada es la fuente de verdad del timing. Todo se sincroniza a ella;
# cada toma dura EXACTAMENTE lo que dura su frase narrada → sincronía perfecta, sin freeze a ojo.
# Todo corre en fal (requiere FAL_KEY). Entregable final: final_<n>_voiced.mp4 (CON la voz pegada).

PASOS (ej. nombre = v4):
1. El usuario graba la VOZ COMPLETA → un solo archivo (ej. "Videos a iterar/V4.mp3").
2. node transcribe_fal.mjs <voz> v4 es        → config/transcript_v4.json (Whisper word-level, timestamps).
                                                  Barato, sin gate de aprobación.
3. Armar a mano config/cuts_v4.json = [{n,start,end,guion}] por toma, usando los timestamps REALES de
   dónde respira la narradora (NO estimar). Una toma = una frase/beat del guion.
4. node cut_audio.mjs config/cuts_v4.json <voz> audio/v4   → audio/v4/seg_<n>.wav (corte exacto por toma).
5. Keyframes con batch_keyframes_kie.mjs (DEFAULT, kie.ai, ~$0.02/img) — o batch_keyframes_fal.mjs (alternativa) → assets/v4/kf_<n>.png + config/kf_map_v4.json (n→URL)
   + config/batch_input_v4.json (listo para Kling).
6. Video i2v MUDO — mismo config/batch_input_<n>.json (ver "DOS MODELOS" abajo):
   · Kling 3.0 vía kie.ai (DEFAULT, ~$0.07/s): node batch_kling3_kie.mjs config/batch_input_v4.json clips/v4 std → clips/v4/raw_<n>.mp4
   · Kling 3.0 vía fal (alternativa, $0.112/s): node batch_kling3.mjs  config/batch_input_v4.json clips/v4       → clips/v4/raw_<n>.mp4
   · Kling 2.6 Pro (fal, presupuesto): node batch_kling26.mjs config/batch_input_v4.json clips/v4_k26   → clips/v4_k26/raw_<n>.mp4
   (Ambos generate_audio:false. Carpetas separadas → nunca se pisan; se pueden tener los dos a la vez.)
7. LIPSYNC HÍBRIDO — SOLO las tomas con personaje hablando DE FRENTE:
   config/lipsync_input_v4.json = [{n,video,audio}] → node batch_lipsync_fal.mjs config/lipsync_input_v4.json clips/v4_sync
   → clips/v4_sync/lip_<n>.mp4. (Kling LipSync, $0.014/5s.) Las tomas de b-roll puro
   (anatomía, producto, manos, paisaje) NO se lipsyncan: llevan la voz encima.
8. node assemble_voiced.mjs v4 "Videos a iterar/V4.mp3"   → output/final_v4_voiced.mp4.
   El script recorta cada clip a la duración de su cut, prefiere lip_<n>.mp4 sobre raw_<n>.mp4,
   normaliza 720x1280/30fps/h264, concatena y pega la voz completa. NO sobreescribe.

NOTA: con este flujo el recorte de cada toma lo hace assemble_voiced.mjs automáticamente desde cuts.
La regla de duración (sección I) aplica solo a CUÁNTOS segundos generar en Kling (5 vs 10), no al recorte.

## 0b. DOS MODELOS DE ANIMACIÓN (elegir por video; se pueden comparar lado a lado)
# El paso 6 (i2v) tiene DOS scripts gemelos. Comparten el MISMO batch_input_<n>.json
# (mismos keyframes y prompts). Cada uno saca a su propia carpeta → conviven sin pisarse.

| Modelo     | Script             | Carpeta out (ej. v4) | duration        | Imagen           | Precio   |
|------------|--------------------|----------------------|-----------------|------------------|----------|
| Kling 3.0  | batch_kling3.mjs   | clips_v4/            | entero 3–15     | start_image_url  | $0.112/s |
| Kling 2.6  | batch_kling26.mjs  | clips_v4_k26/        | solo "5"/"10" * | image_url        | $0.07/s  |
* batch_kling26.mjs mapea los enteros del JSON automáticamente: ≤5→"5", >5→"10" (lo muestra en la tabla).

PARA COMPARAR el mismo video en ambos modelos sin sobreescribir nada:
  · 3.0:  node batch_kling3.mjs  batch_input_v4.json clips_v4
          (lipsync) lipsync_input_v4.json     → clips_sync_v4
          node assemble_voiced.mjs v4      "Videos a iterar/V4.mp3"                                   → final_v4_voiced.mp4
  · 2.6:  node batch_kling26.mjs batch_input_v4.json clips_v4_k26
          (lipsync) lipsync_input_v4_k26.json → clips_sync_v4_k26   (apunta a clips_v4_k26/)
          node assemble_voiced.mjs v4_k26 "Videos a iterar/V4.mp3" clips_v4_k26 clips_sync_v4_k26 cuts_v4.json → final_v4_k26_voiced.mp4
Misma voz, mismos cuts, mismos keyframes → la ÚNICA variable que cambia es el modelo de animación.

EXPERIMENTO V4 (2026-06-07): generados los dos. 3.0 = final_v4_voiced.mp4 (12MB), 2.6 = final_v4_k26_voiced.mp4 (9.9MB),
ambos 72.27s. Costo i2v: 3.0 ≈ usado antes; 2.6 = $7.35 (13 tomas) + lipsync $0.06. Comparar calidad de animación
de personaje (3.0 anima más el cuerpo; 2.6 tiende a mover más la cámara). El veredicto de cuál usar lo decide el operador.

## A. FLUJO IMAGEN→VIDEO
KEYFRAME (imagen fija vertical 9:16 alta resolución) → ANIMAR con Kling 3.0 vía PiAPI.
Para tomas de producto: imagen REAL del packaging (NUNCA inventado con IA — sale falso).

## B. ESTRUCTURA DE VENTA
HOOK → AGITAR → AUTORIDAD → HISTORIA/CASO → MECANISMO (villano + solución) → ORIGEN/PRUEBA
→ TRANSFORMACIÓN → PRODUCTO → URGENCIA/GARANTÍA → CTA. No todos usan todas.

## C. ROLES DE ESTILO (uno por toma)
- STORY   → personaje/testimonio/experto. "Pixar-style 3D animation, warm cinematic lighting"
- SCIENCE → anatomía/moléculas/mecanismo. "hyperreal medical 3D render / scientific CGI"
- EMOTION → miedo/lucha/metáfora. "dark cinematic, dramatic lighting, moody"
- CONCEPT → producto sin marca. Ingredientes/cápsulas genéricas. El packaging real lo meto vía nano-banana o en editor.

## D. COHERENCIA VISUAL
- ANCLA DE ESTILO: una MISMA frase de render en TODOS los keyframes del video, definida en el brief.
- ACENTO DE COLOR compartido en todas las tomas (sutil en CGI clínico, protagonista en CONCEPT).
- Misma LENTE/tratamiento en todas.
- CONTRASTE intencional permitido (problema oscuro vs solución cálida) — no igualar todo.
- Personajes/objetos recurrentes: reusar su MISMO keyframe base.

## E. ANIMACIÓN ATERRIZADA (evitar "flotar en el vacío")
Cada prompt lleva:
1. ANCLAJE FÍSICO (mesa, suelo, mano — nunca el vacío).
2. ACCIÓN CON PROPÓSITO (gesto significativo, no solo "moverse/girar").
3. CÁMARA CONCRETA Y LENTA ("slow push-in", "slow pan"). Evitar "orbit".
negative_prompt: "floating in void, spinning, orbiting, weightless, screensaver, empty background,
static posing at camera, deformed hands, deformed face, extra fingers, text, watermark, logo, blurry,
talking mouth closeup"

## F. LIPSYNC (voz va aparte)
Personajes en plano medio gesticulando; NO foco en boca. La palabra la lleva la voz + subtítulos.
Preferir animación estilizada sobre realistas hablando en primer plano.

## G. PRODUCTO REAL
Packaging NUNCA se inventa. Subir imagen real, colocarla en escena con nano-banana, después animar.
Describir el tipo según el brief (pouch/bolsa, frasco, caja).

## H. CONTROL DE GASTO
- Pedir OK antes de CADA generación de pago. NO reintentar sin avisar.
- Probar 1 toma antes de lanzar el lote.
- LOTES PARALELOS: mostrar tabla completa (toma | prompt | costo) y esperar OK — todo se cobra de golpe.

## I. REGLA DE DURACIÓN DE TOMA (versión OPTIMIZADA PARA AHORRO)
Kling entrega clips ~4.8-4.9 s reales cuando se piden "5 s". En vez de subir todo a "10 s", combinar:

| Tramo de voz     | duration | Nota |
|------------------|----------|------|
| ≤ 5.5 s          | "5"      | Si necesita 5.0–5.5 s: congelar último frame 0.1–0.5 s en editor. Imperceptible, ahorra $0.50/toma. |
| 5.5 s – 10 s     | "10"     | $1.00/clip — solo cuando realmente necesario. |
| > 10 s           | PARTIR   | Dividir en 2 tomas con planos distintos. |

POR QUÉ 5.5 Y NO 5.0: Estirar 0.1–0.5 s del último frame (freeze frame en Premiere/CapCut) no se nota
porque es el último instante antes del corte. Estirar > 0.5 s sí se nota — ahí usar "10".
AHORRO TÍPICO: un VSL de 14 tomas con 5 "casi 5 s" = ~$2.50 extra innecesarios sin esta regla.
NOTA PARA EL EDITOR: el index_<SHOTLIST>.md indica las tomas que necesitan freeze frame y cuántos
segundos estirar. Es 1 click en la mayoría de editores.

═══════════════════════════════════════════════════════════
HERRAMIENTAS PiAPI (usar EXACTAMENTE así)
═══════════════════════════════════════════════════════════

### KEYFRAME — Nano Banana 2 vía PiAPI
Endpoint: POST https://api.piapi.ai/api/v1/task
Body:
{
  "model": "gemini",
  "task_type": "nano-banana-2",
  "input": {
    "prompt": "...",
    "aspect_ratio": "9:16",
    "output_format": "png",
    "resolution": "1K",
    "safety_level": "high",
    "image_urls": ["https://..."]   ← SOLO si hay imagen de referencia (array, NO base64, NO string)
  }
}
Headers: x-api-key: <PIAPI_KEY>
Costo: $0.06/imagen (1K). nano-banana-pro existe pero cuesta $0.105 — usar nano-banana-2.
IMPORTANTE: NO acepta base64. Para imágenes locales: subir a fal storage primero.
Output URL: data.output.image_url (ephemeral — descargar y re-subir a CDN antes de animar).

### VIDEO — Kling 3.0 image-to-video vía PiAPI
Endpoint: POST https://api.piapi.ai/api/v1/task
Body:
{
  "model": "kling",
  "task_type": "video_generation",
  "input": {
    "version": "3.0",
    "mode": "std",          ← "std" = 720p, "pro" = 1080p. NO existe "i2v" ni campo "resolution".
    "image_url": "<URL del keyframe>",
    "prompt": "<prompt animación>",
    "duration": 5,          ← INTEGER (no string). El modo i2v se activa con image_url, no con mode.
    "aspect_ratio": "9:16",
    "enable_audio": false
  }
}
Headers: x-api-key: <PIAPI_KEY>
Devuelve task_id INMEDIATAMENTE → polling con GET /api/v1/task/{task_id} hasta status=completed.
Video URL en respuesta: data.output.video como STRING DIRECTO (no .resource ni .resource_without_watermark).
Costo: 720p sin audio = $0.10/s = $0.50 por clip de 5s. (1080p mode "pro" = $0.75/clip)

### PARALELO
PiAPI es ASÍNCRONO NATIVO — sin cola, sin límite visible de concurrencia.
Disparar TODOS los task POSTs casi al mismo tiempo (Promise.all sobre el array de shots), guardar
los task_ids, hacer polling de todos hasta que cada uno esté completed, descargar.

═══════════════════════════════════════════════════════════
PRECIOS REALES (verificados mayo 2026 desde piapi.ai/kling-3-0)
═══════════════════════════════════════════════════════════
| Herramienta                    | Precio       | Nota                              |
|--------------------------------|--------------|-----------------------------------|
| nano-banana-2 keyframe (1K)    | $0.06/img    | model:"gemini" task:"nano-banana-2" — DEFAULT |
| nano-banana-pro keyframe (1K)  | $0.105/img   | model:"gemini" task:"nano-banana-pro" — NO usar |
| Kling 3.0 720p sin audio       | $0.10/s      | $0.50 clip 5s — DEFAULT producción (mode:"std") |
| Kling 3.0 720p con audio       | $0.15/s      | NO usar (voz va aparte)           |
| Kling 3.0 1080p sin audio      | $0.15/s      | $0.75 clip 5s — héroe/producto (mode:"pro") |
| Kling 3.0 1080p con audio      | $0.20/s      | NO usar                           |

═══════════════════════════════════════════════════════════
CUMPLIMIENTO
═══════════════════════════════════════════════════════════
No inventar credenciales médicas, testimonios ni aprobaciones oficiales.
Categoría salud (diabetes): claims fuertes son responsabilidad del operador, incluir disclaimer.

═══════════════════════════════════════════════════════════
QUÉ DEBE TRAER UN BRIEF
═══════════════════════════════════════════════════════════
- Producto: nombre, qué es, ingrediente clave, tipo de packaging real + imagen del producto.
- Avatar/cliente objetivo e idioma.
- Guion + VO_DURATION + TIMECODES (idealmente).
- ANCLA DE ESTILO de ese video.
- ACENTO DE COLOR de la marca.
- Personajes recurrentes y sus descripciones.
- Paletas por "mundo" si hay contraste intencional.
- Claims permitidos y disclaimer.

═══════════════════════════════════════════════════════════
PROVEEDOR POR DEFECTO — kie.ai (más barato, mismo Kling 3.0 y nano-banana)  ⭐
═══════════════════════════════════════════════════════════
Desde 2026-06-09 el i2v Y los keyframes se hacen por DEFECTO en kie.ai (router económico).
Mismo método, mismos JSON (batch_input / keyframes_input intercambiables con fal). NO mezclar dentro de un lote.
Probado: misma calidad que fal, SIN marca de agua, referencias de personaje funcionan igual.

| Paso       | Script (kie.ai)            | Modelo                    | Precio real probado            |
|------------|----------------------------|---------------------------|--------------------------------|
| Keyframe   | batch_keyframes_kie.mjs    | google/nano-banana(-edit) | 4 créditos ≈ $0.02/img (½ de fal) |
| Video i2v  | batch_kling3_kie.mjs       | kling-3.0/video           | 70 cr/5s ≈ $0.07/s (vs $0.112 fal) |
| Subir img  | upload_asset.mjs (fal CDN) | —                         | (kie acepta URLs públicas de fal CDN) |
| Montaje    | assemble_voiced.mjs        | ffmpeg                    | igual                          |

Créditos kie ≈ $0.005 c/u (el costo REAL lo reporta creditsConsumed al terminar). Min top-up bajo; 5.000 gratis al registrarse.

### kie.ai — VIDEO: batch_kling3_kie.mjs
USO:  node batch_kling3_kie.mjs [batch_input.json] [clips_dir] [mode]   (mode: std=720p DEFAULT, pro=1080p, 4K)
- endpoint: POST https://api.kie.ai/api/v1/jobs/createTask  ·  poll GET /jobs/recordInfo?taskId=…
- model "kling-3.0/video"; input: { prompt, image_urls:[url], duration:"5", aspect_ratio:"9:16", mode, sound:false, multi_shots:false }
- OJO: el campo multi_shots es OBLIGATORIO (si falta → 422 "multi_shots cannot be empty"). Ya va en el script.
- resultado: resultJson (STRING) → parse → resultUrls[0]. Salida 724×1268 ≈ 720p (assemble normaliza a 720×1280).
- std (720p) es lo correcto porque el entregable final es 720×1280; pro (1080p) cuesta ~como fal.
- Mismo batch_input.json que fal (n/image_url/prompt/duration). negative_prompt/cfg NO los usa este router.

### kie.ai — KEYFRAME: batch_keyframes_kie.mjs
USO:  node batch_keyframes_kie.mjs <keyframes_input.json> [nombre_lote]
- sin refs → model "google/nano-banana" (t2i)  ·  con refs → "google/nano-banana-edit" (image_urls, hasta 10)
- 9:16, png. Referencias = consistencia de personaje (master + ref-chaining), IGUAL que fal. Probado OK.
- Mismo formato e idénticas salidas que batch_keyframes_fal.mjs (assets/<lote>/, kf_map, batch_input).

### Credencial kie.ai (variable de entorno)
- KIE_API_KEY   (guardada como variable de usuario de Windows el 2026-06-09; nunca en archivos/git).

═══════════════════════════════════════════════════════════
SEGUNDO PROVEEDOR — fal (alternativa; antes era default)
═══════════════════════════════════════════════════════════
Esta carpeta soporta DOS proveedores para el MISMO método (sección MÉTODO arriba no cambia).
Elegir uno por video según calidad/precio/disponibilidad. NO mezclar dentro de un mismo lote.

| Paso       | PiAPI (default de esta carpeta) | fal (alternativa)              |
|------------|---------------------------------|--------------------------------|
| Keyframe   | batch_keyframes.mjs (nano-banana-2) | batch_keyframes_fal.mjs (nano-banana) |
| Video i2v  | batch_piapi.mjs (Kling 3.0)     | batch_kling3.mjs (Kling 3.0 v3 Pro) |
| Subir img  | upload_asset.mjs (fal storage)  | upload_asset.mjs (fal storage) |
| Montaje    | assemble.mjs (ffmpeg)           | assemble.mjs (ffmpeg)          |

NOTA: upload_asset.mjs y assemble.mjs son compartidos por ambos proveedores.
El PiAPI también usa fal storage para subir imágenes locales (nano-banana no acepta base64).

### Credenciales (variables de entorno)
- PiAPI:  PIAPI_KEY
- fal:    FAL_KEY
Nunca commitear las keys. Van por env var, no en archivos.

### fal — VIDEO: batch_kling3.mjs
USO:  node batch_kling3.mjs [batch_input.json] [clips_dir]   (default clips_dir = clips_v3/)
- endpoint: fal-ai/kling-video/v3/pro/image-to-video
- campo de imagen: start_image_url (NO image_url como en PiAPI)
- generate_audio forzado a false (mudo, voz va aparte)
- duration: entero 3–15
- precio: $0.112/s sin audio (Kling 3.0 Pro / 1080p). Anima mucho más que 2.6.
FORMATO batch_input.json:
  [ { "n":"01", "image_url":"https://…", "prompt":"…", "duration":5|10,
      "negative_prompt":"(opcional)", "cfg_scale":0.5 (opcional) } ]
Muestra tabla de aprobación y pide "OK" antes de gastar (regla H de control de gasto).

### fal — KEYFRAME: batch_keyframes_fal.mjs
USO:  node batch_keyframes_fal.mjs [keyframes_input.json] [out_dir]   (default out_dir = assets/)
- sin refs → fal-ai/nano-banana (texto→imagen)
- con refs → fal-ai/nano-banana/edit (image_urls de referencia, para consistencia de personajes)
- 9:16, png. precio aprox $0.039/img.
FORMATO keyframes_input.json:
  [ { "n":"01", "prompt":"…", "refs":["https://…"] (opcional), "out":"kf_01.png" (opcional) } ]

### fal — SUBIR IMAGEN LOCAL: upload_asset.mjs
USO:  node upload_asset.mjs <ruta_local>   → imprime la URL de fal storage (CDN).
Necesario porque nano-banana (ambos proveedores) NO acepta base64.
