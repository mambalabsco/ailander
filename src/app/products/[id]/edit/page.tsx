import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { findProductAnywhere } from "@/lib/products";
import { listStores } from "@/lib/store-registry";
import { currencyOf } from "@/lib/money";
import { EditProductForm } from "@/app/products/[id]/edit/edit-product-form";

export const dynamic = "force-dynamic";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const [product, stores] = await Promise.all([findProductAnywhere(id), listStores()]);

  if (!product) {
    notFound();
  }

  const currency = currencyOf(
    product,
    stores.find((store) => store.id === product.storeId),
  );

  return (
    <div className="space-y-6">
      <SectionCard title={`Editar ${product.name}`} description="Actualiza los datos del producto y sus mensajes clave">
        <EditProductForm product={product} currency={currency} stores={stores} />
      </SectionCard>
    </div>
  );
}
