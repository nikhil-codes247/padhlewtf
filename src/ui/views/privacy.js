/**
 * privacy.js — Privacy Policy page.
 *
 * Explains what personal data PADHLE.WTF collects, how it is used, who it is
 * shared with, and the rights students have over their data. The standalone
 * `/privacy` page carries the same policy in crawlable HTML; keep the two in
 * step when the policy changes.
 */
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
          <li><b>Account information:</b> your email address, chosen username, display name and avatar. Google Sign-In also shares your Google name, email, profile picture URL and account identifier.</li>
          <li><b>Study data:</b> subjects, chapters and topics you choose, planner tasks, study sessions, revisions, notes, doubts, flashcard progress and practice question attempts.</li>
          <li><b>Preferences:</b> theme (light/dark), reminder settings, daily study targets and calendar preferences.</li>
          <li><b>Payment information:</b> a Razorpay payment/order identifier, amount, status and contact details. We never store card numbers, CVV, UPI PINs or bank credentials.</li>
          <li><b>Technical data:</b> IP address, browser type, device information and error logs, used for security and abuse prevention — never for advertising or profiling.</li>
        </ul>
      </section>

      <section class="card">
        <h2>2. How we use your information</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li>To provide and maintain your study workspace, including syncing your data across devices.</li>
          <li>To personalise your dashboard, planner and revision recommendations based on your own activity.</li>
          <li>To verify payments, unlock full access on the correct account and send receipts.</li>
          <li>To send account communications such as email confirmation and password reset links.</li>
          <li>To detect fraud or unauthorised access and to improve the app from aggregated, anonymised usage. We never sell your personal data.</li>
        </ul>
      </section>

      <section class="card">
        <h2>3. Google Sign-In and Google user data</h2>
        <p class="small muted">If you choose “Continue with Google”, Google shares your name, email address, profile picture URL and a Google account identifier. We use them only to create and secure your account, display your name and avatar, and keep your study data linked to you across devices. We do not request Gmail, Drive, Calendar, contacts or location, and we never use Google user data for advertising, profiling or sale.</p>
        <p class="small muted">PADHLE.WTF’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. You can revoke access from your Google Account’s security settings at any time.</p>
      </section>

      <section class="card">
        <h2>4. Row Level Security — your data is isolated</h2>
        <p class="small muted">Every piece of study data you create is tied to your account. Supabase Row Level Security ensures that one student can never read or write another student's rows. Your sessions, notes, planner tasks and revisions are accessible only to you when signed in.</p>
      </section>

      <section class="card">
        <h2>5. Payments</h2>
        <p class="small muted">Full access is a one-time purchase of ₹199 processed by Razorpay, a PCI-DSS compliant payment processor. PADHLE.WTF does not store your card number or payment credentials. After a successful payment, Razorpay notifies our server, which verifies the signature and activates full access on your account until 10 March 2027.</p>
      </section>

      <section class="card">
        <h2>6. Who processes your data</h2>
        <p class="small muted">Supabase (authentication and database), Cloudflare Pages (hosting and payment-verification functions), Razorpay (payments), Google (only if you choose Google Sign-In) and Zoho Mail (support email). They process data on our instructions and under their own security terms.</p>
      </section>

      <section class="card">
        <h2>7. Data retention</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li>Your account data is retained as long as your account exists.</li>
          <li>If you delete your account, your personal data and study records are permanently deleted from our live systems, subject to short-lived backups and payment records we must keep by law.</li>
          <li>If you clear your study data from Settings, your planner tasks, sessions, revisions, notes and completion ticks are deleted. Your profile and subject selection are kept.</li>
          <li>Backup exports you create remain in your possession until you delete them.</li>
        </ul>
      </section>

      <section class="card">
        <h2>8. Your rights</h2>
        <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
          <li><b>Access:</b> view and export your account data from the Account page.</li>
          <li><b>Correct:</b> update your username, display name and avatar at any time from Settings.</li>
          <li><b>Delete:</b> delete your account and all associated data permanently from Settings or the Account page.</li>
          <li><b>Object:</b> object to processing of your data for purposes other than providing the service.</li>
          <li>To exercise any of these rights, sign in and use the relevant page, or contact <b>support@padhle.wtf</b>.</li>
        </ul>
      </section>

      <section class="card">
        <h2>9. Cookies</h2>
        <p class="small muted">We use cookies and browser storage to keep you signed in, remember your preferences and cache the app so it opens quickly. Essential storage is required for the site to function; optional storage is used only after you accept it. We do not run advertising cookies or cross-site trackers.</p>
      </section>

      <section class="card">
        <h2>10. Children</h2>
        <p class="small muted">PADHLE.WTF is intended for students. We collect only the data needed to provide the study workspace and do not knowingly collect personal data from children under 13 without parental consent. If you believe a child under 13 has provided personal data, contact <b>support@padhle.wtf</b>.</p>
      </section>

      <section class="card">
        <h2>11. Changes to this policy</h2>
        <p class="small muted">We may update this privacy policy from time to time. When we make material changes, we will update the effective date at the top of this page and notify you through the app.</p>
      </section>

      <section class="card">
        <h2>12. Contact us</h2>
        <p class="small muted">Privacy and data requests: <b>support@padhle.wtf</b><br>
        Billing and payments: <b>billing@padhle.wtf</b><br>
        Product feedback: <b>feedback@padhle.wtf</b><br>
        Founder: <b>founder@padhle.wtf</b></p>
        <p class="small muted">PADHLE.WTF — Full access until 10 March 2027.</p>
      </section>
    </div>
    `;
  },
};
