# Wiring NoGhost to AWS

Two services, no resources to create, one IAM user, three environment
variables. Fifteen minutes.

| Service | What it does | Without it |
| --- | --- | --- |
| **Rekognition** | Reads the pose frames on funnel step 3, compares the live face to the first profile photo at filing | Every applicant records `liveness_passed = NULL` — "no check ran" — and a person reviews them, which is where they were going anyway |
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

It has to be a region carrying *both* services. There are fifteen:

```
ap-northeast-1  ap-south-1     ap-southeast-1  ap-southeast-2  ap-southeast-5
ca-central-1    eu-central-1   eu-south-2      eu-west-1       eu-west-2
sa-east-1       us-east-1      us-east-2       us-gov-west-1   us-west-2
```

Note what is missing: `us-west-1`, which is what Vercel hands you by
default from `sfo1`.

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
        "rekognition:DetectFaces",
        "rekognition:CompareFaces"
      ],
      "Resource": "*"
    },
    {
      "Sid": "GeocodeTypedPlaces",
      "Effect": "Allow",
      "Action": "geo-places:Geocode",
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

## 3. Create the user and the key

IAM → **Users** → **Create user**.

1. Name it **`noghost-app`**. Leave "Provide user access to the AWS
   Management Console" **unchecked** — this identity is for the app, and
   a machine identity that can also log in is a machine identity someone
   can phish.
2. Permissions → **Attach policies directly** → tick `noghost-app`.
3. Create the user, then open it → **Security credentials** →
   **Create access key**.
4. Use case: **Application running outside AWS**. Acknowledge the
   warning — it is the real recommendation, and see *Later* at the bottom.
5. **Copy both values now.** The secret is shown exactly once. If you
   lose it you delete the key and make another; there is no recovery.

## 4. Put them in `.env.local`

One file, at the repo root. There is no per-app env file.

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

All three or none. A partial set is treated as unconfigured and logged
loudly, because a key with no region fails at call time in a way that
reads like an outage.

## 5. Put them in Vercel

```bash
vercel env add AWS_REGION production
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_SECRET_ACCESS_KEY production
```

Or Project → Settings → Environment Variables.

`AWS_REGION` is the one people skip, on the reasonable assumption that
AWS defaults it sensibly. Vercel does default it — to its own function's
region, which is wrong for us. **Set it explicitly.**

All three are already in `turbo.json`'s `globalEnv`. They were not
before; Turbo strips variables it does not declare, and a stripped
variable is indistinguishable from an unset one.

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
  ✓ credentials present  AKIAIOSF… / secret 40 chars

Rekognition
  ✓ DetectFaces is allowed  0 faces in a 1×1 test image
  ✓ CompareFaces is allowed  service rejected the faceless test image, which is the point

Amazon Location Places
  ✓ Geocode is allowed, with IntendedUse: Storage  30308 → Atlanta, GA (lng -84.38, lat 33.77)

AWS is wired up.
```

When something is wrong it names the variable rather than the symptom —
an unknown access key, a bad secret, a refused action and a dead endpoint
all produce the same unhelpful stack trace otherwise.

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

## Later: drop the long-lived key

An access key in an environment variable is a credential that never
expires and works from anywhere. AWS's own documentation opens by telling
you to use temporary credentials instead, and Vercel supports OIDC
federation to an AWS IAM role — the function exchanges a short-lived
token for a role, and there is no secret to leak.

It needs a role, a trust policy, and a credential-provider change in
`lib/aws.ts`. Worth doing before there is real member data behind it; not
worth blocking on now, given this key can only read faces and look up
postcodes.
