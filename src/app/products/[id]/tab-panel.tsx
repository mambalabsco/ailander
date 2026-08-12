import { SectionCard } from "@/components/section-card";
import type { MarketContext } from "@/lib/market-selection";
import { EmptyState, Tag } from "@/components/ui";
import {
  CategoricalSplitBar,
  ChartFrame,
  Heatmap,
  HorizontalBars,
  OrdinalStackedBar,
  StatTile,
} from "@/components/charts";
import { AWARENESS_LABELS } from "@/types/research";
import { readTierPrice } from "@/types/research";
import type { ProductResearch } from "@/types/research";
import type { Product } from "@/types";
import type { Store } from "@/types/store";
import { formatMoney, marketMoney } from "@/lib/money";

interface PanelTabProps {
  product: Product;
  research: ProductResearch;
  stores: Store[];
  /** El mercado que se está mirando. En general no hay precio con el que comparar. */
  marketContext: MarketContext;
}

export function PanelTab({ product, research, stores, marketContext }: PanelTabProps) {
  const { awareness, competitors, desireValidation, master } = research;
  const money = marketMoney(product, stores);

  if (!awareness) {
    return (
      <EmptyState
        title="Este producto todavía no tiene investigación"
        description="El panel se construye con los datos de los 6 documentos. Genera la investigación desde la pestaña Documentos para verlo."
      />
    );
  }

  const dominant = awareness.stageBreakdown.find((stage) => stage.level === awareness.dominantLevel);
  const topDesire = desireValidation?.desires[0];

  /*
   * Comparación de precios, **solo entre importes de la misma moneda**.
   *
   * Antes el precio del competidor se guardaba como si siempre fuera en
   * dólares, y esta gráfica lo ponía en la misma barra que el tuyo aunque el
   * tuyo estuviera en pesos. Las barras se veían perfectas y la comparación era
   * falsa, que es peor que no tener gráfica.
   *
   * Convertir tampoco valdría: haría falta un tipo de cambio del día, y uno
   * escrito a mano envejece y convierte una cifra inventada en un gráfico de
   * aspecto fiable.
   */
  const priceComparison = (competitors?.competitors ?? [])
    .map((competitor) => {
      const unit = competitor.pricing.find((tier) => tier.tier.toLowerCase().includes("unidad"));
      const tier = unit ?? competitor.pricing[0];
      // Tolerante con el formato viejo: los informes ya generados guardan
      // `priceUsd` y sin esto la gráfica los daba por cero.
      /*
       * Se compara el **precio por unidad**, no el del pack.
       *
       * Poner el pack de 3 del competidor junto a tu precio unitario hacía que
       * el competidor pareciera tres veces más caro. Es la comparación que la
       * gráfica existe para evitar.
       */
      const money = tier ? readTierPrice(tier) : { unitPrice: 0, currency: "USD" };
      return { label: competitor.name, value: money.unitPrice, currency: money.currency };
    })
    .filter((entry) => entry.value > 0);

  const comparable = priceComparison.filter((entry) => entry.currency === money.currency);
  const otherCurrencies = priceComparison.filter((entry) => entry.currency !== money.currency);

  /*
   * En general el producto **no entra** en la gráfica de precios.
   *
   * La gráfica compara tu precio con el de la competencia. Sin precio no hay
   * nada que comparar, y meterlo con el del país base pondría tu barra en una
   * moneda contra competidores de otra: una comparación falsa con cara de
   * correcta, que es el mismo fallo que ya costó caro con los gastos en dólares.
   */
  const priceData = [
    ...(marketContext.price
      ? [
          {
            label: `${product.name} (tuyo)`,
            value: marketContext.price.amount,
            currency: money.currency,
          },
        ]
      : []),
    ...comparable,
  ];

  return (
    <div className="space-y-6">
      {/* La cifra que encabeza el panel, más los KPI que la acompañan. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Nivel de conciencia dominante"
          value={AWARENESS_LABELS[awareness.dominantLevel]}
          hint={dominant ? `${dominant.percentage}% del mercado` : undefined}
        />
        <StatTile
          label="Mercado total direccionable"
          value={awareness.tam.marketSizeUsd}
          prefix="$"
          compact
          hint={awareness.tam.cagr}
        />
        <StatTile
          label="Base de compradores"
          value={awareness.tam.userBase}
          compact
          hint="Compradores activos estimados"
        />
        <StatTile
          label="Deseo más fuerte"
          value={topDesire ? `${topDesire.totalScore}/15` : "—"}
          hint={topDesire?.statement}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <ChartFrame
          title="Distribución por nivel de conciencia"
          description="Dónde está el mercado ahora mismo, según el documento 1. Determina a qué nivel debe hablar el anuncio."
          table={{
            headers: ["Nivel", "% del mercado", "Por qué"],
            rows: awareness.stageBreakdown.map((stage) => [
              AWARENESS_LABELS[stage.level],
              `${stage.percentage}%`,
              stage.reasoning,
            ]),
          }}
          legend={awareness.stageBreakdown.map((stage, index) => ({
            label: `${AWARENESS_LABELS[stage.level]} · ${stage.percentage}%`,
            color: `var(--viz-ramp-${index + 1})`,
          }))}
        >
          <OrdinalStackedBar
            segments={awareness.stageBreakdown.map((stage) => ({
              label: AWARENESS_LABELS[stage.level],
              value: stage.percentage,
              detail: stage.reasoning,
            }))}
          />
        </ChartFrame>

        <ChartFrame
          title="Reparto por género"
          description="Base para el tono y la selección de creatividades."
          table={{
            headers: ["Género", "% del mercado"],
            rows: [
              ["Mujeres", `${awareness.demographics.gender.female}%`],
              ["Hombres", `${awareness.demographics.gender.male}%`],
            ],
          }}
          legend={[
            { label: `Mujeres · ${awareness.demographics.gender.female}%`, color: "var(--viz-cat-1)" },
            { label: `Hombres · ${awareness.demographics.gender.male}%`, color: "var(--viz-cat-2)" },
          ]}
        >
          <CategoricalSplitBar
            segments={[
              { label: "Mujeres", value: awareness.demographics.gender.female },
              { label: "Hombres", value: awareness.demographics.gender.male },
            ]}
          />
        </ChartFrame>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartFrame
          title="Distribución por edad"
          description="Franjas ordenadas de menor a mayor. El grosor de la barra es la cuota, no la importancia."
          table={{
            headers: ["Franja", "% del mercado", "Nota"],
            rows: awareness.demographics.ageBrackets.map((bracket) => [
              bracket.range,
              `${bracket.percentage}%`,
              bracket.notes,
            ]),
          }}
        >
          <HorizontalBars
            data={awareness.demographics.ageBrackets.map((bracket) => ({
              label: bracket.range,
              value: bracket.percentage,
              note: bracket.notes,
            }))}
            unit="%"
          />
        </ChartFrame>

        {desireValidation ? (
          <ChartFrame
            title="Deseos masivos · dimensiones de Schwartz"
            description="Puntuación de 1 a 5 en urgencia, permanencia y alcance, según la evidencia del documento 6."
            table={{
              headers: ["Deseo", "Urgencia", "Permanencia", "Alcance", "Total"],
              rows: desireValidation.desires.map((desire) => [
                desire.statement,
                desire.urgency,
                desire.stayingPower,
                desire.scope,
                `${desire.totalScore}/15`,
              ]),
            }}
          >
            <Heatmap
              columns={["Urgencia", "Permanencia", "Alcance"]}
              rows={desireValidation.desires.map((desire) => ({
                label: desire.statement,
                values: [desire.urgency, desire.stayingPower, desire.scope],
              }))}
            />
          </ChartFrame>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {desireValidation ? (
          <ChartFrame
            title="Ranking de deseos"
            description="Puntuación total sobre 15. El primero es el que debe llevar el anuncio; el resto son refuerzo."
            table={{
              headers: ["Deseo", "Puntuación"],
              rows: desireValidation.desires.map((desire) => [desire.statement, `${desire.totalScore}/15`]),
            }}
          >
            <HorizontalBars
              data={desireValidation.desires.map((desire) => ({
                label: desire.statement,
                value: desire.totalScore,
              }))}
              unit="/15"
              maxValue={15}
              emphasisIndex={0}
            />
          </ChartFrame>
        ) : null}

        {priceData.length > 1 ? (
          <ChartFrame
            title={`Precio frente a la competencia (${money.currency})`}
            description="Precio de unidad. Sirve para situar el posicionamiento, no para igualarlo."
            table={{
              headers: ["Producto", "Precio unidad"],
              rows: priceData.map((entry) => [entry.label, formatMoney(entry.value, money)]),
            }}
          >
            <HorizontalBars data={priceData} unit={` ${money.currency}`} emphasisIndex={0} />
          </ChartFrame>
        ) : null}

        {/* Los de otra moneda se enseñan aparte, con la suya. Meterlos en la
            gráfica exigiría un tipo de cambio que no tenemos; esconderlos haría
            creer que no hay más competencia. */}
        {otherCurrencies.length > 0 ? (
          <ChartFrame
            title="Competidores en otra moneda"
            description={`Sus precios no están en ${money.currency}, así que no entran en la gráfica: compararlos exigiría un tipo de cambio del día.`}
            table={{
              headers: ["Competidor", "Precio unidad"],
              rows: otherCurrencies.map((entry) => [
                entry.label,
                formatMoney(entry.value, { currency: entry.currency }),
              ]),
            }}
          >
            <ul className="space-y-2 text-sm">
              {otherCurrencies.map((entry) => (
                <li key={entry.label} className="flex items-center justify-between gap-3">
                  <span>{entry.label}</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(entry.value, { currency: entry.currency })}
                  </span>
                </li>
              ))}
            </ul>
          </ChartFrame>
        ) : null}
      </div>

      <SectionCard
        title="Lectura ejecutiva"
        description="El resumen «Para Dummies» del documento 1: qué hacer con todo lo anterior."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Qué significa</p>
            <p className="mt-2 text-sm leading-6">{awareness.forDummies.whatItMeans}</p>
          </div>
          <div className="rounded-3xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/40">
            <p className="text-sm font-medium text-violet-800 dark:text-violet-300">Conclusión práctica</p>
            <p className="mt-2 text-sm leading-6">{awareness.forDummies.actionableConclusion}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Tono recomendado</p>
            <p className="mt-2 text-sm leading-6">{awareness.advertisingImplications.tone}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Prueba necesaria</p>
            <p className="mt-2 text-sm leading-6">{awareness.advertisingImplications.proof}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Ángulo de ejemplo</p>
            <p className="mt-2 text-sm leading-6">{awareness.advertisingImplications.exampleAngle}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Avatares principales" description="Los tres perfiles de mayor valor para segmentar.">
        <div className="grid gap-4 lg:grid-cols-3">
          {awareness.avatars.map((avatar) => (
            <div key={avatar.name} className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="font-semibold">{avatar.name}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {avatar.age} · {avatar.gender} · {avatar.income}
              </p>
              <p className="mt-3 text-sm leading-6">{avatar.psychographics}</p>
              <p className="mt-3 text-sm">
                <span className="font-medium">Mensaje que resuena:</span> {avatar.resonantMessage}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>{AWARENESS_LABELS[avatar.awarenessStage]}</Tag>
                {avatar.platforms.map((platform) => (
                  <Tag key={platform}>{platform}</Tag>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {master ? (
        <SectionCard
          title="Lenguaje del cliente"
          description="Extraído del documento 4. Es la diferencia entre un anuncio que suena a marca y uno que suena a ellos."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Usar</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {master.psychographics.languageToUse.map((word) => (
                  <span
                    key={word}
                    className="rounded-full bg-white px-3 py-1 text-sm dark:bg-slate-900"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
              <p className="text-sm font-medium text-rose-800 dark:text-rose-300">Evitar</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {master.psychographics.languageToAvoid.map((word) => (
                  <span
                    key={word}
                    className="rounded-full bg-white px-3 py-1 text-sm line-through decoration-rose-400 dark:bg-slate-900"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
