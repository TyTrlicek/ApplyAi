// Map a field's label text to a semantic key, and resolve that key to a value
// from the flattened autofill profile. Port of backend/playwright_worker/
// field_mapper.py — kept deliberately close to it so behaviour matches.

AA.classify = (() => {
  // First match wins. Order matters. Yes/no policy questions and EEO come first
  // because their phrasings ("...work in the country...", "...race or ethnicity
  // of your team...") can otherwise trip a geography/identity rule.
  const RULES = [
    // Yes/no policy questions — constant answers for this user.
    ["needsSponsorship", /\b(require|need|will\s*you\s*(now|ever)\s*need).{0,30}(visa\s*)?sponsor|sponsorship|require\s.{0,20}\bvisa\b|immigration\s*sponsor/],
    ["workAuthorized", /\b(authori[sz]ed|legally\s*(authori[sz]ed|able|entitled)|right\s*to\s*work|work\s*authori[sz]ation|eligible\s*to\s*work|permitted\s*to\s*work|are\s*you\s*legally)\b/],
    ["usCitizen", /\b(u\.?s\.?\s*citizen|united\s*states\s*citizen|us\s*citizenship|are\s*you\s*a\s*citizen)\b/],

    // EEO / self-identification — always decline.
    ["declineEEO", /\b(gender\s*identity|gender|race|ethnicity|hispanic|latino|veteran\s*status|are\s*you\s*(a\s*)?(protected\s*)?veteran|disability\s*status|disabled)\b/],

    ["preferredName", /\bpreferred\s*(first\s*)?name\b|what.{0,20}(like to be called|go by)/],
    ["firstName", /\bfirst\s*name\b|\bgiven\s*name\b|\bforename\b/],
    ["lastName", /\blast\s*name\b|\bsurname\b|\bfamily\s*name\b/],
    ["fullName", /\b(full[\s_-]?name|legal\s*name|your\s*name)\b|^name$/],

    ["email", /\be-?mail\b/],
    ["phone", /\b(phone|mobile|telephone|tel|cell)\b/],

    ["linkedin", /\blinked\s?in\b/],
    ["github", /\bgit\s?hub\b/],
    ["website", /\b(website|portfolio|personal\s*(url|site|website)|other\s*(url|website))\b/],

    ["zip", /\b(zip|postal)\s*code\b|\bzip\b|\bpostcode\b/],
    ["street", /\b(street\s*address|address\s*line\s*1|mailing\s*address)\b/],
    ["city", /\bcity\b|\btown\b|location\s*\(city\)/],
    ["state", /\b(state|province|region)\b/],
    ["country", /^country$|\bcountry\s*(of\s*(residence|citizenship))?\b|which\s*country|what\s*country/],
    ["location", /\b(current\s*location|where\s*(are|do)\s*you\s*(live|located|based)|location)\b/],

    ["currentEmployer", /\b(current|present|most\s*recent)\s*(company|employer)\b/],
    ["currentTitle", /\bcurrent\s*(job\s*)?title\b/],
    ["yearsExperience", /\b(years?\s*(of\s*)?(relevant\s*|work\s*|professional\s*)?experience|how\s*many\s*years)\b/],

    ["school", /\b(school|university|college|institution)\b/],
    ["degree", /\bdegree\b/],
    ["fieldOfStudy", /\b(field\s*of\s*study|major|discipline|concentration)\b/],
    ["graduation", /\b(graduation|grad\s*date|completion\s*date).*(date|year)?\b|\bexpected\s*graduation\b/],
    ["gpa", /\bg\.?p\.?a\.?\b|\bgrade\s*point\b/],
  ];

  const BOOLEAN_KEYS = new Set(["workAuthorized", "usCitizen", "needsSponsorship", "requiresSponsorship"]);
  const DECLINE_KEYS = new Set(["declineEEO"]);

  // label (raw text) -> { key, kind }  where kind: text | boolean | decline | unknown
  function classify(label) {
    const q = AA.normalize(label);
    if (!q) return { key: null, kind: "unknown" };
    for (const [key, re] of RULES) {
      if (re.test(q)) {
        if (BOOLEAN_KEYS.has(key)) return { key, kind: "boolean" };
        if (DECLINE_KEYS.has(key)) return { key, kind: "decline" };
        return { key, kind: "text" };
      }
    }
    return { key: null, kind: "unknown" };
  }

  // Resolve a semantic key to a string value from the flat profile.
  function valueFor(key, profile) {
    if (!profile) return null;
    switch (key) {
      case "workAuthorized":
      case "usCitizen":
        return "Yes";
      case "needsSponsorship":
      case "requiresSponsorship":
        return "No";
      case "phone":
        return (profile.phone || "").trim();
      case "preferredName":
        return profile.firstName;
      case "fullName":
        return profile.fullName;
      case "country":
        return profile.country || "United States";
      default:
        return key in profile ? String(profile[key] ?? "") : null;
    }
  }

  // Booleans map to an affirmative/negative intent for option matching.
  function booleanIntent(key) {
    if (key === "needsSponsorship" || key === "requiresSponsorship") return false;
    return true; // workAuthorized, usCitizen
  }

  const YES = /^(yes|y|true|i am|i have|authorized|✓)/i;
  const NO = /^(no|n|false|i am not|i do not|i don't|not authorized)/i;
  const DECLINE = /(decline|prefer not|don't wish|do not wish|not to (answer|disclose|identify)|i don't want to answer)/i;

  // Given a list of option label strings, pick the best one for a field.
  function pickOption(cls, options, profile) {
    const opts = options.map((o) => ({ raw: o, n: AA.normalize(o) }));

    if (cls.kind === "decline") {
      const hit = opts.find((o) => DECLINE.test(o.n));
      return hit ? hit.raw : null;
    }

    if (cls.kind === "boolean") {
      const want = booleanIntent(cls.key);
      const yes = opts.find((o) => YES.test(o.n));
      const no = opts.find((o) => NO.test(o.n));
      return want ? yes?.raw ?? null : no?.raw ?? null;
    }

    const value = valueFor(cls.key, profile);
    if (!value) return null;
    const v = AA.normalize(value);
    const exact = opts.find((o) => o.n === v);
    if (exact) return exact.raw;
    const partial = opts.find((o) => o.n.includes(v) || v.includes(o.n));
    return partial ? partial.raw : null;
  }

  return { classify, valueFor, pickOption, YES, NO, DECLINE };
})();
