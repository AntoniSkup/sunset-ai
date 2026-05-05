import {
  LegalContactCard,
  LegalHighlight,
  LegalLink,
  LegalList,
  LegalPageHeader,
  LegalSection,
} from "../_components";

export default function PrivacyPageEn() {
  return (
    <article>
      <LegalPageHeader title="Privacy Policy" lastUpdated="April 25, 2026" />

      <LegalHighlight>
        Stronka AI (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;)
        is committed to protecting your personal data. This Privacy Policy
        explains what data we collect, why, and your rights under the EU
        General Data Protection Regulation (GDPR).
      </LegalHighlight>

      <div className="space-y-10">
        <LegalSection title="1. Data Controller">
          <p>
            The data controller responsible for your personal data is Stronka
            AI, based in Poland. For contact details, see Section 12 below.
          </p>
        </LegalSection>

        <LegalSection title="2. What Data We Collect">
          <p>We collect the following categories of personal data:</p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                Account data:
              </strong>{" "}
              name, email address, and password (hashed) when you register.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Billing data:
              </strong>{" "}
              payment information processed by our third-party payment
              provider. We do not store full credit card numbers.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Usage data:
              </strong>{" "}
              pages visited, features used, browser type, device information,
              and IP address.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Content data:
              </strong>{" "}
              landing pages, text, images, and other content you create using
              our service.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Communication data:
              </strong>{" "}
              messages you send to our support team.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="3. Why We Process Your Data">
          <p>
            We process your personal data for the following purposes and legal
            bases:
          </p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                To provide the service
              </strong>{" "}
              — processing is necessary for the performance of our contract
              with you (Art. 6(1)(b) GDPR).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                To process payments
              </strong>{" "}
              — performance of contract (Art. 6(1)(b) GDPR).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                To send service-related emails
              </strong>{" "}
              (e.g., account confirmations, security alerts) — legitimate
              interest (Art. 6(1)(f) GDPR).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                To send marketing emails
              </strong>{" "}
              — only with your explicit consent (Art. 6(1)(a) GDPR). You can
              opt out at any time.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                To improve the service
              </strong>{" "}
              — legitimate interest in understanding how users interact with
              Stronka AI (Art. 6(1)(f) GDPR).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                To comply with legal obligations
              </strong>{" "}
              — such as tax and accounting requirements (Art. 6(1)(c) GDPR).
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="4. AI-Generated Content">
          <p>
            Stronka AI uses third-party AI services (such as language
            models) to generate landing page content on your behalf. When you
            use these features, the text prompts and instructions you provide
            may be sent to our AI provider for processing. We do not use your
            content to train AI models. Please refer to our AI provider&rsquo;s
            privacy policy for details on their data handling practices.
          </p>
        </LegalSection>

        <LegalSection title="5. Cookies and Tracking">
          <p>
            We use essential cookies required for the service to function. We
            may also use analytics cookies to understand how you use Stronka
            AI. Before placing any non-essential cookies, we will ask for
            your consent via a cookie banner. You can withdraw consent or
            manage your cookie preferences at any time through your browser
            settings or our cookie settings panel.
          </p>
        </LegalSection>

        <LegalSection title="6. Third-Party Service Providers">
          <p>
            We share personal data with the following categories of service
            providers, all of whom are bound by data processing agreements:
          </p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                Hosting provider
              </strong>{" "}
              — to store and serve the application.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Payment processor
              </strong>{" "}
              — to handle billing and subscriptions.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                AI provider
              </strong>{" "}
              — to generate content as described in Section 4.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Analytics provider
              </strong>{" "}
              — to collect anonymized usage data (if applicable).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Email service provider
              </strong>{" "}
              — to deliver transactional and marketing emails.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="7. International Data Transfers">
          <p>
            Some of our service providers may be located outside the European
            Economic Area (EEA). Where this is the case, we ensure appropriate
            safeguards are in place, such as Standard Contractual Clauses
            (SCCs) approved by the European Commission, or reliance on an
            adequacy decision.
          </p>
        </LegalSection>

        <LegalSection title="8. Data Retention">
          <p>
            We retain your personal data only for as long as necessary to
            fulfil the purposes described in this policy. Specifically:
          </p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                Account and content data:
              </strong>{" "}
              retained for the duration of your account, and deleted within 30
              days of account deletion.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Billing records:
              </strong>{" "}
              retained as required by Polish tax law (currently 5 years).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Usage and analytics data:
              </strong>{" "}
              retained in anonymized form for up to 24 months.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="9. Your Rights Under GDPR">
          <p>As a data subject, you have the right to:</p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">Access</strong>{" "}
              your personal data and obtain a copy.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">Rectify</strong>{" "}
              inaccurate or incomplete data.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">Erase</strong>{" "}
              your data (&ldquo;right to be forgotten&rdquo;).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">Restrict</strong>{" "}
              processing in certain circumstances.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Data portability
              </strong>{" "}
              — receive your data in a structured, machine-readable format.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">Object</strong>{" "}
              to processing based on legitimate interests.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Withdraw consent
              </strong>{" "}
              at any time, without affecting the lawfulness of prior
              processing.
            </li>
          </LegalList>
          <p>
            To exercise any of these rights, contact us using the details in
            Section 12. We will respond within 30 days.
          </p>
        </LegalSection>

        <LegalSection title="10. Data Security">
          <p>
            We implement appropriate technical and organizational measures to
            protect your personal data, including encryption in transit (TLS),
            secure password hashing, access controls, and regular security
            reviews.
          </p>
        </LegalSection>

        <LegalSection title="11. Children's Privacy">
          <p>
            Stronka AI is not intended for use by individuals under the age
            of 16. We do not knowingly collect personal data from children. If
            we become aware that a child has provided us with personal data,
            we will delete it promptly.
          </p>
        </LegalSection>

        <LegalSection title="12. Contact Us">
          <p>
            If you have questions about this Privacy Policy or wish to
            exercise your data rights, you can reach us at:
          </p>
          <LegalContactCard>
            <p className="font-semibold text-gray-900">Stronka AI</p>
            <p>
              Email:{" "}
              <LegalLink href="mailto:privacy@stronkaai.com">
                privacy@stronkaai.com
              </LegalLink>
            </p>
            <p>Based in Poland</p>
          </LegalContactCard>
          <p className="mt-4 text-xs text-gray-500">
            You also have the right to lodge a complaint with the Polish data
            protection authority (UODO — Urząd Ochrony Danych Osobowych) or
            any other competent EU supervisory authority.
          </p>
        </LegalSection>

        <LegalSection title="13. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. If we make
            significant changes, we will notify you via email or a prominent
            notice within the service. The &ldquo;Last updated&rdquo; date at
            the top of this page reflects the most recent revision.
          </p>
        </LegalSection>
      </div>
    </article>
  );
}
