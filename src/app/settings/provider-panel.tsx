"use client";

import { useEffect, useState, useTransition } from "react";
import { SectionCard } from "@/components/section-card";
import { Button, Field, SelectField, TextField } from "@/components/ui";
import {
  clearHiggsfieldCredentials,
  clearProviderKey,
  loadProviderConfig,
  saveProviderConfig,
} from "@/app/settings/actions";
import type { AiProvider, ProviderConfigView } from "@/types";

const defaultView: ProviderConfigView = {
  activeProvider: "claude",
  claudeModel: "claude-opus-5",
  claudeCopyModel: "claude-sonnet-5",
  claudeExtractionModel: "claude-sonnet-5",
  chatgptModel: "gpt-4.1",
  hasClaudeApiKey: false,
  hasChatgptApiKey: false,
  hasHiggsfieldCredentials: false,
};

export function ProviderPanel() {
  const [config, setConfig] = useState<ProviderConfigView>(defaultView);
  const [claudeKey, setClaudeKey] = useState("");
  const [chatgptKey, setChatgptKey] = useState("");
  const [higgsfieldId, setHiggsfieldId] = useState("");
  const [higgsfieldSecret, setHiggsfieldSecret] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      setConfig(await loadProviderConfig());
      setLoading(false);
    })();
  }, []);

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      const saved = await saveProviderConfig({
        activeProvider: config.activeProvider,
        claudeModel: config.claudeModel,
        claudeCopyModel: config.claudeCopyModel,
        claudeExtractionModel: config.claudeExtractionModel,
        chatgptModel: config.chatgptModel,
        claudeApiKey: claudeKey,
        chatgptApiKey: chatgptKey,
        higgsfieldKeyId: higgsfieldId,
        higgsfieldKeySecret: higgsfieldSecret,
      });
      setConfig(saved);
      setClaudeKey("");
      setChatgptKey("");
      setHiggsfieldId("");
      setHiggsfieldSecret("");
      setMessage("Configuración guardada correctamente.");
    });
  };

  const handleClear = (provider: AiProvider) => {
    setMessage(null);
    startTransition(async () => {
      setConfig(await clearProviderKey(provider));
      setMessage("Clave eliminada.");
    });
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Cargando configuración...
      </div>
    );
  }

  return (
    <SectionCard
      title="Proveedores de IA"
      description="Configura el proveedor activo para generar copys e ideas publicitarias"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <Field label="Proveedor activo">
              <SelectField
                value={config.activeProvider}
                onChange={(event) =>
                  setConfig({ ...config, activeProvider: event.target.value as AiProvider })
                }
              >
                <option value="claude">Claude</option>
                <option value="chatgpt">ChatGPT</option>
              </SelectField>
            </Field>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm font-medium">Estado</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Modo demo: los análisis y copys son simulados. Las claves se guardan solo en el servidor y
              nunca se devuelven al navegador.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              {
                provider: "claude" as const,
                label: "Claude API Key",
                placeholder: "sk-ant-...",
                value: claudeKey,
                setValue: setClaudeKey,
                configured: config.hasClaudeApiKey,
              },
              {
                provider: "chatgpt" as const,
                label: "ChatGPT API Key",
                placeholder: "sk-...",
                value: chatgptKey,
                setValue: setChatgptKey,
                configured: config.hasChatgptApiKey,
              },
            ] satisfies Array<{
              provider: AiProvider;
              label: string;
              placeholder: string;
              value: string;
              setValue: (value: string) => void;
              configured: boolean;
            }>
          ).map((item) => (
            <div key={item.provider} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{item.label}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.configured ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                >
                  {item.configured ? "Configurada" : "Sin configurar"}
                </span>
              </div>
              <TextField
                type="password"
                autoComplete="off"
                value={item.value}
                onChange={(event) => item.setValue(event.target.value)}
                placeholder={item.configured ? "•••••••• (déjalo vacío para conservarla)" : item.placeholder}
              />
              {item.configured ? (
                <button
                  type="button"
                  onClick={() => handleClear(item.provider)}
                  disabled={isPending}
                  className="mt-2 text-sm text-rose-500 hover:underline disabled:opacity-50"
                >
                  Eliminar clave
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <Field label="Modelo Claude · investigación">
              <TextField
                value={config.claudeModel}
                onChange={(event) => setConfig({ ...config, claudeModel: event.target.value })}
              />
            </Field>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Los 6 documentos: textos largos con búsqueda web y razonamiento pesado.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <Field label="Modelo Claude · redacción">
              <TextField
                value={config.claudeCopyModel}
                onChange={(event) => setConfig({ ...config, claudeCopyModel: event.target.value })}
              />
            </Field>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Copys, publirreportajes y ganchos.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <Field label="Modelo Claude · extracción">
              <TextField
                value={config.claudeExtractionModel}
                onChange={(event) =>
                  setConfig({ ...config, claudeExtractionModel: event.target.value })
                }
              />
            </Field>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Convierte un informe ya escrito en datos. No busca ni razona sobre el mercado, así que
              no necesita el modelo caro: aquí es donde más se ahorra sin perder calidad.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <Field label="Modelo ChatGPT">
              <TextField
                value={config.chatgptModel}
                onChange={(event) => setConfig({ ...config, chatgptModel: event.target.value })}
              />
            </Field>
          </div>
        </div>

        {/* Higgsfield usa un par id:secreto, no una clave suelta. */}
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Higgsfield · generación de imágenes</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Las credenciales son un par de identificador y secreto. Sin las dos mitades no se genera
                ninguna imagen.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config.hasHiggsfieldCredentials ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
            >
              {config.hasHiggsfieldCredentials ? "Configuradas" : "Sin configurar"}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Key ID">
              <TextField
                autoComplete="off"
                value={higgsfieldId}
                onChange={(event) => setHiggsfieldId(event.target.value)}
                placeholder={config.hasHiggsfieldCredentials ? "•••••••• (déjalo vacío para conservarlo)" : "hf_key_id"}
              />
            </Field>
            <Field label="Key Secret">
              <TextField
                type="password"
                autoComplete="off"
                value={higgsfieldSecret}
                onChange={(event) => setHiggsfieldSecret(event.target.value)}
                placeholder={config.hasHiggsfieldCredentials ? "•••••••• (déjalo vacío para conservarlo)" : "hf_key_secret"}
              />
            </Field>
          </div>

          {config.hasHiggsfieldCredentials ? (
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  setConfig(await clearHiggsfieldCredentials());
                  setMessage("Credenciales de Higgsfield eliminadas.");
                })
              }
              disabled={isPending}
              className="mt-3 text-sm text-rose-500 hover:underline disabled:opacity-50"
            >
              Eliminar credenciales
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar configuración"}
          </Button>
          {message ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
        </div>
      </div>
    </SectionCard>
  );
}
