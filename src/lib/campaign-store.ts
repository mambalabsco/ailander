import { promises as fs } from "fs";
import path from "path";
import type {
  AdSet,
  AdUnit,
  ArchivedCampaign,
  Campaign,
  CampaignFolder,
  CampaignTree,
  Prelanding,
  ShortAd,
} from "@/types/campaign";
import { COPY_FORMAT_LABELS } from "@/types/copy";
import { readCopies } from "@/lib/copy-store";
import { campaignFixture } from "@/lib/campaign-fixture";
import { isDemoResearchProduct } from "@/lib/research-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as db from "@/lib/data/campaigns";
import * as folders from "@/lib/data/campaign-folders";

/** Persistencia de campañas, conjuntos de anuncios, anuncios cortos y prelandings. */

const dataRoot = path.join(process.cwd(), "data");
const paths = {
  campaigns: path.join(dataRoot, "campaigns.json"),
  adsets: path.join(dataRoot, "adsets.json"),
  shortAds: path.join(dataRoot, "short-ads.json"),
  prelandings: path.join(dataRoot, "prelandings.json"),
};

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

/* --------------------------------- Prelandings --------------------------------- */

export async function readPrelandings(productId: string): Promise<Prelanding[]> {
  if (isSupabaseConfigured()) return db.readPrelandings(productId);

  const stored = await readJson<Prelanding[]>(paths.prelandings, []);
  const own = stored.filter((item) => item.productId === productId);
  if (own.length > 0) return own;
  if (isDemoResearchProduct(productId)) return campaignFixture.prelandings;
  return [];
}

export async function savePrelanding(prelanding: Prelanding): Promise<Prelanding> {
  if (isSupabaseConfigured()) {
    // Un id corto viene del formulario y no de la base: es un alta.
    return db.savePrelanding({
      ...prelanding,
      id: prelanding.id && prelanding.id.length >= 32 ? prelanding.id : undefined,
    });
  }

  const stored = await readJson<Prelanding[]>(paths.prelandings, []);
  const index = stored.findIndex((item) => item.id === prelanding.id);
  if (index >= 0) stored[index] = prelanding;
  else stored.push(prelanding);
  await writeJson(paths.prelandings, stored);
  return prelanding;
}

export async function deletePrelanding(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) return db.deletePrelanding(id);

  const stored = await readJson<Prelanding[]>(paths.prelandings, []);
  const remaining = stored.filter((item) => item.id !== id);
  if (remaining.length === stored.length) return false;
  await writeJson(paths.prelandings, remaining);
  return true;
}

/* -------------------------------- La jerarquía --------------------------------- */

async function readEntities(productId: string): Promise<{
  campaigns: Campaign[];
  adsets: AdSet[];
  ads: ShortAd[];
}> {
  const [campaigns, adsets, ads] = await Promise.all([
    readJson<Campaign[]>(paths.campaigns, []),
    readJson<AdSet[]>(paths.adsets, []),
    readJson<ShortAd[]>(paths.shortAds, []),
  ]);

  const own = {
    campaigns: campaigns.filter((item) => item.productId === productId),
    adsets: adsets.filter((item) => item.productId === productId),
    ads: ads.filter((item) => item.productId === productId),
  };

  if (own.campaigns.length === 0 && isDemoResearchProduct(productId)) {
    return {
      campaigns: campaignFixture.campaigns,
      adsets: campaignFixture.adsets,
      ads: campaignFixture.ads,
    };
  }

  return own;
}

/** La estructura completa, lista para pintar. */
export async function readCampaignTrees(productId: string): Promise<CampaignTree[]> {
  if (isSupabaseConfigured()) return db.readCampaignTrees(productId);

  const [{ campaigns, adsets, ads }, copies] = await Promise.all([
    readEntities(productId),
    readCopies(productId),
  ]);

  return (
    campaigns
      // El mismo filtro que la rama de Supabase. Sin él, el respaldo enseñaría
      // las archivadas y el fallo solo saldría en la máquina sin Supabase.
      .filter((campaign) => !campaign.archivedAt)
      .map((campaign) => ({
        campaign,
        adsets: adsets
          .filter((adset) => adset.campaignId === campaign.id)
          .sort((a, b) => a.number - b.number)
          .map((adset) => {
            const adsetAds = ads
              .filter((ad) => ad.adsetId === adset.id)
              .sort((a, b) => a.number - b.number);

            // Las piezas largas asignadas a este conjunto entran en la misma lista.
            const longUnits: AdUnit[] = copies
              .filter((copy) => copy.adsetId === adset.id)
              .map((copy) => ({
                kind: "largo" as const,
                copyId: copy.id,
                number: copy.adNumber ?? 0,
                name: copy.adName ?? copy.content.headline,
                headline: copy.content.headline,
                description: copy.content.description,
                primaryText: copy.content.primaryText,
                format: COPY_FORMAT_LABELS[copy.format],
                methodId: copy.methodId,
              }));

            const units: AdUnit[] = [
              ...adsetAds.map((ad) => ({ kind: "corto" as const, ad })),
              ...longUnits,
            ].sort((a, b) => {
              const left = a.kind === "corto" ? a.ad.number : a.number;
              const right = b.kind === "corto" ? b.ad.number : b.number;
              return left - right;
            });

            return { adset, ads: adsetAds, units };
          }),
      }))
  );
}

/**
 * Siguientes números correlativos.
 *
 * En `short.md` la numeración es global por producto y no reinicia en cada
 * campaña: el conjunto 13 contenía los anuncios 36 a 40.
 */
export async function nextNumbers(productId: string): Promise<{ adset: number; ad: number }> {
  if (isSupabaseConfigured()) return db.nextNumbers(productId);

  const { adsets, ads } = await readEntities(productId);
  return {
    adset: adsets.reduce((max, item) => Math.max(max, item.number), 0) + 1,
    ad: ads.reduce((max, item) => Math.max(max, item.number), 0) + 1,
  };
}

export async function saveCampaign(campaign: Campaign): Promise<Campaign> {
  if (isSupabaseConfigured()) {
    return db.saveCampaign({
      ...campaign,
      id: campaign.id && campaign.id.length >= 32 ? campaign.id : undefined,
    });
  }

  const stored = await readJson<Campaign[]>(paths.campaigns, []);
  const index = stored.findIndex((item) => item.id === campaign.id);
  if (index >= 0) stored[index] = campaign;
  else stored.push(campaign);
  await writeJson(paths.campaigns, stored);
  return campaign;
}

export async function saveAdset(adset: AdSet): Promise<AdSet> {
  if (isSupabaseConfigured()) {
    return db.saveAdset({ ...adset, id: adset.id && adset.id.length >= 32 ? adset.id : undefined });
  }

  const stored = await readJson<AdSet[]>(paths.adsets, []);
  const index = stored.findIndex((item) => item.id === adset.id);
  if (index >= 0) stored[index] = adset;
  else stored.push(adset);
  await writeJson(paths.adsets, stored);
  return adset;
}

export async function saveShortAds(ads: ShortAd[]): Promise<ShortAd[]> {
  if (isSupabaseConfigured()) return db.saveShortAds(ads);

  const stored = await readJson<ShortAd[]>(paths.shortAds, []);
  const ids = new Set(ads.map((ad) => ad.id));
  await writeJson(paths.shortAds, [...stored.filter((ad) => !ids.has(ad.id)), ...ads]);
  return ads;
}

/* ----------------------------- Carpetas y archivo ------------------------------ */

const foldersPath = path.join(dataRoot, "campaign-folders.json");

export async function readCampaignFolders(productId: string): Promise<CampaignFolder[]> {
  if (isSupabaseConfigured()) return folders.readCampaignFolders(productId);

  const stored = await readJson<CampaignFolder[]>(foldersPath, []);
  return stored.filter((folder) => folder.productId === productId);
}

export async function saveCampaignFolder(input: {
  id?: string;
  productId: string;
  name: string;
  position?: number;
}): Promise<CampaignFolder> {
  if (isSupabaseConfigured()) return folders.saveCampaignFolder(input);

  const stored = await readJson<CampaignFolder[]>(foldersPath, []);
  const folder: CampaignFolder = {
    id: input.id || crypto.randomUUID(),
    productId: input.productId,
    name: input.name,
    position: input.position ?? 0,
    createdAt: new Date().toISOString(),
  };

  const index = stored.findIndex((item) => item.id === folder.id);
  if (index >= 0) stored[index] = folder;
  else stored.push(folder);

  await writeJson(foldersPath, stored);
  return folder;
}

export async function deleteCampaignFolder(id: string): Promise<void> {
  if (isSupabaseConfigured()) return folders.deleteCampaignFolder(id);

  const stored = await readJson<CampaignFolder[]>(foldersPath, []);
  await writeJson(
    foldersPath,
    stored.filter((folder) => folder.id !== id),
  );

  // Las campañas que estaban dentro vuelven a «sin carpeta», que es lo que hace
  // el `on delete set null` en la rama de Supabase.
  const campaigns = await readJson<Campaign[]>(paths.campaigns, []);
  await writeJson(
    paths.campaigns,
    campaigns.map((item) => (item.folderId === id ? { ...item, folderId: undefined } : item)),
  );
}

export async function readArchivedCampaigns(productId: string): Promise<ArchivedCampaign[]> {
  if (isSupabaseConfigured()) return db.readArchivedCampaigns(productId);

  const { campaigns, adsets, ads } = await readEntities(productId);

  return campaigns
    .filter((campaign) => Boolean(campaign.archivedAt))
    .map((campaign) => {
      const propios = adsets.filter((adset) => adset.campaignId === campaign.id);
      const ids = new Set(propios.map((adset) => adset.id));

      return {
        id: campaign.id,
        name: campaign.name,
        stage: campaign.stage,
        folderId: campaign.folderId,
        archivedAt: campaign.archivedAt as string,
        adsets: propios.length,
        ads: ads.filter((ad) => ids.has(ad.adsetId)).length,
      };
    });
}

export async function setCampaignFolder(
  campaignId: string,
  folderId: string | null,
): Promise<void> {
  if (isSupabaseConfigured()) return db.setCampaignFolder(campaignId, folderId);

  await patchCampaign(campaignId, { folderId: folderId ?? undefined });
}

export async function setCampaignArchived(campaignId: string, archived: boolean): Promise<void> {
  if (isSupabaseConfigured()) return db.setCampaignArchived(campaignId, archived);

  await patchCampaign(campaignId, {
    archivedAt: archived ? new Date().toISOString() : undefined,
  });
}

/** Cambia unos campos de una campaña guardada en el respaldo local. */
async function patchCampaign(campaignId: string, patch: Partial<Campaign>): Promise<void> {
  const stored = await readJson<Campaign[]>(paths.campaigns, []);
  await writeJson(
    paths.campaigns,
    stored.map((item) => (item.id === campaignId ? { ...item, ...patch } : item)),
  );
}
