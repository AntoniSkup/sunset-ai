"use server";

import {
  createCheckoutSessionForStarter,
  createCheckoutSessionForTopup,
  createCustomerPortalSession,
} from "./stripe";
import { withAccount } from "@/lib/auth/middleware";
import { getTopupPackageByCode } from "@/lib/billing/topup-packages";

export const checkoutAction = withAccount(async () => {
  await createCheckoutSessionForStarter();
});

export const customerPortalAction = withAccount(async (_, account) => {
  await createCustomerPortalSession(account);
});

export const checkoutTopupAction = withAccount(
  async (formData, account) => {
    const code = (formData?.get("topup_code") as string) || "topup_100";
    const pkg = await getTopupPackageByCode(code);
    if (!pkg || !pkg.isActive) {
      throw new Error("Top-up package not available");
    }
    await createCheckoutSessionForTopup(account, pkg);
  }
);
