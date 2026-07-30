# HANDOFF — videos-kling (fábrica B-Roll VSL Biozentra)

> Documento de traspaso para retomar el proyecto en otra sesión/máquina.
> Léelo junto con **CLAUDE.md** (método completo) y **README.md**. Última actualización: 2026-07-03.

═══════════════════════════════════════════════════════════
## 1. QUÉ ES ESTO
═══════════════════════════════════════════════════════════
Fábrica reutilizable de anuncios verticales 9:16 para **Biozentra** (complemento de canela de
Ceilán 12:1 + aceite MCT, 60 softgels, nicho diabetes tipo 2, mercado ES).

Entregable por ad: `output/<BATCH>/<name>.mp4` — video montado 720×1280 con voz/canción pegada,
subtítulos karaoke, headline y música. Los sube después la sesión de `D:\Iteracionking` a Meta Ads
(cuenta `panda4`) usando el runbook correspondiente.

Proveedor por defecto: **kie.ai** (Grok Imagine i2v + nano-banana keyframes). Alternativa: fal.
Credenciales por env var: `KIE_API_KEY`, `FAL_KEY`, `PIAPI_KEY`. NUNCA en archivos/git.

═══════════════════════════════════════════════════════════
## 2. FLUJO OFICIAL (voz-primero) — resumen
═══════════════════════════════════════════════════════════
Detalle en CLAUDE.md §0. En corto:

1. VO por ElevenLabs **toma por toma** (Flash repite con inputs largos — ver memoria).
2. Whisper → `config/cuts_<n>.json` (cortes reales).
3. `cut_audio.mjs` → `audio/<n>/seg_*.wav`.
4. Keyframes nano-banana kie (`batch_keyframes_kie.mjs`) con master + ref-chaining para consistencia.
5. i2v mudo — Grok Imagine kie (`batch_grok_kie.mjs`, 3cr/s, mín 6s) o Kling (`batch_kling3_kie.mjs`).
6. Lipsync SOLO tomas habladas de frente (cartoon→Kling, real→LatentSync). B-roll lleva voz encima.
7. `assemble_voiced.mjs <name> <voz.mp3> [broll_dir] [lip_dir] [cuts.json]`.
8. Post: `capcut_subs.py` (subs) + `banner_hook.py` (headline 1ª toma) + música 12%.

**Cierre de TODO ad = pouch REAL fotorrealista** (ref `assets/pouch/MOCKUP.png`, NEG cartoon/pixar/
altered-text) — NO pixarizado, NO en mano de personaje, para preservar la etiqueta. CTA "Descúbrela en el enlace 👇".

═══════════════════════════════════════════════════════════
## 3. ESTADO ACTUAL (2026-07-03)
═══════════════════════════════════════════════════════════
### LISTO y entregado
- **Serie U1..U6** (board diabetes 233609) → `output/U1..U6/`. Ver memorias project_batch_u*.
- **PR1** (testimonial emocional cuidador, 5 Pixar) → `output/PR1/pr1_ad14/16/23/27/34.mp4`.
  Ads del board 14,16,23,27,34. Cierre pouch fotorrealista. Cuts fusionados (no acortados).
- **SONGS** (formato NUEVO, ad musical sin lipsync) → `output/SONGS/song1/2/3.mp4`.
  Canción Suno pop-uplifting-happy sobre visuales Pixar. Letra abre "Diabetes,", foco miedo.
  song1 "Aquí mando yo" (familia), song2 "Cierra la llave" (mecanismo hígado), song3 "No me vas a cortar" (amputación).
- **Runbook de subida** de ambos batches: `D:\Iteracionking\SUBIR_ADS_PR1_SONGS_BIOZENTRA.md`.

### Pausado / pendiente (esperar OK del usuario)
- **SO1** (personificación metformina-villano, ads board 1,3,26,31,36) — pausado explícitamente.
- Niveles board SO2-6 / PD1 — no iniciados.
- **Omni** (prueba fuera de flujo): guía en `D:\omni\OMNI_GUIA.md` para OTRO Claude. NO tocar desde acá.

═══════════════════════════════════════════════════════════
## 4. QUÉ HAY EN EL REPO vs FUERA
═══════════════════════════════════════════════════════════
El repo es **solo código + config** (`.gitignore` excluye toda media: mp4/png/audio/output/assets/...).
Los videos finales, keyframes, voces y clips viven SOLO en el disco local `D:\videos-kling\`.

- Scripts `.mjs` (pipeline) + `.sh` (finish_pr1 / finish_song) → raíz.
- `config/*.json` → cuts, keyframes, batch_input, kf_map por batch (SÍ versionados).
- `guiones/`, `copies/` → texto (SÍ versionados).
- Post-pro (`capcut_subs.py`, `banner_hook.py`, `tts_eleven.ps1`) viven en `D:\Iteracionking\scripts\`.

═══════════════════════════════════════════════════════════
## 5. DÓNDE ESTÁ EL CONTEXTO VIVO
═══════════════════════════════════════════════════════════
La memoria persistente (`C:\Users\Unda\.claude\projects\D--videos-kling\memory\`) es la fuente de
verdad de decisiones y estado. Índice en `MEMORY.md`. Claves:
- `reference_documento_board_batches` — DOCUMENTO MAESTRO: siempre trabajar de ahí (bajar→ver→iterar).
- `reference_kie_ai_provider`, `reference_grok_imagine_kie` — proveedor/precios.
- `reference_flujo_v4_voiced` — método voz-primero.
- `feedback_cierre_producto_cta` — regla del pouch real + CTA.
- `project_batch_pr1`, `reference_ad_musical_suno` — los dos batches de hoy.
- `reference_subida_ads_panda4` — cómo/dónde se suben (Iteracionking, panda4).

═══════════════════════════════════════════════════════════
## 6. PARA RETOMAR
═══════════════════════════════════════════════════════════
1. Abrir Claude Code desde `D:\videos-kling` (env vars y rutas relativas ya funcionan).
2. Leer memoria + este handoff.
3. Confirmar con el usuario el próximo batch (probablemente SO1 o "algo nuevo").
4. Bajar el video del board, verlo, iterar toma×toma. NO improvisar fuera del documento maestro.
5. Pedir OK antes de cada generación de pago (regla H). Entregar a `output/<BATCH>/` (solo finales).
