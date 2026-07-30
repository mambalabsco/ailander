# MANUAL DEL PIPELINE RÁPIDO — para Claude (documento vivo)
**Versión:** 1.0 (2026-07-07) · **Origen:** auditoría Fable→Opus + producción real de demo_1
**Ámbito:** GENERAL — sirve para cualquier marca/producto. Nada de aquí depende de Biozentra; lo específico de cada marca va en variables (ver §1).

---

## 📖 PROTOCOLO DE AUTO-ACTUALIZACIÓN (leer primero)

Este manual es un **documento vivo**. Claude: cada vez que lo uses en una sesión, al TERMINAR el trabajo debes:

1. **Comparar** lo que viviste contra lo que dice el manual: ¿algún tiempo medido cambió? ¿un paso falló de una forma nueva? ¿descubriste un atajo?
2. **Actualizar** la sección afectada EN ESTE ARCHIVO (no crear otro): corrige números con mediciones reales, agrega el error nuevo a §7, sube de estado los pendientes de §8 que hayas implementado.
3. **Registrar** el cambio en el CHANGELOG (§9) con fecha + una línea.
4. **Reglas de edición:** medir antes de escribir números (nunca estimar); si una técnica falla 2+ veces, degradarla o eliminarla; si contradices algo, REEMPLAZA el texto viejo (no acumules versiones contradictorias); mantener este manual GENERAL — lo específico de una marca nunca se hardcodea aquí.

---

## 1. VARIABLES POR MARCA (lo único que cambia entre productos)

Antes de producir para una marca nueva, definir:

| Variable | Ejemplo | Dónde se usa |
|---|---|---|
| `BRAND_VOCAB` | "MarcaX, ingrediente Y, término Z…" | seed de whisper (solo fallback) |
| Imagen REAL del packaging | `assets/<marca>/pouch.png` → subir a CDN con `upload_asset.mjs` | keyframe de cierre (NUNCA inventar packaging con IA) |
| Masters de personajes | `config/kf_map_<marca>masters.json` (n→URL) | consistencia visual entre ads |
| Voces (IDs ElevenLabs) | `{narr, villano, heroe…}` | `config/<ad>.json` |
| CTA de cierre | "Descúbrela en el enlace de aquí abajo" | última toma |
| Campo `sub` por toma | guion dice "eme ce te" → sub dice "MCT" | subtítulos (ver §3) |

**Regla del campo `sub`:** el `guion`/`text` de cada toma se escribe FONÉTICO para la voz (siglas deletreadas, números en palabras). Toda toma con grafía fonética lleva además un `sub` con la forma de pantalla. Las demás tomas no lo necesitan.

---

## 2. FLUJO RÁPIDO (el camino validado, por ad)

```
guion (config/<ad>.json) 
  → node gen_vo.mjs config/<ad>.json          # voz + words_<ad>.json + cuts_<ad>.json  (~$0.02, segundos)
  → keyframes (batch_keyframes_kie.mjs)        # ~$0.02/img
  → ⚠️ QC VISUAL: MIRAR los PNG antes del i2v  # ver §4 — obligatorio
  → i2v (batch_grok_kie.mjs / kling)           # el gasto grande (~$0.015-0.07/s)
  → node assemble_voiced.mjs <ad> <voz> …      # normaliza+concatena+pega voz
  → node make_subs.mjs <ad> --words config/words_<ad>.json --cuts config/cuts_<ad>.json --out <A>   # <1s
  → ffmpeg quemado final: subs + headline + música   # ~50s por 60s de video
```

Costo de referencia de un ad de ~60s / 6 tomas (Grok 720p): **~$1.05** (voz $0.02 + keyframes $0.14 + i2v $0.90). Tiempo de pared: ~10-15 min por ad si se hace secuencial.

---

## 3. SUBTÍTULOS: timestamps de ElevenLabs (NUNCA whisper como default)

**La regla de oro:** el timing de los subs sale de la MISMA llamada que genera la voz. `gen_vo.mjs` usa el endpoint `/with-timestamps` de ElevenLabs → `config/words_<ad>.json` con cada palabra y su tiempo exacto.

Por qué esto y no whisper (aprendido con dolor):
- **Whisper SUELTA palabras** de forma no-determinista — incluida la MARCA en el CTA. Ningún `sed`/corrección puede AGREGAR una palabra que falta.
- Los timestamps de EL son **gratis** (EL cobra por carácter, no por endpoint), **deterministas** y **completos** (sabe cuándo dijo cada carácter).
- El único precio: EL guarda el texto fonético tal cual → por eso existe el campo `sub` (§1).

`make_subs.mjs` (modo EL, default): alinea el texto de display (`sub`||`guion`) contra el timing de EL por LCS → .ass karaoke en el estilo aprobado. **Sin whisper, sin sed de correcciones.**

**Fallback** (solo voces viejas sin `words_<ad>.json`): whisper sembrado con `--prompt "$BRAND_VOCAB"` + `make_subs.mjs --from-ass` que recupera drops SOLO si hay hueco temporal real ≥0.3s (sin ese guard, duplica palabras que whisper ya normalizó — bug real que pasó).

---

## 4. QC DE KEYFRAMES — pausa obligatoria antes del i2v

**Mirar los PNG generados ANTES de lanzar el i2v. Siempre.** Es la mejor relación costo/beneficio de todo el pipeline: regenerar un keyframe malo cuesta ~$0.02; dejarlo pasar cuesta la toma de i2v (~$0.10-0.90) + retrabajo + tiempo.

Qué revisar en cada keyframe:
- **Mecanismo legible:** ¿la acción del guion se ENTIENDE en la imagen? (caso real: héroe "echando aceite" salió echando esferas → confuso → regenerado con prompt más explícito: "glowing translucent AMBER OIL (liquid, like honey) from a small bottle").
- **Continuidad:** objetos que persisten entre tomas (la misma célula/puerta/set) deben verse iguales. Usar ref-chaining.
- **Personaje consistente** con su master (misma cara, sin props inventados — "no drink in hand" tuvo que ser explícito).
- **Packaging real intacto** en la toma de cierre (label sin deformar).

Si un KF falla: armar un JSON de 1 toma con el prompt corregido, regenerar solo esa, y verificar que `batch_input_<ad>.json` apunte a la URL nueva (el script hace merge por `n` automáticamente).

---

## 5. FALLOS DE GENERACIÓN — el retry es flujo normal, no excepción

Tasa observada: **~1 de cada 7 llamadas i2v falla** (kie.ai). Protocolo:

1. Leer el motivo en `batch_log_<proveedor>.json` (`error` por toma).
2. **`fetch failed` / timeout / 500** → transitorio de red: reintentar la MISMA toma (JSON `_miss` con solo las que faltan). Funciona casi siempre.
3. **Fallo de moderación** (failCode de contenido) → NO reintentar igual: cambiar el prompt primero (reintentar a ciegas quema tiempo y créditos).
4. Tras descargar, desconfiar de `existsSync` como señal de éxito: un mp4 truncado pasa el check. Validar con ffprobe (duración >0 y ≈ la pedida) si algo se ve raro.
5. Los polls largos (>2 min) SIEMPRE en background — un batch de 6 tomas i2v tarda ~4 min.

---

## 6. DÓNDE SE VA EL TIEMPO (medido, no estimado) y cómo recortarlo

| Fase | Tiempo (ad de 60s) | Naturaleza | Cómo acelerar |
|---|---|---|---|
| Voz + words | segundos | API | paralelizable entre ads (casi lineal) |
| Keyframes | ~1-2 min | espera API | ya paralelo dentro del ad; entre ads casi lineal |
| i2v | ~4-5 min | espera API | **paralelizar entre ads = la ganancia grande (3-5x)** — es espera, no CPU |
| Subs | <1s | local | resuelto (era ~90s con whisper) |
| Assemble | ~30-40s | encode CPU | `-preset ultrafast` en clips intermedios (la calidad la fija el quemado final) |
| Quemado final | ~50s | encode CPU | es EL cuello local; headline y música van gratis dentro del mismo filter_complex |

Claves:
- **El video se codifica 2 veces** (normalización por clip + quemado final). El quick-win es abaratar la primera (`ultrafast`); el máximo es una sola pasada con filtro `concat` (probar contra un ad entregado antes de adoptar).
- **Paralelismo de encodes ≠ paralelismo de APIs:** x264 ya usa varios núcleos → 3-4 finish en paralelo dan ~2-2.5x, no 4x. En cambio paralelizar la GENERACIÓN entre ads (espera de API) sí es casi lineal. Priorizar lo segundo.
- Para iterar barato: i2v en 480p (≈ mitad de precio), regenerar a 720p solo tomas aprobadas.

---

## 6b. MONOS QUE HABLAN (lip-sync) — qué se puede y qué no

**Grok/Kling i2v NO sincroniza la boca a los fonemas** — no reciben audio, solo imagen+prompt. Lo máximo que dan con `"mouth opening and closing as it talks"` es aleteo genérico. Los timestamps NO arreglan esto (Grok no los recibe).

**La boca buena sale de un pase de lip-sync dedicado** (Kling LipSync audio-to-video en fal, $0.014/5s). Toma el clip mudo + el audio de esa toma → deforma la boca al waveform. **Probado (2026-07-07): funciona y la boca articula bien en caricatura** (abre/cierra/forma vocales manteniendo ojos y expresión).

⚠️ **RESTRICCIÓN CRÍTICA — el lip-sync exige una cara con proporciones humanas:**
- ✅ FUNCIONA: personaje con cabeza redondeada + ojos + boca en posición facial (ej. blob/gota-con-cara-tipo-Emoji-Movie, humano, animal antropomorfo).
- ❌ FALLA con `face_detection_error`: formas abstractas sin cara clara (cubo con lentes de sol, gota teardrop con ojos muy arriba, objeto sin boca definida).

**Implicación de diseño:** si un personaje DEBE mover la boca, diséñalo con cara human-like (ojos+boca en cabeza redonda). Los mascots abstractos (cubos, gotas, cápsulas) → dejarlos como b-roll con voz encima (la voz + subtítulos llevan la palabra); no gastes en lip-sync que va a fallar.

**Dónde ayudan los timestamps en este flujo:**
1. Cortar el audio EXACTO por toma en límite de palabra (ver §3) → no cortás a mitad de palabra.
2. Kling LipSync tope = video 2–10s. Tomas más largas → cortar en un límite de palabra <10s usando `words_<ad>.json` (no a ciegas).
3. Saber qué tomas tienen habla → lipsyncar solo esas, no todas.

**Flujo:** `config/lipsync_<ad>.json = [{n, video:"clips/<ad>/raw_<n>.mp4", audio:"audio/<BATCH>/<ad>/seg_<n>.mp3"}]` → `node batch_lipsync_fal.mjs config/lipsync_<ad>.json clips/<ad>_sync`. `assemble_voiced` ya prefiere `lip_<n>.mp4` sobre `raw_<n>.mp4` automáticamente. Truco (memoria): concatenar tomas habladas del mismo personaje en 1 llamada para ahorrar. Para caras REALES (no caricatura), LatentSync/Sync rinde mejor que Kling.

---

## 7. ERRORES CONOCIDOS (agregar aquí cada error nuevo)

| Error | Causa | Fix |
|---|---|---|
| Subs muestran "eme ce te" | texto fonético usado como display | campo `sub` en esa toma (§1) |
| Falta una palabra en subs (p.ej. la marca en el CTA) | se usó whisper como fuente | usar modo EL de make_subs (§3) |
| Palabra duplicada en subs ("12 a doce 1") | recuperación sin guard de hueco | RECOVER_MIN_GAP≥0.3s ya en make_subs |
| i2v `fetch failed` | red transitoria kie | retry de esa toma sola (§5) |
| Keyframe con mecanismo confuso | prompt ambiguo sobre la acción/material | explicitar material y gesto; QC §4 |
| Personaje con props inventados | el modelo agrega objetos | negativos explícitos ("no drink in hand") |
| mp4 truncado cuenta como éxito | check por existsSync | validar con ffprobe |
| Batch se cuelga en foreground | poll >2 min en foreground | run_in_background para i2v |
| Script rompe en máquina nueva | rutas hardcoded a sesiones/instalaciones | env vars + PATH + logs/ en repo (ya aplicado) |
| ElevenLabs repite frases | inputs largos en Flash | generar VO toma por toma (ya es el diseño de gen_vo) |
| Lip-sync `face_detection_error` (422) | personaje sin cara human-like (cubo, gota abstracta) | §6b: solo lipsyncar caras redondeadas con ojos+boca; abstractos van con voz encima |
| Lip-sync falla por duración | clip >10s (tope de Kling LipSync) | cortar en límite de palabra <10s con words_<ad>.json |

---

## 8. PENDIENTES DE VELOCIDAD (actualizar estado al implementar)

| Estado | Cambio | Ganancia esperada |
|---|---|---|
| ✅ HECHO | Subs por timestamps EL (gen_vo + make_subs + `sub`) | −90s/ad, CTA nunca se cae |
| ✅ HECHO | Rutas portables, keys por env var | sesiones nuevas sin parches |
| ❌ DESCARTADO | Cablear make_subs modo EL en finish_batch.sh (default) | decisión del usuario 2026-07-17: daba muchos problemas — NO retomar |
| ⬜ P0 | Paralelizar run_batch entre ads (cap 2-3 por los 500 de kie) | 3-5x en batch de 5 ads (es espera API) |
| ⬜ P1 | `-preset ultrafast` en clips intermedios de assemble | ~−30s/ad, 1 línea |
| ⬜ P1 | Validación ffprobe post-descarga + retry que distinga moderación | evita outputs corruptos y créditos quemados |
| ⬜ P2 | Single-pass concat (un solo encode total) | −50s/ad más; probar A/B antes |
| ⬜ P2 | Consolidar scripts duplicados en lib común; config/ por batch | mantenimiento |
| ⬜ P2 | Draft 480p para iteración | ~−45% costo i2v en pruebas |

---

## 9. CHANGELOG (una línea por sesión que modifique este manual)

- **2026-07-07 v1.0** — Creación. Basado en la auditoría Fable→Opus + producción end-to-end de demo_1 (~$1.07, 59.83s). Números de §6 medidos en esa corrida (16 cores, x264 medium crf18).
- **2026-07-07 v1.1** — Agregada §6b (lip-sync de monos). Test en demo_1: Kling LipSync articula bien la boca en caricatura PERO exige cara human-like (insulina ✅; villano-cubo y gota-MCT ❌ face_detection_error). Los timestamps ayudan a cortar en límite de palabra <10s. +2 errores en §7.
