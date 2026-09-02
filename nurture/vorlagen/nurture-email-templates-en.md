# Nurture Email Templates — English (Master)

**Version:** 1.0
**Language:** EN
**System:** Mautic (personalisation via `{contactfield=...}`)
**Humanizer:** Written following anti-ai-slop-humanizer rules

**Mautic Tokens:**
- `{contactfield=firstname}` — Lead first name
- `{contactfield=ac_last_profile_label}` — Type label (e.g. "The doer")
- `{contactfield=ac_last_main_goal_label}` — Aspiration label
- `{contactfield=ac_last_barrier}` — Barrier code (vehicle/community/confidence/opportunity)
- `{contactfield=ac_last_video_access_url}` — Resume link (permanent)
- `{contactfield=ac_berater_vorname}` — Coach first name
- `{contactfield=ac_berater_name}` — Coach last name
- `{contactfield=ac_berater_whatsapp}` — Coach WhatsApp number
- `{contactfield=ac_berater_email}` — Coach email
- `{unsubscribe_url}` — Mautic unsubscribe

**Profile codes:**
- R = Fire = "The doer"
- Y = Wind = "The connector"
- G = Water = "The anchor"
- B = Stone = "The architect"

**Barrier codes:**
- vehicle = no system, no starting point
- community = no fitting environment
- confidence = self-doubt, missing certainty
- opportunity = doesn't see the opportunity yet

---

## EMAIL A2 — Day 2 after registration (State 0)
**Format:** Story email (~350 words)
**Trigger:** 2 days after `form_submitted_at`, when `lifecycle_stage = registered`

### Subject lines (aspiration-specific)
- **freedom:** `What freedom means for someone with your profile, {contactfield=firstname}`
- **impact:** `{contactfield=firstname}, how to actually make a difference — Video 1 shows you`
- **security:** `Building a stable foundation without turning your life upside down, {contactfield=firstname}`
- **growth:** `{contactfield=firstname}, why growth looks different for you`

---

### VERSION FREEDOM — A2

Hi {contactfield=firstname},

two years ago, Stefan — a sales director from Munich — had the same thought every Monday morning.

Not again.

He didn't even hate his job. He just wanted options. Something that counted when he wasn't the one running it. Today he plans his own Monday. No boss, no fixed location, no structure that fits but doesn't belong to him.

What did he do? He built a second income stream. Starting from the same point you're at now.

Your success code shows you know what you want — and that you don't wait for anyone's permission. That's exactly the type who builds fastest when the model fits. Video 1 shows you the mechanics. 8 minutes. Then you'll know whether it's for you or not.

*[TYPE-SPECIFIC CTA — Mautic Dynamic Content based on ac_last_profile]*

**Fire:** `[Watch now — 8 minutes is all it takes]`

**Wind:** `[Take a look — let it sink in]`

**Water:** `[See what's waiting for you — no pressure, no deadline]`

**Stone:** `[Understand the structure — watch Video 1]`

---

{contactfield=ac_berater_vorname}

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION IMPACT — A2

Hi {contactfield=firstname},

Lisa was a teacher. 14 years. She liked what she did. But she kept feeling like her impact stopped at the school door.

Today she works with people in 4 countries. Not because she threw everything overboard. Because she found a way to translate what she was already doing — genuinely moving people forward — into something with wider reach.

Your profile shows the same pattern: someone who doesn't just think about themselves. The moment you watch Video 1, you'll understand why your type makes a different kind of impact in this model.

No gloss. No promises. Just what it actually is.

*[TYPE-SPECIFIC CTA based on ac_last_profile]*

**Fire:** `[8 minutes. You decide after.]`

**Wind:** `[Watch and see if it feels right]`

**Water:** `[I'll walk you through what to expect first — then you decide]`

**Stone:** `[How the model really works — Video 1]`

---

{contactfield=ac_berater_vorname}

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION SECURITY — A2

Hi {contactfield=firstname},

Marco had a good job. Family, mortgage, regular outgoings. He didn't want to risk anything — he wanted to build a second income that would hold while he carried on as before.

Today he has both.

He didn't quit. Didn't turn anything upside down. He built something alongside his everyday life that now brings in more than his old side job used to. The difference: he had a model that worked for his type.

Your success code shows you think the same way. Solid, long-term, nothing left to chance. Video 1 shows you what that looks like in practice — no hype, just structure.

*[TYPE-SPECIFIC CTA based on ac_last_profile]*

**Fire:** `[Straight in — you want facts, not promises]`

**Wind:** `[Let the video speak for itself — 8 minutes]`

**Water:** `[Here's what Video 1 has for you. No pressure, no pitch.]`

**Stone:** `[Understand the full model — watch Video 1]`

---

{contactfield=ac_berater_vorname}

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION GROWTH — A2

Hi {contactfield=firstname},

David had everything he wanted from his job. Promotion, salary, title. Still felt like he was going nowhere.

The problem wasn't the job. It was the environment. He was the smartest person in the room.

Since he built this model, that's changed. He's surrounded by people who challenge him. Entrepreneurs, coaches, people who are actually building something. His income has grown. More than that: he has grown.

Your profile shows the same pattern — you never stop. No plateau holds you for long. Video 1 shows you which environment and which model fits someone with your drive.

*[TYPE-SPECIFIC CTA based on ac_last_profile]*

**Fire:** `[What's inside — 8 minutes, you decide after]`

**Wind:** `[The environment behind it — see who's there]`

**Water:** `[Explained step by step — Video 1]`

**Stone:** `[The framework behind everything — watch Video 1]`

---

{contactfield=ac_berater_vorname}

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL A3 — Day 5 after registration (State 0)
**Format:** Empathy email (~280 words)
**Trigger:** 5 days after `form_submitted_at`, if no video watched

### Subject line (universal)
`I know what's holding you back, {contactfield=firstname}`

---

### VERSION VEHICLE (no system, no starting point) — A3

Hi {contactfield=firstname},

you know what most people say when I ask why they haven't started yet?

"I don't know how."

Not: I don't want to. Not: it doesn't interest me. Just: I can't see a clear first step.

That's human. And it's exactly what Video 1 solves.

The video isn't a motivational speech. It shows you how the model is built. What the first step is. What's realistically possible and in what timeframe.

After that you can judge for yourself whether it's right for you. Not me.

{contactfield=ac_berater_vorname}

`[Watch Video 1 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION COMMUNITY (no fitting environment) — A3

Hi {contactfield=firstname},

you know what bothers me about most "business opportunities"?

You do them alone. No backup, no team, nobody who understands what you're building.

That's by far the most common reason good people quit. Not because the model doesn't work. Because they were on their own.

What's different here — Video 1 shows you that. Not as a sales pitch. Simply because it answers the question: who's there when it gets hard?

Watch it. 8 minutes.

{contactfield=ac_berater_vorname}

`[Watch Video 1 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION CONFIDENCE (self-doubt) — A3

Hi {contactfield=firstname},

"Am I even the right type for this?"

I hear that more than any other question. From people who are smart, capable, who have exactly what it takes.

Doubt isn't a sign of weakness. It's usually a sign that something matters to you.

I'm not going to tell you that you'll make it. That would be hollow. What I'll do is show you in Video 1 what people with your profile have built — so you can judge for yourself whether it sounds realistic. Not me.

{contactfield=ac_berater_vorname}

`[Watch Video 1 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION OPPORTUNITY (opportunity not yet clear) — A3

Hi {contactfield=firstname},

sometimes the problem isn't the decision. The problem is not really understanding yet what's actually on offer.

Fair enough. I explain badly when I'm short on time.

Video 1 does a better job than I could in an email. It shows you concretely: what is the model, who's doing it, what does it realistically bring. No 45-minute presentation. 8 minutes, straight to the point.

If you watch it and think "not for me" — that's completely fine. At least you'll know.

{contactfield=ac_berater_vorname}

`[Watch Video 1 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL A4 — Day 10 after registration (State 0)
**Format:** Testimonial email (~300 words)
**Trigger:** 10 days after `form_submitted_at`, if no video
**Note:** Type matching in the story recommended — Mautic Dynamic Content based on `ac_last_profile`

### Subject line (type-specific)
- **Fire:** `What {contactfield=firstname} and Thomas have in common`
- **Wind:** `How Claudia got started — and why it fits you, {contactfield=firstname}`
- **Water:** `{contactfield=firstname}, here's someone who thought exactly like you`
- **Stone:** `What Michael did after 6 months of analysis, {contactfield=firstname}`

---

### VERSION FIRE — A4

Hi {contactfield=firstname},

Thomas was a sales director. 47 years old, good at his job, no time for experiments. He filled out the quiz, waited two weeks, then watched the video. Out of curiosity.

Today he's building a team on the side. Not because he turned everything upside down. Because the model is built exactly the way his mind works: clear structure, clear goals, no detours.

In 14 months he earned more than in his first year at the old job. I'm not dressing that up — he'd tell you the same.

What did he have that you also have? The same type. The same drive. The same hunger.

{contactfield=ac_berater_vorname}

`[Watch Video 1 — now — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION WIND — A4

Hi {contactfield=firstname},

Claudia comes from event management. She loves people, loves energy, loves when things happen. The problem: her job demanded her round the clock.

She wanted something that grew with her — not something that wore her out.

Today she does exactly what she always did: bringing people together, inspiring them, opening doors. But on her own terms. In 8 months she built a small team that keeps running even when she's on holiday.

Her success code looked exactly like yours.

{contactfield=ac_berater_vorname}

`[Take a look — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION WATER — A4

Hi {contactfield=firstname},

Sandra is a nurse. A helper through and through. She doubts almost everything — especially herself. After doing the quiz, she did nothing for 3 weeks.

Then she started.

Not because she suddenly felt brave. Because her coach told her: you don't have to decide anything today. Just watch the video.

Today she has a side income that gives her family more breathing room. No pressure, no hype. Just something that works when you let it.

{contactfield=ac_berater_vorname}

`[Watch Video 1 — {contactfield=ac_last_video_access_url}]`

*No pressure. You watch, you judge for yourself.*

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION STONE — A4

Hi {contactfield=firstname},

Michael is an engineer. He spent 6 months analysing before he started. Spreadsheets, questions, comparisons with other models.

Then he started.

Not because he stopped analysing — but because he had enough data to make a decision. In 18 months he understood the model so well that he optimised it in a way that even impressed my coach.

What struck me about him: not that he was fast. That he was thorough. That's exactly what so many people lack.

{contactfield=ac_berater_vorname}

`[Video 1 — Understand the fundamentals — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL A5 — Day 21 after registration (State 0)
**Format:** Personal check-in (~150 words)
**Trigger:** 21 days after `form_submitted_at`, if no video
**After:** Transition to evergreen phase

### Subject line
`Quick question, {contactfield=firstname}`

---

### TEXT — A5 (universal, no pressure)

Hi {contactfield=firstname},

wanted to check in briefly.

You filled out the quiz, saw the result — and haven't done anything since. That's completely fine. I'm not worried.

I just want to know: is there something that's unclear? Something holding you back?

If so, just reply to this email. No sales call, no script. I read it myself and reply.

If the timing just isn't right — that's okay too. You'll hear from me when I have something concrete.

{contactfield=ac_berater_vorname}

`[If you're ready: Video 1 is here — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL B1 — 24h after Video 1 (State 1, no V2)
**Format:** Hybrid short+story (~250 words)
**Trigger:** 24h inactivity after `video_1_watched_at`, if `video_2_watched_at` empty

### Subject line (type-specific)
- **Fire:** `What you saw in Video 1 is just the beginning, {contactfield=firstname}`
- **Wind:** `{contactfield=firstname} — Video 2 shows you the people behind it`
- **Water:** `The next step is easier than you think, {contactfield=firstname}`
- **Stone:** `{contactfield=firstname}, Video 2 explains the mechanics Video 1 only hinted at`

---

### VERSION FIRE — B1

Hi {contactfield=firstname},

Video 1 showed you what the model is.

Video 2 shows you how it scales. That's the difference between a decent side project and a real second income.

People with your profile build this faster than they expect — because they don't hesitate once the system is clear. Video 2 makes it clear.

12 minutes.

{contactfield=ac_berater_vorname}

`[Watch Video 2 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION WIND — B1

Hi {contactfield=firstname},

you know what's special about this model for someone like you?

It works through people. Not despite that — because of it.

Video 2 shows you how other connectors built this model. Real faces, real stories. No whiteboard, no numbers presentation. Just people talking about what they did.

{contactfield=ac_berater_vorname}

`[Watch Video 2 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION WATER — B1

Hi {contactfield=firstname},

you watched Video 1. Good.

Video 2 goes one level deeper — not faster, not louder. It shows you what the model actually looks like day to day. What month two brings, what the first year realistically means.

No pressure. Watch it when you have a quiet moment.

{contactfield=ac_berater_vorname}

`[Watch Video 2 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION STONE — B1

Hi {contactfield=firstname},

Video 1 showed the surface.

Video 2 explains the structure behind it: how the income model is built, how scaling works, why the model runs even without constant activity. These are the questions anyone who looks closely will ask — and the answers are better than you probably expect.

{contactfield=ac_berater_vorname}

`[Watch Video 2 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EMAIL B2 — B+3 days (State 1, no V2)
**Format:** Framework insight (~300 words)
**Trigger:** 3 days after B1, if still no V2

### Subject line (type-specific)
- **Fire:** `Why doers scale faster than everyone else with this model`
- **Wind:** `{contactfield=firstname}, the advantage connectors have from day one`
- **Water:** `Why steady, reliable people go furthest here`
- **Stone:** `{contactfield=firstname}, the systemic principle behind this model`

---

### TEXT — B2 (4 type variants)

**FIRE:**

Hi {contactfield=firstname},

there's a reason people with your profile move faster than average in this model.

They don't over-analyse. They start, correct, build.

The model is made for that: clear steps, clear targets, no waiting for perfect. Whoever starts has a head start on everyone still deliberating. Video 2 shows you the build — so you can judge whether your pace fits here.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**WIND:**

Hi {contactfield=firstname},

the biggest advantage connectors have in this model rarely gets said out loud.

They don't have to cold prospect. They just share what they've experienced — and whoever's curious gets in touch. That's the difference between selling and inviting. You have that ability. Video 2 shows you how other connectors have put it into practice.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**WATER:**

Hi {contactfield=firstname},

you know who builds most consistently in this model?

Not the loudest people. The most reliable ones.

People who just keep going, month after month. No miracle results in week three — but after 12 months a steady income that holds. That's your advantage. Video 2 shows you the build plan behind it.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

**STONE:**

Hi {contactfield=firstname},

here's the systemic principle most people miss:

The model has two income sources. One works without a team, one grows through a team. Both run in parallel. That's not by accident — it's why it scales without you having to be active every day.

Video 2 explains that fully. No simplification.

{contactfield=ac_berater_vorname}

`[Video 2 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL C1 — 24h after Video 2 (State 2, no V3)
**Format:** Testimonial email (~280 words)
**Trigger:** 24h inactivity after `video_2_watched_at`, if `video_3_watched_at` empty

### Subject line
`{contactfield=firstname}, Video 3 is the most personal one`

---

### TEXT — C1 (universal + type-specific quote)

Hi {contactfield=firstname},

you've seen how the model is built. Now comes Video 3.

It's not a strategy video. No block of numbers. It's people sharing what they went through — before they started, and what happened after.

*[Mautic Dynamic Content based on ac_last_profile — a different quote per type]*

**Fire:**
> "I waited 3 months because I thought I needed to know more. That was a mistake. The best decisions I made were when I just started."
> — Thomas, sales director, 14 months in the model

**Wind:**
> "What convinced me wasn't the number in my bank account. It was the conversation with someone who thinks like me — who simply said: this works, let me show you how."
> — Claudia, event manager, 8 months in the model

**Water:**
> "I didn't think I could do it. My coach didn't try to convince me. He gave me time. That was the difference."
> — Sandra, nurse, 11 months in the model

**Stone:**
> "I checked everything before I started. Everything added up. What I didn't expect: that after a year I'd be optimising the model myself."
> — Michael, engineer, 18 months in the model

Video 3 has a lot more of that. Real people, real situations.

{contactfield=ac_berater_vorname}

`[Watch Video 3 — {contactfield=ac_last_video_access_url}]`

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EMAIL C2 — C+3 days (State 2, no V3)
**Format:** Multi-proof (~300 words)

### Subject line (type-specific)
- **Fire:** `Two examples that show what's possible with your profile`
- **Wind:** `{contactfield=firstname}, three people who started exactly like you`
- **Water:** `{contactfield=firstname} — what happens when you simply begin`
- **Stone:** `Real results: 6 months, 12 months, 18 months compared`

---

### TEXT — C2 (type-specific proof selection)

**FIRE:**

Hi {contactfield=firstname},

two numbers from the last year:

Annette, 39, team leader: after 6 months €1,400 side income, after 14 months it fully replaces her old second job.

Rafael, 44, self-employed: 9 months until he stopped doubting, 3 months after that he was profitable.

Both had your type. Neither waited for the perfect moment. Video 3 shows you why.

`[Watch Video 3 — {contactfield=ac_last_video_access_url}]`

---

**WIND:**

Hi {contactfield=firstname},

you know what everyone in my team who's gone furthest has in common?

They didn't start alone. They had someone showing them how it's done.

Julia built a team of 12 people in 7 months. Not because she's especially talented — but because she gets people excited. Like you do.

Video 3 shows you her story and the stories of two others who started the same way.

`[Watch Video 3 — {contactfield=ac_last_video_access_url}]`

---

**WATER:**

Hi {contactfield=firstname},

I'm not sending you promises.

Just this: Bernd, 52, teacher. Took him 10 months to get started. Then he built, slowly, reliably. After 2 years his side income is more stable than his salary fluctuates.

He said: the only thing I regret is not watching the video sooner.

`[Watch Video 3 — {contactfield=ac_last_video_access_url}]`

---

**STONE:**

Hi {contactfield=firstname},

here are real income trajectories from my network, anonymised:

Profile Type B, start month January: Month 6: €890 | Month 12: €2,100 | Month 18: €3,400

That's not an outlier. That's the pattern when someone works with your kind of systematic approach.

Video 3 explains the build behind that. No sugar-coating.

`[Watch Video 3 — {contactfield=ac_last_video_access_url}]`

---

*{contactfield=ac_berater_vorname}*

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL D1 — 24h after Video 3 (State 3, no CTA)
**Format:** Direct decision email (~280 words)
**Trigger:** 24h after `video_3_watched_at`, if no CTA

### Subject line (aspiration-specific)
- **freedom:** `{contactfield=firstname}, you've watched all the videos — what's still holding you back?`
- **impact:** `{contactfield=firstname}, what if you started tomorrow?`
- **security:** `You have all the information, {contactfield=firstname}. What else is missing?`
- **growth:** `{contactfield=firstname} — the next step is a conversation, nothing more`

---

### TEXT — D1 (universal, aspiration hook at the start)

Hi {contactfield=firstname},

you've watched all three videos. You know how the model works, what it realistically brings, who's already built it.

*[Aspiration hook — Mautic Dynamic Content]*

**freedom:** The question now is simple: do you want to keep the same rhythm, or do you want to start building options?

**impact:** You've seen what's possible. For people who want to help others, there's plenty of room here.

**security:** You have all the facts. The risk is manageable — the videos showed that.

**growth:** You've seen what people with your drive have built here. The question is when, not if.

---

The next step is a conversation. No pitch, no pressure. Just an open chat with {contactfield=ac_berater_vorname} — 20 to 30 minutes.

Write directly:

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` or reply to this email.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL D2 — D+3 days (State 3, no CTA)
**Format:** Objection email (~350 words)
**Trigger:** 3 days after D1, if no CTA

### Subject lines (barrier-specific)
- **vehicle:** `"I don't know where to start" — this conversation answers that`
- **community:** `{contactfield=firstname}, you don't have to figure this out alone`
- **confidence:** `{contactfield=firstname}, the doubt is valid. Here's my honest answer.`
- **opportunity:** `What the model really delivers — no polished version, {contactfield=firstname}`

---

### VERSION VEHICLE — D2

Hi {contactfield=firstname},

"Where do I start?" is the most common question I get from people who've watched all the videos and still can't take the next step.

That's not a sign of weakness. It's the moment where a conversation does more than another video.

In 20 minutes I'll answer:
- What your realistic first step is
- What it really costs you at the start (time, money)
- What happens in month 1, 2, 3

After that you'll have clarity — whatever you decide.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` or reply to this email.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION COMMUNITY — D2

Hi {contactfield=firstname},

this isn't a lecture. Just an honest question:

Is there anyone in your circle who's already doing this, who can tell you what it's really like?

If not — that's the problem. Not the model.

That's what I'm here for. Not as a coach selling you something. As someone who knows what it's like to stand in front of a decision that nobody around you understands.

20 minutes. Open. Honest.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION CONFIDENCE — D2

Hi {contactfield=firstname},

I won't tell you that you'll make it. That would be cheap.

What I can tell you: the people I've seen who doubted most were often the ones who went furthest. Because doubt means you take seriously what you're doing.

The conversation I'm offering isn't a motivational session. It's an honest conversation about what's holding you back — and whether that's really a reason or a defensive reaction.

You decide after.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]` or just reply here.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

### VERSION OPPORTUNITY — D2

Hi {contactfield=firstname},

maybe you watched the videos and thought: sounds good — but what does it really bring?

That's the most honest question you can ask.

I don't answer it with numbers I go and dig up. I answer it with what I've seen in my network: what have people built in 6 months, what did they invest, what didn't work.

All of that — straight, no spin — in 20 minutes.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL D3 — D+7 days (State 3, no CTA)
**Format:** Short + genuine invitation (~130 words)
**Trigger:** 7 days after D1, if no CTA
**After:** Evergreen phase begins

### Subject line
`Last message from me for a while, {contactfield=firstname}`

---

### TEXT — D3

Hi {contactfield=firstname},

I won't be writing to you every week from here.

Not because I've lost interest. But because you know everything you need to know. More information won't help at this point.

When you're ready, I'm here. Just write — no process, no waiting time.

`[WhatsApp: {contactfield=ac_berater_whatsapp}]`

You'll hear from me again when I have something that's genuinely relevant to you.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EMAIL E1 — Post-CTA (immediately after CTA click)
**Format:** Warm welcome (~200 words)

### Subject line
`{contactfield=firstname}, your request has arrived`

---

### TEXT — E1

Hi {contactfield=firstname},

I got your message.

Good that you reached out.

I'll be in touch within the next 24 hours — via WhatsApp or email, depending on how you wrote. No script, no sales talk. Just an open conversation where we see whether and how this fits for you.

If you want to bring something: your most important question. The one thing you still don't understand or can't quite see yet.

Looking forward to talking.

{contactfield=ac_berater_vorname}
{contactfield=ac_berater_email}
WhatsApp: {contactfield=ac_berater_whatsapp}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EVERGREEN EMAIL EV1 — Month 1
**Type:** Value/Insight
**Trigger:** First month after the end of the activation phase

### Subject line
`{contactfield=firstname}, a thought that stuck with me`

---

### TEXT — EV1

Hi {contactfield=firstname},

I read a lot about income, models, business. Most of it is noise.

But last month someone from my team said something I haven't been able to shake:

"Most people wait for the right moment. It never comes. There's only the moment where you stop waiting."

He started with this model 9 months ago. Not because everything was perfect. Because he stopped waiting.

I'm not sending you this to push you. I'm sending it because it's honest.

If you're ever ready for a conversation: {contactfield=ac_berater_whatsapp}

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV2 — Month 2
**Type:** Social proof / new story

### Subject line
`What Maria told me last week, {contactfield=firstname}`

---

### TEXT — EV2

Hi {contactfield=firstname},

Maria wrote to me last week. She's been with us for 13 months.

First line: "I don't regret anything except waiting so long."

She comes from healthcare. Has two kids. Never believed this model could work for someone like her. Today she earns more on the side than her old part-time job ever paid.

I'm not sharing this as a success story for a brochure. I'm sharing it because I know you're still thinking — and because I believe you've had similar thoughts to the ones Maria had back then.

If you have questions: just reply.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV3 — Month 3
**Type:** Soft offer / re-offering video link

### Subject line
`If you want to watch again, {contactfield=firstname}`

---

### TEXT — EV3

Hi {contactfield=firstname},

quick note.

Sometimes someone goes back to the videos and watches them with different eyes. Because something in their situation has shifted. Because a conversation happened. Because something in life has changed.

If that's where you are — the videos are still there. Exactly where you left off.

`[Continue watching — {contactfield=ac_last_video_access_url}]`

And if you just want a quick chat: {contactfield=ac_berater_whatsapp}

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV4 — Month 4
**Type:** Personal story / coach perspective

### Subject line
`What actually drives me in my work, {contactfield=firstname}`

---

### TEXT — EV4

Hi {contactfield=firstname},

people sometimes ask me: why do you do this?

Honest answer: because I know what it's like to have no options. A few years ago I had a job that was fine — but fine isn't a life. I wanted more. More time, more freedom to decide, more meaning.

This model gave me that. Not quickly. Not without work.

When I help someone get started today, it's not an obligation. It's the only part of my work where I genuinely feel like it matters.

Talk soon.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV5 — Month 5
**Type:** Re-engagement / "What's new since then"

### Subject line
`{contactfield=firstname}, this has changed since your quiz`

---

### TEXT — EV5

Hi {contactfield=firstname},

you filled out the quiz a few months ago. Things have moved on since then.

We have new people in the team. New results. New experiences I'd love to share.

No idea if your situation has changed. Maybe now is a better time than it was then. Maybe not.

If you're curious what's been happening: just reply to this email. I'll send you a short summary — no pitch, no pressure.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

## EVERGREEN EMAIL EV6 — Month 6
**Type:** Value/Insight — "What most people get wrong"

### Subject line
`Why most {contactfield=ac_last_profile_label}s don't start — and what they'd change`

---

### TEXT — EV6

Hi {contactfield=firstname},

I've been watching this for years. People with your profile — {contactfield=ac_last_profile_label} — often block in a very specific way.

Not out of laziness. Out of a misunderstanding.

They think they need to be better before they start. Know more. Be more prepared. More certain.

That's exactly backwards. You get better by starting. Not before.

I've lived it myself and I see it in every second conversation. People who wait until they're "ready" are usually still waiting two years later.

If any of this feels relevant right now: write to me. Not to buy anything. Just to talk.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV7 — Month 7
**Type:** Social proof — new story, matched to type

### Subject line
`What {contactfield=firstname} K. from Linz built in 8 months`

---

### TEXT — EV7

Hi {contactfield=firstname},

I had a conversation last week with someone who genuinely impressed me.

Katharina, 39, from Linz. Two kids, full-time office job, no background in online business.

A year ago she started. Not perfectly prepared. Not with a polished plan. She just started.

Today she has a small but stable side income that lets her decide freely when she works. No million-dollar business. But enough to have real freedom of choice.

What helped her: she stopped waiting for the "right moment" and focused on the next step instead. Always just the next one.

That sounds simple. It is simple. Just rarely easy.

If you want, I can tell you more about how Katharina approached it concretely.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV8 — Month 8
**Type:** Soft offer — "If you want to watch again"

### Subject line
`Your access to the videos is still there`

---

### TEXT — EV8

Hi {contactfield=firstname},

short message today.

Your personal access to the explainer videos is still active. If you didn't watch everything back then or want to go back: you can pick up at any time from where you left off.

{contactfield=ac_last_video_access_url}

No login needed. The link takes you straight to your last position.

If you have questions after that or want a conversation, you know where I am.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV9 — Month 9
**Type:** Personal story — coach story, different lesson from EV4

### Subject line
`The year I almost quit`

---

### TEXT — EV9

Hi {contactfield=firstname},

I've never talked about this much but there was a year where I seriously considered stopping.

Not because the business wasn't working. Because I thought I wasn't the right type for it. Too introverted. Not engaging enough. Not enough charisma.

I know that moment. The comparison with others who seem to have it easier.

What turned things around for me was a single conversation with someone who was further along than me. Not to sell me anything. Just to listen and then say: "You're already doing it right. Stop comparing yourself to others."

Since then it's one of my favourite moments when I talk to someone. That moment where they stop comparing and start trusting themselves.

If you know that feeling right now, you know what I mean.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV10 — Month 10
**Type:** Re-engagement — "What's changed since then" (variant 2)

### Subject line
`{contactfield=firstname}, I have a new question I wanted to ask you`

---

### TEXT — EV10

Hi {contactfield=firstname},

I sometimes ask people I've known for a while: what has changed in your life recently?

Not just work. In general.

I ask because many people who "weren't ready" back then eventually are. Not because the business got easier. But because their situation changed. New priorities. Different energy. A concrete reason that wasn't there before.

If you want, you can just reply. What's changed for you since we last "spoke" — via quiz, I mean.

No pitch. Just genuine interest.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV11 — Month 11
**Type:** Value/Insight — concrete number or framework

### Subject line
`This one number explained everything to me`

---

### TEXT — EV11

Hi {contactfield=firstname},

I shared a number in a conversation recently that changed everything for me when I first heard it.

82 percent.

That's the share of people who say they are "not particularly satisfied" with their current professional situation. Not miserable. Just not satisfied. Enough to keep going. Not enough to actually flourish.

What hits me about that number: most of them know they want more. They just don't know how to get from A to B without risking everything.

That's exactly the point of what I do. Not to save the world. To show the concrete path from A to B for people who know they can do more.

If you're in that 82 percent: you're not alone. And there's a way.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

## EVERGREEN EMAIL EV12 — Month 12
**Type:** Social proof — year-in-review character

### Subject line
`One year. What was possible in this year.`

---

### TEXT — EV12

Hi {contactfield=firstname},

I've been doing this for a few years now and every time I look back at the end of a year, I think the same thing.

The people who are a year further along than they were are almost never the ones with the most talent. They're the ones who started. And then kept going even when it was uncomfortable.

Last year several people in our network made their first paying client. One quit his job. Two brought their side income up to main income level. One now works from Spain.

These aren't exceptions. This is what happens when you have a clear path and you walk it.

You did the quiz a year ago. A year has passed. I don't know what's happened for you in that time.

But if you know you're ready — really ready — now is a good time for a conversation.

{contactfield=ac_berater_vorname}

---

*You are receiving this email because you registered at business.activecenter.info. [{unsubscribe_url} Unsubscribe] · [Legal notice & Privacy]*

---

---

*End of document — Version 1.0 — EN*
*Evergreen library: EV1–EV12 complete (12 months)*
