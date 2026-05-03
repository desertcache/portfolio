// v4 — single file app. Editorial portfolio for Samuel Bates.

const { useState, useEffect, useRef } = React;
const D = window.PORTFOLIO_DATA_V4;

// ---------- helpers ----------
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
function Reveal({ children, as: As = "div", ...p }) {
  const ref = useReveal();
  return <As ref={ref} className={`reveal ${p.className || ""}`} {...p}>{children}</As>;
}

// ---------- top strip ----------
function TopStrip() {
  return (
    <header className="topstrip">
      <div className="topstrip-inner">
        <a className="brand-mark" href="#top">Samuel Bates<span className="dot">.</span></a>
        <div className="topstrip-mid">
          <span className="avail">{D.identity.available}</span>
          <span>{D.identity.location}</span>
          <span>FDE · Solutions · SWE</span>
        </div>
        <div className="topstrip-right">
          <a className="topstrip-arcade" href="arcade.html" title="A small detour — vanilla JS arcade games">
            <span className="dot-blink"></span> Arcade
          </a>
          <a className="topstrip-cta" href={`mailto:${D.identity.email}`}>Get in touch ↗</a>
        </div>
      </div>
    </header>
  );
}

// ---------- hero ----------
function Hero() {
  return (
    <section className="hero" id="top">
      <div className="wrap">
        <div className="hero-grid">
          <div>
            <div className="hero-tag">Portfolio · 2026</div>
            <h1>
              Samuel<br />
              <span className="it">Bates</span><span className="acc">.</span>
            </h1>
            <p className="hero-pitch">
              I came up through ops — call center, EMT dispatch, escalations — and I now ship the <em>React, TypeScript, and Snowflake</em> code that fixes what I used to triage. Operator first. Engineer second. Both in production.
            </p>
            <div className="hero-meta">
              <span><b>Currently:</b> DoorDash · Merchant Ops</span>
              <span><b>Based:</b> Tempe, AZ</span>
              <span><b>Open to:</b> Remote · Hybrid · SF Bay</span>
            </div>
          </div>

          <Photo />
        </div>

        <Tracks />
      </div>
    </section>
  );
}

function Photo() {
  return (
    <figure className="photo">
      <img src="headshot.png" alt="Samuel Bates" />
      <figcaption className="cap">
        <b>Samuel Bates</b>, Tempe, AZ · 2026.<br />
        Yes — same hat I wore to the Square Learn-a-thon. Worked then. Still works.
      </figcaption>
    </figure>
  );
}

function Tracks() {
  return (
    <div className="tracks">
      {D.tracks.map(t => (
        <a key={t.key} className={`track ${t.primary ? "is-primary" : ""}`} href={t.cv} target="_blank" rel="noopener">
          <span className="label">{t.primary ? "Primary lane" : "Also fits"}</span>
          <div className="ttl">{t.title}</div>
          <div className="one">{t.one}</div>
          <div className="cv">Open résumé <span className="arrow">→</span></div>
        </a>
      ))}
    </div>
  );
}

// ---------- the receipt (migration) ----------
function Receipt() {
  const m = D.migration;
  return (
    <section className="section">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="section-num">01 / Receipt</div>
          <div>
            <h2 className="section-title">Lead with the strongest <em>evidence.</em></h2>
            <p className="section-lede">
              An FDE's job is to find friction, size the loss, secure the budget, ship the measurement, and drive adoption. Here is one program that did all five — start to finish, in eight months.
            </p>
          </div>
        </Reveal>

        <Reveal className="receipt">
          <div>
            <div className="receipt-headnum">
              <span className="acc">$20</span><span>M</span>
              <span className="unit">/ month, retained</span>
            </div>
            <div className="receipt-headlabel">{m.title}</div>
            <div className="receipt-headsub">{m.when} · {m.role}</div>
          </div>

          <div className="receipt-body">
            <div className="receipt-row">
              <div className="step">Problem</div>
              <div className="copy">{m.problem}</div>
            </div>
            <div className="receipt-row">
              <div className="step">Bet</div>
              <div className="copy">{m.bet}</div>
            </div>
            <div className="receipt-row">
              <div className="step">Build</div>
              <div className="copy">{m.build}</div>
            </div>

            <div className="receipt-stats">
              {m.result.map((r, i) => (
                <div key={i} className="receipt-stat">
                  <div className="v"><span className="acc">{r.v}</span></div>
                  <div className="k">{r.k}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------- selected work ----------
function Work({ onOpen }) {
  return (
    <section id="work" className="section tinted">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="section-num">02 / Work</div>
          <div>
            <h2 className="section-title">Six projects, <em>one operating thread.</em></h2>
            <p className="section-lede">
              Every project below started as operational friction I'd lived with personally. I built the tool, wired the measurement, and packaged it for the team. Click any row to read the full case study.
            </p>
          </div>
        </Reveal>

        <Reveal className="work-list">
          {D.projects.map((p, i) => (
            <div key={p.id} className="work-row" onClick={() => onOpen(p.id)} role="button" tabIndex={0}
                 onKeyDown={e => { if (e.key === "Enter") onOpen(p.id); }}>
              <div className="work-num">0{i + 1}</div>
              <div>
                <div className="work-title">{p.title}</div>
                <div className="work-one">{p.one}</div>
              </div>
              <div className="work-tag-cell">{p.year} · {p.stack.slice(0, 3).join(" · ")}</div>
              <div className="work-arrow">→</div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------- case study overlay ----------
function CaseStudy({ id, onClose }) {
  const p = id ? D.projects.find(x => x.id === id) : null;
  useEffect(() => {
    if (!id) return;
    const k = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [id, onClose]);
  if (!id || !p) return null;

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="overlay-panel" onClick={e => e.stopPropagation()}>
        <button className="overlay-close" onClick={onClose}>Close · Esc</button>
        <div className="cs-eyebrow">{p.year} · case study</div>
        <h2 className="cs-title">{p.title}</h2>
        <p className="cs-one">{p.one}</p>

        <div className="cs-stack">
          {p.stack.map(s => <span key={s}>{s}</span>)}
        </div>

        <div className="cs-stats">
          {p.stats.map((s, i) => (
            <div key={i} className="cs-stat">
              <div className="v">{s.v}</div>
              <div className="k">{s.k}</div>
            </div>
          ))}
        </div>

        <div className="cs-body">
          <p>{p.what}</p>
        </div>

        {p.validation && (
          <div className="cs-quote">
            “{p.validation.replace(/^"|"$/g, "").replace(/^“|”$/g, "")}”
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- arc ----------
function Arc() {
  return (
    <section className="section">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="section-num">03 / Arc</div>
          <div>
            <h2 className="section-title">EMT dispatch <em>to</em> production code, in eight years.</h2>
            <p className="section-lede">
              The story most engineers don't have. The pattern: every role runs the operations the next role automates.
            </p>
          </div>
        </Reveal>

        <Reveal className="arc-list">
          {D.arc.map((r, i) => (
            <div key={i} className="arc-row">
              <div className="arc-year">{r.year}</div>
              <div><span className="arc-phase">{r.phase}</span></div>
              <div className="arc-content">
                <div className="arc-title">{r.title}<span className="org">— {r.org}</span></div>
                <div className="arc-note">{r.note}</div>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------- validation ----------
function Validation() {
  return (
    <section className="section tinted">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="section-num">04 / Trust</div>
          <div>
            <h2 className="section-title">What people <em>actually said.</em></h2>
            <p className="section-lede">
              Quotes pulled from internal channels. Verbatim, no paraphrasing.
            </p>
          </div>
        </Reveal>

        <Reveal className="quotes">
          {D.validation.map((q, i) => (
            <div key={i} className="quote-card">
              <p className="quote-text">{q.quote}</p>
              <div className="quote-meta"><b>{q.role}</b> · {q.on}</div>
            </div>
          ))}
        </Reveal>

        <Reveal className="awards">
          {D.awards.map((a, i) => (
            <div key={i} className="award-row">
              <div className="award-year">{a.year}</div>
              <div>
                <div className="award-title">{a.title}</div>
                <div className="quote-meta" style={{ marginTop: 6 }}>{a.reason}</div>
              </div>
              <div className="award-from">From: {a.from}</div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------- stack ----------
function Stack() {
  return (
    <section className="section">
      <div className="wrap">
        <Reveal className="section-head">
          <div className="section-num">05 / Stack</div>
          <div>
            <h2 className="section-title">What's actually <em>in production.</em></h2>
            <p className="section-lede">
              No aspirational badges. Each item below has shipped to users this year.
            </p>
          </div>
        </Reveal>

        <Reveal className="stack-list">
          {Object.entries(D.stack).map(([k, vs]) => (
            <div key={k} className="stack-row">
              <div className="stack-key">{k}</div>
              <div className="stack-vals">
                {vs.map(v => <span key={v} className="stack-pill">{v}</span>)}
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------- contact ----------
function Contact() {
  return (
    <section className="contact" id="contact">
      <div className="wrap">
        <Reveal>
          <h2 className="contact-headline">
            Let's <em>build</em> the system<br />that fixes the bottleneck.
          </h2>
        </Reveal>

        <Reveal className="contact-grid">
          <div className="contact-cell">
            <div className="k">Email</div>
            <div className="v"><a href={`mailto:${D.identity.email}`}>{D.identity.email}</a></div>
          </div>
          <div className="contact-cell">
            <div className="k">GitHub</div>
            <div className="v"><a href={`https://github.com/${D.identity.github}`} target="_blank" rel="noreferrer">@{D.identity.github}</a></div>
          </div>
          <div className="contact-cell">
            <div className="k">LinkedIn</div>
            <div className="v"><a href={`https://linkedin.com/in/${D.identity.linkedin}`} target="_blank" rel="noreferrer">/{D.identity.linkedin}</a></div>
          </div>
          <div className="contact-cell">
            <div className="k">Location · Status</div>
            <div className="v">{D.identity.location}</div>
          </div>
        </Reveal>

        <Reveal className="resumes">
          {D.tracks.map(t => (
            <a key={t.key} className="resume-link" href={t.cv} target="_blank" rel="noopener">
              <div className="r-label">{t.title}</div>
              <div className="r-cv">Download résumé <span className="r-arrow">→</span></div>
            </a>
          ))}
        </Reveal>

        <div className="foot">
          <span>© {D.identity.name} · 2026</span>
          <span>
            Static · React · Hand-built ·{" "}
            <a href="arcade.html" style={{ borderBottom: "1px solid var(--accent)", color: "var(--accent)" }}>
              p.s. there's an arcade →
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------- root ----------
function App() {
  const [openId, setOpenId] = useState(null);
  return (
    <>
      <TopStrip />
      <main>
        <Hero />
        <Receipt />
        <Work onOpen={setOpenId} />
        <Arc />
        <Validation />
        <Stack />
        <Contact />
      </main>
      <CaseStudy id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
