/**
 * privacy.js — Privacy Policy page.
 *
 * Explains what personal data PADHLE.WTF collects, how it is used, who it is
 * shared with, and the rights students have over their data. Written in plain
 * language and tailored to the actual features of the application.
 */
import { esc } from "../dom.js";
import { sectionCard } from "../components.js";
import { brand, TAGLINE } from "../../core/branding.js";

const PRIVACY_EFFECTIVE_DATE = "26 November 2026";

export default {
  id: "privacy",
  title: "Privacy Policy",
  render(ctx) {
    return `
    <div class="privacy-page">
      <section class="card stripe tight">
        <div class="row wrap between gap-3">
          <div>
            <span class="eyebrow">Privacy Policy</span>
            <h1 style="margin:4px 0 0">Your privacy, explained</h1>
            <p class="small muted" style="margin:0">Effective date: ${PRIVACY_EFFECTIVE_DATE}. This policy explains how PADHLE.WTF collects, uses and protects your personal data.</p>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>1. What information we collect</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li><b>Account information:</strong> When you sign up, we collect your email address, chosen username, display name and avatar. This identifies you and keeps your study data associated with your account.</li>
          <li><b>Study data:</strong> Chapters and topics you choose, planner tasks, study sessions, revisions, notes, doubts, flashcard progress and practice question attempts. All of this is yours and helps the app personalize your study plan.</li>
          <li><b>Preferences:</strong> Theme (light/dark), reminder settings, daily study targets and calendar preferences.</li>
          <li><b>Payment information:</strong> We do not store credit card numbers. Payments are processed by Razorpay; see our Payments section below.</li>
          <li><b>Technical data:</strong> Your IP address, browser type and device information may be logged for security and abuse prevention. We do not use this for advertising or profiling.</li>
        </ul>
      </section>

      <section class="card">
        <h2>2. How we use your information</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li>To provide and maintain your study workspace, including syncing your data across devices.</li>
          <li>To personalize your dashboard, planner and revision recommendations based on your chosen subjects and study activity.</li>
          <li>To send you account-related communications (for example, password reset links or payment receipts).</li>
          <li>To detect and prevent fraud, abuse or unauthorized access to accounts.</li>
          <li>To improve the app based on aggregated, anonymized usage patterns. We never sell your personal data to third parties.</li>
        </ul>
      </section>

      <section class="card">
        <h2>3. Row Level Security — your data is isolated</h2>
        <p class="small muted">Every piece of study data you create is tied to your account. Supabase Row Level Security ensures that one student can never read or write another student's rows. Your sessions, notes, planner tasks and revisions are accessible only to you when signed in.</p>
      </section>

      <section class="card">
        <h2>4. Payments</h2>
        <p class="small muted">Full access is a one-time purchase of ₹199 processed by Razorpay. PADHLE.WTF does not store your card number or payment credentials. Razorpay is PCI-DSS compliant and handles payment processing on their secure servers. After a successful payment, Razorpay notifies our server, which activates full access on your account.</p>
      </section>

      <section class="card">
        <h2>5. Data retention</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li>Your account data is retained as long as your account exists.</li>
          <li>If you delete your account, your personal data and study records are permanently deleted from our servers.</li>
          <li>If you clear your study data from Settings, your planner tasks, sessions, revisions, notes and completion ticks are deleted. Your profile and subject selection are kept.</li>
          <li>Backup exports you create remain in your possession until you delete them.</li>
        </ul>
      </section>

      <section class="card">
        <h2>6. Your rights</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li><b>Access:</strong> You can view and export your account data from the Account page.</li>
          <li><b>Correct:</strong> You can update your username, display name and avatar at any time from Settings.</li>
          <li><b>Delete:</strong> You can delete your account and all associated data permanently from Settings.</li>
          <li><b>Object:</strong> You can object to processing of your data for purposes other than providing the service.</li>
          <li>To exercise any of these rights, sign in and use the relevant page, or contact us at <b>hello@padhle.wtf</b>.</li>
        </ul>
      </section>

      <section class="card">
        <h2>7. Cookies</h2>
        <p class="small muted">We use cookies and similar technologies to keep you signed in, remember your preferences and understand how you use the site. You can manage cookie preferences through your browser settings. Some cookies are necessary for the site to function; others are optional and require your consent.</p>
      </section>

      <section class="card">
        <h2>8. Children</h2>
        <p class="small muted">PADHLE.WTF is intended for students. We do not knowingly collect personal data from children under 13 without parental consent. If you believe a child under 13 has provided personal data, please contact us at <b>hello@padhle.wtf</b>.</p>
      </section>

      <section class="card">
        <h2>9. Changes to this policy</h2>
        <p class="small muted">We may update this privacy policy from time to time. When we make material changes, we will update the effective date at the top of this page and notify you through the app.</p>
      </section>

      <section class="card">
        <h2>10. Contact us</h2>
        <p class="small muted">If you have questions about this privacy policy or your data, contact us at:</p>
        <p class="small muted"><b>hello@padhle.wtf</b></p>
        <p class="small muted">PADHLE.WTF — Full access until 10 March 2027</p>
      </section>
    </div>
    `;
  },
};