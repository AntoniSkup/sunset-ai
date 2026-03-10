import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { topupPackages, type TopupPackage } from "@/lib/db/schema";

export async function getTopupPackageByCode(
  code: string
): Promise<TopupPackage | null> {
  const result = await db
    .select()
    .from(topupPackages)
    .where(eq(topupPackages.code, code))
    .limit(1);
  return result[0] ?? null;
}

export async function getTopupPackageById(
  id: number
): Promise<TopupPackage | null> {
  const result = await db
    .select()
    .from(topupPackages)
    .where(eq(topupPackages.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function getActiveTopupPackages(): Promise<TopupPackage[]> {
  return db
    .select()
    .from(topupPackages)
    .where(eq(topupPackages.isActive, true))
    .orderBy(topupPackages.sortOrder);
}
