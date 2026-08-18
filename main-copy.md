# Paton Hall — Site Copy

Running record of the site's actual words — pitch, form copy, email
templates — kept separate from the technical specs in
`docs/superpowers/specs/` so copy can be reviewed and edited on its own.
Anything here that's "live" on the site or configured in Kit should match
what's actually deployed; if they drift, this file is the one to update
last (the deployed version wins, then reconcile this doc).

## Homepage pitch

Replaces the current opening paragraph — sits directly above the signup
form, per `docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md`.

> Paton Hall is a members-run industrial hub opening in downtown Hamilton —
> electronics, machinery, robotics, and hands-on training. We're raising
> our founding membership before we open: join the list, or help launch us
> as a Member or Founder.

## Homepage signup form

**Tier button labels:**
- Join the list → "Put me on the list"
- Become a Member → "Pre-commit — $50 first month"
- Become a Founder → "Become a Founder — $1000"

**Fixed fine print under the button (all tiers):**

> Submitting reserves your spot — we'll follow up by email to arrange
> payment. Nothing is charged now.

**"What brings you here" options** (List tier only):
Build nights / Learning days and talks / Certified electronics training /
Just keeping an eye on it.

## Kit automation emails (paste into Kit by hand — not deployed from this repo)

**List** (tag `list-subscriber`):

> Thanks for signing up to hear about Paton Hall. We're building a
> members-run industrial hub in downtown Hamilton, and you'll be the first
> to know as we get closer to opening. If you ever want to do more than
> watch — join as a Member, or help us launch as a Founder — just reply to
> this email.

**Member** (tag `member-precommit`):

> Thank you for stepping up as a founding Member of Paton Hall.
> Pre-committing to a first month before we've even opened our doors is
> exactly the kind of vote of confidence that gets a project like this off
> the ground — we don't take it lightly. We'll be in touch shortly to
> arrange your first month's payment. Welcome to the Hall.

**Founder** (tag `founder-interest`):

> A $1000 Founding Membership is a serious act of belief in what we're
> building, and it means a great deal to us personally. You're not just
> joining Paton Hall — you're one of the people making it possible in the
> first place. We'll follow up directly to arrange payment and talk
> through what founding membership includes. Thank you for backing us this
> early.
