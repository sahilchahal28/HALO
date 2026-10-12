# AWS Credentials Rotation Guide

> **CRITICAL**: The AWS credentials in `.env` have been committed to git history. They must be rotated immediately.

## Immediate Actions Required

### 1. Rotate Access Keys in AWS Console (Do This First)

```bash
# 1. Log into AWS Console → IAM → Users → [your-user] → Security credentials
# 2. Create new access key (Access key ID + Secret access key)
# 3. **Immediately** update your deployment platform secrets:
#    - Railway: Variables tab → AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#    - Vercel: Settings → Environment Variables
#    - GitHub: Settings → Secrets and variables → Actions
# 4. Delete the OLD access key from AWS Console
```

### 2. Remove from Git History

```bash
# Option A: BFG Repo-Cleaner (fast, recommended)
# Download bfg.jar from https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --replace-text <(echo "AWS_ACCESS_KEY_ID=***") --replace-text <(echo "AWS_SECRET_ACCESS_KEY=***") .
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# Option B: git-filter-repo (more thorough)
pip install git-filter-repo
git filter-repo --replace-text <(echo "AWS_ACCESS_KEY_ID=***" && echo "AWS_SECRET_ACCESS_KEY=***")
git push --force-with-lease origin main
```

### 3. Verify No Secrets in Current Codebase

```bash
# Check for any remaining secrets
git grep -i "AKIA\|aws_secret\|aws_access" -- "*.js" "*.json" "*.env*" "*.mjs" | grep -v ".gitignore" | grep -v "example" | grep -v "template"
```

---

## Least-Privilege IAM Policy

Create this policy and attach to your HALO deployment user/role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HaloMedicalRecordsReadWrite",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:HeadObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::halo-medical-records-s3-bucket/*"
    },
    {
      "Sid": "HaloBucketLevelOps",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads",
        "s3:GetBucketLocation",
        "s3:GetBucketCORS",
        "s3:GetBucketLifecycleConfiguration",
        "s3:GetBucketVersioning"
      ],
      "Resource": "arn:aws:s3:::halo-medical-records-s3-bucket"
    }
  ]
}
```

**Note**: This policy does NOT allow:
- `s3:DeleteBucket`
- `s3:PutBucketPolicy` / `s3:DeleteBucketPolicy`
- `s3:PutBucketCORS` / `s3:DeleteBucketCORS` (run setup script separately)
- `s3:PutLifecycleConfiguration` / `s3:DeleteLifecycleConfiguration` (run setup script separately)
- `s3:PutBucketVersioning` (run setup script separately)

---

## Deployment Platform Configuration

### Railway
```bash
# In Railway dashboard → Variables tab:
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=halo-medical-records-s3-bucket
AWS_ACCESS_KEY_ID=<new-access-key>
AWS_SECRET_ACCESS_KEY=<new-secret-key>
```

### Vercel (Frontend)
```bash
# Only needs backend URL, not S3 credentials
# Backend handles all S3 operations
```

### Local Development
```bash
# .env.local (gitignored)
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=halo-medical-records-s3-bucket
AWS_ACCESS_KEY_ID=<new-access-key>
AWS_SECRET_ACCESS_KEY=<new-secret-key>
```

---

## Bucket Setup (Run After Credential Rotation)

```bash
# Install dependencies if needed
npm install

# Run the bucket setup script (applies CORS, lifecycle, versioning)
npm run s3:setup
```

This script configures:
- **CORS**: Allows uploads from `localhost:5173`, `localhost:5174`, `*.vercel.app`
- **Lifecycle**: Aborts incomplete multipart uploads after 1 day
- **Versioning**: Enabled for audit trail on medical records

---

## Verification Checklist

After rotation and setup:

- [ ] Old access key deleted from AWS IAM
- [ ] New credentials set in Railway/Vercel/GitHub
- [ ] `.env` added to `.gitignore` (already done)
- [ ] `npm run s3:setup` succeeds
- [ ] `GET /api/dashboard/s3-health` returns `{"healthy": true, ...}`
- [ ] Direct upload (`POST /api/documents/upload`) works from frontend
- [ ] Presigned download URLs work
- [ ] Retention worker runs without S3 errors

---

## Monitoring & Alerts

### CloudWatch Alarms to Create

| Alarm | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| S3 5xx Errors | `5xxErrors` | > 0 for 5 min | PagerDuty/Slack |
| S3 Throttling | `ThrottledRequests` | > 10/min | Scale/notify |
| Bucket Size | `BucketSizeBytes` | > 50 GB | Review retention |

### Application Logs to Monitor

```bash
# Successful operations
[S3] PUT success { key, size, durationMs }
[S3] multipart PUT success { key, size, durationMs }
[S3] presigned PUT/GET generated { key, expiresIn }

# Failures (alert on these)
[S3] PUT failed { key, error }
[S3] DELETE failed { key, error }
[Retention Worker] Document Auto-Purge Permanent Failure { requiresManualIntervention: true }
```

---

## Emergency Rollback

If new credentials fail:

1. Keep old key active in AWS until new one verified (don't delete immediately)
2. If issues: revert platform secrets to old key
3. Debug using `npm run s3:setup` output and `/api/dashboard/s3-health`
4. Once stable, delete old key

---

## File Storage Structure

```
halo-medical-records-s3-bucket/
└── records/
    └── {patientId}/
        └── {timestamp}-{uuid}.{ext}
```

Example: `records/HALO-PAT-001/1704067200000-a1b2c3d4.pdf`

- **Key pattern**: `records/{patientId}/{timestamp}-{uuid}.{ext}`
- **Opaque tokens**: UUID prevents enumeration
- **Patient-scoped**: Easy to delete all patient data (GDPR/privacy)
- **Content-Type preserved**: Proper MIME for browser rendering