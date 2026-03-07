"use server";

import { redirect } from "next/navigation";
import {
  createCheckoutSessionForStarter,
  createCustomerPortalSession,
} from "./stripe";
import { withAccount } from "@/lib/auth/middleware";

export const checkoutAction = withAccount(async () => {
  await createCheckoutSessionForStarter();
});

export const customerPortalAction = withAccount(async (_, account) => {
  await createCustomerPortalSession(account);
});
