export const THEME_STORAGE_KEY = "lumen-theme";

/**
 * Se ejecuta antes del primer pintado para aplicar el tema guardado.
 * Evita el parpadeo claro/oscuro en la carga inicial.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
