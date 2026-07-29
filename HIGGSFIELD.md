# Higgsfield: las dos vías

Higgsfield son **dos productos distintos** con catálogos distintos, credenciales
distintas y capacidades distintas. La plataforma usa las dos y las junta en un
solo selector, pero conviene saber cuál es cuál.

| | API de clave | CLI |
|---|---|---|
| Dónde | `platform.higgsfield.ai` | `node_modules/.bin/higgsfield` |
| Credencial | id + secreto, en Configuración | sesión OAuth de navegador |
| Modelos en esta cuenta | 7 | 40+ |
| Nano Banana Pro | **no** | **sí** (`nano_banana_2`) |
| Foto del producto como referencia | **no** | **sí**, hasta 14 |
| Coste por adelantado | lo dice | no |

Que Nano Banana Pro no está en la API no es una suposición: se probaron 56
combinaciones de nombre, todas 404, con un control que distinguía «no existe»
(404) de «existe pero tu plan no lo incluye» (423).

## El paso que tienes que dar tú

El CLI ya está instalado como dependencia del proyecto. Lo único que falta es
iniciar sesión, **una vez**, en la máquina donde corra el servidor:

```bash
npx higgsfield auth login
```

Abre el navegador. Después, las credenciales quedan en `~/.higgsfield/` y
**llevan `refresh_token`**, así que se renuevan solas: no hay que repetirlo cada
día.

Para comprobar que quedó bien:

```bash
npx higgsfield auth token      # imprime el token
npx higgsfield model list --image   # debería incluir nano_banana_2
```

Hasta que hagas eso, la plataforma sigue funcionando con los modelos de la API y
te avisa en el propio selector de que faltan los del CLI. No se rompe nada; solo
no aparece Nano Banana Pro.

## La trampa que hay dentro del código

**Sin sesión, el CLI escribe «Not authenticated» y termina con código 0.** Fiarse
del código de salida daría por buena una generación que nunca ocurrió y dejaría
la tanda entera en silencio. Por eso `looksUnauthenticated()` mira el texto de
salida, no el código.

## Por qué no hay una lista de «modelos que aceptan referencia»

Porque se quedaría vieja, y el fallo sería silencioso: la imagen saldría bien y
con un envase inventado. En su lugar se le pregunta al CLI con
`model get <job_type> --json` y se busca el parámetro `image_references` en la
respuesta. Si no se puede averiguar, se genera **sin** referencia en vez de
mandarla a ciegas — mandar un parámetro que el modelo no declara aborta la
generación entera con «Unknown params».

## Variables opcionales

| Variable | Para qué |
|---|---|
| `HIGGSFIELD_CLI_PATH` | Ruta al binario, si no usas el del proyecto. |
| `HIGGSFIELD_CREDENTIALS_PATH` | Dónde guardar la sesión, si `~/.higgsfield/` no sirve (contenedores). |

## De dónde sale la foto de referencia

De la imagen marcada como **principal** del producto. Vive en un bucket privado
de Supabase, así que no se le pasa el enlace al CLI —está firmado y caduca—: se
descargan los bytes, se escriben en un directorio temporal, y el CLI los sube él.
El temporal se borra siempre, también si la generación falla.

Si el producto no tiene imagen principal, se genera igualmente pero sin
referencia. Es peor no generar nada.
