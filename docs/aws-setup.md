# Wiring NoGhost to AWS

Two services, nothing to provision, one IAM role and two environment
variables — neither of them a secret. About twenty minutes, most of it in
the IAM console.

| Service | What it does | Without it |
| --- | --- | --- |
| **Rekognition** | Runs a Face Liveness video check on funnel step 3, compares the frame it returns to the first profile photo at filing | Every applicant records `liveness_passed = NULL` — "no check ran" — and a person reviews them, which is where they were going anyway |
| **Amazon Location Places v2** | Turns a typed postcode into a coordinate on funnel step 5 | The field says so, and the "Use my location" button still works |

Neither one breaks the app. Both make it stop doing work by hand.

---

## Before you follow this

Three things were checked against current AWS documentation, and each one
changed the code. They are why this guide is shorter than it would have
been a week ago.

**There is no `AWS_PLACE_INDEX` any more.** The geocoder used
`SearchPlaceIndexForText`, which is the **v1** Places API — AWS files its
reference under `/location/previous/`, says it "is no longer current and
may be deprecated in the future", and recommends `Geocode` instead. v1
also required standing up a *place index* resource first. v2 has no
resource at all. Migrated in `f65e77e`.

**`IntendedUse` has to be `Storage`.** It defaults to `SingleUse`, which
means "put this on a map and throw it away". NoGhost writes the
coordinate to `profiles.lat/lng` and keeps it, and AWS's reference is
explicit that storing a response without this flag breaks the terms of
service. It bills at roughly 8× the single-use rate — the right trade
against geocoding the same person on every screen that needs to know
where they are.

**`AWS_REGION` is preset by Vercel.** A function in `sfo1` arrives with
`AWS_REGION=us-west-1` whether or not you set it, and `us-west-1` carries
*neither* service. So forgetting this variable looks exactly like setting
it, and the symptom is a confusing endpoint error rather than "AWS isn't
configured". `apps/web/src/lib/aws.ts` now refuses a region that cannot
serve us and says why.

---

## 1. Pick a region

Use **`us-east-1`** unless you have a reason not to.

Rekognition **Face Liveness is in five regions only** — far fewer than the
rest of AWS, and since it's now the identity check rather than an extra,
it sets the constraint:

```
us-east-1   us-west-2   eu-west-1   ap-northeast-1   ap-south-1
```

Amazon Location Places covers all five, so the intersection is just that
list. Anywhere else — including `us-east-2`, which is fine for everything
else — reaches the liveness call and finds no endpoint.
`apps/web/src/lib/aws.ts` refuses those up front rather than letting them
fail mid-funnel.

Note what is missing: `us-west-1`, which is what Vercel hands you by
default from `sfo1`.

**This is not the region picker in the AWS console.** Every step below
happens in IAM, which is a global service — so the selector in the
top-right will read **Global** the whole way through, and that is correct
rather than a problem to fix. You never need to switch it. `AWS_REGION`
is a string you type into an environment variable, and it chooses which
API endpoint gets called. The only other place the region appears is
typed into the policy ARN in step 2.

## 2. Create the policy

IAM → **Policies** → **Create policy** → **JSON** tab. Paste this,
replacing the region in the ARN if you did not pick `us-east-1`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadFacesForVerification",
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateFaceLivenessSession",
        "rekognition:StartFaceLivenessSession",
        "rekognition:GetFaceLivenessSessionResults",
        "rekognition:CompareFaces"
      ],
      "Resource": "*"
    },
    {
      "Sid": "GeocodeTypedPlaces",
      "Effect": "Allow",
      "Action": [
        "geo-places:Geocode",
        "geo-places:ReverseGeocode"
      ],
      "Resource": "arn:aws:geo-places:us-east-1::provider/default"
    }
  ]
}
```

Name it **`noghost-app`**.

Two details worth knowing rather than wondering about:

- The Rekognition actions take `Resource: "*"` because they have no
  resource type — there is nothing to scope them to.
- The geo-places ARN has **two colons** before `provider`. That is
  correct: the account-id segment is empty. If it gives you trouble,
  `"Resource": "*"` works and is barely less specific, since `default` is
  the only provider.

This policy grants three read actions and nothing else. It cannot create,
delete, or spend beyond those calls.

## 3. Trust Vercel, and make a role

OIDC is already switched on for `noghost-web` (team issuer mode) — I
checked, so there is nothing to toggle on the Vercel side.

Your concrete values, which the docs write as placeholders:

| | |
| --- | --- |
| Team slug | `kevin-bandisons-projects` |
| Provider URL | `https://oidc.vercel.com/kevin-bandisons-projects` |
| Audience | `https://vercel.com/kevin-bandisons-projects` |
| Subject (production) | `owner:kevin-bandisons-projects:project:noghost-web:environment:production` |

### 3a. Add the identity provider

IAM → **Identity providers** → **Add provider** → **OpenID Connect**.

- Provider URL: `https://oidc.vercel.com/kevin-bandisons-projects`
- Audience: `https://vercel.com/kevin-bandisons-projects`

### 3b. Create the role

A role is two things, and the wizard only gets one of them right. **Who
may assume it** is the trust policy; **what it may do** is the
permissions. You attach the permissions on the way through, then come
back and fix the trust policy.

IAM → **Roles** → **Create role** → **Web identity**, choosing the
provider you just made and the audience alongside it. On the permissions
screen, tick `noghost-app` — the policy from step 2. Name the role
`noghost-app` too, and create it.

Now open it: **Trust relationships** → **Edit trust policy**. The wizard
writes one that checks only the *audience*, which every project on the
team shares — so as created, any of the other nine could assume this
role. Replace it with this, putting your twelve-digit AWS account number
in place of `YOUR_ACCOUNT_ID`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/oidc.vercel.com/kevin-bandisons-projects"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/kevin-bandisons-projects:aud": "https://vercel.com/kevin-bandisons-projects"
        },
        "StringLike": {
          "oidc.vercel.com/kevin-bandisons-projects:sub": [
            "owner:kevin-bandisons-projects:project:noghost-web:environment:production",
            "owner:kevin-bandisons-projects:project:noghost-web:environment:preview",
            "owner:kevin-bandisons-projects:project:noghost-web:environment:development"
          ]
        }
      }
    }
  ]
}
```

Three subjects, named one at a time rather than with a wildcard. Only
`noghost-web` calls AWS — `noghost-admin` has no reason to, and nine
other projects share this team. `development` is in the list so the same
role works from your laptop; drop that line if you would rather local
development had no AWS at all.

Save it, then copy the role ARN from the top of the page. It looks like
`arn:aws:iam::123456789012:role/noghost-app`.

### 3c. If your issuer mode says Global

Everything above is for **Team** mode, which is what `noghost-web` is set
to. Vercel's other option is **Global**, and it changes the issuer — so
the provider URL and the condition keys move, while the audience and
subject stay exactly as they are.

| | Global mode |
| --- | --- |
| Provider URL | `https://oidc.vercel.com` |
| Principal | `arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/oidc.vercel.com` |
| Condition keys | `oidc.vercel.com:aud` and `oidc.vercel.com:sub` |
| Audience | unchanged — `https://vercel.com/kevin-bandisons-projects` |
| Subject | unchanged |

In other words: drop `/kevin-bandisons-projects` from the issuer wherever
it appears, and leave the two values it isn't part of alone. The setting
is per project — Project → Settings → Security → *Secure backend access
with OIDC federation*.

**Renaming the team or project breaks this.** The slug and project name
live inside the `sub` and `aud` claims, so a rename silently stops the
role being assumable. If you ever rename, add a second statement for the
new name before switching.

## 4. Put two variables in Vercel

```bash
vercel env add AWS_REGION production
vercel env add AWS_ROLE_ARN production
```

Repeat for `preview` if you want previews to have it. Or Project →
Settings → Environment Variables.

That is the whole secret story: **there isn't one.** `AWS_ROLE_ARN` is
not sensitive — it names a role that only Vercel-signed tokens for this
project can assume.

`AWS_REGION` is the one people skip, on the reasonable assumption AWS
defaults it sensibly. Vercel does default it — to its own function's
region — and Vercel's own docs warn it "can change depending on which
region your function runs in". **Set it explicitly.**

Both are in `turbo.json`'s `globalEnv`. They were not before; Turbo
strips variables it does not declare, and a stripped variable is
indistinguishable from an unset one.

## 5. Get a token locally

The role works on Vercel with no help. Locally there is no invocation to
carry a token, so pull one:

```bash
vercel link          # if this repo isn't linked yet
vercel env pull .env.local --yes
```

Then add to the root `.env.local`:

```bash
AWS_REGION=us-east-1
AWS_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/noghost-app
```

`us-east-1` is a recommendation, not a requirement — any of the five in
step 1 works, and nothing needs to already exist there. Neither
service has resources that could be in the wrong region; the region only
decides which endpoint gets called. Use the same one here as in the
policy ARN and on Vercel.

Two things to watch here, both of which have bitten this repo before:

- **Pull to the repo root.** There is one `.env.local` and it lives at
  the top. `vercel link` has previously recreated `apps/web/.env.local`,
  which nothing reads.
- **Check which team you linked.** It has linked to the wrong team's
  `noghost-web` before. It should be `kevin-bandisons-projects`.

`VERCEL_OIDC_TOKEN` expires. The one you pull is a *development* token
and lasts 12 hours — the ones Vercel mints for preview and production
last two, and builds get one. When `aws:check` says the token is
unreadable, pull again.

## 6. Check it

```bash
pnpm aws:check
```

This makes three real calls — a fraction of a cent — rather than checking
that three variables are non-empty. A key with the wrong permissions, a
region that carries neither service, and a typo in the provider ARN all
look identical to a presence check.

```
  ✓ AWS_REGION carries both services  us-east-1
  ✓ assuming a role over OIDC  noghost-app — nothing persistent stored

Rekognition
  ✓ DetectFaces is allowed  0 faces in a 1×1 test image
  ✓ CompareFaces is allowed
      refused the faceless 1×1 test image — which means the call itself got through

Amazon Location Places
  ✓ Geocode is allowed, with IntendedUse: Storage
      30308 → Atlanta, GA (lat 33.771, lng -84.382 — rounded, as stored)

AWS is wired up.
```

When something is wrong it names the variable rather than the symptom —
an unknown access key, a bad secret, a refused action and a dead endpoint
all produce the same unhelpful stack trace otherwise.

**If you dropped the `development` subject** from the trust policy in
step 3, this will not pass on your laptop — the token `vercel env pull`
gives you is a development token, so STS refuses it with
`IDPRejectedClaim`. That is the policy working. Verify on a deployment
instead, or add the line back.

Then, for the real thing end to end: `pnpm dev`, walk `/apply/start` to
step 3 and do the pose sequence with an actual face, then check the row.

---

## What it costs

| | Rate | Free tier |
| --- | --- | --- |
| `DetectFaces`, `CompareFaces` | $0.001 per image | 1,000 images/month for 12 months |
| `Geocode` (Stored bucket) | ~$4 per 1,000 requests | The published free tier covers the *Core* bucket; assume Stored is billed from the first request |

An applicant costs **4 Rekognition images** — three pose frames plus one
comparison — so about **$0.004** each, and one geocode only if they type
a postcode instead of tapping the location button.

Season One caps at 300 members. Even at a thousand applicants that is
about $4 of Rekognition and a few dollars of geocoding. Check the current
numbers on the [Rekognition](https://aws.amazon.com/rekognition/pricing/)
and [Location](https://aws.amazon.com/location/pricing/) pricing pages
before trusting the second row — AWS describes the Stored bucket's rate
in the developer guide rather than the pricing table.

Set a **billing alarm** anyway. Not because these numbers are frightening
but because a loop that retries a failing call is how a fraction of a
cent becomes a bill.

## If you'd rather use an access key

The role above is better and not much harder, but the key path still
works and `lib/aws.ts` still supports it — `AWS_ROLE_ARN` simply wins
when both are set, which is what makes switching safe in either
direction.

IAM → **Users** → **Create user** → name it `noghost-app`, leave console
access unchecked, attach the `noghost-app` policy from step 2. Then
**Security credentials** → **Create access key** → **Application running
outside AWS**. Copy both values; the secret is shown exactly once.

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

`pnpm aws:check` will run green and then tell you this credential never
expires and works from anywhere — which is true, and is the reason to
move to the role when you get a moment.

**Going from key to role:** add `AWS_ROLE_ARN`, run `aws:check` — it will
say the key is being ignored — and once that is green, delete the key in
IAM and drop both variables. There is no moment in between where the app
cannot authenticate.
