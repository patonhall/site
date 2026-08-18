# Paton Hall — Homepage Membership & Founders Signup Design

**Date:** 2026-08-18
**Scope:** Restructure the homepage around a single tiered signup/commitment
form (mailing list / Member pre-commit / Founder), replacing the existing
plain subscribe box. Reuses the Google Form + Apps Script + Kit + GitHub
Issue pattern established in
`2026-08-18-patonhall-booking-training-requests-design.md` — this spec only
covers what's different, not a re-derivation of that architecture.

---

## 1. Goal

Paton Hall is raising its founding membership before opening. The homepage
currently leads with three paragraphs of context before a plain
name/email/interest subscribe form. This work replaces that with: a tight
pitch, immediately followed by one form offering three levels of
commitment, with the existing context copy moved below it.

Capture-and-notify only, same as the booking/training pipeline's role for
requests with no existing repo data type to write into — there is no
"members" record in this codebase, and none is being added. An admin
follows up on every submission to actually arrange payment; nothing here
processes money.

---

## 2. Homepage restructure

New order in `src/index.html`'s `<main>`:

1. `<h1>Paton Hall</h1>` (unchanged)
2. New pitch, replacing the current opening paragraph:

   > "Paton Hall is a members-run industrial hub opening in downtown
   > Hamilton — electronics, machinery, robotics, and hands-on training.
   > We're raising our founding membership before we open: join the list,
   > or help launch us as a Member or Founder."

3. The new signup form (§3) — where `.signup` currently sits.
4. `<hr class="rule">`, then the existing three paragraphs (Hamilton
   heritage, reindustrialization, the "note" paragraph about
   Membership-organized programming) — unchanged content, just relocated
   below the form instead of above it.
5. `<aside>` (building photo, address, facilities) and the colophon are
   unaffected — the page keeps its existing two-column grid.

The `.signup` section id/class structure is reused (still the same
`.signup`/`.eyebrow`/`.signup-form`/`.fineprint` CSS this repo already has
for the enamel-panel look) — this is a content and script change, not a
new visual component.

---

## 3. The combined form

Base fields, always present: **Name**, **Email**.

A tier selector (three radio buttons or an equivalent grouped control —
implementation's choice, styled consistently with the enamel panel) drives
which additional fields show and what the submit button says:

| Tier | Additional fields shown | Button text |
|---|---|---|
| **Join the list** (default) | "What brings you here" — dropdown: Build nights / Learning days and talks / Certified electronics training / Just keeping an eye on it (four options — "Founding membership" is dropped from this list since the Founder tier now covers that signal directly) | "Put me on the list" |
| **Become a Member** | none — always framed as the $50 first-month vote of confidence, no sub-choice | "Pre-commit — $50 first month" |
| **Become a Founder** | none | "Become a Founder — $1000" |

Directly under the button, a fixed line of fine print (not tier-specific,
always visible) makes clear submitting is not a payment: *"Submitting
reserves your spot — we'll follow up by email to arrange payment. Nothing
is charged now."* This is required, not optional copy — the whole point is
never implying a transaction happened when it didn't.

Switching tiers is client-side show/hide (JS), same interaction shape as
the Calendar/Training admin forms' conditional-field pattern already in
this codebase (e.g. `admin-courses.js`'s registration-mode toggle).

---

## 4. Google Form / Sheet

One new Form (`homepage-signup`), fields: Name, Email, Tier (multiple
choice: "List" / "Member" / "Founder"), Interest (free text — shown and
submitted for all three tiers; the site's own field is a two-line
resizable textarea, not gated behind tier the way Book Space's date
fields are). Linked Sheet, no "publish to web" needed (Apps Script reads
it natively, per the established pattern).

**Hard contract with `homepage-signup.gs`.** `onFormSubmit` reads
`e.namedValues` by key and matches Tier's answer against fixed strings —
there is no schema validation between the Form and the script, so the
question titles and Tier's option strings must be created in the Form
*exactly* as follows:

| Concept | Must be titled exactly | Options must be exactly |
|---|---|---|
| Name | `Name` | — |
| Email | `Email Address` | — |
| Tier | `Reason` | `List`, `Member`, `Founder` (not the friendly button labels like "Join the list") |
| Interest | `Interest` | — |

The as-built Form titles the Email and Tier questions `Email Address` and
`Reason` rather than `Email`/`Tier` — the script was adjusted to match the
Form as created, rather than the Form being renamed to match the original
plan above. `homepage-signup.gs`'s `onFormSubmit` reads these exact keys
via `e.namedValues`; nothing else in this pipeline (the site's own copy,
Book Space, Training) uses these titles, so don't copy them elsewhere.

A title typo on Name or Email Address is a **silent** failure: `firstValue_`
returns `''` for a missing key, so the script still runs, Kit gets called
with an empty email, and the GitHub Issue opens with a blank requester —
`onFormSubmit` now throws before that happens (see §5), so this instead
fails loudly as a trigger error visible in the Apps Script executions log.
A Reason title/option mismatch has always failed **loudly**, since
`onFormSubmit` throws when the tag lookup for an unrecognized Reason value
comes up empty. If a submission isn't reaching Kit or GitHub, check the
executions log first, then re-check these four titles and three option
strings against the Form.

---

## 5. Apps Script (`google-apps-script/homepage-signup.gs`)

New file, following `booking-request.gs`'s exact structure and shared
helper functions (`fetchRepoJson_`, `kitUpsertAndTag_`, `openGithubIssue_` —
duplicated here for the same reason they're duplicated between the booking
and training scripts: three separate Apps Script projects, no practical
code-sharing without a published Library).

`onFormSubmit(e)` only — no `doGet`, no live check; there's no conflict
concept for a signup.

1. Read Name, Email, Tier, Interest from `e.namedValues`.
2. `kitUpsertAndTag_` with a tier-specific tag: `list-subscriber` /
   `member-precommit` / `founder-interest`.
3. Open a GitHub Issue (`type:signup` label, plus the tier as a second
   label — `tier:list` / `tier:member` / `tier:founder`) summarizing the
   submission. No conflict/capacity section (nothing to check against) —
   the body is just requester details plus a reminder of the follow-up
   action needed (arrange payment for Member/Founder; nothing further for
   List).
4. **No embedded `request-data` block, no `approved` label, no
   `approve_request.py` involvement.** This issue is pure notification —
   there is nothing to write into the repo, so the label-triggered
   approval pipeline (§9 of the booking/training spec) does not apply
   here. The admin closes the issue by hand once they've followed up.

---

## 6. Kit automation email copy (content only — configured by hand in Kit)

Three drafts, one per tag, for the user to review/edit and paste into
Kit's own automation email editor (not something this repo or any script
touches):

**List** (`list-subscriber`):
> "Thanks for signing up to hear about Paton Hall. We're building a
> members-run industrial hub in downtown Hamilton, and you'll be the first
> to know as we get closer to opening. If you ever want to do more than
> watch — join as a Member, or help us launch as a Founder — just reply to
> this email."

**Member** (`member-precommit`):
> "Thank you for stepping up as a founding Member of Paton Hall.
> Pre-committing to a first month before we've even opened our doors is
> exactly the kind of vote of confidence that gets a project like this off
> the ground — we don't take it lightly. We'll be in touch shortly to
> arrange your first month's payment. Welcome to the Hall."

**Founder** (`founder-interest`):
> "A $1000 Founding Membership is a serious act of belief in what we're
> building, and it means a great deal to us personally. You're not just
> joining Paton Hall — you're one of the people making it possible in the
> first place. We'll follow up directly to arrange payment and talk
> through what founding membership includes. Thank you for backing us this
> early."

---

## 7. What gets removed

The current `.signup` section's form (`action="https://app.kit.com/forms/9788991/subscriptions"`,
direct native POST to Kit) is replaced — the new form submits to the new
Google Form instead, same background-fetch-plus-no-JS-fallback technique as
`book-space.html`/`training-signup.html`. Kit form `9788991` itself is not
deleted (it's Kit's own object, out of this repo's control) but this site
no longer submits to it directly; Kit updates now happen exclusively via
the Apps Script API calls (§5), consistent with the rest of the pipeline.

---

## 8. Out of scope

- Any real payment processing (Stripe or otherwise) — explicitly deferred;
  every tier is intent-capture only.
- A member roster/database in this repo — Kit + the Sheet + GitHub Issues
  are the complete system; nothing is written to `assets/data/`.
- Editing an existing submission, or any admin UI beyond the GitHub Issue
  itself.
- Changing `babbworks/patonhall`'s existing Kit setup (the `KIT_API_KEY`/
  `KIT_API_SECRET` GitHub secrets and `counts.yml` there) — unrelated, not
  touched by this work.
