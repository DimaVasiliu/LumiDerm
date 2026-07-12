/* =============================================================================
   Lumi Derm chat assistant
   -----------------------------------------------------------------------------
   Runs fully client-side right now (no cost, works on the static site) by matching
   the visitor's question against the knowledge base below.

   ►► To switch to a GPT / Claude backend later, you only touch getReply():
      1. Deploy a small Cloudflare Worker that holds your API key and calls the model.
      2. Set LUMI_CHAT_CONFIG.useApi = true and apiEndpoint to the Worker URL.
      The Worker should accept  { messages: [{role, content}], system }  and
      return  { reply: "..." }.  If the request fails we fall back to local answers.

      Example Worker (pseudo):
        export default {
          async fetch(req, env) {
            const { messages, system } = await req.json();
            const r = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "gpt-4o-mini",
                messages: [{ role: "system", content: system }, ...messages] })
            });
            const d = await r.json();
            return Response.json({ reply: d.choices[0].message.content });
          }
        }
   ========================================================================== */

const LUMI_CHAT_CONFIG = {
  useApi: false, // flip to true once your Worker endpoint is live
  apiEndpoint: '', // e.g. 'https://lumi-chat.<you>.workers.dev'
  assistantName: 'Lumi Assistant',
  clinicName: 'Lumi Derm Aesthetics',
  // Sent as the system prompt when useApi is on, so the model stays on-brand & factual.
  systemPrompt:
    "You are the friendly virtual assistant for Lumi Derm Aesthetics, a skin and aesthetics " +
    "clinic in London Docklands (Unit 41 Skylines Village, Limeharbour, E14 9TS). Hours: Mon–Fri " +
    "10:00–20:00, Sat 10:00–18:00, closed Sunday. Live booking, availability and checkout are handled through Treatwell " +
    "(Book Now page). Phone 07832839298, email info@lumidermaesthetics.co.uk, Instagram " +
    "@lumi.derm.aesthetic. Treatments include laser hair removal & skin, electrolysis, PRP, skin " +
    "boosters, mesotherapy, facials, peels, microneedling, Endospheres, lashes and brows; laser from £40. " +
    "Be warm, concise and helpful. For clinical/medical specifics, recommend a consultation with Iulia. " +
    "Never invent prices or policies you are unsure about — point them to booking or contact instead.",
};

/* ---- Knowledge base (local answers) --------------------------------------- */
const LUMI_KB = [
  {
    id: 'greeting',
    keywords: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'],
    answer: "Hi, welcome to Lumi Derm! 😊 I can help with treatments, prices, booking, opening hours and how to find us. What would you like to know?",
  },
  {
    id: 'booking',
    keywords: ['book', 'booking', 'appointment', 'appt', 'reserve', 'schedule', 'slot', 'availability'],
    answer: "You can book online in a minute on our <a href=\"pages/booking.html\">Book Now</a> page — pick your treatment and time and confirm securely. Prefer to talk? Call or text <a href=\"tel:07832839298\">07832839298</a>.",
  },
  {
    id: 'payment',
    keywords: ['pay', 'payment', 'deposit', 'card', 'cost to book', 'prepay', 'upfront'],
    answer: "Treatwell shows the payment options and any deposit or prepayment requirement for the treatment you choose. Please review the booking and cancellation terms shown before confirming.",
  },
  {
    id: 'prices',
    keywords: ['price', 'prices', 'pricing', 'how much', 'cost', 'costs', 'fee', 'rates', 'cheap', 'expensive'],
    answer: "Prices vary by treatment — laser starts from £40. See the full price list on our <a href=\"pages/services.html\">treatments &amp; prices page</a>, and we'll confirm your exact plan at consultation.",
  },
  {
    id: 'treatments',
    keywords: ['treatment', 'treatments', 'services', 'what do you offer', 'what do you do', 'options', 'menu'],
    answer: "We offer laser hair removal & skin, electrolysis, PRP, skin boosters, mesotherapy, facials, peels, microneedling, Endospheres therapy, lashes and brows. Browse them in our <a href=\"pages/services.html\">treatment library</a>.",
  },
  {
    id: 'laser',
    keywords: ['laser', 'hair removal', 'ipl', 'cynosure', 'unwanted hair'],
    answer: "Our laser treatments (Cynosure Elite) cover hair removal, skin rejuvenation and vascular concerns, from £40. A patch test is done before your first session — book a <a href=\"pages/booking.html\">consultation</a> to start.",
  },
  {
    id: 'consultation',
    keywords: ['consultation', 'consult', 'assessment', 'first visit', 'advice', 'patch test', 'patchtest'],
    answer: "For laser and advanced skin treatments we recommend a consultation so Iulia can assess your skin and build a personalised plan (and arrange a patch test where needed). Book one just like any treatment on the <a href=\"pages/booking.html\">Book Now</a> page.",
  },
  {
    id: 'prep',
    keywords: ['prepare', 'preparation', 'before my', 'before treatment', 'aftercare', 'shave', 'sun', 'tan'],
    answer: "For laser hair removal, shave the area beforehand and avoid sun, tanning and self-tan in the days before. You'll get full pre- and after-care guidance at your consultation.",
  },
  {
    id: 'sessions',
    keywords: ['how many sessions', 'sessions', 'course', 'how many treatments', 'how long', 'results'],
    answer: "It depends on the treatment, your skin and your goals — laser hair removal is usually a course of several sessions. We'll confirm the right plan for you at your consultation.",
  },
  {
    id: 'pain',
    keywords: ['hurt', 'pain', 'painful', 'downtime', 'recovery', 'side effects', 'safe'],
    answer: "Most treatments are comfortable and well tolerated, with only mild, short-lived redness possible and minimal downtime. Iulia will talk you through what to expect beforehand.",
  },
  {
    id: 'hours',
    keywords: ['hours', 'open', 'opening', 'closing', 'time', 'times', 'when are you open', 'today'],
    answer: "We're open Monday–Friday 10:00–20:00, Saturday 10:00–18:00, and closed on Sunday.",
  },
  {
    id: 'location',
    keywords: ['where', 'location', 'address', 'find you', 'directions', 'parking', 'map', 'docklands', 'skylines'],
    answer: "We're at Unit 41 Skylines Village, Limeharbour, London E14 9TS (Docklands). <a href=\"https://maps.google.com/?q=Unit%2041%20Skylines%20Village%20Limeharbour%20London%20E14%209TS\" target=\"_blank\" rel=\"noopener\">Open directions in Google Maps</a>.",
  },
  {
    id: 'cancellation',
    keywords: ['cancel', 'cancel my', 'cancel appointment', 'cancellation', 'reschedule', 'change appointment', 'refund', 'move my'],
    answer: "Please give us as much notice as you can if you need to reschedule or cancel. Cancellation and deposit terms are shown during booking — see our <a href=\"pages/policies.html\">policies</a> for details.",
  },
  {
    id: 'age',
    keywords: ['age', 'how old', '18', 'minor', 'under 18', 'child'],
    answer: "Our treatments are for clients aged 18 and over.",
  },
  {
    id: 'contact',
    keywords: ['contact', 'phone', 'call', 'email', 'instagram', 'message', 'reach you', 'number', 'whatsapp'],
    answer: "Call or text <a href=\"tel:07832839298\">07832839298</a>, email <a href=\"mailto:info@lumidermaesthetics.co.uk\">info@lumidermaesthetics.co.uk</a>, or DM us on Instagram <a href=\"https://www.instagram.com/lumi.derm.aesthetic/\" target=\"_blank\" rel=\"noopener\">@lumi.derm.aesthetic</a>.",
  },
  {
    id: 'thanks',
    keywords: ['thanks', 'thank you', 'cheers', 'ta', 'appreciate'],
    answer: "You're very welcome! Anything else I can help with? ✨",
  },
];

const LUMI_FALLBACK =
  "I'm not totally sure on that one, but I don't want to guess. The best next step is to " +
  "<a href=\"pages/booking.html\">book a consultation</a> or reach us on <a href=\"tel:07832839298\">07832839298</a> " +
  "/ <a href=\"mailto:info@lumidermaesthetics.co.uk\">email</a>. You can also ask me about prices, treatments, hours or how to find us.";

const LUMI_CHIPS = [
  { label: 'Prices', text: 'What are your prices?' },
  { label: 'Book', text: 'How do I book?' },
  { label: 'Treatments', text: 'What treatments do you offer?' },
  { label: 'Opening hours', text: 'What are your opening hours?' },
  { label: 'Location', text: 'Where are you located?' },
  { label: 'Contact', text: 'How can I contact you?' },
];

/* ---- Local matcher -------------------------------------------------------- */
function lumiLocalAnswer(raw) {
  const text = ' ' + raw.toLowerCase().replace(/[^\w\s@£]/g, ' ').replace(/\s+/g, ' ') + ' ';
  let best = null;
  let bestScore = 0;
  LUMI_KB.forEach((intent) => {
    let score = 0;
    intent.keywords.forEach((kw) => {
      const boundary = text.includes(' ' + kw + ' '); // whole word only
      // Only let keywords of 4+ chars match as a substring, so short words like
      // "ta", "hi", "sun", "18" don't fire inside "tattoo", "this", "sunday", "180".
      const substring = kw.length >= 4 && text.includes(kw);
      if (boundary || substring) score += kw.includes(' ') ? 2.2 : 1;
    });
    if (score > bestScore) { bestScore = score; best = intent; }
  });
  return bestScore >= 1 && best ? best.answer : LUMI_FALLBACK;
}

/* ---- Reply gateway (swap here for GPT later) ------------------------------ */
async function lumiGetReply(text, history) {
  if (LUMI_CHAT_CONFIG.useApi && LUMI_CHAT_CONFIG.apiEndpoint) {
    try {
      const res = await fetch(LUMI_CHAT_CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: LUMI_CHAT_CONFIG.systemPrompt,
          messages: [...history, { role: 'user', content: text }],
        }),
      });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      if (data && data.reply) return data.reply;
    } catch (err) {
      /* network/API issue -> fall back to local answers */
    }
  }
  return lumiLocalAnswer(text);
}

/* ---- Widget UI ------------------------------------------------------------ */
function initLumiChat() {
  if (document.querySelector('.lumi-chat-launcher')) return;

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'lumi-chat-launcher';
  launcher.setAttribute('aria-label', 'Open chat assistant');
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1 3-11.5 8.38 8.38 0 0 1 12 3.7 8.38 8.38 0 0 1 1.1 4Z"/></svg><span>Chat with us</span>';

  const panel = document.createElement('div');
  panel.className = 'lumi-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Lumi Derm chat assistant');
  panel.innerHTML =
    '<div class="lumi-chat-header">' +
      '<div class="lumi-chat-avatar">LD</div>' +
      '<div class="lumi-chat-heading"><strong>' + LUMI_CHAT_CONFIG.assistantName + '</strong><span>Usually replies instantly</span></div>' +
      '<button class="lumi-chat-close" type="button" aria-label="Close chat">&times;</button>' +
    '</div>' +
    '<div class="lumi-chat-body" role="log" aria-live="polite"></div>' +
    '<div class="lumi-chat-chips"></div>' +
    '<form class="lumi-chat-form">' +
      '<input type="text" autocomplete="off" placeholder="Ask a question…" aria-label="Type your question" />' +
      '<button class="lumi-chat-send" type="submit" aria-label="Send message">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>' +
      '</button>' +
    '</form>' +
    '<p class="lumi-chat-note">Automated assistant — for medical advice please book a consultation.</p>';

  // Proactive nudge bubble so visitors notice the chat is here.
  const bubble = document.createElement('div');
  bubble.className = 'lumi-chat-bubble';
  bubble.setAttribute('role', 'button');
  bubble.setAttribute('tabindex', '0');
  bubble.setAttribute('aria-label', 'Open chat: questions about treatments or booking?');
  bubble.innerHTML =
    '<button class="lumi-chat-bubble-close" type="button" aria-label="Dismiss">&times;</button>' +
    '<strong>Hi there! 👋</strong>Questions about treatments, prices or booking? Ask me here.';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);
  document.body.appendChild(bubble);

  const body = panel.querySelector('.lumi-chat-body');
  const chips = panel.querySelector('.lumi-chat-chips');
  const form = panel.querySelector('.lumi-chat-form');
  const input = panel.querySelector('.lumi-chat-form input');
  const closeBtn = panel.querySelector('.lumi-chat-close');

  const history = []; // {role, content} — kept for the future API mode
  let greeted = false;
  let bubbleTimer = null;

  function dismissBubble() {
    bubble.classList.remove('is-visible');
    window.clearTimeout(bubbleTimer);
    try { sessionStorage.setItem('lumiChatBubbleSeen', '1'); } catch (e) { /* ignore */ }
  }
  function maybeShowBubble() {
    let seen = false;
    try { seen = sessionStorage.getItem('lumiChatBubbleSeen') === '1'; } catch (e) { /* ignore */ }
    if (seen) return;
    bubbleTimer = window.setTimeout(() => {
      if (!panel.classList.contains('is-open')) bubble.classList.add('is-visible');
    }, 3500);
  }

  function scrollDown() { body.scrollTop = body.scrollHeight; }

  function addMessage(html, who) {
    const el = document.createElement('div');
    el.className = 'lumi-chat-msg ' + who;
    el.innerHTML = html;
    body.appendChild(el);
    scrollDown();
    return el;
  }

  function showTyping() {
    const t = document.createElement('div');
    t.className = 'lumi-chat-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(t);
    scrollDown();
    return t;
  }

  function renderChips() {
    chips.innerHTML = '';
    LUMI_CHIPS.forEach((chip) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lumi-chat-chip';
      b.textContent = chip.label;
      b.addEventListener('click', () => handleUser(chip.text));
      chips.appendChild(b);
    });
  }

  async function handleUser(text) {
    const clean = text.trim();
    if (!clean) return;
    addMessage(clean.replace(/</g, '&lt;'), 'user');
    history.push({ role: 'user', content: clean });
    input.value = '';
    const typing = showTyping();
    const reply = await lumiGetReply(clean, history.slice(0, -1));
    setTimeout(() => {
      typing.remove();
      addMessage(reply, 'bot');
      history.push({ role: 'assistant', content: reply.replace(/<[^>]+>/g, '') });
    }, 450 + Math.random() * 350);
  }

  function openChat() {
    dismissBubble();
    panel.classList.add('is-open');
    launcher.classList.add('is-hidden');
    if (!greeted) {
      greeted = true;
      renderChips();
      const t = showTyping();
      setTimeout(() => {
        t.remove();
        addMessage("Hi, welcome to Lumi Derm! 😊 Ask me about treatments, prices, booking, hours or how to find us — or tap a button below.", 'bot');
      }, 500);
    }
    setTimeout(() => input.focus(), 300);
  }
  function closeChat() {
    panel.classList.remove('is-open');
    launcher.classList.remove('is-hidden');
    launcher.focus();
  }

  launcher.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);
  bubble.addEventListener('click', openChat);
  bubble.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(); }
  });
  bubble.querySelector('.lumi-chat-bubble-close').addEventListener('click', (e) => {
    e.stopPropagation();
    dismissBubble();
  });
  maybeShowBubble();
  form.addEventListener('submit', (e) => { e.preventDefault(); handleUser(input.value); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closeChat();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLumiChat);
} else {
  initLumiChat();
}
