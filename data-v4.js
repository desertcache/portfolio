// v4 — tightened. One role front-and-center: Forward Deployed Engineer.
// Public-safe: scrubbed of internal dollar figures, headcount, vendor counts,
// internal Slack/DM quotes, and named third-party partners.
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

  // Headline reframed around the OUTCOME (94% retention) rather than the scale.
  headline: {
    number: "94%",
    unit: "retained",
    label: "of at-risk monthly merchant revenue",
    sub: "POS Provider Migration Program · vendor pod operating model · under-budget delivery",
  },

  // Three role tracks — same person, different lens.
  tracks: [
    {
      key: "fde",
      title: "Forward Deployed Engineer",
      one: "Embed with the team that has the problem. Ship the tool. Wire the measurement. Drive adoption.",
      cv: "Samuel_Bates_CV.pdf",
      primary: true,
    },
    {
      key: "se",
      title: "Solutions Engineer",
      one: "Business case to dashboard to vendor pod ops — the full path from operational risk to controlled program.",
      cv: "Samuel_Bates_CV.pdf",
    },
    {
      key: "swe",
      title: "Software Engineer",
      one: "React 18 · TypeScript · Fastify · Snowflake. 4 production apps · weekly release cadence · ~165K LOC authored.",
      cv: "Samuel_Bates_CV.pdf",
    },
  ],

  // The migration story — generalized away from named partner + exact dollars.
  migration: {
    title: "POS Provider Migration Program",
    when: "2025",
    role: "Program owner · co-author of business case · dashboard builder",
    problem: "A major POS partner deprecated their v1 API. Thousands of active stores were still on v1, with significant monthly merchant revenue at risk if they failed to migrate. Organic outreach was moving less than 1% of stores per week — nowhere near the timeline.",
    bet: "Co-authored the funding request. Sized the risk, presented four investment options. Recommended targeting top-revenue stores with white-glove vendor support — projected to save the vast majority of revenue at a fraction of full-coverage cost.",
    build: "Designed the operating model end-to-end: CRM-routed queues, 3-day cadence, 200–300 touches/day, training docs, escalation paths. Built the migration dashboard — full funnel, migration progress, revenue at every stage, in one view.",
    result: [
      { v: "94%", k: "retention of at-risk revenue" },
      { v: "10", k: "agent vendor pod stood up" },
      { v: "Under", k: "budget delivery" },
      { v: "20+ → few", k: "daily escalations, before → after" },
    ],
  },

  // 6 projects, not 12. Keepers only.
  projects: [
    {
      id: "wfm",
      year: "2026",
      title: "Workforce Operations Platform",
      one: "Real-time platform replacing legacy SaaS for 100+ support queues across multiple vendors.",
      what: "Production workforce platform consolidating multiple operational data sources into one operating surface. 18 dashboard pages, micro-frontend architecture, published shared component library. Sustained weekly release cadence in 2026.",
      stack: ["React 18", "TypeScript", "Zustand", "Snowflake", "Recharts", "Erlang C"],
      stats: [
        { k: "Pages built", v: "18" },
        { k: "Queues unified", v: "100+" },
        { k: "LOC authored", v: "~51K" },
        { k: "Deploys / month", v: "7" },
      ],
    },
    {
      id: "ime",
      year: "2025–26",
      title: "Intelligent Mapping Engine",
      one: "Replaced 1–7 day spreadsheet workflows with a real-time product. Hundreds of thousands of records flowing live.",
      what: "Dual-stack: React frontend, Fastify BFF, Snowflake. Solved the bugs the team would have lost weeks to — typed callback that silently terminated the warehouse connection; auth race opening multiple browser tabs; silent row cap on the AI query service. Now embedded in the broader workforce platform.",
      stack: ["React", "Fastify", "snowflake-sdk", "Prometheus", "GraphQL"],
      stats: [
        { k: "Records flowing", v: "Hundreds of thousands" },
        { k: "Programs covered", v: "Hundreds" },
        { k: "Pages", v: "6" },
        { k: "Phase 1 features live", v: "26 / 35" },
      ],
    },
    {
      id: "mosaic",
      year: "2025–26",
      title: "AI Support Workspace",
      one: "Replaced 5+ tabs with one AI-assisted troubleshooting surface for thousands of support agents.",
      what: "Single-page app embedded in the internal admin portal. 22 components. Dual lookup (store ID / case ID). Four issue-specific diagnostic checklists. AI assistant embedded via the enterprise search platform. Documented three subtle telemetry behaviors as a team reference — dual entity registration, missing user-ID propagation, silent SDK failures.",
      stack: ["React 18", "TypeScript", "GraphQL", "Internal telemetry SDK"],
      stats: [
        { k: "Components", v: "22" },
        { k: "Telemetry events", v: "19" },
        { k: "Build → pilot", v: "~4 weeks" },
        { k: "Addressable", v: "thousands of support agents" },
      ],
    },
    {
      id: "fleet",
      year: "2026",
      title: "Sentient Coworkers — 6-Agent AI Fleet",
      one: "Six personal-use AI agents for local development workflows — per-agent memory, local dispatch, weekly memory-health audits.",
      what: "Six personal-use agents for local engineering workflows: dispatch, code review, repo stewardship, daily standup prep, memory audit, and orchestration. Local-only background daemon coordinates spawn timing; classifier triages incoming work; commander spawns agents into terminal tabs. The memory-health auditor (1,985-line Python CLI) cross-references each agent's memory against a personal vault to catch drift.",
      stack: ["TypeScript", "Bun", "MCP", "Python", "LaunchAgent"],
      stats: [
        { k: "Local agents", v: "6" },
        { k: "Daemon tests", v: "47 passing" },
        { k: "Workflow skills", v: "21+" },
        { k: "Memory-audit CLI", v: "~2,000 LOC" },
      ],
    },
    {
      id: "framework",
      year: "2025–26",
      title: "AI as a Leadership Tool",
      one: "DEFINE → ORGANIZE → APPLY → REFINE. A framework now reaching 800+ leaders live.",
      what: "Co-designed and co-facilitated the original workshop for senior leaders at the org's leadership summit. Built the four-phase framework with concrete examples and a hands-on lab where leaders defined a real challenge and shipped a working AI solution in the room. Recovered live from a mid-demo platform outage by pivoting to audience Q&A — the workshop kept going. Reused at scale across multiple internal training tracks.",
      stack: ["Workshop design", "Framework authoring", "Live facilitation"],
      stats: [
        { k: "Leaders trained", v: "800+" },
        { k: "Excellence Awards", v: "2×" },
        { k: "Cross-org follow-ons", v: "5–7" },
        { k: "Largest live audience", v: "200–500" },
      ],
    },
    {
      id: "chip",
      year: "2025–26",
      title: "Specialist Support Chatbot",
      one: "From 1,500-word walls of text to 300-word actionable answers. Top adoption among internal AI agents.",
      what: "Redesigned the response format based on direct agent feedback (\"wall of text → abandon\"). New enforced six-section structure: What This Means → Diagnostic Checklist → Action Matrix → Outreach Script → Still Stuck? → CRM Reminder. Average response shrank from ~1,500 to ~300 words while jumping from prose to scannable, actionable guidance.",
      stack: ["Enterprise AI agent platform", "Prompt design", "Adoption metrics"],
      stats: [
        { k: "Total queries", v: "Thousands" },
        { k: "Response sections", v: "6 enforced" },
        { k: "Length reduction", v: "5×" },
        { k: "Rank", v: "Top adoption among internal agents" },
      ],
    },
  ],

  // The arc — what makes Sam different from a 10-years-of-React engineer.
  arc: [
    { year: "2018", phase: "Operator", title: "Lead Patient Care Coordinator", org: "AZ Pain Doctors", note: "30+ inbound calls/day. Promoted to escalations. Hired and trained 16 coordinators. Redesigned SOPs to clear bottlenecks." },
    { year: "2020", phase: "Operator", title: "EMT · Behavioral Health Team Lead", org: "Phoenix Fire Department", note: "Led a 12-person crisis response team. Coordinated fire, medical, law-enforcement units on-scene. Mentored new members." },
    { year: "2022", phase: "Specialist", title: "Merchant Services Senior Specialist", org: "DoorDash · Tempe", note: "Onboarded 9,000+ stores. SOPs that extended POS provider coverage 1→23. Specialist-to-provider ratio 1:1 → 1:7." },
    { year: "2023", phase: "Specialist", title: "Disaster Prevention Specialist", org: "DoorDash · Escalations", note: "One of four handling executive-level escalations. 50+ daily cases. Built SQL tooling, Salesforce reports, prevention playbooks." },
    { year: "2025", phase: "Builder", title: "Technical Integrations Associate", org: "DoorDash · Merchant Ops", note: "First production code shipped. Four production apps. Funded business case authored. Hundreds of leaders trained. Two Excellence Awards." },
    { year: "2026", phase: "Architect", title: "AI Ecosystem Architect", org: "DoorDash · Merchant Ops AI Studio", note: "Six-agent autonomous fleet for local dev workflows. Authored the AI Builder Playbook for the org. Tech lead on the flagship internal support chatbot." },
  ],

  // Paraphrased pattern, not direct quotes from internal channels.
  validation: [
    { quote: "Directors and senior engineers across the org seek Sam out for AI tooling guidance.", role: "Recurring pattern", on: "2025–2026" },
    { quote: "Inbound from peers in adjacent orgs follows almost every workshop or live demo.", role: "Pattern", on: "Across multiple training tracks" },
  ],

  awards: [
    { year: "2025", title: "Merchant Services Excellence Award", from: "Senior leadership", reason: "AI as a Leadership Tool workshop" },
    { year: "2025", title: "Merchant Services Excellence Award", from: "Senior leadership", reason: "POS migration training program" },
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
    funFact: "Yes, that's the same hat I wore to win an internal training award. Worked then. Still works.",
  },
};
