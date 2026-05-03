// v4 — tightened. One role front-and-center: Forward Deployed Engineer.
// Real names, real quotes, real numbers. No theater.
window.PORTFOLIO_DATA_V4 = {
  identity: {
    name: "Samuel Bates",
    location: "Tempe, AZ",
    role: "Forward Deployed Engineer",
    org: "Currently: DoorDash · Merchant Ops",
    available: "Available now",
    pitch: "I came up through ops — call center, EMT dispatch, escalations — and I now ship the React, TypeScript, and Snowflake code that fixes what I used to triage. Operator first. Engineer second. Both in production.",
    email: "batessambates@gmail.com",
    github: "desertcache",
    linkedin: "samuel-b-343205133",
  },

  // The headline number, said once, said clearly.
  headline: {
    number: "$20M",
    unit: "/ month",
    label: "merchant revenue protected",
    sub: "Square V1→V2 migration · 94% retention · $31K under budget",
  },

  // Three role tracks — same person, different lens.
  tracks: [
    {
      key: "fde",
      title: "Forward Deployed Engineer",
      one: "Embed with the team that has the problem. Ship the tool. Wire the measurement. Drive adoption.",
      cv: "resume-fde.pdf",
      primary: true,
    },
    {
      key: "se",
      title: "Solutions Engineer",
      one: "Business case to dashboard to vendor pod ops — the full path from $20M risk to controlled program.",
      cv: "resume-sa.pdf",
    },
    {
      key: "swe",
      title: "Software Engineer",
      one: "React 18 · TypeScript · Fastify · Snowflake. 4 production apps · 7 deploys/month · ~165K LOC authored.",
      cv: "resume-swe.pdf",
    },
  ],

  // The migration story — given top billing because it's the strongest evidence.
  migration: {
    title: "Square V1→V2 Migration Program",
    when: "Apr–Nov 2025",
    role: "Program owner · co-author of business case · dashboard builder",
    problem: "Square deprecated v1 in Nov 2025. ~3,400 active stores still on v1, representing ~$21M/month in merchant GMV. Organic outreach was migrating less than 1% of stores per week — nowhere near the timeline.",
    bet: "Co-authored the funding request. Sized the risk, presented four investment options. Recommended targeting the top 65% by GMV with white-glove vendor support — projected to save the vast majority of revenue at ~37% of full-coverage cost.",
    build: "Designed the operating model end-to-end: CRM-routed queues, 3-day cadence, 200–300 touches/day, training docs, escalation paths. Built the migration dashboard — full funnel, V1→V2 progress, GMV at every stage, in one view.",
    result: [
      { v: "$20.1M", k: "of $21.6M monthly GMV retained" },
      { v: "94%", k: "retention of at-risk revenue" },
      { v: "$70K", k: "spent of $90K secured" },
      { v: "20+ → few", k: "daily escalations, before → after" },
    ],
  },

  // 6 projects, not 12. Keepers only.
  projects: [
    {
      id: "wfm",
      year: "2026",
      title: "Workforce Operations Platform",
      one: "Real-time platform replacing legacy SaaS for 139 queues across 6 BPO vendors.",
      what: "Production workforce platform consolidating 20+ data sources into one operating surface. 18 dashboard pages, micro-frontend, published shared component library (v1.7.10), live across 14 cells. 7 production deploys in April 2026 alone (v2.197 → v2.307).",
      stack: ["React 18", "TypeScript", "Zustand", "Snowflake", "Recharts", "Erlang C"],
      stats: [
        { k: "Pages built", v: "18" },
        { k: "Queues unified", v: "139" },
        { k: "LOC authored", v: "~51K" },
        { k: "Deploys / month", v: "7" },
      ],
      validation: "“This is so cool — going to save me.” — Operations stakeholder, live demo, Feb 20, 2026",
    },
    {
      id: "ime",
      year: "2025–26",
      title: "Intelligent Mapping Engine",
      one: "Replaced 1–7 day spreadsheet workflows with a real-time product. 557K records flowing live.",
      what: "Dual-stack: React frontend, Fastify BFF, Snowflake. Solved the bugs the team would have lost weeks to — typed callback that silently terminated the warehouse connection; auth race opening multiple browser tabs; silent ~1K row cap on the AI query service. Absorbed into the workforce platform in March; live across all 14 cells.",
      stack: ["React", "Fastify", "snowflake-sdk", "Prometheus", "GraphQL"],
      stats: [
        { k: "Records flowing", v: "557,337" },
        { k: "Programs covered", v: "326" },
        { k: "Pages", v: "6" },
        { k: "Phase 1 features live", v: "26 / 35" },
      ],
      validation: "“Mission logic over case volume precision.” — Stakeholder, go-live approval, Apr 8, 2026",
    },
    {
      id: "mosaic",
      year: "2025–26",
      title: "AI Support Workspace",
      one: "Replaced 5+ tabs with one AI-assisted troubleshooting surface for ~4,000 support agents.",
      what: "Single-page app embedded in the internal admin portal. 22 components. Dual lookup (store ID / case ID). Four issue-specific diagnostic checklists. AI assistant embedded via the enterprise search platform. Discovered three telemetry footguns the self-serve docs missed — dual entity registration, missing user-ID propagation, silent SDK failures — and documented the fix as a team reference.",
      stack: ["React 18", "TypeScript", "GraphQL", "Internal telemetry SDK"],
      stats: [
        { k: "Components", v: "22" },
        { k: "Telemetry events", v: "19" },
        { k: "Build → pilot", v: "~4 weeks" },
        { k: "Addressable", v: "~120 FTE / 4,000 agents" },
      ],
    },
    {
      id: "fleet",
      year: "2026",
      title: "Sentient Coworkers — 6-Agent AI Fleet",
      one: "Six named domain agents with per-agent memory, autonomous dispatch, and weekly memory-health audits.",
      what: "Six agents — one each for the support workspace, workforce platform, dev portal, repo stewardship, dispatch, and memory health. Background daemon polls GitHub and Slack every 5 min; classifier triages; commander spawns agents into terminal tabs and routes work. The memory-health auditor (1,985-line Python CLI) cross-references each agent's memory against the broader vault to catch drift. First audit found 5 orphaned blockers and 7 uncaptured decisions.",
      stack: ["TypeScript", "Bun", "MCP", "Python", "LaunchAgent"],
      stats: [
        { k: "Production agents", v: "6" },
        { k: "Daemon tests", v: "47 passing" },
        { k: "Distributed skills", v: "21 of 53" },
        { k: "Eligible teammates", v: "41" },
      ],
    },
    {
      id: "framework",
      year: "2025–26",
      title: "AI as a Leadership Tool",
      one: "DEFINE → ORGANIZE → APPLY → REFINE. A framework now reaching 880+ leaders live.",
      what: "Co-designed and co-facilitated the original workshop for 180 senior leaders at the org's leadership summit. Built the four-phase framework with concrete examples and a hands-on lab where leaders defined a real challenge and shipped a working AI solution in the room. Recovered live from a mid-demo platform outage by pivoting to audience Q&A — the workshop kept going. Reused at scale: 200–500 leaders at the AI Fluency series, a Spanish-language Gemini session, and a custom agents workshop.",
      stack: ["Workshop design", "Framework authoring", "Live facilitation"],
      stats: [
        { k: "Leaders trained live", v: "880+" },
        { k: "Excellence Awards", v: "2×" },
        { k: "Cross-org follow-ons", v: "5–7" },
        { k: "Largest live audience", v: "200–500" },
      ],
      validation: "“Directors come to Sam now. The excitement around the tooling — and the level we are at to help people realize the power of it.” — Peer engineer, post-workshop DM, Apr 24, 2026",
    },
    {
      id: "chip",
      year: "2025–26",
      title: "Specialist Support Chatbot",
      one: "From 1,500-word walls of text to 300-word actionable answers. Strongest adoption of four internal AI agents.",
      what: "Redesigned the response format based on direct agent feedback (\"wall of text → abandon\"). New enforced six-section structure: What This Means → Diagnostic Checklist → Action Matrix → Outreach Script → Still Stuck? → CRM Reminder. Average response shrank from ~1,500 to ~300 words while jumping from prose to scannable, actionable guidance.",
      stack: ["Glean Agent", "Prompt design", "Adoption metrics"],
      stats: [
        { k: "Monthly active users", v: "76" },
        { k: "Total queries", v: "6,846" },
        { k: "Length reduction", v: "5×" },
        { k: "Rank", v: "#1 of 4 agents" },
      ],
    },
  ],

  // The arc — what makes Sam different from a 10-years-of-React engineer.
  arc: [
    { year: "2018", phase: "Operator", title: "Lead Patient Care Coordinator", org: "AZ Pain Doctors", note: "30+ inbound calls/day. Promoted to escalations. Hired and trained 16 coordinators. Redesigned SOPs to clear bottlenecks." },
    { year: "2020", phase: "Operator", title: "EMT · Behavioral Health Team Lead", org: "Phoenix Fire Department", note: "Led a 12-person crisis response team. Coordinated fire, medical, law-enforcement units on-scene. Mentored new members." },
    { year: "2022", phase: "Specialist", title: "Merchant Services Senior Specialist", org: "DoorDash · Tempe", note: "Onboarded 9,000+ stores. SOPs that extended POS provider coverage 1→23. Specialist-to-provider ratio 1:1 → 1:7." },
    { year: "2023", phase: "Specialist", title: "Disaster Prevention Specialist", org: "DoorDash · Escalations", note: "One of four handling executive-level escalations. 50+ daily cases. Built SQL tooling, Salesforce reports, prevention playbooks." },
    { year: "2025", phase: "Builder", title: "Technical Integrations Associate", org: "DoorDash · Merchant Ops", note: "First production code shipped. Four production apps. Funded business case ($91K). 880+ leaders trained. Two Excellence Awards." },
    { year: "2026", phase: "Architect", title: "AI Ecosystem Architect", org: "DoorDash · Merchant Ops AI Studio", note: "Six-agent autonomous fleet. 21 skills auto-distributed to 41 teammates. Public AI-tools intake channel. Tech lead on flagship support chatbot." },
  ],

  // Verbatim attributions from internal channels. Names withheld; roles + context preserved.
  validation: [
    { quote: "Directors come to Sam now. The excitement around the tooling — and the level we are at to help people realize the power of it.", role: "Peer engineer", on: "DM, Apr 24 2026" },
    { quote: "These are amazing!!!!", role: "Senior Manager, Integrations Ops", on: "Repo refresh delivery, Apr 24 2026" },
    { quote: "This is so cool — going to save me.", role: "Operations stakeholder", on: "Live demo, Feb 20 2026" },
    { quote: "Mission logic over case volume precision.", role: "Stakeholder", on: "Go-live approval, Apr 8 2026" },
    { quote: "Literally the ABCs. So big shout out to you.", role: "Session co-host", on: "200–500 attendees, Apr 22 2026" },
    { quote: "Amazing!!! TYSM!", role: "New teammate", on: "670-line onboarding guide" },
  ],

  awards: [
    { year: "2025", title: "Merchant Services Excellence Award", from: "Senior Director, Merchant Services", reason: "AI as a Leadership Tool workshop" },
    { year: "2025", title: "Merchant Services Excellence Award", from: "Merchant Services leadership", reason: "Square V1→V2 migration training program" },
  ],

  // One row, no padding.
  stack: {
    Frontend: ["React 18", "TypeScript", "Zustand", "Redux", "React Query", "styled-components", "Recharts", "Vite"],
    Backend: ["Node.js", "Fastify", "GraphQL", "REST", "snowflake-sdk", "Prometheus"],
    Data: ["Snowflake (CTEs · window fns)", "BI dashboards", "Bayesian analysis", "A/B design", "ETL"],
    AI: ["Claude API", "Anthropic Agent SDK", "MCP servers", "Enterprise search agents", "Ollama · MLX Whisper", "Kokoro TTS"],
    Platform: ["pnpm monorepo", "BuildKite", "GitHub Actions", "AWS Lambda", "Internal telemetry"],
    Operating: ["Business-case authoring", "Vendor pod ops", "Outage sizing", "Pilot design (Bayesian)", "Workshop facilitation"],
  },

  // Used in the photo caption.
  bio: {
    education: "B.S. Cell & Molecular Biology — University of Western New Mexico",
    extra: "NREMT-B EMT certification — Estrella Mountain Community College",
    interests: "Rock climbing · hiking · plants · building AI tools",
    funFact: "Yes, that's the same hat I wore to win the Square Learn-a-thon Excellence Award. Worked then. Still works.",
  },
};
