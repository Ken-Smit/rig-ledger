import { Link } from 'react-router-dom'

// Placeholders ([[COMPANY_LEGAL_NAME]], [[STATE]], [[CONTACT_EMAIL]],
// [[EFFECTIVE_DATE]]) are rendered literally — they are filled in later by
// legal before launch. Do not invent values.
//
// CASING NOTE: Section headings follow the app's Title Case convention. The
// all-caps blocks in "Disclaimer of Warranties" and "Limitation of Liability"
// are intentional and preserved verbatim — under the UCC, warranty disclaimers
// and liability limits must be "conspicuous", and all-caps is the standard
// legal convention for that. This is NOT a UI-casing mistake; do not lowercase.
export default function Terms() {
  return (
    <div className="legalwrap">
      <div className="legal">
        <div className="legal-notice">
          This Terms of Service is a template provided for convenience and is
          not legal advice. Have a licensed attorney review and adapt it before
          relying on it.
        </div>

        <div className="legal-back">
          <Link to="/login">← Back to sign in</Link>
          <Link to="/home">Home</Link>
        </div>

        <h1>Terms of Service</h1>
        <p className="legal-sub">Effective [[EFFECTIVE_DATE]]</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By creating an account or using Rig Ledger (the "Service"), operated
          by [[COMPANY_LEGAL_NAME]] ("Company", "we", "us"), you agree to these
          Terms of Service. If you do not agree, do not use the Service. You
          must be at least 18 years old and able to form a binding contract.
        </p>

        <h2>2. Description of the Service</h2>
        <p>
          Rig Ledger is a software-as-a-service fleet-management platform for
          owner-operators and small trucking fleets. It provides expense and
          income tracking, profit-and-loss reporting, fuel and IFTA bookkeeping
          aids, truck and maintenance records, load tracking, AI-assisted
          receipt scanning, and hours-of-service (HOS) logging tools. The
          Service is a record-keeping and planning aid only.
        </p>

        <h2>3. Not a Certified ELD; Compliance Is Your Responsibility</h2>
        <p>
          The hours-of-service feature is NOT a certified Electronic Logging
          Device under 49 CFR Part 395 and is not registered with the FMCSA. HOS
          clocks and related outputs are estimates provided for planning and
          personal record-keeping only. You are solely responsible for
          compliance with all applicable FMCSA, DOT, and state regulations,
          including any electronic-logging mandate, hours-of-service limits, and
          recordkeeping requirements. Do not rely on the Service to satisfy any
          legal compliance obligation.
        </p>

        <h2>4. No Professional Advice</h2>
        <p>
          The Service does not provide legal, tax, accounting, or financial
          advice. All outputs, including profit-and-loss figures, IFTA
          calculations, expense categorization, and AI receipt scans, are
          informational and may contain errors. Verify all figures and consult a
          qualified professional before filing taxes or IFTA returns or making
          business decisions.
        </p>

        <h2>5. Accounts and Security</h2>
        <p>
          You are responsible for safeguarding your login credentials and for
          all activity under your account. Notify us promptly of any
          unauthorized use. We may suspend or disable accounts that violate
          these Terms.
        </p>

        <h2>6. Subscriptions, Billing, and Refunds</h2>
        <p>
          Paid plans are billed in advance on a recurring basis through our
          third-party payment processor. Fees are those listed at the time of
          purchase. Subscriptions automatically renew until canceled; you may
          cancel at any time, effective at the end of the current billing
          period. Except where required by law, fees are non-refundable. You
          authorize us and our processor to charge your payment method on a
          recurring basis. You are responsible for applicable taxes. We may
          change pricing on prior notice.
        </p>

        <h2>7. Acceptable Use</h2>
        <p>
          You agree not to use the Service unlawfully; not to reverse engineer,
          decompile, or attempt to access non-public areas; not to upload
          malicious code; not to infringe others' rights; and not to use the
          Service to violate any transportation, financial, or other regulation.
        </p>

        <h2>8. Your Data</h2>
        <p>
          You retain ownership of the data you submit. You grant us a worldwide,
          non-exclusive license to host, process, transmit, and display that
          data solely to operate and improve the Service. You represent that you
          have the right to submit it, and you are responsible for its accuracy.
          Our handling of personal data is described in our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <h2>9. AI Features</h2>
        <p>
          The AI receipt scanner relies on third-party machine-learning models
          and may produce inaccurate or incomplete results. You must review and
          confirm all scanned data before relying on it.
        </p>

        <h2>10. Third-Party Services</h2>
        <p>
          The Service integrates third-party providers, including payment
          processing, AI, and email delivery. We are not responsible for the
          acts, omissions, or outages of third parties.
        </p>

        <h2>11. Disclaimer of Warranties</h2>
        {/* All-caps preserved verbatim — UCC conspicuousness, not a UI-casing mistake. */}
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES
          OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING ANY
          IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, TITLE, NON-INFRINGEMENT, AND ANY WARRANTY OF ACCURACY OR
          REGULATORY COMPLIANCE. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED OR ERROR-FREE, OR THAT ANY CALCULATION, CLOCK, OR REPORT
          IS ACCURATE, COMPLETE, OR COMPLIANT WITH ANY LAW OR REGULATION.
        </p>

        <h2>12. Limitation of Liability</h2>
        {/* All-caps preserved verbatim — UCC conspicuousness, not a UI-casing mistake. */}
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY AND ITS SUPPLIERS
          WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS,
          REVENUE, DATA, GOODWILL, OR BUSINESS, OR FOR ANY FINES, PENALTIES, OR
          REGULATORY ACTIONS, ARISING OUT OF OR RELATING TO YOUR USE OF OR
          INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF
          SUCH DAMAGES. THE COMPANY'S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS
          RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS
          YOU PAID US IN THE TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE
          CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS (USD $100). SOME JURISDICTIONS
          DO NOT ALLOW CERTAIN LIMITATIONS, SO SOME OF THE ABOVE MAY NOT APPLY
          TO YOU.
        </p>

        <h2>13. Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless the Company and its
          officers, employees, and suppliers from and against any claims,
          damages, losses, fines, penalties, and costs (including reasonable
          legal fees) arising out of or related to your use of the Service, your
          data, your violation of these Terms, or your violation of any law or
          regulation, including any DOT, FMCSA, or tax requirement.
        </p>

        <h2>14. Termination</h2>
        <p>
          You may stop using the Service and delete your account at any time. We
          may suspend or terminate your access for breach of these Terms or to
          protect the Service or other users. On termination, your right to use
          the Service ends. Sections that by their nature should survive
          (including data, disclaimers, limitation of liability,
          indemnification, and governing law) will survive.
        </p>

        <h2>15. Changes to the Service or Terms</h2>
        <p>
          We may modify the Service or these Terms. We will provide notice of
          material changes, and your continued use after the effective date
          constitutes acceptance. We retain a record of the Terms version you
          accepted at sign-up.
        </p>

        <h2>16. Governing Law and Disputes</h2>
        <p>
          These Terms are governed by the laws of [[STATE]], without regard to
          its conflict-of-laws rules. Any dispute will be resolved in the state
          or federal courts located in [[STATE]], and you consent to their
          jurisdiction, except where applicable law provides otherwise.
        </p>

        <h2>17. General</h2>
        <p>
          If any provision is held unenforceable, the rest remain in effect.
          These Terms are the entire agreement between you and the Company
          regarding the Service. Our failure to enforce a provision is not a
          waiver. We may assign these Terms; you may not assign them without our
          consent. Neither party is liable for delays caused by events beyond
          its reasonable control.
        </p>

        <h2>18. Contact</h2>
        <p>Questions about these Terms: [[CONTACT_EMAIL]].</p>

        <div className="legal-back legal-back-foot">
          <Link to="/login">← Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
