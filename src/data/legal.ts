export interface LegalDoc {
  title: string;
  sections: { heading: string; body: string }[];
}

const OPERATOR = 'Aurora Veritatis, a student initiative in formation (not yet a registered association or company), 6353 Going am Wilden Kaiser, Austria';

/**
 * DRAFT legal texts. They are placeholders structured for review by a qualified lawyer
 * and must not be relied upon before operator details are completed and reviewed.
 */
export const LEGAL: Record<string, LegalDoc> = {
  terms: {
    title: 'Terms of Service',
    sections: [
      { heading: 'Scope', body: `These terms govern use of aurorav.app operated by ${OPERATOR}. The service is currently an early-access preview provided free of charge.` },
      { heading: 'Nature of the service', body: 'Aurora Veritatis provides research and educational tools. Content may be incomplete, delayed, estimated or simulated, and is labelled accordingly.' },
      { heading: 'Acceptable use', body: 'You may not scrape the service at scale, attempt to bypass access controls or rate limits, or use the service for unlawful purposes.' },
      { heading: 'No investment advice', body: 'Nothing on the platform constitutes investment, legal, tax or other professional advice. See the Risk Disclaimer.' },
      { heading: 'Liability', body: 'To be drafted under applicable (Austrian/EU) law after legal review.' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      { heading: 'Controller', body: `${OPERATOR}. Contact: auroraveritatissup@gmail.com.` },
      { heading: 'Data we process', body: 'As a guest, your preferences are stored only in your browser (localStorage), and your Personal Intelligence Brain graphs only in your browser (IndexedDB). We do not receive them. If you create an account, we process your email address and the preferences you choose to sync, stored with Supabase. Server logs are processed by Cloudflare.' },
      { heading: 'Legal bases', body: 'Contract performance (Art. 6(1)(b) GDPR) for accounts; legitimate interests (Art. 6(1)(f)) for security logging; consent (Art. 6(1)(a)) for optional analytics.' },
      { heading: 'Processors', body: 'Cloudflare (hosting), Supabase (database and authentication), Resend (transactional email), PostHog EU (analytics, only with consent). Further processors will be listed before launch.' },
      { heading: 'Your rights', body: 'Access, rectification, erasure, restriction, portability and objection, and the right to complain to a supervisory authority (in Austria: Datenschutzbehörde). Local data can be exported or deleted from the Account page. Signed-in users can delete their account and all synced data there too.' },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    sections: [
      { heading: 'Current use', body: 'The preview uses browser storage strictly to remember your preferences and, when signed in, your authentication session. No advertising cookies are used.' },
      { heading: 'Analytics', body: 'Product analytics will only be enabled after a consent mechanism is in place.' },
    ],
  },
  disclaimer: {
    title: 'Financial & Investment Risk Disclaimer',
    sections: [
      { heading: 'No advice', body: 'Aurora Veritatis is not a licensed investment adviser, broker or financial institution. Information is provided for research and education only.' },
      { heading: 'Data limitations', body: 'Prices in the Market Terminal are simulated. Future licensed data may be delayed. Simulations and scenarios are hypothetical and are not forecasts.' },
      { heading: 'Risk', body: 'Trading and investing involve risk of loss, including loss of the entire capital. Past performance and model outputs do not guarantee future results.' },
    ],
  },
  ai: {
    title: 'AI Transparency',
    sections: [
      { heading: 'Current state', body: 'The preview does not yet use generative AI to produce content shown to users.' },
      { heading: 'Planned assistants', body: 'EVE and KNOX will be AI assistants. Their outputs will be labelled as AI-generated, cite sources for factual claims and may contain errors. Voice output will use computer-generated speech.' },
      { heading: 'EU AI Act', body: 'Transparency obligations for AI-generated content and chatbots will be assessed and implemented before launch.' },
    ],
  },
  subscriptions: {
    title: 'Subscription Terms & Refund Policy',
    sections: [
      { heading: 'Status', body: 'Paid subscriptions are not yet offered and no payment details are collected. Proposed prices on the Plans page, including the discounts for longer periods, are provisional and are not offers.' },
      { heading: 'Periods', body: 'Plans are planned for periods of 1, 3, 6 or 12 months, paid upfront for the whole period. The Plans page shows the total for the period, the monthly equivalent and any saving compared with monthly payment.' },
      { heading: 'Trials and complimentary periods', body: 'Aurora may grant a free trial or a complimentary period. These end automatically on the date shown on the Account page; nothing is charged and nothing renews.' },
      { heading: 'Renewal', body: 'While payments are switched off, nothing renews automatically. Your renewal preference is stored so it can be honoured once paid plans launch, and you will be told before any first charge.' },
      { heading: 'Cancellation', body: 'You can cancel on the Account page at any time. Access continues until the end of the current period, and you can resume before then. Afterwards the account returns to Free and your data stays.' },
      { heading: 'Withdrawal right', body: 'EU consumers will have a 14-day right of withdrawal; the treatment of digital content supplied immediately will be defined after legal review.' },
      { heading: 'Refunds', body: 'Refund rules for unused parts of a paid period will be finalised before launch.' },
      { heading: 'Organisations', body: 'Business and institutional plans are agreed individually in writing (seats, period, AI allowance). Seats are named: each seat belongs to one person and may not be shared.' },
    ],
  },
  fairuse: {
    title: 'Fair Use Policy',
    sections: [
      { heading: 'Purpose', body: 'Aurora Veritatis runs on shared infrastructure and licensed or rate-limited data sources. This policy keeps the service fast and affordable for everyone.' },
      { heading: 'Personal accounts', body: 'A personal account is for one person. You may sign in on your own devices; sharing a paid account with others is not allowed. Aurora may limit a paid personal account to one active device at a time, and will tell the signed-out device why.' },
      { heading: 'Automated access', body: 'Do not scrape pages or call the API at scale, run bots against the service, or try to bypass rate limits, plan limits or access controls. Exports offered in the app (CSV, JSON, images) are for your own research.' },
      { heading: 'AI features', body: 'When AI features launch, every plan will include a monthly allowance shown in your account. There is no unlimited AI use. Organisations have a monthly AI budget agreed in their contract; when it is reached, AI features pause until the next month unless the organisation agreed otherwise.' },
      { heading: 'Data and content', body: 'Data from third-party sources keeps its own licence, shown next to the data. Do not republish it in bulk or present Aurora content as your own data product.' },
      { heading: 'What happens on a breach', body: 'We first contact you. Persistent or serious misuse may lead to rate limiting, removal of a paid feature or, as a last resort, suspension of the account. Limits based only on IP addresses or device fingerprinting are not used.' },
    ],
  },
  imprint: {
    title: 'Legal Notice (Impressum)',
    sections: [
      { heading: 'Information pursuant to § 5 ECG / § 25 MedienG', body: `${OPERATOR}. Email: auroraveritatissup@gmail.com.` },
      { heading: 'About the operator', body: 'The platform is built by co-founders of the Aurora Veritatis student group, which is being established. Members of the group are its first users and help with testing and development. The legal form and registration details will be added here once the group is registered.' },
    ],
  },
};
