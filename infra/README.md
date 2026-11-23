# Isostride on AWS

Terraform for the two static sites of the monorepo, each served from a private S3 bucket through CloudFront over HTTPS:

| Name | What | From |
| --- | --- | --- |
| `app.<domain>` | the app | `apps/app` (`npm run build:app`, `.next-build`) |
| `<domain>`, `www.<domain>` → `<domain>` | the site | `apps/site` (`npm run build:site`, `.next-build`) |

One certificate (ACM, us-east-1) covers `<domain>` and `*.<domain>`. A CloudFront Function reads `/run` as `run.html`, as the static export lays the pages out. The deploy workflow (`.github/workflows/deploy.yml`) signs in with GitHub OIDC: no AWS keys are kept in GitHub.

## Once

1. **Domain.** Register it in Route 53 (console → Route 53 → Registered domains → Register domains). Turn on privacy protection and auto-renew. Registration also creates the hosted zone that Terraform uses. A `.com` costs about 15 USD a year.
2. **AWS CLI.** Sign in with a profile for this account, e.g. `aws configure sso --profile isostride`, then `aws sts get-caller-identity --profile isostride`.
3. **State bucket.**
   ```sh
   cd infra/bootstrap
   terraform init
   terraform apply -var aws_profile=isostride     # prints state_bucket
   ```
4. **The sites.**
   ```sh
   cd infra
   cp example.tfvars terraform.tfvars               # domain_name, aws_profile
   terraform init -backend-config="bucket=<state_bucket>" -backend-config="profile=isostride"
   terraform plan
   terraform apply                                  # the certificate and CloudFront take 5–20 minutes
   ```
   If the account already has GitHub's OIDC provider (`token.actions.githubusercontent.com`), set `create_github_oidc_provider = false`.
5. **GitHub.** In the repository → Settings → Secrets and variables → Actions → Variables, add the values of `terraform output`:
   `AWS_DEPLOY_ROLE_ARN`, `APP_BUCKET`, `APP_DISTRIBUTION_ID`, `SITE_BUCKET`, `SITE_DISTRIBUTION_ID` (and `AWS_REGION` if not `eu-central-1`).

From then on every push to `master` checks, builds and deploys both. The workflow can also be started by hand (Actions → Deploy → Run workflow).

## Costs

The hosted zone costs 0.50 USD a month and the domain its yearly fee. The certificate is free. For a site this size, S3 and CloudFront cost cents a month: CloudFront's free tier covers 1 TB of transfer and 10 million requests a month.
