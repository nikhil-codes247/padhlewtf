/**
 * terms.js — Terms and Conditions page.
 *
 * Explains the terms under which PADHLE.WTF is provided, including eligibility,
 * account responsibilities, payment terms, intellectual property and
 * limitations of liability. Written in plain language.
 */
import { esc } from "../dom.js?v=mwz7i9p1";
import { sectionCard } from "../components.js?v=mwz7i9p1";
import { brand, TAGLINE } from "../../core/branding.js?v=mwz7i9p1";

const TERMS_EFFECTIVE_DATE = "26 November 2026";

export default {
  id: "terms",
  title: "Terms and Conditions",
  render(ctx) {
    return `
    <div class="terms-page">
      <section class="card stripe tight">
        <div class="row wrap between gap-3">
          <div>
            <span class="eyebrow">Terms and Conditions</span>
            <h1 style="margin:4px 0 0">Terms of Service</h1>
            <p class="small muted" style="margin:0">Effective date: ${TERMS_EFFECTIVE_DATE}. By using PADHLE.WTF, you agree to these terms.</p>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>1. Acceptance of terms</h2>
        <p class="small muted">By accessing or using PADHLE.WTF ("the App"), you agree to these Terms and Conditions. If you do not agree, you may not use the App. Using the App constitutes acceptance of these terms and our Privacy Policy.</p>
      </section>

      <section class="card">
        <h2>2. Eligibility</h2>
        <p class="small muted">You must be at least 13 years old to create an account. If you are under 18, you should have parental or guardian consent. By creating an account, you represent that you meet these requirements.</p>
      </section>

      <section class="card">
        <h2>3. Your account</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li>You are responsible for keeping your account credentials secure.</li>
          <li>You are responsible for all activity that occurs under your account.</li>
          <li>You must provide accurate and complete information when registering.</li>
          <li>You may not share your account credentials with others.</li>
        </ul>
      </section>

      <section class="card">
        <h2>4. Paid access</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li>Full access is a one-time purchase of ₹199 processed by Razorpay.</li>
          <li>Payment is processed by Razorpay; PADHLE.WTF does not store your card details.</li>
          <li>Upon successful payment, full access is activated on your account until 10 March 2027.</li>
          <li>All sales are final. Refunds are considered only in cases of duplicate payment or technical failure.</li>
          <li>To request a refund, contact us at <b>billing@padhle.wtf</b> with your payment details.</li>
        </ul>
      </section>

      <section class="card">
        <h2>5. Acceptable use</h2>
        <p class="small muted">You agree not to:</p>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li>Use the App for any unlawful purpose.</li>
          <li>Attempt to access another student's data or circumvent Row Level Security.</li>
          <li>Use automated means (bots, scrapers) to extract data from the App.</li>
          <li>Interfere with or disrupt the operation of the App.</li>
          <li>Upload or transmit malicious code.</li>
        </ul>
      </section>

      <section class="card">
        <h2>6. Intellectual property</h2>
        <p class="small muted">PADHLE.WTF and its original content, features and functionality are owned by PADHLE.WTF and are protected by copyright, trademark and other laws. The CBSE Class 10 syllabus content is provided for educational purposes and remains the property of its respective owners.</p>
        <p class="small muted">You retain ownership of your notes, doubts and study data. By using the App, you grant PADHLE.WTF a license to store and display your data solely for the purpose of providing the service to you.</p>
      </section>

      <section class="card">
        <h2>7. Limitation of liability</h2>
        <p class="small muted">PADHLE.WTF is provided "as is" without warranties of any kind. To the maximum extent permitted by law, PADHLE.WTF is not liable for any indirect, incidental, special or consequential damages arising from your use of the App, including loss of study data or inability to access the App.</p>
      </section>

      <section class="card">
        <h2>8. Termination</h2>
        <p class="small muted">We may suspend or terminate your account if you violate these Terms. Upon termination, your access to the App ceases immediately. You may delete your account at any time from Settings.</p>
      </section>

      <section class="card">
        <h2>9. Governing law</h2>
        <p class="small muted">These terms are governed by the laws of India. Any disputes will be resolved in the courts located in India.</p>
      </section>

      <section class="card">
        <h2>10. Contact us</h2>
        <p class="small muted">If you have questions about these Terms, contact us at:</p>
        <p class="small muted"><b>support@padhle.wtf</b></p>
        <p class="small muted">PADHLE.WTF — Full access until 10 March 2027</p>
      </section>
    </div>
    `;
  },
};