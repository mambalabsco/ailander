# Conectar Meta Ads y Google Ads

Para calcular beneficio real hacen falta tres fuentes: los pedidos de Shopify (ya
conectada) y el gasto de las redes en las que anuncias.

**No hay que pegar ningún token.** Se inicia sesión con un botón y se vuelve con
el permiso guardado. Lo que sí hay que hacer, una sola vez, es registrar una app
en cada plataforma para que ese botón exista — eso es lo que explica esta guía.

> Por qué el login y no un token pegado a mano: aparte de ser más cómodo, un token
> de anuncios copiado pasa por el portapapeles, por el historial del navegador y a
> veces por una captura de pantalla o un chat. Un botón, no.

---

## Meta Ads

### 1 · Crear la app (una vez, sirve para todas las tiendas)

1. <https://developers.facebook.com/apps> → **Crear app**.
2. Caso de uso: **Otro** → tipo **Empresa**.
3. Nombre: `Naturox datos` o similar.
4. Asóciala a tu portafolio comercial cuando lo pida.
5. **Añadir producto** → **Marketing API** → *Configurar*.

**No hace falta enviarla a revisión ni verificar la empresa** mientras quien
inicia sesión sea administrador, desarrollador o tester de la propia app. Es tu
caso: tu app y tus cuentas. El «acceso estándar» que se concede solo limita el
volumen de llamadas, y para leer gasto diario de unas cuantas cuentas sobra.

### 2 · Registrar la URL de retorno

En el panel de la app: **Facebook Login** → **Configuración** → *URI de
redireccionamiento de OAuth válidos*:

```
https://aitools.mambalabs.co/api/meta/callback
```

Tiene que ser **exacta**. Si no coincide carácter a carácter, Facebook rechaza el
login con un error que no explica cuál es el problema.

### 3 · Poner las credenciales en el servidor

De **Configuración de la app → Básica** saca el identificador y la clave secreta, y
añádelos a `.env.local` en el servidor:

```
META_APP_ID=...
META_APP_SECRET=...
```

Después, `sudo systemctl restart plataforma`.

> Son de la app, no de una tienda: una sola app de Meta sirve para todas tus
> cuentas publicitarias. Por eso van en el entorno y no en cada tienda, al
> contrario que las de Shopify —que sí exige una app distinta por tienda—.

### 4 · Iniciar sesión

**Datos y beneficio → Conexiones → Iniciar sesión con Facebook**. Se pide un solo
permiso, `ads_read`: la plataforma puede leer tu gasto y **no** puede crear,
pausar ni modificar nada.

Al volver se comprueba que el permiso se concedió de verdad. En el diálogo de Meta
los permisos se pueden desmarcar uno por uno, y sin esa comprobación la conexión
se guardaría como buena y el fallo aparecería días después como un 403.

### 5 · Activar solo las cuentas de esta tienda

Las cuentas aparecen **desactivadas** a propósito. Tu usuario ve decenas; activarlas
todas restaría del beneficio de esta tienda el gasto de campañas de otro sitio.

Si una cuenta lleva campañas de varias tiendas, usa los **filtros por nombre**:

```
Incluir solo estas        Quitar estas
CLNATR                    - Copia
_MX_                      TEST
```

Se incluye primero y se quita después, así que «todo lo de México menos la campaña
vieja» son dos reglas. Coincide por trozo de nombre, sin distinguir mayúsculas.

Los filtros se aplican **al leer**: cambiar una regla recalcula también el
historial ya descargado, sin volver a pedir nada a Meta.

### ⚠ El permiso de Meta caduca cada ~60 días

Es un límite de Meta, no una decisión de la plataforma: **no existen tokens de
usuario permanentes**. En cada sincronización se intenta renovar solo, pero Meta no
garantiza que el re-canje amplíe el plazo.

Lo que sí es seguro: en **Conexiones** verás siempre cuántos días quedan, y a
partir de diez el aviso se pone en ámbar. Reconectar es un clic en el mismo botón.

Si no reconectas, el síntoma es traicionero: el gasto de Meta pasa a contar cero y
el beneficio neto **se dispara** sin ningún mensaje de error. Por eso la
sincronización lo escribe en su resumen y la pantalla lo dice en rojo.

### 6 · Que los pedidos digan de qué campaña vinieron

Esto no es opcional si quieres resultados por campaña. En la URL de destino de cada
anuncio:

```
?utm_source=facebook&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```

La plataforma empareja `utm_campaign` con el nombre de la campaña. Sin eso el gasto
se ve pero las ventas no se pueden asignar, y la pestaña de Campañas te avisará de
cuánto dinero no sabe de dónde viene.

> `{{campaign.id}}` también funciona. Lo que **no** funciona es un nombre escrito a
> mano y parecido: el emparejamiento es exacto a propósito, porque
> `220326_EN_US_TEST` es subcadena de `220326_EN_US_TESTCREPEY` y una coincidencia
> parcial asignaría las ventas de una campaña a otra en silencio.

---

## Google Ads

Si no anuncias en Google, sáltate esta sección entera: la plataforma funciona sin
ella.

### 1 · El developer token (esto es lo que tarda)

1. Entra en tu **cuenta administradora** de Google Ads (una MCC).
2. **Herramientas** → **Configuración** → **API Center**.
3. Solicítalo y rellena el formulario.

Nace con **acceso de prueba**, que solo funciona con cuentas de prueba: con las
reales devuelve 403. Hay que pedir **acceso básico**, y eso lo aprueba una persona.
Cuenta con unos días.

Cuando lo tengas, al servidor:

```
GOOGLE_ADS_DEVELOPER_TOKEN=...
```

> Google tiene un programa de «acceso gestionado desde la nube» que permite omitir
> esta cabecera. **Sigue exigiendo tener un developer token aprobado** para entrar,
> así que no evita la espera. La plataforma manda la cabecera solo si el valor está
> puesto, así que funciona en los dos casos sin cambiar nada.

### 2 · El cliente OAuth

1. <https://console.cloud.google.com> → crea un proyecto.
2. **API y servicios** → activa **Google Ads API**.
3. **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth** → tipo
   **Aplicación web**.
4. En *URI de redireccionamiento autorizados*:
   ```
   https://aitools.mambalabs.co/api/google/callback
   ```
5. Al servidor:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

### 3 · Publica la pantalla de consentimiento

**Importante.** En modo de prueba el permiso caduca **cada siete días**. Ese es el
`invalid_grant` que aparece la semana siguiente sin ninguna relación aparente con
lo que hiciste.

En **Pantalla de consentimiento de OAuth**, pulsa *Publicar la aplicación*. Como el
ámbito de Google Ads es sensible y la app no está verificada, al iniciar sesión
verás una pantalla de advertencia: **Avanzado → Ir a (no seguro)**. Es normal y
esperado para una app de uso propio.

### 4 · Iniciar sesión

**Datos y beneficio → Conexiones → Iniciar sesión con Google**. El permiso que se
guarda es permanente, así que se hace una sola vez.

Después, rellena la **cuenta administradora** (`123-456-7890`, arriba a la derecha
en Google Ads). Es el único dato que se escribe a mano y no es un secreto: es un
número visible en tu panel.

Y lo mismo que en Meta: `utm_campaign={{campaignname}}` en la URL de destino —en
Google el parámetro dinámico va sin punto—.

---

## Después de conectar

**Datos y beneficio → Sincronizar**. Trae los pedidos del periodo que estés mirando
y el gasto de las cuentas activas. Corre en segundo plano: puedes cerrar la pestaña.
Guarda por páginas, así que si falla a mitad lo anterior queda guardado.

### Antes de fiarte de las cifras, completa los costos

Ninguno da error si falta. Simplemente resta cero, y el beneficio sale más alto:

| En **Datos → Costos** | Qué pasa si falta |
|---|---|
| Coste de mercancía por variante | El margen de ese producto sale al 100% |
| Zonas de envío con sus tramos | El envío cuenta cero |
| Comisiones de pasarela | La comisión cuenta cero |
| Costos propios | El beneficio neto sale más alto |

Sin estos costos **la pestaña de Campañas no puede dar ningún veredicto**, y lo
dice en vez de inventarse uno. El motivo está en la sección siguiente.

### La cifra que decide en Campañas no es el ROAS

Es el **ROAS de equilibrio**, y es el mismo dato que hace que un panel sirva o
engañe:

```
equilibrio = 1 / margen de contribución
```

Con un margen del 70% basta un ROAS de **1,43** para no perder. Con un 30% hace
falta **3,33**. El mismo ROAS de 2 deja beneficio en el primer caso y quema dinero
en el segundo — y esa es la decisión que más caro sale con un panel delante.

El margen sale de tus costos reales, no de un porcentaje escrito a mano. De ahí la
tabla de arriba.

Cada campaña recibe un veredicto —**Escalar**, **Mantener**, **Vigilar**,
**Cortar**— y las que tienen pocos datos salen como **Sin datos** en vez de recibir
uno: dos ventas con un ROAS de 6 no son una campaña ganadora, son una campaña sin
datos, y escalarla es escalar un accidente.

Las tarjetas van ordenadas por lo que hay que hacer, no por lo que más gasta:
primero lo que hay que cortar, que es dinero que se está perdiendo ahora.

### Dos cosas que la plataforma no hace, a propósito

**No convierte monedas.** Si la cuenta publicitaria liquida en dólares y la tienda
en pesos, el gasto se guarda en dólares con su moneda al lado. Aplicar el tipo de
cambio de hoy a un gasto de marzo daría un beneficio que parece exacto y no lo es.

**No reparte el mérito entre anuncios.** Los pedidos que no encajan con ninguna
campaña van a su propio grupo, «sin atribuir», en vez de repartirse: repartirlos le
daría a cada campaña un ROAS más bonito y falso, y verlos juntos dice cuánto del
negocio no sabes de dónde viene.
