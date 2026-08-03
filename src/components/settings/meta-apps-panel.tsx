"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteMetaAppAction, saveMetaAppAction } from "@/app/datos/actions";

/**
 * Las apps de Meta, en un sitio.
 *
 * ## Por qué aquí y no en cada tienda
 *
 * **Una app suele bastar para todo.** Lo que decide qué cuentas publicitarias se
 * ven no es la app: es el perfil de Facebook que inicia sesión, y ese perfil ve
 * las cuentas de todos sus Business Manager a la vez.
 *
 * La segunda app hace falta solo cuando entra un perfil que no puede tener rol
 * en la primera —de un cliente, de otra empresa—. Es la excepción, así que se
 * dan de alta aquí una vez y en cada tienda solo hay que elegir, si acaso.
 *
 * ## El secreto entra y no sale
 *
 * Se guarda y nunca vuelve. La pantalla solo sabe si está puesto, y al editar el
 * campo llega vacío: dejarlo así conserva el que había.
 */

export interface MetaAppView {
  id: string;
  name: string;
  appId: string;
  hasSecret: boolean;
  configId: string;
  isDefault: boolean;
}

const EMPTY = { id: "", name: "", appId: "", appSecret: "", configId: "", isDefault: false };

export function MetaAppsPanel({
  apps,
  envConfigured,
}: {
  apps: MetaAppView[];
  /** Si el servidor trae META_APP_ID y META_APP_SECRET de respaldo. */
  envConfigured: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const edit = (app: MetaAppView) => {
    setForm({
      id: app.id,
      name: app.name,
      appId: app.appId,
      // Vacío: el secreto no viaja de vuelta y dejarlo así conserva el guardado.
      appSecret: "",
      configId: app.configId,
      isDefault: app.isDefault,
    });
    setEditing(true);
  };

  const save = () => {
    setSaving(true);

    void saveMetaAppAction({
      id: form.id || undefined,
      name: form.name,
      appId: form.appId,
      appSecret: form.appSecret,
      configId: form.configId,
      // La primera que se da de alta es la de por defecto sin preguntar: si no,
      // quedaría una lista sin ninguna marcada y ninguna tienda podría conectar.
      isDefault: form.isDefault || apps.length === 0,
    })
      .then((result) => {
        setNote(result.message);
        if (result.ok) {
          setForm(EMPTY);
          setEditing(false);
          router.refresh();
        }
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-4">
      {apps.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {envConfigured
            ? "No hay ninguna dada de alta aquí; se usa la del servidor (META_APP_ID). Añade una si quieres gestionarlas desde aquí."
            : "No hay ninguna app de Meta. Sin ella no se puede conectar ninguna tienda."}
        </p>
      ) : (
        <ul className="space-y-2">
          {apps.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {app.name}
                  {app.isDefault ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      por defecto
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  App ID {app.appId}
                  {app.configId ? ` · Config ${app.configId}` : ""}
                  {app.hasSecret ? " · secreto guardado" : " · sin secreto"}
                </p>
              </div>

              <Button variant="ghost" onClick={() => edit(app)}>
                Editar
              </Button>

              <button
                type="button"
                aria-label={`Borrar ${app.name}`}
                onClick={() => {
                  if (!window.confirm(`¿Borrar «${app.name}»?`)) return;

                  void deleteMetaAppAction(app.id).then((result) => {
                    setNote(result.message);
                    router.refresh();
                  });
                }}
                className="rounded-full px-2 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-medium">{form.id ? "Editar la app" : "Añadir una app"}</p>

          <div className="flex flex-wrap gap-2">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Nombre (BM Naturox)"
              className="w-52 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={form.appId}
              onChange={(event) => setForm({ ...form, appId: event.target.value })}
              placeholder="App ID"
              className="w-44 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={form.appSecret}
              onChange={(event) => setForm({ ...form, appSecret: event.target.value })}
              type="password"
              autoComplete="off"
              placeholder={form.id ? "App Secret (déjalo vacío para no cambiarlo)" : "App Secret"}
              className="w-64 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={form.configId}
              onChange={(event) => setForm({ ...form, configId: event.target.value })}
              placeholder="Config ID (opcional)"
              className="w-48 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault || apps.length === 0}
              disabled={apps.length === 0}
              onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
            />
            <span>
              La de por defecto — la que usan todas las tiendas que no elijan otra
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button disabled={saving || !form.appId.trim()} onClick={save}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(EMPTY);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => {
            setForm(EMPTY);
            setEditing(true);
          }}
        >
          Añadir una app
        </Button>
      )}

      {note ? <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Con una sola app se llega a todos los Business Manager a los que llegue el perfil de
        Facebook con el que inicias sesión. La segunda solo hace falta cuando entra un perfil que
        no puede tener rol en la primera — y entonces se elige en cada tienda, en Datos →
        Conexiones.
      </p>
    </div>
  );
}
