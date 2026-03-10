import Stripe from "stripe";
import {
  handleSubscriptionChange,
  handleCheckoutSessionCompletedPayment,
  stripe,
} from "@/lib/payments/stripe";
import { NextRequest, NextResponse } from "next/server";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer();
  const payload = Buffer.from(body);
  const signature = request.headers.get("stripe-signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed.", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("[Stripe Webhook] checkout.session.completed", {
        mode: session.mode,
        payment_status: session.payment_status,
        metadata: session.metadata,
      });
      if (session.mode === "payment" && session.payment_status === "paid") {
        await handleCheckoutSessionCompletedPayment(session);
      } else {
        console.log("[Stripe Webhook] Skipping: not a paid one-time payment");
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(subscription);
      break;
    default:
      console.info(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
