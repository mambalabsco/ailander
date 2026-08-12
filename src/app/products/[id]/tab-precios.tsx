"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { Button, SelectField, TextField } from "@/components/ui";
import { formatMoney, moneyForMarket } from "@/lib/money";
import { commercialRounding, isStale, type MarketPrice } from "@/lib/market-price";
import { marketLabel, type StoreMarket } from "@/types/store";
import {
  addMarketAction,
  convertPriceAction,
  removeMarketAction,
  saveManualPriceAction,
  type PriceResult,
} from "@/app/products/[id]/price-actions";

/**
 * Los precios de un producto, uno por mercado.
 *
 * La pantalla entera existe para una regla: **solo un precio escrito a mano se
 * publica**. Todo lo demás —el aviso del convertido, los dos botones de
 * confirmar, el redondeo propuesto— está para que confirmar sea un clic en vez
 * de un fastidio, porque una regla que estorba se acaba saltando.
 */

interface PricesTabProps {
  productId: string;
  /** El precio de la ficha, del que salen las conversiones. */
  basePrice: number;
  baseCurrency: string;
  /** Los mercados de la tienda, para poder añadir. */
  storeMarkets: StoreMarket[];
  /** En qué mercados vive el producto y a qué precio. */
  prices: MarketPrice[];
  /** Hoy, calculado en el servidor: en el cliente daría la hora del navegador. */
  today: string;
}

export function PricesTab({
  productId,
  basePrice,
  baseCurrency,
  storeMarkets,
  prices,
  today,
}: PricesTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [toAdd, setToAdd] = useState("");

  const run = (action: () => Promise<PriceResult>) => {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      setFailed(!result.ok);
      if (result.ok) router.refresh();
    });
  };

  const byId = new Map(storeMarkets.map((market) => [market.id, market]));
  const missing = storeMarkets.filter(
    (market) => !prices.some((price) => price.marketId === market.id),
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Precios por mercado"
        description="El precio escrito a mano manda siempre y es el único que se puede publicar. El convertido es una sugerencia: confírmalo antes de que salga a la calle."
      >
        {message ? (
          <p
            className={`mb-4 text-sm ${failed ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
          >
            {message}
          </p>
        ) : null}

        <div className="divide-y divide-slate-200 dark:divide-white/10">
          {prices.length === 0 ? (
            <p className="py-3 text-sm text-slate-500 dark:text-slate-400">
              Este producto todavía no vive en ningún mercado.
            </p>
          ) : null}

          {prices.map((entry) => {
            const market = byId.get(entry.marketId);
            if (!market) return null;

            const money = moneyForMarket(market);
            const rounded =
              entry.price !== null ? commercialRounding(entry.price, market.currency) : null;

            return (
              <div
                key={entry.marketId}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="min-w-52">
                  <p className="font-medium">{marketLabel(market)}</p>
                  <PriceNote entry={entry} money={money} today={today} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/*
                    Confirmar un convertido es lo que lo vuelve publicable. Se
                    ofrecen los dos números y elige una persona: aplicar el
                    redondeo solo es cómo 9.990 se convierte en 10.000 en la
                    página de alguien.
                  */}
                  {entry.source === "convertido" && entry.price !== null ? (
                    <>
                      <Button
                        variant="primary"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            saveManualPriceAction({
                              productId,
                              marketId: entry.marketId,
                              price: entry.price,
                            }),
                          )
                        }
                      >
                        Usar {formatMoney(entry.price, money)}
                      </Button>
                      {rounded !== null ? (
                        <Button
                          variant="primary"
                          disabled={isPending}
                          onClick={() =>
                            run(() =>
                              saveManualPriceAction({
                                productId,
                                marketId: entry.marketId,
                                price: rounded,
                              }),
                            )
                          }
                        >
                          Redondear a {formatMoney(rounded, money)}
                        </Button>
                      ) : null}
                    </>
                  ) : null}

                  {/*
                    Sobre un precio manual no se ofrece convertir. El filtro de
                    la consulta ya lo impide, pero un botón que no puede hacer
                    nada es peor que no tenerlo: invita a pulsarlo y a no
                    entender por qué no pasa nada.
                  */}
                  {entry.source !== "manual" ? (
                    <Button
                      variant="secondary"
                      disabled={isPending || basePrice <= 0}
                      onClick={() =>
                        run(() =>
                          convertPriceAction({
                            productId,
                            marketId: entry.marketId,
                            basePrice,
                            baseCurrency,
                            targetCurrency: market.currency,
                          }),
                        )
                      }
                    >
                      Convertir desde {formatMoney(basePrice, { currency: baseCurrency })}
                    </Button>
                  ) : null}

                  <ManualPrice
                    disabled={isPending}
                    value={entry.price}
                    currency={market.currency}
                    onSave={(price) =>
                      run(() => saveManualPriceAction({ productId, marketId: entry.marketId, price }))
                    }
                  />

                  <Button
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => run(() => removeMarketAction(productId, entry.marketId))}
                  >
                    Quitar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {missing.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
            <SelectField
              className="w-auto"
              value={toAdd}
              onChange={(event) => setToAdd(event.target.value)}
            >
              <option value="">Añadir un mercado…</option>
              {missing.map((market) => (
                <option key={market.id} value={market.id}>
                  {marketLabel(market)}
                </option>
              ))}
            </SelectField>
            <Button
              variant="secondary"
              disabled={isPending || !toAdd}
              onClick={() => run(() => addMarketAction(productId, toAdd))}
            >
              Añadir
            </Button>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

/** De dónde salió el número, dicho al lado del número. */
function PriceNote({
  entry,
  money,
  today,
}: {
  entry: MarketPrice;
  money: { currency: string; locale: string };
  today: string;
}) {
  if (entry.source === "manual" && entry.price !== null) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {formatMoney(entry.price, money)} · escrito a mano
      </p>
    );
  }

  if (entry.source === "convertido" && entry.price !== null) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        {formatMoney(entry.price, money)} · convertido con el cambio del {entry.fxDay}
        {isStale(entry.fxDay, today)
          ? " — hace más de un mes, conviene rehacerla"
          : ""}
        . No se puede publicar hasta confirmarlo.
      </p>
    );
  }

  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      Sin precio: este mercado no se puede publicar.
    </p>
  );
}

/** Escribir el precio a mano, que es lo que lo vuelve publicable. */
function ManualPrice({
  value,
  currency,
  disabled,
  onSave,
}: {
  value: number | null;
  currency: string;
  disabled: boolean;
  onSave: (price: number) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));

  return (
    <span className="flex items-center gap-2">
      <TextField
        className="w-32"
        inputMode="decimal"
        value={text}
        placeholder={currency}
        onChange={(event) => setText(event.target.value)}
      />
      <Button
        variant="secondary"
        disabled={disabled || text.trim() === ""}
        onClick={() => onSave(Number(text.replace(",", ".")))}
      >
        Guardar
      </Button>
    </span>
  );
}
