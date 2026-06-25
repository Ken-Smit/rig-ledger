import { Link } from 'react-router-dom'

// Placeholders ([[COMPANY_LEGAL_NAME]], [[STATE]], [[CONTACT_EMAIL]],
// [[EFFECTIVE_DATE]]) are rendered literally — they are filled in later by
// legal before launch. Do not invent values.
//
// Headings follow the app's Title Case convention; body is sentence case. A
// privacy policy needs no UCC-style all-caps (that requirement is specific to
// warranty/liability disclaimers, which live in the Terms of Service).
//
// The "Cookies and Local Storage" section is written to match what the app
// actually stores today: strictly-necessary httpOnly auth cookies + a
// functional theme preference, and no analytics/advertising cookies. If
// tracking/analytics is ever added, this section AND the consent model must be
// revisited (EU/UK users would then require a prior-opt-in cookie banner).
export default function Privacy() {
  return (
    <div className="legalwrap">
      <div className="legal">
        <div className="legal-notice">
          This Privacy Policy is a template provided for convenience and is not
          legal advice. Have a licensed attorney review and adapt it before
          relying on it.
        </div>

        <div className="legal-back">
          <Link to="/login">← Back to sign in</Link>
          <Link to="/home">Home</Link>
          <Link to="/terms">Terms of Service</Link>
        </div>

        <h1>Privacy Policy</h1>
        <p className="legal-sub">Effective [[EFFECTIVE_DATE]]</p>

        <h2>1. Introduction</h2>
        <p>
          This Privacy Policy explains how [[COMPANY_LEGAL_NAME]] ("Company",
          "we", "us") collects, uses, shares, and protects information when you
          use Rig Ledger (the "Service"). By using the Service, you agree to this
          Policy. It should be read together with our{' '}
          <Link to="/terms">Terms of Service</Link>.
        </p>

        <h2>2. Information We Collect</h2>
        <p>
          Account information: your name, email address, and a securely hashed
          password. We never store your password in plain text.
        </p>
        <p>
          Business records you enter: trucks and maintenance details, expenses
          and income, loads, mileage, fuel and IFTA data, hours-of-service
          duty-status logs, and receipts you upload for scanning. This data is
          yours; we process it to operate the Service for you.
        </p>
        <p>
          Payment information: subscriptions are processed by our third-party
          payment processor (Stripe). We do not collect or store your full card
          number — Stripe handles card data directly. We retain limited billing
          metadata (such as plan, status, and the processor's customer and
          subscription identifiers).
        </p>
        <p>
          Technical information: when you use the Service we automatically
          receive standard server-log data such as your IP address, device and
          browser type, and timestamps, used for security, abuse prevention, and
          troubleshooting.
        </p>

        <h2>3. How We Use Information</h2>
        <p>
          We use information to provide and maintain the Service; authenticate
          you and keep your account secure; process subscriptions and billing;
          respond to support requests; send service and transactional messages
          (such as email verification and password resets); and comply with
          legal obligations. We process receipt images solely to extract the
          fields shown to you and do not use your business data to build
          advertising profiles.
        </p>

        <h2>4. Cookies and Local Storage</h2>
        <p>
          We use only strictly-necessary and functional storage. Specifically:
        </p>
        <p>
          Authentication cookies (such as our access and refresh tokens) are
          set as secure, httpOnly cookies and are required to keep you signed in
          and to protect your session. These are strictly necessary — the
          Service cannot function without them — and, under EU/UK ePrivacy
          rules, are exempt from prior consent.
        </p>
        <p>
          A functional preference (your light or dark theme) is stored in your
          browser's local storage. It holds no personal data and is not used for
          tracking.
        </p>
        <p>
          We do not use analytics, advertising, or cross-site tracking cookies.
          Because we use only strictly-necessary and functional storage, the
          Service does not display a cookie consent banner. If you complete a
          payment, our processor (Stripe) may set its own cookies on its hosted
          checkout pages, governed by Stripe's privacy policy. If we add
          analytics or advertising technologies in the future, we will update
          this Policy and provide any consent mechanism the law requires.
        </p>

        <h2>5. How We Share Information</h2>
        <p>
          We do not sell your personal information. We share information only
          with service providers who help us run the Service under contract —
          including payment processing (Stripe), AI receipt processing, email
          delivery, and hosting — and only as needed to provide the Service. We
          may also disclose information to comply with law or legal process, to
          enforce our Terms, to protect the rights, safety, or property of users
          or the public, or in connection with a merger, acquisition, or sale of
          assets (subject to this Policy).
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We retain your information for as long as your account is active and as
          needed to provide the Service, comply with legal and tax obligations,
          resolve disputes, and enforce our agreements. When you delete your
          account, we delete or anonymize your personal data within a reasonable
          period, except where retention is required by law.
        </p>

        <h2>7. Security</h2>
        <p>
          We protect your information with measures including password hashing
          (bcrypt), httpOnly and secure session cookies, encryption of data in
          transit (HTTPS), and access controls that scope every record to your
          own fleet. No method of transmission or storage is completely secure,
          and we cannot guarantee absolute security.
        </p>

        <h2>8. Your Rights and Choices</h2>
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, or export your personal data, and to object to or restrict
          certain processing. You can update your profile in the app, delete
          your account, or contact us to exercise these rights. We will not
          discriminate against you for exercising them. If you are in the EU/UK,
          our legal bases for processing include performance of our contract
          with you, our legitimate interests in operating and securing the
          Service, and compliance with legal obligations.
        </p>

        <h2>9. Children's Privacy</h2>
        <p>
          The Service is intended for business use by adults. It is not directed
          to children, and we do not knowingly collect personal information from
          anyone under 18. If you believe a minor has provided us information,
          contact us and we will delete it.
        </p>

        <h2>10. International Users</h2>
        <p>
          The Service is operated from the United States, and your information
          may be processed there and in other countries where our service
          providers operate. By using the Service, you understand your
          information may be transferred to locations with different data
          protection laws than your own.
        </p>

        <h2>11. Third-Party Links and Services</h2>
        <p>
          The Service may link to or integrate third-party sites and services.
          Their privacy practices are governed by their own policies, and we are
          not responsible for them.
        </p>

        <h2>12. Changes to This Policy</h2>
        <p>
          We may update this Policy from time to time. We will post the updated
          version with a new effective date and, for material changes, provide
          additional notice. Your continued use of the Service after the
          effective date constitutes acceptance of the updated Policy.
        </p>

        <h2>13. Contact</h2>
        <p>Questions about this Policy or your data: [[CONTACT_EMAIL]].</p>

        <div className="legal-back legal-back-foot">
          <Link to="/login">← Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
