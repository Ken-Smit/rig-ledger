import { Link } from 'react-router-dom'
import {
  LEGAL_CONTACT_EMAIL as CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE as EFFECTIVE_DATE,
  LEGAL_GOVERNING_STATE as GOVERNING_STATE,
} from '../utils/legal'

// Headings follow the app's Title Case convention; body is sentence case. A
// privacy policy needs no UCC-style all-caps (that requirement is specific to
// warranty/liability disclaimers, which live in the Terms of Service).
//
// ACCURACY: every statement here must match what the code actually does. Keep
// in sync when any of these change:
//   - Cookies/storage: httpOnly auth cookies + `ff-theme` in localStorage only.
//     Adding analytics/tracking requires revisiting this section AND consent
//     (EU/UK users would then need a prior-opt-in cookie banner).
//   - Receipt scan: image sent to Google Gemini, parsed, discarded — never
//     written to disk or object storage (receiptController.go).
//   - Providers: Stripe, Google (Gemini), Resend, Render, MongoDB Atlas,
//     Cloudflare.
//   - Account deletion: DeleteUser cascade in user_handlers.go.
export default function Privacy() {
  return (
    <div className="legalwrap">
      <div className="legal">
        <div className="legal-back">
          <Link to="/login">← Back to sign in</Link>
          <Link to="/home">Home</Link>
          <Link to="/terms">Terms of Service</Link>
        </div>

        <h1>Privacy Policy</h1>
        <p className="legal-sub">Effective {EFFECTIVE_DATE}</p>

        <h2>1. Introduction</h2>
        <p>
          This Privacy Policy explains how Rig Ledger ("Rig Ledger", "we",
          "us", or "our") collects, uses, shares, and protects information when
          you use the Rig Ledger website, web application, and related services
          (the "Service"). It is part of, and should be read together with, our{' '}
          <Link to="/terms">Terms of Service</Link>.
        </p>
        <p>
          The Service is built for trucking businesses. When a fleet owner
          invites drivers, the fleet owner decides what records are kept in the
          fleet, and we process drivers' information on the owner's behalf to
          provide the Service.
        </p>

        <h2>2. Information We Collect</h2>
        <p>
          <strong>Account information.</strong> Your first and last name, email
          address, password, role (fleet owner or driver), and the fleet you
          belong to. Passwords are stored only as a one-way bcrypt hash; we never
          store or see your password in plain text. We also record whether you
          verified your email and when, and which version of the Terms of
          Service you accepted.
        </p>
        <p>
          <strong>Business records you enter.</strong> Trucks and maintenance
          details, expenses and income, loads, mileage logs, fuel purchases and
          IFTA miles, and hours-of-service duty-status logs.
        </p>
        <p>
          <strong>Driver invitations.</strong> When a fleet owner invites a
          driver, we store the invitation, including the email address it was
          sent to, until it is used, expires, or is deleted.
        </p>
        <p>
          <strong>Receipt images.</strong> When you use the AI receipt scanner,
          the image you upload is sent to our AI provider to read the receipt
          details. We do not save the image; only the fields you review and
          choose to save become part of your records.
        </p>
        <p>
          <strong>Payment information.</strong> Subscriptions are processed by
          Stripe. Your card details are entered on Stripe's pages and go directly
          to Stripe; we never receive or store your full card number. We keep
          limited billing information, such as your plan, subscription status,
          trial status, promo code use, and Stripe's customer and subscription
          identifiers.
        </p>
        <p>
          <strong>Technical information.</strong> When you use the Service, our
          servers and hosting providers automatically receive standard log data
          such as your IP address, browser and device type, pages or endpoints
          requested, and timestamps. We use it for security, rate limiting,
          abuse prevention, and troubleshooting.
        </p>
        <p>
          <strong>Communications.</strong> If you email us, we keep your message
          and our reply to help with your request.
        </p>

        <h2>3. How We Use Information</h2>
        <p>We use information to:</p>
        <ul>
          <li>provide, maintain, and improve the Service;</li>
          <li>create and secure your account, verify your email, and reset your password;</li>
          <li>let fleet owners invite and manage drivers;</li>
          <li>process trials, subscriptions, promo codes, and payments;</li>
          <li>send service and transactional messages, such as verification, security, and billing emails;</li>
          <li>respond to support requests;</li>
          <li>detect, prevent, and investigate fraud, abuse, and security incidents; and</li>
          <li>comply with legal obligations and enforce our Terms.</li>
        </ul>
        <p>
          We do not sell your information, use your business records for
          advertising, or build advertising profiles about you. We do not send
          marketing emails without your consent.
        </p>

        <h2>4. Cookies and Local Storage</h2>
        <p>
          We use only strictly necessary and functional storage:
        </p>
        <ul>
          <li>
            <strong>Sign-in cookies.</strong> Secure, httpOnly cookies holding
            your access and refresh tokens keep you signed in and protect your
            session. The Service cannot work without them.
          </li>
          <li>
            <strong>Theme preference.</strong> Your light or dark theme choice
            is saved in your browser's local storage. It contains no personal
            information and is not used for tracking.
          </li>
        </ul>
        <p>
          We do not use analytics, advertising, or cross-site tracking cookies,
          so the Service does not show a cookie consent banner. Stripe may set
          its own cookies on its hosted checkout and billing pages, governed by
          Stripe's privacy policy. If we ever add analytics or advertising
          technologies, we will update this Policy first and ask for any consent
          the law requires.
        </p>

        <h2>5. How We Share Information</h2>
        <p>
          We do not sell or rent personal information, and we do not share it
          for cross-context behavioral advertising. We share information only
          as follows:
        </p>
        <ul>
          <li>
            <strong>Within your fleet.</strong> Fleet owners can see the records
            in their fleet, including information entered by drivers they
            invite. Drivers see only what the Service makes available to their
            role.
          </li>
          <li>
            <strong>Service providers</strong> that process information for us
            only as needed to run the Service:
            <ul>
              <li>Stripe — payment processing and billing;</li>
              <li>Google (Gemini API) — AI receipt scanning;</li>
              <li>Resend — sending account and service emails;</li>
              <li>Render — application hosting;</li>
              <li>MongoDB Atlas — database hosting; and</li>
              <li>Cloudflare — domain, network, and security services.</li>
            </ul>
          </li>
          <li>
            <strong>Legal and safety.</strong> When we believe in good faith it
            is required by law, subpoena, or other legal process, or needed to
            protect the rights, safety, or property of you, other users, us, or
            the public, or to enforce our Terms.
          </li>
          <li>
            <strong>Business transfers.</strong> In connection with forming a
            business entity, or a merger, acquisition, financing, or sale of
            assets, subject to this Policy.
          </li>
          <li>
            <strong>With your direction.</strong> When you ask us to share
            information or give consent.
          </li>
        </ul>

        <h2>6. Data Retention</h2>
        <p>
          We keep your information while your account is active and as needed
          to provide the Service. When a driver deletes their account, their
          account is deleted and their open loads are unassigned; mileage and
          hours-of-service logs they entered stay with the fleet as the fleet
          owner's records. When a fleet owner deletes their account, the fleet
          and its trucks, expenses, loads, invitations, mileage logs,
          hours-of-service logs, and IFTA records are deleted. A fleet
          owner must cancel any active subscription and remove all drivers
          before deleting the account.
        </p>
        <p>
          Some information may remain for a limited period in backups and
          server logs, and may be kept longer where needed to comply with legal,
          tax, or accounting obligations, resolve disputes, prevent fraud, or
          enforce our agreements. Stripe keeps its own payment records under its
          policies. To ask us to delete any remaining information, contact us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>
          We are not a records-retention service. Keep your own copies of any
          records you are legally required to retain, such as tax, IFTA, and
          hours-of-service records, before deleting your account.
        </p>

        <h2>7. Security</h2>
        <p>
          We protect your information with measures including bcrypt password
          hashing, secure httpOnly session cookies with short-lived access
          tokens, encryption in transit (HTTPS), rate limiting on sign-in, and
          access controls that limit every record to your own fleet. No method
          of transmission or storage is completely secure, and we cannot
          guarantee absolute security. If we learn of a security breach
          affecting your personal information, we will notify you as required by
          applicable law.
        </p>

        <h2>8. Your Rights and Choices</h2>
        <p>
          You can view and update your name in your profile, and you can delete
          your account in the app. You may also contact us to request access to,
          correction of, a copy of, or deletion of your personal information. We
          will respond within the time required by applicable law, may need to
          verify your identity first, and will not discriminate against you for
          making a request.
        </p>
        <p>
          If you are a driver in a fleet, some requests about fleet records may
          need to go through your fleet owner, who controls those records. We
          will help direct your request.
        </p>
        <p>
          If you are in the European Union or United Kingdom, our legal bases
          for processing are performance of our contract with you, our
          legitimate interests in operating and securing the Service, your
          consent where we ask for it, and compliance with legal obligations.
          You may also have the right to object to or restrict processing and to
          complain to your local data protection authority.
        </p>

        <h2>9. Children's Privacy</h2>
        <p>
          The Service is for business use by adults. It is not directed to
          children, and we do not knowingly collect personal information from
          anyone under 18. If you believe a minor has given us information,
          contact us and we will delete it.
        </p>

        <h2>10. Where Information Is Processed</h2>
        <p>
          Rig Ledger is operated from the State of {GOVERNING_STATE}, United
          States. Your information is processed in the United States and may be
          processed in other countries where our service providers operate,
          which may have different data protection laws than where you live.
        </p>

        <h2>11. Third-Party Sites and Services</h2>
        <p>
          The Service links to and integrates third-party services, such as
          Stripe's checkout and billing pages. Their privacy practices are
          governed by their own policies, and we are not responsible for them.
        </p>

        <h2>12. Changes to This Policy</h2>
        <p>
          We may update this Policy from time to time. We will post the updated
          version with a new effective date and, for material changes, notify
          you by email or in the Service before the changes take effect. Your
          continued use of the Service after the effective date means you accept
          the updated Policy.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions about this Policy or your information:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>

        <div className="legal-back legal-back-foot">
          <Link to="/login">← Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
