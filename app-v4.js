const {
  useState,
  useEffect,
  useRef
} = React;
const D = window.PORTFOLIO_DATA_V4;
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.classList.add("in");
        io.disconnect();
      }
    }, {
      threshold: 0.12
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
function Reveal({
  children,
  as: As = "div",
  ...p
}) {
  const ref = useReveal();
  return React.createElement(As, {
    ref: ref,
    className: `reveal ${p.className || ""}`,
    ...p
  }, children);
}
function TopStrip() {
  return React.createElement("header", {
    className: "topstrip"
  }, React.createElement("div", {
    className: "topstrip-inner"
  }, React.createElement("a", {
    className: "brand-mark",
    href: "#top"
  }, "Samuel Bates", React.createElement("span", {
    className: "dot"
  }, ".")), React.createElement("div", {
    className: "topstrip-mid"
  }, React.createElement("span", {
    className: "avail"
  }, D.identity.available), React.createElement("span", null, D.identity.location), React.createElement("span", null, "FDE · Solutions · Applied AI")), React.createElement("div", {
    className: "topstrip-right"
  }, React.createElement("button", {
    id: "theme-toggle",
    className: "theme-toggle",
    type: "button",
    "aria-label": "Toggle dark mode"
  }, "◐"), React.createElement("a", {
    className: "topstrip-arcade",
    href: "starship.html",
    title: "New — walk a fully procedural starship"
  }, React.createElement("span", {
    className: "dot-blink"
  }), " Starship"), React.createElement("a", {
    className: "topstrip-arcade",
    href: "arcade.html",
    title: "A small detour — vanilla JS arcade games"
  }, "Arcade"), React.createElement("a", {
    className: "topstrip-cta",
    href: `mailto:${D.identity.email}`
  }, "Get in touch ↗"))));
}
function Hero() {
  const sam = D.lab.find(x => x.id === "samantha");
  return React.createElement("section", {
    className: "hero",
    id: "top"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement("div", {
    className: "hero-grid"
  }, React.createElement("div", null, React.createElement("div", {
    className: "hero-tag"
  }, "Portfolio · 2026"), React.createElement("div", {
    className: "hero-name-row"
  }, React.createElement("h1", null, "Samuel", React.createElement("br", null), React.createElement("span", {
    className: "it"
  }, "Bates"), React.createElement("span", {
    className: "acc"
  }, ".")), React.createElement("a", {
    className: "hero-orb",
    href: "#lab",
    "aria-label": "Samantha UI — a live audio-reactive orb, rendering right here. See the Lab section."
  }, React.createElement("iframe", {
    src: `${sam.embed}?embed=1`,
    title: "Samantha UI — live orb",
    loading: "lazy",
    tabIndex: -1,
    "aria-hidden": "true"
  }))), React.createElement("p", {
    className: "hero-pitch"
  }, "I came up through ops — call center, EMT dispatch, escalations — and now I ship the ", React.createElement("em", null, "React, TypeScript, and Snowflake"), " code that fixes what I used to triage. I own the customer outcome end to end: scope it, ship it, measure it."), React.createElement("div", {
    className: "hero-meta"
  }, React.createElement("span", null, React.createElement("b", null, "Currently:"), " DoorDash · Merchant Ops"), React.createElement("span", null, React.createElement("b", null, "Based:"), " Phoenix, AZ"), React.createElement("span", null, React.createElement("b", null, "Open to:"), " Remote · Hybrid · SF Bay")), React.createElement("a", {
    className: "hero-note",
    href: "starship.html"
  }, React.createElement("span", {
    className: "dot-blink"
  }), React.createElement("span", null, React.createElement("b", null, "New"), " — Starship Explorer: a walkable, fully procedural starship. Board it"), React.createElement("span", {
    className: "arrow"
  }, "→"))), React.createElement(Photo, null)), React.createElement(Tracks, null)));
}
function Photo() {
  return React.createElement("figure", {
    className: "photo"
  }, React.createElement("img", {
    src: "headshot.png",
    alt: "Samuel Bates"
  }), React.createElement("figcaption", {
    className: "cap"
  }, React.createElement("b", null, "Samuel Bates"), ", Phoenix, AZ · 2026.", React.createElement("br", null), "Yes — same hat I wore to the Learn-a-thon. Worked then. Still works."));
}
function Tracks() {
  return React.createElement("div", {
    className: "tracks"
  }, D.tracks.map(t => React.createElement("a", {
    key: t.key,
    className: `track ${t.primary ? "is-primary" : ""}`,
    href: t.cv,
    target: "_blank",
    rel: "noopener"
  }, React.createElement("span", {
    className: "label"
  }, t.primary ? "Primary lane" : "Also fits"), React.createElement("div", {
    className: "ttl"
  }, t.title), React.createElement("div", {
    className: "one"
  }, t.one), React.createElement("div", {
    className: "cv"
  }, "Open résumé ", React.createElement("span", {
    className: "arrow"
  }, "→")))));
}
function Receipt() {
  const m = D.migration;
  return React.createElement("section", {
    className: "section"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement(Reveal, {
    className: "section-head"
  }, React.createElement("div", {
    className: "section-num"
  }, "01 / Receipt"), React.createElement("div", null, React.createElement("h2", {
    className: "section-title"
  }, "Lead with the strongest ", React.createElement("em", null, "evidence.")), React.createElement("p", {
    className: "section-lede"
  }, "An FDE's job is to find friction, size the loss, secure the budget, ship the measurement, and drive adoption. Here is one program that did all five — start to finish, in eight months."))), React.createElement(Reveal, {
    className: "receipt"
  }, React.createElement("div", null, React.createElement("div", {
    className: "receipt-headnum"
  }, React.createElement("span", {
    className: "acc"
  }, "94"), React.createElement("span", null, "%"), React.createElement("span", {
    className: "unit"
  }, "of at-risk revenue, retained")), React.createElement("div", {
    className: "receipt-headlabel"
  }, m.title), React.createElement("div", {
    className: "receipt-headsub"
  }, m.when, " · ", m.role)), React.createElement("div", {
    className: "receipt-body"
  }, React.createElement("div", {
    className: "receipt-row"
  }, React.createElement("div", {
    className: "step"
  }, "Problem"), React.createElement("div", {
    className: "copy"
  }, m.problem)), React.createElement("div", {
    className: "receipt-row"
  }, React.createElement("div", {
    className: "step"
  }, "Bet"), React.createElement("div", {
    className: "copy"
  }, m.bet)), React.createElement("div", {
    className: "receipt-row"
  }, React.createElement("div", {
    className: "step"
  }, "Build"), React.createElement("div", {
    className: "copy"
  }, m.build)), React.createElement("div", {
    className: "receipt-stats"
  }, m.result.map((r, i) => React.createElement("div", {
    key: i,
    className: "receipt-stat"
  }, React.createElement("div", {
    className: "v"
  }, React.createElement("span", {
    className: "acc"
  }, r.v)), React.createElement("div", {
    className: "k"
  }, r.k))))))));
}
function Work({
  onOpen
}) {
  return React.createElement("section", {
    id: "work",
    className: "section tinted"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement(Reveal, {
    className: "section-head"
  }, React.createElement("div", {
    className: "section-num"
  }, "02 / Work"), React.createElement("div", null, React.createElement("h2", {
    className: "section-title"
  }, "Six projects, ", React.createElement("em", null, "one operating thread.")), React.createElement("p", {
    className: "section-lede"
  }, "Every project below started as operational friction I'd lived with personally. I built the tool, wired the measurement, and packaged it for the team. Click any row to read the full case study."))), React.createElement(Reveal, {
    className: "work-list"
  }, D.projects.map((p, i) => React.createElement("div", {
    key: p.id,
    className: "work-row",
    onClick: () => onOpen(p.id),
    role: "button",
    tabIndex: 0,
    onKeyDown: e => {
      if (e.key === "Enter") onOpen(p.id);
    }
  }, React.createElement("div", {
    className: "work-num"
  }, "0", i + 1), React.createElement("div", null, React.createElement("div", {
    className: "work-title"
  }, p.title), React.createElement("div", {
    className: "work-one"
  }, p.one)), React.createElement("div", {
    className: "work-tag-cell"
  }, p.year, " · ", p.stack.slice(0, 3).join(" · ")), React.createElement("div", {
    className: "work-arrow"
  }, "→"))))));
}
function CaseStudy({
  id,
  onClose
}) {
  const p = id ? D.projects.find(x => x.id === id) : null;
  useEffect(() => {
    if (!id) return;
    const k = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [id, onClose]);
  if (!id || !p) return null;
  return React.createElement("div", {
    className: "overlay open",
    onClick: onClose
  }, React.createElement("div", {
    className: "overlay-panel",
    onClick: e => e.stopPropagation()
  }, React.createElement("button", {
    className: "overlay-close",
    onClick: onClose
  }, "Close · Esc"), React.createElement("div", {
    className: "cs-eyebrow"
  }, p.year, " · case study"), React.createElement("h2", {
    className: "cs-title"
  }, p.title), React.createElement("p", {
    className: "cs-one"
  }, p.one), React.createElement("div", {
    className: "cs-stack"
  }, p.stack.map(s => React.createElement("span", {
    key: s
  }, s))), React.createElement("div", {
    className: "cs-stats"
  }, p.stats.map((s, i) => React.createElement("div", {
    key: i,
    className: "cs-stat"
  }, React.createElement("div", {
    className: "v"
  }, s.v), React.createElement("div", {
    className: "k"
  }, s.k)))), React.createElement("div", {
    className: "cs-body"
  }, React.createElement("p", null, p.what)), p.validation && React.createElement("div", {
    className: "cs-quote"
  }, "“", p.validation.replace(/^"|"$/g, "").replace(/^“|”$/g, ""), "”")));
}
function LazyMount({
  children,
  className
}) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShow(true);
        io.disconnect();
      }
    }, {
      rootMargin: "400px"
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return React.createElement("div", {
    ref: ref,
    className: className
  }, show ? children : null);
}
function Lab() {
  const ship = D.lab.find(x => x.id === "starship");
  const sam = D.lab.find(x => x.id === "samantha");
  const arcade = D.lab.find(x => x.id === "arcade");
  return React.createElement("section", {
    id: "lab",
    className: "section"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement(Reveal, {
    className: "section-head"
  }, React.createElement("div", {
    className: "section-num"
  }, "03 / Lab"), React.createElement("div", null, React.createElement("h2", {
    className: "section-title"
  }, "Demos you can ", React.createElement("em", null, "walk around in.")), React.createElement("p", {
    className: "section-lede"
  }, "Not screenshots — running software. A procedural starship you can board, a GPU orb rendering live on this page, and an arcade rebuilt dot-for-dot. All in the browser, all built after hours directing an AI agent fleet."))), React.createElement(Reveal, {
    className: "lab-feature"
  }, React.createElement("a", {
    className: "lab-frame lab-poster",
    href: ship.href
  }, React.createElement("span", {
    className: "lab-frame-bar"
  }, React.createElement("span", null, "STREL-7 · REMOTE DOCK"), React.createElement("span", null, "DESKTOP · WEBGL")), React.createElement("img", {
    src: ship.poster,
    alt: ship.posterAlt,
    loading: "lazy",
    width: "1280",
    height: "720"
  }), React.createElement("span", {
    className: "lab-play"
  }, "▶ ", ship.cta)), React.createElement("div", {
    className: "lab-copy"
  }, React.createElement("div", {
    className: "label"
  }, ship.eyebrow), React.createElement("h3", {
    className: "lab-title"
  }, ship.title), React.createElement("p", {
    className: "lab-one"
  }, ship.one), React.createElement("div", {
    className: "lab-meta"
  }, ship.meta.join(" · ")), React.createElement("div", {
    className: "lab-links"
  }, React.createElement("a", {
    className: "lab-link",
    href: ship.href
  }, ship.cta, " ", React.createElement("span", {
    className: "arrow"
  }, "→")), React.createElement("a", {
    className: "lab-link",
    href: ship.github,
    target: "_blank",
    rel: "noreferrer"
  }, "GitHub ↗")))), React.createElement(Reveal, {
    className: "lab-row"
  }, React.createElement("div", null, React.createElement("div", {
    className: "lab-frame"
  }, React.createElement("span", {
    className: "lab-frame-bar"
  }, React.createElement("span", null, "SOUL ORB"), React.createElement("span", {
    className: "live"
  }, "LIVE · WEBGL")), React.createElement(LazyMount, {
    className: "lab-embed-slot"
  }, React.createElement("iframe", {
    src: sam.embed,
    title: "Samantha UI — live audio-reactive orb",
    loading: "lazy"
  }))), React.createElement("div", {
    className: "lab-caption"
  }, React.createElement("b", null, sam.title), " — ", sam.meta.join(" · "), " ·", " ", React.createElement("a", {
    className: "lab-link",
    href: sam.embed,
    target: "_blank",
    rel: "noreferrer"
  }, sam.cta, " ↗"), " ", React.createElement("a", {
    className: "lab-link",
    href: sam.github,
    target: "_blank",
    rel: "noreferrer"
  }, "GitHub ↗")), React.createElement("p", {
    className: "lab-one",
    style: {
      marginTop: 10
    }
  }, sam.one)), React.createElement("a", {
    className: "lab-card",
    href: arcade.href
  }, React.createElement("div", {
    className: "label"
  }, arcade.eyebrow), React.createElement("h3", {
    className: "lab-title"
  }, arcade.title), React.createElement("p", {
    className: "lab-one"
  }, arcade.one), React.createElement("div", {
    className: "lab-meta"
  }, arcade.meta.join(" · ")), React.createElement("div", {
    className: "lab-link",
    style: {
      marginTop: "auto"
    }
  }, arcade.cta, " ", React.createElement("span", {
    className: "arrow"
  }, "→"))))));
}
function Arc() {
  return React.createElement("section", {
    className: "section tinted"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement(Reveal, {
    className: "section-head"
  }, React.createElement("div", {
    className: "section-num"
  }, "04 / Arc"), React.createElement("div", null, React.createElement("h2", {
    className: "section-title"
  }, "EMT dispatch ", React.createElement("em", null, "to"), " production code, in eight years."), React.createElement("p", {
    className: "section-lede"
  }, "The story most engineers don't have. The pattern: every role runs the operations the next role automates."))), React.createElement(Reveal, {
    className: "arc-list"
  }, D.arc.map((r, i) => React.createElement("div", {
    key: i,
    className: "arc-row"
  }, React.createElement("div", {
    className: "arc-year"
  }, r.year), React.createElement("div", null, React.createElement("span", {
    className: "arc-phase"
  }, r.phase)), React.createElement("div", {
    className: "arc-content"
  }, React.createElement("div", {
    className: "arc-title"
  }, r.title, React.createElement("span", {
    className: "org"
  }, "— ", r.org)), React.createElement("div", {
    className: "arc-note"
  }, r.note)))))));
}
function Validation() {
  return React.createElement("section", {
    className: "section"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement(Reveal, {
    className: "section-head"
  }, React.createElement("div", {
    className: "section-num"
  }, "05 / Trust"), React.createElement("div", null, React.createElement("h2", {
    className: "section-title"
  }, "What people ", React.createElement("em", null, "actually said.")), React.createElement("p", {
    className: "section-lede"
  }, "Quotes pulled from internal channels. Verbatim, no paraphrasing."))), React.createElement(Reveal, {
    className: "quotes"
  }, D.validation.map((q, i) => React.createElement("div", {
    key: i,
    className: "quote-card"
  }, React.createElement("p", {
    className: "quote-text"
  }, q.quote), React.createElement("div", {
    className: "quote-meta"
  }, React.createElement("b", null, q.role), " · ", q.on)))), React.createElement(Reveal, {
    className: "awards"
  }, D.awards.map((a, i) => React.createElement("div", {
    key: i,
    className: "award-row"
  }, React.createElement("div", {
    className: "award-year"
  }, a.year), React.createElement("div", null, React.createElement("div", {
    className: "award-title"
  }, a.title), React.createElement("div", {
    className: "quote-meta",
    style: {
      marginTop: 6
    }
  }, a.reason)), React.createElement("div", {
    className: "award-from"
  }, "From: ", a.from))))));
}
function Stack() {
  return React.createElement("section", {
    className: "section tinted"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement(Reveal, {
    className: "section-head"
  }, React.createElement("div", {
    className: "section-num"
  }, "06 / Stack"), React.createElement("div", null, React.createElement("h2", {
    className: "section-title"
  }, "What's actually ", React.createElement("em", null, "in production.")), React.createElement("p", {
    className: "section-lede"
  }, "No aspirational badges. Each item below has shipped to users this year."))), React.createElement(Reveal, {
    className: "stack-list"
  }, Object.entries(D.stack).map(([k, vs]) => React.createElement("div", {
    key: k,
    className: "stack-row"
  }, React.createElement("div", {
    className: "stack-key"
  }, k), React.createElement("div", {
    className: "stack-vals"
  }, vs.map(v => React.createElement("span", {
    key: v,
    className: "stack-pill"
  }, v))))))));
}
function Contact() {
  return React.createElement("section", {
    className: "contact",
    id: "contact"
  }, React.createElement("div", {
    className: "wrap"
  }, React.createElement(Reveal, null, React.createElement("h2", {
    className: "contact-headline"
  }, "Let's ", React.createElement("em", null, "build"), " the system", React.createElement("br", null), "that fixes the bottleneck.")), React.createElement(Reveal, {
    className: "contact-grid"
  }, React.createElement("div", {
    className: "contact-cell"
  }, React.createElement("div", {
    className: "k"
  }, "Email"), React.createElement("div", {
    className: "v"
  }, React.createElement("a", {
    href: `mailto:${D.identity.email}`
  }, D.identity.email))), React.createElement("div", {
    className: "contact-cell"
  }, React.createElement("div", {
    className: "k"
  }, "GitHub"), React.createElement("div", {
    className: "v"
  }, React.createElement("a", {
    href: `https://github.com/${D.identity.github}`,
    target: "_blank",
    rel: "noreferrer"
  }, "@", D.identity.github))), React.createElement("div", {
    className: "contact-cell"
  }, React.createElement("div", {
    className: "k"
  }, "LinkedIn"), React.createElement("div", {
    className: "v"
  }, React.createElement("a", {
    href: `https://linkedin.com/in/${D.identity.linkedin}`,
    target: "_blank",
    rel: "noreferrer"
  }, "/", D.identity.linkedin))), React.createElement("div", {
    className: "contact-cell"
  }, React.createElement("div", {
    className: "k"
  }, "Location · Status"), React.createElement("div", {
    className: "v"
  }, D.identity.location))), React.createElement(Reveal, {
    className: "resumes"
  }, D.tracks.map(t => React.createElement("a", {
    key: t.key,
    className: "resume-link",
    href: t.cv,
    target: "_blank",
    rel: "noopener"
  }, React.createElement("div", {
    className: "r-label"
  }, t.title), React.createElement("div", {
    className: "r-cv"
  }, "Download résumé ", React.createElement("span", {
    className: "r-arrow"
  }, "→"))))), React.createElement("div", {
    className: "foot"
  }, React.createElement("span", null, "© ", D.identity.name, " · 2026"), React.createElement("span", null, "Static · React · Hand-built ·", " ", React.createElement("a", {
    href: "arcade.html",
    style: {
      borderBottom: "1px solid var(--accent)",
      color: "var(--accent)"
    }
  }, "p.s. there's an arcade →"), " · ", React.createElement("a", {
    href: "starship.html",
    style: {
      borderBottom: "1px solid var(--accent)",
      color: "var(--accent)"
    }
  }, "and a starship →")))));
}
function App() {
  const [openId, setOpenId] = useState(null);
  return React.createElement(React.Fragment, null, React.createElement(TopStrip, null), React.createElement("main", null, React.createElement(Hero, null), React.createElement(Receipt, null), React.createElement(Work, {
    onOpen: setOpenId
  }), React.createElement(Lab, null), React.createElement(Arc, null), React.createElement(Validation, null), React.createElement(Stack, null), React.createElement(Contact, null)), React.createElement(CaseStudy, {
    id: openId,
    onClose: () => setOpenId(null)
  }));
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App, null));
