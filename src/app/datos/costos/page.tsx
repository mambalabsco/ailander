import { SectionCard } from "@/components/section-card";
import { DatosHeader } from "@/app/datos/header";
import {
  CogsEditor,
  CustomCostEditor,
  GatewayEditor,
  ShippingEditor,
} from "@/components/datos/cost-editors";
import { reportContext } from "@/app/datos/report";
import {
  gatewaysInUse,
  lastSyncedOrderDate,
  readCostSettings,
  variantsSold,
} from "@/lib/data/analytics";

/**
 * Los cuatro costos que hay que declarar a mano.
 *
 * Shopify sabe lo que entró; nadie sabe lo que costó servirlo. Estos cuatro son
 * la diferencia entre un panel de ingresos y un panel de beneficio, y **ninguno
 * de los cuatro da error si falta**: simplemente resta cero y el beneficio sale
 * más alto. Por eso cada sección enseña en ámbar lo que está a medias en vez de
 * limitarse a estar vacía.
 *
 * No lleva selector de periodo porque la configuración no depende del periodo.
 * La cabecera se comparte igualmente para poder cambiar de tienda sin salir.
 */

interface PageProps {
  searchParams: Promise<{ tienda?: string; rango?: string; desde?: string; hasta?: string }>;
}

export default async function CostosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await reportContext(params);
  const { store, currency, today, timeZone } = context;

  if (!store) return <DatosHeader context={context} synced={false} />;

  const [settings, variants, gateways, lastOrder] = await Promise.all([
    readCostSettings(store.id, { currency, timeZone }),
    variantsSold(store.id),
    gatewaysInUse(store.id),
    lastSyncedOrderDate(store.id),
  ]);

  const feesByGateway = new Map(settings.gatewayFees.map((fee) => [fee.gateway, fee]));

  return (
    <div className="space-y-6">
      <DatosHeader context={context} synced={Boolean(lastOrder)} />

      <SectionCard
        title="Coste de mercancía"
        description="Lo que te cuesta cada unidad. Por variante, porque el bote suelto y el pack de tres no cuestan lo mismo — y esa diferencia es la que decide si el pack compensa."
      >
        <CogsEditor storeId={store.id} variants={variants} />
      </SectionCard>

      <SectionCard
        title="Envío"
        description="Por zona y por tramos de cantidad, porque mandar dos botes no cuesta el doble que uno."
      >
        <ShippingEditor storeId={store.id} zones={settings.shippingZones} />
      </SectionCard>

      <SectionCard
        title="Comisiones de pasarela"
        description="Porcentaje más importe fijo. La lista sale de los pedidos: cuando cobres por una pasarela nueva aparecerá sola."
      >
        <GatewayEditor
          storeId={store.id}
          gateways={gateways.map((row) => ({
            gateway: row.gateway,
            orders: row.orders,
            percent: feesByGateway.get(row.gateway)?.percent ?? 0,
            fixed: feesByGateway.get(row.gateway)?.fixed ?? 0,
          }))}
        />
      </SectionCard>

      <SectionCard
        title="Costos propios"
        description="Sueldos, herramientas, la cuota de Shopify. Los fijos se reparten entre los días de su periodo, así que el beneficio diario no se hunde el día 1 de cada mes."
      >
        <CustomCostEditor
          storeId={store.id}
          costs={settings.customCosts}
          currency={currency}
          today={today}
        />
      </SectionCard>
    </div>
  );
}
