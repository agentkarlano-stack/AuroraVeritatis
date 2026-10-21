export interface LegalDoc {
  title: string;
  sections: { heading: string; body: string }[];
}

const OPERATOR = '[Operator legal name, address and registration details — to be completed]';

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
      { heading: 'Data we process', body: 'Guest use stores preferences only in your browser (localStorage). If you create an account, we process your email address and the preferences you choose to sync, stored with Supabase. Server logs are processed by Cloudflare.' },
      { heading: 'Legal bases', body: 'Contract performance (Art. 6(1)(b) GDPR) for accounts; legitimate interests (Art. 6(1)(f)) for security logging; consent (Art. 6(1)(a)) for optional analytics.' },
      { heading: 'Processors', body: 'Cloudflare (hosting), Supabase (database and authentication), Resend (transactional email), PostHog EU (analytics, only with consent). Further processors will be listed before launch.' },
      { heading: 'Your rights', body: 'Access, rectification, erasure, restriction, portability and objection, and the right to complain to a supervisory authority (in Austria: Datenschutzbehörde). Local data can be exported or deleted from the Account page.' },
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
      { heading: 'Data limitations', body: 'Prices shown in the preview are synthetic demo data. Future licensed data may be delayed. Simulations and scenarios are hypothetical and are not forecasts.' },
      { heading: 'Risk', body: 'Trading and investing involve risk of loss, including loss of the entire capital. Past performance and model outputs do not guarantee future results.' },
    ],
  },
  ai: {
    title: 'AI Transparency',
    sections: [
      { heading: 'Current state', body: 'The preview does not yet use generative AI to produce content shown to users.' },
      { heading: 'Planned assistants', body: 'EVE and KNOX will be AI assistants. Their outputs will be labelled as AI-generated, cite sources for factual claims and may contain errors. Voice output will use synthetic speech.' },
      { heading: 'EU AI Act', body: 'Transparency obligations for AI-generated content and chatbots will be assessed and implemented before launch.' },
    ],
  },
  subscriptions: {
    title: 'Subscription Terms & Refund Policy',
    sections: [
      { heading: 'Status', body: 'Paid subscriptions are not yet offered. Proposed prices on the Plans page are not offers.' },
      { heading: 'Withdrawal right', body: 'EU consumers will have a 14-day right of withdrawal; the treatment of digital content supplied immediately will be defined after legal review.' },
      { heading: 'Cancellation & refunds', body: 'Monthly plans will be cancellable at any time with effect from the end of the billing period. Refund rules will be finalised before launch.' },
    ],
  },
  imprint: {
    title: 'Legal Notice (Impressum)',
    sections: [
      { heading: 'Information pursuant to § 5 ECG / § 25 MedienG', body: `${OPERATOR}. Email: auroraveritatissup@gmail.com.` },
      { heading: 'Separation', body: 'The Aurora Veritatis platform and the Aurora Veritatis student organisation are distinct; ownership and legal status will be stated here once the operating entity is confirmed.' },
    ],
  },
};
