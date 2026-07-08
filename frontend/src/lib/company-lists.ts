export interface CompanyList {
  id: string;
  label: string;
  description: string;
  companies: string[];
}

export const BIG_TECH: string[] = [
  "Apple", "Google", "Alphabet", "Microsoft", "Amazon", "Meta", "Netflix",
  "Tesla", "Nvidia", "Salesforce", "Adobe", "Oracle", "Intel", "IBM",
  "Qualcomm", "AMD", "Broadcom", "Uber", "Lyft", "Airbnb", "Stripe",
  "Palantir", "Snowflake", "Databricks", "Atlassian",
];

export const TOP_TECH_EMPLOYERS: string[] = [
  ...BIG_TECH,
  "Cisco", "HP", "Dell", "VMware", "ServiceNow", "Workday", "Intuit",
  "Autodesk", "Zoom", "PayPal", "Block", "Square", "eBay", "Shopify",
  "Twilio", "Datadog", "MongoDB", "Elastic", "Confluent", "Okta",
  "CrowdStrike", "Palo Alto Networks", "Fortinet", "Splunk", "Cloudflare",
  "Fastly", "Akamai", "DigitalOcean", "GitLab", "Notion", "Figma", "Canva",
  "Asana", "HubSpot", "Zendesk", "Intercom", "Segment", "Amplitude",
  "Braze", "Twilio SendGrid", "DoorDash", "Instacart", "Robinhood",
  "Coinbase", "Reddit", "Pinterest", "Snap", "Spotify", "Dropbox", "Box",
  "Roblox", "Unity", "Epic Games", "Riot Games", "Electronic Arts",
  "Activision Blizzard", "LinkedIn", "GitHub", "Slack", "Vercel",
  "HashiCorp", "New Relic", "Dynatrace", "PagerDuty", "Grafana Labs",
  "Weights & Biases", "Hugging Face", "Anthropic", "OpenAI", "Cohere",
  "Scale AI", "Runway", "Stability AI", "Mistral", "Perplexity",
  "Replit", "Cursor", "Linear", "Loom", "Calendly", "Airtable", "Zapier",
  "Capital One", "JPMorgan Chase", "Goldman Sachs", "Morgan Stanley",
  "American Express", "Visa", "Mastercard", "Fidelity", "Bloomberg",
];

export const SP500: string[] = [
  // Technology
  "Apple", "Microsoft", "Nvidia", "Alphabet", "Meta", "Amazon", "Tesla",
  "Broadcom", "Oracle", "Salesforce", "AMD", "Adobe", "Qualcomm", "Intel",
  "IBM", "Accenture", "Texas Instruments", "Applied Materials", "Lam Research",
  "KLA Corporation", "Microchip Technology", "Analog Devices", "Marvell Technology",
  "Western Digital", "Seagate", "HP Inc", "Hewlett Packard Enterprise",
  "Akamai Technologies", "Cognizant", "Gartner", "Fiserv", "Paychex",
  "Jack Henry & Associates", "Automatic Data Processing", "Global Payments",
  "Fidelity National Information Services", "Verisk Analytics", "Ceridian",
  "Trimble", "PTC", "Bentley Systems", "Verint Systems", "Conduent",
  "Unisys", "Leidos", "SAIC", "Booz Allen Hamilton", "ManTech",
  "Science Applications International", "DXC Technology", "Xerox",
  "NCR Voyix", "Zebra Technologies", "Cognex", "FLIR Systems",
  "Coherent", "Viavi Solutions", "Ciena", "Calix", "Ciena",
  // Software / SaaS
  "Salesforce", "ServiceNow", "Workday", "Intuit", "Autodesk", "Veeva Systems",
  "Fortinet", "Palo Alto Networks", "CrowdStrike", "Zscaler", "Okta",
  "Splunk", "Dynatrace", "PTC", "Cadence Design Systems", "Synopsys",
  "F5", "Juniper Networks", "Amdocs", "EPAM Systems", "Globant",
  "Thoughtworks", "Kyndryl", "CGI Group", "Infosys", "Wipro", "HCL Technologies",
  "Cognizant", "Tata Consultancy Services",
  // Communications
  "AT&T", "Verizon", "T-Mobile", "Charter Communications", "Comcast",
  "Lumen Technologies", "Motorola Solutions", "Arista Networks", "Cisco",
  "F5 Networks", "Juniper Networks", "Viavi Solutions",
  // Financials (large tech teams)
  "JPMorgan Chase", "Bank of America", "Wells Fargo", "Goldman Sachs",
  "Morgan Stanley", "Citigroup", "American Express", "Visa", "Mastercard",
  "Capital One", "Charles Schwab", "Fidelity", "BlackRock", "State Street",
  "Intercontinental Exchange", "Nasdaq", "CME Group", "Moody's", "S&P Global",
  "Coinbase", "Robinhood", "PayPal", "Block", "Affirm", "Marqeta",
  // Healthcare / Biotech (with SWE demand)
  "UnitedHealth Group", "CVS Health", "McKesson", "Cigna", "Anthem",
  "Humana", "Aetna", "Epic Systems", "Cerner", "Optum", "Teladoc",
  "Veeva Systems", "Medidata Solutions", "Tempus", "Flatiron Health",
  // E-commerce / Retail
  "Amazon", "Walmart", "Target", "Costco", "Home Depot", "Lowe's",
  "Best Buy", "Wayfair", "Chewy", "Etsy", "eBay", "Shopify",
  // Media / Entertainment
  "Netflix", "Disney", "Warner Bros Discovery", "Paramount", "Comcast NBCUniversal",
  "Spotify", "Live Nation", "IAC", "Match Group",
  // Automotive / EV
  "Tesla", "Ford", "General Motors", "Rivian", "Lucid Motors", "Waymo",
  // Aerospace / Defense
  "Boeing", "Lockheed Martin", "Raytheon", "Northrop Grumman", "General Dynamics",
  "L3Harris Technologies", "BAE Systems", "Leidos", "SAIC",
  // Energy (digital transformation roles)
  "ExxonMobil", "Chevron", "Shell", "BP", "ConocoPhillips",
  "Schlumberger", "Halliburton", "Baker Hughes",
  // Consumer / CPG
  "Procter & Gamble", "Johnson & Johnson", "Unilever", "Nestle", "PepsiCo",
  "Coca-Cola", "Colgate-Palmolive", "Kimberly-Clark",
  // Transportation / Logistics
  "FedEx", "UPS", "United Airlines", "Delta Air Lines", "Southwest Airlines",
  "American Airlines", "Uber", "Lyft", "DoorDash", "Instacart",
  // Real Estate / Construction
  "Zillow", "Opendoor", "Redfin", "CoStar Group", "CBRE",
  // Industrials
  "General Electric", "Honeywell", "3M", "Caterpillar", "Deere & Company",
  "Emerson Electric", "Parker Hannifin", "Rockwell Automation",
  "Cognex", "Zebra Technologies",
];

export const COMPANY_LISTS: CompanyList[] = [
  {
    id: "big_tech",
    label: "Big Tech",
    description: "FAANG+ and top-tier tech giants",
    companies: BIG_TECH,
  },
  {
    id: "top_tech",
    label: "Top Tech Employers",
    description: "~100 leading tech and tech-forward companies",
    companies: TOP_TECH_EMPLOYERS,
  },
  {
    id: "sp500",
    label: "S&P 500",
    description: "S&P 500 companies with significant engineering teams",
    companies: SP500,
  },
];

/** Normalize a company name for comparison (lowercase, strip punctuation). */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** True if jobCompany matches any entry in the targets list. */
export function isTargeted(jobCompany: string | null | undefined, targets: string[]): boolean {
  if (!jobCompany || targets.length === 0) return false;
  const norm = normalizeName(jobCompany);
  return targets.some((t) => norm.includes(normalizeName(t)) || normalizeName(t).includes(norm));
}
