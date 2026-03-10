import { checkoutAction, checkoutTopupAction } from "@/lib/payments/actions";
import { CheckIcon } from "@heroicons/react/24/outline";
import { getPlanByCode } from "@/lib/billing/plans";
import { getActiveTopupPackages } from "@/lib/billing/topup-packages";
import { SubmitButton } from "./submit-button";

export const revalidate = 3600;

export default async function PricingPage() {
  const [plan, topupPackages] = await Promise.all([
    getPlanByCode("starter"),
    getActiveTopupPackages(),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        <StarterPlanCard plan={plan} />
        {topupPackages.length > 0 && (
          <TopupCard packages={topupPackages} />
        )}
      </div>
    </main>
  );
}

function StarterPlanCard({
  plan,
}: {
  plan: Awaited<ReturnType<typeof getPlanByCode>>;
}) {
  if (!plan) {
    return (
      <div className="pt-6">
        <p className="text-gray-600">Starter plan not configured.</p>
      </div>
    );
  }

  const priceDisplay = (plan.priceMinor / 100).toFixed(2);
  const currency = plan.currency || "PLN";

  return (
    <div className="pt-6">
      <h2 className="text-2xl font-medium text-gray-900 mb-2">{plan.name}</h2>
      <p className="text-4xl font-medium text-gray-900 mb-6">
        {priceDisplay} {currency}{" "}
        <span className="text-xl font-normal text-gray-600">
          / {plan.billingInterval}
        </span>
      </p>
      <ul className="space-y-4 mb-8">
        <li className="flex items-start">
          <CheckIcon className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
          <span className="text-gray-700">
            {plan.includedCreditsPerCycle} AI credits per month
          </span>
        </li>
        {plan.dailyBonusCredits != null && (
          <li className="flex items-start">
            <CheckIcon className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">
              {plan.dailyBonusCredits} daily bonus credits
              {plan.dailyBonusCapPerCycle != null &&
                ` (up to ${plan.dailyBonusCapPerCycle}/month)`}
            </span>
          </li>
        )}
        <li className="flex items-start">
          <CheckIcon className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
          <span className="text-gray-700">
            Up to {plan.rolloverCap} credits roll over
          </span>
        </li>
        <li className="flex items-start">
          <CheckIcon className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
          <span className="text-gray-700">Top-ups available</span>
        </li>
      </ul>
      <form action={checkoutAction}>
        <SubmitButton />
      </form>
    </div>
  );
}

function TopupCard({
  packages,
}: {
  packages: Awaited<ReturnType<typeof getActiveTopupPackages>>;
}) {
  return (
    <div className="pt-6">
      <h2 className="text-2xl font-medium text-gray-900 mb-2">Credit top-up</h2>
      <p className="text-sm text-gray-600 mb-6">
        One-time payment. Credits never expire.
      </p>
      {packages.map((pkg) => {
        const priceDisplay = (pkg.priceMinor / 100).toFixed(2);
        const currency = pkg.currency || "PLN";
        return (
          <div key={pkg.id} className="mb-6">
            <p className="text-4xl font-medium text-gray-900 mb-6">
              {pkg.name} — {priceDisplay} {currency}
            </p>
            <form action={checkoutTopupAction}>
              <input type="hidden" name="topup_code" value={pkg.code} />
              <SubmitButton label={`Buy ${pkg.name}`} />
            </form>
          </div>
        );
      })}
    </div>
  );
}
