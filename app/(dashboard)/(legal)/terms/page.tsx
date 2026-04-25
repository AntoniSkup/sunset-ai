import type { Metadata } from "next";
import {
  LegalContactCard,
  LegalHighlight,
  LegalLink,
  LegalList,
  LegalPageHeader,
  LegalSection,
} from "../_components";

export const metadata: Metadata = {
  title: "Terms of Use — Sunset",
  description:
    "Terms of Use governing your access to and use of the Sunset Builder platform.",
};

export default function TermsPage() {
  return (
    <article>
      <LegalPageHeader title="Terms of Use" lastUpdated="April 25, 2026" />

      <LegalHighlight>
        These Terms of Use (&ldquo;Terms&rdquo;) govern your access to and use
        of the Sunset Builder platform. By creating an account or using our
        service, you agree to be bound by these Terms. If you do not agree,
        please do not use the service.
      </LegalHighlight>

      <div className="space-y-10">
        <LegalSection title="1. Definitions">
          <p>
            <strong className="font-semibold text-gray-900">
              &ldquo;Service&rdquo;
            </strong>{" "}
            refers to the Sunset Builder web application, including all
            features, tools, and content generation capabilities.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              &ldquo;User&rdquo;, &ldquo;you&rdquo;, &ldquo;your&rdquo;
            </strong>{" "}
            refers to any individual or entity that creates an account or uses
            the Service.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              &ldquo;We&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;
            </strong>{" "}
            refers to Sunset Builder, a company based in Poland.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              &ldquo;User Content&rdquo;
            </strong>{" "}
            refers to any text, images, designs, landing pages, or other
            materials you create, upload, or generate using the Service.
          </p>
        </LegalSection>

        <LegalSection title="2. Eligibility">
          <p>
            You must be at least 16 years old to use Sunset Builder. By using
            the Service, you represent that you meet this requirement and have
            the legal capacity to enter into these Terms.
          </p>
        </LegalSection>

        <LegalSection title="3. Your Account">
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activities that occur under your
            account. You agree to notify us immediately of any unauthorized
            access. We reserve the right to suspend or terminate accounts that
            violate these Terms.
          </p>
        </LegalSection>

        <LegalSection title="4. Acceptable Use">
          <p>You agree not to use the Service to:</p>
          <LegalList>
            <li>Violate any applicable law or regulation.</li>
            <li>
              Create content that is defamatory, fraudulent, misleading, or
              harmful.
            </li>
            <li>
              Generate phishing pages, scam sites, or any content designed to
              deceive others.
            </li>
            <li>
              Infringe on the intellectual property rights of any third party.
            </li>
            <li>Distribute malware, spam, or other malicious content.</li>
            <li>
              Attempt to reverse-engineer, exploit, or interfere with the
              Service&rsquo;s infrastructure.
            </li>
            <li>
              Resell, sublicense, or redistribute the Service without our
              written consent.
            </li>
          </LegalList>
          <p>
            We reserve the right to remove any content and suspend or terminate
            any account that violates this section, at our sole discretion.
          </p>
        </LegalSection>

        <LegalSection title="5. AI-Generated Content">
          <p>
            Sunset Builder uses artificial intelligence to help you create
            landing pages. You acknowledge that:
          </p>
          <LegalList>
            <li>
              AI-generated content may not always be accurate, complete, or
              suitable for your specific needs. You are responsible for
              reviewing and editing all generated content before publishing.
            </li>
            <li>
              We do not guarantee that AI-generated content is free from errors
              or that it will not resemble content created for other users.
            </li>
            <li>
              You are solely responsible for ensuring that any content you
              publish complies with applicable laws, including advertising
              regulations, intellectual property laws, and consumer protection
              standards.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="6. Intellectual Property">
          <p>
            <strong className="font-semibold text-gray-900">
              Your content:
            </strong>{" "}
            You retain full ownership of the User Content you create using
            Sunset Builder. By using the Service, you grant us a limited,
            non-exclusive license to host, store, and display your User Content
            solely for the purpose of providing the Service to you.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              Our platform:
            </strong>{" "}
            All rights, title, and interest in the Service itself — including
            its design, code, AI models (as licensed to us), branding, and
            documentation — remain with Sunset Builder. These Terms do not
            grant you any rights to our trademarks, logos, or other brand
            assets.
          </p>
        </LegalSection>

        <LegalSection title="7. Subscriptions and Payments">
          <p>
            Sunset Builder offers paid subscription plans. By subscribing, you
            agree to the following:
          </p>
          <LegalList>
            <li>
              Subscription fees are billed in advance on a recurring basis
              (monthly or annually, depending on your plan).
            </li>
            <li>
              All fees are stated in euros (€) and are inclusive of applicable
              taxes unless otherwise noted.
            </li>
            <li>
              You may cancel your subscription at any time. Cancellation takes
              effect at the end of the current billing period. No partial
              refunds are provided for unused time.
            </li>
            <li>
              We reserve the right to change pricing with at least 30 days&rsquo;
              notice. Continued use after the price change constitutes
              acceptance of the new pricing.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="8. Credits and Usage Limits">
          <p>
            Certain features of the Service (such as AI-powered content
            generation) are subject to a credit-based usage system. Credits are
            allocated based on your subscription plan. Unused credits do not
            roll over to the next billing period unless otherwise stated. We
            reserve the right to adjust credit allocations with reasonable
            notice.
          </p>
        </LegalSection>

        <LegalSection title="9. Availability and Support">
          <p>
            We aim to keep Sunset Builder available at all times but do not
            guarantee uninterrupted access. The Service may be temporarily
            unavailable due to maintenance, updates, or circumstances beyond
            our control. We will make reasonable efforts to notify you of
            planned downtime in advance.
          </p>
        </LegalSection>

        <LegalSection title="10. Limitation of Liability">
          <p>To the maximum extent permitted by applicable law:</p>
          <LegalList>
            <li>
              Sunset Builder is provided on an &ldquo;as is&rdquo; and
              &ldquo;as available&rdquo; basis, without warranties of any kind,
              whether express or implied.
            </li>
            <li>
              We are not liable for any indirect, incidental, special,
              consequential, or punitive damages, including lost profits, lost
              revenue, or loss of data.
            </li>
            <li>
              Our total aggregate liability to you for any claims arising from
              or related to the Service shall not exceed the total amount you
              paid us in the 12 months preceding the claim.
            </li>
          </LegalList>
          <p>
            Nothing in these Terms excludes or limits liability that cannot be
            excluded or limited under applicable law, including liability for
            fraud or willful misconduct.
          </p>
        </LegalSection>

        <LegalSection title="11. Indemnification">
          <p>
            You agree to indemnify and hold harmless Sunset Builder and its
            affiliates, officers, and employees from any claims, damages,
            losses, or expenses (including reasonable legal fees) arising from
            your use of the Service, your User Content, or your violation of
            these Terms.
          </p>
        </LegalSection>

        <LegalSection title="12. Termination">
          <p>
            Either party may terminate these Terms at any time. You can
            terminate by deleting your account or contacting us. We may
            terminate or suspend your access immediately if you breach these
            Terms. Upon termination, your right to use the Service ceases. We
            will delete your account data within 30 days, except where
            retention is required by law.
          </p>
        </LegalSection>

        <LegalSection title="13. Governing Law and Disputes">
          <p>
            These Terms are governed by and construed in accordance with the
            laws of the Republic of Poland. Any disputes arising from these
            Terms shall be submitted to the competent courts in Poland. If you
            are a consumer within the EU, you retain the right to bring
            proceedings in the courts of your country of residence and to
            benefit from any mandatory consumer protection provisions of your
            local law.
          </p>
          <p>
            You may also use the European Commission&rsquo;s Online Dispute
            Resolution (ODR) platform at{" "}
            <LegalLink href="https://ec.europa.eu/consumers/odr">
              ec.europa.eu/consumers/odr
            </LegalLink>
            .
          </p>
        </LegalSection>

        <LegalSection title="14. Changes to These Terms">
          <p>
            We may modify these Terms at any time. If we make material changes,
            we will notify you by email or through a prominent notice in the
            Service at least 14 days before the changes take effect. Your
            continued use of the Service after the changes take effect
            constitutes acceptance of the updated Terms.
          </p>
        </LegalSection>

        <LegalSection title="15. Severability">
          <p>
            If any provision of these Terms is found to be unenforceable, the
            remaining provisions will continue in full force and effect.
          </p>
        </LegalSection>

        <LegalSection title="16. Contact">
          <p>For questions about these Terms, contact us at:</p>
          <LegalContactCard>
            <p className="font-semibold text-gray-900">Sunset Builder</p>
            <p>
              Email:{" "}
              <LegalLink href="mailto:hello@sunsetbuilder.com">
                hello@sunsetbuilder.com
              </LegalLink>
            </p>
            <p>Based in Poland</p>
          </LegalContactCard>
        </LegalSection>
      </div>
    </article>
  );
}
