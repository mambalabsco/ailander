"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SELECTION_PARAM } from "@/lib/market-selection";
import { SelectField } from "@/components/ui";

/**
 * Elegir entre «general» y un mercado.
 *
 * Escribe en la URL y no en estado: así el modo sobrevive a la recarga, se puede
 * enlazar, y las pestañas —que son componentes de servidor— lo leen sin que haya
 * que pasarlo por props a través de toda la ficha.
 *
 * `replace` y no `push`: el mercado no es un sitio al que se va, es cómo se está
 * mirando lo mismo. Con `push`, volver atrás desharía el cambio de mercado en
 * vez de salir de la ficha, que no es lo que espera nadie.
 */
export function MarketSwitcher({
  markets,
  current,
}: {
  markets: { id: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(SELECTION_PARAM, value);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <label className="flex items-center gap-2">
      <span className="text-sm font-medium">Mercado</span>
      <SelectField
        className="w-auto"
        value={current}
        onChange={(event) => go(event.target.value)}
      >
        <option value="general">General (sin precio)</option>
        {markets.map((market) => (
          <option key={market.id} value={market.id}>
            {market.label}
          </option>
        ))}
      </SelectField>
    </label>
  );
}
