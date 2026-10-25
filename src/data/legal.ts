export interface LegalDoc {
  title: string;
  sections: { heading: string; body: string }[];
}

/**
 * Owner decisions: operated by a natural person (2026-10-24, option B); residence Hungary and contact address
 * confirmed 2026-10-25. No company, registration number or VAT number exists, so none is stated.
 */
export const OPERATOR_NAME = 'Tanner Karl';
export const OPERATOR_ADDRESS = 'Bartók Béla út 8., Dunaújváros, Hungary';
export const OPERATOR_EMAIL = 'auroraveritatissup@gmail.com';
const OPERATOR = `${OPERATOR_NAME}, a private individual resident in Hungary (Aurora Veritatis is not a registered company or association)`;

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
      { heading: 'Liability', body: 'The service is provided free of charge during early access. The operator is liable without limitation for intent and gross negligence and for harm to life, body or health, as mandatory law requires; otherwise, to the extent permitted by law, the operator is not liable for losses arising from reliance on content that is labelled as estimated, simulated or AI-generated.' },
      { heading: 'Governing law', body: 'Hungarian law applies, without depriving consumers of the protection of the mandatory rules of the country where they live. Consumers may also bring proceedings in the courts of their country of residence.' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      { heading: 'Controller', body: `${OPERATOR}. Address: ${OPERATOR_ADDRESS}. Email: ${OPERATOR_EMAIL}. No data protection officer is appointed; the controller handles requests directly.` },
      { heading: 'Data we process', body: 'As a guest, your preferences are stored only in your browser (localStorage), and your Personal Intelligence Brain graphs only in your browser (IndexedDB). We do not receive them. If you create an account, we process your email address and the preferences you choose to sync, stored with Supabase. Server logs are processed by Cloudflare.' },
      { heading: 'Legal bases', body: 'Contract performance (Art. 6(1)(b) GDPR) for accounts; legitimate interests (Art. 6(1)(f)) for security logging; consent (Art. 6(1)(a)) for optional analytics.' },
      { heading: 'AI assistants and voice', body: 'When you ask EVE or KNOX a question, your question, the sources Aurora attaches and any notes you choose to share are sent to the AI provider to generate the answer (OpenAI, or Cloudflare Workers AI as a fallback). When you choose the natural voice, the answer text is sent to ElevenLabs to produce audio. Aurora records the number of requests, tokens and estimated cost per account to enforce limits; it does not keep the question text in its database. OpenAI and ElevenLabs may process data in the United States under the EU Standard Contractual Clauses or the EU-US Data Privacy Framework.' },
      { heading: 'Processors', body: 'Cloudflare (hosting, Workers AI), Supabase (database and authentication), Resend (transactional email), Brevo (newsletter, only after you confirm your subscription), OpenAI (AI answers), ElevenLabs (natural voice, only when you choose it), PostHog EU (analytics, only with consent).' },
      { heading: 'Retention', body: 'Account data is kept until you delete your account. AI usage records (counts, tokens, cost, no question text) are kept to enforce limits and control costs; when you delete your account they are no longer linked to you. Server logs are kept by Cloudflare for the periods it publishes.' },
      { heading: 'Your rights', body: 'Access, rectification, erasure, restriction, portability and objection. Local data can be exported or deleted from the Account page; signed-in users can delete their account and all synced data there too. You can complain to the Hungarian data protection authority, Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH, naih.hu), or to the supervisory authority of the EU member state where you live or work, and you can go to court.' },
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
      { heading: 'Where AI is used', body: 'EVE and KNOX are AI assistants on the Assistant page, available to signed-in users within a daily allowance. Every answer is labelled as AI-generated, lists the sources it was given and keeps only citations to those sources. Answers may contain errors; check the sources before relying on them.' },
      { heading: 'Models', body: 'Answers come from OpenAI models, with Cloudflare Workers AI (open-weight models) as a fallback; the answer shows which provider and model produced it. Calculations, simulations and charts are computed by Aurora code, not by AI.' },
      { heading: 'Voice', body: 'Read-aloud uses either your browser’s speech synthesis or, if you choose it, an ElevenLabs computer-generated voice. These voices are generated and are not recordings of a real person.' },
      { heading: 'EU AI Act', body: 'You are told when you interact with an AI system and AI-generated text and audio are labelled, in line with the transparency obligations of the EU AI Act.' },
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
  sources: {
    title: 'Data Sources & Licences',
    sections: [
      { heading: 'How sources are shown', body: 'Pages name their source briefly next to the data. Licence terms and full attributions are collected here so the tools stay readable. Every value keeps its own reference date or publication time.' },
      { heading: 'Country statistics', body: 'World Bank World Development Indicators and Pink Sheet commodity prices, licensed under Creative Commons Attribution 4.0 (CC BY 4.0). Source: The World Bank, data.worldbank.org.' },
      { heading: 'Hazards and events', body: 'Earthquakes: United States Geological Survey (USGS), public domain. Disaster alerts: Global Disaster Alert and Coordination System (GDACS), used under the GDACS terms of use with the source cited.' },
      { heading: 'News', body: 'Headlines and links from the GDELT Project (free, open data used with attribution) and UN News. Aurora shows headlines and links only and never reproduces article text; articles belong to their publishers.' },
      { heading: 'Maps and imagery', body: 'Country boundaries: Natural Earth (public domain). Satellite imagery: NASA Global Imagery Browse Services (GIBS) and NASA Blue Marble; NASA imagery is generally not subject to copyright in the United States. Map rendering: MapLibre GL JS (BSD 3-Clause).' },
      { heading: 'Markets and economics', body: 'Euro foreign-exchange reference rates and euro area series: European Central Bank, reproduced with the source acknowledged. Futures positioning: US Commodity Futures Trading Commission (CFTC) Commitments of Traders, public domain. Instruments ending in .D are simulated and not market data. Charts: TradingView Lightweight Charts (Apache License 2.0).' },
      { heading: 'Photos and video', body: 'Country landmark photos come from Wikimedia Commons; each photo shows its author and licence where it is used. Introduction footage: Mixkit clips under the Mixkit Free License, plus Wikimedia Commons clips whose credits are listed in the project documentation.' },
      { heading: 'AI and voice', body: 'EVE and KNOX answers are generated by OpenAI models, with Cloudflare Workers AI as a fallback; the optional natural voice is generated by ElevenLabs. Generated text and audio are labelled as AI output.' },
      { heading: 'Not shown publicly', body: 'Some connected services are used only for internal testing and are not displayed on the site until a commercial display licence is in place, including market price feeds, company fundamentals, extra news feeds and live aircraft or vessel positions.' },
    ],
  },
  imprint: {
    title: 'Legal Notice',
    sections: [
      { heading: 'Operator and person responsible for content', body: `${OPERATOR_NAME}, private individual. Aurora Veritatis is the name of this website and project; it is not a registered company or association and has no company registration or VAT number.` },
      { heading: 'Address', body: OPERATOR_ADDRESS },
      { heading: 'Contact', body: `Email: ${OPERATOR_EMAIL}. Questions are answered in English or Hungarian.` },
      { heading: 'Hosting', body: 'Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA (website and API); Supabase, Inc. (database and sign-in).' },
      { heading: 'Applicable rules', body: 'Information provided under Section 4 of Hungarian Act CVIII of 2001 on electronic commerce services, which implements the EU E-Commerce Directive.' },
    ],
  },
};
