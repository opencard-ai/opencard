import { locales } from "@/lib/i18n";

export const dynamic = "force-static";

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function PrivacyPage({ params }: Props) {
  const { lang } = await params;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 prose prose-slate">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-slate-500">Last updated: April 12, 2026</p>
      
      <section className="mt-8 space-y-6 text-slate-700">
        <p>
          At OpenCard AI, accessible from opencardai.com, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by OpenCard AI and how we use it.
        </p>

        <h2 className="text-xl font-bold text-slate-900">1. Information We Collect</h2>
        <p>
          We do not require users to create accounts to use our AI recommendation engine. We may collect non-personal data such as browser type, referring pages, and time spent on the site to improve our service.
        </p>

        <h2 className="text-xl font-bold text-slate-900">2. Cookies and Web Beacons</h2>
        <p>
          Like any other website, OpenCard AI uses 'cookies'. These cookies are used to store information including visitors' preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience by customizing our web page content based on visitors' browser type and/or other information.
        </p>

        <h2 className="text-xl font-bold text-slate-900">3. Google DoubleClick DART Cookie</h2>
        <p>
          Google is one of a third-party vendor on our site. It also uses cookies, known as DART cookies, to serve ads to our site visitors based upon their visit to opencardai.com and other sites on the internet.
        </p>

        <h2 className="text-xl font-bold text-slate-900">4. Affiliate Disclosure</h2>
        <p>
          OpenCard AI participates in various affiliate marketing programs, which means we may get paid commissions on products purchased through our links to retailer sites. This does not affect our recommendations.
        </p>

        <h2 className="text-xl font-bold text-slate-900">5. AI and Data Processing</h2>
        <p>
          Our chat interface uses Large Language Models (LLMs) to process your queries. Any data you enter into the chat box is used solely to provide the recommendation and is not sold to third parties.
        </p>
      </section>
    </div>
  );
}
